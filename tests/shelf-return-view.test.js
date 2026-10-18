'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture(centered) {
  const c = vm.createContext({ fx: { preset: 0 }, shelfReturnView: null, shelfPinnedOpen: false,
    orbit: { centerLocked: centered, userTheta: .2, userPhi: -.1, userRadius: 5.6, rotating: false },
    particles: { rotation: { x: 0, y: 0 } }, gestureRotation: { x: centered ? 0 : .3, y: centered ? 0 : -.5 },
    particleSpin: { vx: 0, vy: 0 }, particlePointerSpin: { active: false }, skullWheelZoomTarget: .15,
    panelViewRecenter: { active: false }, PANEL_VIEW_RECENTER_MIN_ANGLE: .035, performance: { now: () => 0 },
    clampRange: (v, a, b) => Math.min(b, Math.max(a, v)), clamp01: v => Math.min(1, Math.max(0, v)) });
  loadFunctions(c, 'public/js/modules/01-scene/03-focus-cinema-camera.js', ['rememberShelfReturnView', 'restoreShelfReturnView',
    'wrapViewAngle', 'rebaseViewRotationAxis', 'panelViewRotationAngle', 'startPanelViewRecenter', 'applyPanelViewRecenter']);
  return c;
}
for (const centered of [true, false]) test('shelf restores the ' + (centered ? 'centered' : 'custom') + ' orbit after wheel zoom and dragging', () => {
  const c = fixture(centered);
  c.rememberShelfReturnView();
  Object.assign(c.orbit, { centerLocked: false, userRadius: 2.4, userTheta: 1, userPhi: .7, rotating: true });
  c.gestureRotation.x = 1.2; c.gestureRotation.y = 1.8;
  c.particles.rotation.x = 1.2; c.particles.rotation.y = 1.8;
  c.skullWheelZoomTarget = -.9;
  c.particlePointerSpin.active = true; c.particleSpin.vx = 1;
  c.rememberShelfReturnView(); // Entering details must retain the original snapshot.
  assert.equal(c.restoreShelfReturnView(), true);
  assert.equal(c.orbit.centerLocked, centered);
  assert.equal(c.orbit.userRadius, 5.6);
  assert.equal(c.orbit.userTheta, .2); assert.equal(c.orbit.userPhi, -.1);
  assert.equal(c.orbit.rotating, false); assert.equal(c.particlePointerSpin.active, false);
  assert.equal(c.particleSpin.vx, 0); assert.equal(c.skullWheelZoomTarget, .15);
  c.applyPanelViewRecenter(c.panelViewRecenter.duration);
  assert(Math.abs(c.particles.rotation.x - (centered ? 0 : .3)) < 1e-9);
  assert(Math.abs(c.particles.rotation.y - (centered ? 0 : -.5)) < 1e-9);
  assert.equal(c.shelfReturnView, null);
  assert.equal(c.restoreShelfReturnView(), false);
});

test('switching presets discards the previous shelf return pose', () => {
  const c = fixture(true); c.rememberShelfReturnView();
  c.fx.preset = 1; c.orbit.userRadius = 7;
  assert.equal(c.restoreShelfReturnView(), false);
  assert.equal(c.orbit.userRadius, 7);
});

test('cancelling the delayed right-click open restores and releases its snapshot', () => {
  const c = fixture(false);
  Object.assign(c, { panelViewRecenterOpenTimer: 0, setTimeout: () => 1, clearTimeout() {} });
  loadFunctions(c, 'public/js/modules/01-scene/03-focus-cinema-camera.js', ['openPanelAfterViewRecenter', 'cancelPanelOpenAfterRecenter']);
  c.openPanelAfterViewRecenter('shelf-context', () => assert.fail('open was cancelled'));
  assert(c.shelfReturnView);
  assert.equal(c.cancelPanelOpenAfterRecenter(), true);
  assert.equal(c.shelfReturnView, null);
  assert.equal(c.gestureRotation.y, -.5);
  assert.equal(c.panelViewRecenterOpenTimer, 0);
});

test('returning to an already matching angle cancels an older unfinished recenter', () => {
  const c = fixture(false);
  c.particles.rotation.x = .3; c.particles.rotation.y = -.5;
  c.rememberShelfReturnView();
  Object.assign(c.panelViewRecenter, { active: true, start: 0, duration: 100, fromX: .3, fromY: -.5, toX: 0, toY: 0 });
  c.restoreShelfReturnView();
  assert.equal(c.panelViewRecenter.active, false);
  assert.equal(c.applyPanelViewRecenter(100), false);
  assert.equal(c.particles.rotation.y, -.5);
});

test('a shelf drag cannot trigger the left hover panel to replace the shelf', () => {
  const c = vm.createContext({ orbit: { rotating: true }, shelfPinnedOpen: true, immersiveMode: false, diyPlayerMode: false });
  loadFunctions(c, 'public/js/modules/10-shell/02-peek-panels-upload.js', ['setPeek']);
  const panel = { classList: { contains() { throw Error('hover must stop before opening'); } } };
  c.setPeek(panel, true, 'pl');
});

test('pointer exit hides previews but preserves a pinned shelf and its detail page', () => {
  for (const detail of [false, true]) {
    const c = vm.createContext({ shelfPinnedOpen: true, shelfVisibility: 1, shelfHoverCue: { target: 1, value: 1 },
      orbit: { rotating: true }, particlePointerSpin: { active: true },
      shelfManager: { getMode: () => 'side', hasOpenContent: () => detail, clearSelected() {} },
      updateShelfHoverCueFromPointer() {}, setShelfPinnedOpen() { throw Error('unexpected close'); },
      safeShelfCloseContent() { throw Error('unexpected detail close'); }, setFocusZone() { throw Error('unexpected focus exit'); } });
    loadFunctions(c, 'public/js/modules/04-shelf/00-layout-hover.js', ['clearShelfPreviewOnPointerExit']);
    c.clearShelfPreviewOnPointerExit({ type: 'blur' });
    assert.equal(c.shelfPinnedOpen, true); assert.equal(c.shelfVisibility, 1);
    assert.equal(c.orbit.rotating, false); assert.equal(c.particlePointerSpin.active, false);
  }
});
