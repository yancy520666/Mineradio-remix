'use strict';

// Run with Electron on Windows. Exercises the real Explorer child HWND,
// including mixed-DPI displays; always restores Explorer before exiting.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow, screen } = require('electron');
const { FullDesktopModeRuntime } = require('../desktop/full-desktop-mode-runtime');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-desktop-geometry-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.on('window-all-closed', () => {});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function nativeSnapshot(status, disturb = false) {
  assert.match(status.nativeWindowId, /^\d+$/);
  assert.match(status.desktopListWindowId, /^\d+$/);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DesktopGeometryQA {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
"@
[DesktopGeometryQA]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$main = [IntPtr]::new([long]${status.nativeWindowId})
$list = [IntPtr]::new([long]${status.desktopListWindowId})
${disturb ? 'if (-not [DesktopGeometryQA]::SetWindowPos($main, [IntPtr]::Zero, 23, 31, 640, 480, 0x4010)) { throw "QA_POSITION_FAILED" }' : ''}
$rect = New-Object DesktopGeometryQA+RECT
$client = New-Object DesktopGeometryQA+RECT
if (-not [DesktopGeometryQA]::GetWindowRect($main, [ref]$rect)) { throw 'QA_RECT_FAILED' }
if (-not [DesktopGeometryQA]::GetClientRect($main, [ref]$client)) { throw 'QA_CLIENT_FAILED' }
$above = $false
$previous = [DesktopGeometryQA]::GetWindow($main, 3)
while ($previous -ne [IntPtr]::Zero) {
  if ($previous -eq $list) { $above = $true; break }
  $previous = [DesktopGeometryQA]::GetWindow($previous, 3)
}
[pscustomobject]@{
  bounds = @{ x = $rect.Left; y = $rect.Top; width = $rect.Right - $rect.Left; height = $rect.Bottom - $rect.Top }
  client = @{ width = $client.Right; height = $client.Bottom }
  iconsAbove = $above
} | ConvertTo-Json -Compress
`;
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
  }).trim());
}

async function verifyDesktop(runtime, win, label) {
  const status = runtime.getStatus(label);
  assert.equal(status.enabled, true);
  assert.equal(status.iconShapeActive, true);
  const native = nativeSnapshot(status);
  assert.deepEqual(native.bounds, status.physicalBounds, label + ': physical screen bounds');
  assert.equal(native.client.width, status.physicalBounds.width, label + ': client width');
  assert.equal(native.client.height, status.physicalBounds.height, label + ': client height');
  assert.equal(native.iconsAbove, true, label + ': Explorer icons above Mineradio');
  const viewport = await win.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})');
  assert.ok(Math.abs(viewport.width - status.bounds.width) <= 1, label + ': renderer width');
  assert.ok(Math.abs(viewport.height - status.bounds.height) <= 1, label + ': renderer height');
  return native;
}

app.whenReady().then(async () => {
  let win;
  let runtime;
  try {
    assert.equal(process.platform, 'win32');
    for (const display of screen.getAllDisplays()) {
      win = new BrowserWindow({
        x: display.workArea.x + 30, y: display.workArea.y + 30,
        width: 800, height: 600, frame: false, transparent: true, show: false,
        webPreferences: { backgroundThrottling: false },
      });
      await win.loadURL('data:text/html,<body style="margin:0;background:%23243047;color:white">Mineradio desktop geometry test</body>');
      win.setBounds({ x: display.workArea.x + 30, y: display.workArea.y + 30, width: 800, height: 600 });
      await sleep(250);
      const before = win.getBounds();
      runtime = new FullDesktopModeRuntime({ screen, nativeTempPath: profile });
      const enabled = await runtime.enable(win, { interactive: true });
      assert.equal(enabled.ok, true, enabled.error);
      assert.equal(runtime.getStatus().displayId, String(display.id));
      await sleep(250);
      const initial = await verifyDesktop(runtime, win, 'enabled');
      nativeSnapshot(runtime.getStatus(), true);
      await sleep(400);
      await verifyDesktop(runtime, win, 'recovered after native move/resize/raise');
      win.showInactive();
      await sleep(400);
      await verifyDesktop(runtime, win, 'recovered after Electron showInactive');
      assert.equal((await runtime.disable('geometry-test-cleanup')).ok, true);
      const restored = win.getBounds();
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(before[key] - restored[key]) <= 1, 'restored ordinary window ' + key);
      }
      console.log(JSON.stringify({ displayId: display.id, scaleFactor: display.scaleFactor, ...initial, recovered: true, restored: true }));
      await runtime.dispose(); runtime = null;
      win.destroy(); win = null;
    }
    console.log('Full desktop native geometry and icon order passed');
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    if (runtime) {
      try { assert.equal((await runtime.disable('geometry-test-finally')).ok, true); await runtime.dispose(); }
      catch (error) { console.error(error.stack); process.exitCode = 1; }
    }
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
