'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const dashboard = 'public/js/modules/05-playback/03a-home-dashboard.js';

for (const [reduced, fast] of [[false, false], [true, false], [false, true]]) test('home entrance respects motion and skip preferences: ' + [reduced, fast], () => {
  const calls = [], timelines = [];
  const nodes = Array.from({ length: 3 }, () => ({ style: { opacity: '', transform: '' } }));
  const gsap = { timeline(options) {
    assert.equal(calls.filter(c => c === 'read').length, 3, 'read all resting poses before writes');
    const timeline = { options, tweens: [],
      to(state, options, at) { assert.equal(at, 0); this.tweens.push({ state, options }); return this; },
      kill() { calls.push('kill'); } };
    timelines.push(timeline); return timeline;
  } };
  const c = vm.createContext({ emptyHomeActive: true, homeDashboardEntranceAnimations: [],
    window: { gsap, matchMedia: () => ({ matches: reduced }) },
    cssCubicBezierEase: (...points) => points,
    document: { body: { classList: { contains: () => false } }, querySelectorAll: () => nodes },
    getComputedStyle: () => { calls.push('read'); return { transform: 'none' }; } });
  loadFunctions(c, dashboard, ['stopHomeDashboardEntrance', 'animateHomeDashboardEntrance']);
  c.animateHomeDashboardEntrance({ fastSkip: fast });
  // Opacity and movement are separate animations so the fade can be soft while the lift settles.
  const expected = fast ? 0 : 3;
  assert.equal(timelines.length, expected);
  if (fast) assert.equal(calls.length, 0, 'fast skip retains the existing container fade without extra glass layers');
  for (const [index, timeline] of timelines.entries()) {
    assert.equal(timeline.tweens.length, reduced ? 1 : 2);
    assert.equal(timeline.options.delay, reduced ? 0 : index * 0.09);
    for (const tween of timeline.tweens) {
      assert(tween.options.duration + timeline.options.delay <= 1.3);
      if (tween.options.opacity != null) tween.state.opacity = 0.5;
      else tween.state.lift = 7;
      tween.options.onUpdate();
    }
    assert.equal(nodes[index].style.opacity, '0.5');
    assert.equal(nodes[index].style.transform, reduced ? '' : ' translateY(7px)');
    timeline.options.onComplete();
    assert.equal(nodes[index].style.opacity, '');
    assert.equal(nodes[index].style.transform, '');
    // An interrupted/restarted entrance must also release its temporary styles.
    nodes[index].style.opacity = '0.3';
    if (!reduced) nodes[index].style.transform = 'translateY(10px)';
  }
  c.stopHomeDashboardEntrance();
  assert.equal(calls.filter(c => c === 'kill').length, expected);
  for (const node of nodes) assert.deepEqual(node.style, { opacity: '', transform: '' });
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
