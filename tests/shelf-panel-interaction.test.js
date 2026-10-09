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

test('lyrics beside the shelf keep a fixed gap to it whatever their width', () => {
  const ctx = threeContext();
  camera(ctx, 1400 / 653);
  loadFunctions(ctx, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['stageLyricShelfHalfWidthNdc', 'stageLyricShelfFit', 'stageLyricShelfProjectedCaption', 'clampStageLyricTargetForShelf']);
  vm.runInContext(`var STAGE_LYRIC_SHELF_EDGE_NDC_X = -0.08; var STAGE_LYRIC_SCREEN_LEFT_NDC_X = -0.96; var STAGE_LYRIC_SHELF_MIN_FIT = 0.6; var lyricShelfClampProbe = null; var lyricShelfClampRight = null; function clampRange(v, a, b) { return Math.min(b, Math.max(a, v)); }`, ctx);
  const edges = (x, w) => vm.runInContext(`(function () { var t = new THREE.Vector3(${x}, 0, 0); clampStageLyricTargetForShelf(t, ${w}); var half = stageLyricShelfHalfWidthNdc(t, ${w}); var c = t.clone().project(camera).x; return [c - half, c + half]; })()`, ctx);
  const rightEdgeNdc = (x, w) => edges(x, w)[1];
  const leftEdgeNdc = (x, w) => edges(x, w)[0];
  const shortEdge = rightEdgeNdc(-0.3, 1.5);
  const longEdge = rightEdgeNdc(-6, 4.2);
  assert(Math.abs(shortEdge + 0.08) < 0.02, 'short lyric ends just left of the shelf edge');
  assert(Math.abs(longEdge - shortEdge) < 0.1, 'a long lyric ends at about the same distance from the shelf');
  assert(leftEdgeNdc(-6, 4.2) >= -0.97, 'a long lyric stays on screen');
  assert(vm.runInContext('stageLyricShelfFit(new THREE.Vector3(0, 0, 0), 30)', ctx) >= 0.6, 'shrinking is limited');
  assert.equal(vm.runInContext('stageLyricShelfFit(new THREE.Vector3(0, 0, 0), 0.5)', ctx), 1, 'short lyrics are not shrunk');
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


test('shelf caption follows the focused card or song row and projects its tilted ink beside it', () => {
  const ctx = threeContext({ innerWidth: 1400 }); camera(ctx, 1400 / 800);
  loadFunctions(ctx, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['stageLyricShelfAnchor', 'stageLyricShelfHalfWidthNdc', 'stageLyricShelfProjectedCaption', 'clampStageLyricTargetForShelf']);
  vm.runInContext(`var STAGE_LYRIC_SHELF_EDGE_NDC_X=-0.08, STAGE_LYRIC_SCREEN_LEFT_NDC_X=-0.96;
    var lyricShelfClampProbe=null, lyricShelfClampRight=null;
    function clampRange(v,a,b){return Math.min(b,Math.max(a,v));}
    var card=new THREE.Mesh(new THREE.PlaneGeometry(2,1));card.position.set(1.2,-0.7,0);
    var row=new THREE.Mesh(new THREE.PlaneGeometry(3.5,.5));row.position.set(.1,.4,0);
    var detail=false, shelfManager={hasOpenContent:()=>detail,getCards:()=>[{index:0,mesh:card}],getCenterIdx:()=>0,
      getContentList:()=>({getRows:()=>[{index:0,mesh:row}],getCenterIdx:()=>0})};`,ctx);
  const verify = () => vm.runInContext(`(function(){
    var anchor=stageLyricShelfAnchor(), q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.06,-17*Math.PI/180,0,'YXZ'));
    var target=new THREE.Vector3(0,1,0), caption={h:.6,centerY:.3,centerZ:.1};
    clampStageLyricTargetForShelf(target,1.1,caption,q,anchor);
    var short=stageLyricShelfProjectedCaption(target,1.1,caption,q);
    clampStageLyricTargetForShelf(target,6,caption,q,anchor);
    var long=stageLyricShelfProjectedCaption(target,6,caption,q);
    return {anchor,short,long};
  })()`,ctx);
  const card=verify();vm.runInContext('detail=true',ctx);const row=verify();
  assert(row.anchor.left < card.anchor.left,'opening a wide list changes the actual exclusion boundary');
  assert(row.anchor.centerY > card.anchor.centerY,'the caption follows the new focused row centre');
  for(const result of [card,row]){
    assert(Math.abs(result.short.centerY-result.anchor.centerY)<.006,'caption centre aligns even when tilted');
    assert(Math.abs(result.short.right-result.anchor.left)<.012,'short caption stays beside the card');
    assert(result.long.right<=result.anchor.left+.115,'long caption overlap stays limited');
    assert(Math.abs(result.long.centerY-result.anchor.centerY)<.015,'long tilted caption stays vertically aligned');
  }
});
