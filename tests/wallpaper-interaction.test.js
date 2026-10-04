'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { wallpaperInputCommand } = require('../desktop/wallpaper-engine-input');
const { WallpaperEngineRuntime } = require('../desktop/wallpaper-engine-runtime');
const { WallpaperEngineLibrary } = require('../desktop/wallpaper-engine-library');
const { loadFunctions } = require('./helpers/classic-functions');

test('DWM input validates the exact session and preserves releases under backpressure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-input-'));
  const runtime = new WallpaperEngineRuntime({ nativeTempPath: root });
  const commands = [];
  const stdin = { writableNeedDrain: false, write: value => commands.push(value) };
  runtime.active = { sessionId: 'fixture', dwmSurfaceActive: true, dwmSurfaceReady: true, dwmSurfaceProcess: { stdin } };
  const packet = { sessionId: 'fixture', kind: 'down', xUnit: 1000, yUnit: 2000, buttons: 1, button: 0 };
  try {
    assert.equal(runtime.noteHostPointerActivity(packet), true);
    assert.equal(commands[0], 'P|down|1000|2000|1|0|0\n');
    assert.equal(runtime.noteHostPointerActivity({ ...packet, sessionId: 'old' }), false);
    assert.equal(runtime.noteHostPointerActivity({ ...packet, xUnit: NaN }), false);
    assert.equal(wallpaperInputCommand({ ...packet, buttons: 8 }), '');
    assert.equal(wallpaperInputCommand({ ...packet, kind: 'keyboard' }), '');
    stdin.writableNeedDrain = true;
    assert.equal(runtime.noteHostPointerActivity({ ...packet, kind: 'move' }), false);
    assert.equal(runtime.noteHostPointerActivity({ ...packet, kind: 'up', buttons: 0 }), true);
    runtime.active.stopping = true;
    assert.equal(runtime.noteHostPointerActivity(packet), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('background input leaves player controls alone and sends ordered drag/release/reset', () => {
  const events = new Map(), sent = [];
  const context = vm.createContext({
    document: { addEventListener: (name, fn) => events.set(name, fn) },
    window: { addEventListener: (name, fn) => events.set(name, fn) },
    wallpaperEnginePointerActivityReady: () => true, wallpaperEngineCaptureMode: 'dwm-thumbnail',
    wallpaperEngineDesktopApi: () => ({ reportWallpaperEnginePointerActivity: packet => sent.push(packet) }),
    wallpaperEngineNativeSessionId: 'fixture', wallpaperEnginePointerActivityTimer: 5,
    wallpaperEnginePointerActivityLatestX: 0, wallpaperEnginePointerActivityLatestY: 0,
    rememberWallpaperEnginePointerPosition: () => {}, clearTimeout: () => {},
    flushWallpaperEnginePointerActivity: () => { sent.push({kind:'move'}); context.wallpaperEnginePointerActivityTimer=0; },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/07-fx/03a-wallpaper-engine-interaction.js'), 'utf8'), context);
  context.bindWallpaperEngineInteraction();
  const background = { button: 0, target: { closest: () => null } };
  events.get('pointerdown')({ ...background, target: { closest: () => ({}) } });
  assert.equal(sent.length, 0);
  events.get('pointerdown')(background);
  events.get('pointerup')({ ...background, target: { closest: () => ({}) } });
  assert.deepEqual(sent.map(x => x.kind), ['move','down','up']);
  assert.equal(sent[1].buttons, 1);
  assert.equal(sent[2].buttons, 0);
  events.get('wheel')({ ...background, deltaY: 160 });
  assert.equal(sent.at(-1).delta, -160);
  events.get('pointerdown')(background);
  events.get('blur')();
  assert.equal(sent.at(-1).kind, 'reset');
  assert.equal(context.wallpaperEngineHeldButtons, 0);
  context.document.pointerLockElement = {};
  assert.equal(context.wallpaperEngineBackgroundInputTarget(background), false);
  context.document.pointerLockElement = null;
  context.shelfManager = { canInteract: () => true };
  context.raycasterFromPointerEvent = () => ({});
  context.pointerCardHit = () => ({ card: {} });
  assert.equal(context.wallpaperEngineBackgroundInputTarget(background), false, '3D music cards must keep their clicks');
});

test('optional glass capture failure still activates the rounded native wallpaper', async () => {
  let activated = 0, stopped = 0;
  const session = '111111111111111111111111';
  const context = vm.createContext({
    wallpaperEngineDesktopApi: () => ({ prepareWallpaperEngineGlassCapture: async () => ({ok:false}),
      activateWallpaperEngineDwmSurface: async () => { activated++; return {ok:true,active:true}; } }),
    document: { getElementById: () => ({}), body: { classList: { add: () => {} } } },
    wallpaperEngineLayerToken: 1, wallpaperEngineNativeSessionId: session,
    wallpaperEngineCaptureMode: 'dwm-thumbnail', wallpaperEngineGlassCaptureStream: null,
    wallpaperEngineGlassCaptureToken: 0, wallpaperEngineRuntimeCaptureFps: () => 60,
    wallpaperEngineGlassSamplerIsCurrent: () => true, stopWallpaperEngineGlassCaptureStream: () => stopped++,
    scheduleWallpaperEngineGlassSamplerCapture: () => {}, window: {}, setTimeout: fn => fn(),
  });
  loadFunctions(context, 'public/js/modules/07-fx/03-wallpaper-engine-library.js', ['ensureWallpaperEngineGlassSamplerCapture']);
  assert.equal(await context.ensureWallpaperEngineGlassSamplerCapture(session, 1, 0), false);
  assert.equal(activated, 1);
  assert.equal(stopped, 2);
  context.wallpaperEngineGlassSamplerIsCurrent = () => false;
  await context.ensureWallpaperEngineGlassSamplerCapture(session, 1, 0);
  assert.equal(activated, 1, 'stale capture must not activate a replacement');
});

test('additional media formats are indexed without serving HTML or escaped files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-formats-'));
  const library = new WallpaperEngineLibrary({ userDataPath: path.join(root, 'profile'), autoDiscover: false });
  try {
    for (const ext of ['apng','ogv','ogg','wmv','mpg','mpeg']) {
      const dir = path.join(root, 'projects', ext); fs.mkdirSync(dir, {recursive:true});
      fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({type:ext==='apng'?'image':'video',title:ext,file:'wallpaper.'+ext}));
      fs.writeFileSync(path.join(dir, 'wallpaper.'+ext), 'fixture');
    }
    const result = await library.addManualRoot(path.join(root, 'projects'));
    assert.equal(result.projects.length, 6);
    assert.equal(result.projects.find(x => x.title === 'apng').mediaAnimated, true);
    for (const item of result.projects.filter(x => x.mediaType === 'video')) {
      assert.equal(item.enginePlayable, true);
      assert.equal((await library.getNativeSceneTarget(item.id)).projectType, 'video');
    }
  } finally { library.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});
