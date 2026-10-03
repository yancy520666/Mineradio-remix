'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { nativeDwmThumbnailSurfaceScript } = require('../desktop/wallpaper-engine-runtime');

test('native wallpaper follows host movement without waiting for its recovery timer', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-follow-'));
  try {
    const csharp = nativeDwmThumbnailSurfaceScript().match(/\$source = @'\n([\s\S]*?)\n'@/)[1];
    const probe = `
public class FollowProbeWindow : System.Windows.Forms.Form {
  public int ResizeMessages;
  public int PositionMessages;
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override void WndProc(ref System.Windows.Forms.Message message) {
    if (message.Msg == 0x0005) ResizeMessages++;
    if (message.Msg == 0x0046) PositionMessages++;
    base.WndProc(ref message);
  }
}
public static class FollowProbe {
  [System.Runtime.InteropServices.DllImport("user32.dll")]
  static extern bool SetWindowPos(System.IntPtr hwnd, System.IntPtr after, int x, int y, int w, int h, uint flags);
  [System.Runtime.InteropServices.DllImport("user32.dll")]
  static extern bool IsWindowVisible(System.IntPtr hwnd);
  static void Pump(int milliseconds) {
    var clock = System.Diagnostics.Stopwatch.StartNew();
    do { System.Windows.Forms.Application.DoEvents(); System.Threading.Thread.Sleep(1); }
    while (clock.ElapsedMilliseconds < milliseconds);
  }
  static void Check(bool value, string message) { if (!value) throw new System.Exception(message); }
  public static void Run() {
    var flags = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance;
    var type = typeof(MineradioWeDwmSurfaceHost);
    using (var host = new FollowProbeWindow())
    using (var source = new FollowProbeWindow()) {
      host.FormBorderStyle = source.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
      host.ShowInTaskbar = source.ShowInTaskbar = false;
      host.StartPosition = source.StartPosition = System.Windows.Forms.FormStartPosition.Manual;
      host.Bounds = source.Bounds = new System.Drawing.Rectangle(-14000, -14000, 640, 360);
      source.Text = "Mineradio follow fixture";
      host.Show(); source.Show();
      using (var surface = (System.Windows.Forms.Form)System.Activator.CreateInstance(type, flags, null,
          new object[] { host.Handle, source.Handle, source.Text, 34, false, 255, 0, 0, 1080000 }, null)) {
        type.GetMethod("FollowHost", flags).Invoke(surface, null);
        type.GetMethod("ActivateThumbnail", flags).Invoke(surface, null);
        var timer = (System.Windows.Forms.Timer)type.GetField("followTimer", flags).GetValue(surface);
        var start = type.GetMethod("StartHostFollow", flags);
        Check(start != null, "Event-driven following missing");
        start.Invoke(surface, null);
        Check((System.IntPtr)type.GetField("hostLocationHook", flags).GetValue(surface) != System.IntPtr.Zero, "Location hook missing");
        // Disable the recovery timer: movement must arrive through the actual Win32 hook.
        timer.Stop();
        System.GC.Collect(); System.GC.WaitForPendingFinalizers();
        Pump(30);
        int sourceResizeMessages = source.ResizeMessages;
        int matched = 0;
        var clock = System.Diagnostics.Stopwatch.StartNew();
        long totalLatency = 0;
        for (int frame = 0; frame < 60; frame++) {
          var target = new System.Drawing.Rectangle(-14000 + frame * 7, -14000 + frame * 3, 640, 360);
          long began = clock.ElapsedMilliseconds;
          SetWindowPos(host.Handle, System.IntPtr.Zero, target.Left, target.Top, target.Width, target.Height, 0x0014);
          do {
            Pump(1);
            if (surface.Bounds == target && source.Bounds == target) { matched++; break; }
          } while (clock.ElapsedMilliseconds - began < 20);
          totalLatency += clock.ElapsedMilliseconds - began;
        }
        System.Console.WriteLine("FOLLOW_MEASURE matched=" + matched + "/60 averageMs=" + (totalLatency / 60.0).ToString("F2", System.Globalization.CultureInfo.InvariantCulture));
        Check(matched >= 57, "Wallpaper lags behind host movement");
        Check(source.ResizeMessages == sourceResizeMessages, "Dragging unnecessarily resized the source renderer");
        SetWindowPos(host.Handle, System.IntPtr.Zero, -13500, -13600, 800, 450, 0x0014);
        Pump(40);
        Check(surface.Bounds == host.Bounds && source.Bounds == host.Bounds, "Resize not followed");
        var propertiesField = type.GetField("lastThumbnailProperties", flags);
        object resizedProperties = propertiesField.GetValue(surface);
        type.GetField("visualScale", flags).SetValue(surface, 1500000);
        type.GetMethod("FollowHost", flags).Invoke(surface, null);
        Check(!propertiesField.GetValue(surface).Equals(resizedProperties), "Thumbnail scale cache did not update");
        Pump(30);
        int idlePositionMessages = source.PositionMessages;
        for (int tick = 0; tick < 5; tick++) type.GetMethod("FollowHost", flags).Invoke(surface, null);
        Pump(30);
        Check(source.PositionMessages == idlePositionMessages, "Stationary source received redundant positioning writes");
        // Recovery must still correct an external source move when no host event occurs.
        timer.Start();
        SetWindowPos(source.Handle, System.IntPtr.Zero, -14500, -14500, 200, 100, 0x0014);
        Pump(180);
        Check(source.Bounds == host.Bounds, "Source reset not recovered");
        source.Hide(); Pump(180);
        Check(IsWindowVisible(source.Handle), "Source visibility not recovered");
        surface.Close();
        Check((System.IntPtr)type.GetField("hostLocationHook", flags).GetValue(surface) == System.IntPtr.Zero, "Location hook leaked after close");
        timer.Stop();
      }
    }
  }
}`;
    const script = path.join(root, 'follow.ps1');
    fs.writeFileSync(script, `$ErrorActionPreference='Stop'\n$source = @'\n${csharp}\n${probe}\n'@\nAdd-Type -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing') -TypeDefinition $source\n[FollowProbe]::Run()\n`);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /FOLLOW_MEASURE matched=\d+\/60 averageMs=[\d.]+/);
    console.log(result.stdout.trim());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
