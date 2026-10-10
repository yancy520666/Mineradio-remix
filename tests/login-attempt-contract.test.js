'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { loadFunctions } = require('./helpers/classic-functions');
const flows = 'public/js/modules/08-account/03-login-modal-flows.js';
const settle = () => new Promise(resolve => setImmediate(resolve));

// Execute the actual endpoint blocks with isolated fake credentials and probes.
// Nothing contacts an upstream service or writes the user's configuration.
function endpointBlock(pn) {
  const source = fs.readFileSync('server.js', 'utf8');
  const start = source.indexOf("  if (pn === '" + pn + "') {");
  assert.ok(start >= 0, pn);
  const end = source.indexOf('\n  if (pn === ', start + 1);
  return source.slice(start, end);
}
function serverFixture(provider) {
  const saved = [], replies = [];
  const c = vm.createContext({ crypto, console: { error() {} },
    loginAttempts: { netease: null, qq: null, kugou: null },
    loginSessionGeneration: { netease: 0, qq: 0, kugou: 0 },
    userCookie: 'MUSIC_U=old', qqCookie: 'uin=1; qm_keyst=old', kugouCookie: 'userid=1; token=old',
    readRequestBody: async req => req.body,
    sendJSON: (_res, body, status = 200) => replies.push({ body, status }),
    normalizeCookieHeader: x => x, normalizeQQCookieInput: x => x, normalizeKugouCookieInput: x => x,
    qqCookieUin: o => o.uin, qqCookiePlaybackKey: o => o.qm_keyst, qqCookieMusicKey: o => o.qm_keyst,
    extractKugouAuth: () => ({ loggedIn: true, playbackReady: true }),
    saveCookie: x => { saved.push(x); c.userCookie = x; },
    saveQQCookie: x => { saved.push(x); c.qqCookie = x; },
    saveKugouCookie: x => { saved.push(x); c.kugouCookie = x; },
    fetchNeteaseLoginInfo: async () => ({ loggedIn: true }),
    getQQLoginInfo: async () => ({ loggedIn: true }), getKugouLoginInfo: async () => ({ loggedIn: true }),
  });
  loadFunctions(c, 'server.js', ['beginLoginAttempt', 'currentLoginAttempt', 'sendLoginSuperseded', 'bumpLoginSessionGeneration', 'parseCookieString']);
  const pn = provider === 'netease' ? '/api/login/cookie' : '/api/' + provider + '/login/cookie';
  c.endpoint = vm.runInContext('(async function(req, res, pn) {\n' + endpointBlock(pn) + '\n})', c);
  const attempt = c.beginLoginAttempt(provider);
  const cookie = provider === 'netease' ? 'MUSIC_U=new' : provider === 'qq' ? 'uin=2; qm_keyst=new' : 'userid=2; token=new';
  return { c, saved, replies, attempt, cookie, call: (body = { cookie, attemptId: attempt.id }) => c.endpoint({ body }, {}, pn) };
}
for (const provider of ['netease', 'qq', 'kugou']) {
  test(provider + ' rejects missing or invalidated attempt before cookie submission', async () => {
    const f = serverFixture(provider);
    await f.call({ cookie: f.cookie });
    assert.equal(f.replies[0].status, 409);
    f.c.bumpLoginSessionGeneration(provider);
    await f.call();
    assert.equal(f.replies[1].status, 409);
    assert.deepEqual(f.saved, []);
  });
  for (const action of ['logout', 'cancel', 'replace']) test(provider + ' never commits a probe finishing after ' + action, async () => {
    const f = serverFixture(provider);
    let release;
    const probeName = provider === 'netease' ? 'fetchNeteaseLoginInfo' : provider === 'qq' ? 'getQQLoginInfo' : 'getKugouLoginInfo';
    f.c[probeName] = () => new Promise(resolve => { release = resolve; });
    const pending = f.call();
    await settle();
    if (action === 'logout') f.c.bumpLoginSessionGeneration(provider);
    else if (action === 'cancel') f.c.loginAttempts[provider] = null;
    else f.c.beginLoginAttempt(provider);
    release({ loggedIn: true }); await pending;
    assert.equal(f.replies[0].status, 409);
    assert.deepEqual(f.saved, []);
  });
  test(provider + ' also rejects an in-flight body after logout', async () => {
    const f = serverFixture(provider); let release;
    f.c.readRequestBody = () => new Promise(resolve => { release = resolve; });
    const pending = f.call(); f.c.bumpLoginSessionGeneration(provider);
    release({ cookie: f.cookie, attemptId: f.attempt.id }); await pending;
    assert.equal(f.replies[0].status, 409); assert.deepEqual(f.saved, []);
  });
}
for (const provider of ['netease', 'qq']) test(provider + ' validates candidate without replacing a rejected session', async () => {
  const f = serverFixture(provider);
  const name = provider === 'netease' ? 'fetchNeteaseLoginInfo' : 'getQQLoginInfo';
  f.c[name] = async candidate => {
    assert.equal(typeof candidate === 'string' ? candidate : candidate.cookie, f.cookie);
    assert.match(provider === 'netease' ? f.c.userCookie : f.c.qqCookie, /old/);
    return { loggedIn: true, sessionRejected: true };
  };
  await f.call();
  assert.equal(f.replies[0].status, 401);
  assert.equal(f.replies[0].body.loggedIn, false);
  assert.deepEqual(f.saved, []);
});
test('NetEase temporary profile failure remains pending, while Kugou verification is passed through unsaved', async () => {
  const ne = serverFixture('netease');
  ne.c.fetchNeteaseLoginInfo = async () => ({ loggedIn: false, unverified: true });
  await ne.call(); assert.equal(ne.replies[0].body.pendingProfile, true); assert.deepEqual(ne.saved, [ne.cookie]);
  const kg = serverFixture('kugou');
  kg.c.getKugouLoginInfo = async () => ({ loggedIn: true, verificationRequired: true, verificationUrl: 'https://www.kugou.com/verify' });
  await kg.call(); assert.equal(kg.replies[0].body.verificationRequired, true); assert.equal(kg.replies[0].body.saved, false); assert.deepEqual(kg.saved, []);
});
test('late cancellation only cancels its own server-issued attempt', async () => {
  const f = serverFixture('netease');
  const current = f.c.beginLoginAttempt('netease');
  const route = vm.runInContext('(async function(req, res, pn) {\n' + endpointBlock('/api/login/attempt') + '\n})', f.c);
  await route({ method: 'POST', body: { provider: 'netease', action: 'cancel', attemptId: f.attempt.id } }, {}, '/api/login/attempt');
  assert.equal(f.c.currentLoginAttempt('netease', current.id), true);
  await route({ method: 'POST', body: { provider: 'netease', action: 'cancel', attemptId: current.id } }, {}, '/api/login/attempt');
  assert.equal(f.c.currentLoginAttempt('netease', current.id), false);
});
test('QQ candidate rejection uses its own authorization and leaves existing-session tolerance separate', async () => {
  for (const candidate of [false, true]) {
    let requestCookie;
    const c = vm.createContext({ console: { warn() {} },
      qqCookie: 'uin=1; qm_keyst=old', qqCookieObject: () => ({ uin: '1', qm_keyst: 'old' }),
      qqCookieUin: x => x.uin, qqCookieMusicKey: x => x.qm_keyst,
      nativeCommForCookie: () => ({}), normalizeQQProfile: (_b, o) => ({ loggedIn: true, userId: o.uin }),
      fetchQQVipStatus: async (_o, opts) => { if (candidate) assert.match(opts.cookie, /new/); return null; },
      qqMusicRequest: async (_payload, opts) => { requestCookie = opts.cookie; return { req_0: { code: 1000 } }; },
      mergeQQVipStatus: x => x,
    });
    loadFunctions(c, 'server.js', ['parseCookieString', 'getQQLoginInfo']);
    const info = await c.getQQLoginInfo(candidate ? { cookie: 'uin=2; qm_keyst=new' } : {});
    assert.equal(info.sessionRejected, true);
    assert.equal(info.loggedIn, !candidate);
    assert.equal(info.userId, candidate ? '2' : '1');
    assert.equal(requestCookie, candidate ? 'uin=2; qm_keyst=new' : true);
    assert.match(c.qqCookie, /old/);
  }
});

function rendererFixture(provider = 'netease') {
  const timers = [], requests = [], touched = [];
  const status = {}, button = { classList: { add() {}, remove() {} } };
  const c = vm.createContext({ loginProvider: provider, loginRefreshRequestSeq: 1, loginAttemptCurrent: null, providerAuthEpochs: {},
    qrKey: 'old', qrPollTimer: null, qishuiQrPollGeneration: 0, qishuiQrPollBusy: false,
    neteaseWebLoginBusy: false, qqWebLoginBusy: false, kugouWebLoginBusy: false, qqCookieBusy: false, kugouCookieBusy: false,
    document: { getElementById: id => id === 'qq-cookie-save-btn' ? button : status },
    window: {}, clearInterval() {}, clearTimeout() {}, setTimeout: fn => { timers.push(fn); return timers.length; },
    apiJson: async (url, options) => { requests.push({ url, options }); return { attemptId: 'fixture' }; },
    closeLoginModal: () => touched.push('close'), showToast: () => touched.push('toast'),
    updateLoginProviderUi() {}, console,
  });
  loadFunctions(c, flows, ['providerAuthEpoch', 'invalidateProviderAuthSession', 'isLoginAttemptCurrent', 'cancelServerLoginAttempt', 'invalidateLoginAttempt', 'beginRendererLoginAttempt', 'scheduleLoginAttemptClose', 'stopQrPoll']);
  return { c, requests, touched, timers, status };
}
test('a begin response arriving after close is cancelled rather than restoring the attempt', async () => {
  const f = rendererFixture(); let release;
  f.c.apiJson = async (url, opts) => {
    const body = JSON.parse(opts.body); f.requests.push(body);
    return body.action === 'begin' ? new Promise(resolve => { release = resolve; }) : {};
  };
  const pending = f.c.beginRendererLoginAttempt('netease');
  f.c.invalidateLoginAttempt(); release({ attemptId: 'late' });
  assert.equal(await pending, null);
  assert.equal(f.c.loginAttemptCurrent, null);
  assert.equal(f.requests.at(-1).action, 'cancel');
  assert.equal(f.requests.at(-1).attemptId, 'late');
});
test('a delayed success timer cannot close a newly opened login attempt', async () => {
  const f = rendererFixture();
  const old = await f.c.beginRendererLoginAttempt('netease');
  f.c.scheduleLoginAttemptClose(old, f.c.showToast, 420);
  await f.c.beginRendererLoginAttempt('netease');
  f.timers[0](); assert.deepEqual(f.touched, []);
});
test('closing while NetEase QR check is pending discards the late confirmation', async () => {
  const f = rendererFixture(); const attempt = await f.c.beginRendererLoginAttempt('netease');
  f.c.qrKey = 'fixture-key'; let release;
  f.c.apiJson = async url => url.includes('/qr/check') ? new Promise(resolve => { release = resolve; }) : {};
  loadFunctions(f.c, flows, ['checkQr']);
  const pending = f.c.checkQr(); f.c.invalidateLoginAttempt();
  release({ code: 803, loggedIn: true }); await pending;
  assert.equal(f.c.loginAttemptCurrent, null); assert.deepEqual(f.status, {}); assert.deepEqual(f.touched, []);
  assert.ok(attempt.id);
});
for (const provider of ['netease', 'qq', 'kugou']) test(provider + ' official-window result arriving after close never submits its cookie', async () => {
  const f = rendererFixture(provider); let release;
  f.c.window.desktopWindow = { isDesktop: true, openNeteaseMusicLogin() {}, openQQMusicLogin() {}, openKugouMusicLogin() {} };
  f.c.inlineLoginQrSupported = () => true;
  f.c.qqLoginStatus = null;
  f.c.openProviderLoginWithInlineQr = () => new Promise(resolve => { release = resolve; });
  const fn = provider === 'netease' ? 'openNeteaseWebLogin' : provider === 'qq' ? 'openQQWebLogin' : 'openKugouWebLogin';
  loadFunctions(f.c, flows, [fn]);
  const pending = f.c[fn](); await settle();
  f.c.invalidateLoginAttempt(); release({ ok: true, cookie: 'fixture-late' }); await pending;
  assert.ok(f.requests.every(r => !r.url.endsWith('/cookie')));
  assert.equal(f.c.loginStatus, undefined); assert.equal(f.c.qqLoginStatus, null); assert.equal(f.c.kugouLoginStatus, undefined);
});
for (const provider of ['netease', 'qq', 'kugou']) test(provider + ' manual cookie response arriving after close cannot revive renderer state', async () => {
  const f = rendererFixture(provider); let release;
  f.c.apiJson = async (url, opts) => {
    f.requests.push({ url, options: opts });
    if (url.endsWith('/cookie')) return new Promise(resolve => { release = resolve; });
    return { attemptId: 'fixture' };
  };
  loadFunctions(f.c, flows, ['submitNeteaseCookieLogin', 'submitQQCookieLogin']);
  const pending = f.c.submitQQCookieLogin('fixture-cookie'); await settle();
  f.c.invalidateLoginAttempt(); release({ loggedIn: true, userId: 'fixture' }); await pending;
  assert.equal(f.c.loginStatus, undefined); assert.equal(f.c.qqLoginStatus, undefined); assert.equal(f.c.kugouLoginStatus, undefined);
  assert.equal(f.timers.length, 0);
});
