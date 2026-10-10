'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function fixture() {
  const calls = [], pending = [];
  const c = vm.createContext({ crypto, userCookie: 'fixture-A', NETEASE_PLAYLIST_TRACK_INDEX_TTL_MS: 600000,
    NETEASE_PLAYLIST_TRACK_INDEX_MAX_ENTRIES: 8, neteasePlaylistTrackIndexCache: new Map(),
    neteasePlaylistTrackIndexInflight: new Map(), neteasePlaylistTrackIndexGeneration: 0,
    neteaseLikeCache: { reset() {} }, neteaseLoginInfoCache: {},
    mapNeteasePlaylistMeta: pl => ({ id: pl.id, name: pl.name, trackCount: pl.trackCount }),
    playlist_detail: params => new Promise(resolve => { calls.push(params); pending.push(resolve); }),
  });
  const names = ['searchCookieScope', 'pruneNeteasePlaylistTrackIndexCache', 'invalidateNeteasePlaylistTrackIndex',
    'fetchNeteasePlaylistTrackIndex', 'clearNeteaseLoginInfoCache'];
  if (source.includes('function clearNeteasePlaylistTrackIndexes(')) names.unshift('clearNeteasePlaylistTrackIndexes');
  loadFunctions(c, 'server.js', names);
  return { c, calls, pending, complete: (index, name) => pending[index]({ body: { playlist: { id: 1, name, trackIds: [{ id: index + 1 }] } } }) };
}
test('B requesting the same playlist ID never reuses A private metadata or track order', async () => {
  const f = fixture(), a = f.c.fetchNeteasePlaylistTrackIndex('1'); f.complete(0, 'private-A'); await a;
  f.c.userCookie = 'fixture-B';
  const b = f.c.fetchNeteasePlaylistTrackIndex('1');
  assert.equal(f.calls.length, 2, 'same ID under B requires its own authorized read');
  f.complete(1, 'private-B'); assert.equal((await b).playlistMeta.name, 'private-B');
});
test('clear prevents A late cache fill and does not release B singleflight ownership', async () => {
  const f = fixture(), a = f.c.fetchNeteasePlaylistTrackIndex('1');
  f.c.clearNeteaseLoginInfoCache(); f.c.userCookie = 'fixture-B';
  const b = f.c.fetchNeteasePlaylistTrackIndex('1');
  f.complete(0, 'private-A'); await a;
  assert.equal(f.c.neteasePlaylistTrackIndexCache.size, 0);
  assert.equal(f.c.neteasePlaylistTrackIndexInflight.size, 1);
  f.complete(1, 'private-B'); await b;
  assert.equal((await f.c.fetchNeteasePlaylistTrackIndex('1')).playlistMeta.name, 'private-B');
});
test('successful mutations invalidate stale inflight indexes rather than letting them refill', async () => {
  const f = fixture(), old = f.c.fetchNeteasePlaylistTrackIndex('1');
  f.c.invalidateNeteasePlaylistTrackIndex('1');
  const fresh = f.c.fetchNeteasePlaylistTrackIndex('1');
  assert.equal(f.calls.length, 2);
  f.complete(0, 'old'); await old;
  assert.equal(f.c.neteasePlaylistTrackIndexCache.size, 0);
  f.complete(1, 'fresh'); await fresh;
  assert.equal((await f.c.fetchNeteasePlaylistTrackIndex('1')).playlistMeta.name, 'fresh');
});
