'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FileMatcher } = require('app-builder-lib/out/fileMatcher');

test('both package file lists include the local runtime dependency closure and authentication assets', () => {
  const root = path.resolve(__dirname, '..');
  const configs = [require('../package.json').build, require('../electron-builder.internal-beta.json')];
  const pending = ['server.js', 'desktop/main.js'], required = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (required.has(file)) continue;
    required.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      let target = path.resolve(root, path.dirname(file), match[1]);
      if (!path.extname(target)) target += '.js';
      if (fs.existsSync(target) && fs.statSync(target).isFile()) pending.push(path.relative(root, target));
    }
  }
  // qishui-auth-v6 locates these dynamically, outside the require graph.
  for (const file of fs.readdirSync(path.join(root, 'qishui-auth-v6'))) {
    if (fs.statSync(path.join(root, 'qishui-auth-v6', file)).isFile()) required.add('qishui-auth-v6/' + file);
  }
  for (const [index, config] of configs.entries()) {
    const include = new FileMatcher(root, root, value => value, config.files).createFilter();
    for (const file of required) {
      const absolute = path.join(root, file);
      assert(include(absolute, fs.statSync(absolute)), `package ${index}: missing required runtime file ${file}`);
    }
    for (const file of ['.cookie', '.env', 'tests/fixture-cookie.json', 'docs/NEXT_PATH_MUTATION_RESULTS.json']) {
      assert.equal(include(path.join(root, file), { isDirectory: () => false }), false, `package ${index}: private/test artifact ${file}`);
    }
  }
});
