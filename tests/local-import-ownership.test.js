'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { scenario } = require('../docs/qa/local-import-ownership-audit-fixtures.cjs');
test('a late local import cannot replace a newer selected queue', async () => {
  const result = await scenario(false);
  assert.deepEqual(result.queue, ['new-selection']);
  assert.deepEqual(result.starts, []);
  assert.deepEqual(result.covers, []);
});
test('a late local-import playback result cannot assign its cover to another song', async () => {
  const result = await scenario(true);
  assert.deepEqual(result.queue, ['new-selection']);
  assert.deepEqual(result.starts, ['old-local']);
  assert.deepEqual(result.covers, []);
});
