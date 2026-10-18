'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const fallbackPath = path.join(root, 'public/js/modules/05-playback/11-provider-fallback.js');
const fallbackText = fs.readFileSync(fallbackPath, 'utf8');

const qishuiSong = { provider: 'qishui', id: 'qs-1', name: '十年', artist: '陈奕迅', duration: 205 };
const trialData = { url: 'https://vod.invalid/clip', trial: true, source: 'qishui-seo', duration: 30, fullDuration: 205 };

function sandbox({ statuses, search, resolve, play }) {
  const calls = { search: [], resolve: [], play: [] };
  const notices = [];
  const ctx = {
    console, Promise, Date, Object, Array, Math, Number, String, setTimeout, clearTimeout,
    normalizePlaybackProvider: p => (['qq', 'kugou', 'qishui', 'spotify'].includes(p) ? p : 'netease'),
    songProviderKey: song => (song && song.provider) || 'netease',
    platformStatus: p => (statuses && statuses[p]) || { loggedIn: false },
    accountProviderOrder: () => ['netease', 'qq', 'kugou'],
    providerVipLevel: () => 'vip',
    queueItemKey: song => (song && song.provider || '') + ':' + (song && song.id || ''),
    hydrateCustomCover: song => song,
    sourceCandidateRejectReason: () => '',
    cloneSong: song => Object.assign({}, song),
    safeRenderQueuePanel() {}, safeShelfRebuild() {}, updateControlTrackInfo() {},
    showToast() {}, hideLoading() {}, forcePlaybackControlsInteractive() {},
    document: { getElementById() { return null; } },
    playQueue: [Object.assign({}, qishuiSong)],
    currentIdx: 0,
    trackSwitchToken: 1,
    miniQueueOpen: false,
    apiJson: async (url) => { calls.search.push(url); return search ? search(url) : { songs: [] }; },
    resolveAlbumGaplessPlaybackData: async (song) => { calls.resolve.push(song); return resolve ? resolve(song) : null; },
  };
  ctx.playQueueAt = async (idx, opts) => {
    calls.play.push({ idx, opts, song: ctx.playQueue[idx] });
    ctx.trackSwitchToken += 1;
    return play ? play(idx, opts, ctx) : true;
  };
  vm.runInNewContext(fallbackText, ctx, { filename: fallbackPath });
  ctx.showSourceFallbackNotice = (title, body, options) => notices.push({ title, body, options: options || {} });
  ctx.dismissSourceFallbackNotice = key => notices.push({ dismissed: key });
  return { ctx, calls, notices };
}

const neteaseLoggedIn = { netease: { loggedIn: true } };
const neteaseMatch = { songs: [{ provider: 'netease', id: 'ne-1', name: '十年', artist: '陈奕迅', duration: 205423 }] };

test('a Qishui preview is replaced by a matching full track from a signed-in platform', async () => {
  const { ctx, calls, notices } = sandbox({
    statuses: neteaseLoggedIn,
    search: () => neteaseMatch,
    resolve: () => ({ url: 'https://ne.invalid/full', trial: false, level: 'hires' }),
  });
  const result = await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, { resumeAt: 12 });
  assert.equal(result, true);
  assert.equal(calls.play.length, 1);
  assert.equal(calls.play[0].song.provider, 'netease');
  assert.equal(calls.play[0].song.autoFallbackFrom, 'qishui');
  assert.equal(calls.play[0].opts.fallbackDepth, 1);
  assert.equal(calls.play[0].opts.preResolvedPlaybackData.url, 'https://ne.invalid/full');
  assert.equal(calls.play[0].opts.resumeAt, 12, 'resume position carries over to the same recording');
  assert.equal(notices.at(-1).title, '已切换到完整版本');
});

test('no signed-in alternative, a different length or another preview keeps the Qishui preview', async () => {
  const none = sandbox({ statuses: {} });
  assert.equal(await none.ctx.tryQishuiTrialFullSourceUpgrade(none.ctx.playQueue[0], trialData, 0, 1, {}), null);
  assert.equal(none.calls.search.length, 0, 'no search without a usable platform');

  const longer = sandbox({
    statuses: neteaseLoggedIn,
    search: () => ({ songs: [{ provider: 'netease', id: 'live', name: '十年', artist: '陈奕迅', duration: 262000 }] }),
    resolve: () => ({ url: 'https://ne.invalid/live', trial: false }),
  });
  assert.equal(await longer.ctx.tryQishuiTrialFullSourceUpgrade(longer.ctx.playQueue[0], trialData, 0, 1, {}), null);
  assert.equal(longer.calls.resolve.length, 0, 'a different-length recording is not resolved');

  const preview = sandbox({ statuses: neteaseLoggedIn, search: () => neteaseMatch, resolve: () => ({ url: 'https://ne.invalid/clip', trial: true }) });
  assert.equal(await preview.ctx.tryQishuiTrialFullSourceUpgrade(preview.ctx.playQueue[0], trialData, 0, 1, {}), null);
  assert.equal(preview.calls.play.length, 0, 'another preview is not an upgrade');
});

test('full Qishui tracks, nested attempts and remembered misses do not search', async () => {
  const { ctx, calls } = sandbox({ statuses: neteaseLoggedIn, search: () => ({ songs: [] }) });
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], Object.assign({}, trialData, { trial: false }), 0, 1, {}), null);
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, { qishuiTrialUpgradeTried: true }), null);
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, { fallbackDepth: 1 }), null);
  assert.equal(calls.search.length, 0);
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, {}), null);
  assert.equal(calls.search.length, 1);
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, {}), null);
  assert.equal(calls.search.length, 1, 'a recent miss does not delay the same song again');
});

test('a candidate that fails to start falls back to the Qishui preview once', async () => {
  const { ctx, calls } = sandbox({
    statuses: neteaseLoggedIn,
    search: () => neteaseMatch,
    resolve: () => ({ url: 'https://ne.invalid/full', trial: false }),
    play: (idx, opts, c) => {
      if (opts.fallbackDepth === 1) { c.playQueue[idx] = opts.fallbackOriginalSong; return false; }
      return true;
    },
  });
  const result = await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, {});
  assert.equal(result, true);
  assert.equal(calls.play.length, 2);
  assert.equal(calls.play[1].song.provider, 'qishui');
  assert.equal(calls.play[1].opts.qishuiTrialUpgradeTried, true);
});

test('a user switching songs during the search stops the upgrade', async () => {
  let ctxRef;
  const { ctx, calls } = sandbox({
    statuses: neteaseLoggedIn,
    search: () => { ctxRef.trackSwitchToken += 1; return neteaseMatch; },
  });
  ctxRef = ctx;
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, {}), false);
  assert.equal(calls.resolve.length, 0);
  assert.equal(calls.play.length, 0);
  assert.equal(ctx.playQueue[0].provider, 'qishui');
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('a paid Qishui song starts the lookup in parallel and the trial path reuses it', async () => {
  let releaseSearch;
  const searchGate = new Promise(resolve => { releaseSearch = resolve; });
  const { ctx, calls } = sandbox({
    statuses: neteaseLoggedIn,
    search: async () => { await searchGate; return neteaseMatch; },
    resolve: () => ({ url: 'https://ne.invalid/full', trial: false }),
  });
  const paid = Object.assign({}, qishuiSong, { fee: 1 });
  ctx.playQueue[0] = paid;
  ctx.startQishuiFullSourcePrefetch(paid, {});
  assert.equal(calls.search.length, 1, 'search starts before the Qishui answer');
  ctx.startQishuiFullSourcePrefetch(paid, {});
  assert.equal(calls.search.length, 1, 'no duplicate prefetch for the same song');
  const upgrade = ctx.tryQishuiTrialFullSourceUpgrade(paid, trialData, 0, 1, {});
  releaseSearch();
  assert.equal(await upgrade, true);
  assert.equal(calls.search.length, 1, 'trial path reused the prefetched lookup');
  assert.equal(calls.play[0].song.provider, 'netease');
});

test('free or unknown-length Qishui songs and nested attempts do not prefetch', () => {
  const { ctx, calls } = sandbox({ statuses: neteaseLoggedIn, search: () => neteaseMatch });
  ctx.startQishuiFullSourcePrefetch(Object.assign({}, qishuiSong, { fee: 0 }), {});
  ctx.startQishuiFullSourcePrefetch(Object.assign({}, qishuiSong, { fee: 1, duration: 0 }), {});
  ctx.startQishuiFullSourcePrefetch(Object.assign({}, qishuiSong, { fee: 1 }), { fallbackDepth: 1 });
  assert.equal(calls.search.length, 0);
});

test('a matched song is remembered: the next play only refreshes the playback URL', async () => {
  const { ctx, calls } = sandbox({
    statuses: neteaseLoggedIn,
    search: () => neteaseMatch,
    resolve: () => ({ url: 'https://ne.invalid/full-' + calls.resolve.length, trial: false }),
  });
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, {}), true);
  ctx.playQueue[0] = Object.assign({}, qishuiSong);
  const entry = ctx.qishuiRememberedFullSource(ctx.playQueue[0]);
  assert.ok(entry && entry.provider === 'netease');
  const searches = calls.search.length;
  const result = await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], { trial: true, remembered: true, fullDuration: entry.expectedSec }, 0, ctx.trackSwitchToken, {});
  assert.equal(result, true);
  assert.equal(calls.search.length, searches, 'no new search');
  assert.equal(calls.play.at(-1).opts.preResolvedPlaybackData.url, 'https://ne.invalid/full-2', 'URL fetched fresh');
});

test('a remembered match whose URL is no longer full is forgotten and the normal path continues', async () => {
  let full = true;
  const { ctx } = sandbox({ statuses: neteaseLoggedIn, search: () => neteaseMatch, resolve: () => ({ url: 'https://ne.invalid/x', trial: !full }) });
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, {}), true);
  ctx.playQueue[0] = Object.assign({}, qishuiSong);
  full = false;
  const result = await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], { trial: true, remembered: true, fullDuration: 205 }, 0, ctx.trackSwitchToken, {});
  assert.equal(result, null);
  assert.equal(ctx.qishuiRememberedFullSource(ctx.playQueue[0]), null);
});

test('remembered studio audio is not reused for Live versions or changed durations', async () => {
  const { ctx, calls } = sandbox({ statuses: neteaseLoggedIn, search: () => neteaseMatch,
    resolve: () => ({ url: 'https://ne.invalid/studio', trial: false }) });
  const studio = Object.assign({}, qishuiSong);
  ctx.playQueue[0] = studio;
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(studio, trialData, 0, 1, {}), true);
  assert.ok(ctx.qishuiRememberedFullSource(studio), 'the original recording still reuses its match');
  const live = { ...studio, id: 'live', name: studio.name + ' (Live)', duration: 300 };
  assert.equal(ctx.qishuiRememberedFullSource(live), null);
  assert.equal(ctx.qishuiRememberedFullSource({ ...studio, duration: 300 }), null);
  assert.equal(ctx.qishuiRememberedFullSource({ ...studio, name: studio.name + ' (Live)' }), null, 'version suffix matters even with equal duration');
  ctx.playQueue[0] = live;
  const plays = calls.play.length;
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(live, { ...trialData, fullDuration: 300 }, 0, ctx.trackSwitchToken, {}), null);
  assert.equal(calls.play.length, plays, 'a mismatched cached recording cannot start');
  // Defend against a stale/corrupt candidate under an otherwise valid key.
  ctx.rememberQishuiFullSource(studio, { provider: 'netease', candidate: { ...neteaseMatch.songs[0], duration: 300000 } }, 205);
  assert.equal(ctx.qishuiRememberedFullSource(studio), null);
});

test('progress card appears only after a noticeable wait, updates in place and reports the result', async () => {
  const { ctx, notices } = sandbox({
    statuses: neteaseLoggedIn,
    search: async () => { await wait(50); return neteaseMatch; },
    resolve: () => ({ url: 'https://ne.invalid/full', trial: false }),
  });
  const token = ctx.trackSwitchToken;
  ctx.beginQishuiPlaybackProgress(ctx.playQueue[0], token, {});
  await wait(200);
  assert.equal(notices.length, 0, 'fast answers never flash a card');
  await wait(550);
  assert.equal(notices[0].title, '正在获取汽水音源');
  assert.equal(notices[0].options.persist, true);
  const key = notices[0].options.coalesceKey;
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, token, {}), true);
  const titles = notices.map(n => n.title);
  assert.deepEqual(titles, ['正在获取汽水音源', '正在查找完整版本', '正在切换到完整版本', '已切换到完整版本']);
  assert.ok(notices.every(n => n.options.coalesceKey === key), 'one card updated in place');
  assert.equal(notices.at(-1).options.persist, undefined, 'final message auto-hides');
});

test('a quick full Qishui answer dismisses nothing and shows nothing', async () => {
  const { ctx, notices } = sandbox({ statuses: neteaseLoggedIn });
  const token = ctx.trackSwitchToken;
  ctx.beginQishuiPlaybackProgress(ctx.playQueue[0], token, {});
  await wait(100);
  ctx.endQishuiPlaybackProgress(token);
  await wait(700);
  assert.equal(notices.length, 0);
});

test('startup autoplay never shows the progress card', async () => {
  const { ctx, notices } = sandbox({ statuses: neteaseLoggedIn });
  ctx.beginQishuiPlaybackProgress(ctx.playQueue[0], ctx.trackSwitchToken, { startupAutoplay: true });
  await wait(700);
  assert.equal(notices.length, 0);
});

test('an alternative with explicitly unknown source extent never announces a full-version switch', async () => {
  const { ctx, calls, notices } = sandbox({
    statuses: neteaseLoggedIn,
    search: () => neteaseMatch,
    resolve: () => ({ url: 'https://fixture.invalid/unknown', trial: null, trialKnown: false, duration: 205 }),
  });
  assert.equal(await ctx.tryQishuiTrialFullSourceUpgrade(ctx.playQueue[0], trialData, 0, 1, {}), null);
  assert.equal(calls.play.length, 0);
  assert.equal(notices.some(notice => notice.title === '已切换到完整版本'), false);
});
