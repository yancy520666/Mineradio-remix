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
  await s.save(); await fs.writeFile(s.nativeFile, 'PKGV0001-new');
  assert.equal((await s.cache.lookup(s.id)).cached, false);
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
  await s.save();
  assert.equal((await s.cache.lookup(s.id)).recordedWidth, 0, 'unknown size is not reported as low');
});
