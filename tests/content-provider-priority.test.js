'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../public/js/modules', file), 'utf8');
function namedFunction(file, name) {
  const source = read(file), start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert(start >= 0, name);
  const rest = source.slice(start), next = rest.slice(1).search(/\n(?:async )?function |\nvar /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function setup(storage = new Map()) {
  const plays = [], openings = [], renders = [];
  const c = vm.createContext({ console, Array,
    document: { getElementById: () => null },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    loginStatus: { loggedIn: true }, qqLoginStatus: { loggedIn: true },
    kugouLoginStatus: { loggedIn: true }, qishuiLoginStatus: { loggedIn: true }, spotifyLoginStatus: {},
    homeDiscoverState: { loaded: true, loading: false, loggedIn: true, songs: [{ id: 'ne', provider: 'netease' }] },
    homePlatformRecommendationState: { open: false, feeds: { qishui: { songs: [] }, kugou: { songs: [] }, qq: { songs: [] } } },
    builtInPlaylists: [{ id: 'builtin', provider: 'mineradio' }],
    neteasePlaylists: [{ id: 'ne', provider: 'netease' }], qqPlaylists: [{ id: 'qq', provider: 'qq' }],
    kugouPlaylists: [{ id: 'kg', provider: 'kugou' }],
    qishuiPlaylists: [{ id: 'qs1', provider: 'qishui' }, { id: 'qs2', provider: 'qishui' }],
    spotifyPlaylists: [], userPlaylists: [], playlistCatalogRevision: 0, emptyHomeActive: true,
    renderUserPlaylistsList() {}, scheduleShelfRebuild() {}, renderHomeDiscover() {},
    renderHomeDashboardQuickCards() { renders.push('home'); },
    loadHomePlatformRecommendations(source) { openings.push(source); c.homePlatformRecommendationState.source = source; },
    PLAYLIST_REORDER_STORE_KEY: 'mineradio-playlist-reorder-v1',
    PLAYLIST_REORDER_PROVIDER_ORDER_STORE_KEY: 'mineradio-playlist-reorder-provider-order-v1',
    playlistPanelKey: (provider, id) => provider + ':' + id,
    hasAnyPlatformLogin: () => true, setHomeControlsLocked() {}, waitForHomeDiscoverIdle: async () => {},
    loadHomeDiscover: async () => {}, openHomePlatformRecommendations: source => openings.push(source),
    homePlatformRecommendationFeedConfig: source => ['kugou', 'qishui', 'qq'].includes(source) ? {} : null,
    homePlatformRecommendationSourceLabel: source => source,
    emptyFeeds: new Set(),
    loadHomePlatformFeedRecommendations: async source => {
      c.homePlatformRecommendationState.feeds[source].songs = c.emptyFeeds.has(source) ? [] : [{ id: source }];
    },
    playHomePlatformFeedSong: source => plays.push(source),
    cloneSong: song => ({ ...song }), safeRenderQueuePanel() {}, safeShelfRebuild() {}, forcePlaybackControlsInteractive() {},
    playQueueAt: async () => { plays.push('netease'); },
    runHomeSearch() { throw new Error('Recommendation must not become a keyword search'); },
  });
  vm.runInContext(read('08-account/01-login-modal-utils.js') + read('08-account/01b-content-priority.js'), c);
  const shell = '06-lyrics/01-playlist-panel-shell.js', detail = '06-lyrics/02-playlist-detail.js';
  for (const name of ['playlistCatalogProviderArray', 'rebuildUserPlaylistsFromCatalog']) vm.runInContext(namedFunction(shell, name), c);
  for (const name of ['normalizePlaylistProvider', 'playlistReorderKey', 'readPlaylistReorderKeys', 'savePlaylistReorderKeys', 'applyUserPlaylistOrder']) vm.runInContext(namedFunction(detail, name), c);
  for (const name of ['playHomeDailyFromSource', 'playHomeDaily']) vm.runInContext(namedFunction('05-playback/04-home-empty-wallpaper.js', name), c);
  return { c, storage, plays, openings, renders };
}
const ids = c => Array.from(c.userPlaylists, row => row.id);

test('content selection follows saved ordering, skips disconnected accounts and ignores the last account viewed', () => {
  const { c, storage } = setup();
  c.activeAccountProvider = 'qq';
  assert.equal(c.preferredHomeRecommendationSource(), 'netease');
  c.saveAccountProviderOrder(['qishui', 'kugou', 'qq', 'netease']);
  assert.equal(c.preferredHomeRecommendationSource(), 'qishui');
  assert.deepEqual(ids(c), ['builtin', 'qs1', 'qs2', 'kg', 'qq', 'ne']);
  const reopened = setup(storage).c;
  assert.equal(reopened.preferredHomeRecommendationSource(), 'qishui');
  reopened.qishuiLoginStatus.loggedIn = false;
  assert.equal(reopened.preferredHomeRecommendationSource(), 'kugou');
  reopened.qishuiLoginStatus.configured = true;
  assert.equal(reopened.preferredHomeRecommendationSource(), 'qishui');
});

test('hoisted content functions can render home before account constants are initialized', () => {
  const { c } = setup();
  c.ACCOUNT_PROVIDER_KEYS = undefined;
  c.accountProviderOrder = () => { throw new Error('account state has not initialized'); };
  assert.deepEqual(Array.from(c.contentProviderOrder()), ['netease', 'qq', 'kugou', 'qishui', 'spotify']);
});

test('changing platform priority preserves per-platform manual order and groups newly paged rows', () => {
  const { c, storage } = setup();
  storage.set(c.PLAYLIST_REORDER_STORE_KEY, JSON.stringify(['netease:ne', 'qishui:qs2', 'qq:qq', 'qishui:qs1']));
  c.saveAccountProviderOrder(['qishui', 'netease', 'qq', 'kugou']);
  assert.deepEqual(ids(c), ['builtin', 'qs2', 'qs1', 'ne', 'qq', 'kg']);
  c.qishuiPlaylists.push({ id: 'qs3', provider: 'qishui' });
  c.rebuildUserPlaylistsFromCatalog();
  assert.deepEqual(ids(c), ['builtin', 'qs2', 'qs1', 'qs3', 'ne', 'qq', 'kg']);
  // A later explicit playlist drag remains supported until priority changes again.
  c.userPlaylists = [c.qqPlaylists[0], ...c.userPlaylists.filter(row => row.id !== 'qq')];
  c.savePlaylistReorderKeys(); c.rebuildUserPlaylistsFromCatalog();
  assert.equal(ids(c)[0], 'qq');
  c.saveAccountProviderOrder(['kugou', 'qishui', 'netease', 'qq']);
  assert.deepEqual(ids(c), ['builtin', 'kg', 'qs2', 'qs1', 'qs3', 'ne', 'qq']);
});

test('daily playback uses the preferred real feed, including QQ daily 30', async () => {
  const { c, plays } = setup();
  c.saveAccountProviderOrder(['kugou', 'netease', 'qq', 'qishui']);
  await c.playHomeDaily();
  c.saveAccountProviderOrder(['qq', 'kugou', 'netease', 'qishui']);
  await c.playHomeDaily();
  assert.deepEqual(plays, ['kugou', 'qq']);
});

test('an empty preferred platform offers the other connected platforms instead of a search', async () => {
  const { c, plays, openings, storage } = setup();
  c.saveAccountProviderOrder(['qq', 'kugou', 'netease', 'qishui']);
  c.emptyFeeds.add('qq');
  const asked = [];
  c.askHomeDailyFallback = async (source, alternatives) => { asked.push([source, Array.from(alternatives)]); return asked.length === 1 ? 'netease' : 'view'; };
  await c.playHomeDaily();
  assert.deepEqual(asked[0], ['qq', ['kugou', 'netease', 'qishui']]);
  assert.deepEqual(plays, ['netease']);
  await c.playHomeDaily();
  assert.deepEqual(openings, ['qq'], 'view shows the empty platform rather than substituting content');
  // "Remember" skips the question and uses the next platform in priority order.
  storage.set(c.HOME_DAILY_AUTO_FALLBACK_STORE_KEY, '1');
  await c.playHomeDaily();
  assert.equal(asked.length, 2);
  assert.deepEqual(plays, ['netease', 'kugou']);
  // Without another connected platform the empty state opens directly.
  c.kugouLoginStatus.loggedIn = false; c.qishuiLoginStatus.loggedIn = false; c.loginStatus.loggedIn = false;
  await c.playHomeDaily();
  assert.deepEqual(openings, ['qq', 'qq']);
  assert.equal(asked.length, 2);
});

test('changing priority while a daily feed loads prevents obsolete content from playing', async () => {
  const { c, plays } = setup();
  c.saveAccountProviderOrder(['kugou', 'netease', 'qq', 'qishui']);
  let finish;
  c.loadHomePlatformFeedRecommendations = () => new Promise(resolve => { finish = resolve; });
  const pending = c.playHomeDaily();
  c.saveAccountProviderOrder(['qishui', 'netease', 'qq', 'kugou']);
  finish(); await pending;
  assert.deepEqual(plays, []);
  c.saveAccountProviderOrder(['netease', 'qq', 'kugou', 'qishui']);
  c.homeDiscoverState.songs = [];
  const emptyResponse = new Promise(resolve => { finish = resolve; });
  c.loadHomeDiscover = () => emptyResponse;
  const emptyDaily = c.playHomeDaily();
  c.saveAccountProviderOrder(['qishui', 'netease', 'qq', 'kugou']);
  finish(); await emptyDaily;
  assert.equal(c.homePlatformRecommendationState.source, undefined, 'An old empty response must not reopen its platform');
});

test('daily playback waits for the real in-flight feed, including previously cached songs', async () => {
  for (const source of ['qq', 'kugou', 'qishui']) {
    const { c, plays, openings } = setup();
    c.saveAccountProviderOrder([source, ...['netease', 'qq', 'kugou', 'qishui'].filter(key => key !== source)]);
    const feed = c.homePlatformRecommendationState.feeds[source];
    feed.songs = [{ id: 'old-song' }]; feed.loaded = true;
    let finish, requests = 0;
    c.apiJson = () => { requests++; return new Promise(resolve => { finish = resolve; }); };
    c.renderHomePlatformRecommendations = () => {};
    c.homePlatformRecommendationFeedConfig = () => ({ endpoint: '/api/' + source + '/recommendations' });
    vm.runInContext(namedFunction('05-playback/03a-home-dashboard.js', 'loadHomePlatformFeedRecommendations'), c);
    const pending = c.loadHomePlatformFeedRecommendations(source, true);
    let finished = false;
    const playback = c.playHomeDaily().then(() => { finished = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 1);
    assert.equal(finished, false, source + ' must await the existing request');
    assert.deepEqual(plays, []); assert.deepEqual(openings, []);
    finish({ songs: [{ id: 'new-song' }] });
    await Promise.all([pending, playback]);
    assert.deepEqual(plays, [source]);
    assert.equal(feed.songs[0].id, 'new-song');
    assert.equal(feed.loading, false);
    assert.equal(feed.pending, null);
  }
});

test('an in-flight empty response is considered empty only after it completes and can be retried', async () => {
  const { c, plays, openings } = setup();
  c.saveAccountProviderOrder(['qq', 'kugou', 'netease', 'qishui']);
  let finish;
  c.apiJson = () => new Promise(resolve => { finish = resolve; });
  c.renderHomePlatformRecommendations = () => {};
  c.homePlatformRecommendationFeedConfig = () => ({ endpoint: '/api/qq/recommendations' });
  vm.runInContext(namedFunction('05-playback/03a-home-dashboard.js', 'loadHomePlatformFeedRecommendations'), c);
  const pending = c.loadHomePlatformFeedRecommendations('qq', true);
  const playback = c.playHomeDaily();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(openings, []);
  finish({ songs: [] }); await Promise.all([pending, playback]);
  assert.deepEqual(openings, ['qq']); assert.deepEqual(plays, []);
  const retry = c.playHomeDaily();
  await new Promise(resolve => setImmediate(resolve));
  finish({ songs: [{ id: 'available-now' }] }); await retry;
  assert.deepEqual(plays, ['qq']);
});

test('failed shared feeds release loading state and allow another request', async () => {
  for (const synchronous of [true, false]) {
    const { c } = setup();
    c.console = { warn() {} };
    c.renderHomePlatformRecommendations = () => {};
    c.homePlatformRecommendationFeedConfig = () => ({ endpoint: '/api/qq/recommendations' });
    c.apiJson = () => {
      if (synchronous) throw new Error('QA_FEED_FAILED');
      return Promise.reject(new Error('QA_FEED_FAILED'));
    };
    vm.runInContext(namedFunction('05-playback/03a-home-dashboard.js', 'loadHomePlatformFeedRecommendations'), c);
    await Promise.all([c.loadHomePlatformFeedRecommendations('qq', true), c.loadHomePlatformFeedRecommendations('qq', false)]);
    const feed = c.homePlatformRecommendationState.feeds.qq;
    assert.equal(feed.loading, false); assert.equal(feed.pending, null);
    assert.equal(feed.error, 'QA_FEED_FAILED');
    c.apiJson = async () => ({ songs: [{ id: 'retry-song' }] });
    await c.loadHomePlatformFeedRecommendations('qq', false);
    assert.equal(feed.songs[0].id, 'retry-song');
  }
});

test('clicking a QQ daily recommendation plays its selected row', () => {
  const { c, plays } = setup();
  const listeners = {};
  const list = { addEventListener: (name, fn) => { listeners[name] = fn; }, contains: () => true };
  c.document.getElementById = id => id === 'home-platform-recommend-list' ? list : null;
  c.document.addEventListener = () => {};
  c.window = { addEventListener() {} };
  c.homePlatformRecommendationControlsBound = false;
  c.scheduleHomePlatformDailyWindowRender = () => {};
  c.closeHomePlatformRecommendations = () => {};
  vm.runInContext(namedFunction('05-playback/03a-home-dashboard.js', 'bindHomePlatformRecommendationControls'), c);
  c.bindHomePlatformRecommendationControls();
  const card = { getAttribute: key => key === 'data-home-recommend-kind' ? 'qq-song' : '4' };
  let row;
  c.playHomePlatformFeedSong = (source, index) => { plays.push(source); row = index; };
  listeners.click({ target: { closest: () => card } });
  assert.deepEqual(plays, ['qq']);
  assert.equal(row, 4);
});

test('logging out of the chosen fallback platform during loading prevents its daily songs from playing', async () => {
  const { c, plays } = setup();
  c.saveAccountProviderOrder(['qq', 'kugou', 'netease', 'qishui']);
  c.emptyFeeds.add('qq');
  c.askHomeDailyFallback = async () => 'kugou';
  const load = c.loadHomePlatformFeedRecommendations;
  let finish;
  c.loadHomePlatformFeedRecommendations = async source => {
    if (source === 'kugou') await new Promise(resolve => { finish = resolve; });
    await load(source);
  };
  const pending = c.playHomeDaily();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finish, 'function', 'Fallback loading never started');
  c.kugouLoginStatus.loggedIn = false;
  finish();
  await pending;
  assert.deepEqual(plays, []);
});
