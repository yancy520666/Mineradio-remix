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
    handleConfiguredLocalHotkey: () => false,
    shouldSuppressDefaultConfiguredHotkey: () => false,
    togglePlay: () => calls.push('togglePlay'),
    nextTrack: () => calls.push('nextTrack'), prevTrack: () => calls.push('prevTrack'),
    adjustVolumeByKeyboard: () => calls.push('volume'), goHome: () => calls.push('home'),
    toggleFreeCamera: () => calls.push('camera'), resetFreeCameraToDefault: () => calls.push('resetCamera'),
    recenterCamera() {}, showToast() {},
    closeLoginModal: () => calls.push('closeLogin'), closeUserModal: () => calls.push('closeUser'),
    toggleFxPanel() {}, togglePlaylistPanel() {},
  });
  loadFunctions(context, 'public/js/modules/05-playback/01-cover-custom-map.js', ['isTypingTarget']);
  if (fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/01-cover-custom-map.js'), 'utf8').includes('function isKeyboardUiTarget(')) {
    loadFunctions(context, 'public/js/modules/05-playback/01-cover-custom-map.js', ['isKeyboardUiTarget']);
  }
  for (const file of ['04-shelf/06-keyboard-camera-events.js', '10-shell/01-viewport-resize-shortcuts.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules', file), 'utf8'), context, { filename: file });
  }
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
