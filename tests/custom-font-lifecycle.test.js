'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function font(id, name = id) {
  return { id, name, family: 'Fixture-' + id, dataUrl: 'data:font/ttf;base64,AAAA', size: 3 };
}
function harness(deferred = false) {
  const faces = new Set(), loads = [], storage = new Map();
  const c = vm.createContext({ console, setTimeout: () => 1, clearTimeout() {},
    document: { fonts: { add: face => faces.add(face), delete: face => faces.delete(face) }, querySelectorAll: () => [], getElementById: () => null },
    FontFace: function (family, source) {
      this.family = family; this.source = source;
      this.load = () => new Promise((resolve, reject) => { loads.push({ face: this, resolve, reject }); if (!deferred) resolve(this); });
    },
    customLyricFonts: [], CUSTOM_LYRIC_FONT_MAX_COUNT: 2, CUSTOM_LYRIC_FONT_MAX_BYTES: 1024,
    CUSTOM_LYRIC_FONT_STORE_KEY: 'fonts', fx: { lyricFont: 'sans' },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    refreshCurrentLyricStyle() {}, saveLyricLayout() {}, pushDesktopLyricsState() {}, showToast() {}
  });
  vm.runInContext(read('public/js/modules/02-visual/05-lyrics-fonts-texture.js'), c);
  vm.runInContext(read('public/js/modules/07-fx/03-cover-picker-fonts.js'), c);
  c.clearLyricTextMeasureCache = () => {};
  c.scheduleLyricTextMeasureWarmup = () => {};
  c.updateLyricFontControls = () => {};
  c.readFileAsDataUrl = async () => 'data:font/ttf;base64,AAAA';
  return { c, faces, loads, storage };
}
test('repeated load shares one owner and explicit remove releases FontFaceSet only', async () => {
  const { c, faces, loads, storage } = harness(true);
  const record = font('one'); c.customLyricFonts = [record];
  const first = c.registerCustomLyricFont(record), second = c.registerCustomLyricFont(record);
  assert.strictEqual(first, second);
  assert.equal(c.customLyricFontFaceOwners.size, 1);
  const owner = c.customLyricFontFaceOwners.get('one');
  assert.equal(loads.length, 1);
  loads[0].resolve(loads[0].face);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(faces.size, 1);
  c.releaseCustomLyricFontFace('one');
  assert.equal(c.customLyricFontFaceOwners.size, 0);
  assert.equal(faces.size, 0);
  assert.equal(owner.source.loaded, false);
  const loaded = harness(); loaded.c.customLyricFonts = [font('loaded')];
  await loaded.c.registerCustomLyricFont(loaded.c.customLyricFonts[0]);
  loaded.c.fx.lyricFont = 'custom:loaded';
  loaded.c.removeCustomLyricFont(null, 'loaded');
  assert.equal(loaded.faces.size, 0); assert.equal(loaded.c.fx.lyricFont, 'sans');
  assert.equal(loaded.storage.get('fonts'), '[]'); assert.equal(storage.size, 0);
});
test('removed or superseded pending face cannot register on late completion', async () => {
  const { c, faces, loads } = harness(true);
  const first = font('one'); c.customLyricFonts = [first];
  const oldTask = c.registerCustomLyricFont(first);
  c.removeCustomLyricFont(null, 'one');
  loads[0].resolve(loads[0].face);
  assert.equal(await oldTask, false); assert.equal(faces.size, 0);
  const old = font('replace'), updated = { ...old, dataUrl: 'data:font/ttf;base64,BBBB' };
  const oldLoad = c.registerCustomLyricFont(old), newLoad = c.registerCustomLyricFont(updated);
  loads[2].resolve(loads[2].face); assert.equal(await newLoad, true);
  loads[1].resolve(loads[1].face); assert.equal(await oldLoad, false);
  assert.equal(faces.size, 1); assert(faces.has(loads[2].face));
});
test('same-name replacement and count eviction release discarded runtime faces', async () => {
  const { c, faces } = harness();
  for (const name of ['same.ttf', 'same.ttf', 'other.ttf', 'third.ttf']) {
    await c.handleLyricFontFiles([{ name, type: 'font/ttf', size: 3 }]);
    assert.equal(faces.size, c.customLyricFonts.length);
    assert(faces.size <= 2);
  }
  assert.equal(c.customLyricFonts.length, 2); assert.equal(faces.size, 2);
  for (const record of Array.from(c.customLyricFonts)) c.removeCustomLyricFont(null, record.id);
  assert.equal(faces.size, 0);
});
test('load rejection releases the owner so a later attempt can retry', async () => {
  const { c, faces, loads } = harness(true); const record = font('retry');
  const rejected = c.registerCustomLyricFont(record); loads[0].reject(new Error('fixture-load-failure'));
  assert.equal(await rejected, false); assert.equal(c.customLyricFontFaceOwners.size, 0);
  const retry = c.registerCustomLyricFont(record); loads[1].resolve(loads[1].face);
  assert.equal(await retry, true); assert.equal(faces.size, 1);
});
