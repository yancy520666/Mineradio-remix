'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { scenario } = require('../docs/qa/fallback-reorder-audit-fixtures.cjs');
for (const qishui of [false, true]) test(`${qishui ? 'Qishui trial upgrade' : 'provider fallback'} follows the reordered live entry`, async () => {
  const result = await scenario(qishui);
  assert.deepEqual(result.queue, ['B-full', 'A', 'C']);
  assert.equal(result.currentIdx, 0);
});
