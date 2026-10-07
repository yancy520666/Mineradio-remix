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
