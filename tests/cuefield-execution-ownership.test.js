'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { scenario } = require('../docs/qa/automix-execution-audit-fixtures.cjs');
for (const stage of ['output', 'play', 'timeline', 'handoff']) {
  test(`obsolete Cuefield ${stage} settlement cannot clear a newer execution`, async () => {
    const result = await scenario(stage);
    assert.equal(result.executing, true);
    assert.equal(result.sameNewOwner, true);
    assert.deepEqual(result.stopped, ['old-incoming']);
    assert.deepEqual(result.notices, []);
    assert.equal(result.lastUi, 'handoff');
  });
}
