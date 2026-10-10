'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules/08-account/02-login-status.js'), 'utf8');
const providers = [
  ['netease', 'loginStatus', 'refreshLoginStatus'],
  ['qq', 'qqLoginStatus', 'refreshQQLoginStatus'],
  ['kugou', 'kugouLoginStatus', 'refreshKugouLoginStatus'],
  ['qishui', 'qishuiLoginStatus', 'refreshQishuiLoginStatus'],
];

function fixture(provider) {
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const effects = [];
  const epochs = { netease: 0, qq: 0, kugou: 0, qishui: 0 };
  const c = vm.createContext({
    console: { warn() {} }, document: { hidden: false, getElementById: () => null },
    localStorage: { getItem: () => null, setItem() {} },
    apiJson: () => pending, providerAuthEpoch: p => epochs[p],
    loginStatus: { loggedIn: true, userId: 'A', nickname: 'A' },
    qqLoginStatus: { loggedIn: true, userId: 'A', nickname: 'A' },
    kugouLoginStatus: { loggedIn: true, userId: 'A', nickname: 'A' },
    qishuiLoginStatus: { loggedIn: true, webSession: true, userId: 'A', nickname: 'A' },
    spotifyLoginStatus: { loggedIn: false },
    loginStatusChecked: false, loginStatusCheckFailed: false,
    qqLoginWasLoggedIn: true, kugouLoginWasLoggedIn: true, qishuiLoginWasLoggedIn: true,
    neteasePlaylists: [], qqPlaylists: [], kugouPlaylists: [], qishuiPlaylists: [], spotifyPlaylists: [],
    builtInPlaylists: [], userPlaylists: providers.map(([p]) => ({ provider: p })),
    myPodcastCollections: [], myPodcastItems: {}, likedSongMap: {},
    playlistCatalogRevision: 0, homeDiscoverState: { loaded: true },
    playQueue: [], playlist: [], activeAccountProvider: provider,
    hasPlatformLogin: () => true, firstLoggedProvider: () => provider,
    refreshUserPlaylists: () => effects.push('playlists'), loadHomeDiscover: () => effects.push('home'),
    syncLikeStatusForSongs: () => effects.push('likes'), updateLikeButtons: () => effects.push('buttons'),
  });
  vm.runInContext(source, c, { filename: '02-login-status.js' });
  c.auditProviderVipState = () => effects.push('audit');
  c.renderUserBtn = () => effects.push('render');
  c.showToast = () => effects.push('toast');
  c.applyQQSessionRejection = info => info;
  return { c, epochs, effects, resolve, reject };
}

for (const [provider, statusName, method] of providers) {
  test(`${provider} late status success cannot overwrite a newer login attempt`, async () => {
    const f = fixture(provider), initial = f.c[statusName];
    const task = f.c[method]();
    // beginRendererLoginAttempt increments the epoch before the old status object
    // is replaced. Object-identity checks alone do not own this pending read.
    f.epochs[provider] += 1;
    f.resolve({ loggedIn: true, webSession: true, userId: 'obsolete', nickname: 'obsolete', isVip: true });
    await task;
    assert.equal(f.c[statusName], initial);
    assert.equal(f.effects.length, 0);
  });
  test(`${provider} late status failure cannot degrade a newer account`, async () => {
    const f = fixture(provider);
    const task = f.c[method]();
    f.epochs[provider] += 1;
    const next = { loggedIn: true, webSession: true, userId: 'B', nickname: 'B', stale: false };
    f.c[statusName] = next;
    f.reject(new Error('old request failed'));
    await task;
    assert.equal(f.c[statusName], next);
    assert.equal(f.c.loginStatusCheckFailed, false);
    assert.equal(f.effects.length, 0);
  });
}

test('NetEase presence read ignores a previous epoch even when the user ID is unchanged', async () => {
  const f = fixture('netease');
  const task = f.c.checkNeteaseLoginPresence('interval');
  f.epochs.netease += 1;
  const current = { loggedIn: true, userId: 'A', nickname: 'new session' };
  f.c.loginStatus = current;
  f.resolve({ loggedIn: true, userId: 'A', nickname: 'old session' });
  await task;
  assert.equal(f.c.loginStatus, current);
  assert.equal(f.effects.length, 0);
});
