'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, '..', 'desktop/main.js'), 'utf8');
const validator = source.slice(source.indexOf('function isNeteaseLoginNavigationUrl('), source.indexOf('\nfunction isQQCookieDomain('));
const opener = source.slice(source.indexOf('async function openNeteaseMusicLoginWindow('), source.indexOf('\nasync function openQQMusicLoginWindow('));

function harness() {
  const windows = [], external = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = handler => { this.popup = handler; };
      windows.push(this); this.loads = [];
    }
    isDestroyed() { return !!this.destroyed; }
    loadURL(url) { this.loads.push(url); return Promise.resolve(); }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const context = vm.createContext({
    URL, console, BrowserWindow: Window,
    session: { fromPartition: () => ({}) },
    readNeteaseLoginCookieHeader: async () => '', neteaseCookieHasLogin: () => false,
    NETEASE_LOGIN_PARTITION: 'isolated-fixture', NETEASE_LOGIN_URL: 'https://music.163.com/#/login', APP_ICON_ICO: '',
    loginWindowWebPreferences: value => value, attachInlineLogin() {}, revealLoginWindowWhenReady: () => () => {},
    shell: { openExternal: async url => external.push(url) }, setInterval: () => 1, clearInterval() {},
  });
  vm.runInContext(validator + opener, context);
  return { context, windows, external };
}

test('NetEase official HTTPS hosts require complete boundaries and no userinfo', () => {
  const { context } = harness();
  for (const url of ['https://music.163.com/#/login', 'https://dl.reg.163.com/', 'https://musicupload.netease.com/']) {
    assert.equal(context.isNeteaseLoginNavigationUrl(url), true, url);
  }
  for (const url of ['https://music.163.com.evil.test/', 'https://music.163.com@evil.test/', 'https://evil@music.163.com/', 'http://music.163.com/', 'https://music.163.com:8443/', 'https://netease.com.evil.test/', 'javascript:alert(1)', 'not-a-url']) {
    assert.equal(context.isNeteaseLoginNavigationUrl(url), false, url);
  }
});

test('NetEase protected login blocks top-level navigations and redirects, preserving child frames', async () => {
  const { context, windows, external } = harness();
  const result = context.openNeteaseMusicLoginWindow(null, {});
  await new Promise(setImmediate);
  const win = windows[0];
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.options.webPreferences.sandbox, true);
  for (const eventName of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
    for (const url of ['https://evil.test/', 'https://music.163.com@evil.test/', 'http://music.163.com/']) {
      let blocked = false;
      win.webContents.emit(eventName, { url, isMainFrame: true, preventDefault: () => { blocked = true; } }, url, false, true);
      assert.equal(blocked, true, eventName + ': ' + url);
    }
    let blocked = false;
    win.webContents.emit(eventName, { url: 'https://music.163.com/', isMainFrame: true, preventDefault: () => { blocked = true; } }, 'https://music.163.com/', false, true);
    assert.equal(blocked, false);
    let currentFormatBlocked = false;
    win.webContents.emit(eventName, { url: 'https://music.163.com.evil.test/', isMainFrame: true, preventDefault: () => { currentFormatBlocked = true; } });
    assert.equal(currentFormatBlocked, true, eventName + ' must handle current Electron event details');
  }
  let childBlocked = false;
  win.webContents.emit('will-frame-navigate', { url: 'https://captcha-fixture.invalid/', isMainFrame: false, preventDefault: () => { childBlocked = true; } });
  assert.equal(childBlocked, false);
  const official = win.popup({ url: 'https://reg.163.com/' });
  assert.equal(official.action, 'deny');
  assert.equal(win.loads.at(-1), 'https://reg.163.com/');
  const count = win.loads.length;
  win.popup({ url: 'https://music.163.com@evil.test/' });
  assert.equal(win.loads.length, count);
  assert.equal(external.length, 0, 'userinfo URLs must not be passed to the system browser either');
  win.close();
  assert.equal((await result).cancelled, true);
});
