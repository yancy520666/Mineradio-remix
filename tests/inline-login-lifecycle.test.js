'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createInlineQrSession } = require('../desktop/login-inline-qr');
const { loadFunctions } = require('./helpers/classic-functions');
const flows = 'public/js/modules/08-account/03-login-modal-flows.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function qrWindow(executeJavaScript) {
  const frame = { executeJavaScript };
  frame.framesInSubtree = [frame];
  const wc = new EventEmitter();
  Object.assign(wc, { mainFrame: frame, setFrameRate() {}, isDestroyed: () => false });
  return { webContents: wc, getContentBounds: () => ({ width: 900, height: 700 }) };
}

test('unusable paint and a hung frame both reach the independent QR deadline once', async () => {
  for (const execute of [
    async () => ({ found: true, qr: { x: 20, y: 20, width: 120, height: 120, score: 8 } }),
    () => new Promise(() => {}),
  ]) {
    const win = qrWindow(execute);
    const failures = [];
    const session = createInlineQrSession(win, { intervalMs: 2, timeoutMs: 15, onFail: x => failures.push(x) });
    try {
      await wait(40);
      assert.deepEqual(failures, ['QR_NOT_FOUND']);
      assert.equal(win.webContents.listenerCount('paint'), 0);
    } finally { session.stop(); }
  }
});

test('a usable QR satisfies the deadline and stopping removes its paint listener', async () => {
  const win = qrWindow(async () => ({ found: true, qr: { x: 20, y: 20, width: 120, height: 120, score: 8 } }));
  const images = [], failures = [];
  const session = createInlineQrSession(win, { intervalMs: 2, timeoutMs: 15, notify: x => images.push(x), onFail: x => failures.push(x) });
  win.webContents.emit('paint', null, null, { isEmpty: () => false, getSize: () => ({ width: 900, height: 700 }), crop: () => ({ isEmpty: () => false, toPNG: () => Buffer.from('fixture') }) });
  try {
    await wait(40);
    assert.equal(images[0].stage, 'qr');
    assert.deepEqual(failures, []);
  } finally { session.stop(); }
  assert.equal(win.webContents.listenerCount('paint'), 0);
});

function loginContext() {
  const state = { active: false, loading: false, images: [] };
  const c = vm.createContext({
    window: { desktopWindow: { cancelInlineLogin() {} } }, document: { getElementById: () => null },
    inlineLoginQrRequest: null, inlineLoginQrRequestSeq: 0, inlineLoginQrProvider: '', loginProvider: 'qq',
    inlineLoginQrSupported: () => true, bindInlineLoginQr() {}, clearLoginQrImage() {},
    setInlineLoginQrView: x => { state.active = x; }, setLoginQrLoading: x => { state.loading = x; },
    showLoginQrImage: (_img, x) => state.images.push(x), loginWorkflowProviderLabel: x => x,
    updateLoginProviderUi() {},
  });
  loadFunctions(c, flows, ['resetInlineLoginQrView', 'cancelInlineLoginQr', 'openInlineLoginInWindow', 'handleInlineLoginQr', 'inlineLoginQrAppLabel', 'openProviderLoginWithInlineQr']);
  return { c, state };
}

test('late cancellation cannot reset a newer platform or replay its QR events', async () => {
  const { c, state } = loginContext();
  let finishOld, finishNew;
  const old = c.openProviderLoginWithInlineQr('qq', () => new Promise(r => { finishOld = r; }));
  const oldId = c.inlineLoginQrRequest.id;
  c.cancelInlineLoginQr();
  c.loginProvider = 'netease';
  const current = c.openProviderLoginWithInlineQr('netease', () => new Promise(r => { finishNew = r; }));
  finishOld({ inline: true, cancelled: true });
  assert.equal(await old, null);
  assert.equal(c.inlineLoginQrProvider, 'netease');
  assert.equal(state.active, true);
  assert.equal(state.loading, true);
  c.handleInlineLoginQr({ provider: 'netease', requestId: oldId, stage: 'qr', image: 'stale' });
  assert.deepEqual(state.images, []);
  c.handleInlineLoginQr({ provider: 'netease', requestId: c.inlineLoginQrRequest.id, stage: 'qr', image: 'current' });
  assert.deepEqual(state.images, ['current']);
  finishNew({ inline: true, cancelled: true });
  await current;
});

test('explicit window fallback remains owned by the request that asked for it', async () => {
  const { c } = loginContext();
  let finishInline;
  const calls = [];
  const pending = c.openProviderLoginWithInlineQr('qq', opts => {
    calls.push(opts);
    return opts.inline ? new Promise(r => { finishInline = r; }) : Promise.resolve({ ok: true });
  });
  c.openInlineLoginInWindow();
  finishInline({ inline: true, cancelled: true });
  assert.equal((await pending).ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].inline, undefined);
});

test('logout consumes undo state before awaiting the backend and commits only once', async () => {
  let finish, count = 0;
  const c = vm.createContext({
    loginWorkflowPendingLogout: { provider: 'qq', timer: 1 }, loginWorkflowCommittingLogout: {},
    clearTimeout() {}, markLoginNodeConnecting() {}, updateLoginProviderUi() {},
    loginWorkflowProviderLabel: x => x, showToast() {}, console,
    logoutProviderAccount: async () => { count++; await new Promise(r => { finish = r; }); },
  });
  loadFunctions(c, flows, ['finishLoginWorkflowLogout', 'undoLoginWorkflowLogout']);
  const pending = c.finishLoginWorkflowLogout();
  assert.equal(c.loginWorkflowPendingLogout, null);
  assert.equal(c.loginWorkflowCommittingLogout.qq, true);
  c.undoLoginWorkflowLogout();
  await c.finishLoginWorkflowLogout();
  assert.equal(count, 1);
  finish(); await pending;
  assert.equal(c.loginWorkflowCommittingLogout.qq, undefined);
});

test('closing the drawer revokes a pending request to open the official window', async () => {
  const { c } = loginContext();
  let finishInline, calls = 0;
  const pending = c.openProviderLoginWithInlineQr('qq', () => { calls++; return new Promise(r => { finishInline = r; }); });
  c.openInlineLoginInWindow();
  c.cancelInlineLoginQr(); // setLoginAuthDrawerOpen(false), while QQ storage flush is pending
  finishInline({ inline: true, cancelled: true });
  assert.equal(await pending, null);
  assert.equal(calls, 1);
});
