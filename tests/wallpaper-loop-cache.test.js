'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WallpaperLoopCache } = require('../desktop/wallpaper-engine-loop-cache');

async function setup(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mineradio-loop-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const projectFile = path.join(temp, 'project.json'), nativeFile = path.join(temp, 'scene.pkg');
  await fs.writeFile(projectFile, '{"type":"scene"}'); await fs.writeFile(nativeFile, 'PKGV0001');
  let properties = {}, type = 'scene';
  const options = { root: path.join(temp, 'cache'),
    library: { getNativeSceneTarget: async id => ({ id, projectFile, nativeFile, projectType: type }),
      getProjectDetails: async () => ({ properties: [] }) },
    propertyStore: { values: async () => properties } };
  const cache = new WallpaperLoopCache(options);
  const id = 'a'.repeat(24), bytes = Buffer.alloc(256, 7); bytes.writeUInt32BE(0x1a45dfa3);
  const save = async () => { const job = await cache.begin(id); await cache.append(job.jobId, bytes); return cache.finish(job.jobId); };
  return { cache, options, id, bytes, save, nativeFile, temp,
    properties: value => { properties = value; }, type: value => { type = value; } };
}
test('recording survives restart, exposes only a capability URL and supports seeking', async t => {
  const s = await setup(t);
  assert.equal((await s.cache.lookup(s.id)).cached, false);
  const saved = await s.save(), restarted = new WallpaperLoopCache(s.options);
  const read = await restarted.lookup(s.id);
  assert.equal(read.cached, true); assert.equal(saved.bytes, 256);
  assert.equal(saved.duration, 20); assert.equal(saved.fps, 30);
  assert.equal((await restarted.response(new Request(read.url, { headers: { range: 'bytes=4-19' } }))).status, 206);
  const response = await restarted.response(new Request(read.url, { headers: { range: 'bytes=4-19' } }));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), s.bytes.subarray(4, 20));
  assert.equal((await restarted.response(new Request(saved.url))).status, 404);
  assert.equal((await restarted.response(new Request(read.url, { headers: { range: 'bytes=500-' } }))).status, 416);
});
test('project updates, changed settings and damaged recordings invalidate the cache', async t => {
  const s = await setup(t), saved = await s.save();
  s.properties({ color: '1 0 0' }); assert.equal((await s.cache.lookup(s.id)).cached, false);
  s.properties({}); await fs.writeFile(s.cache.files(saved.key).video, Buffer.alloc(256));
  assert.equal((await s.cache.lookup(s.id)).cached, false);
  const next = new WallpaperLoopCache(s.options), job = await next.begin(s.id);
  await next.append(job.jobId, s.bytes); await next.finish(job.jobId);
  await fs.writeFile(s.nativeFile, 'PKGV0001-new');
  assert.equal((await next.lookup(s.id)).cached, false);
  s.type('web'); const old = await s.cache.identity(s.id);
  await fs.writeFile(path.join(s.temp, 'style.css'), 'body { color: red; }');
  assert.notEqual((await s.cache.identity(s.id)).key, old.key);
});
test('switching during upload cancels its partial file and rejects late chunks', async t => {
  const s = await setup(t), job = await s.cache.begin(s.id);
  await Promise.all([s.cache.append(job.jobId, s.bytes), s.cache.abort(job.jobId)]);
  await assert.rejects(s.cache.append(job.jobId, s.bytes), /EXPIRED/);
  assert.deepEqual(await fs.readdir(s.options.root), []);
  const next = await s.cache.begin(s.id);
  s.properties({ clock: true });
  await assert.rejects(s.cache.append(next.jobId, Buffer.alloc(1024 * 1024 + 1)), /SIZE_LIMIT/);
  await assert.rejects(s.cache.append(next.jobId, Buffer.alloc(256)), /WEBM_REQUIRED/);
  await s.cache.append(next.jobId, s.bytes);
  await assert.rejects(s.cache.finish(next.jobId), /PROJECT_CHANGED/);
  await s.cache.abortAll(); assert.deepEqual(await fs.readdir(s.options.root), []);
});
test('the recorded capture size is stored and reported for regeneration hints', async t => {
  const s = await setup(t), job = await s.cache.begin(s.id);
  await s.cache.append(job.jobId, s.bytes);
  const saved = await s.cache.finish(job.jobId, { width: 1280, height: 720 });
  assert.equal(saved.recordedWidth, 1280); assert.equal(saved.recordedHeight, 720);
  const read = await new WallpaperLoopCache(s.options).lookup(s.id);
  assert.equal(read.recordedWidth, 1280); assert.equal(read.recordedHeight, 720);
  // Simulate the next process: legacy callers have no retirement protocol.
  const next = new WallpaperLoopCache(s.options), nextJob = await next.begin(s.id);
  await next.append(nextJob.jobId, s.bytes); await next.finish(nextJob.jobId);
  assert.equal((await next.lookup(s.id)).recordedWidth, 0, 'unknown size is not reported as low');
});

test('release waits for in-flight lookup hashing, then preserves its newly issued playable lease', async t => {
  const s = await setup(t), saved = await s.save();
  const restarted = new WallpaperLoopCache(s.options);
  const syncFs = require('node:fs');
  const { Readable } = require('node:stream');
  const { releaseFlatCache } = require('../desktop/cache-release');
  const video = restarted.files(saved.key).video;
  const original = syncFs.createReadStream;
  let hashing, finishHash;
  const started = new Promise(resolve => { hashing = resolve; });
  const gate = new Promise(resolve => { finishHash = resolve; });
  syncFs.createReadStream = function (file, ...args) {
    if (file !== video) return original.call(this, file, ...args);
    return Readable.from((async function* () {
      for await (const chunk of original.call(syncFs, file, ...args)) yield chunk;
      hashing();
      await gate; // Hold lookup just before the completed digest is verified.
    })());
  };
  t.after(() => { finishHash(); syncFs.createReadStream = original; });
  const lookup = restarted.lookup(s.id);
  await started;
  let releaseStarted = false;
  const release = restarted.mutate(() => {
    releaseStarted = true;
    return releaseFlatCache({ category: 'wallpaperLoops', root: restarted.root,
      pattern: /^[a-f0-9]{64}\.(?:webm|json)$/,
      keep: () => [...restarted.entries.keys()].flatMap(key => Object.values(restarted.files(key))),
    });
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releaseStarted, false, 'release cannot sweep before lookup pins its URL');
  finishHash();
  const found = await lookup, result = await release;
  syncFs.createReadStream = original;
  assert.equal(found.cached, true); assert.equal(result.deletedFiles, 0); assert.equal(result.skippedFiles, 2);
  const response = await restarted.response(new Request(found.url));
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), s.bytes);
});

test('cancelled queued update cleanup never aborts recording jobs resumed after timeout', async () => {
  const cache = new WallpaperLoopCache({ root: path.join(os.tmpdir(), 'unused-cancelled-loop-fixture'), library: {}, propertyStore: {} });
  let releaseQueue;
  cache.mutate(() => new Promise(resolve => { releaseQueue = resolve; }));
  cache.jobs.set('old', { temp: 'never-touched' });
  const controller = new AbortController();
  const abort = cache.abortAll({ signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  cache.jobs.set('resumed', { temp: 'never-touched' });
  releaseQueue(); await abort;
  assert.deepEqual([...cache.jobs.keys()], ['old', 'resumed']);
});

test('cancellable update cleanup owns a snapshot, not jobs created while waiting for the write queue', async () => {
  const cache = new WallpaperLoopCache({ root: path.join(os.tmpdir(), 'unused-owned-loop-fixture'), library: {}, propertyStore: {} });
  let releaseQueue;
  cache.mutate(() => new Promise(resolve => { releaseQueue = resolve; }));
  cache.jobs.set('old', {});
  const aborted = [];
  cache.abortJob = async id => { aborted.push(id); cache.jobs.delete(id); };
  const abort = cache.abortAll({ signal: new AbortController().signal });
  await new Promise(resolve => setImmediate(resolve));
  cache.jobs.set('new', {});
  releaseQueue(); await abort;
  assert.deepEqual(aborted, ['old']); assert(cache.jobs.has('new'));
});
