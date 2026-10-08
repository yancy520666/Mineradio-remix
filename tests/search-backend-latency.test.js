'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

function topLevelFunction(name) {
  const start = serverSource.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `missing ${name}()`);
  const end = serverSource.indexOf('\n}\n', start);
  return serverSource.slice(start, end + 2);
}

test('search cache shares in-flight work and never keeps empty results', async () => {
  const sandbox = { Date, Promise, Array, Map };
  vm.runInNewContext(`const SEARCH_RESULT_CACHE_TTL_MS = 120000;\n${topLevelFunction('createSearchResultCache')}\nthis.create = createSearchResultCache;`, sandbox);
  const cache = sandbox.create(4);
  let calls = 0;
  const load = () => { calls += 1; return Promise.resolve([{ name: '晴天' }]); };
  await Promise.all([cache.wrap('a', load), cache.wrap('a', load)]);
  await cache.wrap('a', load);
  assert.equal(calls, 1);

  let emptyCalls = 0;
  await cache.wrap('b', () => { emptyCalls += 1; return []; });
  await cache.wrap('b', () => { emptyCalls += 1; return []; });
  assert.equal(emptyCalls, 2, 'an empty answer may be a transient upstream failure');
});

test('QQ search only asks for song details when the search row is incomplete', () => {
  const sandbox = {};
  vm.runInNewContext(`${topLevelFunction('qqSearchTrackComplete')}\nthis.complete = qqSearchTrackComplete;`, sandbox);
  const full = {
    mid: '001', name: '晴天', interval: 269,
    file: { media_mid: '001m' },
    singer: [{ mid: 's1', name: '周杰伦' }],
    album: { mid: 'a1', name: '叶惠美' },
    pay: { pay_play: 0 },
  };
  assert.equal(sandbox.complete(full), true);
  assert.equal(sandbox.complete({ ...full, file: {} }), false, 'playback needs media_mid');
  assert.equal(sandbox.complete({ ...full, pay: undefined }), false, 'VIP marking needs pay info');
  assert.equal(sandbox.complete({ ...full, singer: [] }), false);
  assert.match(topLevelFunction('fetchQQSearch'), /_qqSearchComplete\) return item/);
});

test('typed search maps NetEase artists, albums, playlists and users into one row shape', () => {
  const sandbox = {};
  vm.runInNewContext(`${topLevelFunction('neteaseTypedSearchItem')}\n${topLevelFunction('neteaseTypedSearchList')}\nthis.item = neteaseTypedSearchItem; this.list = neteaseTypedSearchList;`, sandbox);
  const artist = sandbox.item('artist', { id: 6452, name: '周杰伦', picUrl: 'a.jpg', alias: ['Jay Chou'], musicSize: 560, albumSize: 40 });
  assert.equal(artist.id, '6452');
  assert.equal(artist.alias, 'Jay Chou');
  const album = sandbox.item('album', { id: 1, name: '叶惠美', picUrl: 'b.jpg', artists: [{ id: 6452, name: '周杰伦' }], size: 11 });
  assert.equal(album.artist, '周杰伦');
  assert.equal(album.artistId, '6452');
  const playlist = sandbox.item('playlist', { id: 9, name: '精选', coverImgUrl: 'c.jpg', trackCount: 30, creator: { nickname: '某人' } });
  assert.equal(playlist.creator, '某人');
  const user = sandbox.item('user', { userId: 77, nickname: '听歌的人', avatarUrl: 'd.jpg' });
  assert.equal(user.id, '77');
  assert.equal(sandbox.list('user', { result: { userprofiles: [{ userId: 1 }] } }).length, 1);
  assert.equal(sandbox.list('playlist', {}).length, 0);
});

test('overview search keeps a few artists, albums and playlists from one NetEase call', () => {
  const sandbox = {};
  vm.runInNewContext(`${topLevelFunction('neteaseTypedSearchItem')}\n${topLevelFunction('neteaseOverviewFromBody')}\nthis.overview = neteaseOverviewFromBody;`, sandbox);
  const playLists = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: '歌单' + i }));
  const overview = sandbox.overview({ result: {
    artist: { artists: [{ id: 1, name: '周杰伦' }] },
    album: { albums: [{ id: 2, name: '叶惠美', artist: { id: 1, name: '周杰伦' } }] },
    playList: { playLists },
  } });
  assert.equal(overview.artists[0].name, '周杰伦');
  assert.equal(overview.albums[0].artist, '周杰伦');
  assert.equal(overview.playlists.length, 6);
  assert.equal(sandbox.overview({}).playlists.length, 0);
});

test('artist albums keep the newest releases first and cap the list', async () => {
  const sandbox = { Date, Promise, Array, Map, Math, Number, String };
  const calls = [];
  vm.runInNewContext([
    'const ARTIST_ALBUMS_DEFAULT = 6; const ARTIST_ALBUMS_MAX = 12; const userCookie = "";',
    'const SEARCH_RESULT_CACHE_TTL_MS = 120000;',
    'const searchCookieScope = () => "t";',
    topLevelFunction('createSearchResultCache'),
    'const typedSearchCache = createSearchResultCache(8);',
    topLevelFunction('neteaseTypedSearchItem'),
    'const artist_album = async (o) => { calls.push(o); return { body: { artist: { albumSize: 30 }, hotAlbums: albums } }; };',
    topLevelFunction('fetchNeteaseArtistAlbums'),
    'const fetchQQArtistAlbums = async () => ({ items: [], total: 0 });',
    topLevelFunction('handleArtistAlbums'),
    'this.run = handleArtistAlbums;',
  ].join('\n'), Object.assign(sandbox, {
    calls,
    albums: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: n, name: `专辑${n}`, publishTime: n * 1000, picUrl: `c${n}.jpg`, size: 10, artists: [{ id: 9, name: '歌手' }] })),
  }));
  const r = await sandbox.run('netease', '9', 6);
  assert.equal(r.albums.length, 6);
  assert.equal(r.albums[0].name, '专辑8', 'newest first');
  assert.equal(r.total, 30);
  assert.equal(r.albums[0].type, 'album');
  assert.deepEqual(JSON.parse(JSON.stringify(await sandbox.run('netease', '', 6))), { provider: 'netease', albums: [], total: 0 });
  assert.match(serverSource, /pn === '\/api\/artist\/albums'/);
});
