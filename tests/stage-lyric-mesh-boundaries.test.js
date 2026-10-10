'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const visual = 'public/js/modules/02-visual/';

function maskContext() {
  const textures = [];
  const makeContext = () => ({
    font: '', scale() {}, clearRect() {}, save() {}, restore() {}, translate() {}, drawImage() {},
    measureText(text) { return { width: String(text).length * 70, actualBoundingBoxAscent: 100, actualBoundingBoxDescent: 24 }; },
  });
  const c = vm.createContext({ renderer: { domElement: { width: 1280 }, capabilities: { maxTextureSize: 4096 } },
    runtimeHardwareProfile: {}, lyricsLines: [],
    fx: { lyricDisplayMode: 'triple', lyricTranslationMode: 'off', lyricCustomLineCount: 3 },
    fxDefaults: { lyricContextOpacity: 0.58, lyricContextSpread: 1, lyricTranslationGap: 0.92,
      lyricTranslationScale: 0.78, lyricTranslationOpacity: 0.72, lyricCustomLineCount: 3 },
    clampRange: (value, min, max) => Math.max(min, Math.min(max, value)),
    document: { createElement() { return { width: 1, height: 1, getContext: makeContext }; } },
    THREE: { CanvasTexture: function (image) { this.image = image; this.disposeCount = 0; this.dispose = () => this.disposeCount++; textures.push(this); } },
    lyricEntryWeight: entry => entry && entry.weight || 700, lyricFontWeightValue: () => 700,
    lyricMeasureTextAtSize: (ctx, text, size) => String(text).length * size * 0.55,
    lyricFontCss: size => size + 'px Fixture', lyricLineHeightFactor: () => 1,
    lyricFillText() {}, applyStonePrintTexture() {}, configureLyricTextureSampling() {},
    applyLyricVerticalEdgeFade() {}, lyricEdgeFadeValue: () => 0,
    normalizeLyricTranslationText: value => String(value || '').trim(),
    playQueue: [], currentIdx: -1, lyricsTranslationLines: [], stageLyricTrackGeneration: 1,
  });
  for (const file of ['08-lyrics-display-modes.js', '09-lyrics-payloads.js', '10-lyrics-mask-textures.js']) {
    vm.runInContext(fs.readFileSync(visual + file, 'utf8'), c);
  }
  loadFunctions(c, visual + '12-lyrics-row-layers.js', ['lyricRowLogicalWorldWidth']);
  loadFunctions(c, visual + '14-stage-lyrics-rendering.js', ['lyricMeshTrackWindow', 'stageLyricTrackKeyForMode',
    'findStageLyricIndexAtTime', 'stageLyricContextEntry', 'lyricLineDisplayTextAt', 'makeStageLyricTranslationEntry',
    'applyLyricTranslationModeToTrackEntries', 'stageLyricTrackBaseEntry', 'buildStageLyricResidentPayload']);
  return { c, textures };
}

test('empty and long logical masks stay finite; compaction and runway preserve authored world dimensions', () => {
  const { c } = maskContext();
  c.lyricsLines = new Array(300);
  for (const text of ['', '正常歌词', 'W'.repeat(2000)]) {
    const full = c.makeLyricMask(text, { fontSize: 128, lineHeight: 128 });
    const runway = c.makeLyricMask(text, { fontSize: 128, lineHeight: 128, runwayPreview: true, plainPreview: true });
    const worldWidth = mask => c.lyricRowLogicalWorldWidth(mask, 6.1);
    const worldHeight = mask => worldWidth(mask) * (mask.logicalHeight || mask.height) / (mask.logicalWidth || mask.width);
    const initialWidth = worldWidth(full), initialHeight = worldHeight(full);
    assert.equal(worldWidth(runway), initialWidth);
    assert.equal(worldHeight(runway), initialHeight);
    const oldTexture = full.texture, oldCanvas = oldTexture.image;
    c.compactLyricLineMaskTexture(full);
    assert.equal(worldWidth(full), initialWidth);
    assert.equal(worldHeight(full), initialHeight);
    assert.equal(oldTexture.disposeCount, 1); assert.equal(oldCanvas.width, 1); assert.equal(oldCanvas.height, 1);
    for (const mask of [full, runway]) {
      for (const key of ['width', 'height', 'fontSize', 'fitScaleX', 'textMin', 'textMax']) assert(Number.isFinite(mask[key]), key);
      assert(mask.width > 0 && mask.height > 0 && mask.textMin <= mask.textMax);
    }
  }
});

test('quality targets respect original tier, texture dimensions and per-item byte budget', () => {
  const { c } = maskContext();
  const mask = c.makeLyricMask('W'.repeat(150), { fontSize: 128, lineHeight: 128 });
  c.compactLyricLineMaskTexture(mask);
  for (const lowSpec of [false, true]) for (const maxTextureSize of [2048, 4096, 8192]) for (const tier of [1, 2, 3, 4]) {
    c.runtimeHardwareProfile.lowSpec = lowSpec; c.renderer.capabilities.maxTextureSize = maxTextureSize;
    const target = c.lyricQualityTargetMetrics(mask, tier);
    if (tier === 1) { assert.equal(target, null); continue; }
    if (!target) continue;
    assert.equal(target.tier, tier);
    assert(target.width <= Math.min(6144, maxTextureSize) && target.height <= Math.min(6144, maxTextureSize));
    assert(target.bytes <= Math.min(64 * 1024 * 1024, c.lyricQualityPoolBudgetBytes(tier) * 0.55));
  }
});

test('all lightweight windows contain their requested line across display and translation modes', () => {
  const { c } = maskContext();
  c.lyricsLines = Array.from({ length: 311 }, (_, i) => ({ t: i * 2, text: 'Line ' + i, translation: i % 3 ? '译文 ' + i : '' }));
  for (const translation of ['off', 'current', 'dual', 'multi']) for (const mode of ['single', 'dual', 'triple', 'cinema', 'custom']) {
    c.fx.lyricTranslationMode = translation;
    for (let index = 0; index < c.lyricsLines.length; index++) {
      const window = c.lyricMeshTrackWindow(index, mode, { lightweightTrack: true });
      assert(window.start <= index && window.end >= index, `${mode}/${translation}/${index}`);
    }
  }
  assert.equal(c.findStageLyricIndexAtTime(-1), -1);
  assert.equal(c.findStageLyricIndexAtTime(2), 1);
  assert.equal(c.findStageLyricIndexAtTime(100000), 310);
  c.lyricsLines = []; assert.equal(c.findStageLyricIndexAtTime(0), -1);
  assert.equal(c.buildStageLyricResidentPayload(0, 0, 0), null);
});

test('cooperative cancellation is idempotent and rejects a stale finish before transferring resources', () => {
  const releases = [], c = vm.createContext({ disposeLyricMesh: mesh => releases.push(mesh) });
  loadFunctions(c, visual + '13-lyrics-mesh-build.js', ['disposeCooperativeLyricBuildMask', 'cancelCooperativeLyricMeshBuild', 'finishCooperativeLyricMeshBuild']);
  const texture = { userData: {}, dispose() { releases.push(this); } }, root = {};
  const state = { layoutMask: { texture }, rowBaseMask: { texture }, rowState: { root }, cancelled: false, finished: false };
  c.cancelCooperativeLyricMeshBuild(state); c.cancelCooperativeLyricMeshBuild(state);
  assert.equal(state.cancelled, true); assert.equal(state.rowState, null);
  assert.equal(c.finishCooperativeLyricMeshBuild(state), null);
  assert.deepEqual(releases, [texture, root]);
});
