'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scenario } = require('../docs/qa/fallback-rollback-owner-audit-fixtures.cjs');
test('a nested failed provisional source rolls back under the same owner and continues the next provider', async () => {
  const result = await scenario();
  assert.deepEqual(result.searches, ['qq', 'kugou']);
  assert.deepEqual(result.effects, ['skip']);
  assert.deepEqual(result.queue, ['A']);
});
for (const kind of ['new-selection', 'same-original-new-token', 'new-queue-same-entry']) {
  test(`a proved nested rollback still cannot resume after ${kind}`, async () => {
    const result = await scenario(kind);
    assert.deepEqual(result.searches, ['qq']);
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.queue, [kind === 'new-selection' ? 'user-choice' : 'A']);
  });
}
