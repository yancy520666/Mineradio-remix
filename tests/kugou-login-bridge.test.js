'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { extractKugouAuth } = require('../kugou-api');
const { validateKugouVerificationUrl, detectKugouVerificationPage, kugouLoginEntryScript } = require('../desktop/kugou-verification');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
const revealSource = main.slice(
  main.indexOf('function revealLoginWindowWhenReady('),
  main.indexOf('// music.163.com/#/login renders the QR itself'),
);
const inlineSource = main.slice(
  main.indexOf('const inlineLoginSessions = new Map();'),
  main.indexOf('async function openNeteaseMusicLoginWindow('),
);
const openSource = main.slice(
  main.indexOf('async function openKugouMusicLoginWindow('),
  main.indexOf('async function clearKugouMusicLoginSession('),
);

function loginHarness(initialCookie) {
  const state = { cookie: initialCookie, clearCount: 0, windows: [], intervals: new Set(), inlineSessions: [] };
  const cookieSession = {
    async clearStorageData(options) {
      assert.ok(options.storages.includes('cookies'));
      state.clearCount += 1;
      state.cookie = '';
    },
  };
  class LoginWindow extends EventEmitter {
    constructor(options) {
      super();
      assert.equal(options.webPreferences.partition, 'synthetic-kugou-partition');
      this.options = options;
      this.shown = options.show;
      this.executions = [];
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = callback => { this.popupHandler = callback; };
      this.webContents.getURL = () => this.url;
      this.webContents.executeJavaScript = async script => { this.executions.push(script); return false; };
      this.destroyed = false;
      state.windows.push(this);
    }
    async loadURL(url) { this.url = url; }
    isDestroyed() { return this.destroyed; }
    show() { this.shown = true; }
    focus() {}
    close() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const context = vm.createContext({
    session: { fromPartition: (partition) => {
      assert.equal(partition, 'synthetic-kugou-partition');
      return cookieSession;
    } },
    readKugouLoginCookieHeader: async () => state.cookie,
    kugouCookieHasPlayback: (cookie) => extractKugouAuth(cookie).playbackReady,
    kugouCookieHasLogin: (cookie) => extractKugouAuth(cookie).loggedIn,
    BrowserWindow: LoginWindow,
    validateKugouVerificationUrl, detectKugouVerificationPage, kugouLoginEntryScript,
    KUGOU_LOGIN_PARTITION: 'synthetic-kugou-partition',
    KUGOU_LOGIN_URL: 'https://www.kugou.com/',
    KUGOU_LOGIN_WARMUP_URL: 'https://www.kugou.com/newuc/user/uc/type=edit',
    APP_ICON_ICO: '',
    console,
    setInterval: (callback) => { state.intervals.add(callback); return callback; },
    clearInterval: (callback) => state.intervals.delete(callback),
    setTimeout,
    clearTimeout,
    createInlineQrSession: (win, options) => {
      const session = { win, options, stopped: false, stop() { this.stopped = true; }, fail(reason) { options.onFail(reason); }, click() { return true; } };
      state.inlineSessions.push(session);
      return session;
    },
  });
  const clearSource = main.slice(main.indexOf('async function clearKugouMusicLoginSession('), main.indexOf('async function clearNeteaseMusicLoginSession('));
  vm.runInContext(revealSource + inlineSource + openSource + clearSource, context);
  return { state, open: context.openKugouMusicLoginWindow, clear: context.clearKugouMusicLoginSession, seedInline: entry => { context.entry = entry; vm.runInContext("inlineLoginSessions.set('kugou', entry)", context); } };
}

test('Kugou ordinary login keeps a reusable session without clearing storage', async () => {
  const harness = loginHarness('userid=123456; token=synthetic-existing-token');
  const result = await harness.open(null);
  assert.equal(result.ok, true);
  assert.equal(result.reused, true);
  assert.equal(harness.state.clearCount, 0);
  assert.equal(harness.state.windows.length, 0);
});

test('Kugou explicit re-login discards a revoked token before reuse and completes with a fresh session', async () => {
  const harness = loginHarness('userid=123456; token=synthetic-revoked-token');
  const completion = harness.open(null, { forceReauth: true });
  await new Promise(setImmediate);
  assert.equal(harness.state.clearCount, 1);
  assert.equal(harness.state.cookie, '');
  assert.equal(harness.state.windows.length, 1);
  const window = harness.state.windows[0];
  assert.equal(window.url, 'https://www.kugou.com/');
  harness.state.cookie = 'userid=123456; token=synthetic-fresh-token';
  window.webContents.emit('did-finish-load');
  const result = await completion;
  assert.equal(result.ok, true);
  assert.equal(result.reused, undefined);
  assert.equal(result.cookie, harness.state.cookie);
  assert.equal(window.isDestroyed(), true);
  assert.equal(harness.state.intervals.size, 0);
});

test('Kugou only literal true requests storage clearing', async () => {
  for (const options of [null, {}, { forceReauth: false }, { forceReauth: 'true' }]) {
    const harness = loginHarness('userid=123456; token=synthetic-existing-token');
    const result = await harness.open(null, options);
    assert.equal(result.reused, true);
    assert.equal(harness.state.clearCount, 0);
  }
});

test('Kugou cancelled re-login never returns the discarded session', async () => {
  const harness = loginHarness('userid=123456; token=synthetic-revoked-token');
  const completion = harness.open(null, { forceReauth: true });
  await new Promise(setImmediate);
  harness.state.windows[0].close();
  const result = await completion;
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.cookie, undefined);
  assert.equal(harness.state.intervals.size, 0);
});

test('Kugou renderer re-login options reach the main handler without an unlock step', async () => {
  let desktopApi;
  let handler;
  const owner = {};
  const calls = [];
  const handlerSource = main.slice(
    main.indexOf("ipcMain.handle('kugou-music-open-login'"),
    main.indexOf("ipcMain.handle('kugou-music-clear-login'"),
  );
  const notifySource = main.slice(
    main.indexOf('function withInlineLoginNotify('),
    main.indexOf("ipcMain.handle('netease-music-open-login'"),
  );
  vm.runInNewContext(notifySource + handlerSource, {
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    getSenderWindow: () => owner,
    isTrustedMainWindowIpc: () => true,
    openKugouMusicLoginWindow: async (receivedOwner, options) => {
      assert.equal(receivedOwner, owner);
      calls.push(options);
      return { ok: true };
    },
  });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => { desktopApi = value; } },
      ipcRenderer: { invoke: (channel, options) => {
        assert.equal(channel, 'kugou-music-open-login');
        return handler({}, options);
      } },
    }),
    window: { addEventListener() {} },
  });
  await desktopApi.openKugouMusicLogin({ forceReauth: true });
  assert.equal(calls[0].forceReauth, true);
  await desktopApi.openKugouMusicLogin();
  assert.equal(calls[1].forceReauth, undefined);
  const result = await desktopApi.openKugouMusicLogin({ forceReauth: true });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
});

test('Kugou website fallback is an interactive visible window, not a QR-only screenshot', async () => {
  const harness = loginHarness('');
  const pending = harness.open(null, { inline: true, nativeQr: false });
  await new Promise(setImmediate);
  const [win] = harness.state.windows;
  assert.equal(win.options.webPreferences.offscreen, undefined);
  win.webContents.emit('dom-ready');
  assert.equal(win.shown, true);
  assert.equal(harness.state.inlineSessions.length, 0);
  win.close();
  const result = await pending;
  assert.equal(result.cancelled, true);
});

test('Kugou verification stays visible with existing playback cookies, keeps the session and closes without claiming success', async () => {
  const harness = loginHarness('userid=123456; token=synthetic-existing-token');
  const pending = harness.open(null, { verification: true, forceReauth: true, inline: true,
    verificationUrl: 'https://verify.kugou.com/challenge?ticket=fixture' });
  await new Promise(setImmediate);
  const [win] = harness.state.windows;
  assert.equal(harness.state.clearCount, 0);
  assert.equal(win.shown, true);
  assert.equal(win.options.webPreferences.offscreen, undefined);
  assert.equal(win.url, 'https://verify.kugou.com/challenge?ticket=fixture');
  win.webContents.emit('did-finish-load');
  await new Promise(setImmediate);
  assert.equal(win.destroyed, false);
  assert.equal(win.executions.length, 0);
  assert.equal(harness.state.intervals.size, 0);
  win.close();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.verification, true);
  assert.equal(result.closed, true);
  assert.equal(result.retryRequired, true);
  assert.equal(result.cookie, harness.state.cookie);
});

test('Kugou verification rejects unsafe challenge URLs before opening a window', async () => {
  for (const url of ['http://kugou.com/', 'https://kugou.com.evil.test/', 'https://user:pass@kugou.com/', 'file:///tmp/fixture', 'https://kugou.com:444/', '//kugou.com/']) {
    const harness = loginHarness('userid=123; token=fixture');
    const result = await harness.open(null, { verification: true, verificationUrl: url });
    assert.equal(result.error, 'KUGOU_VERIFICATION_URL_INVALID');
    assert.equal(harness.state.windows.length, 0);
  }
});

test('Kugou navigation and popups cannot leave official HTTPS hosts or invoke an external app', async () => {
  const harness = loginHarness('');
  const pending = harness.open(null, { verification: true });
  await new Promise(setImmediate);
  const [win] = harness.state.windows;
  for (const url of ['https://evil.test/', 'javascript:alert(1)', 'kugou://login', 'https://u:p@kugou.com/']) {
    let prevented = false;
    win.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, url);
    assert.equal(prevented, true);
    assert.equal(win.popupHandler({ url }).action, 'deny');
    assert.equal(win.url, 'https://www.kugou.com/');
  }
  let prevented = false;
  win.webContents.emit('will-redirect', { preventDefault() { prevented = true; } }, 'http://kugou.com/');
  assert.equal(prevented, true);
  win.popupHandler({ url: 'https://h5.kugou.com/captcha' });
  assert.equal(win.url, 'https://h5.kugou.com/captcha');
  win.close(); await pending;
});

test('a visible security challenge during website login takes precedence over complete cookies', async () => {
  const harness = loginHarness('');
  const pending = harness.open(null, { inline: true, nativeQr: false });
  await new Promise(setImmediate);
  const [win] = harness.state.windows;
  harness.state.cookie = 'userid=123; token=fresh-but-unverified';
  win.url = 'https://h5.kugou.com/captcha';
  win.webContents.emit('did-finish-load');
  await new Promise(setImmediate);
  assert.equal(win.destroyed, false);
  assert.equal(win.shown, true);
  assert.equal(win.executions.length, 0);
  assert.equal(harness.state.intervals.size, 0);
  win.close();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.verification, true);
  assert.equal(result.retryRequired, true);
});

test('new Kugou verification replaces an older window and logout cancels all login activity before clearing cookies', async () => {
  const harness = loginHarness('userid=123; token=fixture');
  const first = harness.open(null, { verification: true });
  await new Promise(setImmediate);
  const [old] = harness.state.windows;
  const second = harness.open(null, { verification: true });
  await new Promise(setImmediate);
  const [_, current] = harness.state.windows;
  assert.equal(old.destroyed, true);
  assert.equal((await first).cancelled, true);
  let nativeCancelled = false;
  harness.seedInline({ cancel() { nativeCancelled = true; } });
  await harness.clear();
  assert.equal(nativeCancelled, true);
  assert.equal(current.destroyed, true);
  assert.equal(harness.state.cookie, '');
  const cancelled = await second;
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.retryRequired, undefined);
  assert.equal(cancelled.cookie, undefined);
});

test('Kugou redirect guard supports current Electron details and leaves captcha subframes usable', async () => {
  const harness = loginHarness('');
  const pending = harness.open(null, { verification: true });
  await new Promise(setImmediate);
  const [win] = harness.state.windows;
  let prevented = false;
  win.webContents.emit('will-redirect', { url: 'https://evil.test/', isMainFrame: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  win.webContents.emit('will-redirect', { url: 'https://evil.test/', isMainFrame: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  win.close(); await pending;
});

test('untrusted renderers cannot launch Kugou login or clear its session', async () => {
  const handlers = new Map();
  let calls = 0;
  const start = main.indexOf("ipcMain.handle('kugou-music-open-login'");
  const clearStart = main.indexOf("ipcMain.handle('kugou-music-clear-login'", start);
  const source = main.slice(start, main.indexOf('\n});', clearStart) + 5);
  vm.runInNewContext(source, {
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    isTrustedMainWindowIpc: () => false,
    openKugouMusicLoginWindow: () => { calls++; },
    clearKugouMusicLoginSession: () => { calls++; },
  });
  for (const name of ['kugou-music-open-login', 'kugou-music-clear-login']) assert.equal((await handlers.get(name)({})).error, 'UNTRUSTED_SENDER');
  assert.equal(calls, 0);
});

test('logout while cookie reuse is pending cannot create a late Kugou window or return success', async () => {
  const harness = loginHarness('userid=123; token=fixture');
  const pending = harness.open(null, { verification: true });
  await harness.clear();
  const result = await pending;
  assert.equal(result.cancelled, true);
  assert.equal(result.ok, false);
  assert.equal(harness.state.windows.length, 0);
  assert.equal(harness.state.cookie, '');
});

test('DOM-ready and full-load share the pending challenge check before any login-entry click', async () => {
  const harness = loginHarness('');
  const pending = harness.open(null, { nativeQr: false, inline: true });
  await new Promise(setImmediate);
  const [win] = harness.state.windows;
  let resolveDetection;
  let executions = 0;
  win.webContents.mainFrame = { executeJavaScript() { executions++; return new Promise(resolve => { resolveDetection = resolve; }); } };
  harness.state.cookie = 'userid=123; token=fixture';
  win.webContents.emit('dom-ready');
  win.webContents.emit('did-finish-load');
  await new Promise(setImmediate);
  assert.equal(executions, 1);
  resolveDetection(true);
  await new Promise(setImmediate);
  assert.equal(executions, 1);
  assert.equal(win.destroyed, false);
  win.close();
  assert.equal((await pending).retryRequired, true);
});
