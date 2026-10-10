'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routes = {
  '/api/kugou/song/like': ['kugou', 'handleKugouLikeToggle'],
  '/api/kugou/playlist/add-song': ['kugou', 'handleKugouPlaylistAddSong'],
  '/api/qishui/song/like': ['qishui', 'handleQishuiSetTrackLiked'],
  '/api/qishui/playlist/collect': ['qishui', 'handleQishuiSetPlaylistCollected'],
  '/api/qishui/playlist/add-song': ['qishui', 'handleQishuiPlaylistAddSong'],
  '/api/qishui/album/collect': ['qishui', 'handleQishuiSetAlbumCollected'],
  '/api/qishui/song/comments': ['qishui', 'handleQishuiCreateComment'],
};
function fixture(route, waitAt) {
  const [provider, method] = routes[route], sends = [], writes = []; let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const c = vm.createContext({ console: { warn() {}, error() {} }, userCookie: 'n-A', qqCookie: 'qq-A',
    kugouCookie: 'kg-A', qishuiCookie: 'qs-A', loginSessionGeneration: { netease: 0, qq: 0, kugou: 0, qishui: 0 },
    readRequestBody: async () => { if (waitAt === 'body') await gate; return { id: '1', pid: '10', content: 'text', song: { id: '1', hash: 'hash' } }; },
    sendJSON: (_res, payload, status = 200) => sends.push({ payload, status }), kugouCookieHasPlayback: () => true,
  });
  for (const name of ['captureProviderAccountSession', 'checkProviderAccountSession']) {
    if (source.includes('function ' + name + '(')) loadFunctions(c, 'server.js', [name]);
  }
  c[method] = async (...params) => { writes.push(params); if (waitAt === 'upstream') await gate; return { success: true }; };
  const first = source.indexOf("  if (pn === '" + route + "') {");
  const last = source.indexOf("  if (pn === '", first + 1);
  vm.runInContext('async function route(req, res, url) { const pn = ' + JSON.stringify(route) + ';\n' + source.slice(first, last) + '\n}', c);
  const pending = c.route({ method: 'POST' }, {}, new URL('http://127.0.0.1' + route + '?id=1&pid=10'));
  return { c, provider, writes, sends, pending, resume };
}
for (const route of Object.keys(routes)) {
  for (const waitAt of ['body', 'upstream']) test(route + ' is isolated when account changes during ' + waitAt, async () => {
    const f = fixture(route, waitAt);
    await new Promise(setImmediate);
    f.c[f.provider + 'Cookie'] = f.provider === 'kugou' ? 'kg-B' : 'qs-B';
    f.c.loginSessionGeneration[f.provider] += 1; f.resume(); await f.pending;
    if (waitAt === 'body') assert.equal(f.writes.length, 0, JSON.stringify(f.writes));
    else { assert.equal(f.writes.length, 1); assert.equal(f.writes[0].at(-1), f.provider === 'kugou' ? 'kg-A' : 'qs-A'); }
    assert.equal(f.sends[0].status, 409);
  });
}
