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
    homePlatformRecommendationState: { open: false, feeds: { qishui: { songs: [] }, kugou: { songs: [] } } },
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
    homePlatformRecommendationFeedConfig: source => ['kugou', 'qishui'].includes(source) ? {} : null,
    loadHomePlatformFeedRecommendations: async source => { c.homePlatformRecommendationState.feeds[source].songs = [{ id: source }]; },
    playHomePlatformFeedSong: source => plays.push(source),
    cloneSong: song => ({ ...song }), safeRenderQueuePanel() {}, safeShelfRebuild() {}, forcePlaybackControlsInteractive() {},
    playQueueAt: async () => { plays.push('netease'); },
    runHomeSearch() { throw new Error('Recommendation must not become a keyword search'); },
  });
  vm.runInContext(read('08-account/01-login-modal-utils.js') + read('08-account/01b-content-priority.js'), c);
  const shell = '06-lyrics/01-playlist-panel-shell.js', detail = '06-lyrics/02-playlist-detail.js';
  for (const name of ['playlistCatalogProviderArray', 'rebuildUserPlaylistsFromCatalog']) vm.runInContext(namedFunction(shell, name), c);
  for (const name of ['normalizePlaylistProvider', 'playlistReorderKey', 'readPlaylistReorderKeys', 'savePlaylistReorderKeys', 'applyUserPlaylistOrder']) vm.runInContext(namedFunction(detail, name), c);
  vm.runInContext(namedFunction('05-playback/04-home-empty-wallpaper.js', 'playHomeDaily'), c);
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

test('daily playback uses the preferred real feed; QQ and empty NetEase show their own empty state', async () => {
  const { c, plays, openings } = setup();
  c.saveAccountProviderOrder(['kugou', 'netease', 'qq', 'qishui']);
  await c.playHomeDaily(); assert.deepEqual(plays, ['kugou']);
  c.saveAccountProviderOrder(['qq', 'kugou', 'netease', 'qishui']);
  await c.playHomeDaily(); assert.deepEqual(openings, ['qq']);
  assert.deepEqual(plays, ['kugou']);
  c.saveAccountProviderOrder(['netease', 'qq', 'kugou', 'qishui']);
  c.homeDiscoverState.songs = [];
  await c.playHomeDaily(); assert.deepEqual(openings, ['qq', 'netease']);
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
