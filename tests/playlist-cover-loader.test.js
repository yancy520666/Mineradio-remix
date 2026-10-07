'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function context() {
  const images = [], timers = [], events = {}, metrics = [];
  class Image {
    constructor() { images.push(this); }
    set src(value) { this.url = value; } get src() { return this.url; }
    decode() { return Promise.resolve(); }
  }
  const c = vm.createContext({ Image, clock: 25, playlistCoverCache: {}, performance: { now: () => c.clock, getEntriesByName: () => [] },
    setTimeout: (fn, ms) => { const t = { fn, ms, active: true }; timers.push(t); return t; }, clearTimeout: t => { t.active = false; },
    isInlineCoverSrc: url => url.startsWith('data:'), coverProxySrc: url => url, coverUrlWithSize: (url, size) => url + '?param=' + size + 'y' + size,
    window: { addEventListener: (name, fn) => { events[name] = fn; } }, userPlaylists: [], myPodcastCollections: [] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/04-shelf/04a-cover-loader.js'), 'utf8'), c);
  return { c, images, timers, events, metrics };
}
test('requests deduplicate, cap concurrency and prioritize visible covers', async () => {
  const { c, images, timers } = context(); let callbacks = 0;
  c.requestPlaylistCover('same', () => callbacks++); c.requestPlaylistCover('same', () => callbacks++);
  for (let i = 0; i < 6; i++) c.requestPlaylistCover('cover' + i);
  c.requestPlaylistCover('center', null, { priority: 0 });
  assert.equal(images.length, 4); assert.equal(c.playlistCoverActive, 4);
  images[0].onload(); await Promise.resolve();
  assert.equal(images[3].src, 'center', 'visible image starts in the reserved slot without waiting for old requests');
  timers.filter(t => t.active && t.ms === 0).forEach(t => t.fn());
  assert.equal(callbacks, 2);
  c.requestPlaylistCover('same'); assert.equal(images.length, 4);
});
test('one automatic retry, later open and online recovery are bounded', () => {
  const { c, images, timers, events } = context();
  c.requestPlaylistCover('broken'); images[0].onerror();
  timers.find(t => t.active && t.ms === 800).fn(); images[1].onerror();
  assert.equal(c.playlistCoverCache.broken.failed, true);
  c.requestPlaylistCover('broken'); assert.equal(images.length, 2);
  c.beginPlaylistCoverSession(); c.requestPlaylistCover('broken'); assert.equal(images.length, 3);
  images[2].onload = null; // retain an in-flight request; online must not duplicate it
  events.online(); assert.equal(images.length, 3);
  assert(c.podcastDefaultCover('created').startsWith('data:image/svg+xml'));
  assert.notEqual(c.podcastDefaultCover('created'), c.podcastDefaultCover('liked'));
  assert.equal(c.shelfCoverSource('https://signed.example/a?token=123'), 'https://signed.example/a?token=123');
});

test('a visible cold cover does not wait for a backlog of stalled prefetches', () => {
  const { c, images } = context();
  for (let i=0; i<100; i++) c.requestPlaylistCover('old'+i, null, { scope:'content' });
  assert.equal(images.length, 3);
  c.updatePlaylistCoverViewport(['new'], ['near']);
  assert.equal(c.playlistCoverQueue.length, 0);
  c.requestPlaylistCover('new', null, { priority:0, scope:'content' });
  assert.equal(images.length, 4);
  assert.equal(images[3].src, 'new');
});
test('failed covers become retryable after cooldown without reopening the panel', () => {
  const { c, images, timers } = context();
  c.requestPlaylistCover('retry'); images[0].onerror();
  timers.find(t=>t.active && t.ms===800).fn(); images[1].onerror();
  c.requestPlaylistCover('retry'); assert.equal(images.length, 2);
  c.clock += 30001;
  assert.equal(c.playlistCoverCanRetry(c.playlistCoverCache.retry), true);
  c.requestPlaylistCover('retry'); assert.equal(images.length, 3);
});
test('small NetEase row covers keep their requested dimensions and signed URLs are untouched', () => {
  const { c } = context();
  const tiny='https://p1.music.126.net/cover.jpg?param=80y80';
  assert.equal(c.shelfCoverSource(tiny), tiny);
  assert.equal(c.shelfCoverSource('https://p1.music.126.net/cover.jpg'), 'https://p1.music.126.net/cover.jpg?param=360y360');
  const signed='https://signed.example/cover.jpg?token=fixture';
  assert.equal(c.shelfCoverSource(signed), signed);
});

test('row thumbnails retain enough image density for the selected ultra quality', () => {
  const { c } = context();
  c.shelfTextureQualityProfile = () => ({maxScale:2});
  c.songCoverSrc = (song,size) => ({song,size});
  assert.equal(c.shelfSongCoverSrc({id:1}).size,160);
  c.shelfTextureQualityProfile = () => ({maxScale:1});
  assert.equal(c.shelfSongCoverSrc({id:1}).size,80);
});
