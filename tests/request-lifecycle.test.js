'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function requester() {
  const context = vm.createContext({ URL, Buffer, http, https, setTimeout, clearTimeout });
  loadFunctions(context, 'server.js', ['requestText', 'requestJson']);
  return context;
}

async function localServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return 'http://127.0.0.1:' + server.address().port + '/';
}

test('JSON request settles when an upstream truncates its response body', { timeout: 1500 }, async t => {
  const url = await localServer(t, (_req, res) => {
    res.writeHead(200, { 'Content-Length': 100 });
    res.write('{');
    setTimeout(() => res.socket.destroy(), 15);
  });
  await assert.rejects(requester().requestJson(url, { timeoutMs: 1000 }), { code: 'UPSTREAM_RESPONSE_ABORTED' });
});

test('a continuously trickling body still hits the total deadline', { timeout: 1500 }, async t => {
  let upstreamClosed = false;
  const url = await localServer(t, (_req, res) => {
    res.writeHead(200);
    const timer = setInterval(() => res.write(' '), 10);
    res.once('close', () => { clearInterval(timer); upstreamClosed = true; });
  });
  const start = Date.now();
  await assert.rejects(requester().requestText(url, { timeoutMs: 80 }), { code: 'REQUEST_TIMEOUT' });
  assert(Date.now() - start < 500, 'deadline applies to the full request rather than resetting on every chunk');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert(upstreamClosed, 'deadline closes the upstream socket');
});

test('AbortSignal stops requests before headers and while reading the body', { timeout: 2000 }, async t => {
  for (const sendHeaders of [false, true]) {
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const url = await localServer(t, (_req, res) => {
      if (sendHeaders) { res.writeHead(200); res.write('{'); }
      started();
    });
    const controller = new AbortController();
    const pending = requester().requestText(url, { timeoutMs: 1000, signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError', code: 'ABORT_ERR' });
    await ready;
    controller.abort();
    await rejected;
    await assert.rejects(requester().requestText(url, { signal: controller.signal }), { name: 'AbortError' });
  }
});

test('bounded text requests reject declared and streamed oversized bodies', { timeout: 1500 }, async t => {
  for (const declared of [true, false]) {
    const url = await localServer(t, (_req, res) => {
      res.writeHead(200, declared ? { 'Content-Length': 32 } : {});
      res.end('x'.repeat(32));
    });
    await assert.rejects(requester().requestText(url, { maxBytes: 16 }), { code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
  }
});

test('HTTP error responses retain challenge bodies and oversized errors remain bounded', async t => {
  const challenge = '{"code":20017,"verification_required":true}';
  const url = await localServer(t, (_req, res) => { res.writeHead(403); res.end(challenge); });
  await assert.rejects(requester().requestText(url), error => error.statusCode === 403 && error.body === challenge);
  await assert.rejects(requester().requestText(url, { maxBytes: 10 }), error => error.code === 'UPSTREAM_RESPONSE_TOO_LARGE' && error.statusCode === 403 && error.body === challenge.slice(0, 10));
});

test('successful JSON and malformed JSON keep their existing behavior', async t => {
  let body = '{"ok":true}';
  const url = await localServer(t, (_req, res) => res.end(body));
  assert.equal((await requester().requestJson(url)).ok, true);
  body = '{';
  await assert.rejects(requester().requestJson(url), /Invalid JSON/);
});
