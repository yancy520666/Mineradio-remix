'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

function harness() {
  const pointerHandlers = [];
  let blurHandler;
  const document = {
    activeElement: null,
    querySelectorAll: () => ['minimize', 'maximize', 'close'].map(() => ({
      addEventListener(type, listener) { assert.equal(type, 'pointerdown'); pointerHandlers.push(listener); },
    })),
  };
  const context = vm.createContext({ document, window: {
    addEventListener(type, listener) { assert.equal(type, 'blur'); blurHandler = listener; },
  } });
  loadFunctions(context, 'public/js/modules/10-shell/04-desktop-overlay-fullscreen.js', ['bindDesktopWindowControlFocus']);
  context.bindDesktopWindowControlFocus();
  return { document, pointerHandlers, blur: () => blurHandler() };
}

test('mouse activation of every title-bar control prevents sticky focus', () => {
  const h = harness();
  assert.equal(h.pointerHandlers.length, 3);
  for (const handler of h.pointerHandlers) {
    let prevented = false;
    handler({ button: 0, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
});

test('switching away releases title-bar focus but preserves inputs and other controls', () => {
  const h = harness();
  for (const titleBar of [true, false]) {
    let blurred = false;
    h.document.activeElement = {
      closest(selector) { assert.equal(selector, '[data-window-action]'); return titleBar ? this : null; },
      blur() { blurred = true; },
    };
    // A deliberately keyboard-focused control keeps focus until the window loses focus.
    assert.equal(blurred, false);
    h.blur();
    assert.equal(blurred, titleBar);
  }
  h.document.activeElement = null;
  assert.doesNotThrow(h.blur);
});
