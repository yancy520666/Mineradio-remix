'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js'), 'utf8');
const settle = () => new Promise(setImmediate);
function fixture() {
  const listeners = {}, requests = [], notices = [];
  const epochs = { netease: 0, qishui: 0, kugou: 0 };
  const c = vm.createContext({ console: { warn() {} },
    window: { addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } },
    document: { getElementById: () => null },
    songProviderKey: song => song.provider || 'netease',
    providerAuthEpoch: provider => epochs[provider] || 0,
    apiJson: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    loginStatus: { loggedIn: true, userId: 111 }, qishuiLoginStatus: { loggedIn: true, userId: '111', webSession: true },
    kugouLoginStatus: { loggedIn: true, userId: '111', playbackKeyReady: true }, qqLoginStatus: { loggedIn: false },
    likedSongMap: {}, likeBusyMap: {}, likeStatusToken: 0, collectBusy: false, miniQueueOpen: false,
    playQueue: [], currentIdx: -1, currentLocalSong: null, $results: null,
    safeRenderQueuePanel() {}, showToast: text => notices.push(text), setTimeout, clearTimeout,
  });
  vm.runInContext(source, c);
  c.refreshSearchResultActionStates = () => {};
  const changed = provider => {
    epochs[provider] = (epochs[provider] || 0) + 1;
    for (const fn of listeners['provider-auth-session-changed'] || []) fn({ detail: { provider } });
  };
  return { c, requests, notices, changed };
}

test('late liked-state GET from A cannot populate B after an authorization change', async () => {
  const f = fixture();
  f.c.syncLikeStatusForSongs([{ provider: 'qishui', id: '1' }]);
  f.changed('qishui'); f.c.qishuiLoginStatus.userId = '222';
  f.requests[0].resolve({ liked: { '1': true } }); await settle();
  assert.equal(f.c.likedSongMap['qishui:1'], undefined);
});
test('an old like POST completion neither overwrites B nor releases B busy ownership', async () => {
  const f = fixture(), song = { provider: 'netease', id: '1' };
  const old = f.c.toggleLikeSong(song);
  f.changed('netease'); f.c.loginStatus.userId = 222;
  const fresh = f.c.toggleLikeSong(song);
  assert.equal(f.requests.length, 2, 'a switched account must not inherit the old busy flag');
  f.requests[0].resolve({ liked: false }); await old;
  assert.equal(f.c.likedSongMap['netease:1'], true);
  assert(f.c.likeBusyMap['netease:1'], 'only the new owner may release busy');
  f.requests[1].resolve({ liked: true }); await fresh;
  assert.equal(f.c.likeBusyMap['netease:1'], undefined);
});
test('auth change clears only that provider liked and album states; old album reads stay discarded', async () => {
  const f = fixture();
  f.c.likedSongMap = { 'netease:1': true, 'qishui:2': true };
  f.c.detailAlbumCollectionState = { 'netease:10': true, 'qishui:20': true };
  f.c.syncAlbumCollectionState({ provider: 'netease', id: 1, albumId: 10 });
  f.changed('netease');
  f.requests[0].resolve({ subscribed: { '10': true } }); await settle();
  assert.equal(f.c.likedSongMap['netease:1'], undefined);
  assert.equal(f.c.detailAlbumCollectionState['netease:10'], undefined);
  assert.equal(f.c.likedSongMap['qishui:2'], true);
  assert.equal(f.c.detailAlbumCollectionState['qishui:20'], true);
});
