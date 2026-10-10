'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(source.slice(source.indexOf('function isTrustedQQLoginUrl('), source.indexOf('function qqLoginCompletionFromCookie(')), context);
test('QQ login policy preserves existing official hosts and rejects unsafe destinations', () => {
  for (const url of ['https://y.qq.com/n/ryqq/profile', 'https://xui.ptlogin2.qq.com/cgi-bin/xlogin', 'https://open.weixin.qq.com/connect/qrconnect', 'https://ssl.captcha.qq.com/', 'https://y.qq.com:443/']) assert.equal(context.isTrustedQQLoginUrl(url), true, url);
  for (const url of ['http://y.qq.com/', 'https://y.qq.com.evil.invalid/', 'https://evilqq.com/', 'https://name:pass@y.qq.com/', 'https://y.qq.com:8443/', 'javascript:void(0)', 'file:///tmp/page', 'https://y.qq.com@evil.invalid/']) assert.equal(context.isTrustedQQLoginUrl(url), false, url);
});
test('QQ navigation guards handle modern/legacy main-frame events while preserving challenge subframes', () => {
  const wc = new EventEmitter();
  context.installQQLoginNavigationGuards(wc);
  for (const kind of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
    for (const modern of [true, false]) {
      let blocked = 0;
      const event = { preventDefault() { blocked++; } };
      if (modern) wc.emit(kind, { ...event, url: 'https://evil.invalid/', isMainFrame: true });
      else wc.emit(kind, event, 'https://evil.invalid/', false, true);
      assert.equal(blocked, 1);
      wc.emit(kind, { ...event, url: 'https://captcha.qq.com/', isMainFrame: true });
      assert.equal(blocked, 1);
      wc.emit(kind, { ...event, url: 'https://challenge.invalid/', isMainFrame: false });
      wc.emit(kind, event, 'https://challenge.invalid/', false, false);
      assert.equal(blocked, 1);
    }
  }
});
test('QQ root, child and warmup windows share the guarded installation and deny untrusted popups', () => {
  const opener = source.slice(source.indexOf('async function openQQMusicLoginWindow('), source.indexOf('async function clearQQMusicLoginSession('));
  assert.match(opener, /installQQLoginNavigationGuards\(win\.webContents\)/);
  assert.match(opener, /installQQLoginWindowHandlers\(loginWindow, true\)/);
  assert.match(opener, /installQQLoginWindowHandlers\(child, false\)/);
  assert.match(opener, /installQQLoginWindowHandlers\(warmupWindow, false\)/);
  assert.doesNotMatch(opener, /shell\.openExternal/);
});
