'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { validateKugouVerificationUrl, getKugouVerificationChallenge, detectKugouVerificationPage, kugouLoginEntryScript } = require('../desktop/kugou-verification');

test('official verification URLs have strict HTTPS host, credentials, port and parser boundaries', () => {
  for (const url of ['https://kugou.com/', 'https://www.kugou.com/', 'https://h5.kugou.com:443/captcha?ticket=fixture#state']) assert.equal(new URL(validateKugouVerificationUrl(url)).hostname.endsWith('kugou.com'), true);
  for (const url of [undefined, '', 'http://kugou.com/', '//kugou.com/', 'https://kugou.com.evil.test/', 'https://evil-kugou.com/', 'https://u:p@kugou.com/', 'https://kugou.com:444/', 'https://kugou.com./', 'https://kugou.com\\@evil.test/', 'https://kugou.com/\nfixture']) assert.equal(validateKugouVerificationUrl(url), '');
  assert.equal(getKugouVerificationChallenge({ err_code: 30020, data: { verify_url: 'https://evil.test/' } }).verificationUrl, undefined);
  assert.equal(getKugouVerificationChallenge({ status: 0, message: '请求超时' }), null);
});

test('a hung official frame cannot accumulate JavaScript checks or falsely establish no challenge', async () => {
  let calls = 0;
  const frame = { executeJavaScript() { calls++; return new Promise(() => {}); } };
  const contents = { getURL: () => 'https://www.kugou.com/', mainFrame: frame };
  assert.equal(await detectKugouVerificationPage(contents, { timeoutMs: 5 }), null);
  assert.equal(await detectKugouVerificationPage(contents, { timeoutMs: 5 }), null);
  assert.equal(calls, 1);
});

test('visible challenge elements prevent automatic login clicks, including a late challenge', () => {
  let clicks = 0;
  const node = { id: 'captcha', className: '', innerText: '安全验证', textContent: '登录', getAttribute: () => '', getBoundingClientRect: () => ({ width: 100, height: 50 }), click() { clicks++; } };
  const context = { document: { querySelectorAll: () => [node] }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }), setTimeout: callback => callback() };
  vm.runInNewContext(kugouLoginEntryScript(), context);
  assert.equal(clicks, 0);
  node.id = ''; node.innerText = '登录';
  vm.runInNewContext(kugouLoginEntryScript(), context);
  assert.equal(clicks, 1);
});

test('a visible security challenge in a child frame is detected without clicking or submitting', async () => {
  let executions = 0;
  const child = { executeJavaScript: async script => { executions++; assert.doesNotMatch(script, /\.click\(|\.submit\(/); return true; } };
  const main = { executeJavaScript: async () => false, framesInSubtree: [] };
  main.framesInSubtree = [main, child];
  assert.equal(await detectKugouVerificationPage({ getURL: () => 'https://www.kugou.com/', mainFrame: main }), true);
  assert.equal(executions, 1);
});
