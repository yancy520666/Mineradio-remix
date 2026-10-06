'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,
  '../public/js/modules/04-shelf/00-layout-hover.js'), 'utf8').split('var shelfOpenAnimAt =')[0];

function setup({ maxTextureSize = 4096, maxAnisotropy = 16, innerHeight = 1400, pixelRatio = 1.5 } = {}) {
  const c = {
    fx: { performanceQuality: 'eco' }, normalizePerformanceQuality: value => value, innerHeight,
    renderer: { getPixelRatio: () => pixelRatio, capabilities: { maxTextureSize, getMaxAnisotropy: () => maxAnisotropy } }
  };
  vm.runInNewContext(source, c);
  let transform, disposals = 0;
  const canvas = { width: 720, height: 360,
    getContext: () => ({ setTransform: (...args) => { transform = args; } }) };
  const target = { canvas, drawKey: 'old-content',
    texture: { anisotropy: 1, dispose: () => { disposals++; } } };
  return { c, target, transform: () => transform, disposals: () => disposals };
}

test('on a large screen the tier caps density, preserves logical layout and releases storage only on change', () => {
  // 0.43 * 1400 * 1.5 = 903 device px wide -> wants 2x.
  const s = setup();
  const texture = s.target.texture, canvas = s.target.canvas;
  for (const [tier, scale, anisotropy] of [
    ['eco', 1, 1], ['balanced', 1, 2], ['high', 1.5, 4], ['ultra', 2, 8], ['eco', 1, 1]
  ]) {
    s.c.fx.performanceQuality = tier;
    s.c.syncShelfCanvasQuality(s.target, 720, 360, s.c.SHELF_TEXTURE_VIEWPORT.card);
    assert.equal(canvas.width, 720 * scale);
    assert.equal(canvas.height, 360 * scale);
    assert.deepEqual(s.transform(), [scale, 0, 0, scale, 0, 0]);
    assert.equal(s.target.texture.anisotropy, anisotropy);
    assert.equal(s.target.texture, texture);
    assert.equal(s.target.canvas, canvas);
    const disposals = s.disposals();
    s.target.drawKey = 'painted';
    assert.equal(s.c.syncShelfCanvasQuality(s.target, 720, 360, s.c.SHELF_TEXTURE_VIEWPORT.card), false);
    assert.equal(s.target.drawKey, 'painted');
    assert.equal(s.disposals(), disposals);
  }
  assert.equal(s.disposals(), 3);
});

test('small on-screen cards are not oversized while larger detail rows still gain density', () => {
  // 1600x900 window at 125%: cards ~413 px, already dense at 720 texels.
  const s = setup({ innerHeight: 900, pixelRatio: 1.25 });
  s.c.fx.performanceQuality = 'ultra';
  s.c.syncShelfCanvasQuality(s.target, 720, 360, s.c.SHELF_TEXTURE_VIEWPORT.card);
  assert.equal(s.target.canvas.width, 720);
  assert.equal(s.target.texture.anisotropy, 8);
  s.target.canvas.width = 800; s.target.canvas.height = 104;
  s.c.syncShelfCanvasQuality(s.target, 800, 104, s.c.SHELF_TEXTURE_VIEWPORT.row);
  assert.equal(s.target.canvas.width, 1600);
});

test('large shelf panels stay within GPU limits and sampling works without anisotropy support', () => {
  const s = setup({ maxTextureSize: 1024, maxAnisotropy: 0 });
  s.c.fx.performanceQuality = 'ultra';
  assert.equal(s.c.syncShelfCanvasQuality(s.target, 900, 1024, s.c.SHELF_TEXTURE_VIEWPORT.panel), true);
  assert.equal(s.target.canvas.width, 900);
  assert.equal(s.target.canvas.height, 1024);
  assert.equal(s.target.texture.anisotropy, 1);
  assert.equal(s.target.drawKey, '');
  assert.deepEqual(s.transform(), [1, 0, 0, 1, 0, 0]);
  assert.equal(s.disposals(), 1);
});
