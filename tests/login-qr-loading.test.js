'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function fixture() {
  const classes = new Set();
  const shell = { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } };
  const attrs = new Map();
  const img = {
    alt: '',
    onload: null,
    onerror: null,
    set src(value) { attrs.set('src', value); },
    get src() { return attrs.get('src') || ''; },
    getAttribute: name => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => attrs.set(name, String(value)),
    removeAttribute: name => attrs.delete(name),
  };
  const ctx = vm.createContext({
    loginProvider: 'qishui',
    document: { getElementById: id => (id === 'qr-shell' ? shell : (id === 'qr-img' ? img : null)) },
  });
  loadFunctions(ctx, 'public/js/modules/08-account/03-login-modal-flows.js', ['setLoginQrLoading', 'clearLoginQrImage', 'showLoginQrImage']);
  return { ctx, img, attrs, loading: () => classes.has('qr-loading') };
}

test('clearing the QR removes src instead of setting an empty URL', () => {
  const { ctx, img, attrs, loading } = fixture();
  img.src = 'data:image/png;base64,old';
  img.alt = '旧二维码';
  ctx.setLoginQrLoading(true);
  ctx.clearLoginQrImage(img);
  assert.equal(attrs.has('src'), false, 'an empty src would load the page itself and show a broken image');
  assert.equal(img.alt, '');
  assert.equal(loading(), false);
});

test('the spinner stays until the new QR decodes; a stale load is ignored', () => {
  const { ctx, img, loading } = fixture();
  ctx.setLoginQrLoading(true);
  ctx.showLoginQrImage(img, 'data:image/png;base64,first', '汽水音乐登录二维码');
  const firstOnload = img.onload;
  assert.equal(loading(), true, 'still loading until decoded');
  ctx.showLoginQrImage(img, 'data:image/png;base64,second', '汽水音乐登录二维码');
  firstOnload();
  assert.equal(loading(), true, 'the replaced image must not end the spinner');
  img.onload();
  assert.equal(loading(), false);
  assert.equal(img.alt, '汽水音乐登录二维码');
  assert.equal(img.getAttribute('data-qr-provider'), 'qishui', 'QR remembers which provider it belongs to');
});

test('a QR that fails to decode leaves a clean card, not a broken image', () => {
  const { ctx, img, attrs, loading } = fixture();
  ctx.setLoginQrLoading(true);
  ctx.showLoginQrImage(img, 'data:image/png;base64,broken', '网易云音乐登录二维码');
  img.onerror();
  assert.equal(attrs.has('src'), false);
  assert.equal(img.alt, '');
  assert.equal(loading(), false);
});

test('the login markup does not start with an empty src', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /<img id="qr-img" alt="">/);
  assert.doesNotMatch(html, /<img id="qr-img" src=""/);
});

function drawerFixture(overrides) {
  const calls = [];
  const attrs = new Map();
  const img = { getAttribute: name => (attrs.has(name) ? attrs.get(name) : null) };
  const ctx = vm.createContext(Object.assign({
    window: { desktopWindow: { openNeteaseMusicLogin() {} } },
    document: { getElementById: id => (id === 'qr-img' ? img : null) },
    loginProvider: 'qishui',
    qrKey: null,
    loginProviderClickSuppressed: false,
    loginWorkflowPendingProvider: '',
    loginWorkflowActiveMode: () => 'official',
    normalizeLoginProviderKey: p => p,
    setLoginProvider(p) { ctx.loginProvider = p; },
    hasLoginWorkflowConnection: () => true,
    setLoginAuthDrawerOpen(open) { calls.push('drawer:' + open); },
    updateLoginProviderUi() {},
    openQishuiWebLogin() { calls.push('generate-qishui'); },
    refreshQr() { calls.push('generate-netease'); },
    startQrPoll() { calls.push('resume-poll'); },
    loginProviderSupportsCookieMode: p => p !== 'qishui',
    setManualCookieOpenForProvider() {},
    showToast() {},
  }, overrides || {}));
  loadFunctions(ctx, 'public/js/modules/08-account/03-login-modal-flows.js', ['selectLoginProviderNode', 'selectLoginMode', 'loginProviderUsesInlineQr', 'ensureLoginInlineQr']);
  return { ctx, calls, attrs };
}

const waitingForScan = { loginWorkflowPendingProvider: 'qishui', hasLoginWorkflowConnection: () => false };

test('selecting a Qishui node still waiting for its scan generates the QR instead of leaving an empty card', () => {
  const { ctx, calls } = drawerFixture(waitingForScan);
  ctx.selectLoginProviderNode('qishui');
  assert.deepEqual(calls, ['drawer:true', 'generate-qishui']);
});

test('selecting a logged-in node only selects it and does not open the scan drawer', () => {
  const { ctx, calls } = drawerFixture();
  ctx.selectLoginProviderNode('qishui');
  assert.deepEqual(calls, ['drawer:false']);
});

test('reopening with the same provider QR on screen resumes polling instead of regenerating', () => {
  const { ctx, calls, attrs } = drawerFixture(Object.assign({ qrKey: 'token' }, waitingForScan));
  attrs.set('src', 'data:image/png;base64,qr');
  attrs.set('data-qr-provider', 'qishui');
  ctx.selectLoginProviderNode('qishui');
  assert.deepEqual(calls, ['drawer:true', 'resume-poll']);
});

test('an expired or other-provider QR is regenerated', () => {
  const expired = drawerFixture(Object.assign({ qrKey: null }, waitingForScan));
  expired.attrs.set('src', 'data:image/png;base64,old');
  expired.attrs.set('data-qr-provider', 'qishui');
  expired.ctx.selectLoginProviderNode('qishui');
  assert.deepEqual(expired.calls, ['drawer:true', 'generate-qishui']);
  const other = drawerFixture(Object.assign({ qrKey: 'netease-key' }, waitingForScan));
  other.attrs.set('src', 'data:image/png;base64,netease');
  other.attrs.set('data-qr-provider', 'netease');
  other.ctx.selectLoginProviderNode('qishui');
  assert.deepEqual(other.calls, ['drawer:true', 'generate-qishui']);
});

test('web-window providers, cookie mode and an unconnected node do not generate a QR', () => {
  const netease = drawerFixture({ loginWorkflowPendingProvider: 'netease', hasLoginWorkflowConnection: () => false });
  netease.ctx.selectLoginProviderNode('netease');
  assert.deepEqual(netease.calls, ['drawer:true'], 'desktop NetEase logs in through its own login bridge');
  const cookie = drawerFixture(Object.assign({ loginWorkflowActiveMode: () => 'cookie' }, waitingForScan));
  cookie.ctx.selectLoginProviderNode('qishui');
  assert.deepEqual(cookie.calls, ['drawer:true']);
  const closed = drawerFixture({ hasLoginWorkflowConnection: () => false });
  closed.ctx.selectLoginProviderNode('qishui');
  assert.deepEqual(closed.calls, ['drawer:false']);
});

test('the MR scan-mode button also generates the QR for a connected Qishui node', () => {
  const { ctx, calls } = drawerFixture();
  ctx.selectLoginMode('official');
  assert.deepEqual(calls, ['drawer:true', 'generate-qishui']);
});
