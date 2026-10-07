'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('Aero styles apply and decorative canvases let clicks reach player controls', { skip: process.platform !== 'win32' }, () => {
  const root = path.join(__dirname, '..');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = spawnSync(path.join(root, 'node_modules/electron/dist/electron.exe'), [
    'scripts/qa/isolated-electron.js', '--page', path.join(__dirname, 'fixtures/aero-input-probe.js'), '--size', '1280x820',
  ], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
  const line = run.stdout.split(/\r?\n/).find(value => value.startsWith('QA_RESULT '));
  assert.ok(line, 'Missing renderer verification result');
  const result = JSON.parse(line.slice('QA_RESULT '.length));
  assert.equal(result.passed, true, result.error || JSON.stringify(result));
});
