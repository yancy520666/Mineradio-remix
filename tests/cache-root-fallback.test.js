'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
const start = source.indexOf('function defaultCacheRootPath()');
const end = source.indexOf('function normalizeCacheRootPath(', start);
assert(start >= 0 && end > start);
function cacheRoot(hasD) {
  const context = { path: path.win32, fs: { existsSync: drive => drive === 'D:\\' && hasD },
    app: { getPath: name => { assert.equal(name, 'userData'); return 'C:\\Users\\fixture\\Remix'; } } };
  vm.runInNewContext(source.slice(start, end), context);
  return context.defaultCacheRootPath();
}
test('desktop cache falls back to C drive user data when D drive is absent', () => {
  assert.equal(cacheRoot(false), 'C:\\Users\\fixture\\Remix\\cache');
});
test('existing D drive remains a supported default without changing user preferences', () => {
  assert.equal(cacheRoot(true), 'D:\\MineradioCache');
});
