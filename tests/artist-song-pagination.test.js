'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const songs = (start, count) => Array.from({ length: count }, (_, i) => ({ id: start + i, name: 'Song ' + (start + i) }));

function frontend(pages) {
  const requests = [];
  const target = { innerHTML: '' };
  const body = { scrollTop: 100, scrollHeight: 1000, clientHeight: 500, addEventListener(_, fn) { this.scroll = fn; } };
  const c = { Set, trackDetailSeq: 1, cloneSong: s => ({ ...s }), bindTrackDetailScrollers() {},
    document: { getElementById: id => id === 'artist-hot-songs' ? target : body },
    renderArtistSongList: list => { c.detailArtistSongs = list; return list.map(s => s.id).join(','); },
    apiJson: async url => { requests.push(url); const value = pages.shift(); if (value instanceof Error) throw value; return value; },
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('public/js/modules/05-playback/06a-artist-song-pagination.js', 'utf8'), c);
  c.startArtistSongPaging('/api/artist/detail?id=1&limit=36', 1,
    { songs: songs(1, 36), hasMore: true, nextOffset: 36 });
  return { c, requests, body, target };
}

test('artist paging appends unique songs, advances raw offset and stops at the end', async () => {
  const h = frontend([{ songs: songs(36, 36), hasMore: true, nextOffset: 72 }, { songs: songs(72, 2), hasMore: false, nextOffset: 74 }]);
  await h.c.loadMoreArtistSongs();
  assert.equal(h.c.detailArtistSongs.length, 71);
  assert.equal(h.body.scrollTop, 100);
  await h.c.loadMoreArtistSongs();
  assert.equal(h.c.detailArtistSongs.length, 73);
  assert.match(h.requests[1], /offset=72$/);
  assert.doesNotMatch(h.target.innerHTML, /artist-songs-more/);
  await h.c.loadMoreArtistSongs();
  assert.equal(h.requests.length, 2);
});

test('scroll loads more; failed reads preserve songs and offset for manual retry', async () => {
  const h = frontend([{ error: 'OFFLINE' }, { songs: songs(37, 2), hasMore: false, nextOffset: 38 }]);
  h.body.scrollTop = 500;
  h.body.scroll();
  await new Promise(r => setImmediate(r));
  assert.match(h.target.innerHTML, /点击重试/);
  assert.equal(h.c.detailArtistSongs.length, 36);
  h.body.scroll();
  assert.equal(h.requests.length, 1, 'scroll does not loop on failures');
  await h.c.loadMoreArtistSongs();
  assert.match(h.requests[1], /offset=36$/);
  assert.equal(h.c.detailArtistSongs.length, 38);
});

test('concurrent scroll is bounded and stale responses cannot modify a new detail', async () => {
  let finish;
  const h = frontend([]);
  h.c.apiJson = () => new Promise(resolve => { finish = resolve; });
  const first = h.c.loadMoreArtistSongs();
  await h.c.loadMoreArtistSongs();
  h.c.trackDetailSeq++;
  h.target.innerHTML = 'new detail';
  finish({ songs: songs(37, 36), hasMore: true, nextOffset: 72 });
  await first;
  assert.equal(h.target.innerHTML, 'new detail');
  assert.equal(h.c.detailArtistSongs.length, 36);
});

test('duplicate-only pages end paging even when upstream advertises more', async () => {
  const h = frontend([{ songs: songs(1, 36), hasMore: true, nextOffset: 72 }]);
  await h.c.loadMoreArtistSongs();
  assert.equal(h.c.detailArtistSongState.hasMore, false);
});

function backend(overrides = {}) {
  const calls = [];
  const c = { console, Date, mapSongRecord: s => s, mapQQTrack: s => s, qqSingerAvatar: () => '',
    artist_detail: async () => ({ body: { artist: { name: 'Artist', musicSize: 90 } } }),
    artist_songs: async args => { calls.push(args); return { body: { songs: songs(args.offset + 1, 36), more: true, total: 90 } }; },
    artist_top_song: async () => { throw new Error('unexpected top-song fallback'); },
    qqMusicRequest: async args => { calls.push(args.singer.param); return { singer: { code: 0, data: { songlist: songs(37, 36), total_song: 90 } } }; },
    ...overrides };
  vm.createContext(c);
  loadFunctions(c, 'server.js', ['handleNeteaseArtistDetail', 'handleQQArtistDetail']);
  return { c, calls };
}

test('both provider handlers pass page offsets and expose continuation', async () => {
  const h = backend();
  const ne = await h.c.handleNeteaseArtistDetail('1', 36, 36, 'fixture');
  assert.equal(h.calls[0].offset, 36);
  assert.equal(ne.nextOffset, 72);
  assert.equal(ne.hasMore, true);
  const qq = await h.c.handleQQArtistDetail('mid', 36, 36);
  assert.equal(h.calls[1].sin, 36);
  assert.equal(qq.nextOffset, 72);
  assert.equal(qq.hasMore, true);
});

test('NetEase later-page failures propagate for retry; empty pages do not repeat hot preview', async () => {
  const h = backend({ artist_songs: async () => { throw new Error('OFFLINE'); } });
  await assert.rejects(h.c.handleNeteaseArtistDetail('1', 36, 36, ''), /OFFLINE/);
  const empty = backend({ artist_songs: async () => ({ body: { songs: [], more: true } }) });
  const page = await empty.c.handleNeteaseArtistDetail('1', 36, 36, '');
  assert.equal(page.hasMore, false);
  const preview = backend({ artist_songs: async () => { throw new Error('OFFLINE'); },
    artist_top_song: async () => ({ body: { songs: songs(1, 50) } }) });
  const first = await preview.c.handleNeteaseArtistDetail('1', 36, 0, '');
  assert.equal(first.songs.length, 36);
  assert.equal(first.hasMore, false);
});
