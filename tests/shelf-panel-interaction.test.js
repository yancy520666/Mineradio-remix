'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { loadFunctions } = require('./helpers/classic-functions');

function threeContext(extra) {
  const ctx = vm.createContext(Object.assign({ console }, extra || {}));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/vendor/three.r128.min.js'), 'utf8'), ctx);
  return ctx;
}
function camera(ctx, aspect) {
  vm.runInContext(`var camera = new THREE.PerspectiveCamera(45, ${aspect}, 0.1, 100);
    camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();`, ctx);
}

test('shelf hit testing follows the projected card shape instead of its bounding box', () => {
  const ctx = threeContext({ innerWidth: 1400, innerHeight: 800, clampRange: (v, a, b) => Math.min(b, Math.max(a, v)) });
  camera(ctx, 1400 / 800);
  loadFunctions(ctx, 'public/js/modules/04-shelf/00-layout-hover.js', ['screenQuadHit']);
  // A card turned 60° about Y plus a roll: its bounding box is far bigger than its footprint.
  vm.runInContext(`var mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1));
    mesh.rotation.set(0, 1.05, 0.5); mesh.updateMatrixWorld(true);`, ctx);
  const hit = (x, y, pad) => vm.runInContext(`screenQuadHit(mesh, 1, 0.5, ${x}, ${y}, ${pad})`, ctx);
  assert(hit(700, 400, 0), 'the card centre is a hit');
  const bbox = vm.runInContext(`(function () {
    var xs = [], ys = [];
    [[-1,-.5],[1,-.5],[1,.5],[-1,.5]].forEach(function (c) {
      var v = new THREE.Vector3(c[0], c[1], 0).applyMatrix4(mesh.matrixWorld).project(camera);
      xs.push((v.x + 1) * innerWidth / 2); ys.push((1 - v.y) * innerHeight / 2);
    });
    return { minX: Math.min.apply(0, xs), maxX: Math.max.apply(0, xs), minY: Math.min.apply(0, ys), maxY: Math.max.apply(0, ys) };
  })()`, ctx);
  // Every bounding-box corner is empty space for a rotated card; the old 28~72px padded box accepted it.
  let rejectedCorners = 0;
  for (const [x, y] of [[bbox.minX, bbox.minY], [bbox.maxX, bbox.minY], [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY]]) {
    if (!hit(x, y, 12)) rejectedCorners += 1;
  }
  assert(rejectedCorners >= 2, 'empty corners of the bounding box are no longer hits');
  assert.equal(hit(bbox.maxX + 30, 400, 12), null, 'blank space beside the card is not a hit');
});

test('lyrics pushed aside by the shelf never end up in the far-left strip of the screen', () => {
  const ctx = threeContext();
  camera(ctx, 1400 / 653);
  loadFunctions(ctx, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['clampStageLyricTargetForShelf']);
  vm.runInContext(`var STAGE_LYRIC_SHELF_MIN_NDC_X = -0.40; var lyricShelfClampProbe = null; var lyricShelfClampRight = null;`, ctx);
  const ndcX = (x) => vm.runInContext(`new THREE.Vector3(${x}, 0, 0).project(camera).x`, ctx);
  const clampedX = (x) => vm.runInContext(`(function () { var t = new THREE.Vector3(${x}, 0, 0); clampStageLyricTargetForShelf(t); return t.x; })()`, ctx);
  assert(ndcX(-6) < -0.9, 'fixture: this target is hugging the left edge');
  assert(Math.abs(ndcX(clampedX(-6)) + 0.40) < 1e-6, 'pulled back to 30% of the screen width');
  assert.equal(clampedX(-0.3), -0.3, 'lyrics already inside the safe area stay where they are');
});

test('the left playlist panel and the right shelf yield to each other', () => {
  const calls = [];
  const pp = { classList: { contains: (c) => c === 'peek' } };
  const ctx = vm.createContext({
    document: { getElementById: () => pp },
    playlistPanelPinned: false, shelfPinnedOpen: true,
    shelfManager: { hasOpenContent: () => true },
    safeShelfCloseContent: (r) => calls.push('close:' + r),
    setShelfPinnedOpen: (open) => calls.push('pin:' + open),
    setPeek: (el, on, key) => calls.push('peek:' + key + ':' + on)
  });
  loadFunctions(ctx, 'public/js/modules/10-shell/02-peek-panels-upload.js', ['yieldShelfToLeftPanel', 'yieldLeftPanelToShelf']);
  ctx.yieldShelfToLeftPanel();
  assert.deepEqual(calls.splice(0), ['close:left-panel-opened', 'pin:false']);
  ctx.yieldLeftPanelToShelf();
  assert.deepEqual(calls.splice(0), ['peek:pl:false']);
  ctx.playlistPanelPinned = true;
  ctx.yieldLeftPanelToShelf();
  assert.deepEqual(calls, [], 'a panel the user pinned open is not closed by the shelf');
  ctx.shelfPinnedOpen = false; ctx.shelfManager.hasOpenContent = () => false;
  ctx.yieldShelfToLeftPanel();
  assert.deepEqual(calls, [], 'nothing to close when the shelf is already closed');
});

test('the visual console closes from a second button click, an outside click, or leaving the window', () => {
  const classes = new Set(['peek']);
  const panel = { classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (...c) => c.forEach((x) => classes.delete(x)), toggle() {} } };
  const handlers = {};
  const docEl = { addEventListener: (n, f) => { handlers['root:' + n] = f; } };
  const fab = { addEventListener: (n, f) => { handlers['fab:' + n] = f; }, classList: { remove() {} } };
  let toggled = [];
  const ctx = vm.createContext({
    document: {
      getElementById: (id) => (id === 'fx-panel' ? panel : id === 'fx-fab' ? fab : null),
      addEventListener: (n, f) => { handlers['doc:' + n] = f; }, documentElement: docEl, body: {}
    },
    renderer: { domElement: { id: 'canvas' } }, setTimeout: () => 0, diyPlayerMode: true,
    peekTimers: {}, endFxSliderEdit() {}, showToast() {}, setPeek: (el, on) => toggled.push(on),
    clearTimeout() {}, fxPanelPinned: false
  });
  const src = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules/07-fx/07-bindings-shelf-immersive.js'), 'utf8');
  const start = src.indexOf('var fxPanelDismissed');
  const end = src.indexOf('function resetFx()');
  vm.runInContext(src.slice(start, end), ctx);

  handlers['fab:click']({ preventDefault() {} });
  assert.equal(classes.has('peek'), false, 'clicking the button while the console is open closes it');
  assert.equal(ctx.fxPanelDismissed, true, 'hover will not reopen it until the pointer leaves the button');

  classes.add('peek');
  handlers['doc:pointerdown']({ target: { id: 'inside', closest: (sel) => (sel === '#fx-panel' ? panel : null) } }, true);
  assert.equal(classes.has('peek'), true, 'clicking inside the console keeps it open');
  handlers['doc:pointerdown']({ target: ctx.renderer.domElement });
  assert.equal(classes.has('peek'), false, 'clicking the stage closes it');

  classes.add('peek'); ctx.fxPanelDismissed = false;
  handlers['root:mouseleave']();
  assert.equal(classes.has('peek'), false, 'leaving the window closes it');
  assert.equal(ctx.fxPanelDismissed, false, 'coming back over the button can open it again');
});
