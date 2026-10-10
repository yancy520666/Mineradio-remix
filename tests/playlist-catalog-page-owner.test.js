'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scenario } = require('../docs/qa/playlist-catalog-page-owner-audit-fixtures.cjs');
for (const owner of ['old', 'same-account-old-epoch', 'old-account-same-epoch']) {
  test(`catalog paging rejects ${owner} before relabeling ownership or requesting an old offset`, async () => {
    const result = await scenario(owner);
    assert.deepEqual(result.requestedOffsets, []);
    assert.equal(result.committed, false);
    assert.deepEqual(result.rows, [owner === 'same-account-old-epoch' ? 'B-page1' : 'A-private']);
    assert.equal(result.storedAuthEpoch, owner === 'old-account-same-epoch' ? 1 : 0);
    assert.equal(result.storedAccountKey, JSON.stringify([true, owner === 'same-account-old-epoch' ? 'B' : 'A']));
  });
}
test('new-account root with matching ownership continues its own normal pagination', async () => {
  const result = await scenario('current');
  assert.deepEqual(result.rows, ['B-page1', 'B-page2']);
  assert.deepEqual(result.requestedOffsets, [50]);
  assert.equal(result.committed, true);
});
test('same-account forced refresh still preserves the last usable rows on network failure', async () => {
  const result = await scenario('same-account-refresh');
  assert.deepEqual(result.rows, ['B-page1']);
  assert.deepEqual(result.requestedOffsets, [0]);
  assert.equal(result.committed, false);
});
