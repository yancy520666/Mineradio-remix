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
test('shelf avoidance and return move existing high-quality lyrics without rebuilding them', () => {
  let shelf = false;
  const group = new THREE.Group(), texture = { quality: 'ultra' };
  const c = vm.createContext({
    fx: { particleLyrics: true, lyricCameraLock: true }, stageLyrics: { group, current: { texture }, lockFitScale: 1 },
    camera: new THREE.PerspectiveCamera(), SKULL_PRESET_INDEX: 8, skullParticleGroup: null,
    shelfManager: { hasOpenContent: () => false }, orbit: {},
    normalizeLyricDisplayMode: () => 'single', normalizeLyricTranslationMode: () => 'off',
    shouldAvoidStageLyricsForShelf: () => shelf, shouldUseWallpaperLyricCameraLock: () => false,
    shouldOffsetLyricsForShelfDetail: () => false, lyricCameraLockFit: () => 1, clampStageLyricTargetForShelf: () => false,
    clampRange: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    lyricCameraDir: new THREE.Vector3(0, 0, -1), lyricLayoutBase: new THREE.Vector3(),
    lyricCameraTarget: new THREE.Vector3(), lyricTargetQuat: new THREE.Quaternion(),
    setStageLyricViewBasisFromCameraOrQuaternion() {},
    applyStageLyricLayoutOffset: (target, x, y, z) => target.add(new THREE.Vector3(x, y, z)),
    stageLyricTargetQuaternion: quat => c.lyricTargetQuat.copy(quat),
    resetLyricRenderUploadFrameBudget: () => { throw new Error('UI motion must not reset upload budget'); },
  });
  vm.runInContext(extract(read('02-visual/14-stage-lyrics-rendering.js'), 'updateStageLyricLayout'), c);
  c.updateStageLyricLayout(); shelf = true;
  for (let i = 0; i < 20; i++) { const x = group.position.x; c.updateStageLyricLayout(); assert(group.position.x < x); }
  assert(group.position.x < -0.8 && group.position.x > -1.3); shelf = false;
  for (let i = 0; i < 20; i++) { const x = group.position.x; c.updateStageLyricLayout(); assert(group.position.x > x); }
  assert(Math.abs(group.position.x) < .01);
  assert.equal(c.stageLyrics.current.texture, texture);
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
