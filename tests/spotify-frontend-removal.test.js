'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const root = path.resolve(__dirname, '..');
const search = 'public/js/modules/05-playback/07-search.js';
const playback = 'public/js/modules/05-playback/13-playback-start-audio.js';
const detail = 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js';

function context(extra = {}) {
  const ctx = vm.createContext({ ...extra });
  loadFunctions(ctx, search, ['songProviderKey']);
  return ctx;
}

test('removed provider archives cannot start playback, preload, or change the existing queue', async () => {
  const variants = [
    { provider: 'spotify', id: 'old-track' },
    { source: 'spotify', id: 'old-track' },
    { type: 'spotify', id: 'old-track' },
    { spotifyId: 'old-track' },
    { spotifyUri: 'spotify:track:old-track' },
    { uri: 'spotify:track:old-track' },
    { id: 'spotify:track:old-track' },
    { providerRemoved: true, id: 'old-track' },
  ];
  for (const song of variants) {
    const notices = [];
    const ctx = context({ playQueue: [song], currentIdx: -1, showToast: text => notices.push(text), apiJson: () => assert.fail('archived provider must not fetch') });
    loadFunctions(ctx, playback, ['playQueueAt', 'resolveAlbumGaplessPlaybackData']);
    const before = JSON.stringify(ctx.playQueue);
    assert.equal(await ctx.playQueueAt(0), false);
    assert.equal(await ctx.resolveAlbumGaplessPlaybackData(song), null);
    assert.match(notices[0], /支持已移除.*历史记录已保留/);
    assert.equal(ctx.currentIdx, -1);
    assert.equal(JSON.stringify(ctx.playQueue), before);
  }
});

test('archived provider identity survives without search, album or artist requests', async () => {
  const song = { provider: 'spotify', id: 'old-track', albumId: 'old-album', name: 'Archived track' };
  const ctx = context({ apiJson: () => assert.fail('archive must not fetch'), showToast() {} });
  loadFunctions(ctx, search, ['searchProviderCanSearch', 'searchProviderUrl', 'controlSourceSearchUrl', 'songSourceTagHtml']);
  loadFunctions(ctx, detail, ['albumDetailUrlForSong', 'albumCollectionConfig', 'resolveArtistSongForDetail', 'openArtistDetailForSong']);
  loadFunctions(ctx, 'public/js/modules/05-playback/00-api-quality-output.js', ['normalizePlaybackProvider']);
  assert.equal(ctx.songProviderKey(song), 'spotify');
  assert.equal(ctx.normalizePlaybackProvider('spotify'), 'spotify');
  assert.equal(ctx.searchProviderCanSearch('spotify'), false);
  assert.equal(ctx.searchProviderUrl('spotify', 'query', 10, 0), '');
  assert.equal(ctx.controlSourceSearchUrl('spotify', 'query'), '');
  assert.equal(ctx.albumDetailUrlForSong(song), '');
  assert.equal(ctx.albumCollectionConfig(song), null);
  assert.equal(await ctx.resolveArtistSongForDetail(song, 'artist'), null);
  ctx.openArtistDetailForSong(song);
  assert.match(ctx.songSourceTagHtml(song, { switcher: true }), /已移除/);
  assert.doesNotMatch(ctx.songSourceTagHtml(song, { switcher: true }), /button|onclick/);
});

test('renderer has no Spotify API routes or login integration left', () => {
  function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
  for (const file of files(path.join(root, 'public')).filter(file => /\.(?:js|html|css)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\/api\/spotify\//, path.relative(root, file));
    assert.doesNotMatch(source, /spotifyLoginStatus|startSpotifyOAuthLogin|spotify-setup-wizard/, path.relative(root, file));
  }
});
