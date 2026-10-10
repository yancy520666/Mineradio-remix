'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const flows = 'public/js/modules/08-account/03-login-modal-flows.js';
function fixture(provider = 'qq') {
  const status = {}, img = {};
  const c = vm.createContext({
    inlineLoginQrProvider: provider, loginProvider: provider, inlineLoginQrRequest: { id: 7 },
    document: { getElementById: id => id === 'qr-status' ? status : img },
    setInlineLoginQrView() {}, showLoginQrImage() {}, setLoginQrLoading() {}, clearLoginQrImage() {},
    loginWorkflowProviderLabel: x => x, updateLoginProviderUi() {},
  });
  loadFunctions(c, flows, ['handleInlineLoginQr', 'inlineLoginQrAppLabel']);
  return { c, status, emit: extra => c.handleInlineLoginQr({ provider, requestId: 7, ...extra }) };
}
test('QQ ready scan has one persistent instruction; active states remain distinct', () => {
  const { emit, status } = fixture();
  emit({ stage: 'qr', image: 'fixture', scanApp: 'QQ 音乐 App（不支持 QQ／微信扫一扫）' });
  assert.equal(status.textContent, '');
  assert.equal(status.className, '');
  emit({ stage: 'qr', image: 'fixture', expired: true });
  assert.match(status.textContent, /已过期/); assert.equal(status.className, 'fail');
  emit({ stage: 'scanned' }); assert.match(status.textContent, /已扫码/); assert.equal(status.className, 'scan');
  emit({ stage: 'failed' }); assert.match(status.textContent, /未完成.*重试/); assert.equal(status.className, 'fail');
  emit({ stage: 'loading', message: '正在刷新二维码…' }); assert.equal(status.textContent, '正在刷新二维码…');
  emit({ stage: 'scanned', message: '请在官方窗口完成安全验证' }); assert.equal(status.textContent, '请在官方窗口完成安全验证');
});
test('other providers retain scan instructions and stale events cannot alter visible state', () => {
  for (const provider of ['netease', 'kugou']) {
    const { c, emit, status } = fixture(provider);
    emit({ stage: 'qr', image: 'fixture' }); assert.match(status.textContent, /请使用.+App.*扫码/);
    const text = status.textContent;
    emit({ stage: 'failed', requestId: 6 }); assert.equal(status.textContent, text);
    c.inlineLoginQrRequest = null;
    emit({ stage: 'failed' }); assert.equal(status.textContent, text);
  }
});
test('QQ-only layout and accessible status retain concise copy with no slash', () => {
  const source = fs.readFileSync(flows, 'utf8');
  assert.match(source, /desc\.textContent = '请用 QQ 音乐 App 扫码'/);
  assert.match(source, /'扫码登录 QQ 音乐'/);
  assert.match(source, /classList\.toggle\('qq-scan-mode', inlineQrDesc && !cookieMode\)/);
  assert.match(fs.readFileSync('public/index.html', 'utf8'), /id="qr-status" role="status" aria-live="polite" aria-atomic="true"/);
  const css = fs.readFileSync('public/css/index.css', 'utf8');
  assert.match(css, /#login-auth-drawer\.qq-scan-mode #qr-status:empty \{ margin: 0; \}/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
