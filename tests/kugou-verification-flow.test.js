'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { loadFunctions } = require('./helpers/classic-functions');
const file = 'public/js/modules/08-account/03-login-modal-flows.js';
function harness(open) {
  const calls = [], messages = [];
  const c = vm.createContext({ kugouVerificationBusy: false, loginAttemptCurrent: null,
    beginRendererLoginAttempt: async () => { const a = { id: 'fixture' }; c.loginAttemptCurrent = a; return a; },
    isLoginAttemptCurrent: a => a === c.loginAttemptCurrent,
    window: { desktopWindow: { isDesktop: true, openKugouMusicLogin: async options => { calls.push(options); return open(options); } } },
    showToast: message => messages.push(message) });
  loadFunctions(c, file, ['openKugouSecurityVerification']);
  return { c, calls, messages };
}
test('security challenge opens a visible official window and never treats close or cookie as success', async () => {
  const { c, calls, messages } = harness(async () => ({ closed: true, retryRequired: true, cookie: 'synthetic-website-cookie' }));
  assert.equal(await c.openKugouSecurityVerification({ restriction: { verificationUrl: 'https://www.kugou.com/check' } }), false);
  assert.equal(calls[0].verification, true);
  assert.equal(calls[0].inline, false);
  assert.equal(calls[0].nativeQr, false);
  assert.equal(calls[0].verificationUrl, 'https://www.kugou.com/check');
  assert.equal(calls[0].forceReauth, undefined);
  assert.match(messages[0], /重试/);
  assert.equal(c.kugouVerificationBusy, false);
});
test('concurrent challenges share one window and a failure permits a later explicit retry', async () => {
  let finish;
  const { c, calls } = harness(() => new Promise(resolve => { finish = resolve; }));
  const pending = c.openKugouSecurityVerification({});
  assert.equal(await c.openKugouSecurityVerification({}), false);
  assert.equal(calls.length, 1);
  finish({ error: 'failed' }); await pending;
  assert.equal(c.kugouVerificationBusy, false);
});
test('bridge exception and browser-only mode do not leave verification busy', async () => {
  const { c, messages } = harness(async () => { throw new Error('offline'); });
  await c.openKugouSecurityVerification({});
  assert.equal(c.kugouVerificationBusy, false);
  c.window.desktopWindow = null;
  await c.openKugouSecurityVerification({});
  assert.match(messages.at(-1), /桌面版/);
});
test('foreground Kugou verification is handled before automatic source fallback', () => {
  const source = fs.readFileSync('public/js/modules/05-playback/13-playback-start-audio.js', 'utf8');
  const start = source.indexOf("if (isKugouPlayback && playbackRestrictionRawCategory(song, data) === 'verification_required')");
  assert.ok(start > 0);
  const end = source.indexOf('var fallbackResult = await tryAutoPlaybackFallback', start);
  assert.ok(end > start);
  assert.match(source.slice(start, end), /openKugouSecurityVerification\(data\)/);
  assert.match(source.slice(start, end), /return false;/);
});
test('native login challenge reaches visible verification without saving cookies or claiming login', async () => {
  const { c, calls, messages } = harness(async () => ({ retryRequired: true }));
  const status = {};
  Object.assign(c, { kugouWebLoginBusy: false, document: { getElementById: () => status },
    updateLoginProviderUi() {}, inlineLoginQrSupported: () => true,
    openProviderLoginWithInlineQr: async () => ({ verificationRequired: true, verificationUrl: 'https://www.kugou.com/verify' }),
    apiJson: async () => { assert.fail('challenge must not save a login cookie'); } });
  loadFunctions(c, file, ['openKugouWebLogin']);
  await c.openKugouWebLogin();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verification, true);
  assert.equal(c.kugouWebLoginBusy, false);
  assert.match(status.textContent, /安全验证/);
  assert.ok(messages.every(message => !/已登录|验证成功/.test(message)));
});
test('post-scan account probe challenge is surfaced instead of reported as login success', async () => {
  const { c, calls } = harness(async () => ({ retryRequired: true }));
  const status = {};
  Object.assign(c, { kugouWebLoginBusy: false, document: { getElementById: () => status },
    updateLoginProviderUi() {}, inlineLoginQrSupported: () => true,
    openProviderLoginWithInlineQr: async () => ({ ok: true, cookie: 'synthetic-client-cookie' }),
    apiJson: async () => ({ loggedIn: true, verificationRequired: true, verificationUrl: 'https://www.kugou.com/check' }),
    renderUserBtn: () => assert.fail('not a verified login'),
    markProviderLoginConnected: () => assert.fail('not a verified login') });
  loadFunctions(c, file, ['openKugouWebLogin']);
  await c.openKugouWebLogin();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verificationUrl, 'https://www.kugou.com/check');
  assert.equal(c.kugouWebLoginBusy, false);
});
test('status polling prompts once per challenge episode rather than reopening every poll', async () => {
  let challenge = true, prompts = 0;
  const c = vm.createContext({ console, Date, kugouStatusVerificationPrompted: false,
    apiJson: async () => ({ loggedIn: true, verificationRequired: challenge }),
    kugouLoginStatus: { loggedIn: true }, normalizeKugouLoginStatus: x => x,
    auditProviderVipState() {}, renderUserBtn() {},
    openKugouSecurityVerification: () => { prompts++; },
    userPlaylists: [{ provider: 'kugou' }], kugouLoginWasLoggedIn: true,
    activeAccountProvider: 'kugou', hasPlatformLogin: () => true });
  loadFunctions(c, 'public/js/modules/08-account/02-login-status.js', ['refreshKugouLoginStatus']);
  await c.refreshKugouLoginStatus(); await c.refreshKugouLoginStatus();
  assert.equal(prompts, 1);
  challenge = false; await c.refreshKugouLoginStatus();
  challenge = true; await c.refreshKugouLoginStatus();
  assert.equal(prompts, 2);
});
test('late status challenge cannot reopen a window after logout or account replacement', async () => {
  let finish;
  const loggedOut = { loggedIn: false };
  const c = vm.createContext({ Date, kugouLoginStatus: { loggedIn: true },
    apiJson: () => new Promise(resolve => { finish = resolve; }),
    openKugouSecurityVerification: () => assert.fail('stale challenge must not open') });
  loadFunctions(c, 'public/js/modules/08-account/02-login-status.js', ['refreshKugouLoginStatus']);
  const pending = c.refreshKugouLoginStatus();
  c.kugouLoginStatus = loggedOut;
  finish({ loggedIn: true, verificationRequired: true });
  assert.equal(await pending, loggedOut);
});
test('a playback challenge overrides previously ready playback credentials in UI state', () => {
  const c = vm.createContext({ kugouLoginStatus: { loggedIn: true, playbackReady: true, playbackKeyReady: true },
    normalizeKugouLoginStatus: x => x, renderUserBtn() {}, kugouLoginWasLoggedIn: true });
  loadFunctions(c, 'public/js/modules/08-account/02-login-status.js', ['applyKugouPlaybackStatusEvidence']);
  c.applyKugouPlaybackStatusEvidence({ provider: 'kugou', loggedIn: true, reason: 'verification_required', playbackReady: true });
  assert.equal(c.kugouLoginStatus.playbackKeyReady, false);
  assert.equal(c.kugouLoginStatus.playbackReady, false);
  assert.equal(c.kugouLoginStatus.verificationRequired, true);
});
