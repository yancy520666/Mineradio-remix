'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

function fixture() {
  const c = vm.createContext({});
  loadFunctions(c, 'public/js/modules/02-visual/04-visual-settings-persistence.js', ['clampRange', 'hslToRgb', 'rgbCss']);
  loadFunctions(c, 'public/js/modules/02-visual/07-lyrics-palette-text-utils.js', [
    'lyricHighImpactTextHsl', 'silverBlueLyricPalette', 'lyricTextPaletteFromHsl',
  ]);
  return c;
}

test('a saturated dark red cover retains its hue and differs from a dark blue cover', () => {
  const c = fixture();
  // Measured from the reported cover: dark overall, but strongly red rather than monochrome.
  const stats = { avgChroma: 0.46227, maxChroma: 0.89804, colorfulRatio: 0.90625, monochrome: false };
  const redHsl = { h: 0.98035, s: 0.99134, l: 0.45294 };
  for (const avgL of [0.15902, 0.24]) {
    const red = c.lyricTextPaletteFromHsl(redHsl, avgL, 0.89804, stats);
    const blue = c.lyricTextPaletteFromHsl({ ...redHsl, h: 0.60 }, avgL, 0.89804, stats);
    assert.notEqual(red.primary, c.silverBlueLyricPalette().primary);
    assert.notEqual(red.primary, blue.primary, 'different coloured covers must not share a neutral fallback');
    const channels = red.primary.match(/\d+/g).map(Number);
    assert(channels[0] > channels[1] + 40 && channels[0] > channels[2] + 40, 'red hue stays visible');
    assert((Math.max(...channels) + Math.min(...channels)) / 510 >= 0.70, 'dark covers still produce readable light text');
  }
});

test('black and grey covers retain the readable neutral fallback', () => {
  const c = fixture();
  for (const lightness of [0, 0.15, 0.65]) {
    const pal = c.lyricTextPaletteFromHsl({ h: 0, s: 0, l: lightness }, lightness, 0, {
      avgChroma: 0, maxChroma: 0, colorfulRatio: 0, monochrome: true,
    });
    assert.equal(pal.primary, c.silverBlueLyricPalette().primary);
  }
});
