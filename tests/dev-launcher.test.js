'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('Dev exit requests cannot shut down the production runtime', () => {
  const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('function isDevQuitRequest(');
  assert.ok(start >= 0);
  const end = source.indexOf('\n}', start);
  const context = vm.createContext({ APP_NAME: 'Mineradio Remix Dev', APP_USER_MODEL_ID: 'com.mineradio.remix.dev' });
  vm.runInContext(source.slice(start, end + 2), context);
  assert.equal(context.isDevQuitRequest(['electron', '.', '--quit-remix-dev']), true);
  assert.equal(context.isDevQuitRequest(['electron', '.']), false);
  context.APP_NAME = 'Mineradio Remix';
  assert.equal(context.isDevQuitRequest(['--quit-remix-dev']), false);
  context.APP_NAME = 'Mineradio Remix Dev';
  context.APP_USER_MODEL_ID = 'com.mineradio.remix';
  assert.equal(context.isDevQuitRequest(['--quit-remix-dev']), false);
});

test('Windows launcher selects only verified Dev process trees', { skip: process.platform !== 'win32' }, () => {
  const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'dev-launcher-process-selection.test.ps1')], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
});
