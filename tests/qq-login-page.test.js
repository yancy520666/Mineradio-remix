'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { qqLoginPageScript, prepareQQLoginPage } = require('../desktop/qq-login-page');

test('QQ opener clicks the exact login anchor, never a parent containing login text', () => {
  let clicks = 0;
  const button = { textContent: '登录', getBoundingClientRect: () => ({ width: 40, height: 20 }), click: () => clicks++ };
  const doc = { querySelector: () => null, querySelectorAll: selector => { assert.ok(!selector.includes('div')); return [button]; } };
  assert.equal(vm.runInNewContext(qqLoginPageScript(), { document: doc, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) }), false);
  assert.equal(clicks, 1);
  doc.querySelector = () => button; // existing visible login frame
  assert.equal(vm.runInNewContext(qqLoginPageScript(), { document: doc, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) }), true);
  assert.equal(clicks, 1, 'do not toggle an open dialog closed');
});

test('QQ login begins at DOM readiness without waiting for load completion, and cleans up on close', async () => {
  const win = new EventEmitter(), wc = new EventEmitter();
  let executions = 0;
  Object.assign(wc, { isDestroyed: () => false, getURL: () => 'https://y.qq.com/n/ryqq/profile', mainFrame: { executeJavaScript: async () => { executions++; return true; } } });
  win.webContents = wc;
  const stop = prepareQQLoginPage(win);
  try {
    wc.emit('dom-ready');
    await new Promise(setImmediate);
    assert.equal(executions, 1);
    wc.emit('did-finish-load');
    assert.equal(executions, 1);
    win.emit('closed');
    assert.equal(wc.listenerCount('dom-ready'), 0);
    assert.equal(wc.listenerCount('did-finish-load'), 0);
  } finally { stop(); }
});
