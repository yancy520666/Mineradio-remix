'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [sourceRoot, installedRoot] = process.argv.slice(2);
const read = root => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const expected = read(sourceRoot);
// electron-builder removes development-only fields from the production package.
for (const field of ['scripts', 'build', 'devDependencies']) delete expected[field];
assert.deepEqual(read(installedRoot), expected, 'installed runtime metadata differs from the build source');
console.log('Installed runtime metadata matches source.');
