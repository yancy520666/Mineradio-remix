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
test('intro uses upstream DOM-ready sound and entry timing without a native window wait', () => {
  let delay,callback,sounds=0,reduced=false;
  const context=vm.createContext({splashStartedAt:25,splashTimer:null,reduceSplashMotion:false,
    markSplashReadyToEnter(){},playMineradioIntroSound(){sounds++;},setTimeout(fn,ms){callback=fn;delay=ms;},
    document:{getElementById:()=>({classList:{add:()=>{reduced=true;}}})}});
  vm.runInContext(block('public/js/modules/10-shell/03-splash.js','function startSplashIntro()',"document.addEventListener('DOMContentLoaded'"),context);
  context.startSplashIntro();assert.equal(delay,1500);assert.equal(sounds,1);
  assert.equal(callback,context.markSplashReadyToEnter);assert.equal(context.splashStartedAt,25);
  context.reduceSplashMotion=true;context.startSplashIntro();assert.equal(delay,650);assert(reduced);assert.equal(sounds,1);
});

test('background timeline retains upstream real-time speed', () => {
  const context = vm.createContext({});
  vm.runInContext(block('public/js/modules/10-shell/03-splash.js', 'function splashTimelineElapsed(', 'function stopSplashIntroSound('), context);
  for (const elapsed of [0, 0.72, 1.5, 3.62, 5.2, 10]) assert.equal(context.splashTimelineElapsed(elapsed), elapsed);
});
test('native visibility controls throttling without needing focus or redundant native calls', () => {
  let visible = true, minimized = false; const values = [];
  const win = { isDestroyed: () => false, isVisible: () => visible, isMinimized: () => minimized,
    webContents: { isDestroyed: () => false, setBackgroundThrottling: value => values.push(value) } };
  const c = vm.createContext({});
  vm.runInContext(block('desktop/main.js', 'function setMainWindowBackgroundThrottling(', 'function finishWallpaperEngineVisibleHostResume('), c);
  c.setMainWindowBackgroundThrottling(win, true); c.setMainWindowBackgroundThrottling(win, true);
  assert.deepEqual(values, [false]);
  minimized = true; c.setMainWindowBackgroundThrottling(win, true); assert.equal(values.at(-1), true);
  visible = false; c.setMainWindowBackgroundThrottling(win, false); assert.equal(values.at(-1), false);
});
