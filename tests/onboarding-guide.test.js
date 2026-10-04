'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

const root = path.resolve(__dirname, '..');
const guideFile = 'public/js/modules/09a-onboarding-guide.js';

function guideSteps() {
  const source = fs.readFileSync(path.join(root, guideFile), 'utf8');
  const start = source.indexOf('var visualGuideSteps = [');
  const end = source.indexOf('];', start);
  const ctx = vm.createContext({});
  vm.runInContext(source.slice(start, end + 2), ctx);
  return JSON.parse(JSON.stringify(ctx.visualGuideSteps));
}

test('empty players explain when song-dependent controls become available', () => {
  let song = null;
  const ctx = vm.createContext({ currentCoverSong: () => song });
  loadFunctions(ctx, guideFile, ['visualGuideStepContent']);
  const steps = guideSteps();
  const content = key => ctx.visualGuideStepContent(steps.find(s => s.key === key));
  assert.match(content('quality').body, /先搜索并播放/);
  assert.match(content('comments').hint, /无需先登录/);
  assert.match(content('background').body, /播放歌曲后/);
  song = { id: 123, name: '已选歌曲' };
  for (const step of steps) assert.equal(ctx.visualGuideStepContent(step), step);
});

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
  const classes = new Set();
  const fx = { scrollTop: 0, classList: {
    contains: name => classes.has(name),
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
  } };
  const ctx = vm.createContext({
    diyPlayerMode: mode === 'diy', fxPanelTab: 'lyrics',
    visualGuideState: { mode, fxTab: 'lyrics', diyPreview: false, consoleOpened: false, fxScrollTop: 71 },
    document: { getElementById: id => id === 'fx-panel' ? fx : null },
    peekTimers: { fx: null },
    requestAnimationFrame: fn => fn(),
    applyDiyMode(on, opts) { calls.push(['diy', on, opts && opts.save]); ctx.diyPlayerMode = on; },
    setPeek(el, on) { calls.push(['panel', on]); el.classList.toggle('peek', on); },
    setFxPanelTab(tab) { calls.push(['tab', tab]); ctx.fxPanelTab = tab; },
  });
  loadFunctions(ctx, guideFile, ['setVisualGuideConsole']);
  return { ctx, calls, fx };
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
  assert.deepEqual(calls.filter(c => c[0] === 'panel'), [['panel', true]]);
  assert.equal(ctx.document.getElementById('fx-panel').classList.contains('peek'), false);
  assert.equal(ctx.document.getElementById('fx-panel').scrollTop, 71);
});

test('an already open console is restored with its tab and scroll, rather than closed', () => {
  const { ctx, fx } = consoleHarness('diy');
  ctx.visualGuideState.fxWasPeek = true;
  ctx.visualGuideState.fxWasOpen = true;
  fx.classList.toggle('peek', true);
  ctx.setVisualGuideConsole('interface');
  fx.scrollTop = 250;
  ctx.setVisualGuideConsole('');
  assert.equal(fx.classList.contains('peek'), true);
  assert.equal(ctx.fxPanelTab, 'lyrics');
  assert.equal(fx.scrollTop, 71);
});

test('guide visibility holds are limited to the current step and end on close', () => {
  const ctx = vm.createContext({ visualGuideActive: true, visualGuideStep: 2, visualGuideSteps: guideSteps() });
  loadFunctions(ctx, guideFile, ['activeVisualGuideSteps', 'visualGuideKeepsBottomControlsVisible', 'visualGuideKeepsPeekOpen']);
  assert.equal(ctx.visualGuideKeepsBottomControlsVisible(), true);
  ctx.visualGuideStep = 3;
  assert.equal(ctx.visualGuideKeepsBottomControlsVisible(), true);
  ctx.visualGuideStep = 5;
  assert.equal(ctx.visualGuideKeepsBottomControlsVisible(), false);
  assert.equal(ctx.visualGuideKeepsPeekOpen('fx'), true);
  assert.equal(ctx.visualGuideKeepsPeekOpen('search'), false);
  ctx.visualGuideActive = false;
  assert.equal(ctx.visualGuideKeepsPeekOpen('fx'), false);
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
