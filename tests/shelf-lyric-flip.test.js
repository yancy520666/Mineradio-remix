'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

const file = 'public/js/modules/02-visual/14-stage-lyrics-rendering.js';
const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function context(extra) {
  const ctx = vm.createContext(Object.assign({ innerWidth: 1280, innerHeight: 720, stageLyrics: {},
    clampRange: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) }, extra));
  vm.runInContext(source.slice(source.indexOf('var STAGE_LYRIC_SHELF_FLIP_SECONDS'), source.indexOf('var lyricShelfFlipTarget = null;')), ctx);
  loadFunctions(ctx, file, ['stageLyricShelfFlipEase', 'stageLyricStableShelfAnchor']);
  return ctx;
}

test('the shelf edge is measured while the shelf settles, then held so scrolling cannot push the lyrics', () => {
  let left = -0.2;
  const ctx = context({ stageLyricShelfAnchor: () => ({ left, centerY: 0 }) });
  for (let i = 0; i < 60; i++) ctx.stageLyricStableShelfAnchor(false, 1 / 60);
  const settled = ctx.stageLyricStableShelfAnchor(false, 1 / 60).left;
  assert(Math.abs(settled + 0.2) < 0.001);
  left = 0.3; // the user scrolls to a card further right
  for (let i = 0; i < 60; i++) ctx.stageLyricStableShelfAnchor(false, 1 / 60);
  assert.equal(ctx.stageLyricStableShelfAnchor(false, 1 / 60).left, settled, 'held after settling');
  assert(ctx.stageLyricStableShelfAnchor(true, 1 / 60).left > settled, 'opening a detail list measures again');
});

test('the flip runs on an ease-in-out curve that starts and ends at rest', () => {
  const ctx = context({});
  assert.equal(ctx.stageLyricShelfFlipEase(0), 0);
  assert.equal(ctx.stageLyricShelfFlipEase(1), 1);
  assert.equal(ctx.stageLyricShelfFlipEase(0.5), 0.5);
  assert(ctx.stageLyricShelfFlipEase(0.1) < 0.01 && ctx.stageLyricShelfFlipEase(0.9) > 0.99, 'gentle start and landing');
});
