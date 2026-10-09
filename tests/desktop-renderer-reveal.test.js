'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

function setup(execute) {
  const pending = new Set();
  const context = vm.createContext({
    JSON, Promise, Error,
    setTimeout(fn) { pending.add(fn); return fn; },
    clearTimeout(fn) { pending.delete(fn); },
  });
  loadFunctions(context, 'desktop/main.js', ['prepareFullDesktopRendererReveal']);
  const win = { isDestroyed: () => false, webContents: { isDestroyed: () => false, mainFrame: { executeJavaScript: execute } } };
  return { context, win, pending };
}

test('renderer reveal waits for desktop styling and a layout flush before readiness', async () => {
  const events = [];
  let styled = false;
  const renderer = vm.createContext({
    applyDesktopWallpaperRuntimeStatus(status) { events.push('status'); styled = status.enabled === true && status.interactive === true; },
    document: { body: {
      getBoundingClientRect() { assert.equal(styled, true); events.push('layout'); },
      classList: { contains: () => styled },
    } },
  });
  const { context, win, pending } = setup(script => Promise.resolve(vm.runInContext(script, renderer)));
  await context.prepareFullDesktopRendererReveal(win, { enabled: true, interactive: true });
  assert.deepEqual(events, ['status', 'layout']);
  assert.equal(pending.size, 0);
});

test('renderer reveal rejects missing styles and clears its timeout', async () => {
  const { context, win, pending } = setup(() => Promise.resolve(false));
  await assert.rejects(context.prepareFullDesktopRendererReveal(win, {}), /FULL_DESKTOP_RENDERER_PREPARE_FAILED/);
  assert.equal(pending.size, 0);
});

test('a stalled renderer cannot leave the transition waiting indefinitely', async () => {
  const { context, win, pending } = setup(() => new Promise(() => {}));
  const preparing = context.prepareFullDesktopRendererReveal(win, {});
  for (const expire of pending) expire();
  await assert.rejects(preparing, /FULL_DESKTOP_RENDERER_PREPARE_TIMEOUT/);
  assert.equal(pending.size, 0);
});
