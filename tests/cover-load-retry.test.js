'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '../public/js/modules', file), 'utf8');

function setup() {
  const images = [], timers = [], applied = [];
  class Image {
    constructor() { this.naturalWidth = this.naturalHeight = 400; images.push(this); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  }
  const el = () => ({ src: '', style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    removeAttribute(name) { if (name === 'src') this.src = ''; } });
  const nodes = { 'thumb-cover': el() };
  const c = vm.createContext({
    Image, URL, Event, window: { addEventListener() {}, dispatchEvent() {} },
    performance: { now: () => 0 }, navigator: { onLine: true },
    audio: { paused: false }, playing: true, persistentLyricCacheKey: song => String(song.id),
    setTimeout(fn, ms) { const t = { fn, ms, done: false }; timers.push(t); return t; },
    clearTimeout(t) { if (t) t.done = true; },
    document: {
      getElementById: id => nodes[id] || null,
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, clearRect() {} }) }),
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    uniforms: { uHasCover: { value: 1 } }, fx: { coverResolution: 1 },
    trackSwitchToken: 1, coverTextureTrackToken: 0, currentCoverSource: null, coverProcessToken: 0,
    playQueue: [], currentIdx: 0, customCoverMap: {},
    shown: { thumb: 'old', control: 'old', bg: 'old' },
    coverApplyStillCurrent(opts) { return !opts || opts.trackToken == null || opts.trackToken === c.trackSwitchToken; },
    previewCurrentTrackCover(src) { c.shown.thumb = src; c.shown.control = src; },
    setControlCoverSrc(src) { c.shown.control = src; },
    coverTextureSizeForResolution() { return 64; },
    applyCoverCanvas(cv, src, opts) { applied.push({ src, token: opts.trackToken }); c.shown.texture = src; },
    setCoverDepthState() {}, resetFloatColorsToIdle() {}, openGsapModal() {},
  });
  vm.runInContext(read('05-playback/01-cover-custom-map.js'), c);
  vm.runInContext(read('03-beat/05a-adjacent-preparation.js'), c);
  vm.runInContext(read('03-beat/05-cover-loading-crop.js'), c);
  // Album background crossfade is covered elsewhere; record what it is told.
  c.setAlbumBackground = src => { c.shown.bg = src; };
  const fire = () => { const t = timers.find(x => !x.done); assert(t, 'a timer is pending'); t.done = true; t.fn(); return t; };
  return { c, images, timers, applied, fire, last: () => images[images.length - 1] };
}
const cdn = 'https://p1.music.126.net/a/new.jpg?param=400y400';
const proxied = '/api/cover?url=' + encodeURIComponent(cdn);

test('the old cover stays on every surface until the new one loads, then all switch together', () => {
  const s = setup();
  s.c.loadCoverFromUrl(cdn, { trackToken: 1, seamlessTrackSwitch: true });
  assert.equal(s.last().src, proxied);
  assert.deepEqual({ ...s.c.shown }, { thumb: 'old', control: 'old', bg: 'old' });
  s.last().onload();
  assert.deepEqual({ ...s.c.shown }, { thumb: proxied, control: proxied, bg: proxied, texture: proxied });
});

test('a failing proxy is retried, then the CDN is tried directly', () => {
  const s = setup();
  s.c.loadCoverFromUrl(cdn, { trackToken: 1, seamlessTrackSwitch: true });
  s.last().onerror();
  const wait = s.fire();
  assert.equal(wait.ms, 700);
  assert.equal(s.last().src, proxied, 'second try goes through the proxy again');
  s.fire(); // the attempt timeout counts as a failure too
  s.fire();
  assert.equal(s.last().src, cdn);
  s.last().onload();
  assert.equal(s.c.shown.texture, cdn);
});

test('when every attempt fails the previous song art is cleared, not left behind', () => {
  const s = setup();
  s.c.loadCoverFromUrl(cdn, { trackToken: 1, seamlessTrackSwitch: true });
  for (let i = 0; i < 3; i++) { s.last().onerror(); s.fire(); }
  assert.equal(s.c.uniforms.uHasCover.value, 0);
  assert.equal(s.c.shown.control, '');
  assert.equal(s.c.shown.bg, '');
  assert.equal(s.applied.length, 0);
});

test('a newer track switch stops the older cover from landing or retrying', () => {
  const s = setup();
  s.c.loadCoverFromUrl(cdn, { trackToken: 1, seamlessTrackSwitch: true });
  const first = s.last();
  s.c.trackSwitchToken = 2;
  s.c.loadCoverFromUrl('https://p1.music.126.net/b/next.jpg?param=400y400', { trackToken: 2, seamlessTrackSwitch: true });
  assert.equal(first.onload, null, 'the superseded request is detached');
  assert.equal(first.src, '');
  s.last().onload();
  assert.equal(s.applied.length, 1);
  assert.equal(s.applied[0].token, 2);
});

test('after a cover settles the next queued covers are warmed with the playback address', () => {
  const s = setup();
  s.c.playQueue = [
    { id: 1, cover: 'https://p1.music.126.net/a/new.jpg' },
    { id: 2, cover: 'https://p1.music.126.net/b/two.jpg' },
    { id: 3, cover: 'https://p1.music.126.net/c/three.jpg', customCover: 'data:image/png;base64,AA' },
  ];
  s.c.loadCoverFromUrl(cdn, { trackToken: 1, seamlessTrackSwitch: true });
  s.last().onload();
  s.fire();
  assert.equal(s.last().src, s.c.coverProxySrc(s.c.coverUrlWithSize(s.c.playQueue[1].cover, 400)) + '&priority=background');
  assert.equal(s.last().fetchPriority, 'low');
  const count = s.images.length;
  s.last().onload();
  s.fire();
  assert.equal(s.images.length, count, 'custom covers need no network warm-up');
});

test('failed and cancelled prefetches can retry; only loaded covers are marked done', () => {
  const s = setup();
  s.c.playQueue = [{ id: 1 }, { id: 2, cover: cdn }];
  s.c.upcomingCoverPrefetch.token = 1;
  s.c.runUpcomingCoverPrefetch(1);
  s.last().onerror();
  assert.equal(s.c.upcomingCoverPrefetch.done[proxied], undefined);
  assert(s.c.upcomingCoverPrefetch.retryAfter[proxied] > Date.now());
  assert.equal(s.c.upcomingCoverPrefetchUrls().length, 0, 'cooldown prevents a tight error loop');
  s.c.upcomingCoverPrefetch.retryAfter[proxied] = Date.now() - 1;
  s.c.runUpcomingCoverPrefetch(1);
  assert.equal(s.images.length, 2);
  const cancelled = s.last();
  s.c.cancelUpcomingCoverPrefetch();
  assert.equal(cancelled.onload, null);
  s.c.runUpcomingCoverPrefetch(1);
  s.last().onload();
  assert(Number(s.c.upcomingCoverPrefetch.done[proxied]) > Date.now() - 30000, 'successful warm-up stores its freshness timestamp');
  assert.equal(s.c.upcomingCoverPrefetchUrls().length, 0);
});
