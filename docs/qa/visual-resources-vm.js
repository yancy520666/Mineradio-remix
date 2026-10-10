'use strict';
// Read-only source probes: in-memory DOM/IDB/image doubles, no app/server/accounts.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const baseline = process.argv.includes('--baseline');
const root = path.resolve(__dirname, '../..');
const read = p => baseline ? execFileSync('git', ['show', 'HEAD:' + p], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, p), 'utf8');
function dashboardFixture() {
  const store = new Map(), notices = [], timers = [];
  const c = vm.createContext({ console, URL, Map, Set, Date,
    document: { hidden: false, body: { classList: { contains: n => n === 'empty-home-active' } },
      getElementById: () => null, querySelector: () => null, addEventListener() {} },
    window: { addEventListener() {} },
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    emptyHomeActive: true, performance: { now: () => 100 },
    setTimeout: (fn, ms) => { const t = { fn, ms, active: true }; timers.push(t); return t; }, clearTimeout: t => { if (t) t.active = false; },
    showToast: v => notices.push(v), isDeepBackgroundMode: () => true,
    desktopRuntimeState: { desktop: true, minimized: true, visible: false },
  });
  let source = read('public/js/modules/05-playback/03a-home-dashboard.js');
  source = source.replace(/\nbindHomeDashboardVideoControls\(\);\nbindHomePlatformRecommendationControls\(\);\nrenderHomeDashboard\(\);\s*$/, '\n');
  vm.runInContext(source, c);
  return { c, store, notices, timers };
}
(async () => {
  const f = dashboardFixture();
  const native = { documentHidden: f.c.document.hidden, minimized: f.c.desktopRuntimeState.minimized,
    visible: f.c.desktopRuntimeState.visible, deepBackground: f.c.isDeepBackgroundMode(),
    homeVideoShouldPlay: f.c.homeDashboardVideoShouldPlay() };
  if (baseline) assert.equal(native.homeVideoShouldPlay, true);
  console.log('native-window-video-policy', JSON.stringify(native));
  f.c.isDeepBackgroundMode = () => false;
  const network = [];
  f.c.Image = class { constructor() { network.push(this); } decode() { return Promise.resolve(); } removeAttribute() { this.src = ''; } };
  f.c.cssImageUrl = src => src;
  const art = { isConnected: true, style: { backgroundImage: 'old-art' } };
  f.c.homeDashboardSetStableBackgroundImage(art, 'https://fixture.invalid/new.jpg');
  network[0].onerror();
  const retry = f.timers.find(t => t.active && t.ms === 800);
  if (retry) { retry.active = false; retry.fn(); network[1].onerror(); }
  for (let i = 0; i < 100; i++) f.c.homeDashboardSetStableBackgroundImage(art, 'https://fixture.invalid/new.jpg');
  if (baseline) { assert.equal(network.length, 1); assert.equal(art.style.backgroundImage, 'old-art'); }
  console.log('home-cover-failure', JSON.stringify({ attemptsAfter100Refreshes: network.length, displayed: art.style.backgroundImage }));
  for (let i = 0; i < 30; i++) f.c.homeDashboardSetStableBackgroundImage(art, 'https://fixture.invalid/' + i + '.jpg');
  console.log('home-cover-supersession', JSON.stringify({ imagesCreated: network.length, obsoleteSrcsCleared: network.filter(image => image.src === '').length }));

  // Intentionally a promise-order stress case, NOT an IndexedDB scheduler model.
  // Real same-store transactions are serial; this proves a missing action guard only.
  let finishSave, deleted = false;
  f.c.homeDashboardPutVideoBlob = () => new Promise(resolve => { finishSave = resolve; });
  f.c.homeDashboardDeleteVideoBlob = async () => { deleted = true; };
  f.c.homeDashboardUpdateVideoPower = () => {};
  const selecting = f.c.handleHomeDashboardVideoFile({ name: 'new.mp4', type: 'video/mp4', size: 5 });
  await f.c.clearHomeDashboardVideo();
  assert.equal(f.store.has(f.c.HOME_DASHBOARD_VIDEO_META_KEY), false);
  finishSave(); await selecting;
  const rawMeta = f.store.get(f.c.HOME_DASHBOARD_VIDEO_META_KEY);
  const resurrected = rawMeta ? JSON.parse(rawMeta) : null;
  if (baseline) assert.equal(resurrected.name, 'new.mp4');
  console.log('remove-during-save-abstract-order-only', JSON.stringify({ deleted, metadataAfterRemove: resurrected, notices: f.notices }));

  const images = [], timers = [], events = {};
  const shelf = vm.createContext({ console, Map, Set,
    Image: class { constructor() { images.push(this); } removeAttribute() { this.src = ''; } },
    performance: { now: () => 100, getEntriesByName: () => [] },
    setTimeout: (fn, ms) => { const t = { fn, ms, active: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.active = false; },
    window: { addEventListener: (name, fn) => { events[name] = fn; } },
    THREE: { Vector3: function () {}, Object3D: function () {}, Matrix4: function () {} },
    playlistCoverCache: {}, coverProxySrc: src => src, coverUrlWithSize: src => src,
    isInlineCoverSrc: () => false, shelfLayoutProfile: () => ({ detail: {} }),
    userPlaylists: [], myPodcastCollections: [] });
  vm.runInContext(read('public/js/modules/04-shelf/04a-cover-loader.js'), shelf);
  let managerSource = read('public/js/modules/04-shelf/03-content-list-manager.js');
  // Only expose closure setup for this fixture. The real close() body is unchanged.
  managerSource = managerSource.replace('    isOpen: function () { return open; },',
    '    __qaPrimeOpen: function () { open = true; group = {}; },\n    isOpen: function () { return open; },');
  vm.runInContext(managerSource, shelf);
  const manager = shelf.makeContentListManager(); manager.__qaPrimeOpen();
  const urls = Array.from({ length: 19 }, (_, i) => 'https://fixture.invalid/row-' + i + '.jpg');
  shelf.updatePlaylistCoverViewport([urls[0]], urls.slice(1));
  urls.forEach(url => shelf.requestPlaylistCover(url, null, { scope: 'content' }));
  manager.close();
  const closed = { open: manager.isOpen(), active: shelf.playlistCoverActive, queued: shelf.playlistCoverQueue.length,
    visibleUrls: shelf.playlistCoverViewportVisible.size, nearbyUrls: shelf.playlistCoverViewportNearby.size };
  assert.equal(closed.open, false); if (baseline) assert.equal(closed.queued, 17);
  console.log('closed-content-cover-state', JSON.stringify(closed));


  const blobs = new Map();
  const custom = vm.createContext({ console, Map, Date, Math, Promise,
    window: { addEventListener() {} }, document: { querySelectorAll: () => [], getElementById: () => null },
    fx: {}, setTimeout: () => 1, clearTimeout() {}, showToast() {}, saveLyricLayout() {} });
  vm.runInContext(read('public/js/modules/02-visual/06-custom-background-colorlab.js'), custom);
  vm.runInContext(read('public/js/modules/07-fx/02-accent-background-controls.js'), custom);
  custom.updateCustomBackgroundControls = () => {};
  custom.openCustomBackgroundCropModalSoon = () => {};
  custom.openCustomBackgroundDb = async () => ({
    close() {}, transaction() {
      const tx = { objectStore: () => ({
        put: record => { blobs.set(record.id, record); queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); }); return {}; },
        delete: id => { blobs.delete(id); queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); }); },
      }) };
      return tx;
    },
  });
  for (let i = 0; i < 3; i++) {
    custom.readBackgroundVideoFile({ name: 'video-' + i + '.mp4', type: 'video/mp4', size: 500 * 1024 * 1024 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(custom.fx.backgroundMedia.type, 'video', 'fixture IDB put returns its real API request shape');
  }
  custom.clearCustomBackgroundImage();
  const disk = { currentMedia: custom.fx.backgroundMedia, retainedBlobs: blobs.size,
    representedBytes: [...blobs.values()].reduce((n, rec) => n + rec.blob.size, 0) };
  if (baseline) assert.equal(disk.retainedBlobs, 3);
  console.log('custom-background-video-store', JSON.stringify(disk));

})().catch(err => { console.error(err); process.exitCode = 1; });
