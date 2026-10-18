'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../desktop/wallpaper-engine-runtime.js'), 'utf8');
const begin = source.indexOf('function defaultDesktopCapturer()');
const end = source.indexOf('\nclass WallpaperEngineRuntime', begin);

test('plain Node wallpaper capability probing does not import or download Electron', () => {
  let loads = 0;
  const context = vm.createContext({ process: { versions: { node: process.versions.node } },
    require() { loads++; throw new Error('Unexpected Electron resolution'); } });
  vm.runInContext(source.slice(begin, end), context);
  assert.equal(context.defaultDesktopCapturer(), null);
  assert.equal(loads, 0);
});

test('Electron main wallpaper capability probing still uses the native capturer', () => {
  const capturer = {};
  const context = vm.createContext({ process: { versions: { electron: 'fixture' }, type: 'browser' },
    require(name) { assert.equal(name, 'electron'); return { desktopCapturer: capturer }; } });
  vm.runInContext(source.slice(begin, end), context);
  assert.strictEqual(context.defaultDesktopCapturer(), capturer);
});
