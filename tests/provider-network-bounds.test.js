'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function requester(provider) {
  const c = vm.createContext({ URL, Buffer, http, https, setTimeout, clearTimeout });
  loadFunctions(c, provider + '-api.js', provider === 'qishui'
    ? ['requestTextWithMeta', 'requestText', 'requestJson'] : ['requestText', 'requestJson']);
  return c;
}
async function localServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return 'http://127.0.0.1:' + server.address().port + '/';
}

for (const provider of ['kugou', 'qishui']) {
  test(provider + ' rejects both declared and streamed oversized metadata', async t => {
    for (const declared of [true, false]) {
      const url = await localServer(t, (_req, res) => {
        res.writeHead(200, declared ? { 'Content-Length': 32 } : {});
        res.end('x'.repeat(32));
      });
      await assert.rejects(requester(provider).requestText(url, { maxBytes: 16 }), { code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
    }
  });
  test(provider + ' retains bounded HTTP challenge bodies', async t => {
    const challenge = '{"code":30020,"verification_required":true}';
    const url = await localServer(t, (_req, res) => { res.writeHead(403); res.end(challenge); });
    await assert.rejects(requester(provider).requestText(url), e => e.statusCode === 403 && e.body === challenge);
    await assert.rejects(requester(provider).requestText(url, { maxBytes: 10 }),
      e => e.code === 'UPSTREAM_RESPONSE_TOO_LARGE' && e.statusCode === 403 && e.body === challenge.slice(0, 10));
  });
  test(provider + ' cancellation closes requests before headers and during body reads', async t => {
    for (const headers of [false, true]) {
      let ready;
      const started = new Promise(resolve => { ready = resolve; });
      const url = await localServer(t, (_req, res) => { if (headers) { res.writeHead(200); res.write('{'); } ready(); });
      const controller = new AbortController();
      const pending = requester(provider).requestText(url, { signal: controller.signal, timeoutMs: 1000 });
      const rejected = assert.rejects(pending, { name: 'AbortError', code: 'ABORT_ERR' });
      await started; controller.abort(); await rejected;
      await assert.rejects(requester(provider).requestText(url, { signal: controller.signal }), { name: 'AbortError' });
    }
  });
  test(provider + ' valid large metadata, truncation and total deadline preserve contracts', async t => {
    const body = JSON.stringify({ lyric: 'a'.repeat(1024 * 1024) });
    const normal = await localServer(t, (_req, res) => res.end(body));
    assert.equal((await requester(provider).requestJson(normal)).lyric.length, 1024 * 1024);
    const truncated = await localServer(t, (_req, res) => {
      res.writeHead(200, { 'Content-Length': 100 }); res.write('{'); setTimeout(() => res.socket.destroy(), 10);
    });
    await assert.rejects(requester(provider).requestText(truncated), /aborted|中断|incomplete/i);
    const trickle = await localServer(t, (_req, res) => {
      const timer = setInterval(() => res.write(' '), 10); res.on('close', () => clearInterval(timer));
    });
    const start = Date.now();
    await assert.rejects(requester(provider).requestText(trickle, { timeoutMs: 260 }), /timeout|超时/i);
    assert(Date.now() - start < 700);
  });
}
