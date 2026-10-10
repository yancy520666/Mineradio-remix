'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { scenario } = require('../docs/qa/local-analysis-ownership-audit-fixtures.cjs');
test('an obsolete rejected local analysis cannot clear a newer active analysis', async () => {
  const result = await scenario();
  assert.equal(result.newAnalysisActive, true);
  assert.match(result.lastStatus, /DJ 分析准备中/);
  assert.equal(result.lastDjMode, true);
});
