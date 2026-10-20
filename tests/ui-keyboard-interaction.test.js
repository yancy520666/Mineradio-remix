'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

function harness(options = {}) {
  const handlers = [], calls = [];
  const context = vm.createContext({
    console, setTimeout, clearTimeout,
    document: {
      addEventListener(type, listener, capture) { if (type === 'keydown') handlers.push({ listener, capture: capture === true }); },
      getElementById: () => null,
      body: { classList: { contains: () => false } },
      fullscreenElement: null,
    },
    window: { addEventListener() {} },
    freeCamera: { active: !!options.freeCamera, locked: false, keys: {} },
    desktopRuntimeState: { fullscreen: false }, desktopFullscreenActive: false,
    immersiveMode: false, diyPlayerMode: true, miniQueueOpen: false,
    shelfManager: { next: () => calls.push('shelfNext'), prev: () => calls.push('shelfPrev'), hasOpenContent: () => false },
    markRenderInteraction() {},
    localStorage: { getItem: () => options.saved || null, setItem() {} },
    HOTKEY_SETTINGS_STORE_KEY: 'test-shortcuts', hotkeyCaptureState: null, hotkeyGlobalStatus: {},
    getDesktopWindowApi: () => null,
    togglePlay: () => calls.push('togglePlay'),
    nextTrack: () => calls.push('nextTrack'), prevTrack: () => calls.push('prevTrack'),
    adjustVolumeByKeyboard: () => calls.push('volume'), goHome: () => calls.push('home'),
    toggleFreeCamera: () => calls.push('camera'), resetFreeCameraToDefault: () => calls.push('resetCamera'),
    recenterCamera() {}, showToast() {},
    closeLoginModal: () => calls.push('closeLogin'), closeUserModal: () => calls.push('closeUser'),
    toggleFxPanel() {}, togglePlaylistPanel() {},
  });
  const stores = fs.readFileSync(path.join(__dirname, '../public/js/modules/00-state/00-core-stores.js'), 'utf8');
  vm.runInContext(stores.match(/var HOTKEY_ACTIONS = \[[\s\S]*?\n\];/)[0], context);
  loadFunctions(context, 'public/js/modules/05-playback/01-cover-custom-map.js', ['isTypingTarget']);
  if (fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/01-cover-custom-map.js'), 'utf8').includes('function isKeyboardUiTarget(')) {
    loadFunctions(context, 'public/js/modules/05-playback/01-cover-custom-map.js', ['isKeyboardUiTarget']);
  }
  for (const file of ['04-shelf/06-keyboard-camera-events.js', '10-shell/01-viewport-resize-shortcuts.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules', file), 'utf8'), context, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/07-fx/06-hotkeys.js'), 'utf8'), context);
  vm.runInContext('var hotkeySettings = readHotkeySettings()', context);
  function dispatch(target, code, options = {}) {
    const e = { target, code, key: code, repeat: false, defaultPrevented: !!options.defaultPrevented,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediateStopped = true; this.propagationStopped = true; },
      ...options,
    };
    for (const h of handlers.filter(h => h.capture)) { h.listener(e); if (e.immediateStopped) return e; }
    if (!e.propagationStopped) for (const h of handlers.filter(h => !h.capture)) { h.listener(e); if (e.immediateStopped) break; }
    return e;
  }
  return { context, calls, dispatch };
}
function target(tagName, interactive = false) {
  return { tagName, closest(selector) { return interactive && selector.includes('button') ? this : null; } };
}

test('Space on a native button remains available for that button', () => {
  const h = harness(); const e = h.dispatch(target('BUTTON', true), 'Space');
  assert.deepEqual(h.calls, []); assert.equal(e.defaultPrevented, false);
});
test('a control-owned arrow event cannot also switch the track', () => {
  const h = harness(); h.dispatch(target('BUTTON', true), 'ArrowRight', { defaultPrevented: true });
  assert.deepEqual(h.calls, []);
});
test('an accessible role-button target does not start playback on Space', () => {
  const h = harness(); h.dispatch(target('DIV', true), 'Space'); assert.deepEqual(h.calls, []);
});
test('a page-owned shortcut still works with body focus', () => {
  const h = harness(); h.dispatch(target('BODY'), 'Space'); h.dispatch(target('BODY'), 'ArrowRight');
  assert.deepEqual(h.calls, ['togglePlay', 'nextTrack']);
});
test('free-camera capture does not intercept Space or R on controls', () => {
  const h = harness({ freeCamera: true });
  h.dispatch(target('BUTTON', true), 'Space'); h.dispatch(target('BUTTON', true), 'KeyR');
  assert.deepEqual(h.calls, []); assert.deepEqual(JSON.parse(JSON.stringify(h.context.freeCamera.keys)), {});
});
test('shelf paging does not steal PageDown from a focused control', () => {
  const h = harness(); h.dispatch(target('BUTTON', true), 'PageDown'); assert.deepEqual(h.calls, []);
});

test('existing custom and explicitly disabled bindings survive new action defaults', () => {
  const h = harness({ saved: JSON.stringify({ local: { togglePlay: '', nextTrack: 'KeyN' } }) });
  assert.equal(h.context.hotkeySettings.local.togglePlay, '');
  assert.equal(h.context.hotkeySettings.local.nextTrack, 'KeyN');
  assert.equal(h.context.hotkeySettings.local.focusSearch, 'Tab');
  h.dispatch(target('BODY'), 'Space'); h.dispatch(target('BODY'), 'ArrowRight'); h.dispatch(target('BODY'), 'KeyN');
  assert.deepEqual(h.calls, ['nextTrack']);
});

test('disabled camera and navigation bindings do not fall through to old hardcoded handlers', () => {
  const h = harness();
  for (const key of Object.keys(h.context.hotkeySettings.local)) h.context.hotkeySettings.local[key] = '';
  for (const code of ['KeyR', 'KeyK', 'Home', 'ArrowUp', 'Space', 'PageDown', 'BracketRight', 'Tab']) h.dispatch(target('BODY'), code);
  assert.deepEqual(h.calls, []);
});

test('shelf aliases follow the default binding and are disabled or replaced together', () => {
  const h = harness();
  h.dispatch(target('BODY'), 'PageDown');
  h.context.hotkeySettings.local.nextShelf = 'KeyN';
  h.dispatch(target('BODY'), 'PageDown'); h.dispatch(target('BODY'), 'BracketRight'); h.dispatch(target('BODY'), 'KeyN');
  h.context.hotkeySettings.local.nextShelf = '';
  h.dispatch(target('BODY'), 'KeyN');
  assert.deepEqual(h.calls, ['shelfNext', 'shelfNext']);
});

test('recording R, K and Tab does not run their actions; Delete disables the captured action', () => {
  const h = harness();
  h.context.renderHotkeySettings = () => {};
  h.context.syncSearchShortcutTabOrder = () => {};
  h.context.updateCameraHotkeyHint = () => {};
  for (const code of ['KeyR', 'KeyK', 'Tab', 'Delete']) {
    h.context.hotkeyCaptureState = { action: 'togglePlay', scope: 'local' };
    h.dispatch(target('BODY'), code);
    assert.equal(h.context.hotkeySettings.local.togglePlay, code === 'Delete' ? '' : code);
  }
  assert.deepEqual(h.calls, []);
});

test('duplicate bindings including shelf aliases pause both actions; repeats and IME are owned', () => {
  const h = harness(); h.context.hotkeySettings.local.nextTrack = 'PageDown';
  h.dispatch(target('BODY'), 'PageDown');
  h.dispatch(target('BODY'), 'Space', { repeat: true }); h.dispatch(target('BODY'), 'Space', { isComposing: true });
  assert.deepEqual(h.calls, []);
});

test('free camera retains movement while its configurable exit still works', () => {
  const h = harness({ freeCamera: true });
  h.context.hotkeySettings.local.toggleFreeCamera = 'KeyT';
  h.dispatch(target('BODY'), 'Space'); h.dispatch(target('BODY'), 'KeyR'); h.dispatch(target('BODY'), 'KeyT');
  assert.equal(h.context.freeCamera.keys.Space, true); assert.deepEqual(h.calls, ['camera']);
});

test('global registration filters local actions and ignores stale status responses', async () => {
  const h = harness(), requests = [];
  h.context.renderHotkeySettings = () => {};
  h.context.getDesktopWindowApi = () => ({ configureGlobalHotkeys(bindings) {
    return new Promise(resolve => requests.push({ bindings, resolve }));
  } });
  h.context.hotkeySettings.global.focusSearch = 'Ctrl+Tab';
  h.context.hotkeySettings.global.togglePlay = '';
  const first = h.context.registerGlobalHotkeys();
  assert.equal(requests[0].bindings.some(b => b.action === 'focusSearch' || b.action === 'togglePlay'), false);
  const second = h.context.registerGlobalHotkeys();
  requests[1].resolve({ results: [{ action: 'nextTrack', ok: true }] }); await second;
  requests[0].resolve({ results: [{ action: 'nextTrack', ok: false }] }); await first;
  assert.equal(h.context.hotkeyGlobalStatus.nextTrack.ok, true);
});

test('invalid stored values retain defaults while a valid blank still disables an action', () => {
  const h = harness({ saved: JSON.stringify({ local: { focusSearch: 5, togglePlay: '', nextTrack: {} } }) });
  assert.equal(h.context.hotkeySettings.local.focusSearch, 'Tab');
  assert.equal(h.context.hotkeySettings.local.nextTrack, 'ArrowRight');
  assert.equal(h.context.hotkeySettings.local.togglePlay, '');
});

test('registration failure gives an actionable status instead of detecting forever', async () => {
  const h = harness(); h.context.renderHotkeySettings = () => {};
  h.context.getDesktopWindowApi = () => ({ configureGlobalHotkeys: () => Promise.reject(new Error('IPC failed')) });
  await h.context.registerGlobalHotkeys();
  assert.equal(h.context.hotkeyGlobalStatus.togglePlay.ok, false);
  assert.match(h.context.hotkeyGlobalStatus.togglePlay.conflict.sourceName, /检测失败/);
});

test('recording temporarily unregisters system shortcuts and completion restores them', async () => {
  const h = harness(), registrations = [];
  h.context.renderHotkeySettings = () => {};
  h.context.getDesktopWindowApi = () => ({ configureGlobalHotkeys: bindings => {
    registrations.push(bindings); return Promise.resolve({ results: [] });
  } });
  h.context.hotkeyCaptureState = { action: 'togglePlay', scope: 'global' };
  await h.context.registerGlobalHotkeys();
  assert.equal(registrations[0].length, 0);
  h.context.hotkeyCaptureState = null;
  await h.context.registerGlobalHotkeys();
  assert.equal(registrations[1].length, 8);
});

test('clearing the Tab action also stops native focus traversal on the page and controls', () => {
  const h = harness(); h.context.hotkeySettings.local.focusSearch = '';
  for (const element of [target('BODY'), target('BUTTON', true), target('INPUT')]) {
    for (const shiftKey of [false, true]) {
      const e = h.dispatch(element, 'Tab', { shiftKey });
      assert.equal(e.defaultPrevented, true); assert.equal(e.immediateStopped, true);
    }
  }
  assert.equal(h.dispatch(target('INPUT'), 'Tab', { ctrlKey: true }).defaultPrevented, false);
  h.context.hotkeyCaptureState = { action: 'focusSearch', scope: 'local' };
  assert.equal(h.context.preventDisabledTabFocus({ code: 'Tab' }), false, 'recording Tab remains possible');
});

test('Tab can still be reassigned to another action without restoring native focus traversal', () => {
  const h = harness(); h.context.hotkeySettings.local.focusSearch = '';
  h.context.hotkeySettings.local.togglePlay = 'Tab';
  const e = h.dispatch(target('BODY'), 'Tab');
  assert.equal(e.defaultPrevented, true); assert.deepEqual(h.calls, ['togglePlay']);
});
