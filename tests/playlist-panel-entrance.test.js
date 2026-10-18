'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const file = 'public/js/modules/06-lyrics/01-playlist-panel-shell.js';

test('all visible rows enter before paint, with a bounded top-to-bottom cascade', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    getBoundingClientRect: () => ({ top: i * 60 - 180, bottom: i * 60 - 120, height: 60 }),
  }));
  const list = { querySelectorAll: () => rows, querySelector: () => null };
  const scroller = { getBoundingClientRect: () => ({ top: 0, bottom: 1200 }) };
  let animation;
  const context = vm.createContext({ window: { gsap: {
    killTweensOf() {},
    fromTo(targets, from, to) { animation = { targets, from, to }; },
  } }, requestAnimationFrame() { assert.fail('entrance state must be set before paint'); } });
  loadFunctions(context, file, ['animateListItems', 'visiblePanelListItems', 'animateVisiblePanelList']);
  context.animateVisiblePanelList(list, '.queue-item', scroller, null, { scrollActive: false });
  assert.deepEqual(Array.from(animation.targets), rows.slice(3, 23));
  assert.equal(animation.from.autoAlpha, 0);
  assert.equal(animation.from.x, -22);
  assert.equal(animation.to.autoAlpha, 1);
  assert.equal(animation.to.x, 0);
  assert.ok(animation.to.stagger * (animation.targets.length - 1) <= 0.338);
});

test('opening finishes deferred rendering and positioning before animating final rows', () => {
  const calls = [], panel = {};
  const context = vm.createContext({
    shouldAnimatePlaylistPanelOpen: () => true,
    flushDeferredQueuePanel: () => calls.push('render'),
    preparePlaylistPanelTabOnOpen: () => calls.push('position'),
    animatePlaylistPanelCurrentTab(actual, opts) {
      assert.equal(actual, panel); assert.equal(opts.scrollActive, false); calls.push('animate');
    },
  });
  loadFunctions(context, file, ['preparePlaylistPanelOpen']);
  context.preparePlaylistPanelOpen(panel, 'test');
  assert.deepEqual(calls, ['render', 'position', 'animate']);
});

test('instant current-song positioning renders its final virtual window synchronously', () => {
  const calls = [];
  const current = { offsetTop: 3000, offsetHeight: 60 };
  const panel = { clientHeight: 800, scrollHeight: 10000, scrollTop: 0,
    __lastCurrentScrollAt: 950, __syncSmoothWheelTarget: () => calls.push('sync-wheel') };
  const list = { querySelector: () => current };
  const context = vm.createContext({
    document: { getElementById: id => id === 'playlist-panel' ? panel : list },
    queueViewTab: 'queue', currentIdx: 40, performance: { now: () => 1000 },
    window: { gsap: { killTweensOf() {} } },
    renderQueuePanel: opts => calls.push(opts.scrollCurrent ? 'render-current' : 'render-final'),
    requestAnimationFrame() { assert.fail('instant positioning must precede row animation'); },
  });
  loadFunctions(context, file, ['scrollPlaylistPanelToCurrent']);
  context.scrollPlaylistPanelToCurrent({ instant: true });
  assert.deepEqual(calls, ['render-current', 'sync-wheel', 'render-final']);
  assert.equal(panel.scrollTop, 3000 - (800 - 60) * 0.34);
});

test('switching back to the queue positions its final window before any entrance animation', () => {
  const calls = [], panel = {}, pane = { style: {} }, tab = { classList: { toggle() {} } };
  const c = vm.createContext({ queueViewTab: 'playlists',
    document: { getElementById: id => id === 'playlist-panel' ? panel : id.endsWith('-pane') ? pane : tab },
    cancelPlaylistReturnMotion() {}, normalizePlaylistPanelTab: value => value,
    updatePanelTabIndicator: () => calls.push('indicator'),
    playlistPanelTopInset: () => calls.push('layout'), syncPlaylistPanelContentClip: () => calls.push('clip'),
    scrollPlaylistPanelToCurrent(opts) {
      assert.equal(opts.instant, true); assert.equal(c.queueViewTab, 'queue'); calls.push('position-final-window');
    },
    animatePlaylistPanelCurrentTab(actual, opts) {
      assert.equal(actual, panel); assert.equal(opts.scrollActive, false); calls.push('animate-final-rows');
    },
  });
  loadFunctions(c, file, ['switchPlaylistTab']);
  c.switchPlaylistTab('queue', { save: false });
  assert.deepEqual(calls, ['indicator', 'layout', 'clip', 'position-final-window', 'animate-final-rows']);
});
