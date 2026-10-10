'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { scenario } = require('../docs/qa/playback-ended-audit-fixtures.cjs');
for (const mode of ['loop', 'single']) {
  test(`deferred ${mode} ended cannot advance a newer selection`, () => {
    assert.deepEqual(scenario(mode, false).calls, []);
  });
  test(`duplicate deferred ${mode} ended advances once`, () => {
    assert.deepEqual(scenario(mode, true).calls, [mode === 'loop' ? 'next' : 'repeat:0']);
  });
}
