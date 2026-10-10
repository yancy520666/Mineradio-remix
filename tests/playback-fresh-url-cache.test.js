'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// A source-only override permits a safe old/new negative control. All I/O and
// provider requests below are mocks; no account, music server or device is used.
const root = process.env.MINERADIO_CACHE_TEST_SOURCE_ROOT || path.join(__dirname, '..');
const readSource = file => fs.readFileSync(path.join(root, file), 'utf8');
function loadFunctions(context, file, names) {
  const source = readSource(file);
  for (const name of names) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name + ' is missing');
    let depth = 0, end = source.indexOf('{', start);
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      if (source[end] === '}' && --depth === 0) break;
    }
    const declarationStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
    vm.runInContext(source.slice(declarationStart, end + 1), context, { filename: file });
  }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(setImmediate);

for (const [file, name, noCache] of [
  ['kugou-api.js', 'createKugouTtlCache', false],
  ['qishui-api.js', 'createTtlCache', 0],
]) {
  for (const rejected of [false, true]) test(file + ' targeted invalidation protects newer pending work after old ' + (rejected ? 'failure' : 'success'), async () => {
    const c = vm.createContext({ Map, Date, Promise });
    loadFunctions(c, file, [name]);
    const cache = c[name](4, 1000), oldGate = deferred(), newGate = deferred();
    cache.set('other-account:other-song', 'keep');
    const old = cache.wrap('current', 1000, () => oldGate.promise);
    const oldResult = rejected ? assert.rejects(old, /old failure/) : old;
    await tick();
    cache.delete('current');
    let newStarts = 0;
    const fresh = cache.wrap('current', 1000, () => { newStarts++; return newGate.promise; });
    await tick();
    if (rejected) oldGate.reject(new Error('old failure'));
    else oldGate.resolve('old');
    await oldResult;
    assert.equal(cache.get('current'), null, 'old success cannot refill the invalidated key');
    const shared = cache.wrap('current', noCache, () => { newStarts++; return 'wrong'; });
    assert.equal(newStarts, 1, 'old finally cannot release the new singleflight slot');
    newGate.resolve('new');
    assert.equal(await fresh, 'new');
    assert.equal(await shared, 'new');
    assert.equal(cache.get('current'), 'new');
    assert.equal(cache.get('other-account:other-song'), 'keep');
  });
}

function kugouFixture() {
  const calls = [];
  let gate = null;
  const c = vm.createContext({ Map, Date, Promise, console: { log() {} },
    KUGOU_PLAY_BUDGET_MS: 9000, KUGOU_PLAY_ATTEMPT_MS: 2500,
    extractKugouAuth: cookie => ({ userid: cookie || 'guest', playbackReady: false }),
    fetchKugouVipInfo: async () => null,
    normalizeKugouVipPayloadV2: () => ({ membershipKnown: true, isVip: true, isSvip: true, vipLevel: 'svip' }),
    kugouMembershipRights: () => ({ canPlayVipTracks: true, canPlayMusicPackageTracks: true, canPlaySvipTracks: true }),
    kugouPlaybackParamsRequireVip: params => params.vipRequired === true,
    resolveKugouAlbumAudioId: params => params.albumAudioId || '',
    normalizeQualityPreference: quality => quality || 'standard',
    kugouEffectiveQuality: quality => quality,
    kugouPlaybackCacheScope: auth => auth.userid,
    hashCandidatesFromSong: (song, quality) => [{ hash: song.FileHash, level: quality, label: quality }],
    attachKugouPlaybackStatus: (payload, cookie) => ({ ...payload, account: cookie || 'guest' }),
    kugouVerificationFromError: () => null,
  });
  c.kugouPlayViaH5 = async (hash, album, mix, cookie, quality) => {
    const call = { hash, cookie, quality, sequence: calls.length + 1 };
    calls.push(call);
    if (gate) { const pending = gate; gate = null; await pending.promise; }
    return { url: 'https://fixture.invalid/' + call.sequence + '.mp3', level: quality, source: 'web' };
  };
  for (const name of ['kugouPlayViaWeb', 'kugouPlayViaMobile', 'kugouPlayViaGateway']) c[name] = c.kugouPlayViaH5;
  loadFunctions(c, 'kugou-api.js', ['createKugouTtlCache', 'handleKugouSongUrl']);
  c.kugouSongUrlCache = c.createKugouTtlCache(240, 15 * 60 * 1000);
  return { c, calls, pause(pending) { gate = pending; } };
}
test('Kugou normal requests reuse URL metadata; a fresh request preserves quality and refreshes only its account/song key', async () => {
  const f = kugouFixture(), params = { hash: 'song', quality: 'lossless' };
  const first = await f.c.handleKugouSongUrl(params, 'A');
  const other = await f.c.handleKugouSongUrl(params, 'B');
  const lower = await f.c.handleKugouSongUrl({ ...params, quality: 'standard' }, 'A');
  assert.equal((await f.c.handleKugouSongUrl(params, 'A')).url, first.url);
  assert.equal(f.calls.length, 3);
  const fresh = await f.c.handleKugouSongUrl({ ...params, fresh: true }, 'A');
  assert.notEqual(fresh.url, first.url);
  assert.equal(fresh.level, 'lossless');
  assert.equal(fresh.account, 'A');
  assert.equal((await f.c.handleKugouSongUrl(params, 'B')).url, other.url);
  assert.equal((await f.c.handleKugouSongUrl({ ...params, quality: 'standard' }, 'A')).url, lower.url);
  assert.equal((await f.c.handleKugouSongUrl({ ...params, fresh: '1' }, 'A')).url, fresh.url, 'provider API requires a parsed boolean');
  assert.equal(f.calls.length, 4);
});
test('Kugou old direct URL resolution cannot repopulate a key invalidated by fresh recovery', async () => {
  const f = kugouFixture(), gate = deferred(), params = { hash: 'song', quality: 'lossless' };
  f.pause(gate);
  const old = f.c.handleKugouSongUrl(params, 'A');
  await tick();
  const fresh = await f.c.handleKugouSongUrl({ ...params, fresh: true }, 'A');
  gate.resolve();
  const stale = await old;
  assert.notEqual(stale.url, fresh.url, 'the old caller may settle with its own URL');
  assert.equal((await f.c.handleKugouSongUrl(params, 'A')).url, fresh.url);
  assert.equal(f.calls.length, 2);
});
test('Kugou fresh recovery retains membership and verification gates, and unavailable URLs are never cached', async () => {
  const f = kugouFixture(), params = { hash: 'song', fresh: true, vipRequired: true };
  f.c.kugouMembershipRights = () => ({ canPlayVipTracks: false, canPlayMusicPackageTracks: false, canPlaySvipTracks: false });
  const denied = await f.c.handleKugouSongUrl(params, 'A');
  assert.equal(denied.reason, 'login_required');
  assert.equal(f.calls.length, 0);
  f.c.kugouMembershipRights = () => ({ canPlayVipTracks: true, canPlaySvipTracks: true });
  let attempts = 0;
  f.c.kugouPlayViaH5 = async () => { attempts++; return { category: 'verification_required', restricted: true, message: 'challenge', verificationUrl: 'https://verify.kugou.com/fixture' }; };
  assert.equal((await f.c.handleKugouSongUrl(params, 'A')).reason, 'verification_required');
  assert.equal(attempts, 1, 'fresh cannot bypass the official challenge');
  assert.equal((await f.c.handleKugouSongUrl(params, 'A')).reason, 'verification_required');
  assert.equal(attempts, 2, 'a failed URL result is not retained');
});

function qishuiFixture() {
  const metadata = [], downloads = [];
  let gate = null;
  const c = vm.createContext({ Map, Date, Promise, URL,
    normalizeText: value => String(value || ''), normalizeQishuiCookieInput: value => value,
    qishuiCookieHasLogin: cookie => !!cookie, qishuiCookieFingerprint: cookie => cookie,
    qishuiUnavailable: (message, reason, extra) => ({ message, reason, ...extra }),
    requireQishuiPlaybackPayload: value => value,
    fetchQishuiPcTrackV2Post: async (id, cookie) => {
      const payload = { id, cookie, url: 'https://fixture.invalid/meta-' + (metadata.length + 1) + '.m4a' };
      metadata.push(payload);
      if (gate) { const pending = gate; gate = null; await pending.promise; }
      return payload;
    },
    qishuiSessionExpired: () => false,
    qishuiPlaybackMembershipFromPayload: () => ({ membershipKnown: true, isVip: true, isSvip: true, vipLevel: 'svip' }),
    qishuiTrackPlaybackRestriction: () => ({ requiredTier: 'free', evidence: [] }),
    qishuiHigherRequiredTier: () => 'free', qishuiRequiredTierAllowed: () => true,
    resolveQishuiDownloadInfo: async (id, payload, cookie, membership, quality) => {
      downloads.push({ id, cookie, quality });
      return { track: { duration: 200 }, best: { url: payload.url, duration: 200, format: 'm4a', quality, size: 5 } };
    },
    qishuiNormalizeDurationSeconds: Number, qishuiPlaybackLevel: quality => quality,
    qishuiUrlWithAuth: url => url, qishuiStreamRequiredTier: () => 'free', qishuiBitrateForUi: Number,
  });
  loadFunctions(c, 'qishui-api.js', ['createTtlCache', 'fetchQishuiPcTrackV2', 'qishuiPlaybackExtent', 'handleQishuiSongUrl']);
  c.qishuiTrackMetadataCache = c.createTtlCache(120, 20000);
  c.qishuiPlaybackCache = c.createTtlCache(120, 240000);
  c.qishuiPlaybackRequests = c.createTtlCache(120, 240000);
  return { c, metadata, downloads, pause(pending) { gate = pending; } };
}
test('Qishui fresh recovery refreshes metadata and playback URL together without evicting other accounts or qualities', async () => {
  const f = qishuiFixture(), params = { id: 'song', quality: 'lossless' };
  const first = await f.c.handleQishuiSongUrl(params, 'A');
  const other = await f.c.handleQishuiSongUrl(params, 'B');
  const lower = await f.c.handleQishuiSongUrl({ ...params, quality: 'standard' }, 'A');
  assert.equal((await f.c.handleQishuiSongUrl(params, 'A')).url, first.url);
  assert.equal(f.metadata.length, 2);
  assert.equal(f.downloads.length, 3);
  const fresh = await f.c.handleQishuiSongUrl({ ...params, fresh: true }, 'A');
  assert.notEqual(fresh.url, first.url);
  assert.equal(fresh.level, 'lossless');
  assert.equal(f.metadata.length, 3);
  assert.equal(f.downloads.length, 4);
  assert.equal((await f.c.handleQishuiSongUrl(params, 'B')).url, other.url);
  assert.equal((await f.c.handleQishuiSongUrl({ ...params, quality: 'standard' }, 'A')).url, lower.url);
  assert.equal(f.downloads.length, 4);
});
test('Qishui invalidated metadata caller cannot refill the refreshed metadata or playback URL', async () => {
  const f = qishuiFixture(), gate = deferred(), params = { id: 'song', quality: 'lossless' };
  f.pause(gate);
  const old = f.c.handleQishuiSongUrl(params, 'A');
  await tick();
  const fresh = await f.c.handleQishuiSongUrl({ ...params, fresh: true }, 'A');
  gate.resolve();
  await old;
  assert.equal((await f.c.handleQishuiSongUrl(params, 'A')).url, fresh.url);
  assert.equal((await f.c.fetchQishuiPcTrackV2('song', 'A')).url, fresh.url);
  assert.equal(f.metadata.length, 2);
});
test('Qishui fresh official-metadata failure evicts the old direct URL and prevents late metadata from creating a new stale downstream entry', async () => {
  const f = qishuiFixture(), gate = deferred(), params = { id: 'song', quality: 'lossless' };
  f.c.qishuiPlaybackCache.set('track-v2|A|svip|song|lossless|free', { url: 'retained-old' });
  f.c.qishuiPlaybackCache.set('track-v2|B|svip|song|lossless|free', { url: 'other-account' });
  f.c.qishuiPlaybackCache.set('track-v2|A|svip|song|standard|free', { url: 'other-quality' });
  f.c.qishuiPlaybackCache.set('track-v2|A|svip|another|lossless|free', { url: 'other-song' });
  f.pause(gate);
  const old = f.c.handleQishuiSongUrl(params, 'A');
  await tick();
  f.c.fetchQishuiPcTrackV2Post = async () => { throw new Error('POST unavailable'); };
  f.c.fetchQishuiPcTrackV2Get = async () => { throw new Error('GET unavailable'); };
  f.c.fetchQishuiPlaybackMembership = async () => ({ membershipKnown: true, isVip: true, isSvip: true });
  f.c.resolveQishuiSeoPlayback = async () => ({ url: 'new-seo', playable: true, trial: false });
  const fresh = await f.c.handleQishuiSongUrl({ ...params, fresh: true }, 'A');
  assert.equal(fresh.url, 'new-seo');
  gate.resolve();
  assert.equal((await old).reason, 'request_superseded');
  assert.equal(f.downloads.length, 0, 'old metadata cannot initiate a later download-info lookup');
  assert.equal(f.c.qishuiPlaybackCache.get('track-v2|A|svip|song|lossless|free'), null);
  assert.equal(f.c.qishuiPlaybackCache.get('track-v2|B|svip|song|lossless|free').url, 'other-account');
  assert.equal(f.c.qishuiPlaybackCache.get('track-v2|A|svip|song|standard|free').url, 'other-quality');
  assert.equal(f.c.qishuiPlaybackCache.get('track-v2|A|svip|another|lossless|free').url, 'other-song');
  assert.equal((await f.c.handleQishuiSongUrl(params, 'A')).url, 'new-seo');
  assert.equal(f.c.qishuiPlaybackRequests.get('A|song|lossless|free'), null, 'handler results have no retained scope entries');
  let starts = 0;
  await f.c.qishuiPlaybackRequests.wrap('A|song|lossless|free', 0, () => { starts++; return 'released'; });
  assert.equal(starts, 1, 'settled handlers release their pending owner');
});
test('Qishui old download-info completion cannot overwrite a newer fresh URL', async () => {
  const f = qishuiFixture(), gate = deferred(), params = { id: 'song', quality: 'lossless' };
  let starts = 0;
  f.c.resolveQishuiDownloadInfo = async (id, payload) => {
    starts++;
    if (starts === 1) await gate.promise;
    return { track: { duration: 200 }, best: { url: payload.url, duration: 200, quality: 'lossless' } };
  };
  const old = f.c.handleQishuiSongUrl(params, 'A');
  await tick();
  const fresh = await f.c.handleQishuiSongUrl({ ...params, fresh: true }, 'A');
  gate.resolve();
  const stale = await old;
  assert.notEqual(stale.url, fresh.url);
  assert.equal((await f.c.handleQishuiSongUrl(params, 'A')).url, fresh.url);
  assert.equal(starts, 2);
});
test('Qishui public fallback receives fresh recovery and invalidates only its SEO URL key', async () => {
  const f = qishuiFixture(), calls = [];
  f.c.fetchQishuiPcTrackV2 = async () => { throw new Error('official unavailable'); };
  f.c.fetchQishuiPlaybackMembership = async () => ({ membershipKnown: true, isVip: true, isSvip: true });
  f.c.resolveQishuiSeoPlayback = async (...args) => { calls.push(args); return { url: 'fallback', trial: false }; };
  await f.c.handleQishuiSongUrl({ id: 'song', quality: 'lossless', fresh: true }, 'A');
  assert.equal(calls[0][5].fresh, true);

  let fetched = 0;
  const c = vm.createContext({ Map, Date, Promise, URL, qishuiMembershipTier: () => 'svip', qishuiCookieFingerprint: value => value,
    fetchQishuiSeoTrack: async id => ({ seo_track: { track: { id, duration: 200 } }, track_player: { url_player_info: 'https://vod-luna.douyin.com/fixture' } }),
    fetchQishuiPlayerInfo: async () => ({ url: 'https://fixture.invalid/seo-' + (++fetched) + '.m4a', duration: 200 }),
    qishuiStreamAllowedForMembership: () => true, qishuiNormalizeDurationSeconds: Number, qishuiPlaybackLevel: () => 'lossless',
    qishuiUrlWithAuth: url => url, qishuiStreamRequiredTier: () => 'free', qishuiBitrateForUi: Number, normalizeText: String });
  loadFunctions(c, 'qishui-api.js', ['createTtlCache', 'resolveQishuiSeoPlayback']);
  c.qishuiPlaybackCache = c.createTtlCache(120, 240000);
  const first = await c.resolveQishuiSeoPlayback('song', 'A', {}, 'lossless', 14000);
  const other = await c.resolveQishuiSeoPlayback('song', 'B', {}, 'lossless', 14000);
  assert.equal((await c.resolveQishuiSeoPlayback('song', 'A', {}, 'lossless', 14000)).url, first.url);
  assert.notEqual((await c.resolveQishuiSeoPlayback('song', 'A', {}, 'lossless', 14000, { fresh: true })).url, first.url);
  assert.equal((await c.resolveQishuiSeoPlayback('song', 'B', {}, 'lossless', 14000)).url, other.url);
  assert.equal(fetched, 3);
});

test('renderer carries fresh only for a recovery request to cached providers and keeps selected quality', () => {
  const source = readSource('public/js/modules/05-playback/13-playback-start-audio.js');
  const start = source.indexOf('var qualityParam', source.indexOf("markPlayPhase('source-url')"));
  const statement = source.slice(start, source.indexOf('var data;', start));
  for (const provider of ['kugou', 'qishui', 'qq', 'netease']) for (const recovery of [false, true]) {
    const c = vm.createContext({ opts: { resumeRecovery: recovery }, requestedQuality: 'lossless', encodeURIComponent,
      isKugouPlayback: provider === 'kugou', isQishuiPlayback: provider === 'qishui' });
    vm.runInContext(statement, c);
    assert.equal(c.qualityParam, '&quality=lossless' + (recovery && ['kugou', 'qishui'].includes(provider) ? '&fresh=1' : ''));
  }
});
test('local URL routes strictly parse fresh=1 and preserve song/quality evidence', async () => {
  const source = readSource('server.js'), calls = [];
  for (const provider of ['kugou', 'qishui']) {
    const routeName = '/api/' + provider + '/song/url';
    const start = source.indexOf("  if (pn === '" + routeName + "') {");
    const end = source.indexOf('\n  if (pn === ', start + 1);
    const c = vm.createContext({ URL, res: {}, console: { error() {} }, kugouCookie: 'account-A', qishuiCookie: 'account-A',
      sendJSON() {}, handleKugouSongUrl: async (params, cookie) => calls.push({ params, cookie }),
      handleQishuiSongUrl: async (params, cookie) => calls.push({ params, cookie }) });
    vm.runInContext('async function route(url) { const pn = url.pathname; ' + source.slice(start, end) + ' }', c);
    for (const fresh of ['', '0', 'true', 'yes', '01', '1']) {
      await c.route(new URL('http://localhost' + routeName + '?id=song&quality=lossless&fresh=' + fresh));
      const last = calls.at(-1);
      assert.equal(last.params.fresh, fresh === '1');
      assert.equal(last.params.quality, 'lossless');
      assert.equal(last.params.id || last.params.hash, 'song');
      assert.equal(last.cookie, 'account-A');
    }
  }
});
