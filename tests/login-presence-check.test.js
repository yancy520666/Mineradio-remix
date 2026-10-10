'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const settle = () => new Promise(resolve => setImmediate(resolve));

// Loads the real account modules with a scripted /api/login/status. Timers are
// collected instead of run so each confirmation step is explicit.
function renderer(replies) {
  const notices = [];
  const timers = [];
  const calls = [];
  const context = vm.createContext({
    console: { warn() {} },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => null, hidden: false, addEventListener() {} },
    window: { addEventListener() {} },
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    PROVIDER_VIP_AUDIT_STORE_KEY: 'audit',
    apiJson: async url => {
      calls.push(url);
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    showToast: value => notices.push(value),
    escHtml: String,
    updateLikeButtons() {},
    renderUserBtn() {},
    loginStatus: { loggedIn: true, userId: 7, nickname: 'fixture' },
    loginWorkflowVerifiedSession: { netease: true, qq: true },
    qqLoginStatus: { provider: 'qq', loggedIn: true, userId: '1' },
    kugouLoginStatus: { loggedIn: false }, qishuiLoginStatus: { loggedIn: false }, spotifyLoginStatus: { loggedIn: false },
    qqLoginWasLoggedIn: true, dualAccountMode: false, miniQueueOpen: false,
    neteasePlaylists: [{ provider: 'netease' }], qqPlaylists: [], kugouPlaylists: [], qishuiPlaylists: [], spotifyPlaylists: [],
    builtInPlaylists: [], userPlaylists: [{ provider: 'netease' }], myPodcastCollections: [], myPodcastItems: {}, likedSongMap: {},
    playlistCatalogRevision: 0, homeDiscoverState: { loaded: true }, activeAccountProvider: 'netease',
  });
  for (const file of ['01-login-modal-utils.js', '02-login-status.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'public/js/modules/08-account', file), 'utf8'), context);
  }
  context.loggedProviderCount = () => 0;
  return { ctx: context, notices, timers, calls };
}

test('NetEase stays connected when the online check cannot reach the platform', async () => {
  const { ctx, notices, calls } = renderer([new Error('offline'), { loggedIn: false, hasCookie: true, unverified: true }]);
  await ctx.checkNeteaseLoginPresence('interval');
  await ctx.checkNeteaseLoginPresence('interval');
  assert.match(calls[0], /fresh=1/);
  assert.equal(ctx.loginStatus.loggedIn, true);
  assert.equal(ctx.loginWorkflowVerifiedSession.netease, true);
  assert.equal(notices.length, 0);
});

test('NetEase disconnects only after the platform confirms the logout twice', async () => {
  const rejected = { loggedIn: false, hasCookie: true, sessionRejected: true };
  const { ctx, notices, timers } = renderer([rejected, rejected]);
  await ctx.checkNeteaseLoginPresence('window-focus');
  assert.equal(ctx.loginStatus.loggedIn, true, 'one reply is not enough');
  assert.equal(timers.length, 1, 'a confirmation check is scheduled');
  timers[0]();
  await settle();
  assert.equal(ctx.loginStatus.loggedIn, false);
  assert.equal(ctx.loginWorkflowVerifiedSession.netease, undefined, 'the login wire is unplugged');
  assert.equal(ctx.neteasePlaylists.length, 0);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /别处退出/);
});

test('NetEase recovers when the confirmation finds the session alive', async () => {
  const { ctx, notices, timers } = renderer([
    { loggedIn: false, hasCookie: true, sessionRejected: true },
    { loggedIn: true, userId: 7, nickname: 'fixture' },
  ]);
  await ctx.checkNeteaseLoginPresence('interval');
  timers[0]();
  await settle();
  assert.equal(ctx.loginStatus.loggedIn, true);
  assert.equal(ctx.loginPresenceState.netease.rejected, 0);
  assert.equal(notices.length, 0);
});

test('QQ treats "not logged in" from QQ as a logout only on the second reply', () => {
  const { ctx, timers } = renderer([]);
  const reply = { provider: 'qq', loggedIn: true, sessionRejected: true, userId: '1' };
  assert.equal(ctx.applyQQSessionRejection(reply).loggedIn, true);
  assert.equal(timers.length, 1);
  const confirmed = ctx.applyQQSessionRejection(reply);
  assert.equal(confirmed.loggedIn, false);
  assert.equal(confirmed.reauthRequired, true);
  assert.equal(ctx.applyQQSessionRejection({ provider: 'qq', loggedIn: true }).loggedIn, true);
  assert.equal(ctx.loginPresenceState.qq.rejected, 0);
});

const { loadFunctions } = require('./helpers/classic-functions');
function serverPresenceFixture(code = 301) {
  const saved = [];
  const c = vm.createContext({ console: { warn() {} }, userCookie: 'fixture-session',
    NETEASE_LOGIN_INFO_CACHE_TTL_MS: 30000,
    neteaseLoginInfoCache: { cookie: '', at: 0, value: null, promise: null },
    login_status: async () => { if (code === 'offline') throw new Error('offline'); return { body: { code: 301 } }; },
    user_account: async () => { if (code === 'offline') throw new Error('offline'); return { body: { code } }; },
    promiseWithTimeout: promise => promise, normalizeLoginInfo: () => ({ loggedIn: false }),
    saveCookie: value => { saved.push(value); c.userCookie = value; c.neteaseLoginInfoCache = { cookie: '', at: 0, value: null, promise: null }; },
  });
  loadFunctions(c, 'server.js', ['normalizeApiCode', 'normalizeApiMessage', 'isNeteaseAuthInvalidPayload', 'fetchNeteaseLoginInfo', 'getLoginInfo']);
  return { c, saved };
}
test('real server replies preserve credentials so the second confirmation can unplug the wire', async () => {
  const server = serverPresenceFixture();
  const ui = renderer([]);
  ui.ctx.apiJson = () => server.c.getLoginInfo({ fresh: true });
  await ui.ctx.checkNeteaseLoginPresence('interval');
  assert.equal(ui.ctx.loginStatus.loggedIn, true);
  assert.equal(server.c.userCookie, 'fixture-session', 'a status probe must not delete persisted credentials');
  ui.timers[0](); await settle();
  assert.equal(ui.ctx.loginStatus.loggedIn, false);
  assert.equal(ui.ctx.loginWorkflowVerifiedSession.netease, undefined);
  assert.equal(ui.notices.length, 1);
  assert.equal(server.saved.length, 0);
});
test('real server network failure cannot unplug an existing session or erase its cookie', async () => {
  const server = serverPresenceFixture('offline'), ui = renderer([]);
  ui.ctx.apiJson = () => server.c.getLoginInfo({ fresh: true });
  await ui.ctx.checkNeteaseLoginPresence('interval'); await ui.ctx.checkNeteaseLoginPresence('interval');
  assert.equal(ui.ctx.loginStatus.loggedIn, true);
  assert.equal(server.saved.length, 0);
});
