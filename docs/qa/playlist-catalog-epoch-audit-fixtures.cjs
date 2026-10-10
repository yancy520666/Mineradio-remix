'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(refresh, failure, cached) {
  let release, reject, calls = 0;
  const gate = new Promise((resolve, fail) => { release = resolve; reject = fail; });
  let rows = cached ? [{ id: 'A-cached-private' }] : [];
  const no = () => {}, state = { loading: false, hasMore: true, nextOffset: 0, loaded: 0, enabled: true };
  const c = vm.createContext({ providerAuthEpochs: {}, window: { dispatchEvent: no }, CustomEvent: function () {},
    loginStatus: { loggedIn: false }, qqLoginStatus: { loggedIn: false }, kugouLoginStatus: { loggedIn: true, userId: 'A' }, qishuiLoginStatus: { loggedIn: false }, spotifyLoginStatus: { loggedIn: false },
    playlistCatalogSyncState: { token: 1, loading: true, providers: { kugou: state }, startedAt: Date.now() },
    PLAYLIST_CATALOG_FIRST_PAGE_SIZE: 50, PLAYLIST_CATALOG_BACKGROUND_PAGE_SIZE: 50, playlistCatalogPageUrl: () => '/fixture',
    apiJson: () => ++calls === 1 ? gate : Promise.resolve({ playlists: [{ id: 'B-public' }], hasMore: false, libraryReady: !cached, partial: !!cached }),
    playlistCatalogProviderArray: () => rows, setPlaylistCatalogProviderArray: (_p, next) => { rows = next; c.userPlaylists = rows; },
    userPlaylists: [], builtInPlaylists: [], myPodcastCollections: [], playlistCatalogRevision: 0, beginPlaylistCoverSession: no, refreshBuiltInPlaylists: async () => false,
    document: { getElementById: () => null }, normalizePlaylistProvider: p => p, rebuildUserPlaylistsFromCatalog: no, renderUserPlaylistsList: no, resetPlaylistPanelRenderLimit: no,
    isPlaylistPanelVisibleForRender: () => false, renderMyPodcastCollections: no, requestNextPlaylistCatalogPage: no,
    scheduleUiWarmTask: no, prewarmPlaylistCatalogCovers: no, clearTimeout: no, console: { warn: no } });
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js', ['providerAuthEpoch', 'invalidateProviderAuthSession']);
  const file = 'public/js/modules/06-lyrics/01-playlist-panel-shell.js';
  try { loadFunctions(c, file, ['playlistCatalogAccountKey']); } catch (error) { if (!/is missing/.test(error.message)) throw error; }
  loadFunctions(c, file, ['playlistCatalogProviderLoggedIn', 'mergePlaylistCatalogRows', 'loadPlaylistCatalogProviderPage', 'playlistCatalogHasPendingPages', 'refreshUserPlaylists']);
  const old = c.loadPlaylistCatalogProviderPage('kugou');
  c.invalidateProviderAuthSession('kugou'); // logout/login changes epoch even when loggedIn is true again.
  c.kugouLoginStatus.userId = 'B';
  if (refresh) await c.refreshUserPlaylists(true);
  if (failure) reject(new Error('old-account-network')); else release({ playlists: [{ id: 'A-private' }], partial: false });
  await old;
  return { refresh, failure, rows: Array.from(rows, row => row.id), tokenAfter: c.playlistCatalogSyncState.token, error: c.playlistCatalogSyncState.error || '' };
}
if (require.main === module) (async () => { for (const refresh of [false, true]) for (const failure of [false, true]) console.log('PBL-14 catalog auth epoch', JSON.stringify(await scenario(refresh, failure))); })().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
