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
  const c = vm.createContext({ Image, playlistCoverCache: {}, performance: { now: () => 25, getEntriesByName: () => [] },
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
  assert.equal(images[4].src, 'center');
  timers.filter(t => t.active && t.ms === 0).forEach(t => t.fn());
  assert.equal(callbacks, 2);
  c.requestPlaylistCover('same'); assert.equal(images.length, 5);
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
