'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

// A same-title search hit used to show 可切换 even when the account could not play it.
function fixture(answer) {
  const ctx = {
    controlSourceSwitcherState: { loading: true }, controlSourceProbeCache: {}, CONTROL_SOURCE_PROBE_TTL_MS: 90000,
    console: { warn() {} }, Date,
    playbackQualityTrackKey: (song, provider) => provider + ':' + song.id,
    resolveAlbumGaplessPlaybackData: async () => { if (answer instanceof Error) throw answer; return answer; },
    playbackRestrictionCategory: (song, data) => data.reason || 'url_unavailable',
  };
  vm.createContext(ctx);
  loadFunctions(ctx, 'public/js/modules/05-playback/07-search.js', ['createPlaybackMetadataCache', 'controlSourceMatchSong', 'controlSourceMatchIssue',
    'controlSourceIssueLabel', 'controlSourceProbeKey', 'controlSourceBlockedLabel', 'probeControlSourcePlayback', 'controlSourceOptionState']);
  ctx.controlSourceProbeCache = ctx.createPlaybackMetadataCache(90000);
  return ctx;
}
const qq = { key: 'qq', title: 'QQ音乐' };

test('a search match is only selectable once the platform returns a full playback url', async () => {
  const song = { id: 'm1', name: 'x' };
  const cases = [
    [{ url: 'https://a/b.flac' }, true, '可播放'],
    [{ url: 'https://a/t.mp3', trial: true }, true, '仅试听'],
    [{ reason: 'vip_required', message: '' }, false, '需会员'],
    [{ reason: 'copyright_unavailable' }, false, '无版权'],
    [{}, false, '无法播放'],
    [new Error('timeout'), true, '未确认'],
  ];
  for (const [answer, ready, status] of cases) {
    const ctx = fixture(answer);
    assert.deepEqual(ctx.controlSourceOptionState(qq, { song }, false).ready, false, 'unprobed match waits');
    const entry = { song, playback: await ctx.probeControlSourcePlayback(song, 'qq') };
    const state = ctx.controlSourceOptionState(qq, entry, false);
    assert.equal(state.ready, ready, status); assert.equal(state.status, status);
  }
  assert.equal(fixture({}).controlSourceOptionState(qq, { song: null, issue: 'no_source' }, false).ready, false);
});
