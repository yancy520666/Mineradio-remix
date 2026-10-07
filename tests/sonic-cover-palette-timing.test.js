'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const { loadFunctions } = require('./helpers/classic-functions');

function fixture(preset = 8) {
  const tasks = [], palettes = [];
  let deepWork = 0;
  const c = vm.createContext({
    fx: { preset }, coverProcessToken: 0, coverTextureTrackToken: 0,
    coverTex: {}, coverEdgeTex: {}, coverPickerCanvas: null, currentCoverSource: null,
    uniforms: { uHasCover: { value: 0 }, uColorMixT: { value: 0 } },
    coverApplyStillCurrent: opts => opts.trackToken === 7,
    getCoverDepthCache: () => null, applyNeutralCoverEdgeTexture() {}, setCoverDepthState() {},
    setControlCoverSrc() {}, shelfManager: null, floatGroup: null, backCoverGroup: null,
    startColorMixTween() {}, queueAIDepthForCover() {}, setCoverDepthCache() {},
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) },
    updateLyricPaletteFromCover: canvas => palettes.push([canvas.width, canvas.height]),
    buildEdgeAndDepth: () => { deepWork++; return {}; },
    scheduleVisualApply: fn => tasks.push(fn), isRenderInteractionActive: () => false,
  });
  loadFunctions(c, 'public/js/modules/02-visual/15-ripples-cover-depth.js', ['applyCoverCanvas']);
  return { c, tasks, palettes, deepWork: () => deepWork };
}

test('Sonic cover palette is available before deferred depth work, using a bounded image read', () => {
  const f = fixture();
  f.c.applyCoverCanvas({ width: 2048, height: 2048 }, '', { trackToken: 7, deferHeavy: true });
  assert.equal(f.palettes.length, 1, 'palette must not wait for the heavy task');
  assert(f.palettes[0].every(size => size <= 128));
  assert.equal(f.deepWork(), 0);
  f.tasks[0]();
  assert.equal(f.deepWork(), 1);
  assert.equal(f.palettes.length, 1, 'depth completion must not restart the same color transition');
});

test('late old cover cannot recolor a new song; other presets keep their existing scheduling', () => {
  const f = fixture();
  f.c.applyCoverCanvas({ width: 400, height: 400 }, '', { trackToken: 6 });
  assert.equal(f.palettes.length, 0); assert.equal(f.tasks.length, 0);
  const other = fixture(0);
  other.c.applyCoverCanvas({ width: 400, height: 400 }, '', { trackToken: 7, deferHeavy: true });
  assert.equal(other.palettes.length, 0);
  other.tasks[0]();
  assert.equal(other.palettes.length, 1);
});

test('bridge gradually finishes a theme, ignores repeated targets, and cancels an obsolete transition', () => {
  let now = 0, next = 0, shown, lastKeys, applies = 0;
  const timers = new Map();
  const window = { addEventListener() {}, wallpaperPropertyListener: {
    applyUserProperties: props => { shown = props.mineradioCustomTheme.value; lastKeys = Object.keys(props).sort(); applies++; },
  } };
  const c = vm.createContext({ window, parent: { postMessage() {} }, performance: { now: () => now },
    setTimeout() {}, setInterval: fn => { timers.set(++next, fn); return next; },
    clearInterval: id => timers.delete(id), console,
  });
  const html = fs.readFileSync('public/vendor/sonic-workshop/mineradio-bridge.html', 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], c);
  window.wallpaperReady();
  const theme = color => ({ __primaryColor: color, uBaseColor1: color, uGlowIntensity: 1 });
  const apply = color => window.__mineradioApplyProperties({ mineradioCustomTheme: theme(color) });
  const tick = at => { now = at; [...timers.values()].forEach(fn => fn()); };
  apply('#000000'); apply('#ffffff');
  tick(100);
  assert.notEqual(shown.__primaryColor, '#000000'); assert.notEqual(shown.__primaryColor, '#ffffff');
  assert.deepEqual(lastKeys, ['mineradioCustomTheme', 'schemecolor'], 'transition steps send only the colours');
  apply('#ffffff'); // Repeated property messages must not extend the transition indefinitely.
  tick(800);
  assert.equal(shown.__primaryColor, '#ffffff'); assert.equal(timers.size, 0);
  const settledApplies = applies;
  apply('#ffffff');
  assert.equal(applies, settledApplies, 'an unchanged re-send does not re-apply every property');
  apply('#ff0000'); tick(900);
  const before = shown.__primaryColor;
  apply('#00ff00');
  assert.equal(shown.__primaryColor, before, 'retarget starts from the displayed color');
  assert.equal(timers.size, 1);
  tick(1700);
  assert.equal(shown.__primaryColor, '#00ff00'); assert.equal(timers.size, 0);
  apply('#000000'); window.__mineradioApplyProperties({ mineradioCustomTheme: null });
  assert.equal(timers.size, 0); assert.equal(shown, null);
});
