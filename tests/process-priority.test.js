'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { raisePlayerProcessPriority } = require('../desktop/process-priority');

test('player processes are raised once each and failures are ignored', (t) => {
  if (process.platform !== 'win32') return t.skip('Windows scheduler only');
  const calls = [];
  const app = { getAppMetrics: () => [{ pid: 11 }, { pid: 12 }, { pid: process.pid }] };
  const handle = raisePlayerProcessPriority(app, {
    refreshMs: 1000000,
    setPriority: (pid, level) => { calls.push([pid, level]); if (pid === 12) throw new Error('denied'); },
  });
  handle.apply();
  handle.stop();
  assert.deepEqual(calls.map((c) => c[0]).sort((a, b) => a - b), [11, 12, process.pid].sort((a, b) => a - b));
  assert.ok(calls.every((c) => c[1] === os.constants.priority.PRIORITY_ABOVE_NORMAL));
});
