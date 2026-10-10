'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { WallpaperLoopCache } = require('../desktop/wallpaper-engine-loop-cache');
const MiB = 1024 * 1024;

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-prune-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const cache = new WallpaperLoopCache({ root, library: {}, propertyStore: {} });
  async function seed(index, size = 64 * MiB, pinned = false) {
    const key = index.toString(16).padStart(64, '0'), files = cache.files(key);
    const handle = await fs.open(files.video, 'w');
    try { await handle.truncate(size); } finally { await handle.close(); }
    await fs.writeFile(files.meta, JSON.stringify({ bytes: 1 })); // Never trust metadata's size for capacity.
    const age = new Date(1000 * (index + 1));
    await fs.utimes(files.video, age, age);
    if (pinned) cache.pin(key, files.video);
    return { key, ...files };
  }
  return { root, cache, seed };
}

test('automatic finish pruning keeps every issued URL while evicting oldest inactive recordings', async t => {
  const { cache, seed, root } = await fixture(t);
  const active = await seed(0, 64 * MiB, true);
  const stale = await seed(1);
  for (let i = 2; i < 9; i++) await seed(i);
  const key = 'f'.repeat(64), id = 'new', jobId = 'recording';
  const bytes = Buffer.alloc(256, 7), temp = path.join(root, 'recording.partial');
  await fs.writeFile(temp, bytes);
  cache.identity = async () => ({ id, key });
  cache.jobs.set(jobId, { id, key, temp, bytes: bytes.length,
    digest: crypto.createHash('sha256').update(bytes), expires: Date.now() + 10000 });
  const result = await cache.finish(jobId);
  assert.equal((await cache.response(new Request(cache.url(active.key), { method: 'HEAD' }))).status, 200);
  const range = await cache.response(new Request(cache.url(active.key), { headers: { range: 'bytes=12-23' } }));
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 12);
  await assert.rejects(fs.stat(stale.video), { code: 'ENOENT' });
  await assert.rejects(fs.stat(stale.meta), { code: 'ENOENT' });
  assert.equal((await cache.response(new Request(result.url, { method: 'HEAD' }))).status, 200);
  const stats = await cache.prune();
  assert.equal(stats.videoBytes, 7 * 64 * MiB + 256);
  assert.equal(stats.protectedVideoBytes, 64 * MiB + 256);
  assert.equal(stats.overBudgetBytes, 0);
});

test('active resources can exceed the soft budget; restart removes session pins and reclaims residues', async t => {
  const { cache, seed, root } = await fixture(t);
  for (let i = 0; i < 9; i++) await seed(i, 64 * MiB, true);
  const stats = await cache.prune();
  assert.deepEqual(stats, { videoBytes: 576 * MiB, protectedVideoBytes: 576 * MiB,
    reclaimedVideoBytes: 0, budgetBytes: 512 * MiB, overBudgetBytes: 64 * MiB });
  assert.equal(cache.entries.size, 9);
  const restarted = new WallpaperLoopCache({ root, library: {}, propertyStore: {} });
  const reclaimed = await restarted.prune();
  assert.equal(reclaimed.videoBytes, 512 * MiB);
  assert.equal(reclaimed.reclaimedVideoBytes, 64 * MiB);
  assert.equal(reclaimed.protectedVideoBytes, 0);
  assert.equal((await fs.readdir(root)).filter(name => name.endsWith('.webm')).length, 8);
  await assert.rejects(fs.stat(cache.files('0'.repeat(64)).video), { code: 'ENOENT' });
});

test('external pruning waits for concurrent lookup to finish verification and pin its URL', async t => {
  const { cache, seed } = await fixture(t);
  const target = await seed(0, 256), id = 'target', bytes = Buffer.alloc(256);
  await fs.writeFile(target.meta, JSON.stringify({ key: target.key, id, bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
  cache.identity = async () => ({ id, key: target.key });
  for (let i = 1; i <= 8; i++) await seed(i);
  let hashStarted, finishHash;
  const started = new Promise(resolve => { hashStarted = resolve; });
  const gate = new Promise(resolve => { finishHash = resolve; });
  const original = syncFs.createReadStream;
  syncFs.createReadStream = function (file, ...args) {
    if (file !== target.video) return original.call(this, file, ...args);
    return Readable.from((async function* () {
      for await (const chunk of original.call(syncFs, file, ...args)) yield chunk;
      hashStarted(); await gate;
    })());
  };
  t.after(() => { finishHash(); syncFs.createReadStream = original; });
  const lookup = cache.lookup(id);
  await started;
  let completed = false;
  const pruning = cache.prune().then(result => { completed = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  finishHash();
  const found = await lookup, stats = await pruning;
  syncFs.createReadStream = original;
  assert.equal(found.cached, true);
  assert.equal((await cache.response(new Request(found.url, { method: 'HEAD' }))).status, 200);
  assert.equal(stats.protectedVideoBytes, 256);
  assert.equal(stats.reclaimedVideoBytes, 64 * MiB);
  assert.equal(stats.videoBytes, 7 * 64 * MiB + 256);
});
