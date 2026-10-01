'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createOnboardingStore } = require('../desktop/onboarding-state');
const root = path.join(__dirname, '..');
function block(file, from, to) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from) + from.length));
}
test('first launch shows its window after navigation, without restoring a hidden runtime window', () => {
  let visible = false, shows = 0;
  const win = { isDestroyed: () => false, isMinimized: () => false, isVisible: () => visible, isFocused: () => false, show: () => { visible = true; shows++; } };
  const context = { startupCompleted: true, startupState: {}, clearTimeout, markMainWindowExpectedVisible() {}, ensureMainWindowInsideDisplay() {}, resetMainWindowZoom() {}, sendWindowState() {}, writeStartupState() {}, console: { log() {} } };
  vm.createContext(context);
  vm.runInContext(block('desktop/main.js', 'function showMainWindowSafely(', 'function refreshMainWindowAfterForeground('), context);
  assert.equal(context.showMainWindowSafely(win, 'navigation-complete'), true);
  assert.equal(shows, 1);
  visible = false;
  assert.equal(context.showMainWindowSafely(win, 'did-finish-load'), false);
  assert.equal(shows, 1);
});
test('shown guide survives immediate exit, cache changes and a missing browser marker', t => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-guide-'));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  const store = createOnboardingStore(profile);
  const createContext = () => {
    const saved = new Map();
    const context = { window: { desktopWindow: { readOnboardingStateSync: () => ({ ok: true, payload: store.read() }), markOnboardingSeenSync: kind => store.markSeen(kind) } }, VISUAL_GUIDE_SEEN_STORE_KEY: 'visual-seen', localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v) } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'public/js/modules/00-state/02a-onboarding-state.js'), 'utf8'), context);
    return context;
  };
  const first = createContext();
  assert.equal(first.startupGuideWasSeen('visual'), false);
  first.markStartupGuideSeen('visual');
  first.markStartupGuideSeen('login');
  const restarted = createContext();
  assert.equal(restarted.startupGuideWasSeen('visual'), true);
  assert.equal(restarted.startupGuideWasSeen('login'), true);
  assert.equal(store.markSeen('../other').ok, false);
});
test('intro begins at native visibility and allows entry after the complete logo timeline', async () => {
  let listener, clock = 25, delay;
  const classes = new Set(['splash-intro-pending']);
  const context = { splashStartedAt: null, splashTimer: null, reduceSplashMotion: false, markSplashReadyToEnter() {}, waitForSplashLogo() {}, playMineradioIntroSound() {}, performance: { now: () => clock }, setTimeout: (_fn, ms) => { delay = ms; }, document: { body: { classList: { contains: () => true } }, documentElement: { classList: { remove: k => classes.delete(k) } } }, window: { desktopWindow: { onStateChange: callback => { listener = callback; return () => { listener = null; }; }, getState: async () => ({ visible: false, minimized: false }) } } };
  vm.createContext(context);
  vm.runInContext(block('public/js/modules/10-shell/03-splash.js', 'function startSplashWhenVisible()', "document.addEventListener('DOMContentLoaded'"), context);
  context.startSplashWhenVisible();
  await Promise.resolve();
  assert.equal(context.splashStartedAt, null);
  assert(classes.has('splash-intro-pending'));
  clock = 6025;
  listener({ visible: true, minimized: false });
  assert.equal(context.splashStartedAt, 6025);
  assert.equal(delay, 5200);
  assert.equal(classes.has('splash-intro-pending'), false);
});

test('a delayed compositor cannot enable entry while the logo is still animating', () => {
  let ready = false, retry;
  const animation = { playState: 'running' };
  const context = { splashTimer: null, markSplashReadyToEnter: () => { ready = true; }, setTimeout: fn => { retry = fn; }, document: { getElementById: () => ({ classList: { contains: () => false }, querySelector: () => ({ getAnimations: () => [animation] }) }) } };
  vm.createContext(context);
  vm.runInContext(block('public/js/modules/10-shell/03-splash.js', 'function waitForSplashLogo()', 'function startSplashWhenVisible()'), context);
  context.waitForSplashLogo();
  assert.equal(ready, false);
  animation.playState = 'finished';
  retry();
  assert.equal(ready, true);
});
