'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

const root = path.resolve(__dirname, '..');
const guideFile = 'public/js/modules/09-idle-toast-libraries.js';

function guideSteps() {
  const source = fs.readFileSync(path.join(root, guideFile), 'utf8');
  const start = source.indexOf('var visualGuideSteps = [');
  const end = source.indexOf('];', start);
  const ctx = vm.createContext({});
  vm.runInContext(source.slice(start, end + 2), ctx);
  return JSON.parse(JSON.stringify(ctx.visualGuideSteps));
}

test('the guide tours quality, comments, DIY background and Wallpaper Engine on elements that exist', () => {
  const steps = guideSteps();
  assert.deepEqual(steps.map(step => step.key),
    ['welcome', 'search', 'quality', 'comments', 'diy', 'background', 'wallpaper', 'finish']);
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const exists = selector => {
    const last = selector.trim().split(/\s+/).pop();
    if (last.startsWith('#')) return html.includes('id="' + last.slice(1) + '"');
    return new RegExp('class="[^"]*\\b' + last.slice(1) + '\\b').test(html);
  };
  for (const step of steps.filter(s => s.selector)) assert(exists(step.selector), step.key + ' points at a missing element: ' + step.selector);
  // Console steps open the interface tab, where background media and Wallpaper Engine live.
  assert.deepEqual(steps.filter(s => s.console).map(s => [s.key, s.console]), [['background', 'interface'], ['wallpaper', 'interface']]);
});

function consoleHarness(mode) {
  const calls = [];
  const fx = { classList: { open: false, contains(name) { return name === 'show' && this.open; } } };
  const ctx = vm.createContext({
    diyPlayerMode: mode === 'diy', fxPanelTab: 'lyrics',
    visualGuideState: { mode, fxTab: 'lyrics', diyPreview: false, consoleOpened: false },
    document: { getElementById: () => fx },
    applyDiyMode(on, opts) { calls.push(['diy', on, opts && opts.save]); ctx.diyPlayerMode = on; },
    toggleFxPanel(on) { calls.push(['panel', on]); fx.classList.open = on; },
    setFxPanelTab(tab) { calls.push(['tab', tab]); ctx.fxPanelTab = tab; },
  });
  loadFunctions(ctx, guideFile, ['setVisualGuideConsole']);
  return { ctx, calls };
}

test('console steps preview DIY without saving it and put mode, panel and tab back afterwards', () => {
  const { ctx, calls } = consoleHarness('simple');
  ctx.setVisualGuideConsole('interface');
  assert.equal(ctx.diyPlayerMode, true);
  assert.equal(ctx.fxPanelTab, 'interface');
  ctx.setVisualGuideConsole('');
  assert.equal(ctx.diyPlayerMode, false);
  assert.equal(ctx.fxPanelTab, 'lyrics');
  assert(calls.filter(c => c[0] === 'diy').every(c => c[2] === false), 'the preview never saves the DIY preference');
  assert.deepEqual(calls.filter(c => c[0] === 'panel'), [['panel', true], ['panel', false]]);
});

test('a mode the user switches to during the guide is kept when the guide moves on', () => {
  const { ctx, calls } = consoleHarness('simple');
  ctx.setVisualGuideConsole('interface');
  // toggleDiyMode during the guide records the user's choice and clears the preview flag.
  ctx.visualGuideState.mode = 'diy';
  ctx.visualGuideState.diyPreview = false;
  ctx.setVisualGuideConsole('');
  assert.equal(ctx.diyPlayerMode, true);
  assert.equal(calls.filter(c => c[0] === 'diy').length, 1);
  const prefs = fs.readFileSync(path.join(root, 'public/js/modules/00-state/02-preferences-ui-modes.js'), 'utf8');
  assert.match(prefs, /visualGuideState\.diyPreview = false;/);
});
