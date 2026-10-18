'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const THREE = require('../public/vendor/three.r128.min.js');
const read = file => fs.readFileSync(path.join(__dirname, '../public/js/modules/', file), 'utf8');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '('), end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start);
  return source.slice(start, end + 3);
}
function shelfLyricFixture(extra) {
  const state = { shelf: false };
  const group = new THREE.Group(), texture = { quality: 'ultra' };
  const stage = read('02-visual/14-stage-lyrics-rendering.js');
  const camera = new THREE.PerspectiveCamera();
  const c = vm.createContext(Object.assign({
    THREE, fx: { particleLyrics: true, lyricCameraLock: true }, stageLyrics: { group, current: { texture }, lockFitScale: 1 },
    camera, SKULL_PRESET_INDEX: 8, skullParticleGroup: null,
    shelfManager: { hasOpenContent: () => false }, orbit: {},
    normalizeLyricDisplayMode: () => 'single', normalizeLyricTranslationMode: () => 'off',
    shouldAvoidStageLyricsForShelf: () => state.shelf, shouldUseWallpaperLyricCameraLock: () => false,
    shouldOffsetLyricsForShelfDetail: () => false, lyricCameraLockFit: () => 1, clampStageLyricTargetForShelf: () => false, stageLyricShelfAnchor: () => null,
    stageLyricShelfFit: () => 1, stageLyricShelfReferenceCamera: () => camera, stageLyricShelfBasePosition: out => out.set(0, 0, 0),
    getStageLyricLockBounds: () => ({ w: 5, h: 1 }),
    clampRange: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), durationEaseFactor: (seconds, dt) => Math.min(1, dt / seconds),
    lyricCameraDir: new THREE.Vector3(0, 0, -1), lyricCameraRight: new THREE.Vector3(1, 0, 0), lyricCameraUp: new THREE.Vector3(0, 1, 0),
    lyricLayoutBase: new THREE.Vector3(), lyricLayoutTarget: new THREE.Vector3(),
    lyricCameraTarget: new THREE.Vector3(), lyricTargetQuat: new THREE.Quaternion(),
    lyricCoverWorldPos: new THREE.Vector3(), lyricCoverWorldQuat: new THREE.Quaternion(),
    setStageLyricViewBasisFromCameraOrQuaternion() {},
    applyStageLyricLayoutOffset: (target, x, y, z) => target.add(new THREE.Vector3(x, y, z)),
    stageLyricTargetQuaternion: (quat, x, y) => c.lyricTargetQuat.copy(quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x * Math.PI / 180, y * Math.PI / 180, 0, 'YXZ'))),
    resetLyricRenderUploadFrameBudget: () => { throw new Error('UI motion must not reset upload budget'); },
  }, extra));
  vm.runInContext(extract(stage, 'stageLyricShelfCaptionMetrics'), c);
  vm.runInContext('var innerWidth = 1280, innerHeight = 720, lyricShelfCoverQuat = new THREE.Quaternion(), lyricShelfTurnQuat = new THREE.Quaternion(), lyricShelfRestQuat = new THREE.Quaternion(), lyricShelfCam = null;' +
    stage.slice(stage.indexOf('var STAGE_LYRIC_SHELF_FLIP_SECONDS'), stage.indexOf('var lyricShelfFlipDepthDir = null;') + 'var lyricShelfFlipDepthDir = null;'.length), c);
  for (const name of ['lyricShelfActiveCamera', 'stageLyricShelfFlipEase', 'stageLyricShelfFlipSeconds', 'stageLyricStableShelfAnchor', 'stageLyricShelfFlipTarget', 'stageLyricShelfSourcePose', 'blendStageLyricShelfFlip', 'updateStageLyricLayout']) {
    vm.runInContext(extract(stage, name), c);
  }
  return { c, group, texture, state };
}
test('shelf avoidance and return move existing high-quality lyrics without rebuilding them', () => {
  const { c, group, texture, state } = shelfLyricFixture();
  c.updateStageLyricLayout(); state.shelf = true;
  // One timed flip (0.62 s): the block keeps moving left every frame until it settles.
  for (let i = 0; i < 30; i++) { const x = group.position.x; c.updateStageLyricLayout(); assert(group.position.x < x); }
  for (let i = 0; i < 30; i++) c.updateStageLyricLayout();
  assert(group.position.x < -0.3);
  assert(new THREE.Euler().setFromQuaternion(group.quaternion, 'YXZ').y < -10 * Math.PI / 180, 'opening retains a visible 3D side turn');
  state.shelf = false;
  for (let i = 0; i < 30; i++) { const x = group.position.x; c.updateStageLyricLayout(); assert(group.position.x > x); }
  for (let i = 0; i < 30; i++) c.updateStageLyricLayout();
  assert(Math.abs(group.position.x) < .01);
  for (let i = 0; i < 20; i++) c.updateStageLyricLayout();
  assert(Math.abs(new THREE.Euler().setFromQuaternion(group.quaternion, 'YXZ').y) < Math.PI / 180, 'closing restores the original angle');
  assert.equal(c.stageLyrics.current.texture, texture);
});
test('the flip lasts as long as the shelf takes to open, then settles without drifting', () => {
  const { c, group, state } = shelfLyricFixture({ shelfSummonSettings: () => ({ openDuration: 1.2, closeDuration: 0.5 }) });
  c.updateStageLyricLayout(); state.shelf = true;
  for (let i = 0; i < 60; i++) c.updateStageLyricLayout(); // 1.0 s of a 1.2 s opening (dt is 1/60 by default)
  assert(c.stageLyrics.shelfFlipT < 0.9, 'still on the way after one second');
  for (let i = 0; i < 20; i++) c.updateStageLyricLayout();
  assert.equal(c.stageLyrics.shelfFlipT, 1);
  const settled = group.position.clone();
  for (let i = 0; i < 120; i++) c.updateStageLyricLayout();
  assert(group.position.distanceTo(settled) < 1e-9, 'once beside the shelf the lyrics stay put');
});
test('lyrics dragged away go straight to the shelf while the cover recentres, never back through the centre first', () => {
  const particles = new THREE.Object3D();
  particles.rotation.set(0.5, 1.3, 0);
  const { c, group, state } = shelfLyricFixture({ particles, fx: { particleLyrics: true, lyricCameraLock: false } });
  const syncCover = () => { particles.updateMatrixWorld(true); particles.getWorldPosition(c.lyricCoverWorldPos); particles.getWorldQuaternion(c.lyricCoverWorldQuat); };
  syncCover();
  c.updateStageLyricLayout();
  const dragged = group.quaternion.clone();
  assert(dragged.angleTo(new THREE.Quaternion()) > 1, 'the lyrics follow the dragged cover while the shelf is closed');
  state.shelf = true;
  const toFinal = [];
  for (let i = 0; i < 90; i++) {
    // The cover turns back to centre over the first 25 frames, exactly while the shelf opens.
    const k = Math.max(0, 1 - i / 25); particles.rotation.set(0.5 * k, 1.3 * k, 0); syncCover();
    c.updateStageLyricLayout();
    toFinal.push(group.quaternion.clone());
  }
  const final = toFinal[toFinal.length - 1];
  const distances = toFinal.map(q => q.angleTo(final));
  for (let i = 1; i < distances.length; i++) assert(distances[i] <= distances[i - 1] + 1e-9, 'the turn towards the shelf pose never reverses (frame ' + i + ')');
  assert(distances[0] > 0.8, 'it starts from the dragged pose');
});
test('closing shelf keeps the lyric return on UI frames briefly, then releases ownership', () => {
  let now = 100;
  const ui = { visible: true, userData: { mineradioUiLayer: true } };
  const c = vm.createContext({ window: {}, performance: { now: () => now }, scene: { children: [ui] },
    isMainSceneCoveredBySplash: () => false, stageLyrics: { group: { visible: true } } });
  vm.runInContext(read('01-scene/05-ui-render-cache.js'), c);
  assert.equal(c.mainUiMotionActive(now), true); ui.visible = false;
  now += 300; assert.equal(c.mainUiMotionActive(now), true);
  now += 201; assert.equal(c.mainUiMotionActive(now), false);
  ui.visible = true; c.mainUiMotionActive(now); ui.visible = false;
  c.stageLyrics.group.visible = false; assert.equal(c.mainUiMotionActive(now + 20), false);
});
test('a skipped background frame advances camera and lyric pose, not expensive lyric effects', () => {
  const source = read('11-main-loop.js');
  const start = source.indexOf('function animate()'), end = source.indexOf('  var dt = Math.min((now - prevTime)', start);
  const calls = [];
  const c = vm.createContext({ window: {}, performance: { now: () => 100 },
    scheduleNextMainLoopFrame() {}, mainLoopDeepBackgroundSleeping: () => false,
    mainUiPreviousTime: 96, mainUiMotionActive: () => true, mainFrameGates: { shelf: {} },
    consumeFrameGate: (_gate, _now, dt) => dt, shelfManager: { update: () => calls.push('shelf') },
    isMainSceneCoveredBySplash: () => false, shouldSkipAdaptiveRenderFrame: () => true,
    updateFreeCamera: () => calls.push('free-camera'), updateCamera: () => calls.push('camera'),
    applySkullCameraPose: () => calls.push('skull-camera'), updateStageLyricLayout: () => calls.push('lyric-pose'),
    updateStageLyrics3D: () => { throw new Error('Must not rebuild lyrics on extra UI frames'); },
    drawMainUiFrame: refresh => { assert.equal(refresh, false); calls.push('draw-ui'); },
  });
  vm.runInContext(source.slice(start, end) + '\n}', c); c.animate();
  assert.deepEqual(calls, ['shelf', 'free-camera', 'camera', 'skull-camera', 'lyric-pose', 'draw-ui']);
  calls.length = 0; c.mainUiPreviousTime = 96; c.mainUiMotionActive = () => false; c.targetMainShelfFps = () => 30; c.animate();
  assert.deepEqual(calls, ['shelf', 'draw-ui']);
});

test('background frames do not integrate camera motion twice after extra UI frames', () => {
  const source = read('11-main-loop.js');
  const start = source.indexOf('  var cameraStepDt ='), end = source.indexOf('  if (perfProbe', start);
  const steps = [], c = vm.createContext({ dt: 1 / 30, uiDt: 1 / 144, uiMotionActive: true,
    updateCinema: dt => steps.push(['cinema', dt]), updateFreeCamera: dt => steps.push(['free', dt]),
    updateCamera() {}, applySkullCameraPose: dt => steps.push(['skull', dt]) });
  vm.runInContext(source.slice(start, end), c);
  assert.deepEqual(steps, [['cinema', 1 / 30], ['free', 1 / 144], ['skull', 1 / 144]]);
  steps.length = 0; c.uiMotionActive = false; vm.runInContext(source.slice(start, end), c);
  assert.deepEqual(steps, [['cinema', 1 / 30], ['free', 1 / 30], ['skull', 1 / 30]]);
});
