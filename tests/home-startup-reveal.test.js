'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const dashboard = 'public/js/modules/05-playback/03a-home-dashboard.js';

for (const [reduced, fast] of [[false, false], [true, false], [false, true]]) test('home entrance respects motion and skip preferences: ' + [reduced, fast], () => {
  const calls = [], animations = [];
  const nodes = Array.from({ length: 3 }, (_, i) => ({
    animate(frames, options) {
      assert.equal(calls.filter(c => c === 'read').length, 3, 'read all resting poses before writes');
      animations.push({ frames, options }); calls.push('animate'); return { cancel: () => calls.push('cancel') };
    }
  }));
  const c = vm.createContext({ emptyHomeActive: true, homeDashboardEntranceAnimations: [],
    window: { matchMedia: () => ({ matches: reduced }) },
    document: { body: { classList: { contains: () => false } }, querySelectorAll: () => nodes },
    getComputedStyle: () => { calls.push('read'); return { transform: 'none' }; } });
  loadFunctions(c, dashboard, ['stopHomeDashboardEntrance', 'animateHomeDashboardEntrance']);
  c.animateHomeDashboardEntrance({ fastSkip: fast });
  // Opacity and movement are separate animations so the fade can be soft while the lift settles.
  const expected = fast ? 0 : (reduced ? 3 : 6);
  assert.equal(animations.length, expected);
  if (fast) assert.equal(calls.length, 0, 'fast skip retains the existing container fade without extra glass layers');
  for (const animation of animations) {
    assert(animation.options.duration + animation.options.delay <= 1300);
    assert.equal(animation.options.fill, 'backwards');
    if (reduced) { assert.equal(animation.options.delay, 0); assert.equal(animation.frames[0].transform, undefined); }
    else assert(animation.frames[0].opacity === 0 || /translateY/.test(animation.frames[0].transform));
  }
  c.stopHomeDashboardEntrance();
  assert.equal(calls.filter(c => c === 'cancel').length, expected);
});

test('splash handoff releases the native visibility gate and prepares home before its first frame', () => {
  const calls = [];
  const c = vm.createContext({ markAppPerf() {},
    releaseStartupFastSkipPreload: () => calls.push('release-native-gate'),
    updateEmptyHomeVisibility: opts => { assert.equal(opts.skipEntrance, true); calls.push('render-home'); return true; },
    animateHomeDashboardEntrance: () => calls.push('animate-ready-home'),
    requestAnimationFrame: () => calls.push('next-frame') });
  loadFunctions(c, 'public/js/modules/10-shell/03-splash.js', ['finishSplashReveal']);
  c.finishSplashReveal(true);
  assert.deepEqual(calls, ['release-native-gate', 'render-home', 'animate-ready-home', 'next-frame']);
});

test('logged-out home renders once after state preparation, without replaying its entrance on refresh', () => {
  let renders = 0, entrances = 0;
  const c = vm.createContext({ emptyHomeActive: false, homeDiscoverState: {}, shouldShowEmptyHome: () => true,
    document: { body: { classList: { toggle() {} } }, getElementById: () => null },
    activateHomeWallpaperPreview() {}, setPeek() {}, hasAnyPlatformLogin: () => false,
    renderHomeDiscover() { assert.equal(c.homeDiscoverState.mode, 'starter'); renders++; },
    animateHomeDashboardEntrance: () => { entrances++; } });
  loadFunctions(c, 'public/js/modules/05-playback/04-home-empty-wallpaper.js', ['updateEmptyHomeVisibility']);
  c.updateEmptyHomeVisibility(); c.updateEmptyHomeVisibility();
  assert.equal(renders, 2); assert.equal(entrances, 1);
});
