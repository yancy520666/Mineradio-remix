'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function route(extra) {
  const context = vm.createContext({ console, Buffer, URL, AbortController, setTimeout, clearTimeout,
    AUDIO_SPILL_DIR: '/isolated-unused', audioProxyHeadersFor: () => ({}), audioContentTypeForUrl: () => 'audio/flac', ...extra });
  loadFunctions(context, 'server.js', ['readStreamChunkWithTimeout', 'sendAudioBuffer']);
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = source.indexOf("  if (pn === '/api/audio') {");
  const end = source.indexOf('  // ---------- 静态资源 ----------', start);
  vm.runInContext('async function handleAudio(req,res,url) { const pn = url.pathname; ' + source.slice(start, end) + ' }', context);
  return context;
}

test('closing an audio client before upstream headers aborts fetch and never reads its returned body', { timeout: 2000 }, async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let complete;
  const done = new Promise(resolve => { complete = resolve; });
  let signal;
  let reads = 0;
  let cancels = 0;
  const context = route({ fetchPublicResource: async (_url, options) => {
    signal = options.signal; started(); await gate;
    return { status: 200, headers: new Headers(), body: {
      cancel: async () => { cancels += 1; },
      getReader: () => { reads += 1; throw new Error('must not read a closed client'); },
    } };
  } });
  const server = http.createServer(async (req, res) => { await context.handleAudio(req, res, new URL(req.url, 'http://localhost')); complete(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const req = http.get('http://127.0.0.1:' + server.address().port + '/api/audio?url=https://fixture.invalid/a.flac');
  req.on('error', () => {});
  await ready;
  req.destroy();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signal.aborted, true, 'signal is installed before upstream headers');
  release();
  await done;
  assert.equal(reads, 0);
  assert.equal(cancels, 1);
});

test('closing during an awaited stream read prevents a late chunk from reaching the relay', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let pushed = 0;
  let aborted = 0;
  let cancelled = 0;
  const context = route({ fetchPublicResource: async () => ({ status: 200, headers: new Headers(), body: { getReader: () => ({
    read: async () => { started(); return gate; }, cancel: async () => { cancelled += 1; },
  }) } }), createSpillRelay: () => ({ push: async () => { pushed += 1; }, abort: () => { aborted += 1; }, end: async () => {} }) });
  const req = new EventEmitter(); req.headers = {};
  const res = new EventEmitter(); res.writeHead = () => { res.headersSent = true; }; res.end = () => {};
  const pending = context.handleAudio(req, res, new URL('http://localhost/api/audio?url=https://fixture.invalid/a.flac'));
  await ready;
  res.destroyed = true; res.emit('close');
  release({ done: false, value: Buffer.from('late') });
  await pending;
  assert.equal(pushed, 0);
  assert(aborted > 0);
  assert(cancelled > 0);
  assert.equal(res.listenerCount('close'), 0);
  assert.equal(req.listenerCount('aborted'), 0);
});

test('decrypted audio serves suffix, open-ended, clipped and unsatisfiable ranges correctly', () => {
  const context = route({});
  const buffer = Buffer.from('0123456789');
  const respond = (range, bytes = buffer) => {
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
    context.sendAudioBuffer(res, bytes, 'audio/flac', range);
    return res;
  };
  for (const [range, text, contentRange] of [
    ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=-99', '0123456789', 'bytes 0-9/10'],
    ['bytes=4-', '456789', 'bytes 4-9/10'], ['bytes=8-100', '89', 'bytes 8-9/10'],
    ['bytes=0-0', '0', 'bytes 0-0/10'],
  ]) {
    const res = respond(range);
    assert.equal(res.status, 206);
    assert.equal(res.body.toString(), text);
    assert.equal(res.headers['Content-Length'], text.length);
    assert.equal(res.headers['Content-Range'], contentRange);
  }
  for (const range of ['bytes=-0', 'bytes=10-', 'bytes=9-2', 'bytes=999999999999999999999-']) {
    const res = respond(range);
    assert.equal(res.status, 416);
    assert.equal(res.headers['Content-Range'], 'bytes */10');
  }
  assert.equal(respond('bytes=-3', Buffer.alloc(0)).status, 416);
  assert.equal(respond('', Buffer.alloc(0)).status, 200);
  assert.equal(respond('bytes=-').status, 200, 'malformed ranges are ignored');
  assert.equal(respond('bytes=0-1,3-4').status, 200, 'unsupported multipart ranges are ignored');
});

test('an upstream stream error cancels the owned reader even when response close is deferred', async () => {
  let signal;
  let cancelled = 0;
  let aborted = 0;
  const context = route({ console: { error: () => {} }, fetchPublicResource: async (_url, options) => {
    signal = options.signal;
    return { status: 200, headers: new Headers(), body: { getReader: () => ({
      read: async () => { throw new Error('truncated upstream'); }, cancel: async () => { cancelled += 1; },
    }) } };
  }, createSpillRelay: () => ({ abort: () => { aborted += 1; } }) });
  const req = new EventEmitter(); req.headers = {};
  const res = new EventEmitter(); res.writeHead = () => { res.headersSent = true; };
  res.destroy = () => { res.destroyed = true; setImmediate(() => res.emit('close')); };
  await context.handleAudio(req, res, new URL('http://localhost/api/audio?url=https://fixture.invalid/a.flac'));
  assert.equal(signal.aborted, true);
  assert(cancelled > 0);
  assert.equal(aborted, 1);
  assert.equal(res.destroyed, true);
});
