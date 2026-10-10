'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../public/js/modules');
const requests = [];
const notices = [];
const element = { addEventListener() {} };
const ctx = vm.createContext({
  console, Promise, setTimeout, clearTimeout,
  document: { querySelector: () => null, getElementById: () => element, addEventListener() {} },
  window: {}, smoothWheelScrollBound: true,
  THREE: { Vector3: function () {}, Object3D: function () {}, Matrix4: function () {} }, PLAYLIST_DETAIL_INITIAL_RENDER: 20, PLAYLIST_CATALOG_FIRST_PAGE_SIZE: 40,
  apiJson: async (url) => { requests.push(url); return { tracks: [] }; },
  showToast: (message) => notices.push(message),
  songProviderKey: song => song.provider || song.source || 'netease',
  PLAYLIST_QUEUE_INITIAL_BATCH_SIZE: 40, PLAYLIST_QUEUE_BACKGROUND_BATCH_SIZE: 100
});
for (const dir of ['04-shelf', '06-lyrics']) {
  for (const filename of fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, dir, filename), 'utf8');
    assert(!source.includes('/api/spotify/'), `${dir}/${filename} must have no Spotify API routes`);
  }
}
for (const file of ['02-playlist-detail.js', '01-playlist-panel-shell.js', '03-podcast-playlist-loaders.js', '00-lyrics-fetch-parse.js']) {
  let source = fs.readFileSync(path.join(root, '06-lyrics', file), 'utf8');
  if (file === '01-playlist-panel-shell.js') source = source.slice(source.indexOf('function playlistCatalogProviderArray('));
  vm.runInContext(source, ctx, { filename: file });
}
vm.runInContext(fs.readFileSync(path.join(root, '04-shelf', '03-content-list-manager.js'), 'utf8'), ctx);
(async () => {
  const shelf = ctx.makeContentListManager();
  assert.equal(await shelf.open('spotify:old', 'Old playlist'), false);
  assert.equal(shelf.isOpen(), false);
  assert.equal(ctx.normalizePlaylistProvider('spotify'), 'spotify', 'archived identities must not become NetEase');
  assert.match(ctx.playlistProviderName('spotify'), /停止支持/);
  assert.equal(ctx.playlistCatalogProviderLoggedIn('spotify'), false);
  assert.equal(ctx.playlistCatalogPageUrl('spotify', 0, 50), '');
  assert.equal(ctx.playlistCatalogProviderArray('spotify').length, 0);
  assert.throws(() => ctx.playlistTracksEndpoint('spotify', 'old'), /SPOTIFY_UNSUPPORTED/);
  assert.throws(() => ctx.playlistTracksEndpoint('qq', 'spotify:old'), /SPOTIFY_UNSUPPORTED/);
  const result = await ctx.fetchPlaylistTracksPage('spotify', 'old');
  assert.equal(result.error, 'SPOTIFY_UNSUPPORTED');
  assert.equal(await ctx.loadPlaylistIntoQueueById('spotify:old', true, 'Old playlist', { seedTracks: [{ id: 'old' }] }), false);
  assert.equal(await ctx.openPlaylistPanelDetail('spotify', 'old'), false);
  for (const song of [{ provider: 'spotify', id: 'old' }, { source: 'spotify', id: 'old' }, { spotifyId: 'old' }, { id: 'spotify:track:old' }]) {
    assert.throws(() => ctx.lyricEndpointForSong(song), /SPOTIFY_UNSUPPORTED/);
    assert.equal(ctx.lyricQueuePrefetchCandidate(song), false);
    assert.equal(ctx.shouldFetchNeteaseLyricTranslationFallback(song, { usableLyric: true }), false);
    assert.equal(await ctx.fetchLyric(song, 1), false);
    assert.equal(await ctx.findNeteaseLyricFallbackCandidate(song), null);
  }
  ctx.playlistPanelDetailState = { key: 'spotify:old', playlist: { id: 'old' } };
  assert.equal(await ctx.togglePlaylistPanelCollection(true), false);
  ctx.playlistCatalogSyncState = { providers: { spotify: { hasMore: true, loading: true } } };
  assert.equal(ctx.playlistCatalogHasPendingPages(), false);
  assert.equal(requests.length, 0, 'unsupported records must never send requests');
  await ctx.fetchPlaylistTracksPage('netease', '123');
  await ctx.fetchPlaylistTracksPage('qq', '123');
  assert.equal(requests[0], '/api/playlist/tracks?id=123');
  assert.equal(requests[1], '/api/qq/playlist/tracks?id=123');
  assert(notices.every(message => /停止支持/.test(message)));
  console.log('[OK] Removed Spotify playlist and lyric paths reject archived records without network access.');
})().catch(error => { console.error(error); process.exitCode = 1; });
