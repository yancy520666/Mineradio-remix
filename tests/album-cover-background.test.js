'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const images = [], timers = [], refreshed = [];
  class Image {
    constructor() { this.naturalWidth = this.naturalHeight = 2048; images.push(this); }
    removeAttribute() { this.src = ''; }
    decode() { return Promise.resolve(); }
  }
  const c = vm.createContext({ URL, Image, window: { location: new URL('http://localhost:3000/index.html') },
    setTimeout(fn) { const timer = { fn }; timers.push(timer); return timer; }, clearTimeout() {},
    fx: { backgroundAlbumCover: true }, albumBackgroundCurrentSrc: '', currentCoverSource: null,
    customBackgroundUsesAlbumCover() { return c.fx.backgroundAlbumCover; },
    refreshCustomBackgroundAlbumMedia() { refreshed.push(c.customBackgroundAlbumCoverSource()); },
  });
  for (const file of ['05-playback/01-cover-custom-map.js', '07-fx/02a-album-cover-background.js', '07-fx/02-accent-background-controls.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules', file), 'utf8'), c);
  }
  return { c, images, timers, refreshed };
}
const remote = name => 'https://p1.music.126.net/key/' + name + '.jpg?param=400y400&token=keep';
const original = (c, src) => c.coverProxySrc(src, false);

test('the live playback thumbnail stays visible until the larger background is decoded', async () => {
  const { c, images, refreshed } = setup();
  const thumbnail = c.albumBackgroundCurrentSrc = original(c, remote('a'));
  assert.equal(c.customBackgroundAlbumCoverSource(), thumbnail);
  const requested = new URL(images[0].src, c.window.location.href);
  const high = new URL(requested.searchParams.get('url'));
  assert.equal(high.searchParams.get('param'), '2048y2048');
  assert.equal(high.searchParams.get('token'), 'keep');
  const highSource = images[0].src;
  for (let i = 0; i < 5; i++) c.customBackgroundAlbumCoverSource();
  assert.equal(images.length, 1);
  images[0].onload();
  assert.equal(c.customBackgroundAlbumCoverSource(), thumbnail);
  await Promise.resolve();
  assert.equal(c.customBackgroundAlbumCoverSource(), highSource);
  assert.deepEqual(refreshed, [highSource]);
  assert.equal(c.albumBackgroundCurrentSrc, thumbnail);
});

test('known provider thumbnails are upgraded and unknown, inline and signed sources stay intact', () => {
  const { c } = setup();
  const qq = new URL(new URL(c.albumCoverBackgroundFullSource(original(c,
    'https://y.qq.com/music/photo_new/T002R300x300M000album.jpg?max_age=2592000&param=400y400')),
    c.window.location.href).searchParams.get('url'));
  assert.equal(qq.pathname, '/music/photo_new/T002R800x800M000album.jpg');
  assert.equal(qq.searchParams.get('max_age'), '2592000');
  assert.equal(qq.searchParams.has('param'), false);
  const alreadyLarge = original(c, 'https://p2.music.126.net/cover.jpg?param=3000y3000');
  assert.equal(c.albumCoverBackgroundSource(alreadyLarge), alreadyLarge);
  assert.match(decodeURIComponent(c.albumCoverBackgroundFullSource(original(c,
    'https://imge.kugou.com/stdmusic/240/20260101/album.jpg?param=400y400'))), /stdmusic\/20260101\/album.jpg/);
  for (const src of ['data:image/png;base64,test', 'blob:test', 'mineradio-local://cover/test',
    original(c, 'https://signed.example/cover.jpg?param=400y400&signature=keep')]) {
    assert.equal(c.albumCoverBackgroundSource(src), src);
  }
});

test('a late image or decode from an earlier song cannot replace the current cover', async () => {
  const { c, images, refreshed } = setup();
  let decode;
  c.albumBackgroundCurrentSrc = original(c, remote('a'));
  c.customBackgroundAlbumCoverSource();
  images[0].decode = () => new Promise(resolve => { decode = resolve; });
  images[0].onload();
  c.albumBackgroundCurrentSrc = original(c, remote('b'));
  const thumbnail = c.customBackgroundAlbumCoverSource();
  decode(); await Promise.resolve();
  assert.equal(c.customBackgroundAlbumCoverSource(), thumbnail);
  assert.deepEqual(refreshed, []);
  const highSource = images[1].src;
  images[1].onload(); await Promise.resolve();
  assert.equal(c.customBackgroundAlbumCoverSource(), highSource);
});

test('errors and timeouts keep the fallback without repeated requests; toggling allows a fresh attempt', async () => {
  const { c, images, timers, refreshed } = setup();
  const thumbnail = c.albumBackgroundCurrentSrc = original(c, remote('a'));
  c.customBackgroundAlbumCoverSource(); images[0].onerror();
  for (let i = 0; i < 5; i++) assert.equal(c.customBackgroundAlbumCoverSource(), thumbnail);
  assert.equal(images.length, 1);
  c.cancelAlbumCoverBackgroundLoad(); c.customBackgroundAlbumCoverSource();
  let decode;
  images[1].decode = () => new Promise(resolve => { decode = resolve; });
  images[1].onload(); timers[1].fn(); decode(); await Promise.resolve();
  assert.equal(c.customBackgroundAlbumCoverSource(), thumbnail);
  assert.equal(images.length, 2);
  assert.deepEqual(refreshed, []);
});

test('promotion also rechecks a changed live source before its next UI refresh', async () => {
  const { c, images, refreshed } = setup();
  c.albumBackgroundCurrentSrc = original(c, remote('a')); c.customBackgroundAlbumCoverSource();
  c.albumBackgroundCurrentSrc = original(c, remote('b'));
  images[0].onload(); await Promise.resolve();
  assert.equal(c.customBackgroundAlbumCoverSource(), c.albumBackgroundCurrentSrc);
  assert.equal(images.length, 2);
  assert.deepEqual(refreshed, []);
});

test('switching to a custom or absent cover cancels pending promotion', async () => {
  const { c, images, refreshed } = setup();
  c.albumBackgroundCurrentSrc = original(c, remote('a')); c.customBackgroundAlbumCoverSource();
  const callback = images[0].onload;
  c.albumBackgroundCurrentSrc = 'data:image/png;base64,custom';
  assert.equal(c.customBackgroundAlbumCoverSource(), c.albumBackgroundCurrentSrc);
  callback(); await Promise.resolve();
  assert.deepEqual(refreshed, []);
  assert.equal(c.albumCoverBackgroundSource(''), '');
  c.albumBackgroundCurrentSrc = original(c, remote('b')); c.customBackgroundAlbumCoverSource();
  c.fx.backgroundAlbumCover = false;
  assert.equal(c.customBackgroundAlbumCoverSource(), c.albumBackgroundCurrentSrc);
  assert.equal(images[1].onload, null);
  assert.equal(images.length, 2, 'Inactive or legacy cover previews must not start high-resolution requests');
});
