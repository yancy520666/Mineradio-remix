'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadFunctions } = require('./helpers/classic-functions');

function setup(platform = 'win32') {
  let now = 1_000_000, id = 0, calls = 0, visible = false, minimized = true;
  const timers = new Map();
  const c = vm.createContext({
    process: { platform }, Date: { now: () => now },
    appMemoryTrimTimer: null, appMemoryTrimInFlight: false, lastAppMemoryTrimAt: 0, lastAppMemoryTrimReason: '',
    memoryAutoState: { appTrimEnabled: true, backgroundTrimEnabled: true },
    mainWindow: { isDestroyed: () => false, isVisible: () => visible, isMinimized: () => minimized },
    setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout(key) { timers.delete(key); },
    collectAppTrimPids: () => [1, 2],
    systemMemory: { getMemorySnapshot: () => ({}), trimAppWorkingSets: async () => { calls++; return { ok: true }; } }
  });
  loadFunctions(c, 'desktop/main.js', ['isMainWindowForegroundVisible', 'cancelAppMemoryTrim', 'automaticAppMemoryTrimSkipReason', 'trimAppMemoryNow', 'scheduleAppMemoryTrim']);
  return { c, timers, calls: () => calls, show() { visible = true; minimized = false; },
    async advance(ms) { now += ms; for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); } await new Promise(setImmediate); } };
}

test('main and multiple renderer requests share cooldown and cancel the pending native trim', async () => {
  const h = setup(); h.c.scheduleAppMemoryTrim('minimize', 1600);
  await h.advance(2000);
  const first = h.c.trimAppMemoryNow('renderer-deep-sleep');
  assert.equal((await h.c.trimAppMemoryNow('deep-background')).reason, 'in-flight');
  await first;
  assert.equal(h.timers.size, 0);
  await h.advance(2000);
  assert.equal((await h.c.trimAppMemoryNow('deep-background')).reason, 'cooldown');
  assert.equal(h.calls(), 1);
  await h.advance(120000); h.c.scheduleAppMemoryTrim('hide', 2200); await h.advance(4000);
  assert.equal(h.calls(), 2);
});

test('queued native callback rechecks each automatic setting, even without cancellation notification', async () => {
  for (const flag of ['appTrimEnabled', 'backgroundTrimEnabled']) {
    const h = setup(); h.c.scheduleAppMemoryTrim('hide'); h.c.memoryAutoState[flag] = false;
    await h.advance(10000); assert.equal(h.calls(), 0);
    assert.equal((await h.c.trimAppMemoryNow('deep-background')).reason, 'disabled');
  }
});

test('quick restore or visible desktop rejects automatic trim; repeated hiding keeps one deadline', async () => {
  const h = setup(); h.c.scheduleAppMemoryTrim('minimize', 1600); const original = [...h.timers.values()][0];
  for (let i = 0; i < 100; i++) h.c.scheduleAppMemoryTrim('hide', 2200);
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0], original);
  h.show(); await h.advance(4000); assert.equal(h.calls(), 0);
  assert.equal((await h.c.trimAppMemoryNow('renderer-deep-sleep')).reason, 'foreground-visible');
});

test('automatic trim does nothing outside Windows; existing manual semantics remain', async () => {
  const h = setup('linux'); h.c.scheduleAppMemoryTrim('hide'); assert.equal(h.timers.size, 0);
  assert.equal((await h.c.trimAppMemoryNow('deep-background')).reason, 'unsupported');
  h.c.memoryAutoState.appTrimEnabled = false;
  assert.equal((await h.c.trimAppMemoryNow('manual')).ok, true);
  h.show(); assert.equal((await h.c.trimAppMemoryNow('manual')).reason, 'foreground-visible');
  assert.equal((await h.c.trimAppMemoryNow('manual-force')).ok, true);
});

test('native show/restore and disabling auto explicitly cancel the pending timer', () => {
  const h = setup(); h.c.scheduleAppMemoryTrim('hide'); h.c.cancelAppMemoryTrim();
  assert.equal(h.timers.size, 0); assert.equal(h.c.appMemoryTrimTimer, null);
  const src = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  for (const event of ['show', 'restore']) assert(src.includes(`win.on('${event}', () => {\n    cancelAppMemoryTrim();`));
  assert.match(src, /memoryAutoState = normalizeMemoryAutoState\(payload\);\s+if \(memoryAutoState.appTrimEnabled === false \|\| memoryAutoState.backgroundTrimEnabled === false\) cancelAppMemoryTrim\(\);/);
});

function uiSetup() {
  let deep = true, disposed = 0, trims = 0, creates = 0;
  const resource = () => ({ dispose() { disposed++; } });
  const c = vm.createContext({
    mainUiRenderCache: { target: resource(), quad: { geometry: resource(), material: resource() } }, mainUiRenderStats: { bytes: 66355200 },
    isDeepBackgroundMode: () => deep, trimRuntimeCaches() { trims++; }, requestBackgroundAppMemoryTrim() {}, isBackgroundReleaseMode: () => false,
    scene: { children: [{ visible: true, userData: { mineradioUiLayer: true } }] },
    performance: { now: () => 1000 }, mainUiMotionActive: () => true, isMainSceneCoveredBySplash: () => false,
    renderPerfState: { targetFps: 30, displayHz: 60 }, THREE: { Vector2: function () {} },
    camera: {}, mainUiFrameRoot: () => true,
    renderer: { capabilities: { isWebGL2: true }, getDrawingBufferSize: () => ({ x: 10, y: 10 }),
      getRenderTarget: () => null, setRenderTarget() {}, render() {}, autoClear: true },
    createMainUiRenderCache(w, h) { creates++; return { target: { width: w, height: h }, scene: {}, camera: {}, valid: false }; }
  });
  loadFunctions(c, 'public/js/modules/00-state/08-desktop-render-power.js', ['trimVisualCachesForBackground']);
  loadFunctions(c, 'public/js/modules/01-scene/05-ui-render-cache.js', ['releaseMainUiRenderCache', 'drawMainUiFrame']);
  return { c, disposed: () => disposed, trims: () => trims, creates: () => creates, visible() { deep = false; } };
}

test('background timer releases UI target even with no RAF; repeated cleanup is idempotent and wake rebuilds on demand', () => {
  const h = uiSetup(); h.c.trimVisualCachesForBackground(); h.c.trimVisualCachesForBackground();
  assert.equal(h.disposed(), 3); assert.equal(h.c.mainUiRenderCache, null); assert.equal(h.c.mainUiRenderStats.bytes, 0);
  h.visible(); assert.equal(h.creates(), 0); h.c.drawMainUiFrame(true); assert.equal(h.creates(), 1);
  h.c.drawMainUiFrame(true); assert.equal(h.creates(), 1);
});

test('quick foreground restore and visible desktop keep the UI resource and skip deep cache cleanup', () => {
  const h = uiSetup(), original = h.c.mainUiRenderCache;
  h.visible(); h.c.trimVisualCachesForBackground();
  assert.equal(h.c.mainUiRenderCache, original); assert.equal(h.disposed(), 0); assert.equal(h.trims(), 0);
});

test('real deep predicate protects keep mode and native-visible desktop despite stale document.hidden', () => {
  const h = uiSetup();
  h.c.window = { desktopWindow: {} }; h.c.document = { hidden: true };
  h.c.fx = { performanceBackground: 'auto' };
  h.c.desktopRuntimeState = { desktop: true, visible: true, minimized: false, embedded: true };
  h.c.normalizePerformanceBackgroundMode = mode => mode;
  loadFunctions(h.c, 'public/js/modules/00-state/08-desktop-render-power.js', ['currentPerformanceBackgroundMode', 'isLiveBackgroundKeepMode', 'isDeepBackgroundMode']);
  h.c.trimVisualCachesForBackground(); assert.equal(h.disposed(), 0, 'visible desktop survives stale Chromium hidden');
  h.c.desktopRuntimeState.visible = false; h.c.fx.performanceBackground = 'keep';
  h.c.trimVisualCachesForBackground(); assert.equal(h.disposed(), 0, 'keep rendering retains UI resources');
  h.c.fx.performanceBackground = 'auto';
  h.c.trimVisualCachesForBackground(); assert.equal(h.disposed(), 3);
});
