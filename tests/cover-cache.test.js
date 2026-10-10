'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoverCache } = require('../cover-cache');

const image = (n, size = 4) => ({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(size, n) });

test('concurrent requests for one cover share a single download', async () => {
  const cache = createCoverCache();
  let downloads = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const download = async () => { downloads++; await gate; return image(1); };
  const all = Promise.all([cache.load('a', download), cache.load('a', download), cache.load('a', download)]);
  release();
  const results = await all;
  assert.equal(downloads, 1);
  assert(results.every(r => r.body.equals(Buffer.alloc(4, 1))));
  await cache.load('a', download);
  assert.equal(downloads, 1, 'a finished cover is served from memory');
});

test('a failed or incomplete download is not remembered', async () => {
  const cache = createCoverCache();
  let calls = 0;
  await assert.rejects(cache.load('a', async () => { calls++; throw new Error('reset'); }));
  assert.equal(cache.stats().pending, 0);
  await cache.load('a', async () => { calls++; return { status: 502 }; });
  const ok = await cache.load('a', async () => { calls++; return image(2); });
  assert.equal(calls, 3);
  assert.equal(ok.status, 200);
  assert.equal(cache.stats().entries, 1);
});

test('the cache is bounded by entry count, total bytes, item size and age', async () => {
  let clock = 0;
  const cache = createCoverCache({ maxEntries: 2, maxBytes: 10, maxItemBytes: 6, ttlMs: 100, now: () => clock });
  cache.set('big', image(0, 7));
  assert.equal(cache.get('big'), null, 'oversized covers are passed through, not kept');
  cache.set('a', image(1)); cache.set('b', image(2));
  cache.get('a');
  cache.set('c', image(3));
  assert.equal(cache.get('b'), null, 'least recently used cover goes first');
  assert(cache.get('a') && cache.get('c'));
  assert(cache.stats().bytes <= 10);
  clock = 150;
  assert.equal(cache.get('a'), null, 'expired covers are downloaded again');
});

test('one subscriber leaving preserves the shared download; the last leaving aborts it', async () => {
  const cache = createCoverCache();
  const a = new AbortController(), b = new AbortController();
  let upstreamSignal, release, calls = 0;
  const download = ({ signal }) => { upstreamSignal = signal; calls++; return new Promise(resolve => { release = resolve; }); };
  const first = cache.load('shared', download, { signal: a.signal });
  const second = cache.load('shared', download, { signal: b.signal });
  await Promise.resolve();
  a.abort(); await assert.rejects(first, { name: 'AbortError' });
  assert.equal(upstreamSignal.aborted, false);
  release(image(1)); await second; assert.equal(calls, 1);
  const last = cache.load('last', download, { signal: b.signal });
  await Promise.resolve(); b.abort();
  await assert.rejects(last, { name: 'AbortError' });
  assert.equal(upstreamSignal.aborted, true);
  assert.equal(cache.stats().pending, 0);
});

test('unique downloads, queue, total deadline and retained bytes stay bounded', async () => {
  const cache = createCoverCache({ maxConcurrent: 2, maxQueued: 2, deadlineMs: 30, maxInflightBytes: 16 });
  let starts = 0;
  const download = ({ addBytes }) => { starts++; addBytes(8); return new Promise(() => {}); };
  const jobs = Array.from({ length: 4 }, (_, i) => cache.load(String(i), download));
  const all = Promise.allSettled(jobs);
  await assert.rejects(cache.load('overflow', download), /QUEUE_FULL/);
  await Promise.resolve();
  assert.equal(starts, 2); assert.equal(cache.stats().inflightBytes, 16);
  const results = await all;
  assert(results.every(result => result.status === 'rejected' && result.reason.code === 'COVER_DEADLINE'));
  assert.equal(cache.stats().active, 0); assert.equal(cache.stats().queued, 0); assert.equal(cache.stats().inflightBytes, 0);
  await assert.rejects(cache.load('oversized', ({ addBytes }) => { addBytes(17); return image(0); }), /INFLIGHT_BUDGET/);
  assert.equal(cache.stats().inflightBytes, 0);
});

test('background work reserves foreground capacity and bytes, and visible work jumps the queue', async () => {
  const cache = createCoverCache({ maxConcurrent: 4, maxInflightBytes: 32, deadlineMs: 1000 });
  const controllers = Array.from({ length: 5 }, () => new AbortController()), starts = [];
  const download = name => ({ addBytes }) => { starts.push(name); addBytes(8); return new Promise(() => {}); };
  const jobs = [0, 1, 2, 3].map(i => cache.load('bg' + i, download('bg' + i), { priority: 'background', signal: controllers[i].signal }));
  const visible = cache.load('visible', download('visible'), { signal: controllers[4].signal });
  const all = Promise.allSettled([...jobs, visible]);
  await Promise.resolve();
  assert.deepEqual(starts, ['bg0', 'bg1', 'visible']);
  assert.equal(cache.stats().active, 3); assert.equal(cache.stats().inflightBytes, 24);
  controllers.forEach(controller => controller.abort()); await all;
  assert.equal(cache.stats().queued, 0);
});

test('isolated cold/hot cover timings preserve one upstream request', async t => {
  const cache = createCoverCache(), { performance } = require('node:perf_hooks');
  let calls = 0;
  const download = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 35)); return image(3, 1024); };
  const start = performance.now(); await cache.load('timed', download); const cold = performance.now() - start;
  const warmStart = performance.now(); await cache.load('timed', download); const hot = performance.now() - warmStart;
  assert.equal(calls, 1);
  t.diagnostic(`local fake upstream delay 35ms: cover cold=${cold.toFixed(2)}ms, hot=${hot.toFixed(2)}ms; not a platform/CDN benchmark`);
});

test('late cancelled cover completion cannot overwrite or remove its replacement', async () => {
  const cache = createCoverCache(), controller = new AbortController(); let releaseOld, releaseNew;
  const old = cache.load('same', () => new Promise(resolve => { releaseOld = resolve; }), { signal: controller.signal });
  await Promise.resolve(); controller.abort(); await assert.rejects(old, /CANCELLED/);
  const replacement = cache.load('same', () => new Promise(resolve => { releaseNew = resolve; }));
  await Promise.resolve(); releaseOld(image(1)); await Promise.resolve(); await Promise.resolve();
  assert.equal(cache.stats().pending, 1); assert.equal(cache.get('same'), null);
  releaseNew(image(2)); await replacement;
  assert.equal(cache.get('same').body[0], 2); assert.equal(cache.stats().pending, 0);
});
