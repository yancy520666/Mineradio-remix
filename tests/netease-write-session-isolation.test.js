'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routes = {
  '/api/album/subscribe': 'album_sub', '/api/playlist/subscribe': 'playlist_subscribe',
  '/api/playlist/create': 'playlist_create', '/api/playlist/add-song': 'playlist_tracks',
  '/api/song/comments': 'comment', '/api/song/comments/like': 'comment_like',
};
function fixture(route, waitAt) {
  const sends = [], writes = []; let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const c = vm.createContext({ console: { warn() {}, error() {} }, userCookie: 'MUSIC_U=fixture-A',
    loginSessionGeneration: { netease: 0 },
    getLoginInfo: async () => { if (waitAt === 'login') await gate; return { loggedIn: true, userId: 111 }; },
    readRequestBody: async () => { if (waitAt === 'body') await gate; return { id: '1', pid: '10', name: 'test', content: 'text', commentId: '2' }; },
    sendJSON: (_res, payload, status = 200) => sends.push({ payload, status }),
    normalizeApiCode: r => r.body.code, normalizeApiMessage: () => '', invalidateNeteasePlaylistTrackIndex() {},
  });
  loadFunctions(c, 'server.js', ['requireLogin']);
  for (const name of ['captureNeteaseAccountSession', 'checkNeteaseAccountSession']) {
    if (source.includes('function ' + name + '(')) loadFunctions(c, 'server.js', [name]);
  }
  for (const method of Object.values(routes)) c[method] = async params => { writes.push(params); return { body: { code: 200, playlist: {} } }; };
  const first = source.indexOf("  if (pn === '" + route + "') {");
  const last = source.indexOf("  if (pn === '", first + 1);
  vm.runInContext('async function route(req, res, url) { const pn = ' + JSON.stringify(route) + ';\n' + source.slice(first, last) + '\n}', c);
  const pending = c.route({ method: 'POST' }, {}, new URL('http://127.0.0.1' + route + '?id=1&commentId=2'));
  return { c, writes, sends, pending, resume };
}
for (const route of Object.keys(routes)) {
  for (const waitAt of ['login', 'body']) test(route + ' cannot submit A operation using B after waiting for ' + waitAt, async () => {
    const f = fixture(route, waitAt);
    await new Promise(setImmediate);
    f.c.userCookie = 'MUSIC_U=fixture-B'; f.c.loginSessionGeneration.netease += 1;
    f.resume(); await f.pending;
    assert.equal(f.writes.length, 0, JSON.stringify(f.writes));
    assert.equal(f.sends[0].status, 409);
  });
}
