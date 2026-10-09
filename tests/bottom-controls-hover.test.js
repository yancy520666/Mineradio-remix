'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/01-scene/04-bottom-controls-cursor.js'), 'utf8');
function fixture() {
  const events = {}, hides = [];
  const listener = target => (event, fn) => { events[target + ':' + event] = fn; };
  const bar = { classList: { contains: name => name === 'visible' }, getBoundingClientRect: () => ({ left: 100, right: 300, top: 400, bottom: 450 }), addEventListener: listener('bar') };
  const handle = { getBoundingClientRect: () => ({ left: 190, right: 210, top: 470, bottom: 490 }), addEventListener: listener('handle') };
  const ctx = { controlsHovering: false, controlsAutoHide: true, controlsHideTimer: null, miniQueueOpen: false,
    diyPlayerMode: false, performance: { now: () => 1 },
    document: { hidden: false, body: { classList: { contains: () => false } }, getElementById: id => id === 'bottom-bar' ? bar : (id === 'bottom-handle' ? handle : null), addEventListener: listener('document') },
    window: { addEventListener: listener('window') },
    isBottomControlsSuppressedForShelf: () => false, wakeBottomHandle() {}, setControlsHidden() {},
    scheduleControlsHide: delay => hides.push(delay), revealBottomControls() {}, clearTimeout() {}, updateControlsChromeState() {},
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function updateControlsAutoHideFromPointer('), source.indexOf('function toggleControlsAutoHide(')), ctx);
  vm.runInContext(source.slice(source.indexOf('(function initControlsAutoHide()'), source.indexOf('function isCursorAutoHideMode(')), ctx);
  return { ctx, events, hides };
}
test('coordinate updates clear stale hover when mouseleave was missed, including DIY early-return', () => {
  const { ctx, events, hides } = fixture();
  events['bar:mouseenter'](); assert.equal(ctx.controlsHovering, true);
  ctx.updateControlsAutoHideFromPointer(600, 200);
  assert.equal(ctx.controlsHovering, false); assert.equal(hides.at(-1), 70);
  ctx.updateControlsAutoHideFromPointer(200, 430); assert.equal(ctx.controlsHovering, true);
  ctx.updateControlsAutoHideFromPointer(200, 480); assert.equal(ctx.controlsHovering, true);
  ctx.diyPlayerMode = true;
  const originalGet = ctx.document.getElementById;
  ctx.document.getElementById = id => id === 'fx-panel' ? {
    classList: { contains: () => true }, getBoundingClientRect: () => ({ left: 500, right: 650, top: 150, bottom: 250 }),
  } : originalGet(id);
  ctx.updateControlsAutoHideFromPointer(600, 200);
  assert.equal(ctx.controlsHovering, false);
  assert.equal(hides.at(-1), 80);
});
test('pointer over a bar popover above the bar rect keeps controls visible', () => {
  const { ctx, events, hides } = fixture();
  const bar = ctx.document.getElementById('bottom-bar');
  // Volume popover sits ~46px above the bar: outside rect + 18px slack.
  bar.matches = selector => selector === ':hover';
  ctx.updateControlsAutoHideFromPointer(200, 300);
  assert.equal(ctx.controlsHovering, true);
  assert.equal(hides.length, 0);
  // Real hover moves elsewhere: geometry alone decides again.
  bar.matches = () => false;
  ctx.updateControlsAutoHideFromPointer(200, 300);
  assert.equal(ctx.controlsHovering, false);
  assert.equal(hides.at(-1), 70);
});
test('held slider drag outside the popover keeps controls until pointer release', () => {
  const { ctx, events, hides } = fixture();
  const bar = ctx.document.getElementById('bottom-bar');
  bar.matches = () => false;
  events['bar:pointerdown']();
  ctx.updateControlsAutoHideFromPointer(700, 100);
  assert.equal(ctx.controlsHovering, true);
  events['bar:mouseleave']();
  assert.equal(ctx.controlsHovering, true);
  events['window:pointerup']();
  assert.equal(ctx.controlsHovering, false);
  assert.equal(hides.at(-1), 70);
});
test('leaving document, blur and hidden page clear hover and schedule normal hide', () => {
  const { ctx, events, hides } = fixture();
  for (const event of ['document:mouseleave', 'window:blur', 'document:visibilitychange']) {
    ctx.controlsHovering = true; ctx.document.hidden = true; events[event]();
    assert.equal(ctx.controlsHovering, false); assert.equal(hides.at(-1), 70);
  }
});


test('open source portal and quality handoff protect against expired hide timers, then release', () => {
  const { ctx } = fixture();
  const classes = new Set(['visible']);
  const bar = ctx.document.getElementById('bottom-bar');
  bar.classList = { contains: name => classes.has(name), toggle: (name, yes) => yes ? classes.add(name) : classes.delete(name) };
  bar.style = {};
  let sourceOpen = true, qualityOpen = false;
  const get = ctx.document.getElementById;
  ctx.document.getElementById = id => id === 'control-source-switcher' ? { classList: { contains: () => sourceOpen } }
    : id === 'quality-control' ? { classList: { contains: () => qualityOpen } } : get(id);
  ctx.controlsRevealHoldUntil = 0; ctx.desktopWallpaperKeepsPlayerConsoleVisible = () => false;
  loadFunctions(ctx, 'public/js/modules/01-scene/04-bottom-controls-cursor.js', ['bottomControlsMenuActive', 'setControlsHidden']);
  ctx.setControlsHidden(true); assert.equal(classes.has('soft-hidden'), false);
  sourceOpen = false; qualityOpen = true;
  ctx.setControlsHidden(true); assert.equal(classes.has('soft-hidden'), false);
  qualityOpen = false;
  ctx.setControlsHidden(true); assert.equal(classes.has('soft-hidden'), true);
  sourceOpen = true; ctx.document.hidden = true;
  ctx.setControlsHidden(true); assert.equal(classes.has('soft-hidden'), true);
});
