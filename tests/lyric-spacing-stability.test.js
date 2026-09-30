'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const visual = 'public/js/modules/02-visual/';
const c = vm.createContext({
  fx: { lyricLineHeight: 1, lyricContextSpread: 1.96, lyricTranslationMode: 'off', lyricTranslationGap: 0.92, lyricTranslationScale: 0.78 },
  fxDefaults: { lyricContextSpread: 1.96, lyricTranslationGap: 0.92, lyricTranslationScale: 0.78 },
  STAGE_LYRIC_TRANSLATION_MODES: { off: 1, current: 1, dual: 1, multi: 1 },
  lyricsLines: [], lyricsTranslationLines: [],
  clampRange: (v, min, max) => Math.max(min, Math.min(max, v)),
  normalizeLyricTranslationText: text => String(text || ''),
});
loadFunctions(c, visual + '05-lyrics-fonts-texture.js', ['lyricLineHeightFactor']);
loadFunctions(c, visual + '13-lyrics-mesh-build.js', ['stableStageLyricRowMaskLayout']);
loadFunctions(c, visual + '08-lyrics-display-modes.js', [
  'normalizeLyricTranslationMode', 'lyricContextSpreadValue', 'lyricTranslationGapValue',
  'lyricTranslationScaleValue', 'lyricTranslationVisualGapValue', 'lyricTranslationLayoutActive',
  'lyricPrimarySlotStepValue',
  'lyricPrimaryVirtualIndex', 'lyricTranslationVirtualIndex',
]);
loadFunctions(c, visual + '12-lyrics-row-layers.js', ['lyricLayoutLineStepWorld', 'lyricTrackLineStepWorld', 'lyricTranslationLineStepWorld', 'lyricMeshLineStepWorld', 'lyricRowVirtualIndex', 'lyricTranslationAnchoredY']);
loadFunctions(c, visual + '14-stage-lyrics-rendering.js', ['stageLyricResidentDisplayedScrollOffset', 'primeStageLyricResidentRowTransform', 'alignStageLyricResidentEffectToRow']);
function near(actual, expected, message) { assert(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} vs ${expected}`); }

const initial = JSON.stringify(c.fx);
for (const invalid of [undefined, null, NaN, Infinity, -1, 0]) {
  near(c.lyricMeshLineStepWorld({ lineWorldStep: invalid }, false), c.lyricTrackLineStepWorld(), 'invalid stored spacing falls back to authored layout');
  near(c.lyricMeshLineStepWorld({ translationLineStepWorld: invalid }, true), c.lyricTranslationLineStepWorld(), 'invalid translation spacing falls back to authored layout');
}
for (const step of [0.18, 0.5, 1.06]) {
  near(c.lyricMeshLineStepWorld({ lineWorldStep: step }, false), step, 'stored spacing has no hard upper or lower clamp');
  const data = { lineWorldStep: step, rowLayers: [0, 1, 2].map(index => ({
    isPrimary: true, virtualIndex: index, mesh: { position: { y: -(index - 0.4) * step } }
  })) };
  near(c.stageLyricResidentDisplayedScrollOffset(data, 0), 0.4, 'resident rows recover the correct scroll phase at every supported spacing');
  const row = { isPrimary: true, lineIndex: 1, virtualIndex: 1, mesh: {
    position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    scale: { setScalar(value) { this.x = this.y = this.z = value; } }
  } };
  c.primeStageLyricResidentRowTransform(data, row, { targetLineIndex: 0, targetVirtualIndex: 0, scrollOffset: 0.4 });
  near(row.mesh.position.y, -0.6 * step, 'new resident rows join the same spacing and scroll phase');
}
const expected = 6.1 * 128 / 2048 * (1 + 0.96 * 0.32);
for (const width of [2048, 3072, 4096, 6144]) {
  for (const rasterScale of [0.5, 1, 2, 4]) {
    const mask = { width: width * rasterScale, height: 384 * rasterScale, lineHeight: 128 * rasterScale, rasterScale };
    near(c.lyricTrackLineStepWorld(mask, 6.1 * 384 / width), expected, 'texture size and clarity cannot change line spacing');
  }
}
assert.equal(JSON.stringify(c.fx), initial, 'layout must not mutate DIY settings');
for (const mode of ['off', 'current', 'dual', 'multi']) {
  c.fx.lyricTranslationMode = mode;
  for (const spread of [0.6, 1, 1.96, 2.4]) {
    c.fx.lyricContextSpread = spread;
    let previous = 0;
    for (let height = 0.72; height <= 1.80001; height += 0.02) {
      c.fx.lyricLineHeight = height;
      const step = c.lyricTrackLineStepWorld();
      assert(Number.isFinite(step) && step > previous, 'every valid line-height adjustment must increase spacing without a clamp plateau');
      previous = step;
      const base = 6.1 * 128 * height / 2048;
      near(step, base * (1 + (spread - 1) * 0.32) * (mode === 'off' ? 1 : 1.06), 'authored line spacing');
      near(c.lyricTranslationLineStepWorld(), base * (mode === 'off' ? 1 : 1.04), 'translation spacing is independent of context spread');
    }
  }
}
c.fx.lyricLineHeight = 1;
c.fx.lyricContextSpread = 1.96;
c.fx.lyricTranslationMode = 'multi';
const songs = [
  [{ text: '短句' }, { text: '长句'.repeat(100) }, { text: 'English '.repeat(80) }],
  [{ text: '有翻译', translation: 'translated' }, { text: '无翻译' }, { text: '又有翻译', translation: 'translated again' }],
  [{ text: '全翻译', translation: 'one' }, { text: '二', translation: 'two' }, { text: '三', translation: 'three' }],
];
for (const song of songs) {
  c.lyricsLines = song;
  const slot = c.lyricPrimarySlotStepValue();
  for (let i = 0; i < song.length; i++) {
    near(c.lyricPrimaryVirtualIndex(i + 1) - c.lyricPrimaryVirtualIndex(i), slot, 'mixed or missing translations must not compress primary gaps');
    near(c.lyricTranslationVirtualIndex(i) - c.lyricPrimaryVirtualIndex(i), c.lyricTranslationVisualGapValue(), 'translation follows its parent at a fixed gap');
  }
}
for (const gap of [0.28, 0.92, 2.2]) {
  c.fx.lyricTranslationGap = gap;
  const base = c.lyricTrackLineStepWorld();
  assert(Number.isFinite(base));
  near(c.lyricPrimaryVirtualIndex(2) - c.lyricPrimaryVirtualIndex(1), c.lyricPrimarySlotStepValue(), 'changing translation gap invalidates cached slots');
  assert(c.lyricTranslationVisualGapValue() < c.lyricPrimarySlotStepValue(), 'translation slot must stay before the next primary row');
}
c.fx.lyricTranslationMode = 'off';
for (let i = -2; i <= 5; i++) assert.equal(c.lyricPrimaryVirtualIndex(i), i);
console.log('[OK] DIY spacing stays stable across texture sizes, clarity, songs and mixed translations.');
