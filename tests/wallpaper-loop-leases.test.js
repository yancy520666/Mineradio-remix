'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { WallpaperLoopCache } = require('../desktop/wallpaper-engine-loop-cache');
const MiB = 1024 * 1024;
const settle = () => new Promise(resolve => setImmediate(resolve));
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-leases-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const cache = new WallpaperLoopCache({ root, library: {}, propertyStore: {} });
  const id = 'test', key = 'a'.repeat(64), bytes = Buffer.alloc(256, 1), files = cache.files(key);
  cache.identity = async () => ({ id, key });
  await fs.writeFile(files.video, bytes);
  await fs.writeFile(files.meta, JSON.stringify({ id, key, bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
  await fs.utimes(files.video, new Date(1000), new Date(1000));
  const ballast = async () => {
    for (let i = 1; i <= 8; i++) {
      const file = cache.files(i.toString(16).padStart(64, '0')).video;
      const handle = await fs.open(file, 'w');
      try { await handle.truncate(64 * MiB); } finally { await handle.close(); }
    }
  };
  return { root, cache, id, key, bytes, files, ballast };
}

test('same-key leases are independent, sender-bound and release makes unreferenced bytes evictable', async t => {
  const s = await fixture(t), owner = {}, other = {};
  const first = await s.cache.lookup(s.id, owner), second = await s.cache.lookup(s.id, owner);
  assert.notEqual(first.leaseId, second.leaseId);
  assert.equal((await s.cache.release(first.leaseId, other)).released, false);
  assert.equal((await s.cache.release(first.leaseId, owner)).released, true);
  assert.equal((await s.cache.release(first.leaseId, owner)).released, false);
  assert.equal((await s.cache.response(new Request(second.url, { method: 'HEAD' }))).status, 200);
  await s.ballast();
  await s.cache.release(second.leaseId, owner);
  assert.equal(s.cache.entries.size, 0); assert.equal(s.cache.leases.size, 0);
  await assert.rejects(fs.stat(s.files.video), { code: 'ENOENT' });
  assert.equal((await s.cache.prune()).videoBytes, 512 * MiB);
});

test('retiring one owner preserves another owner and conservative legacy pins', async t => {
  const s = await fixture(t), a = {}, b = {};
  await s.cache.lookup(s.id, a); const second = await s.cache.lookup(s.id, b);
  await s.cache.releaseOwner(a);
  assert.equal(s.cache.leaseCounts.get(s.key), 1);
  await s.cache.lookup(s.id); // An older renderer did not opt in.
  await s.cache.release(second.leaseId, b);
  assert.equal(s.cache.leases.size, 0); assert.equal(s.cache.entries.has(s.key), true);
});

test('an open range stream remains protected after the renderer releases its final lease', async t => {
  const s = await fixture(t), owner = {}, found = await s.cache.lookup(s.id, owner);
  // Keep the real stream open after its final byte until the test acknowledges
  // close. This models an in-flight OS read during renderer teardown.
  const original = syncFs.createReadStream;
  let opened;
  syncFs.createReadStream = function (file, options) {
    const stream = original.call(this, file, { ...options, autoClose: false, emitClose: true });
    opened = stream;
    return stream;
  };
  t.after(() => { syncFs.createReadStream = original; if (opened) opened.destroy(); });
  const response = await s.cache.response(new Request(found.url, { headers: { range: 'bytes=0-31' } }));
  syncFs.createReadStream = original;
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 32);
  await s.cache.release(found.leaseId, owner);
  assert.equal(s.cache.entries.has(s.key), true);
  assert.equal(s.cache.activeStreams.get(s.key), 1);
  await s.ballast();
  opened.destroy();
  await new Promise(resolve => opened.once('close', resolve));
  await s.cache.writeQueue;
  assert.equal(s.cache.entries.has(s.key), false);
  await assert.rejects(fs.stat(s.files.video), { code: 'ENOENT' });
});

function ipcHarness(cache) {
  const main = syncFs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  const code = main.slice(main.indexOf('const wallpaperLoopLeaseOwners ='), main.indexOf("ipcMain.handle('mineradio-wallpaper-engine-stop-scene'"));
  let handler;
  vm.runInNewContext(code, { WeakSet, wallpaperLoopCache: cache,
    ipcMain: { handle: (_name, value) => { handler = value; } },
    isTrustedWallpaperEngineIpc: event => event.trusted,
    wallpaperEngineRuntime: { getStatus: () => ({ active: true, id: 'test' }) },
  });
  const owner = () => { const value = new EventEmitter(); value.isDestroyed = () => false; return value; };
  return { handler, owner };
}

test('main IPC binds leases to actual sender and reclaims destroyed, crashed or navigated renderers', async t => {
  const s = await fixture(t), { handler, owner } = ipcHarness(s.cache);
  const a = owner(), b = owner(), call = (sender, payload) => handler({ sender, trusted: true }, payload);
  assert.equal((await handler({ sender: a, trusted: false }, { action: 'lookup', id: s.id })).ok, false);
  const first = await call(a, { action: 'lookup', id: s.id, leaseProtocol: 1 });
  assert.equal((await call(b, { action: 'release', leaseId: first.leaseId, owner: a })).released, false);
  assert.equal(s.cache.leases.size, 1);
  // Beginning an unsuccessful navigation is not proof that playback stopped.
  a.emit('did-start-navigation', {}, 'unused', false, true);
  a.emit('did-navigate-in-page', {}, 'unused#hash', true);
  a.emit('did-frame-navigate', {}, 'unused-frame', 200, 'OK', false, 1, 2);
  await s.cache.writeQueue; assert.equal(s.cache.leases.size, 1);
  for (const event of ['did-navigate', 'render-process-gone', 'destroyed']) {
    if (event !== 'did-navigate') await call(a, { action: 'lookup', id: s.id, leaseProtocol: 1 });
    a.emit(event); await s.cache.writeQueue;
    assert.equal(s.cache.leases.size, 0);
  }
  const legacy = await call(b, { action: 'lookup', id: s.id });
  assert.equal(legacy.leaseId, undefined); assert.equal(s.cache.entries.has(s.key), true);
});

function rendererHarness() {
  const source = syncFs.readFileSync(path.join(__dirname, '../public/js/modules/07-fx/03b-wallpaper-engine-loop.js'), 'utf8');
  const library = syncFs.readFileSync(path.join(__dirname, '../public/js/modules/07-fx/03-wallpaper-engine-library.js'), 'utf8');
  const lookup = defer(), stop = defer(), releases = [], order = [], item = { id: 'test' };
  const video = { getAttribute: () => video.src, removeAttribute(name) { order.push('remove:' + name); if (name === 'src') this.src = ''; },
    pause() { order.push('pause'); }, load() { order.push('load'); } };
  const api = { wallpaperEngineLoopCache: payload => {
    assert.equal(payload.leaseProtocol, 1);
    if (payload.action === 'release') { releases.push(payload.leaseId); order.push('release'); return Promise.resolve({ ok: true }); }
    return lookup.promise;
  } };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Date,
    window: { addEventListener() {} }, document: { getElementById: id => id === 'wallpaper-engine-video' ? video : null },
    localStorage: { getItem() {}, setItem() {} }, wallpaperEngineDesktopApi: () => api,
    wallpaperEngineSelection: { active: true, id: item.id, kind: 'engine' }, wallpaperEngineLayerToken: 0,
    wallpaperEngineProjectById: () => item, stopWallpaperEngineNativeSession: () => stop.promise,
    cancelWallpaperEngineSwitchTimer() {}, restoreOriginalBackgroundAfterWallpaperEngine() {},
    saveWallpaperEngineSelection() {}, flushWallpaperEngineVisualSettings() {}, applyWallpaperEngineBackground() {},
    showToast() {}, renderWallpaperEngineLibrary() {}, cancelWallpaperEngineVideoRetry() {}, cancelWallpaperEngineFirstFrameWait() {},
    clearWallpaperEngineFreezeFrame() {}, stopWallpaperEngineCaptureStream() {},
  });
  vm.runInContext(source, c);
  vm.runInContext(library.slice(library.indexOf('function clearWallpaperEngineLayerMedia('), library.indexOf('function restoreOriginalBackgroundAfterWallpaperEngine(')), c);
  c.setWallpaperEnginePlaybackMode('loop');
  return { c, video, item, lookup, stop, releases, order };
}

test('renderer releases stale cache replies and canceled pending playback exactly once', async () => {
  const s = rendererHarness();
  s.c.startWallpaperEngineLoopBackground(s.item); await settle();
  s.c.cancelWallpaperEngineLoop();
  s.lookup.resolve({ ok: true, cached: true, leaseId: 'late', url: 'unused' });
  await settle(); assert.deepEqual(s.releases, ['late']);
  const next = rendererHarness();
  next.c.startWallpaperEngineLoopBackground(next.item); await settle();
  next.lookup.resolve({ ok: true, cached: true, leaseId: 'pending', url: 'unused' });
  await settle(); next.c.cancelWallpaperEngineLoop(); next.stop.resolve({ ok: true });
  await settle(); assert.deepEqual(next.releases, ['pending']);
});

test('media owns playing lease until actual src teardown; task cancellation and pause retain it', async () => {
  const s = rendererHarness();
  s.c.startWallpaperEngineLoopBackground(s.item); await settle();
  s.lookup.resolve({ ok: true, cached: true, leaseId: 'playing', url: 'loop-url' });
  s.stop.resolve({ ok: true }); await settle();
  assert.equal(s.video.wallpaperLoopLeaseId, 'playing');
  s.c.cancelWallpaperEngineLoop(); s.video.pause();
  assert.deepEqual(s.releases, []);
  s.order.length = 0; s.c.clearWallpaperEngineLayerMedia(0);
  assert.deepEqual(s.releases, ['playing']);
  assert(s.order.indexOf('release') > s.order.indexOf('remove:src'));
  assert(s.order.indexOf('release') > s.order.indexOf('load'));
  s.c.clearWallpaperEngineLayerMedia(0); assert.deepEqual(s.releases, ['playing']);
});

test('same-key re-recording cannot replace a leased video or invalidate its later ranges', async t => {
  const s = await fixture(t), owner = {}, found = await s.cache.lookup(s.id, owner);
  const job = await s.cache.begin(s.id), bytes = Buffer.alloc(256, 9); bytes.writeUInt32BE(0x1a45dfa3);
  await s.cache.append(job.jobId, bytes);
  await assert.rejects(s.cache.finish(job.jobId, {}, owner), /LOOP_CACHE_IN_USE/);
  const response = await s.cache.response(new Request(found.url, { headers: { range: 'bytes=64-95' } }));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), s.bytes.subarray(64, 96));
  await s.cache.release(found.leaseId, owner);
  while (s.cache.activeStreams.size) await settle();
  await s.cache.writeQueue;
  const recorded = await s.cache.finish(job.jobId, {}, owner);
  assert(recorded.leaseId); assert.notEqual(recorded.leaseId, found.leaseId);
  assert.deepEqual(await fs.readFile(s.files.video), bytes);
});

test('a current video playback failure unloads the source and retires its lease', async () => {
  const s = rendererHarness(); s.c.updateWallpaperEngineEntryUi = () => {};
  s.c.startWallpaperEngineLoopBackground(s.item); await settle();
  s.lookup.resolve({ ok: true, cached: true, leaseId: 'failed-video', url: 'bad-loop' });
  s.stop.resolve({ ok: true }); await settle();
  s.video.onerror();
  assert.equal(s.video.src, '');
  assert.deepEqual(s.releases, ['failed-video']);
});

test('failed re-verification never revokes an existing lease or permits its file to be replaced', async t => {
  const s = await fixture(t), owner = {}, found = await s.cache.lookup(s.id, owner);
  await fs.writeFile(s.files.meta, 'broken metadata');
  assert.equal((await s.cache.lookup(s.id, {})).cached, false);
  assert.equal(s.cache.entries.has(s.key), true);
  assert.equal((await s.cache.response(new Request(found.url, { method: 'HEAD' }))).status, 200);
  const job = await s.cache.begin(s.id), bytes = Buffer.alloc(256, 3); bytes.writeUInt32BE(0x1a45dfa3);
  await s.cache.append(job.jobId, bytes);
  await assert.rejects(s.cache.finish(job.jobId, {}, owner), /LOOP_CACHE_IN_USE/);
  await s.cache.abort(job.jobId); await s.cache.release(found.leaseId, owner);
});
