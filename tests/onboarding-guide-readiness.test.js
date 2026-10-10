'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

const guideFile = 'public/js/modules/09a-onboarding-guide.js';
const peekFile = 'public/js/modules/10-shell/02-peek-panels-upload.js';
function classes(names = []) {
  const values = new Set(names);
  return {
    contains: key => values.has(key),
    add: (...keys) => keys.forEach(key => values.add(key)),
    remove: (...keys) => keys.forEach(key => values.delete(key)),
    toggle(key, on) { if (on) values.add(key); else values.delete(key); }
  };
}
function clock() {
  let now = 0, serial = 0;
  const frames = new Map(), timers = new Map();
  return {
    performance: { now: () => now }, frames, timers,
    requestAnimationFrame(fn) { const id = ++serial; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    frame(time) {
      now = time;
      const queued = [...frames]; frames.clear();
      for (const [, fn] of queued) fn(time);
    },
    tick(time) {
      now = time;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    }
  };
}
function element(id, names = []) {
  return { id, style: {}, classList: classes(names), attrs: {}, parentElement: null,
    setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; },
    addEventListener() {}, querySelector() { return null; }, closest() { return null; } };
}
function positioningHarness() {
  const time = clock();
  const guide = element('visual-guide', ['show']);
  const ring = element('visual-guide-ring');
  const card = element('visual-guide-card', ['is-ready']);
  card.offsetWidth = 340; card.offsetHeight = 180;
  let ringSettled = true, cardSettled = true, targetLeft = 360;
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  ring.getBoundingClientRect = () => ringSettled ? rect(parseFloat(ring.style.left) || 0, parseFloat(ring.style.top) || 0,
    parseFloat(ring.style.width) || 0, parseFloat(ring.style.height) || 0) : rect(640, 410, 0, 0);
  card.getBoundingClientRect = () => cardSettled ? rect(parseFloat(card.style.left) || 0, parseFloat(card.style.top) || 0, 340, 180) : rect(470, 320, 340, 180);
  const search = element('search-area');
  const target = element('search-box'); target.parentElement = search;
  target.getBoundingClientRect = () => rect(targetLeft, 34, 560, 58);
  const demo = { hidden: true };
  const nodes = { 'visual-guide': guide, 'visual-guide-ring': ring, 'visual-guide-card': card, 'visual-guide-demo': demo };
  const style = el => ({ display: 'block', visibility: 'visible', opacity: el === search && !search.classList.contains('peek') ? '0' : '1', overflowX: 'visible', overflowY: 'visible' });
  const ctx = vm.createContext({ ...time, visualGuideActive: true, visualGuideStep: 0,
    visualGuideState: {}, visualGuideSteps: [{ key: 'search', selector: '#search-box', place: 'below' }],
    visualGuidePositionFrame: 0, visualGuidePositionRetryTimer: 0, visualGuidePositionToken: 0,
    visualGuideStepRevision: 1, visualGuideContentRevision: 1, visualGuideStepReady: false,
    innerWidth: 1280, innerHeight: 820, shelfManager: null, immersiveMode: false, diyPlayerMode: false,
    emptyHomeActive: false, peekTimers: { search: null }, searchPeekRevealToken: 0, searchPeekRevealPending: false,
    prepareSearchGlassBeforePeek: () => false, isSearchGlassReadyForReveal: () => false,
    document: { hidden: false, documentElement: element('html'), getElementById: id => nodes[id] || null,
      querySelector: selector => selector === '#search-box' ? target : null }, window: { getComputedStyle: style }, getComputedStyle: style
  });
  loadFunctions(ctx, guideFile, ['activeVisualGuideSteps', 'guideTargetRect', 'visibleGuideRect', 'visualGuideCardPosition',
    'positionVisualGuideStep', 'visualGuideRectsMatch', 'visualGuideLayoutIsSettled', 'cancelVisualGuidePositioning', 'scheduleVisualGuidePositioning']);
  loadFunctions(ctx, peekFile, ['setPeek', 'scheduleSearchPeekAfterGlassReady', 'cancelPendingSearchPeekReveal']);
  return { ctx, time, search, target, ring, card,
    setRingSettled: on => { ringSettled = on; }, setCardSettled: on => { cardSettled = on; }, moveTarget: left => { targetLeft = left; } };
}

test('a delayed first frame keeps positioning until the real search reveal is measurable', () => {
  const h = positioningHarness();
  // Positioning may already be queued by resize/transition while glass is still preparing.
  h.ctx.scheduleVisualGuidePositioning();
  h.ctx.setPeek(h.search, true, 'search');
  h.time.frame(2000);
  assert(h.search.classList.contains('peek'), 'glass fallback must reveal the actual search panel');
  assert.equal(parseFloat(h.ring.style.width), 0, 'first positioning sampled the still-hidden target');
  assert(h.time.frames.size > 0, 'a blocked frame must not exhaust the positioning window before the target appears');
  for (let i = 1; i <= 5; i++) h.time.frame(2000 + 16 * i);
  assert.equal(parseFloat(h.ring.style.width), 572);
  assert.equal(parseFloat(h.ring.style.left), 354);
  assert.equal(h.ctx.visualGuideStepReady, true);
  assert.equal(h.time.frames.size, 0, 'a settled static step must stop its frame loop');
});

test('readiness requires target stability and the rendered ring/card to reach their measured positions', () => {
  const h = positioningHarness(); h.search.classList.add('peek');
  h.setRingSettled(false); h.setCardSettled(false);
  h.ctx.scheduleVisualGuidePositioning();
  for (let i = 0; i < 4; i++) h.time.frame(2000 + i * 16);
  assert.equal(h.ctx.visualGuideStepReady, false);
  assert(h.time.frames.size > 0, 'ring and card can still be transitioning after the old deadline');
  h.setRingSettled(true); h.setCardSettled(true);
  h.time.frame(2080); h.moveTarget(400); h.time.frame(2096);
  assert.equal(h.ctx.visualGuideStepReady, false, 'moving targets reset stable sampling');
  for (let i = 1; i <= 4; i++) h.time.frame(2096 + i * 16);
  assert.equal(h.ctx.visualGuideStepReady, true);
  assert.equal(parseFloat(h.ring.style.left), 394);
});

for (const unavailable of ['hidden', 'offscreen', 'missing']) {
  test('a permanently ' + unavailable + ' target switches from frames to low-frequency recovery checks', () => {
    const h = positioningHarness();
    if (unavailable !== 'hidden') h.search.classList.add('peek');
    if (unavailable === 'offscreen') h.moveTarget(-1000);
    if (unavailable === 'missing') h.ctx.document.querySelector = () => null;
    let samples = 0;
    const position = h.ctx.positionVisualGuideStep;
    h.ctx.positionVisualGuideStep = () => { samples++; return position(); };
    h.ctx.scheduleVisualGuidePositioning();
    for (let i = 1; i <= 120; i++) h.time.frame(i * 16);
    assert.equal(samples, 90, 'an unavailable target must have a bounded rendered-frame budget');
    assert.equal(h.ctx.visualGuideStepReady, false);
    assert.equal(h.time.frames.size, 0, 'an unavailable target must stop its foreground frame loop');
    assert.equal(h.time.timers.size, 1, 'only one low-frequency recovery timer may remain');
    assert.equal(parseFloat(h.ring.style.width), 0, 'an unavailable target must not produce a misleading spotlight');
    h.time.tick(1940); h.time.frame(1952);
    assert.equal(samples, 91, 'a recovery timer must sample once without starting another frame burst');
    assert.equal(h.time.frames.size, 0);
    assert.equal(h.time.timers.size, 1);

    // The target can become ready without a transitionend or resize event.
    h.search.classList.add('peek'); h.moveTarget(360);
    h.ctx.document.querySelector = selector => selector === '#search-box' ? h.target : null;
    h.time.tick(2452); h.time.frame(2452);
    assert(h.time.frames.size > 0, 'a recovered target gets fresh frames to settle its geometry');
    for (let i = 1; i <= 4; i++) h.time.frame(2452 + i * 16);
    assert.equal(h.ctx.visualGuideStepReady, true);
    assert.equal(parseFloat(h.ring.style.width), 572);
    assert.equal(parseFloat(h.ring.style.left), 354);
    assert.equal(h.time.frames.size, 0);
    assert.equal(h.time.timers.size, 0);
  });
}

test('visibility suspension cancels both positioning work types and resumes only when visible', () => {
  const h = positioningHarness();
  h.ctx.scheduleVisualGuidePositioning();
  const dispatchedFrame = [...h.time.frames.values()][0];
  h.ctx.document.hidden = true; h.ctx.scheduleVisualGuidePositioning();
  dispatchedFrame();
  assert.equal(h.time.frames.size, 0);
  assert.equal(h.time.timers.size, 0);
  h.ctx.document.hidden = false; h.ctx.scheduleVisualGuidePositioning();
  for (let i = 1; i <= 90; i++) h.time.frame(i * 16);
  const dispatchedRetry = [...h.time.timers.values()][0].fn;
  h.ctx.document.hidden = true; h.ctx.scheduleVisualGuidePositioning();
  dispatchedRetry(); h.time.tick(5000);
  assert.equal(h.time.frames.size, 0);
  assert.equal(h.time.timers.size, 0);
  assert.equal(h.ctx.visualGuideStepReady, false);
  h.ctx.document.hidden = false; h.search.classList.add('peek'); h.ctx.scheduleVisualGuidePositioning();
  for (let i = 1; i <= 5; i++) h.time.frame(5000 + i * 16);
  assert.equal(h.ctx.visualGuideStepReady, true);
  assert.equal(h.time.frames.size, 0);
});

for (const pending of ['frame', 'retry']) {
  test('a queued positioning ' + pending + ' observes hidden state before the visibility event arrives', () => {
    const h = positioningHarness(); h.ctx.scheduleVisualGuidePositioning();
    if (pending === 'retry') for (let i = 1; i <= 90; i++) h.time.frame(i * 16);
    const lastWidth = h.ring.style.width;
    h.ctx.document.hidden = true;
    if (pending === 'frame') h.time.frame(16);
    else h.time.tick(1940);
    assert.equal(h.time.frames.size, 0);
    assert.equal(h.time.timers.size, 0);
    assert.equal(h.ring.style.width, lastWidth, 'hidden windows must not measure and write guide geometry');
  });
}

test('a stale recovery timer cannot overwrite a fresh event-triggered positioning pass', () => {
  const h = positioningHarness(); h.ctx.scheduleVisualGuidePositioning();
  for (let i = 1; i <= 90; i++) h.time.frame(i * 16);
  const stale = [...h.time.timers.values()][0].fn;
  h.search.classList.add('peek'); h.ctx.scheduleVisualGuidePositioning();
  const current = h.ctx.visualGuidePositionFrame;
  stale();
  assert.equal(h.ctx.visualGuidePositionFrame, current);
  assert.equal(h.time.timers.size, 0);
  for (let i = 1; i <= 5; i++) h.time.frame(1440 + i * 16);
  assert.equal(h.ctx.visualGuideStepReady, true);
  assert.equal(h.time.frames.size, 0);
});

test('a positioning pass superseded during layout cannot overwrite its replacement frame', () => {
  const h = positioningHarness(); h.search.classList.add('peek');
  const position = h.ctx.positionVisualGuideStep;
  let supersede = true, replacement;
  h.ctx.positionVisualGuideStep = () => {
    if (supersede) {
      supersede = false; h.ctx.scheduleVisualGuidePositioning();
      replacement = h.ctx.visualGuidePositionFrame;
    }
    return position();
  };
  h.ctx.scheduleVisualGuidePositioning(); h.time.frame(16);
  assert.equal(h.ctx.visualGuidePositionFrame, replacement);
  assert.equal(h.time.frames.size, 1, 'layout-triggered positioning must not fork another tracking loop');
  for (let i = 1; i <= 5; i++) h.time.frame(16 + i * 16);
  assert.equal(h.ctx.visualGuideStepReady, true);
  assert.equal(h.time.frames.size, 0);
});

function lifecycleHarness() {
  const time = clock(), body = element('body'), card = element('visual-guide-card');
  const nodes = { 'visual-guide': element('visual-guide'), 'visual-guide-card': card };
  for (const id of ['index', 'kicker', 'title', 'body', 'hint', 'progress', 'next', 'prev']) nodes['visual-guide-' + id] = element('visual-guide-' + id);
  let seen = false, renders = 0;
  const listeners = {};
  const ctx = vm.createContext({ ...time,
    startupVisualGuideScheduled: false, startupVisualGuideTimer: 0, visualGuideStartTimer: 0, visualGuideStartToken: 0,
    visualGuideActive: false, visualGuideState: {}, visualGuideStep: 0, visualGuideResizeBound: false,
    visualGuidePositionFrame: 0, visualGuidePositionRetryTimer: 0, visualGuidePositionToken: 0, visualGuideStepRevision: 0, visualGuideContentRevision: -1, visualGuideStepReady: false,
    immersiveMode: false, playing: false, originalProfileImportPending: false, diyPlayerMode: false, $input: {},
    visualGuideSteps: [{ key: 'welcome', title: 'Welcome', body: 'Intro', center: true }, { key: 'search', title: 'Search', body: 'Find music' }],
    visualGuideWasSeen: () => seen, markVisualGuideSeen() { seen = true; }, closeMiniQueue() {}, closeUploadTip() {},
    prepareVisualGuideStep() {}, visualGuideStepContent: step => step, renderVisualGuideDemo() { renders++; },
    scheduleVisualGuidePositioning() {}, setVisualGuideShelfDemo() {}, setVisualGuideLogin() {}, setPeek() {},
    document: { body, activeElement: null, getElementById: id => nodes[id] || null, querySelectorAll: () => [], addEventListener(type, fn) { listeners[type] = fn; } },
    window: { addEventListener() {} }
  });
  loadFunctions(ctx, guideFile, ['activeVisualGuideSteps', 'cancelScheduledVisualGuideStart', 'canRunStartupVisualGuide',
    'maybeRunStartupVisualGuide', 'startVisualGuide', 'renderVisualGuideStepMarks', 'showVisualGuideStep', 'cancelVisualGuidePositioning', 'closeVisualGuide']);
  ctx.handleVisualGuideKey = () => {};
  ctx.positionVisualGuideStep = () => {};
  return { ctx, time, body, card, nodes, listeners, renders: () => renders, resetSeen: () => { seen = false; }, seen: () => seen };
}

test('starting the guide binds visibility suspension and closing cancels pending positioning work', () => {
  const h = lifecycleHarness(); h.ctx.startVisualGuide({ manual: true });
  assert.equal(h.listeners.visibilitychange, h.ctx.scheduleVisualGuidePositioning);
  h.ctx.visualGuidePositionFrame = h.time.requestAnimationFrame(() => assert.fail('closed guide ran a positioning frame'));
  h.ctx.visualGuidePositionRetryTimer = h.time.setTimeout(() => assert.fail('closed guide ran a recovery timer'), 500);
  h.ctx.closeVisualGuide(false); h.time.frame(16); h.time.tick(1000);
  assert.equal(h.ctx.visualGuidePositionFrame, 0);
  assert.equal(h.ctx.visualGuidePositionRetryTimer, 0);
  assert.equal(h.time.frames.size, 0);
  assert.equal(h.time.timers.size, 0);
});

test('an already-dispatched recovery timer cannot restart a closed guide or disturb its replay', () => {
  const h = lifecycleHarness(); h.ctx.startVisualGuide({ manual: true });
  loadFunctions(h.ctx, guideFile, ['scheduleVisualGuidePositioning']);
  h.ctx.visualGuideLayoutIsSettled = () => false;
  h.ctx.scheduleVisualGuidePositioning();
  for (let i = 1; i <= 90; i++) h.time.frame(i * 16);
  const stale = [...h.time.timers.values()][0].fn;
  h.ctx.closeVisualGuide(false); stale();
  assert.equal(h.time.frames.size, 0);
  assert.equal(h.time.timers.size, 0);
  h.ctx.startVisualGuide({ manual: true });
  const current = h.ctx.visualGuidePositionFrame;
  stale();
  assert.equal(h.ctx.visualGuidePositionFrame, current);
  assert.equal(h.time.frames.size, 1);
  h.ctx.closeVisualGuide(false);
});

test('close cancels repeated splash-deferred starts, including already-dispatched callbacks', () => {
  const h = lifecycleHarness(); h.body.classList.add('splash-active');
  h.ctx.startVisualGuide({ manual: true });
  const first = [...h.time.timers.values()][0].fn;
  h.ctx.startVisualGuide({ manual: true });
  const second = [...h.time.timers.values()][0].fn;
  assert.equal(h.time.timers.size, 1, 'repeat requests share one pending start');
  h.ctx.closeVisualGuide(false); h.body.classList.remove('splash-active');
  first(); second(); h.time.tick(5000);
  assert.equal(h.ctx.visualGuideActive, false);
  assert.equal(h.ctx.startupVisualGuideScheduled, false);
  assert.equal(h.seen(), false, 'a cancelled unseen guide must remain unseen');
  h.ctx.startVisualGuide({ manual: true });
  assert.equal(h.ctx.visualGuideActive, true, 'an explicit replay still works after cancellation');
});

test('automatic startup rechecks eligibility after splash deferral and can be scheduled again', () => {
  const h = lifecycleHarness(); h.body.classList.add('splash-active');
  assert.equal(h.ctx.maybeRunStartupVisualGuide('startup'), true);
  assert.equal(h.ctx.maybeRunStartupVisualGuide('startup'), false);
  h.time.tick(1400);
  assert.equal(h.ctx.visualGuideActive, false);
  assert.equal(h.time.timers.size, 1);
  h.ctx.playing = true; h.body.classList.remove('splash-active'); h.time.tick(2100);
  assert.equal(h.ctx.visualGuideActive, false, 'automatic guide must not interrupt newly-started playback');
  assert.equal(h.seen(), false);
  h.ctx.playing = false;
  assert.equal(h.ctx.maybeRunStartupVisualGuide('startup'), true);
  h.time.tick(3500);
  assert.equal(h.ctx.visualGuideActive, true);
  assert.equal(h.seen(), true);
});

test('manual replay and close invalidate the already-dispatched startup callback', () => {
  const h = lifecycleHarness();
  h.ctx.maybeRunStartupVisualGuide('startup');
  const automatic = [...h.time.timers.values()][0].fn;
  h.ctx.startVisualGuide({ manual: true }); h.ctx.closeVisualGuide(false); h.resetSeen();
  automatic(); h.time.tick(5000);
  assert.equal(h.ctx.visualGuideActive, false);
  assert.equal(h.time.timers.size, 0);
});

test('old content swaps cannot apply on the same step after back/forward or close/reopen', () => {
  const h = lifecycleHarness(); h.ctx.startVisualGuide({ manual: true });
  h.ctx.showVisualGuideStep(1);
  const firstSearch = [...h.time.timers.values()][0].fn;
  h.ctx.showVisualGuideStep(0); h.ctx.showVisualGuideStep(1);
  const count = h.renders(); firstSearch();
  assert.equal(h.renders(), count, 'step identity alone must not validate an older A-B-A swap');
  assert(h.card.classList.contains('is-swapping'));
  h.ctx.closeVisualGuide(false); h.ctx.startVisualGuide({ manual: true }); h.ctx.showVisualGuideStep(1);
  const latest = [...h.time.timers.values()][0].fn;
  const restartedCount = h.renders(); firstSearch();
  assert.equal(h.renders(), restartedCount, 'a callback from a closed guide must not affect the replay');
  latest();
  assert.equal(h.nodes['visual-guide-title'].textContent, 'Search');
  assert.equal(h.ctx.visualGuideContentRevision, h.ctx.visualGuideStepRevision);
  assert.equal(h.card.classList.contains('is-swapping'), false);
});

test('an old positioning frame cannot overwrite the current replay frame', () => {
  const h = positioningHarness(); h.search.classList.add('peek');
  h.ctx.scheduleVisualGuidePositioning();
  const old = [...h.time.frames.values()][0];
  h.time.cancelAnimationFrame(h.ctx.visualGuidePositionFrame);
  h.ctx.visualGuidePositionFrame = 0; h.ctx.visualGuidePositionToken++;
  h.ctx.scheduleVisualGuidePositioning();
  const current = h.ctx.visualGuidePositionFrame;
  old();
  assert.equal(h.ctx.visualGuidePositionFrame, current);
  for (let i = 0; i < 5; i++) h.time.frame(i * 16);
  assert.equal(h.ctx.visualGuideStepReady, true);
});
