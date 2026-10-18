'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../public/vendor/three.r128.min.js');
const { loadFunctions } = require('./helpers/classic-functions');

const file = 'public/js/modules/02-visual/14-stage-lyrics-rendering.js';
const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function context(extra) {
  const ctx = vm.createContext(Object.assign({ THREE, innerWidth: 1280, innerHeight: 720, stageLyrics: {}, fx: {}, clampRange: clamp,
    durationEaseFactor: (seconds, dt) => clamp(1 - Math.exp(-dt / Math.max(0.016, seconds)), 0.001, 1), BASE_FOV: 45 }, extra));
  vm.runInContext(source.slice(source.indexOf('var STAGE_LYRIC_SHELF_EDGE_NDC_X'), source.indexOf('function lyricShelfActiveCamera')), ctx);
  vm.runInContext(source.slice(source.indexOf('var STAGE_LYRIC_SHELF_FLIP_SECONDS'), source.indexOf('var lyricShelfFlipDepthDir = null;')), ctx);
  loadFunctions(ctx, file, ['lyricShelfActiveCamera', 'stageLyricShelfFlipEase', 'stageLyricShelfFlipSeconds', 'stageLyricStableShelfAnchor',
    'stageLyricShelfIntendedFocus', 'stageLyricShelfReferenceCamera', 'stageLyricShelfSourcePose']);
  return ctx;
}

test('the shelf anchor is the measurement, held exactly while the shelf keeps still, and eased when it changes', () => {
  let measured = { left: -0.2, centerY: 0.05 };
  const ctx = context({ stageLyricShelfAnchor: () => (measured ? { left: measured.left, centerY: measured.centerY } : null) });
  const first = ctx.stageLyricStableShelfAnchor(1 / 60);
  assert.equal(first.left, -0.2, 'a fresh engagement starts on the measurement, with nothing to ease from');
  for (let i = 0; i < 120; i++) ctx.stageLyricStableShelfAnchor(1 / 60);
  assert.equal(ctx.stageLyricStableShelfAnchor(1 / 60).left, -0.2, 'no drift while the shelf is still');
  measured = { left: 0.3, centerY: 0.05 }; // a wide detail list takes over
  const step = ctx.stageLyricStableShelfAnchor(1 / 60).left;
  assert(step > -0.2 && step < 0.3, 'the new boundary is eased into, not jumped to');
  for (let i = 0; i < 120; i++) ctx.stageLyricStableShelfAnchor(1 / 60);
  assert(Math.abs(ctx.stageLyricStableShelfAnchor(1 / 60).left - 0.3) < 0.001);
  measured = null; // rows still loading: keep the last boundary
  assert(Math.abs(ctx.stageLyricStableShelfAnchor(1 / 60).left - 0.3) < 0.001);
});

test('歌词左右 / 歌词上下 move where the lyrics stop beside the shelf, within the screen', () => {
  const ctx = context({ stageLyricShelfAnchor: () => ({ left: -0.3, centerY: 0 }) });
  ctx.fx.lyricShelfOffsetX = 0.2; ctx.fx.lyricShelfOffsetY = -0.15;
  const moved = ctx.stageLyricStableShelfAnchor(1 / 60);
  assert(Math.abs(moved.left - -0.1) < 1e-9 && Math.abs(moved.centerY - -0.15) < 1e-9);
  ctx.stageLyrics.shelfAnchorState = null; ctx.fx.lyricShelfOffsetX = 9; ctx.fx.lyricShelfOffsetY = -9;
  const clamped = ctx.stageLyricStableShelfAnchor(1 / 60);
  assert(clamped.left <= 0.9 && clamped.centerY >= -0.9, 'out-of-range values cannot push the lyrics off screen');
});

test('the flip runs on the shelf\'s own S-curve and for as long as the shelf takes to appear or leave', () => {
  const ctx = context({});
  assert.equal(ctx.stageLyricShelfFlipEase(0), 0);
  assert.equal(ctx.stageLyricShelfFlipEase(1), 1);
  assert.equal(ctx.stageLyricShelfFlipEase(0.5), 0.5);
  assert(ctx.stageLyricShelfFlipEase(0.1) < 0.03 && ctx.stageLyricShelfFlipEase(0.9) > 0.97, 'gentle start and landing');
  assert.equal(ctx.stageLyricShelfFlipSeconds(true), 0.62, 'without shelf settings it keeps the default length');
  ctx.shelfSummonSettings = () => ({ openDuration: 0.91, closeDuration: 0.46 });
  assert.equal(ctx.stageLyricShelfFlipSeconds(true), 0.91);
  assert.equal(ctx.stageLyricShelfFlipSeconds(false), 0.46);
  ctx.shelfSummonSettings = () => ({ openDuration: 0.01, closeDuration: 9 });
  assert.equal(ctx.stageLyricShelfFlipSeconds(true), 0.2, 'a near-instant shelf still gets a visible turn');
  assert.equal(ctx.stageLyricShelfFlipSeconds(false), 1.2);
});

test('an open detail list lets the lyrics reach into its left margin', () => {
  let detail = false;
  const ctx = context({ stageLyricShelfAnchor: () => ({ left: -0.5, centerY: 0 }), shelfManager: { hasOpenContent: () => detail } });
  assert.equal(ctx.stageLyricStableShelfAnchor(1 / 60).left, -0.5);
  ctx.stageLyrics.shelfAnchorState = null; detail = true;
  assert(Math.abs(ctx.stageLyricStableShelfAnchor(1 / 60).left - -0.38) < 1e-9, 'the stopping line moves into the list by the allowed overlap');
});

function referenceFixture() {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const orbit = { focus: { active: false, type: null } };
  const ctx = context({ camera, orbit, shelfManager: { getMode: () => 'side' },
    shelfFocusPose: type => (type === 'shelf-detail'
      ? { theta: 0.34, phi: -0.06, radius: 4.86, x: 1.74, y: 0.02, z: 0.82 }
      : { theta: 0.42, phi: -0.12, radius: 4.2, x: 2.32, y: -0.1, z: 0.72 }) });
  // The camera starts or ends a shelf focus; the lyrics read it from the camera's own focus state.
  return { ctx, camera, focus: (type) => { orbit.focus.active = !!type; orbit.focus.type = type || null; } };
}
const refPosition = ctx => ctx.lyricShelfRefCam.position.clone();

test('the lyrics measure the shelf from the view the camera settles on, not from the glide towards it', () => {
  const { ctx, camera, focus } = referenceFixture();
  focus('shelf-side');
  ctx.stageLyricShelfReferenceCamera(1 / 60, true, true);
  const settled = refPosition(ctx);
  assert(settled.distanceTo(camera.position) > 1, 'the settled view is not where the camera is now');
  for (let i = 0; i < 40; i++) { // the live camera glides in; the reference does not follow it
    camera.position.lerp(new THREE.Vector3(4, -0.6, 4.5), 0.16); camera.lookAt(2.3, -0.1, 0.7); camera.updateMatrixWorld(true);
    ctx.stageLyricShelfReferenceCamera(1 / 60, false, true);
  }
  assert(refPosition(ctx).distanceTo(settled) < 1e-9, 'a camera glide cannot move the lyrics');
});

test('the reference follows the live camera while no shelf focus is coming', () => {
  const { ctx, camera } = referenceFixture();
  ctx.stageLyricShelfReferenceCamera(1 / 60, true, true);
  camera.position.set(1, 1, 5); camera.updateMatrixWorld(true);
  ctx.stageLyricShelfReferenceCamera(1 / 60, false, true);
  assert(refPosition(ctx).distanceTo(camera.position) < 1e-9, 'a hover preview does not move the camera, so the live view is the right one');
});

test('closing keeps the settled view the lyrics are leaving along, then a new engagement starts from the live camera', () => {
  const { ctx, camera, focus } = referenceFixture();
  focus('shelf-side');
  ctx.stageLyricShelfReferenceCamera(1 / 60, true, true);
  const settled = refPosition(ctx);
  focus(null); // closing: the camera glides home while the lyrics fly back
  camera.position.set(0, 0, 6); camera.updateMatrixWorld(true);
  for (let i = 0; i < 30; i++) ctx.stageLyricShelfReferenceCamera(1 / 60, false, false);
  assert(refPosition(ctx).distanceTo(settled) < 1e-9, 'the way back does not swerve with the camera');
  ctx.stageLyricShelfReferenceCamera(1 / 60, true, true);
  assert(refPosition(ctx).distanceTo(camera.position) < 1e-9, 'the next engagement snaps to the live view while the lyrics are still at rest');
});

test('opening a detail list under lyrics already beside the shelf eases the reference instead of jumping', () => {
  const { ctx, focus } = referenceFixture();
  focus('shelf-side');
  ctx.stageLyricShelfReferenceCamera(1 / 60, true, true);
  const side = refPosition(ctx);
  focus('shelf-detail');
  ctx.stageLyricShelfReferenceCamera(1 / 60, false, true);
  const oneFrame = refPosition(ctx).distanceTo(side);
  assert(oneFrame > 0 && oneFrame < 0.4, 'a small step on the first frame, not a jump');
  for (let i = 0; i < 90; i++) ctx.stageLyricShelfReferenceCamera(1 / 60, false, true);
  const detailPose = refPosition(ctx);
  assert(detailPose.distanceTo(side) > 0.3, 'and it does arrive at the detail view');
  for (let i = 0; i < 20; i++) ctx.stageLyricShelfReferenceCamera(1 / 60, false, true);
  assert(refPosition(ctx).distanceTo(detailPose) < 1e-3, 'then holds still');
});

test('dragged lyrics leave from where they are and the recentring cover underneath cannot pull them through the middle', () => {
  const ctx = context({});
  const from = { pos: new THREE.Vector3(1, 2, 3), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 1.2, 0)), ready: true };
  ctx.stageLyrics.shelfFrom = from;
  const rest = () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
  let r = rest(); ctx.stageLyricShelfSourcePose(r.pos, r.quat, 0);
  assert(r.pos.distanceTo(from.pos) < 1e-9 && r.quat.angleTo(from.quat) < 1e-9, 'while opening, the start is the dragged pose');
  r = rest(); ctx.stageLyricShelfSourcePose(r.pos, r.quat, 0.5);
  assert(Math.abs(r.pos.x - 0.5) < 1e-9 && Math.abs(r.quat.angleTo(from.quat) - from.quat.angleTo(new THREE.Quaternion()) / 2) < 1e-6, 'closing hands the start over to the live resting pose');
  r = rest(); ctx.stageLyricShelfSourcePose(r.pos, r.quat, 1);
  assert(r.pos.length() === 0 && r.quat.angleTo(new THREE.Quaternion()) < 1e-9, 'fully handed over');
  from.ready = false; r = rest(); ctx.stageLyricShelfSourcePose(r.pos, r.quat, 0);
  assert(r.pos.length() === 0, 'with nothing remembered the resting pose stands');
});
