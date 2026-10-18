'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.js')).sort();
if (!files.length) throw new Error('No regression tests found');
let failures = 0;
for (const name of files) {
  console.log(`\n== ${name} ==`);
  const result = spawnSync(process.execPath, [path.join(root, 'tests', name)], {
    cwd: root, stdio: 'inherit', timeout: 60000,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failures += 1;
}
console.log(`\n${files.length - failures}/${files.length} test files passed.`);
process.exitCode = failures ? 1 : 0;
