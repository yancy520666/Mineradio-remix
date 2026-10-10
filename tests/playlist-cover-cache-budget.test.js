'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture() {
  const images = [], timers = [], revoked = [];
  class Image {
    constructor() { images.push(this); this.naturalWidth = this.naturalHeight = 100; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  }
  const c = vm.createContext({ Image, clock: 1000, playlistCoverCache: {},
    performance: { now: () => c.clock, getEntriesByName: () => [] },
    setTimeout: (fn, ms) => { const timer = { fn, ms, active: true }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.active = false; },
    window: { addEventListener() {} }, URL: { revokeObjectURL: url => revoked.push(url) },
    isInlineCoverSrc: url => /^(blob:|data:)/.test(url), coverProxySrc: url => url, coverUrlWithSize: url => url,
    requestAnimationFrame: () => 1, userPlaylists: [], myPodcastCollections: [] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/04-shelf/04a-cover-loader.js'), 'utf8'), c);
  const fire = timer => { assert(timer.active); timer.active = false; timer.fn(); };
  return { c, images, timers, revoked, fire };
}
function failed(c, usedAt = c.clock) {
  return { failed: true, loading: false, loaded: false, failedAt: c.clock, usedAt,
    session: c.playlistCoverSession, waiters: [], img: null };
}
test('1000 failed records are LRU bounded and expired offscreen failures are swept', () => {
  const { c, images } = fixture();
  for (let i = 0; i < 1000; i++) c.playlistCoverCache['failed-' + i] = failed(c, i);
  c.trimPlaylistCoverCache();
  assert.equal(Object.keys(c.playlistCoverCache).length, 256);
  assert(!c.playlistCoverCache['failed-0']); assert(c.playlistCoverCache['failed-999']);
  c.clock += 30000; c.trimPlaylistCoverCache();
  assert.equal(Object.keys(c.playlistCoverCache).length, 0);
  assert.equal(images.length, 0, 'expiration never proactively starts a request');
});
test('1000 queued requests remain bounded without cancelling active images or orphan queue entries', () => {
  const { c, images } = fixture();
  for (let i = 0; i < 1000; i++) { c.clock++; c.requestPlaylistCover('pending-' + i); }
  assert.equal(Object.keys(c.playlistCoverCache).length, 64);
  assert.equal(c.playlistCoverQueue.length, 62); assert.equal(c.playlistCoverActive, 2);
  assert.equal(images.length, 2, 'overflow must not create a cancel/restart loading storm');
  assert.equal(images[0].src, 'pending-0');
  assert(c.playlistCoverQueue.every(task => c.playlistCoverCache[task.url] === task.rec));
  c.requestPlaylistCover('visible', null, { priority: 0 });
  assert.equal(images.length, 3); assert.equal(images[2].src, 'visible');
});
test('displayed and nearby covers survive image and metadata pressure, including shelf cards', () => {
  const { c } = fixture();
  const kept = ['visible', 'nearby', 'shelf'];
  const imgs = kept.map(() => ({ src: 'kept', removeAttribute() { this.src = ''; } }));
  kept.forEach((url, i) => { c.playlistCoverCache[url] = { loaded: true, img: imgs[i], bytes: 30 * 1024 * 1024, usedAt: 0 }; });
  c.playlistCoverViewportVisible.add('visible'); c.playlistCoverViewportNearby.add('nearby');
  c.collectProtectedCoverUrls = () => ({ shelf: true });
  for (let i = 0; i < 1000; i++) c.playlistCoverCache['failed-' + i] = failed(c, i + 1);
  c.trimPlaylistCoverCache();
  kept.forEach((url, i) => { assert.equal(c.playlistCoverCache[url].img, imgs[i]); assert.equal(imgs[i].src, 'kept'); });
  assert.equal(Object.keys(c.playlistCoverCache).length, 256);
});
test('retained failures keep cooldown and exactly one automatic retry per request', () => {
  const { c, images, timers, fire } = fixture();
  c.requestPlaylistCover('retry'); images[0].onerror();
  fire(timers.find(t => t.active && t.ms === 800)); images[1].onerror();
  for (let i = 0; i < 100; i++) c.requestPlaylistCover('retry');
  assert.equal(images.length, 2); assert(c.playlistCoverCache.retry.failed);
  c.clock += 30000; c.requestPlaylistCover('retry');
  assert.equal(images.length, 3); assert.equal(c.playlistCoverCache.retry.attempts, 1);
});
test('evicting a retry-wait record clears timer and callbacks, and cannot resurrect its queue task', () => {
  const { c, images, timers } = fixture();
  c.requestPlaylistCover('retry-wait', () => {}); const rec = c.playlistCoverCache['retry-wait'];
  images[0].onerror(); const retry = timers.find(t => t.active && t.ms === 800);
  for (let i = 0; i < 1000; i++) { c.clock++; c.requestPlaylistCover('pending-' + i); }
  assert(!c.playlistCoverCache['retry-wait']); assert.equal(retry.active, false);
  assert.equal(rec.waiters.length, 0); assert.equal(rec.task, null); assert.equal(rec.loading, false);
  retry.fn(); assert(!c.playlistCoverQueue.some(task => task.url === 'retry-wait'));
  assert.equal(c.playlistCoverActive, 2);
});
test('timeout rejects a captured late onload and pending late decode without changing accounting', async () => {
  const { c, images, timers, fire } = fixture();
  let resolveDecode, callbacks = 0;
  c.requestPlaylistCover('slow', () => callbacks++);
  images[0].decode = () => new Promise(resolve => { resolveDecode = resolve; });
  const lateLoad = images[0].onload; lateLoad();
  fire(timers.find(t => t.active && t.ms === 12000));
  assert.equal(c.playlistCoverActive, 0); assert.equal(images[0].src, '');
  lateLoad(); resolveDecode(); await Promise.resolve();
  assert.equal(c.playlistCoverActive, 0); assert.equal(callbacks, 0); assert.equal(c.playlistCoverCache.slow.loaded, false);
  fire(timers.find(t => t.active && t.ms === 800)); images[1].onload();
  timers.filter(t => t.active && t.ms === 0).forEach(fire);
  assert.equal(callbacks, 1); assert.equal(c.playlistCoverActive, 0); assert.equal(c.playlistCoverCache.slow.img, images[1]);
});
test('image eviction and reset detach images but never revoke externally owned blob URLs', () => {
  const { c, images, revoked } = fixture();
  c.requestPlaylistCover('blob:shared'); images[0].onload(); const rec = c.playlistCoverCache['blob:shared'];
  rec.bytes = 25 * 1024 * 1024; c.trimPlaylistCoverCache();
  assert.equal(images[0].src, ''); assert.equal(rec.img, null); assert.equal(rec.bytes, 0);
  c.requestPlaylistCover('blob:current'); images[1].onload();
  c.requestPlaylistCover('active'); const active = c.playlistCoverCache.active;
  c.resetPlaylistCoverCache();
  assert.equal(c.playlistCoverActive, 0); assert.equal(c.playlistCoverQueue.length, 0);
  assert.equal(Object.keys(c.playlistCoverCache).length, 0);
  assert(images.every(img => img.src === '')); assert.equal(active.cancel, null); assert.equal(active.waiters.length, 0);
  assert.deepEqual(revoked, [], 'this module never created these URLs and must not revoke a shared producer resource');
});

test('global runtime trim uses cover disposal and preserves active, visible and nearby records', () => {
  const { c, images, timers, revoked } = fixture();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/00-state/08-desktop-render-power.js'), 'utf8'), c);
  c.collectProtectedCoverUrls = () => ({}); c.collectProtectedBeatMapKeys = () => ({});
  c.trimCoverDepthCache = () => 0; c.collectProtectedCoverDepthIds = () => ({});
  c.collectRuntimePerfSnapshot = () => {}; c.beatMapCache = {}; c.djBeatMapCache = {};
  c.requestPlaylistCover('blob:old'); images[0].onload(); const old = c.playlistCoverCache['blob:old'];
  const leftoverTimer = c.setTimeout(() => {}, 800); old.retryTimer = leftoverTimer;
  c.requestPlaylistCover('visible'); images[1].onload();
  c.requestPlaylistCover('nearby'); images[2].onload();
  c.playlistCoverViewportVisible.add('visible'); c.playlistCoverViewportNearby.add('nearby');
  c.requestPlaylistCover('active'); const activeImage = images[3];
  for (let i = 0; i < 100; i++) c.playlistCoverCache['old-failure-' + i] = failed(c);
  assert.equal(c.trimRuntimeCaches('test', true), 32);
  assert.equal(Object.keys(c.playlistCoverCache).length, 72);
  assert.equal(old.img, null); assert.equal(images[0].src, ''); assert.equal(leftoverTimer.active, false);
  assert.equal(images[1].src, 'visible'); assert.equal(images[2].src, 'nearby');
  assert.equal(activeImage.src, 'active'); assert.equal(c.playlistCoverActive, 1);
  assert.equal(timers.filter(t => t.active && t.ms === 12000).length, 1);
  assert.deepEqual(revoked, []);
  const ordinary = { a: 1, b: 2, c: 3 };
  assert.equal(c.trimObjectCache(ordinary, 1, { a: true }), 2);
  assert.deepEqual(ordinary, { a: 1 }, 'other cache paths keep their existing semantics');
});
