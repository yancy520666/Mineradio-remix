'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const css = (process.env.MINERADIO_PLAYLIST_MATERIAL_CSS_PATH
  ? fs.readFileSync(process.env.MINERADIO_PLAYLIST_MATERIAL_CSS_PATH, 'utf8')
  : read('public/css/index.css')).replace(/\/\*[\s\S]*?\*\//g, '');
// The material selectors are simple descendants/compounds. This source-cascade
// fixture compares importance, then ID/class/type specificity, then source order;
// it is not a substitute for a browser paint or real-device GPU check.
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match, order) => match[1].split(',').map(selector => ({ selector: selector.trim(), body: match[2], order })));
function node(tag, id = '', classes = [], hover = false) { return { tag, id, classes: new Set(classes), hover }; }
function compoundMatches(token, element) {
  if (!/^(?:[a-z][\w-]*|\*)?(?:[#.][\w-]+|:hover)*$/i.test(token)) return false;
  const tag = token.match(/^[a-z][\w-]*/i);
  if (tag && tag[0] !== element.tag) return false;
  for (const part of token.matchAll(/([#.])([\w-]+)|(:hover)/g)) {
    if (part[3] && !element.hover) return false;
    if (part[1] === '#' && part[2] !== element.id) return false;
    if (part[1] === '.' && !element.classes.has(part[2])) return false;
  }
  return true;
}
function matches(selector, ancestry) {
  const parts = selector.split(/\s+/);
  let cursor = ancestry.length - 1;
  if (!compoundMatches(parts.pop(), ancestry[cursor--])) return false;
  while (parts.length) {
    const part = parts.pop();
    while (cursor >= 0 && !compoundMatches(part, ancestry[cursor])) cursor--;
    if (cursor-- < 0) return false;
  }
  return true;
}
function specificity(selector) {
  return [(selector.match(/#/g) || []).length, (selector.match(/\.|:hover/g) || []).length,
    selector.split(/\s+/).filter(token => /^[a-z]/i.test(token)).length];
}
function compare(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function cascade(ancestry, property) {
  let winner;
  for (const rule of rules) {
    if (!matches(rule.selector, ancestry)) continue;
    for (const declaration of rule.body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0 || declaration.slice(0, colon).trim() !== property) continue;
      const raw = declaration.slice(colon + 1).trim();
      const priority = [Number(/!important\s*$/.test(raw)), ...specificity(rule.selector), rule.order];
      if (!winner || compare(priority, winner.priority) >= 0) winner = { value: raw.replace(/\s*!important\s*$/, ''), selector: rule.selector, priority };
    }
  }
  assert(winner, property + ' must have a material declaration');
  return winner;
}
function panelPath(svg, powerClasses, classes = [], hover = false) {
  // Quality is a runtime setting, not a CSS class. Power states are independent.
  return [node('html', '', svg ? ['control-glass-svg-ok'] : []), node('body', '', powerClasses),
    node('div', 'playlist-panel', ['show', 'pinned']), ...(classes.length ? [node('div', '', classes, hover)] : [])];
}
function material(blur, density) {
  const values = new Map([['--fc-accent-rgb', '255, 255, 255']]);
  const c = vm.createContext({ fx: { playlistPanelGlassBlur: blur, playlistPanelGlassDensity: density, playlistPanelOpenDuration: .2, playlistPanelCloseDuration: .14 },
    fxDefaults: { playlistPanelGlassBlur: 14, playlistPanelGlassDensity: 1 }, clampRange: (v, a, b) => Math.max(a, Math.min(b, v)),
    document: { documentElement: { style: { setProperty() {} } }, getElementById: () => ({ style: { setProperty: (key, value) => values.set(key, value) } }) } });
  loadFunctions(c, 'public/js/modules/00-state/06-fx-runtime-layout.js', ['clampPlaylistPanelFxSettings', 'playlistPanelAlphaVars', 'setPlaylistPanelCssVar', 'applyPlaylistPanelFxSettings']);
  c.applyPlaylistPanelFxSettings();
  return text => text.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_all, key, fallback) => values.get(key) || fallback);
}

test('queue, playlist cards and song rows share density and one panel blur through the actual important cascade', () => {
  for (const svg of [false, true]) for (const power of [[], ['render-background-eco'], ['render-deep-sleep']]) {
    const outer = panelPath(svg, power);
    assert.match(cascade(outer, 'background').value, /var\(--playlist-panel-density, 1\)/);
    assert.equal(material(14, .55)(cascade(outer, 'backdrop-filter').value), 'blur(14px) saturate(1.16)');
    assert.equal(material(60, 1)(cascade(outer, '-webkit-backdrop-filter').value), 'blur(60px) saturate(1.16)');
    const rows = [['queue-item'], ['pl-card'], ['pl-detail-row']];
    for (const classes of rows) for (const hover of [false, true]) {
      const row = panelPath(svg, power, classes, hover);
      const background = cascade(row, 'background').value;
      assert.match(background, new RegExp(hover ? '--playlist-row-hover-a' : '--playlist-row-a'));
      assert.notEqual(material(14, .55)(background), material(14, 1)(background), classes.join('.') + ' density must reach its winning background');
      assert.equal(cascade(row, 'backdrop-filter').value, 'none');
    }
    for (const classes of [['queue-item', 'now'], ['pl-card', 'expanded']]) {
      for (const hover of [false, true]) assert.match(cascade(panelPath(svg, power, classes, hover), 'background').value, /--playlist-row-selected-a/);
    }
  }
});

test('podcast parent and child cards use the same base, hover and selected density backgrounds', () => {
  for (const svg of [false, true]) for (const power of [[], ['render-background-eco'], ['render-deep-sleep']]) {
    for (const classes of [['pl-card', 'podcast-card'], ['pl-card', 'podcast-card', 'podcast-child']]) {
      for (const hover of [false, true]) {
        const background = cascade(panelPath(svg, power, classes, hover), 'background').value;
        assert.match(background, new RegExp(hover ? '--playlist-row-hover-a' : '--playlist-row-a'));
        assert.notEqual(material(14, .55)(background), material(14, 1)(background));
        assert.match(cascade(panelPath(svg, power, [...classes, 'expanded'], hover), 'background').value, /--playlist-row-selected-a/);
      }
    }
  }
});

test('expanded playlist background beats global important glass and remains density-controlled', () => {
  for (const svg of [false, true]) for (const power of [[], ['render-background-eco'], ['render-deep-sleep']]) {
    const detail = panelPath(svg, power, ['pl-inline-detail']);
    const background = cascade(detail, 'background');
    assert.equal(background.selector, '#playlist-panel .pl-inline-detail', 'scoped important background must beat global important material');
    assert.match(background.value, /--playlist-row-hover-a/);
    assert.notEqual(material(14, .55)(background.value), material(14, 1)(background.value));
    assert.equal(cascade(detail, 'backdrop-filter').value, 'none', 'the existing ID selector prevents an inner glass pass');
    assert.equal(cascade(detail, '-webkit-backdrop-filter').value, 'none');
  }
});

test('all sticky control surfaces are independently opaque and never introduce another backdrop pass', () => {
  for (const svg of [false, true]) for (const power of [[], ['render-background-eco'], ['render-deep-sleep']]) {
    for (const cls of ['playlist-panel-sticky', 'queue-toolbar', 'pl-detail-sticky']) {
      const ancestry = panelPath(svg, power, [cls]);
      const background = cascade(ancestry, 'background').value;
      assert.match(background, /^linear-gradient\(180deg, rgb\(/);
      assert.doesNotMatch(background, /rgba\(|var\(/, 'each gradient stop is opaque regardless of saved density');
      assert.equal(material(14, .55)(background), material(60, 1)(background));
      assert.equal(cascade(ancestry, 'backdrop-filter').value, 'none');
      assert.equal(cascade(ancestry, '-webkit-backdrop-filter').value, 'none');
    }
  }
});
