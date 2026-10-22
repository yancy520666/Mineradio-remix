'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function fixture() {
  const c = vm.createContext({ fx: { lyricCameraLock: true }, window: { innerWidth: 1200 }, stageLyrics: { shelfFlipT: 0 },
    clampRange: (v, a, b) => Math.min(b, Math.max(a, v)) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/vendor/three.r128.min.js'), 'utf8'), c);
  vm.runInContext(`var camera = new THREE.PerspectiveCamera(45, 1.5, .1, 100);
    camera.position.z=6;camera.updateMatrixWorld(true);
    var lyricViewportFitLeft=new THREE.Vector3(),lyricViewportFitRight=new THREE.Vector3();
    var root=new THREE.Group();
    var primary={isPrimary:true,isActive:true,mesh:new THREE.Mesh(),lineWorldW:9,lineMask:{width:2048,textWidth:2048},baseScale:1};
    var translation={isTranslation:true,mesh:new THREE.Mesh(),lineWorldW:2,lineMask:{width:2048,textWidth:2048},baseScale:.8};
    root.add(primary.mesh,translation.mesh);`, c);
  loadFunctions(c, 'public/js/modules/02-visual/12a-lyrics-edit-preview.js', ['prepareLyricTranslationParents']);
  loadFunctions(c, 'public/js/modules/02-visual/12-lyrics-row-layers.js', ['lyricViewportSafeMarginPx', 'lyricViewportFitRatio', 'measureLyricRowViewportScale', 'lyricRowAdaptiveViewportScale', 'lyricRowLiveViewportScale']);
  c.prepareLyricTranslationParents({ rowLayers: [c.primary, c.translation] });
  return c;
}

test('camera-locked lyrics fit original and translation by the same ratio', () => {
  for (const translatedLonger of [false, true]) {
    const c = fixture();
    if (translatedLonger) { c.primary.lineWorldW = 2; c.translation.lineWorldW = 12; }
    for (const distance of [6, 4, 2.4, 6]) {
      c.camera.position.z = distance; c.camera.updateMatrixWorld(true);
      const original = c.lyricRowLiveViewportScale(c.primary, 1);
      const translated = c.lyricRowLiveViewportScale(c.translation, .8);
      assert(Math.abs(original - translated) < 1e-9, 'one shared boundary fit preserves the authored size ratio');
      assert(original > 0 && original <= 1);
    }
  }
});

test('ordinary orbit zoom preserves both font sizes even with live edge fitting enabled', () => {
  const c = fixture();
  c.fx.lyricCameraLock = false;
  c.fx.lyricLiveViewportFit = true;
  for (const distance of [6, 4, 2.4, 6]) {
    c.camera.position.z = distance; c.camera.updateMatrixWorld(true);
    assert.equal(c.lyricRowLiveViewportScale(c.primary, 1), 1);
    assert.equal(c.lyricRowLiveViewportScale(c.translation, .8), 1);
  }
});

test('opening the shelf discards the close-up row reduction so caption fitting is applied only once', () => {
  const c = fixture();
  c.camera.position.z = 2.4; c.camera.updateMatrixWorld(true);
  assert(c.lyricRowLiveViewportScale(c.primary, 1) < .5);
  c.stageLyrics.shelfFlipT = .5;
  assert.equal(c.lyricRowLiveViewportScale(c.primary, 1), 1);
  assert.equal(c.lyricRowLiveViewportScale(c.translation, .8), 1);
  c.stageLyrics.shelfFlipT = 0;
  assert(c.lyricRowLiveViewportScale(c.primary, 1) < .5, 'home viewport protection resumes after leaving');
});

test('shelf caption measures authored glyph size instead of the shrunken close-up row', () => {
  const c = fixture();
  c.primary.viewportUnfittedScale = 1;
  c.primary.mesh.scale.setScalar(.22);
  c.stageLyrics.current = { position: { y: 0, z: 0 }, userData: { lyric: { rowLayers: [c.primary] } } };
  c.STAGE_LYRIC_SHELF_NOMINAL_ROOT_SCALE = 1.06;
  c.getStageLyricLockBounds = () => ({ w: 9, h: 1 });
  c.lyricMaskInkBounds = () => null;
  loadFunctions(c, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['stageLyricShelfCaptionMetrics']);
  assert.equal(c.stageLyricShelfCaptionMetrics().w, 9 * 1.06);
});
