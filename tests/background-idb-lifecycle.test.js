'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/js/modules/02-visual/06-custom-background-colorlab.js', 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture(failure) {
  const calls = { close: 0, settlements: [] };
  const error = new Error('fixture-idb-failure');
  const req = { error };
  const tx = { error, objectStore() {
    if (failure === 'store') throw error;
    return { get() { if (failure === 'request') throw error; return req; },
      put() { if (failure === 'request') throw error; return req; } };
  } };
  const db = { transaction() { if (failure === 'transaction') throw error; return tx; },
    close() { calls.close++; } };
  function TrackedPromise(executor) {
    const settlement = { resolve: 0, reject: 0 };
    calls.settlements.push(settlement);
    return new Promise((resolve, reject) => executor(
      value => { settlement.resolve++; resolve(value); },
      reason => { settlement.reject++; reject(reason); }
    ));
  }
  const context = vm.createContext({ console, Promise: TrackedPromise,
    window: { addEventListener() {} }, document: {}, indexedDB: {} });
  vm.runInContext(source, context);
  context.openCustomBackgroundDb = () => Promise.resolve(db);
  async function start(method) {
    let state = 'pending', value;
    const promise = context[method]('qa-isolated-id', { size: 1 });
    promise.then(result => { state = 'resolved'; value = result; }, reason => { state = 'rejected'; value = reason; });
    await turn();
    return { promise, state: () => state, value: () => value };
  }
  return { calls, req, tx, error, start };
}

test('background IDB reads retain the request-success contract and writes wait for transaction commit', async () => {
  const read = fixture(), r = await read.start('getCustomBackgroundBlob');
  const blob = { size: 1 }; read.req.result = { blob }; read.req.onsuccess();
  assert.strictEqual(await r.promise, blob);
  read.tx.oncomplete(); assert.equal(read.calls.close, 1);
  assert.deepEqual(read.calls.settlements, [{ resolve: 1, reject: 0 }]);
  const write = fixture(), w = await write.start('putCustomBackgroundBlob');
  if (write.req.onsuccess) write.req.onsuccess(); await turn();
  assert.equal(w.state(), 'pending', 'put must not report persistence before commit');
  write.tx.oncomplete(); assert.equal(await w.promise, undefined);
  assert.equal(write.calls.close, 1);
  assert.deepEqual(write.calls.settlements, [{ resolve: 1, reject: 0 }]);
});

test('background IDB request error and transaction abort/error events settle and close only once', async () => {
  for (const method of ['getCustomBackgroundBlob', 'putCustomBackgroundBlob']) {
    const f = fixture(), pending = await f.start(method);
    if (f.req.onerror) f.req.onerror();
    assert.equal(typeof f.tx.onerror, 'function'); f.tx.onerror();
    assert.equal(typeof f.tx.onabort, 'function'); f.tx.onabort();
    f.tx.onerror(); f.tx.oncomplete();
    await turn();
    assert.equal(pending.state(), 'rejected'); assert.strictEqual(pending.value(), f.error);
    assert.equal(f.calls.close, 1, method);
    assert.deepEqual(f.calls.settlements, [{ resolve: 0, reject: 1 }], method);
  }
});

test('background IDB abort-only events reject instead of keeping import or restore pending', async () => {
  for (const method of ['getCustomBackgroundBlob', 'putCustomBackgroundBlob']) {
    const f = fixture(), pending = await f.start(method);
    assert.equal(typeof f.tx.onabort, 'function'); f.tx.onabort();
    await turn(); assert.equal(pending.state(), 'rejected'); assert.strictEqual(pending.value(), f.error);
    assert.equal(f.calls.close, 1); assert.deepEqual(f.calls.settlements, [{ resolve: 0, reject: 1 }]);
  }
});

test('background IDB synchronous transaction, store or request failures release their opened connection', async () => {
  for (const method of ['getCustomBackgroundBlob', 'putCustomBackgroundBlob']) {
    for (const failure of ['transaction', 'store', 'request']) {
      const f = fixture(failure), pending = await f.start(method);
      assert.equal(pending.state(), 'rejected'); assert.strictEqual(pending.value(), f.error);
      assert.equal(f.calls.close, 1, method + '/' + failure);
      assert.deepEqual(f.calls.settlements, [{ resolve: 0, reject: 1 }]);
    }
  }
});
