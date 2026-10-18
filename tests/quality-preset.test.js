'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadFunctions } = require('./helpers/classic-functions');

test('default quality settings retain their controls without a footer explanation', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../public/css/index.css'), 'utf8');
  const panel = html.slice(html.indexOf('id="playback-quality-preset-panel"'), html.indexOf('<div class="fx-section-label">输出接口</div>'));
  assert.match(panel, /id="quality-preset-providers"/);
  assert.deepEqual(Array.from(panel.matchAll(/data-quality-preset="([^"]+)"/g), match => match[1]), ['saver', 'balanced', 'lossless', 'best']);
  assert.doesNotMatch(panel, /quality-preset-note|新歌按这里的档位请求|汽水音频需整首下载解密/);
  assert.doesNotMatch(css, /quality-preset-note/);
});

function fixture({ svip = false, provider = 'qq', reloadable = false } = {}) {
  const prefs = { netease: 'hires', qq: 'lossless', kugou: 'lossless' };
  const calls = { applied: [], toasts: [] };
  const ctx = {
    prefs, calls, loginStatus: {}, playQueue: [{ id: 1 }], currentIdx: 0,
    QUALITY_PRESET_PROVIDERS: [{ key: 'netease', title: '网易云' }, { key: 'qq', title: 'QQ 音乐' }, { key: 'kugou', title: '酷狗' }],
    QUALITY_PRESET_NAMES: { saver: '省流', balanced: '均衡', lossless: '无损', best: '最高' },
    hasProviderSvip: () => svip,
    normalizePlaybackProvider: p => p, normalizePlaybackQuality: q => q, normalizePlaybackQualityForProvider: q => q,
    getProviderPlaybackQuality: p => prefs[p],
    setProviderPlaybackQuality: (p, q) => { prefs[p] = q; },
    currentPlaybackQualityProvider: () => provider,
    updatePlaybackQualityUi() {}, canReloadCurrentTrackForQuality: () => reloadable,
    effectivePlaybackQualityForSong: (song, p, q) => q,
    applyPlaybackQualityToCurrentTrack: (q, p) => calls.applied.push(p + ':' + q),
    showToast: text => calls.toasts.push(text), playbackQualityLabel: q => q,
  };
  vm.createContext(ctx);
  loadFunctions(ctx, 'public/js/modules/05-playback/00-api-quality-output.js', ['qualityPresetTarget', 'activeQualityPreset',
    'applyQualityPresetChanges', 'setQualityPreset', 'setProviderQualityPreset']);
  return ctx;
}

test('one-tap presets set every tiered platform and are recognised afterwards', () => {
  const ctx = fixture();
  assert.equal(ctx.activeQualityPreset(), '');
  ctx.setQualityPreset('lossless');
  assert.deepEqual({ ...ctx.prefs }, { netease: 'lossless', qq: 'lossless', kugou: 'lossless' });
  assert.equal(ctx.activeQualityPreset(), 'lossless');
  ctx.setQualityPreset('best');
  assert.deepEqual({ ...ctx.prefs }, { netease: 'hires', qq: 'hires', kugou: 'hires' }, 'no SVIP: NetEase tops out at Hi-Res');
  assert.equal(ctx.activeQualityPreset(), 'best');
  const svip = fixture({ svip: true });
  svip.setQualityPreset('best');
  assert.equal(svip.prefs.netease, 'jymaster');
});

test('only the playing platform reloads; master tier stays locked without SVIP', () => {
  const ctx = fixture({ provider: 'qq', reloadable: true });
  ctx.setProviderQualityPreset('kugou', 'standard');
  assert.deepEqual(ctx.calls.applied, []); assert.match(ctx.calls.toasts.at(-1), /下次播放生效/);
  ctx.setProviderQualityPreset('qq', 'exhigh');
  assert.deepEqual(ctx.calls.applied, ['qq:exhigh']);
  ctx.setProviderQualityPreset('netease', 'jymaster');
  assert.equal(ctx.prefs.netease, 'hires'); assert.match(ctx.calls.toasts.at(-1), /SVIP/);
});
