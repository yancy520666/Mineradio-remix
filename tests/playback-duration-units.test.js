'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { scenario } = require('../docs/qa/playback-duration-audit-fixtures.cjs');
test('explicit seconds and milliseconds remain correct across short and long duration boundaries', () => {
  assert.deepEqual(scenario(), { localThirtyMinutes: 1800, qishuiThirtyMinutes: 1800, explicitMilliseconds: 0.8,
    neteaseTypical: 205.423, longQishuiMatch: 18000 });
});
