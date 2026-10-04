'use strict';

function wallpaperInputCommand(value) {
  if (!value || !['move', 'down', 'up', 'wheel', 'reset'].includes(value.kind)) return '';
  const { xUnit = 0, yUnit = 0, buttons = 0, button = 0, delta = 0 } = value;
  if (![xUnit, yUnit, buttons, button, delta].every(Number.isInteger)
    || xUnit < 0 || xUnit > 65535 || yUnit < 0 || yUnit > 65535
    || buttons < 0 || buttons > 7 || button < 0 || button > 2 || Math.abs(delta) > 1200) return '';
  return `P|${value.kind}|${xUnit}|${yUnit}|${buttons}|${button}|${delta}\n`;
}

// Included in the existing DWM host, so input shares its validated session and
// native lifetime instead of starting a second helper or moving the real cursor.
function nativeWallpaperInputSource() {
  return String.raw`
public sealed class MineradioWeInput {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  delegate bool WindowCallback(IntPtr window, IntPtr unused);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, WindowCallback callback, IntPtr unused);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassNameW(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref POINT point);
  [DllImport("user32.dll")] static extern bool PostMessageW(IntPtr window, uint message, IntPtr word, IntPtr point);
  [DllImport("user32.dll")] static extern int GetWindowLongW(IntPtr window, int index);
  [DllImport("user32.dll")] static extern int SetWindowLongW(IntPtr window, int index, int value);
  const int WS_EX_NOACTIVATE = 0x08000000;
  readonly IntPtr source;
  readonly uint sourceProcess;
  IntPtr target;
  uint targetProcess;
  string targetClass;
  int heldButtons;
  int lastX, lastY;
  readonly string browserExecutable;
  readonly bool addedNoActivate;

  public MineradioWeInput(IntPtr window) {
    source = window;
    GetWindowThreadProcessId(source, out sourceProcess);
    using (var process = Process.GetProcessById((int)sourceProcess)) {
      browserExecutable = Path.Combine(Path.GetDirectoryName(process.MainModule.FileName), "bin", "webwallpaper64.exe");
    }
    // CEF may focus its root on a forwarded click. Keep music controls active.
    int style = GetWindowLongW(source, -20);
    addedNoActivate = (style & WS_EX_NOACTIVATE) == 0;
    SetWindowLongW(source, -20, style | WS_EX_NOACTIVATE);
  }

  static string ClassName(IntPtr window) {
    var text = new StringBuilder(256);
    GetClassNameW(window, text, text.Capacity);
    return text.ToString();
  }

  bool TargetValid() {
    uint process;
    return target != IntPtr.Zero && GetAncestor(target, 2) == source
      && GetWindowThreadProcessId(target, out process) != 0 && process == targetProcess
      && String.Equals(ClassName(target), targetClass, StringComparison.Ordinal);
  }

  bool FindTarget() {
    if (TargetValid()) return true;
    heldButtons = 0;
    target = IntPtr.Zero;
    IntPtr scene = IntPtr.Zero, browser = IntPtr.Zero;
    int sceneCount = 0, browserCount = 0;
    EnumChildWindows(source, (window, unused) => {
      uint process;
      GetWindowThreadProcessId(window, out process);
      string name = ClassName(window);
      if (GetAncestor(window, 2) != source) return true;
      if (process == sourceProcess && name == "WPEDesktopDX11Window") { scene = window; sceneCount++; }
      if (name == "Chrome_RenderWidgetHostHWND") {
        try {
          using (var child = Process.GetProcessById((int)process)) {
            if (String.Equals(child.MainModule.FileName, browserExecutable, StringComparison.OrdinalIgnoreCase)) {
              browser = window; browserCount++;
            }
          }
        } catch { }
      }
      return true;
    }, IntPtr.Zero);
    if (browserCount == 1) target = browser;
    else if (browserCount == 0 && sceneCount == 1) target = scene;
    if (target == IntPtr.Zero) return false;
    GetWindowThreadProcessId(target, out targetProcess);
    targetClass = ClassName(target);
    return true;
  }

  static int MouseFlags(int buttons) {
    return ((buttons & 1) != 0 ? 1 : 0) | ((buttons & 2) != 0 ? 2 : 0) | ((buttons & 4) != 0 ? 16 : 0);
  }

  void Post(uint message, int word, int x, int y) {
    PostMessageW(target, message, new IntPtr(word), new IntPtr(unchecked((y << 16) | (x & 65535))));
  }

  public void Reset() {
    if (TargetValid()) {
      if ((heldButtons & 1) != 0) Post(0x0202, 0, lastX, lastY);
      if ((heldButtons & 2) != 0) Post(0x0205, 0, lastX, lastY);
      if ((heldButtons & 4) != 0) Post(0x0208, 0, lastX, lastY);
    }
    heldButtons = 0;
  }

  public void Close() {
    Reset();
    uint process;
    if (addedNoActivate && GetWindowThreadProcessId(source, out process) != 0 && process == sourceProcess) {
      SetWindowLongW(source, -20, GetWindowLongW(source, -20) & ~WS_EX_NOACTIVATE);
    }
  }

  public void Forward(string kind, double xRatio, double yRatio, int buttons, int button, int delta) {
    if (kind == "reset") { Reset(); return; }
    if (!FindTarget()) return;
    RECT rect;
    if (!GetClientRect(target, out rect)) return;
    lastX = (int)Math.Round(Math.Max(0, Math.Min(1, xRatio)) * Math.Max(0, rect.Right - rect.Left - 1));
    lastY = (int)Math.Round(Math.Max(0, Math.Min(1, yRatio)) * Math.Max(0, rect.Bottom - rect.Top - 1));
    int word = MouseFlags(buttons);
    if (kind == "move") {
      if (heldButtons != 0 && buttons == 0) Reset();
      Post(0x0200, word, lastX, lastY);
    }
    else if (kind == "down" || kind == "up") {
      int bit = button == 0 ? 1 : button == 1 ? 4 : 2;
      heldButtons = kind == "down" ? heldButtons | bit : heldButtons & ~bit;
      Post((uint)((button == 0 ? 0x0201 : button == 1 ? 0x0207 : 0x0204) + (kind == "up" ? 1 : 0)), word, lastX, lastY);
    } else if (kind == "wheel") {
      POINT point = new POINT { X = lastX, Y = lastY };
      if (ClientToScreen(target, ref point)) {
        PostMessageW(target, 0x020A, new IntPtr(word | (delta << 16)),
          new IntPtr(unchecked((point.Y << 16) | (point.X & 65535))));
      }
    }
  }

}
`;
}

module.exports = { wallpaperInputCommand, nativeWallpaperInputSource };
