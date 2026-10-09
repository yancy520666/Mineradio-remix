'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawnSync } = require('node:child_process');
const { desktopIconProbeScript } = require('../desktop/desktop-icon-shape-runtime');
const {
  nativeIconLayerGuardCSharpSource,
  nativeIconLayerGuardScript,
  nativeIconLayerNamedPipeScript,
  parseNativeIconLayerLayout,
  startNativeDesktopIconLayer,
} = require('../desktop/desktop-native-icon-layer-runtime');

test('Windows compiles the native guard without installing hooks or touching Explorer', { skip: process.platform !== 'win32' }, () => {
  const script = desktopIconProbeScript({ invoke: false, extraCSharp: nativeIconLayerGuardCSharpSource() });
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], {
    input: script + '\nWrite-Output "GUARD_COMPILED"\n', encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GUARD_COMPILED/);
  assert.equal(result.stderr.trim(), '');
});

function layout(sequence = 0, locked = false, desktopIconsVisible = true) {
  return {
    ok: true,
    watcher: true,
    nativeLayerApplied: true,
    nativeBackgroundKeyApplied: true,
    compositionMode: 'layered-color-key',
    nativeLayerLocked: locked,
    desktopIconsVisible,
    controlSequence: sequence,
    shieldWindowId: '0',
    iconHostWindowId: '8200',
    listViewWindowId: '8300',
    mainWindowId: '424242',
    topLevelHostWindowId: '8100',
    processId: 900,
    physicalPixels: true,
    icons: [{ x: 8, y: 8, width: 86, height: 92 }],
  };
}

test('native wheel routing is session-bound, hit-tested and fails open', () => {
  const script = nativeIconLayerGuardScript({ iconHostWindowId: '8200', listViewWindowId: '8300', mainWindowId: '424242' });
  const callback = script.slice(script.indexOf('private static IntPtr HandleWheel('), script.indexOf('private static void WheelThreadMain('));
  assert.match(callback, /code >= 0 && \(kind == 0x020A \|\| kind == 0x020E\)/);
  assert.match(callback, /\(wheel.flags & 3\) == 0 && !_wheelStopping && !_boundTargetDestroyed/);
  assert.match(callback, /MainWindowIdentityMatches\(\) && IsWindowVisible\(_mainWindow\)/);
  assert.match(callback, /GWL_EXSTYLE\).ToInt64\(\) & 0x20\) == 0/);
  assert.match(callback, /target = WindowFromPoint\(wheel.point\)/);
  assert.match(callback, /target == _mainWindow \|\| IsChild\(_mainWindow, target\)/);
  assert.match(callback, /processId == _mainProcessId/);
  assert.match(callback, /if \(PostMessageW\(target, kind, new IntPtr\(word\), new IntPtr\(point\)\)\) return new IntPtr\(1\)/);
  assert.match(callback, /return CallNextHookEx\(_wheelHook, code, message, data\)/);
  assert.doesNotMatch(callback, /SetFocus|SetForegroundWindow|SendInput|SendMessage|Emit|WriteLine/);
  assert.match(script, /BindExpectedTarget\(\);\s+StartWheelRouter\(\)/);
  const wheelThread = script.slice(script.indexOf('private static void WheelThreadMain('), script.indexOf('[DllImport("user32.dll", SetLastError=true)]\n  private static extern IntPtr SetWinEventHook'));
  assert.match(wheelThread, /new System.Threading.Thread\(WheelThreadMain\)/);
  assert.match(wheelThread, /GetMessage\(out message/);
  assert.doesNotMatch(wheelThread, /ApplyAndEmit|\.Probe\(|SendMessageTimeout/);
  assert.match(wheelThread, /PostThreadMessage\(_wheelThreadId, WM_QUIT/);
  assert.match(script, /finally \{\s+StopWheelRouter\(\)/);
  assert.match(script, /finally \{\s+if \(_wheelHook != IntPtr.Zero\) \{\s+UnhookWindowsHookEx/);
});

test('native layered guard puts the complete main HWND below Explorer icons and restores all snapshots', () => {
  const script = nativeIconLayerGuardScript({
    iconHostWindowId: '8200',
    listViewWindowId: '8300',
    mainWindowId: '424242',
    physicalBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    ownerProcessId: 77,
  });
  assert.match(script, /SnapshotOriginalListViewVisibility\(\)/);
  assert.match(script, /SnapshotOriginalListViewTransparency\(\)/);
  assert.match(script, /SnapshotOriginalListViewBackground\(\)/);
  assert.match(script, /_originalListViewVisible = IsWindowVisible\(_listView\)/);
  assert.match(script, /_originalListViewExStyle = CurrentListViewExStyle\(\)/);
  assert.match(script, /ApplyListViewTransparency\(\)/);
  assert.match(script, /SetWindowLongPtr\(_listView, GWL_EXSTYLE, new IntPtr\(desiredStyle\)\)/);
  assert.match(script, /SetLayeredWindowAttributes\(_listView, DESKTOP_LAYER_COLOR_KEY, 255, LWA_COLORKEY\)/);
  assert.match(script, /_originalListViewBackgroundColor = CurrentListViewBackgroundColor\(\)/);
  assert.match(script, /SendMessageTimeout\(_listView, message, wParam, lParam/);
  assert.match(script, /SMTO_ABORTIFHUNG, 500/);
  assert.match(script, /DESKTOP_ICON_LAYER_BACKGROUND_(?:QUERY|APPLY|RESTORE)_TIMEOUT/);
  assert.match(script, /RestoreCurrentListViewBackground\(\)/);
  assert.match(script, /ShowWindow\(_listView, desiredIconsVisible \? SW_SHOW : SW_HIDE\)/);
  assert.match(script, /RestoreCurrentListViewTransparency\(\)/);
  assert.match(script, /RestoreOriginalListViewVisibility\(\)/);
  assert.match(script, /finally \{[\s\S]*try \{ RestoreCurrentListViewBackground\(\); \}[\s\S]*if \(backgroundRestoreFailure == null\) \{[\s\S]*try \{ RestoreCurrentListViewTransparency\(\); \}[\s\S]*try \{ RestoreOriginalListViewVisibility\(\); \}/);
  assert.match(script, /private static void RestoreCurrentListViewTransparency\(\) \{[\s\S]*if \(!BoundTargetIdentityMatches\(\)\)[\s\S]*SetWindowLongPtr\(_listView/);
  assert.match(script, /private static void RestoreOriginalListViewVisibility\(\) \{[\s\S]*if \(!BoundTargetIdentityMatches\(\)\)[\s\S]*ShowWindow\(_listView/);
  assert.match(script, /SetWindowLongPtr\(_listView, GWL_EXSTYLE, new IntPtr\(_originalListViewExStyle\)\)/);
  assert.match(script, /_originalLayeredColorKey, _originalLayeredAlpha, _originalLayeredFlags/);
  assert.match(script, /BoundTargetIdentityMatches\(\)/);
  assert.match(script, /EVENT_OBJECT_DESTROY/);
  assert.match(script, /GetParent\(listView\) != iconHost/);
  assert.match(script, /topLevelHost == _topLevelHost && iconHost == _iconHost && listView == _listView/);
  assert.match(script, /processId == _explorerProcessId && threadId == _explorerThreadId/);
  assert.match(script, /private static readonly IntPtr HWND_BOTTOM = new IntPtr\(1\)/);
  assert.match(script, /KeepMainAtBottom\(\)/);
  assert.match(script, /SetWindowPos\(_mainWindow, HWND_BOTTOM/);
  assert.match(script, /layered-color-key/);
  assert.match(script, /EmitTerminal\(restored, terminalCode\)/);
  assert.match(script, /OwnerProcessAlive\(\)/);
  assert.doesNotMatch(script,
    /SetWindowRgn|EnableWindow|LVM_SETTEXTBKCOLOR|GetCursorPos|SetCursorPos|SendInput|WM_MOUSEMOVE|Mineradio Desktop Icon Lock Shield|CreateWindowEx/);
});

test('external guard keeps WMI crash recovery but runs PowerShell under headless System32 conhost', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'desktop-native-icon-layer-runtime.js'), 'utf8');
  assert.match(source, /Invoke-CimMethod -ClassName Win32_Process -MethodName Create/);
  assert.match(source, /path\.join\(windowsRoot, 'System32', 'conhost\.exe'\)/);
  assert.match(source, /--headless .* -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass/);
  assert.match(source, /\{ windowsHide: true, stdio: \['ignore', 'pipe', 'pipe'\] \}/);
  assert.match(source, /const updateShields = \(\) => lastLayout \? Promise\.resolve\(lastLayout\) : ready/);
  assert.doesNotMatch(source, /sendControl\('S'/);
});

test('external guard gives both named-pipe connections a five second deadline', () => {
  const script = nativeIconLayerNamedPipeScript({
    iconHostWindowId: '8200',
    listViewWindowId: '8300',
    mainWindowId: '424242',
    physicalBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  assert.equal((script.match(/\.Connect\(5000\)/g) || []).length, 2);
  assert.doesNotMatch(script, /\.Connect\(8000\)/);
});

test('native layered ACK preserves icon geometry, lock compatibility, and visibility', () => {
  const parsed = parseNativeIconLayerLayout(layout(4, true, false));
  assert.equal(parsed.nativeLayerApplied, true);
  assert.equal(parsed.nativeBackgroundKeyApplied, true);
  assert.equal(parsed.compositionMode, 'layered-color-key');
  assert.equal(parsed.nativeLayerLocked, true);
  assert.equal(parsed.desktopIconsVisible, false);
  assert.equal(parsed.controlSequence, 4);
  assert.equal(parsed.shieldWindowId, '0');
  assert.deepEqual(parsed.icons, [{ x: 8, y: 8, width: 86, height: 92 }]);
});

test('native layered ACK rejects an unconfirmed Explorer background key', () => {
  const missing = layout();
  delete missing.nativeBackgroundKeyApplied;
  assert.throws(() => parseNativeIconLayerLayout(missing), /DESKTOP_ICON_LAYER_ACK_INVALID/);
  assert.throws(() => parseNativeIconLayerLayout({ ...layout(), nativeBackgroundKeyApplied: false }),
    /DESKTOP_ICON_LAYER_ACK_INVALID/);
});

test('native layered wrapper exposes explicit icon visibility and terminal diagnostics', async () => {
  let spawnedArgs = null;
  let exitDetails = null;
  let locked = false;
  let desktopIconsVisible = true;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.stdin.on('data', (chunk) => {
    const text = String(chunk);
    const control = text.match(/^([LZVR])\|(\d+)\|([^\r\n]*)/m);
    if (control) {
      const kind = control[1];
      const sequence = Number(control[2]);
      const payload = control[3];
      if (kind === 'L') locked = payload === '1';
      if (kind === 'V') desktopIconsVisible = payload === '1';
      setImmediate(() => child.stdout.write(`${JSON.stringify(layout(sequence, locked, desktopIconsVisible))}\n`));
    }
    if (/^Q$/m.test(text)) setImmediate(() => {
      child.stdout.write(`${JSON.stringify({
        ok: true,
        watcher: true,
        terminal: true,
        restored: true,
        error: 'DESKTOP_ICON_TEST_TERMINAL',
      })}\n`);
      child.emit('exit', 0, null);
    });
  });
  const watcher = startNativeDesktopIconLayer({
    iconHostWindowId: '8200',
    listViewWindowId: '8300',
    mainWindowId: '424242',
    physicalBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    onExit: (details) => { exitDetails = details; },
    spawnImpl: (_exe, args) => {
      spawnedArgs = args;
      return child;
    },
  });
  child.stdout.write(`${JSON.stringify(layout())}\n`);
  assert.equal((await watcher.ready).nativeLayerApplied, true);
  assert.equal((await watcher.updateShields([{ x: 10, y: 20, width: 30, height: 40 }])).controlSequence, 0);
  assert.equal((await watcher.setLocked(true)).controlSequence, 1);
  assert.equal(watcher.getLastLayout().nativeLayerLocked, true);
  assert.equal((await watcher.setIconsVisible(false)).desktopIconsVisible, false);
  assert.equal((await watcher.ensureOrder()).controlSequence, 3);
  assert.equal((await watcher.reveal()).controlSequence, 4, 'native reveal waits for its own acknowledged sequence');
  assert.deepEqual(spawnedArgs.slice(0, 6),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File']);
  const stopped = await watcher.stop();
  assert.equal(stopped.ok, true);
  assert.equal(stopped.restored, true);
  assert.equal(stopped.terminalError, 'DESKTOP_ICON_TEST_TERMINAL');
  assert.equal(exitDetails && exitDetails.terminalError, 'DESKTOP_ICON_TEST_TERMINAL');
});


test('native desktop guard repairs physical bounds and watches Electron child reorders', () => {
  const script = nativeIconLayerGuardScript({ iconHostWindowId: '8200', listViewWindowId: '8300', mainWindowId: '424242', physicalBounds: { x: 2560, y: -163, width: 1600, height: 2560 }, ownerProcessId: 77 });
  assert.match(script, /ScreenToClient\(_iconHost, ref local\)/);
  assert.match(script, /SetThreadDpiAwarenessContext\(new IntPtr\(-4\)\)/);
  assert.match(script, /_mainWindowHook = SetWinEventHook/);
  assert.match(script, /_mainLocationHook = SetWinEventHook/);
  assert.match(script, /EventCallback, _mainProcessId, _mainThreadId/);
  assert.match(script, /UnhookWinEvent\(_mainWindowHook\)/);
  assert.match(script, /UnhookWinEvent\(_mainLocationHook\)/);
  assert.match(script, /DESKTOP_ICON_LAYER_BOUNDS_ACK_FAILED/);
  assert.match(script, /if \(reveal\) flags \|= SWP_SHOWWINDOW/);
  assert.match(script, /if \(!IsWindowVisible\(_mainWindow\)\) throw new InvalidOperationException\("DESKTOP_ICON_LAYER_REVEAL_FAILED"\)/);
});
