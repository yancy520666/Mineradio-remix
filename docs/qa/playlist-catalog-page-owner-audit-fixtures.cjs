'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(owner = 'old') {
  const no = () => {};
  const oldAccount = owner === 'old' || owner === 'old-account-same-epoch';
  let rows = [{ id: oldAccount ? 'A-private' : 'B-page1', provider: 'netease' }];
  const requestedOffsets = [];
  const state = { loading: false, hasMore: true, nextOffset: owner === 'same-account-refresh' ? 0 : 50,
    loaded: 1, authEpoch: owner === 'old' || owner === 'same-account-old-epoch' ? 0 : 1,
    accountKey: JSON.stringify([true, oldAccount ? 'A' : 'B']), replaceOnFirstPage: owner === 'same-account-refresh' };
  const c = vm.createContext({ providerAuthEpoch: () => 1, loginStatus: { loggedIn: true, userId: 'B' },
    qqLoginStatus: { loggedIn: false }, kugouLoginStatus: { loggedIn: false }, qishuiLoginStatus: { loggedIn: false }, spotifyLoginStatus: { loggedIn: false },
    playlistCatalogSyncState: { token: 1, providers: { netease: state } }, PLAYLIST_CATALOG_FIRST_PAGE_SIZE: 50, PLAYLIST_CATALOG_BACKGROUND_PAGE_SIZE: 50,
    playlistCatalogProviderArray: () => rows, setPlaylistCatalogProviderArray: (_p, next) => { rows = next; },
    rebuildUserPlaylistsFromCatalog: no, renderUserPlaylistsList: no,
    playlistCatalogPageUrl: (_p, offset) => { requestedOffsets.push(offset); return '/fixture'; },
    apiJson: async () => owner === 'same-account-refresh' ? { playlists: [], error: 'NETWORK' }
      : { playlists: [{ id: 'B-page2' }], hasMore: false, partial: false }, console });
  loadFunctions(c, 'public/js/modules/06-lyrics/01-playlist-panel-shell.js',
    ['playlistCatalogProviderLoggedIn', 'playlistCatalogAccountKey', 'mergePlaylistCatalogRows', 'loadPlaylistCatalogProviderPage']);
  const committed = await c.loadPlaylistCatalogProviderPage('netease', 'background');
  return { rows: Array.from(rows, p => p.id), requestedOffsets, storedAccountKey: state.accountKey, storedAuthEpoch: state.authEpoch, committed };
}
if (require.main === module) scenario().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
