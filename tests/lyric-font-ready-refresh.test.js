'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const fontPath = 'public/js/modules/02-visual/05-lyrics-fonts-texture.js';

test('a saved selected font refreshes rendered lyrics when its delayed load completes', async () => {
  const pending = [], added = [], calls = [];
  const records = [{ id: 'selected', family: 'FixtureSelected', dataUrl: 'data:font/ttf;base64,AAAA' },
    { id: 'unused', family: 'FixtureUnused', dataUrl: 'data:font/ttf;base64,BBBB' }];
  const c = vm.createContext({ console, customLyricFonts: records, fx: { lyricFont: 'custom:selected' },
    FontFace: function (family) { this.family = family; this.load = () => new Promise(resolve => pending.push({ face: this, resolve })); },
    document: { fonts: { add: face => added.push(face), delete() {} } },
    setTimeout: () => 1, clearTimeout() {}, refreshCurrentLyricStyle: () => calls.push('refresh'),
  });
  vm.runInContext(fs.readFileSync(fontPath, 'utf8'), c);
  c.registerSavedCustomLyricFonts();
  pending[1].resolve(pending[1].face);
  await c.customLyricFontFaceOwners.get('unused').promise;
  assert.deepEqual(calls, [], 'unselected background fonts do not rebuild the stage');
  pending[0].resolve(pending[0].face);
  await c.customLyricFontFaceOwners.get('selected').promise;
  assert.deepEqual(calls, ['refresh'], 'cold restore needs the same ready refresh as manual font selection');
  assert.equal(added.length, 2);
});

test('loading a font invalidates cached proportional karaoke ranges for the same line and font key', () => {
  let wideFontReady = false, measures = 0;
  const c = vm.createContext({
    fx: { lyricFont: 'custom:selected', lyricLetterSpacing: 0 }, lyricTextMeasureGeneration: 0,
    normalizeLyricFontKey: key => key, lyricFontWeightValue: () => 700,
    lyricKaraokeMeasureContext: () => ({}), lyricFxEditActive: () => false,
    clampRange: (value, min, max) => Math.max(min, Math.min(max, value)),
    lyricMeasureTextAtSize(ctx, text) {
      measures++; return [...text].reduce((total, letter) => total + (wideFontReady && letter === 'W' ? 3 : 1), 0);
    },
  });
  loadFunctions(c, fontPath, ['clearLyricTextMeasureCache']);
  loadFunctions(c, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['lyricKaraokeMetricsKey', 'lyricKaraokeWordRanges']);
  const line = { text: 'Wi', charCount: 2, words: [{ c0: 0, c1: 1 }, { c0: 1, c1: 2 }] };
  const first = c.lyricKaraokeWordRanges(line);
  assert.equal(first[0].p1, 0.5);
  const initialMeasures = measures;
  c.lyricKaraokeWordRanges(line); assert.equal(measures, initialMeasures, 'unchanged metrics stay cached');
  wideFontReady = true; c.clearLyricTextMeasureCache();
  const after = c.lyricKaraokeWordRanges(line);
  assert.equal(after[0].p1, 0.75, 'font-ready widths must replace fallback-font proportions');
  assert(measures > initialMeasures);
});

test('a display refresh exception does not orphan a successfully registered font face', async () => {
  const added = [], warnings = [];
  const record = { id: 'selected', family: 'FixtureSelected', dataUrl: 'data:font/ttf;base64,AAAA' };
  const c = vm.createContext({ customLyricFonts: [record], fx: { lyricFont: 'custom:selected' },
    console: { warn: (...args) => warnings.push(args) },
    FontFace: function (family) { this.family = family; this.load = () => Promise.resolve(this); },
    document: { fonts: { add: face => added.push(face), delete() {} } },
    setTimeout: () => 1, clearTimeout() {}, refreshCurrentLyricStyle() { throw new Error('fixture display error'); },
  });
  vm.runInContext(fs.readFileSync(fontPath, 'utf8'), c);
  assert.equal(await c.registerCustomLyricFont(record), true);
  const owner = c.customLyricFontFaceOwners.get(record.id);
  assert.equal(owner.face, added[0]);
  assert.equal(record.loaded, true);
  assert.equal(await c.registerCustomLyricFont(record), true);
  assert.equal(added.length, 1, 'retry retains the successful owner instead of adding a duplicate face');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], '[LyricFont] display refresh failed');
});
