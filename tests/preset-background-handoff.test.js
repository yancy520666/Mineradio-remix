'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../public/vendor/three.r128.min.js');
const policy = require('../public/sonic-performance-policy');
const read = file => fs.readFileSync(file, 'utf8');
const settle = () => new Promise(setImmediate);
function clock() {
  let id = 0; const jobs = new Map();
  return { set: fn => { jobs.set(++id, fn); return id; }, clear: n => jobs.delete(n),
    tick: () => { for (const [n, fn] of [...jobs]) if (jobs.delete(n)) fn(); }, size: () => jobs.size };
}
function selection() {
  const timer = clock(), preparations = [], effects = [];
  const engine = { prepare() {
    let resolve, reject;
    const job = { promise: new Promise((a, b) => { resolve = a; reject = b; }),
      resolve: () => resolve(), reject: () => reject(Error('load failed')), cancelled: 0,
      cancel() { this.cancelled++; } };
    preparations.push(job); return job;
  }, onPresetChange: (a, b) => effects.push(['engine', a, b]) };
  const context = { window: { MineradioSonicTopography: engine, MineradioSonicWorkshop: engine },
    MineradioSonicTopography: engine, MineradioSonicWorkshop: engine,
    fx: { preset: 0 }, presetMeta: Array.from({ length: 13 }, (_, i) => ({ name: String(i) })),
    scene: {}, uniforms: { uPreset: { value: 0 } }, SKULL_PRESET_INDEX: 6,
    document: { querySelectorAll: () => [] }, updateVisualEffectScopeControls() {},
    showToast: value => effects.push(['toast', value]),
    applyPresetOrbitBaseline: p => effects.push(['camera', p]),
    saveLyricLayout: () => effects.push(['save']),
    setTimeout: timer.set, clearTimeout: timer.clear, Promise };
  vm.createContext(context); vm.runInContext(read('public/js/modules/07-fx/04-preset-grid-uniforms.js'), context);
  return { context, timer, preparations, effects, choose: p => context.setPreset(p, { skipTransition: true }) };
}
test('A-B-C and A-B-A only commit latest ready selection and preserve save/camera timing', async () => {
  const s = selection();
  const b = s.choose(7), c = s.choose(8);
  assert.equal(s.context.fx.preset, 0); assert(s.effects.every(x => x[0] === 'toast'));
  assert.equal(s.preparations[0].cancelled, 1);
  s.preparations[0].resolve(); await settle(); assert.equal(s.context.fx.preset, 0);
  s.preparations[1].resolve(); assert.equal(await c, true); assert.equal(await b, false);
  assert.equal(s.context.fx.preset, 8);
  assert.equal(s.effects.filter(x => x[0] === 'camera').length, 1);
  assert.equal(s.effects.filter(x => x[0] === 'save').length, 1);
  const back = s.choose(7); const same = s.choose(8);
  assert.equal(await back, false); assert.equal(await same, true);
  s.preparations[2].resolve(); await settle(); assert.equal(s.context.fx.preset, 8);
});
test('duplicate preparation is coalesced; timeout and failure keep committed visual', async () => {
  const s = selection(), pending = s.choose(8);
  assert.equal(s.choose(8), pending); assert.equal(s.preparations.length, 1);
  s.timer.tick(); assert.equal(await pending, false); assert.equal(s.context.fx.preset, 0);
  s.preparations[0].resolve(); await settle(); assert.equal(s.context.fx.preset, 0);
  const retry = s.choose(7); s.preparations[1].reject();
  assert.equal(await retry, false); assert.equal(s.context.fx.preset, 0);
  assert.equal(s.timer.size(), 0); assert.equal(s.effects.filter(x => x[0] === 'save').length, 0);
});
function workshop() {
  const timer = clock(), listeners = {}, elements = [];
  function element(tag) {
    const el = { tag, children: [], style: {}, setAttribute() {},
      appendChild(child) { child.parentNode = this; this.children.push(child); },
      insertBefore(child) { this.appendChild(child); },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
      querySelector(name) { return this.children.find(child => child.tag === name) || null; } };
    if (tag === 'iframe') el.contentWindow = { postMessage() {} };
    elements.push(el); return el;
  }
  const body = element('body'); body.classList = { toggle() {} };
  const document = { body, createElement: element, getElementById: id => body.children.find(el => el.id === id) || null };
  const window = { fx: { preset: 0 }, playing: false, location: { origin: 'http://localhost' },
    performance: { now: () => 1000 }, addEventListener: (name, cb) => listeners[name] = cb };
  let source = read('public/sonic-workshop-preset.js').replace('global.MineradioSonicWorkshop = {', 'global.auditState = state; global.MineradioSonicWorkshop = {');
  vm.runInNewContext(source, { window, document, performance: window.performance, console,
    setTimeout: timer.set, clearTimeout: timer.clear });
  const api = window.MineradioSonicWorkshop, state = window.auditState;
  return { window, api, state, body, elements, signal(type, overrides = {}) {
    listeners.message(Object.assign({ source: state.iframe.contentWindow, origin: 'http://localhost',
      data: { type, generation: state.generation } }, overrides));
  } };
}
test('Workshop requires owned property-ready AND actual first-frame signal; pending stays invisible', async () => {
  const w = workshop(); let ready = false;
  w.api.prepare().promise.then(() => ready = true);
  const generation = w.state.generation;
  const oldFrame = w.state.iframe.contentWindow;
  for (let i = 0; i < 60; i++) w.api.update(1 / 60, { fx: w.window.fx });
  assert.equal(w.state.opacity, 0); assert.equal(w.body.children.length, 1);
  w.state.iframe.onload(); await settle(); assert.equal(ready, false);
  w.signal('mineradio-sonic-workshop-ready', { origin: 'https://other.invalid' });
  w.signal('mineradio-sonic-workshop-ready', { source: {} });
  w.signal('mineradio-sonic-workshop-ready', { data: { type: 'mineradio-sonic-workshop-ready', generation: generation - 1 } });
  assert.equal(w.state.propertiesReady, false);
  w.signal('mineradio-sonic-workshop-ready'); await settle(); assert.equal(ready, false);
  w.signal('mineradio-sonic-workshop-first-frame'); await settle(); assert.equal(ready, true);
  w.window.fx.preset = 8; w.api.onPresetChange(0, 8);
  w.api.update(1 / 60, { fx: w.window.fx }); assert(w.state.opacity > 0 && w.state.opacity < 0.2);
  assert.equal(w.api.backgroundHandoff().preset, 0);
  w.window.fx.preset = 0; w.api.onPresetChange(8, 0);
  for (let i = 0; i < 100; i++) w.api.update(1 / 60, { fx: w.window.fx });
  assert.equal(w.body.children.length, 0);
  const next = w.api.prepare();
  w.signal('mineradio-sonic-workshop-first-frame', { source: oldFrame,
    data: { type: 'mineradio-sonic-workshop-first-frame', generation } });
  assert.equal(w.state.rendered, false); next.cancel(); assert.equal(w.body.children.length, 0);
});
test('Workshop repeated cancellation retains at most one iframe and never resumes paused media', async () => {
  const w = workshop(); let played = 0;
  w.window.audio = { paused: true, play: () => played++ };
  for (let i = 0; i < 30; i++) {
    const pending = w.api.prepare(); assert.equal(w.body.children.length, 1);
    assert.equal(w.api.prepare(), pending);
    pending.cancel(); pending.cancel(); await pending.promise;
    assert.equal(w.body.children.length, 0);
  }
  assert.equal(played, 0);
});
function topography() {
  const raf = clock(), timer = clock();
  const window = { fx: { preset: 0, sonicGroundDensity: 25 }, requestAnimationFrame: raf.set,
    cancelAnimationFrame: raf.clear, setTimeout: timer.set, clearTimeout: timer.clear,
    MineradioSonicPerformance: { stageProfile: () => policy.profile('ultra', false, 0) } };
  const source = read('public/sonic-topography-preset.js').replace('global.MineradioSonicTopography = {', 'global.auditState = state; global.MineradioSonicTopography = {');
  vm.runInNewContext(source, { window, THREE });
  const scene = new THREE.Scene(), api = window.MineradioSonicTopography;
  return { window, raf, timer, scene, api, state: window.auditState,
    update: () => api.update(1 / 60, { fx: window.fx, scene, audio: {} }) };
}
test('Topography stages preparation; real alpha fades and retired resources dispose exactly once', async () => {
  const t = topography(), calls = [];
  const p = t.api.prepare({ scene: t.scene, fx: t.window.fx, camera: {}, renderer: { compile: () => calls.push('compile') } });
  assert.equal(t.scene.children.length, 0); t.raf.tick(); assert.equal(t.scene.children.length, 1);
  assert.equal(calls.length, 0); t.update(); assert.equal(t.state.root.visible, false);
  for (let i = 0; i < 4; i++) { t.raf.tick(); assert.equal(calls.length, i + 1); }
  await p.promise;
  t.window.fx.preset = 7; t.api.onPresetChange(0, 7, { scene: t.scene, fx: t.window.fx });
  for (let i = 0; i < 100; i++) t.update();
  const root = t.state.root, mat = t.state.terrainMat, before = mat.uniforms.uLayerOpacity.value;
  let released = 0; root.children.forEach(mesh => {
    mesh.addEventListener('dispose', () => released++);
    mesh.geometry.addEventListener('dispose', () => released++);
    mesh.material.addEventListener('dispose', () => released++);
  });
  t.window.fx.preset = 0; t.api.onPresetChange(7, 0, { scene: t.scene, fx: t.window.fx });
  assert.equal(t.state.root, root); assert.equal(released, 0);
  t.update(); assert(mat.uniforms.uLayerOpacity.value > 0 && mat.uniforms.uLayerOpacity.value < before);
  assert.equal(mat.depthWrite, false); assert.equal(t.state.meteorMat.opacity, t.state.opacity);
  assert.equal(t.state.floatingMat.uniforms.uLayerOpacity.value, t.state.opacity);
  for (let i = 0; i < 200; i++) t.update();
  assert.equal(t.state.root, null); assert.equal(t.scene.children.length, 0);
  assert.equal(released, 0); t.timer.tick(); assert.equal(released, 3);
  for (let i = 0; i < 5; i++) t.timer.tick(); assert.equal(released, 12);
  t.api.clear(); assert.equal(released, 12);
});
test('Topography cancelled callbacks cannot destroy a returning layer; no background allocation before frame', async () => {
  const t = topography();
  const pending = t.api.prepare({ scene: t.scene, fx: t.window.fx });
  pending.cancel(); await pending.promise; t.raf.tick(); assert.equal(t.scene.children.length, 0);
  const next = t.api.prepare({ scene: t.scene, fx: t.window.fx });
  t.raf.tick(); const root = t.state.root; t.raf.tick(); await next.promise;
  t.window.fx.preset = 7; t.api.onPresetChange(0, 7, { scene: t.scene, fx: t.window.fx });
  next.cancel(); assert.equal(t.state.root, root);
  t.api.clear(); assert.equal(t.scene.children.length, 0);
});
test('actual Workshop renderer wrapper signals only after a configured nonempty successful draw', () => {
  const events = [], listeners = {}; let lost = false, fail = false;
  const gl = { isContextLost: () => lost, getExtension: () => null, getParameter: () => 'test renderer' };
  const renderer = { domElement: { addEventListener() {} }, getContext: () => gl,
    render() { if (fail) throw Error('draw failed'); }, info: { render: {} } };
  const parent = { postMessage: data => events.push(data), MineradioSonicPerformance: {
    config: preset => { assert.equal(preset, 8); return { profile: null, target: 60, eligible: false }; }
  } };
  const window = { MineradioSonicPerformancePolicy: policy, addEventListener: (name, fn) => listeners[name] = fn };
  vm.runInNewContext(read('public/vendor/sonic-workshop/mineradio-performance.js'), {
    window, parent, location: { origin: 'http://localhost', search: '?generation=42' },
    performance: { now: () => 100 }, innerWidth: 100, innerHeight: 100, devicePixelRatio: 1,
    document: { hidden: false, addEventListener() {} }, requestAnimationFrame() {}, cancelAnimationFrame() {}
  });
  window.__mineradioWorkshopCreated({ gl: renderer, setDpr() {} });
  renderer.render({ children: [{}] });
  assert(!events.some(e => e.type === 'mineradio-sonic-workshop-first-frame'));
  window.__mineradioWorkshopPropertiesReady = true;
  renderer.render({ children: [] });
  lost = true; renderer.render({ children: [{}] }); lost = false;
  assert(!events.some(e => e.type === 'mineradio-sonic-workshop-first-frame'));
  renderer.render({ children: [{}] }); renderer.render({ children: [{}] });
  const first = events.filter(e => e.type === 'mineradio-sonic-workshop-first-frame');
  assert.equal(first.length, 1); assert.equal(first[0].generation, 42);
});
test('main loop retains outgoing preset and layers until Workshop fade covers them', () => {
  const source = read('public/js/modules/11-main-loop.js');
  const start = source.indexOf('  var skullPresetActive = fx &&', source.indexOf('tickGestureRotation(dt)'));
  const end = source.indexOf('  var targetRotY', start);
  let opacity = 0.1;
  const api = { isActive: () => true, backgroundHandoff: () => ({ opacity, preset: 2 }) };
  const c = { fx: { preset: 8, bloom: true, bloomStrength: 1 }, SKULL_PRESET_INDEX: 6, SONIC_PRESET_INDEX: 7,
    window: { MineradioSonicWorkshop: api }, MineradioSonicWorkshop: api,
    uniforms: { uPreset: { value: 8 }, uBackgroundHandoffAlpha: { value: 1 } },
    particles: {}, bloomParticles: {}, floatGroup: {}, backCoverGroup: {} };
  vm.createContext(c); vm.runInContext(source.slice(start, end), c);
  assert.equal(c.uniforms.uPreset.value, 2); assert.equal(c.uniforms.uBackgroundHandoffAlpha.value, 0.9);
  assert(c.particles.visible && c.bloomParticles.visible && c.backCoverGroup.visible);
  opacity = 0.999; vm.runInContext(source.slice(start, end), c); assert.equal(c.particles.visible, false);
});
test('external preparation cancellation cannot commit an unprepared background', async () => {
  const s = selection(); const p = s.choose(8);
  // Engines resolve false when global recovery cancels their preparation.
  const w = workshop(); const job = w.api.prepare(); w.api.clear();
  assert.equal(await job.promise, false); assert.equal(w.body.children.length, 0);
  s.timer.tick(); assert.equal(await p, false);
});
test('pending archive applies latest options and persists prepared preset after commit', async () => {
  const s = selection(), c = s.context, persisted = [];
  const noop = () => {};
  Object.assign(c, { normalizeFxArchiveSnapshot: value => value, isCameraArchiveKey: () => false,
    normalizeDevelopmentLockedFxState: noop, applyCameraArchiveState: noop, applyVisualRotationArchiveState: noop,
    applyCoverParticleResolution: noop, destroyFloatLayer: noop, setParticleLyricsSilently: noop,
    destroyBackCoverLayer: noop, setShelfMode: noop, shelfManager: null, setCamMode: noop,
    updateFxInputs: noop, applySavedLyricPaletteState: noop, refreshCurrentLyricStyle: noop,
    applyDesktopLyricsState: noop, applyWallpaperModeState: noop, updateRenderPowerClasses: noop,
    applyRendererPowerMode: noop, triggerPresetParticleTransition: noop,
    saveLyricLayout: () => persisted.push(c.fx.preset) });
  const source = read('public/js/modules/07-fx/00-preset-archive-data.js');
  vm.runInContext(source.slice(source.indexOf('var fxArchiveApplySequence'), source.indexOf('var hadStoredUserFxArchives')), c);
  const pendingUserChoice = s.choose(8);
  c.applyFxArchiveSnapshot({ preset: 8 });
  assert.equal(s.preparations.length, 1); assert.deepEqual(persisted, [0]);
  s.preparations[0].resolve(); await pendingUserChoice; await settle();
  assert.deepEqual(persisted, [0, 8]);
  assert.equal(s.effects.filter(x => x[0] === 'camera').length, 0, 'archive camera is not reset at delayed commit');
});
test('preparing iframe receives resume config while outgoing preset remains committed', () => {
  const source = read('public/sonic-performance.js');
  const start = source.indexOf("    var frame = document.querySelector('#sonic-workshop-layer iframe');", source.indexOf('  function tick()'));
  const end = source.indexOf('    if (!active)', start);
  assert(start > 0 && end > start, 'pending config dispatch precedes inactive preset early return');
  let paused = true; const messages = [];
  const c = { document: { querySelector: () => ({ contentWindow: { postMessage: data => messages.push(data) } }) },
    config: preset => { assert.equal(preset, 8); return { paused }; },
    lastConfig: '', location: { origin: 'http://localhost' } };
  vm.createContext(c); vm.runInContext(source.slice(start, end), c);
  assert.equal(messages[0].config.paused, true);
  paused = false; vm.runInContext(source.slice(start, end), c);
  assert.equal(messages[1].config.paused, false);
  vm.runInContext(source.slice(start, end), c); assert.equal(messages.length, 2);
});
test('a failing commit hook settles selection instead of detaching an unhandled rejection', async () => {
  const s = selection();
  s.context.saveLyricLayout = () => { throw Error('storage hook failed'); };
  const pending = s.choose(7); s.preparations[0].resolve();
  assert.equal(await pending, false); assert.equal(s.timer.size(), 0);
  assert.equal(s.context.pendingPresetSwitch, null);
});
test('Topography compiler failure releases candidate resources and keeps old scene empty', async () => {
  const t = topography();
  const pending = t.api.prepare({ scene: t.scene, fx: t.window.fx, camera: {},
    renderer: { compile() { throw Error('compile failed'); } } });
  const rejected = assert.rejects(pending.promise, /compile failed/);
  t.raf.tick(); t.raf.tick(); await rejected;
  pending.cancel(); assert.equal(t.scene.children.length, 0); assert.equal(t.state.root, null);
  assert.equal(t.window.fx.preset, 0); assert.equal(t.raf.size(), 0);
});
test('skull to Workshop retains real outgoing skull instead of clearing or substituting particles', async () => {
  const s = selection(); let cleared = 0;
  s.context.fx.preset = 6; s.context.clearSkullPresetResidue = () => cleared++;
  const pending = s.choose(8); s.preparations[0].resolve(); await pending;
  assert.equal(cleared, 0);
  const main = read('public/js/modules/11-main-loop.js');
  const start = main.indexOf('  var skullPresetActive = fx &&', main.indexOf('tickGestureRotation(dt)'));
  const end = main.indexOf('  var targetRotY', start);
  const api = { isActive: () => true, backgroundHandoff: () => ({ opacity: 0.5, preset: 6 }) };
  const c = { fx: { preset: 8 }, SKULL_PRESET_INDEX: 6, SONIC_PRESET_INDEX: 7,
    window: { MineradioSonicWorkshop: api }, MineradioSonicWorkshop: api,
    uniforms: { uPreset: { value: 8 }, uBackgroundHandoffAlpha: { value: 1 } },
    particles: {}, bloomParticles: {}, floatGroup: {}, backCoverGroup: {} };
  vm.createContext(c); vm.runInContext(main.slice(start, end), c);
  assert.equal(c.particles.visible, false); assert.equal(c.backCoverGroup.visible, false);
  const skull = read('public/js/modules/02-visual/01-float-skull-backcover.js');
  const assignment = skull.match(/skullParticleGroup\.material\.uniforms\.uOpacity\.value = [\s\S]*?;/)[0];
  Object.assign(c, { skullParticleGroup: { material: { uniforms: { uOpacity: { value: 0 } } } },
    skullParticleOpacity: 0.8, clampRange: (v, min, max) => Math.max(min, Math.min(max, v)) });
  vm.runInContext(assignment, c); const half = c.skullParticleGroup.material.uniforms.uOpacity.value;
  c.uniforms.uBackgroundHandoffAlpha.value = 1; vm.runInContext(assignment, c);
  assert.equal(c.skullParticleGroup.material.uniforms.uOpacity.value, half * 2);
});
