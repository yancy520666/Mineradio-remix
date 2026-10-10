'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { scenario } = require('../docs/qa/playlist-catalog-epoch-audit-fixtures.cjs');
for (const refresh of [false, true]) for (const failure of [false, true]) test(`catalog auth epoch blocks old ${failure ? 'failure' : 'rows'} with ${refresh ? 'immediate refresh' : 'unchanged root token'}`, async () => {
  const result = await scenario(refresh, failure);
  assert.deepEqual(result.rows, refresh ? ['B-public'] : []);
  assert.equal(result.error, '');
  assert.equal(result.tokenAfter, refresh ? 2 : 1);
});
test('a partial new-account catalog never retains the previous account cache', async () => {
  const result = await scenario(true, false, true);
  assert.deepEqual(result.rows, ['B-public']);
});
