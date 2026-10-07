'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNeteaseLikeCache } = require('../netease-like-cache');
const owner = { uid: 123, cookie: 'fake-session-a' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('concurrent readers share one full list, including a successful empty list', async () => {
  let calls = 0;
  const cache = createNeteaseLikeCache({ fetchList: async () => { calls++; return { body: { code: 200, ids: [] } }; } });
  const values = await Promise.all(Array.from({ length: 25 }, () => cache.check(owner, [1, 2])));
  assert.equal(calls, 1);
  for (const value of values) { assert.equal(value.complete, true); assert.deepEqual(value.liked, { 1: false, 2: false }); }
  assert.equal((await cache.check(owner, [3])).liked[3], false);
  assert.equal(calls, 1);
});

test('405 backs off and logs only safe status fields without inventing unliked songs', async () => {
  let clock = 100, calls = 0;
  const logs = [];
  const cache = createNeteaseLikeCache({ now: () => clock, onFailure: x => logs.push(x), fetchList: async () => { calls++; throw { status: 405, cookie: ['SECRET'], body: { code: 405 } }; } });
  const result = await cache.check(owner, [1]);
  assert.deepEqual(result.liked, {});
  assert.equal(result.complete, false);
  assert.equal(result.retryAfterMs, 60000);
  for (let i = 0; i < 20; i++) await cache.check(owner, [i]);
  assert.equal(calls, 1);
  assert.deepEqual(logs, [{ code: 405, retryAfterMs: 60000 }]);
  clock += 60001;
  await cache.check(owner, [1]);
  assert.equal(calls, 2);
});

test('session switch and logout reject an old in-flight result', async () => {
  const first = deferred();
  const cache = createNeteaseLikeCache({ fetchList: who => who.cookie === owner.cookie ? first.promise : Promise.resolve({ ids: [9] }) });
  const old = cache.check(owner, [7]);
  const other = await cache.check({ uid: 456, cookie: 'fake-session-b' }, [7, 9]);
  first.resolve({ ids: [7] });
  assert.deepEqual((await old).liked, {});
  assert.deepEqual(other.liked, { 7: false, 9: true });
  const pending = deferred();
  const logoutCache = createNeteaseLikeCache({ fetchList: () => pending.promise });
  const read = logoutCache.check(owner, [7]);
  logoutCache.reset();
  pending.resolve({ ids: [7] });
  assert.deepEqual((await read).liked, {});
});

test('successful like/unlike writes survive an older list response and update cached hearts', async () => {
  const pending = deferred();
  const cache = createNeteaseLikeCache({ fetchList: () => pending.promise });
  const read = cache.check(owner, [1, 2]);
  cache.record(owner, 1, true);
  cache.record(owner, 2, false);
  pending.resolve({ ids: [2] });
  assert.deepEqual((await read).liked, { 1: true, 2: false });
  cache.record(owner, 1, false);
  assert.equal((await cache.check(owner, [1])).liked[1], false);
});

test('refresh failure retains the last known liked list during cooldown', async () => {
  let clock = 0, calls = 0;
  const cache = createNeteaseLikeCache({ now: () => clock, fetchList: async () => { if (++calls === 1) return { ids: [7] }; throw { status: 429 }; } });
  await cache.check(owner, [7]);
  clock = 61000;
  const result = await cache.check(owner, [7]);
  assert.equal(result.liked[7], true);
  assert.equal(result.complete, false);
  await cache.check(owner, [7]);
  assert.equal(calls, 2);
});
