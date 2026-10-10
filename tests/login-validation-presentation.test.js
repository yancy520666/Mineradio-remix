'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const dir = path.join(__dirname, '../public/js/modules/08-account');
const status = fs.readFileSync(path.join(dir, '02-login-status.js'), 'utf8');
const modal = fs.readFileSync(path.join(dir, '03-login-modal-flows.js'), 'utf8');
function extract(source, name) { const start = source.indexOf('function ' + name + '('); assert(start >= 0); return source.slice(start, source.indexOf('\n}\n', start) + 3); }
function fixture(extra = {}) {
  const notices = [];
  const c = vm.createContext({ showToast: text => notices.push(text), ...extra });
  for (const name of ['providerSessionNeedsValidation', 'providerSessionPendingText']) vm.runInContext(extract(status, name), c);
  vm.runInContext(extract(modal, 'showPendingProviderLogin'), c);
  return { c, notices };
}
test('pending evidence changes copy, not saved identity, membership or logged-in gating', () => {
  const { c, notices } = fixture();
  for (const flag of ['unverified', 'pendingProfile', 'statusPending', 'sessionRejected']) {
    const info = { loggedIn: true, userId: 'fixture-user', isVip: true, playbackKeyReady: true, [flag]: true };
    const original = JSON.stringify(info), el = {};
    assert.equal(c.showPendingProviderLogin('qq', info, el), true);
    assert.equal(el.textContent, '暂时无法确认登录，请刷新状态');
    assert.doesNotMatch(el.textContent, /登录成功|已登录|完整播放|过期|重新登录/);
    assert.equal(el.className, 'preview');
    assert.equal(JSON.stringify(info), original);
  }
  assert.equal(notices.length, 0, 'pending status stays in the existing line without duplicate toasts');
  assert.equal(c.showPendingProviderLogin('qq', { loggedIn: true, isVip: true }, {}), false);
});
test('retry uses only existing status refresh flows and stays on the selected provider', async () => {
  const calls = [];
  const { c } = fixture({ loginProvider: 'netease', refreshLoginStatus: async () => calls.push('netease'), refreshQQLoginStatus: async () => calls.push('qq'), refreshKugouLoginStatus: async () => calls.push('kugou'), refreshQishuiLoginStatus: async () => calls.push('qishui'), updateLoginProviderUi: () => calls.push('render') });
  vm.runInContext('async ' + extract(modal, 'retryProviderSessionValidation'), c);
  for (const provider of ['netease', 'qq', 'kugou', 'qishui']) { c.loginProvider = provider; await c.retryProviderSessionValidation(); }
  assert.deepEqual(calls, ['netease', 'render', 'qq', 'render', 'kugou', 'render', 'qishui', 'render']);
});
test('pending completion paths return before strong success/automatic modal close', () => {
  for (const name of ['openNeteaseWebLogin', 'submitNeteaseCookieLogin', 'openQQWebLogin', 'openKugouWebLogin', 'submitQQCookieLogin']) {
    const body = extract(modal, name);
    assert.match(body, /if \(showPendingProviderLogin\(.+\)\) return;/);
    assert(body.indexOf('showPendingProviderLogin(') < body.indexOf('scheduleLoginAttemptClose('));
  }
  assert.match(extract(modal, 'checkQr'), /if \(showPendingProviderLogin\('netease', fresh, \$st\)\)/);
});
test('NetEase explicit retry bypasses cache while preserving account and library on unverified reply', async () => {
  const calls = [], rows = [{ id: 'saved-playlist' }];
  const c = vm.createContext({
    Date, console, loginStatus: { loggedIn: true, userId: 'saved-user', nickname: 'Saved' },
    loginPresenceState: { netease: { rejected: 0 } }, activeAccountProvider: 'netease',
    homeDiscoverState: {}, playQueue: [], playlist: [], userPlaylists: rows,
    apiJson: async url => { calls.push(url); return { loggedIn: false, hasCookie: true, unverified: true }; },
    auditProviderVipState() {}, hasPlatformLogin: () => true, renderUserBtn() {},
    refreshUserPlaylists() {}, loadHomeDiscover() {}, syncLikeStatusForSongs() {},
    forgetProviderLiveSession() { throw new Error('must preserve saved session'); },
    clearNeteaseSessionState() { throw new Error('must preserve library'); },
  });
  vm.runInContext('async ' + extract(status, 'refreshLoginStatus'), c);
  await c.refreshLoginStatus(true);
  assert.match(calls[0], /[?&]fresh=1(?:&|$)/);
  assert.equal(c.loginStatus.userId, 'saved-user');
  assert.equal(c.loginStatus.loggedIn, true);
  assert.equal(c.loginStatus.unverified, true);
  assert.equal(c.userPlaylists, rows);
});
test('login instructions use plain next steps and keep network uncertainty separate from expiry', () => {
  const { c } = fixture({
    normalizeQQLoginStatus: info => info,
    qqLoginNeedsAuthorizationRefresh: info => info.authorizationIncomplete,
    qqMembershipNeedsSync: info => info.membershipKnown === false,
    qqMembershipLabel: () => '普通账号',
  });
  vm.runInContext(extract(status, 'qqLoginStatusText') + extract(modal, 'qishuiLoginStatusText'), c);
  assert.equal(c.qqLoginStatusText({ loggedIn: true, authorizationIncomplete: true }), '已登录，还需完成 QQ 音乐播放授权');
  assert.equal(c.qqLoginStatusText({ loggedIn: true, membershipKnown: false }), '请刷新 QQ 音乐会员状态');
  assert.equal(c.qqLoginStatusText({ loggedIn: true, unverified: true }), '暂时无法确认登录，请刷新状态');
  assert.equal(c.qishuiLoginStatusText({ webSession: true, stale: true }), '暂时无法确认登录，请刷新状态');
  assert.equal(c.qishuiLoginStatusText({ webSession: true }), '汽水音乐已登录');
  assert.match(modal, /请重新打开 QQ 音乐登录窗口，进入播放器页面后再关闭/);
  assert.doesNotMatch(status + modal, /'[^'\n]*(?:会话|账号态|掉登录|连线登录|复验)[^'\n]*'/);
});
