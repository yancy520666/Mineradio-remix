'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,
  '../public/js/modules/01-scene/00-renderer-quality.js'), 'utf8').split('var renderer =')[0];
function quality(tier, width, height, dpr, lowSpec = false) {
  const c = { fx: { performanceQuality: tier }, innerWidth: width, innerHeight: height,
    window: { devicePixelRatio: dpr }, runtimeHardwareProfile: { lowSpec },
    normalizePerformanceQuality: value => value,
    THREE: { Scene: function () {}, PerspectiveCamera: function () {} } };
  vm.runInNewContext(source, c);
  return c;
}
test('ultra preserves native 4K resolution on all hardware up to the original 2x DPR', () => {
  for (const lowSpec of [false, true]) {
    const c = quality('ultra', 3840, 2160, 2, lowSpec);
    assert.equal(c.getRenderPixelRatio(), 2);
    assert.equal(c.getRenderPixelLoad(), 3840 * 2160 * 4);
    assert.equal(quality('ultra', 1280, 720, 3, lowSpec).getRenderPixelRatio(), 2);
    assert.equal(quality('ultra', 1280, 720, 1, lowSpec).getRenderPixelRatio(), 1);
  }
});
test('manual lower tiers retain useful pixel budgets without changing the chosen setting', () => {
  for (const tier of ['eco', 'balanced', 'high']) {
    const c = quality(tier, 3840, 2160, 2);
    // The anti-blur floor may spend up to 1.5x the budget on very large windows.
    assert(c.getRenderPixelLoad() <= c.renderQualityProfile().budget * 1.5 + 1);
    assert.equal(c.fx.performanceQuality, tier);
  }
});
