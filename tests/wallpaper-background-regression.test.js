'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { readSavedWallpaperProperties } = require('../desktop/wallpaper-engine-properties');
const { WallpaperEngineRuntime, nativeDwmThumbnailSurfaceScript } = require('../desktop/wallpaper-engine-runtime');
const { loadFunctions } = require('./helpers/classic-functions');

test('switching wallpapers isolates framing and restores each saved project across restarts', () => {
  const storage = new Map();
  const ids = ['111111111111111111111111', '222222222222222222222222'];
  function renderer() {
    const context = vm.createContext({
      WALLPAPER_ENGINE_SELECTION_STORE_KEY: 'selection', WALLPAPER_ENGINE_VISUAL_PROFILES_STORE_KEY: 'visual-profiles',
      localStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) },
      wallpaperEngineProjectById: id => ({id, title:id, playable:true, mediaType:'image'}),
      cancelWallpaperEngineHostRecovery: () => {}, applyWallpaperEngineBackground: () => {},
      closeWallpaperEngineLibrary: () => {}, showToast: () => {},
    });
    loadFunctions(context, 'public/js/modules/07-fx/03-wallpaper-engine-library.js', [
      'normalizeWallpaperEngineSelection', 'readWallpaperEngineSelection', 'normalizeWallpaperEngineVisualProfile',
      'readWallpaperEngineVisualProfiles', 'rememberWallpaperEngineVisualProfile', 'saveWallpaperEngineSelection', 'activateWallpaperEngineItem',
    ]);
    context.wallpaperEngineSelection = context.readWallpaperEngineSelection();
    context.wallpaperEngineVisualProfiles = context.readWallpaperEngineVisualProfiles();
    return context;
  }
  const context = renderer();
  context.wallpaperEngineHostBoundsPreparing = true;
  context.activateWallpaperEngineItem(ids[0]);
  assert.equal(context.wallpaperEngineHostBoundsPreparing,false,'a new selection releases the previous window freeze');
  Object.assign(context.wallpaperEngineSelection, { visualPositionX:0.3, visualPositionY:-0.2, visualScale:1.5, visualOpacity:0.7 });
  context.saveWallpaperEngineSelection();
  context.activateWallpaperEngineItem(ids[1]);
  assert.equal(context.wallpaperEngineSelection.visualScale, 1.08);
  assert.equal(context.wallpaperEngineSelection.visualPositionX, 0);
  assert.equal(context.wallpaperEngineSelection.visualPositionY, 0);
  assert.equal(context.wallpaperEngineSelection.visualOpacity, 0.7, 'background opacity remains a global preference');
  Object.assign(context.wallpaperEngineSelection, { visualScale:1.2, visualPositionY:0.1 });
  context.saveWallpaperEngineSelection();
  context.activateWallpaperEngineItem(ids[0]);
  assert.equal(context.wallpaperEngineSelection.visualScale, 1.5);
  assert.equal(context.wallpaperEngineSelection.visualPositionX, 0.3);
  const restarted = renderer();
  restarted.activateWallpaperEngineItem(ids[1]);
  assert.equal(restarted.wallpaperEngineSelection.visualScale, 1.2);
  assert.equal(restarted.wallpaperEngineSelection.visualPositionX, 0);
  assert.equal(restarted.wallpaperEngineSelection.visualPositionY, 0.1);
  restarted.activateWallpaperEngineItem(ids[1]);
  assert.equal(restarted.wallpaperEngineSelection.visualScale, 1.2, 'reselecting the same wallpaper keeps its framing');

  storage.delete('visual-profiles');
  const legacy = renderer();
  legacy.activateWallpaperEngineItem(ids[0]);
  legacy.activateWallpaperEngineItem(ids[1]);
  assert.equal(legacy.wallpaperEngineSelection.visualScale, 1.2, 'legacy current settings are migrated before a switch');
  for (let index=0;index<110;index++) legacy.activateWallpaperEngineItem(index.toString(16).padStart(24,'0'));
  assert.equal(Object.keys(JSON.parse(storage.get('visual-profiles'))).length, 100);
});

test('saved WE properties are staged, refreshed and applied only to the app window', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-properties-'));
  const runtime = new WallpaperEngineRuntime({ nativeTempPath: root, useDesktopShellBroker: false });
  let session;
  try {
    const executable = path.join(root, 'wallpaper64.exe');
    const projectFile = path.join(root, 'workshop', 'project.json');
    const scenePackage = path.join(path.dirname(projectFile), 'scene.pkg');
    fs.mkdirSync(path.dirname(projectFile));
    fs.writeFileSync(scenePackage, 'package-fixture');
    const project = { type: 'scene', file: 'scene.pkg', general: { properties: {
      caption: { type: 'textinput', value: 'Default' },
      tint: { type: 'color', value: '1 1 1' },
      enabled: { type: 'bool', value: true },
      size: { type: 'slider', value: 1 },
      music: { type: 'slider', value: 1 },
    } } };
    fs.writeFileSync(projectFile, JSON.stringify(project));
    const configFile = path.join(root, 'config.json');
    const caption = '你好 "Mineradio"\n第二行 🎵';
    const config = { [os.userInfo().username]: {
      general: { wallpaperconfig: { selectedwallpapers: { Monitor1: { file: scenePackage } } } },
      wproperties: { [scenePackage.replace(/\\/g, '/')]: {
        Monitor0: { caption: 'Other monitor' },
        Monitor1: { caption: { value: caption }, tint: '0.2 0.4 1', enabled: false, size: 2.5, music: 1, unknown: 'ignore' },
        'Mineradio Wallpaper old': { caption: 'Stale app copy' },
      } },
    } };
    fs.writeFileSync(configFile, JSON.stringify(config));
    const snapshot = await readSavedWallpaperProperties(executable, projectFile, scenePackage);
    assert.equal(snapshot.values.caption, caption);
    assert.equal(snapshot.values.tint, '0.2 0.4 1');
    assert.equal(snapshot.values.enabled, false);
    assert.equal(snapshot.values.size, 2.5);
    assert.equal(snapshot.values.unknown, undefined);
    session = { executable, originalProjectFile: projectFile, originalScenePackage: scenePackage,
      sessionId: 'properties-fixture', locationTitle: 'Mineradio Wallpaper properties-fixture',
      savedUserProperties: snapshot, muteProperties: { volume: 0, music: 0 }, muteReassertTimers: new Set() };
    runtime.active = session;
    runtime._prepareMutedScenePackage = async () => scenePackage;
    const staged = await runtime._prepareSilentLaunchFile(session, projectFile, scenePackage);
    const stagedProject = JSON.parse(fs.readFileSync(staged, 'utf8'));
    assert.equal(stagedProject.general.properties.caption.value, caption);
    assert.equal(stagedProject.general.properties.music.value, 0);
    assert.equal(JSON.parse(fs.readFileSync(projectFile, 'utf8')).general.properties.caption.value, 'Default');
    const commands = [];
    runtime._runTransientControl = async (_, args) => commands.push(args);
    await runtime._applySessionMute(session);
    assert.equal(commands.length, 1);
    const payload = JSON.parse(commands[0][3].slice(5, -5));
    assert.equal(payload.caption, caption);
    assert.equal(payload.music, 0);
    assert.equal(payload.volume, 0);
    assert.deepEqual(commands[0].slice(-2), ['-location', session.locationTitle]);
    await runtime._applySessionMute(session, true);
    assert.equal(commands.length, 1, 'unchanged saved settings must not send another command');
    config[os.userInfo().username].wproperties[scenePackage.replace(/\\/g, '/')].Monitor1.caption.value = '改过的文字';
    fs.writeFileSync(configFile, JSON.stringify(config));
    await runtime._applySessionMute(session, true);
    assert.equal(commands.length, 2);
    assert.equal(JSON.parse(commands[1][3].slice(5, -5)).caption, '改过的文字');
    fs.writeFileSync(configFile, '{partial save');
    await runtime._applySessionMute(session, true);
    assert.equal(commands.length, 2, 'partial config saves retain the last good settings');
    assert.equal(JSON.parse(fs.readFileSync(projectFile, 'utf8')).general.properties.music.value, 1);
    runtime._scheduleSessionMuteReassertions(session);
    assert.ok(session.userPropertiesTimer);
    runtime._clearSessionMuteReassertions(session);
    assert.equal(session.userPropertiesTimer, null);
    assert.equal(session.muteReassertTimers.size, 0);
  } finally {
    if (session) runtime._clearSessionMuteReassertions(session);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy nested property values cannot import another Windows account or app location', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-account-'));
  try {
    const scene = path.join(root, 'scene.pkg');
    const project = path.join(root, 'project.json');
    fs.writeFileSync(project, JSON.stringify({ general: { properties: { text: { value: 'default' } } } }));
    const locations = { Monitor0: { userproperties: { text: { value: 'saved' } } },
      'Mineradio Wallpaper old': { text: 'wrong' } };
    const config = { otherAccount: { wproperties: { [scene]: locations } } };
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
    const read = () => readSavedWallpaperProperties(path.join(root, 'wallpaper64.exe'), project, scene);
    assert.deepEqual((await read()).values, {});
    config[os.userInfo().username.toUpperCase()] = { wproperties: { [scene]: locations } };
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
    assert.equal((await read()).values.text, 'saved');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('choosing cover background tears down the WE layer without entering desktop mode', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/07-fx/02-accent-background-controls.js'), 'utf8');
  const start = source.indexOf('function setCustomBackgroundAlbumCover(');
  const end = source.indexOf('\nfunction ', start + 1);
  const calls = [];
  const context = vm.createContext({
    fx: { wallpaperMode: false, backgroundMedia: { type: 'video' }, backgroundImage: 'old' },
    deactivateWallpaperEngineBackground: quiet => calls.push(['stopWE', quiet]),
    retryCustomBackgroundSurfaceSelection() {},
    updateCustomBackgroundControls: () => calls.push(['applyCover']),
    saveLyricLayout: () => {}, showToast: () => {},
  });
  vm.runInContext(source.slice(start, end), context);
  context.setCustomBackgroundAlbumCover(true, true);
  assert.deepEqual(calls, [['stopWE', true], ['applyCover']]);
  assert.equal(context.fx.wallpaperMode, false);
  assert.equal(context.fx.backgroundAlbumCover, true);
  assert.equal(context.fx.backgroundMedia, null);
  context.setCustomBackgroundAlbumCover(false, true);
  assert.equal(calls.filter(call => call[0] === 'stopWE').length, 1);
});

test('native corners recover after WE clears its region and a maximized start restores', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-corners-'));
  try {
    const helper = nativeDwmThumbnailSurfaceScript();
    const csharp = helper.match(/\$source = @'\n([\s\S]*?)\n'@/)[1];
    const probe = `
public static class CornerProbe {
  [System.Runtime.InteropServices.DllImport("user32.dll")]
  static extern int SetWindowRgn(System.IntPtr hwnd, System.IntPtr region, bool redraw);
  [System.Runtime.InteropServices.DllImport("user32.dll")]
  static extern int GetWindowRgn(System.IntPtr hwnd, System.IntPtr region);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")]
  static extern System.IntPtr CreateRectRgn(int left, int top, int right, int bottom);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")]
  static extern bool PtInRegion(System.IntPtr region, int x, int y);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")]
  static extern bool DeleteObject(System.IntPtr region);
  static void Check(bool value, string message) { if (!value) throw new System.Exception(message); }
  public static void Run() {
    System.Type type = typeof(MineradioWeDwmSurfaceHost);
    var flags = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static;
    var apply = type.GetMethod("ApplyCornerRegion", flags);
    using (var host = new System.Windows.Forms.Form()) {
      host.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
      host.Bounds = new System.Drawing.Rectangle(80, 80, 640, 360);
      System.IntPtr hwnd = host.Handle;
      System.IntPtr region = CreateRectRgn(0, 0, 1, 1);
      try {
        for (int cycle = 0; cycle < 2; cycle++) {
          SetWindowRgn(hwnd, System.IntPtr.Zero, true);
          apply.Invoke(null, new object[] { hwnd, 640, 360, 34 });
          Check(GetWindowRgn(hwnd, region) > 0, "Rounded region missing");
          Check(!PtInRegion(region, 0, 0) && PtInRegion(region, 320, 180), "Corners not clipped");
        }
        apply.Invoke(null, new object[] { hwnd, 640, 360, 0 });
        Check(GetWindowRgn(hwnd, region) == 0, "Fullscreen region not cleared");
      } finally { DeleteObject(region); }
      var instanceFlags = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance;
      using (var surface = (System.Windows.Forms.Form)System.Activator.CreateInstance(type, instanceFlags,
          null, new object[] { hwnd, hwnd, "fixture", 0, false, 255, 0, 0, 1080000 }, null)) {
        var rectType = type.GetNestedType("RECT", System.Reflection.BindingFlags.NonPublic);
        var resolve = type.GetMethod("ResolveCornerRadius", instanceFlags);
        System.Func<System.Drawing.Rectangle, object> rect = bounds => {
          object value = System.Activator.CreateInstance(rectType);
          rectType.GetField("Left").SetValue(value, bounds.Left);
          rectType.GetField("Top").SetValue(value, bounds.Top);
          rectType.GetField("Right").SetValue(value, bounds.Right);
          rectType.GetField("Bottom").SetValue(value, bounds.Bottom);
          return value;
        };
        Check((int)resolve.Invoke(surface, new object[] { rect(host.Bounds) }) > 0, "Zero startup radius persisted");
        var screen = System.Windows.Forms.Screen.FromHandle(hwnd);
        Check((int)resolve.Invoke(surface, new object[] { rect(screen.Bounds) }) == 0, "Fullscreen must be square");
        Check((int)resolve.Invoke(surface, new object[] { rect(host.Bounds) }) > 0, "Restore did not recover corners");
      }
    }
  }
}`;
    const script = path.join(root, 'corners.ps1');
    fs.writeFileSync(script, `$ErrorActionPreference='Stop'\n$source = @'\n${csharp}\n${probe}\n'@\nAdd-Type -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing') -TypeDefinition $source\n[CornerProbe]::Run()\nWrite-Output 'NATIVE_CORNERS_OK'\n`);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /NATIVE_CORNERS_OK/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
