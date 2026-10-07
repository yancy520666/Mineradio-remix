'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const shell = fs.readFileSync(path.join(__dirname, '../public/js/modules/06-lyrics/01-playlist-panel-shell.js'), 'utf8');
const detail = fs.readFileSync(path.join(__dirname, '../public/js/modules/06-lyrics/02-playlist-detail.js'), 'utf8');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start);
  return (source.slice(start - 6, start) === 'async ' ? 'async ' : '') + source.slice(start, end + 3);
}
function fixture(response, provider = 'kugou') {
  let rows = [], requests = 0;
  const state = { loading: false, hasMore: true, nextOffset: 0, loaded: 0 };
  const c = vm.createContext({
    playlistCatalogSyncState: { token: 1, providers: { [provider]: state } },
    userPlaylists: rows, PLAYLIST_CATALOG_FIRST_PAGE_SIZE: 50, PLAYLIST_CATALOG_BACKGROUND_PAGE_SIZE: 50,
    playlistCatalogProviderLoggedIn: () => true, playlistCatalogPageUrl: () => '/fixture',
    apiJson: async () => { requests++; return typeof response === 'function' ? response() : response; },
    playlistCatalogProviderArray: () => rows,
    setPlaylistCatalogProviderArray: (_p, next) => { rows = next; c.userPlaylists = rows; },
    rebuildUserPlaylistsFromCatalog() {}, renderUserPlaylistsList() {},
    isPlaylistPanelVisibleForRender: () => false, playlistProviderName: () => provider === 'kugou' ? '酷狗音乐' : '汽水音乐',
    escHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;'), console,
  });
  vm.runInContext(['mergePlaylistCatalogRows', 'loadPlaylistCatalogProviderPage', 'retryPlaylistCatalogProvider', 'playlistCatalogHasPendingPages'].map(n => extract(shell, n)).join('\n') + '\n' + extract(detail, 'playlistCatalogFooterHtml'), c);
  return { c, state, requests: () => requests, rows: () => rows };
}
test('partial library remains visible with a retry that fills missing rows and clears the warning', async () => {
  let recovered = false;
  const s = fixture(() => ({ playlists: (recovered ? ['1','2','3'] : ['1','3']).map(id => ({ id })), total: 3, libraryReady: recovered, partial: !recovered }));
  await s.c.loadPlaylistCatalogProviderPage('kugou');
  assert.equal(s.rows().length, 2);
  assert.equal(s.state.hasMore, false, 'incomplete whole-library reads must not trigger endless automatic retries');
  assert.match(s.c.playlistCatalogFooterHtml(), /尚未同步完整.*2\/3/);
  assert.match(s.c.playlistCatalogFooterHtml(), /retryPlaylistCatalogProvider/);
  assert.doesNotMatch(s.c.playlistCatalogFooterHtml(), /spinning/);
  recovered = true;
  await s.c.retryPlaylistCatalogProvider('kugou');
  assert.equal(s.rows().length, 3);
  assert.equal(new Set(s.rows().map(pl => pl.id)).size, 3);
  assert.equal(s.state.error, '');
  assert.equal(s.c.playlistCatalogFooterHtml(), '');
  assert.equal(s.requests(), 2);
});
test('both providers show a page-limit warning without offering a retry that repeats the cap', async () => {
  for (const provider of ['kugou', 'qishui']) {
    const s = fixture({ playlists: [{ id: '1' }], total: 2, libraryReady: false, partial: true, pageLimited: true }, provider);
    await s.c.loadPlaylistCatalogProviderPage(provider);
    const html = s.c.playlistCatalogFooterHtml();
    assert.match(html, /尚未同步完整.*单次同步上限/);
    assert.doesNotMatch(html, /retryPlaylistCatalogProvider|spinning/);
    await s.c.retryPlaylistCatalogProvider(provider);
    assert.equal(s.requests(), 1);
  }
});
test('a stale partial response cannot mark a new account sync incomplete', async () => {
  let resolve;
  const s = fixture(() => new Promise(r => { resolve = r; }));
  const pending = s.c.loadPlaylistCatalogProviderPage('kugou');
  s.c.playlistCatalogSyncState = { token: 2, providers: {} };
  resolve({ playlists: [{ id: 'old' }], partial: true });
  await pending;
  assert.equal(s.rows().length, 0);
  assert.equal(s.c.playlistCatalogSyncState.error, undefined);
});
test('a page-limit result that also lost a page still allows recovery of that failed page', async () => {
  const s = fixture({ playlists: [{ id: '1' }], total: 2050, libraryReady: false, partial: true, pageLimited: true, retryable: true });
  await s.c.loadPlaylistCatalogProviderPage('kugou');
  assert.match(s.c.playlistCatalogFooterHtml(), /单次同步上限.*retryPlaylistCatalogProvider/);
  await s.c.retryPlaylistCatalogProvider('kugou');
  assert.equal(s.requests(), 2);
});
test('a zero-row incomplete result shows the warning rather than a successful empty library', async () => {
  const s = fixture({ playlists: [], libraryReady: false, partial: true }, 'qishui');
  await s.c.loadPlaylistCatalogProviderPage('qishui');
  const list = { innerHTML: '' };
  s.c.document = { getElementById: () => list };
  s.c.playlistRenderSeq = 0;
  vm.runInContext(extract(detail, 'renderUserPlaylistsList'), s.c);
  s.c.renderUserPlaylistsList();
  assert.match(list.innerHTML, /尚未同步完整.*重试/);
  assert.doesNotMatch(list.innerHTML, /未找到歌单/);
});
