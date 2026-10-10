'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture(requestJson) {
  const c = vm.createContext({ URL, normalizeText: value => String(value || '').trim(), requestJson,
    qishuiHeadersWithCookie: (headers, cookie) => ({ ...headers, Cookie: cookie }), QISHUI_WEB_UA: 'fixture',
    pickObject: (...values) => values.find(v => v && typeof v === 'object' && !Array.isArray(v)) || {},
    pickArray: (...values) => values.find(Array.isArray) || [], qishuiStreamFromObject: item => item,
    qishuiStreamForRequestedQuality: streams => streams[0], qishuiBestStreamCandidate: streams => streams[0],
  });
  loadFunctions(c, 'qishui-api.js', ['fetchQishuiPlayerInfo']);
  return c;
}
test('PC player-info never sends even fixture credentials to loopback or plaintext HTTP', async t => {
  let receivedCookie = '';
  const server = http.createServer((req, res) => { receivedCookie = req.headers.cookie || ''; res.end('{}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const c = fixture((url, options) => new Promise((resolve, reject) => {
    http.get(url, { headers: options.headers }, response => { response.resume(); response.on('end', () => resolve({})); }).on('error', reject);
  }));
  let error;
  try { await c.fetchQishuiPlayerInfo('http://127.0.0.1:' + server.address().port + '/player-info', 'sessionid=fixture-only', {}); }
  catch (err) { error = err; }
  assert.equal(receivedCookie, '', 'loopback received: ' + receivedCookie);
  assert.equal(error && error.code, 'QISHUI_PLAYER_INFO_URL_REJECTED');
});
test('only the known HTTPS VOD origin is accepted, and VOD receives no account Cookie', async () => {
  const requests = [];
  const c = fixture(async (url, options) => { requests.push({ url, options }); return { Result: { Data: { PlayInfoList: [{ url: 'https://audio.example/song' }] } } }; });
  for (const url of ['https://other.invalid/player', 'https://vod-luna.douyin.com.other.invalid/player',
    'http://vod-luna.douyin.com/player', 'https://fixture:fake@vod-luna.douyin.com/player',
    'https://vod-luna.douyin.com:444/player', 'https://127.0.0.1/player']) {
    await assert.rejects(c.fetchQishuiPlayerInfo(url, 'sessionid=fixture-only', {}), { code: 'QISHUI_PLAYER_INFO_URL_REJECTED' });
  }
  assert.equal(requests.length, 0);
  const stream = await c.fetchQishuiPlayerInfo('https://vod-luna.douyin.com/player', 'sessionid=fixture-only', {});
  assert.equal(stream.url, 'https://audio.example/song');
  assert.equal(requests[0].options.headers.Cookie, undefined);
});
