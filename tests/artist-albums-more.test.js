'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

// The section used to stop at six albums and send 查看全部 to a search. It now expands in place.
function fixture(pages) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, hidden: false, textContent: '', innerHTML: '', disabled: false });
  const requests = [];
  const ctx = {
    ARTIST_ALBUM_COUNT: 6, ARTIST_ALBUM_PAGE: 60, detailArtistAlbums: [], detailArtistAlbumState: null, trackDetailSeq: 1,
    document: { getElementById: el }, artistAlbumCardHtml: item => '[' + item.id + ']', showToast() {},
    apiJson: async url => { requests.push(url); return pages.shift(); },
  };
  vm.createContext(ctx);
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js',
    ['renderArtistAlbumSection', 'loadArtistAlbumSection', 'toggleArtistAlbumsExpanded']);
  return { ctx, els, requests };
}
const albums = (from, n) => Array.from({ length: n }, (_, i) => ({ id: 'a' + (from + i), name: 'A' + (from + i) }));
const settle = () => new Promise(r => setTimeout(r, 0));

test('查看全部 expands every album in place, page by page, then collapses', async () => {
  const { ctx, els, requests } = fixture([
    { albums: albums(0, 6), total: 70 },
    { albums: albums(0, 60), total: 70 },
    { albums: albums(60, 10), total: 70 },
  ]);
  ctx.loadArtistAlbumSection('qq', 'mid1', 1); await settle();
  assert.equal(els['artist-albums-count'].textContent, '最新 6 张 · 共 70 张');
  assert.equal(els['artist-albums-more'].textContent, '查看全部 ›');
  ctx.toggleArtistAlbumsExpanded(); await settle(); await settle();
  assert.match(requests[1], /limit=60&offset=0$/);
  assert.equal(ctx.detailArtistAlbums.length, 60);
  assert.equal(els['artist-albums-more'].textContent, '加载更多 ›');
  ctx.toggleArtistAlbumsExpanded(); await settle(); await settle();
  assert.match(requests[2], /offset=60$/);
  assert.equal(ctx.detailArtistAlbums.length, 70);
  assert.equal(els['artist-albums-more'].textContent, '收起');
  ctx.toggleArtistAlbumsExpanded();
  assert.equal(ctx.detailArtistAlbums.length, 6);
  assert.equal(requests.length, 3, 'collapsing does not refetch');
});

test('a short catalogue hides the button, and an empty page ends paging', async () => {
  const small = fixture([{ albums: albums(0, 4), total: 4 }]);
  small.ctx.loadArtistAlbumSection('netease', '1', 1); await settle();
  assert.equal(small.els['artist-albums-more'].hidden, true);
  const lying = fixture([{ albums: albums(0, 6), total: 99 }, { albums: albums(0, 8), total: 99 }, { albums: [], total: 99 }]);
  lying.ctx.loadArtistAlbumSection('netease', '1', 1); await settle();
  lying.ctx.toggleArtistAlbumsExpanded(); await settle(); await settle();
  lying.ctx.toggleArtistAlbumsExpanded(); await settle(); await settle();
  assert.equal(lying.els['artist-albums-more'].textContent, '收起');
});
