'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const controlsPath = 'public/js/modules/01-scene/04-bottom-controls-cursor.js';
const mainPath = 'public/js/modules/11-main-loop.js';
const stagePath = 'public/js/modules/02-visual/14-stage-lyrics-rendering.js';
const rowPath = 'public/js/modules/02-visual/12-lyrics-row-layers.js';

function pointerFixture(diy = false) {
  let reads = 0, hides = 0, rafId = 0, rect = { left: 0, right: 10, top: 0, bottom: 10 };
  const frames = new Map();
  const element = { classList: { contains: () => true }, matches: () => false, getBoundingClientRect() { reads++; return rect; } };
  const c = vm.createContext({ document: { hidden: false, body: { classList: { contains: () => false } }, getElementById: () => element },
    controlsPointerFrame: 0, controlsPointerPending: null, controlsAutoHide: true, diyPlayerMode: diy, miniQueueOpen: false,
    performance: { now: () => 100 }, isBottomControlsSuppressedForShelf: () => false,
    requestAnimationFrame(fn) { frames.set(++rafId, fn); return rafId; }, cancelAnimationFrame(id) { frames.delete(id); },
    scheduleControlsHide() { hides++; }, revealBottomControls() {}, wakeBottomHandle() {} });
  loadFunctions(c, controlsPath, ['cancelControlsPointerFrame', 'queueControlsAutoHideFromPointer', 'updateControlsAutoHideFromPointer']);
  return { c, element, frames, counts: () => ({ reads, hides }), resize(next) { rect = next; }, flush() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } } };
}
for (const diy of [false, true]) test(`1000 mouse motions use one fresh measurement batch (${diy ? 'DIY' : 'normal'})`, () => {
  const f = pointerFixture(diy);
  for (let i = 0; i < 1000; i++) f.c.queueControlsAutoHideFromPointer(100 + i, 100);
  assert.equal(f.frames.size, 1); assert.equal(f.counts().reads, 0);
  f.flush(); assert.deepEqual(f.counts(), { reads: diy ? 5 : 3, hides: 1 });
});
test('immediate click supersedes old queued coordinates; resize, held drag and hidden cancellation stay current', () => {
  const f = pointerFixture();
  f.c.queueControlsAutoHideFromPointer(900, 900);
  f.c.updateControlsAutoHideFromPointer(5, 5);
  assert.equal(f.frames.size, 0); assert.equal(f.c.controlsHovering, true);
  f.c.queueControlsAutoHideFromPointer(50, 50); f.resize({ left: 40, right: 60, top: 40, bottom: 60 });
  f.flush(); assert.equal(f.c.controlsHovering, true);
  f.element._controlsPointerHeld = true; f.c.queueControlsAutoHideFromPointer(900, 900); f.flush(); assert.equal(f.c.controlsHovering, true);
  f.element._controlsPointerHeld = false; f.c.queueControlsAutoHideFromPointer(900, 900); f.flush(); assert.equal(f.c.controlsHovering, false);
  f.c.queueControlsAutoHideFromPointer(50, 50); f.c.cancelControlsPointerFrame(); assert.equal(f.frames.size, 0);
  f.c.queueControlsAutoHideFromPointer(50, 50); f.c.document.hidden = true; const before = f.counts(); f.flush(); assert.deepEqual(f.counts(), before);
});

function sparksFixture() {
  let uploads = 0, trig = 0, now = 0;
  const source = read(stagePath), start = source.indexOf('      if (data.sparks && data.sparkMat) data.sparks.visible');
  const end = source.indexOf('      return true;', start);
  const math = Object.create(Math);
  for (const key of ['sin', 'cos']) math[key] = x => { trig++; return Math[key](x); };
  const position = { array: new Float32Array(396), set needsUpdate(v) { if (v) uploads++; } };
  const c = vm.createContext({ Math: math, performance: { now: () => now }, data: { sparks: { geometry: { attributes: { position } }, rotation: { x: 0, z: 0 } }, sparkMat: {}, basePositions: new Float32Array(396) },
    fx: { lyricGlowParticles: false }, editPreview: false, getLyricSparkOpacity: () => 0, stageLyrics: { beatGlow: 0 }, dt: 1/60, t: 1, seed: 1, bass: .1, mid: .2 });
  const run = new vm.Script(source.slice(start, end));
  return { c, position, counts: () => ({ trig, uploads }), tick(ms) { now = ms; c.t = ms / 1000; run.runInContext(c); } };
}
test('fully hidden 132-point sparks perform zero trigonometry/buffer writes; reentry uses current time and angular phase', () => {
  const sleeping = sparksFixture(), active = sparksFixture();
  for (let i = 0; i < 60; i++) sleeping.tick(i * 1000/60);
  assert.deepEqual(sleeping.counts(), { trig: 0, uploads: 0 });
  assert.ok(sleeping.c.data.sparks.rotation.z > 0, 'angular phase never freezes');
  sleeping.c.fx.lyricGlowParticles = true; active.c.fx.lyricGlowParticles = true;
  sleeping.tick(2000); active.tick(2000);
  assert.deepEqual([...sleeping.position.array], [...active.position.array], 'point positions derive from the current absolute animation time');
  assert.equal(sleeping.counts().uploads, 1);
  assert.ok(sleeping.c.data.sparks.rotation.z > .015, 'phase accrued while invisible is preserved');
  sleeping.c.editPreview = true; const count = sleeping.counts(); sleeping.tick(3000); assert.deepEqual(sleeping.counts(), count);
});

test('wake keeps first render synchronous, coalesces repeats, invalidates size/context/scene/camera and resumes after loss', () => {
  let renders = 0, now = 1, deep = false, context = { isContextLost: () => false };
  const c = vm.createContext({ mainLoopWakeRenderState: null, mainLoopBackgroundTimer: 0, mainLoopAnimationRequested: false, mainLoopAnimationFrameId: 0,
    performance: { now: () => now }, mainLoopDeepBackgroundSleeping: () => deep, renderer: { domElement: { width: 1920, height: 1080 }, getContext: () => context, render: () => renders++ }, scene: {}, camera: {},
    cancelAnimationFrame() {}, requestMainLoopAnimationFrame() {} });
  loadFunctions(c, mainPath, ['mainLoopWakeCameraSignature', 'wakeMainLoopFromBackground']);
  c.wakeMainLoopFromBackground(); assert.equal(renders, 1);
  c.wakeMainLoopFromBackground(); c.wakeMainLoopFromBackground(); assert.equal(renders, 1);
  c.renderer.domElement.width = 2560; c.wakeMainLoopFromBackground(); assert.equal(renders, 2);
  c.scene = {}; c.wakeMainLoopFromBackground(); c.camera = {}; c.wakeMainLoopFromBackground(); assert.equal(renders, 4);
  context = { isContextLost: () => false }; c.wakeMainLoopFromBackground(); assert.equal(renders, 5);
  context.isContextLost = () => true; c.wakeMainLoopFromBackground(); assert.equal(renders, 5);
  context.isContextLost = () => false; c.wakeMainLoopFromBackground(); assert.equal(renders, 6);
  now += 20; c.wakeMainLoopFromBackground(); assert.equal(renders, 7);
  c.camera.position = { x: 1, y: 2, z: 3 }; c.wakeMainLoopFromBackground(); assert.equal(renders, 8);
  c.camera.position.x++; c.wakeMainLoopFromBackground(); assert.equal(renders, 9);
  deep = true; c.wakeMainLoopFromBackground(); deep = false; c.wakeMainLoopFromBackground(); assert.equal(renders, 10);
  c.trackSwitchToken = 2; c.wakeMainLoopFromBackground(); assert.equal(renders, 11);
});

function rowsFixture(count, alwaysWrite, effects = false) {
  let scales = 0, now = 1000;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const c = vm.createContext({ performance: { now: () => now }, fx: { lyricLiveViewportFit: false }, stageLyrics: { shelfLayoutMix: 0 }, lyricsLines: Array(count).fill({}),
    clampRange: clamp, normalizeLyricTranslationMode: () => 'off', normalizeLyricDisplayMode: mode => mode || 'three', lyricTranslationOpacityValue: () => 1,
    lyricNearestPrimaryLineIndexForVirtual: x => Math.round(x), lyricPrimaryVirtualIndex: x => x, lyricMeshLineStepWorld: () => 1, lyricBackdropAdaptActive: () => false, lyricTextureClarityScale: () => 1,
    lyricDisplayOffsetsForMode: mode => mode === 'single' ? [0] : mode === 'five' ? [-2,-1,0,1,2] : [-1,0,1],
    lyricReadabilityLightColor: null, getLyricTextureMaterialOpacity: m => m.opacity, setLyricTextureMaterialOpacity: (m,v) => { m.opacity = v; }, lyricRowTextReadyForDisplay: () => true, registerLyricQualityCandidates() {}, lyricQualityState: { deferFinalize: true }, updateLyricQualityStats() {},
    lyricTrackFarFollowScale: () => 1, lyricTrackGlideOffset: () => null });
  c.lyricLineAllowedForDisplayMode = (i,t,m) => Math.abs(i-t) <= (m === 'single' ? 0 : m === 'five' ? 2 : 1);
  let source = read(rowPath); source = source.slice(source.indexOf('function updateLyricRowLayers('));
  if (alwaysWrite) source = source.replace(/if \(row\.(?:mesh|readability|glow)\.visible \|\|[^\n]+\) (row\.(?:mesh|readability|glow)\.scale\.setScalar\([^;]+;)/g, '$1');
  vm.runInContext(source, c);
  const rows = Array.from({ length: count }, (_,i) => ({ lineIndex: i, virtualIndex: i, isPrimary: true, targetAlpha: .5, renderLineUploaded: true,
    mesh: { visible: false, position: { x: 0, y: 10-i, z: 0 }, scale: { x: 1, y: 1, z: 1, setScalar(v) { this.x = this.y = this.z = v; scales++; } } }, mat: { opacity: 0 }, viewportFitScale: 1 }));
  if (effects) for (const row of rows) {
    const layer = () => ({ visible: false, position: { x: 0, y: row.mesh.position.y, z: 0, set(x,y,z) { this.x=x; this.y=y; this.z=z; } },
      scale: { x: 1, y: 1, z: 1, setScalar(v) { this.x=this.y=this.z=v; scales++; } } });
    row.readability = layer(); row.glow = layer(); row.readabilityMat = { opacity: 0 }; row.glowMat = { opacity: 0 };
    row.renderReadabilityUploaded = true; row.renderGlowUploaded = true;
  }
  const data = { rowLayers: rows, usesTrack: true, trackPersistent: true, trackScrollPrimed: true, renderInitialTextReady: true, trackScrollOffset: 10, trackTargetLineIndex: 10, trackTargetVirtualIndex: 10 };
  return { c, data, count: () => scales, tick(opts = {}) { now += 1000/60; c.updateLyricRowLayers(data, { opacity: 1, deltaTime: 1/60, motionBlend: 1, ...opts }); },
    state() { return JSON.stringify(data); } };
}
for (const n of [50, 200, 500]) test(`${n} complete runway rows retain exact state through settling, seek, modes, drag and restore`, () => {
  const optimized = rowsFixture(n, false), original = rowsFixture(n, true);
  for (let frame = 0; frame < 350; frame++) { optimized.tick(); original.tick(); }
  assert.equal(optimized.state(), original.state());
  const a = optimized.count(), b = original.count(); optimized.tick(); original.tick();
  assert.equal(optimized.count() - a, 3); assert.equal(original.count() - b, n);
  for (const target of [n-3, 2, n-10, 10]) {
    for (const f of [optimized, original]) { f.data.trackTargetLineIndex = target; f.data.trackTargetVirtualIndex = target; }
    for (let frame = 0; frame < 30; frame++) {
      optimized.data.displayMode = original.data.displayMode = frame < 10 ? 'single' : frame < 20 ? 'five' : 'three';
      const opts = { previewMotionLock: frame < 10, jitterX: .03, jitterY: .02, time: frame / 60 };
      optimized.tick(opts); original.tick(opts); assert.equal(optimized.state(), original.state());
    }
  }
  for (const f of [optimized, original]) f.data.trackRestoreLayoutPending = true;
  optimized.tick(); original.tick(); assert.equal(optimized.state(), original.state());
  assert.equal(optimized.data.rowLayers.length, n, 'entire song runway stays resident');
});

test('readability and glow layers preserve exact hidden/reentry state in both locked and legacy easing paths', () => {
  for (const persistent of [true, false]) {
    const a = rowsFixture(50, false, true), b = rowsFixture(50, true, true);
    a.data.trackPersistent = b.data.trackPersistent = persistent;
    for (let frame = 0; frame < 400; frame++) {
      a.data.displayMode = b.data.displayMode = frame < 100 ? 'single' : frame < 200 ? 'five' : 'three';
      if (frame === 250) { a.data.trackTargetLineIndex = b.data.trackTargetLineIndex = 30; a.data.trackTargetVirtualIndex = b.data.trackTargetVirtualIndex = 30; }
      const opts = { readability: .6, rowGlow: .3, rowGlowBeat: .5, jitterX: frame < 200 ? 0 : .03, time: frame / 60 };
      a.tick(opts); b.tick(opts); assert.equal(a.state(), b.state());
    }
  }
});

test('documents remaining coupling: a skipped background frame does not yet sample audio or lyric state', () => {
  let now = 1000, uiDraws = 0, audioReads = 0, lyricReads = 0;
  const c = vm.createContext({ window: {}, performance: { now: () => now }, mainUiPreviousTime: now,
    scheduleNextMainLoopFrame() {}, mainLoopDeepBackgroundSleeping: () => false, mainUiMotionActive: () => false,
    mainFrameGates: { shelf: {} }, consumeFrameGate: () => 0, targetMainShelfFps: () => 30,
    shelfManager: null, shouldSkipAdaptiveRenderFrame: () => true, drawMainUiFrame() { uiDraws++; },
    analyser: { getByteFrequencyData() { audioReads++; } }, tickLyricsParticles() { lyricReads++; }, updateStageLyrics3D() { lyricReads++; } });
  loadFunctions(c, mainPath, ['animate']);
  for (let i = 0; i < 30; i++) { now += 1000/60; c.animate(); }
  assert.equal(uiDraws, 30); assert.equal(audioReads, 0); assert.equal(lyricReads, 0);
});
