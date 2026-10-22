'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const textures = 'public/js/modules/02-visual/10-lyrics-mask-textures.js';
function fixture() {
  const c = vm.createContext({ renderer: { domElement: { width: 1280 }, capabilities: { maxTextureSize: 4096 } },
    runtimeHardwareProfile: {}, clampRange: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) });
  loadFunctions(c, textures, ['lyricQualityPoolBudgetBytes', 'lyricQualityVisibleRowSlots', 'lyricQualityCropRect', 'lyricQualityTargetMetrics']);
  return c;
}
function mask(textWidth = 128) {
  return { width: 1280, height: 240, rasterScale: 0.625, fontSize: 80,
    logicalWidth: 2048, logicalHeight: 384, logicalFontSize: 128, logicalLineY0: 238,
    logicalTextWidth: textWidth, lines: ['fixture'], inkBounds: { top: -62, bottom: 46 } };
}
test('all four tiers redraw logical glyphs rather than magnifying the compact runway', () => {
  const c = fixture(), m = mask(), targets = [1, 2, 3, 4].map(tier => c.lyricQualityTargetMetrics(m, tier));
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    assert.equal(t.logicalWidth, m.logicalWidth); assert.equal(t.logicalHeight, m.logicalHeight);
    assert(t.crop.width < m.logicalWidth / 4 && t.crop.height < m.logicalHeight);
    assert(t.scale * m.logicalFontSize > m.fontSize, 'low tier also improves the visible glyph raster');
    assert(t.bytes < c.lyricQualityPoolBudgetBytes(i + 1));
    if (i) assert(t.width > targets[i - 1].width && t.height > targets[i - 1].height);
  }
  assert(targets[3].bytes < 6 * 1024 * 1024, 'short lyrics must not reserve a full-width extreme texture');
});
test('window-size quantization is stable and high-density screens receive more detail', () => {
  const c = fixture(), m = mask(), normal = c.lyricQualityTargetMetrics(m, 2);
  c.renderer.domElement.width = 1281;
  assert.equal(c.lyricQualityTargetMetrics(m, 2).width, normal.width);
  c.renderer.domElement.width = 2560;
  assert(c.lyricQualityTargetMetrics(m, 2).width > normal.width);
});

test('multi-line bilingual windows reserve selected-tier rasters for every visible row within the same pool', () => {
  const c = fixture(); c.fx = { lyricDisplayMode: 'custom', lyricTranslationMode: 'multi', lyricContextHighQuality: true };
  c.lyricDisplayLineCountForMode = () => 10; c.lyricTextureClarityScale = () => 4;
  loadFunctions(c, textures, ['lyricQualityMaxResidentRows']);
  for (const profile of [{}, { lowSpec: true }, { balancedSpec: true }]) {
    c.runtimeHardwareProfile = profile;
    for (const count of [3, 5, 10]) for (const tier of [2, 3, 4]) {
      c.lyricDisplayLineCountForMode = () => count;
      const m = mask(5900); m.logicalWidth = 6144;
      const t = c.lyricQualityTargetMetrics(m, tier);
      assert(t.bytes * count * 2 <= c.lyricQualityPoolBudgetBytes(tier) * 0.90);
      assert(c.lyricQualityMaxResidentRows() >= count * 2);
      const previous = c.lyricQualityTargetMetrics(m, tier - 1);
      assert(t.width >= previous.width && t.height >= previous.height, 'higher controls cannot reduce current glyph detail');
    }
  }
  c.fx.lyricContextHighQuality = false;
  assert.equal(c.lyricQualityVisibleRowSlots(), 2);
  c.fx.lyricContextHighQuality = true;
  assert.equal(c.lyricQualityVisibleRowSlots(), 20);
});
test('eco mode budgets the selected tier without silently changing the second control to the first', () => {
  const c = fixture(); c.fx = { lyricTextureClarity: 2 };
  c.normalizeLyricTextureClarity = value => value;
  c.performanceDetailProfile = () => ({ quality: 'eco' });
  loadFunctions(c, textures, ['lyricTextureClarityScale']);
  assert.equal(c.lyricTextureClarityScale(), 2);
  assert(c.lyricQualityPoolBudgetBytes(2) < 32 * 1024 * 1024);
});
test('all profiles and tiers obey per-item, pool and GPU dimension bounds for long lines', () => {
  const c = fixture();
  for (const profile of [{}, { lowSpec: true }, { balancedSpec: true }]) {
    c.runtimeHardwareProfile = profile;
    for (const maxTextureSize of [1024, 2048, 4096]) for (const tier of [1, 2, 3, 4]) {
      c.renderer.capabilities.maxTextureSize = maxTextureSize; c.renderer.domElement.width = 7680;
      const m = mask(5900); m.logicalWidth = 6144;
      const t = c.lyricQualityTargetMetrics(m, tier);
      assert(t.width <= maxTextureSize && t.height <= maxTextureSize);
      assert(t.bytes <= Math.min(32 * 1024 * 1024, c.lyricQualityPoolBudgetBytes(tier) * 0.45), JSON.stringify({profile,maxTextureSize,tier,t,budget:c.lyricQualityPoolBudgetBytes(tier)*.45}));
      assert(t.bytes >= t.width * t.height * 8, 'account for both CPU and GPU copies');
    }
  }
});
test('multi-line masks retain their entire frame and crop-map restoration resets UV coordinates', () => {
  const c = fixture(), m = mask(); m.lines = ['one', 'two'];
  const t = c.lyricQualityTargetMetrics(m, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(t.crop)), { x: 0, y: 0, width: 2048, height: 384 });
  loadFunctions(c, 'public/js/modules/02-visual/12-lyrics-row-layers.js', ['setLyricRowTextureMap']);
  const rect = { set(...values) { this.values = values; } }, row = { mat: { uniforms: { uMap: {}, uMapUvRect: { value: rect } } } };
  const cropped = { userData: { lyricUvRect: [0.2, 0.3, 0.4, 0.5] } };
  c.setLyricRowTextureMap(row, cropped); assert.equal(row.mat.uniforms.uMap.value, cropped);
  assert.deepEqual(rect.values, [0.2, 0.3, 0.4, 0.5]);
  c.setLyricRowTextureMap(row, {}); assert.deepEqual(rect.values, [0, 0, 1, 1]);
});
