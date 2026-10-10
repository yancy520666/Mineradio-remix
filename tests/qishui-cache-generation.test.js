'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
function cache() {
  const c = vm.createContext({ Map, Date, Promise });
  loadFunctions(c, 'qishui-api.js', ['createTtlCache']);
  return c.createTtlCache(4, 1000);
}
const tick = () => new Promise(setImmediate);
test('clear prevents a late old library response from replacing fresh cache data', async () => {
  const c = cache(); let oldDone, newDone;
  const old = c.wrap('account-library', 1000, () => new Promise(r => oldDone = r)); await tick();
  c.clear();
  const fresh = c.wrap('account-library', 1000, () => new Promise(r => newDone = r)); await tick();
  newDone('new'); await fresh; oldDone('old');
  assert.equal(await old, 'old', 'existing caller may finish but cannot repopulate the new cache');
  assert.equal(c.get('account-library'), 'new');
});
test('late old completion cannot delete a newer inflight request with the same key', async () => {
  const c = cache(); let oldDone, newDone, starts = 0;
  const old = c.wrap('same', 0, () => new Promise(r => oldDone = r)); await tick();
  c.clear();
  const fresh = c.wrap('same', 0, () => { starts++; return new Promise(r => newDone = r); }); await tick();
  oldDone('old'); await old;
  const shared = c.wrap('same', 0, () => { starts++; return 'unexpected'; });
  newDone('new');
  assert.equal(await fresh, 'new'); assert.equal(await shared, 'new');
  assert.equal(starts, 1); assert.equal(c.get('same'), null);
});
test('clear also prevents a rejected old request from releasing the newer singleflight slot', async () => {
  const c = cache(); let oldReject, freshDone, starts = 0;
  const old = c.wrap('same', 1000, () => new Promise((_, r) => oldReject = r));
  const rejected = assert.rejects(old, /fixture/); await tick(); c.clear();
  const fresh = c.wrap('same', 1000, () => { starts++; return new Promise(r => freshDone = r); }); await tick();
  oldReject(new Error('fixture')); await rejected;
  const shared = c.wrap('same', 1000, () => { starts++; return 'bad'; });
  freshDone('current'); await fresh; assert.equal(await shared, 'current'); assert.equal(starts, 1);
});
