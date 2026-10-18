'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('public/js/modules/02-visual/05-lyrics-fonts-texture.js', 'utf8');
const saved = { id: 'saved', name: 'Saved', family: 'FixtureSaved', dataUrl: 'data:font/ttf;base64,AAAA' };
function fixture(throws = false) {
  const pending = [], faces = new Set(), refreshed = [];
  const c = vm.createContext({ console: { warn() {} }, CUSTOM_LYRIC_FONT_MAX_COUNT: 6, CUSTOM_LYRIC_FONT_STORE_KEY: 'fixture',
    setTimeout: () => 1, clearTimeout() {}, document: { fonts: { add: face => faces.add(face), delete: face => faces.delete(face) } },
    FontFace: function () { this.load = () => { if (throws) throw new Error('fixture-font-init');
      return new Promise(resolve => pending.push({ face: this, resolve })); }; },
    fx: { lyricFont: 'custom:saved' }, refreshCurrentLyricStyle: () => refreshed.push('refresh') });
  const script = 'var customLyricFonts=[' + JSON.stringify(saved) + ']; registerSavedCustomLyricFonts();\n' + source;
  return { c, pending, faces, refreshed, script };
}
test('the earlier core-store caller can register a saved font before the later module initializer', async () => {
  const f = fixture(); assert.doesNotThrow(() => vm.runInContext(f.script, f.c));
  const owner = f.c.customLyricFontFaceOwners.get('saved');
  assert(owner); assert.equal(f.pending.length, 1);
  assert.strictEqual(f.c.registerCustomLyricFont(f.c.customLyricFonts[0]), owner.promise, 'later initialization preserves the early owner/singleflight');
  f.pending[0].resolve(f.pending[0].face); assert.equal(await owner.promise, true);
  assert.equal(f.faces.size, 1); assert.deepEqual(f.refreshed, ['refresh']);
  f.c.releaseCustomLyricFontFace('saved'); assert.equal(f.faces.size, 0);
});
test('a synchronous saved-font loader failure cannot abort classic-script startup', () => {
  const f = fixture(true); assert.doesNotThrow(() => vm.runInContext(f.script, f.c));
  assert.equal(f.c.customLyricFontFaceOwners.size, 0); assert.equal(f.faces.size, 0);
  assert.equal(typeof f.c.lyricFontCss, 'function');
});
test('an immediately resolved font waits until later metrics/cache initialization and keeps its early owner', async () => {
  const f = fixture(); f.c.FontFace = function () { this.load = () => Promise.resolve(this); };
  assert.doesNotThrow(() => vm.runInContext(f.script, f.c));
  const owner = f.c.customLyricFontFaceOwners.get('saved');
  assert(owner); assert.equal(f.c.lyricTextMeasureGeneration, 0);
  assert.equal(f.c.lyricTextMeasureCache.maxFonts, 64);
  assert.equal(await owner.promise, true); assert.strictEqual(f.c.customLyricFontFaceOwners.get('saved'), owner);
  assert.equal(f.c.lyricTextMeasureGeneration, 1); assert.equal(f.faces.size, 1);
  assert.deepEqual(f.refreshed, ['refresh']);
});
