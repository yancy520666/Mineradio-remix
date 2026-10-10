'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function fixture({ bodyBytes = 1024, declared = true, maxBytes = 4096, cacheBytes = 1 << 20 } = {}) {
  const fetches = [];
  let releaseFetch;
  const gate = new Promise(resolve => { releaseFetch = resolve; });
  const ctx = vm.createContext({
    Buffer, setTimeout, clearTimeout, AbortController,
    qishuiAudioDecryptCache: new Map(),
    qishuiAudioDecryptInflight: new Map(),
    qishuiAudioDecryptCacheBytes: 0,
    qishuiAudioDecryptCacheGeneration: 0,
    generatedCacheGeneration: 0,
    coverCache: { clear: () => ({ bytes: 8 }) },
    neteaseSearchCache: new Map(), qqSearchCache: new Map(), typedSearchCache: new Map(),
    QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES: cacheBytes,
    QISHUI_AUDIO_ENCRYPTED_MAX_BYTES: maxBytes,
    qishuiAudioAuthFromUrl: url => ({ cleanUrl: url.split('#')[0], auth: 'fixture-key' }),
    qishuiAudioCacheKey: (url, auth) => url + '|' + auth,
    audioProxyHeadersFor: () => ({}),
    qishuiAudioDecryptor: { decrypt: ({ encryptedBuffer }) => ({ buffer: Buffer.from(encryptedBuffer), extension: '.m4a' }) },
    fetchPublicResource: async (url, options) => {
      fetches.push({ url, signal: options.signal });
      await gate;
      const bytes = new Uint8Array(bodyBytes);
      const half = bodyBytes >> 1;
      const headers = new Headers(declared ? { 'content-length': String(bodyBytes) } : {});
      return new Response(new ReadableStream({
        start(controller) { controller.enqueue(bytes.slice(0, half)); controller.enqueue(bytes.slice(half)); controller.close(); },
      }), { status: 200, headers });
    },
  });
  loadFunctions(ctx, 'server.js', ['readStreamChunkWithTimeout', 'readBoundedResponseBuffer', 'rememberQishuiDecryptedAudio', 'getQishuiDecryptedAudio', 'sendAudioBuffer', 'releaseGeneratedMemoryCaches']);
  return { ctx, fetches, releaseFetch };
}

test('concurrent Range requests share one Qishui download and keep byte accounting exact', async () => {
  const { ctx, fetches, releaseFetch } = fixture();
  const url = 'https://fixture.invalid/a.m4a#auth=x';
  const pending = [ctx.getQishuiDecryptedAudio(url), ctx.getQishuiDecryptedAudio(url), ctx.getQishuiDecryptedAudio(url)];
  releaseFetch();
  const results = await Promise.all(pending);
  assert.equal(fetches.length, 1);
  assert.equal(results[0].buffer.length, 1024);
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, 1024);
  assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
  // Re-remembering the same key replaces, never double counts.
  ctx.rememberQishuiDecryptedAudio(ctx.qishuiAudioCacheKey('https://fixture.invalid/a.m4a', 'fixture-key'), { buffer: Buffer.alloc(2048) });
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, 2048);
});

function assertCacheAccounting(ctx) {
  const actual = [...ctx.qishuiAudioDecryptCache.values()].reduce((sum, item) => sum + item.buffer.length, 0);
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, actual);
  assert(actual <= ctx.QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES);
}

test('a decrypted item larger than the entire budget is not retained, including same-key replacement', () => {
  const { ctx } = fixture({ cacheBytes: 96 });
  ctx.rememberQishuiDecryptedAudio('large', { buffer: Buffer.alloc(256) });
  assert.equal(ctx.qishuiAudioDecryptCache.size, 0);
  assertCacheAccounting(ctx);
  ctx.rememberQishuiDecryptedAudio('keep', { buffer: Buffer.alloc(32) });
  ctx.rememberQishuiDecryptedAudio('replace', { buffer: Buffer.alloc(48) });
  ctx.rememberQishuiDecryptedAudio('replace', { buffer: Buffer.alloc(256) });
  assert.deepEqual([...ctx.qishuiAudioDecryptCache.keys()], ['keep']);
  assertCacheAccounting(ctx);
  ctx.rememberQishuiDecryptedAudio('keep', { buffer: Buffer.alloc(96) });
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, 96);
  assertCacheAccounting(ctx);
  ctx.rememberQishuiDecryptedAudio('keep', { buffer: Buffer.alloc(12) });
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, 12);
  assertCacheAccounting(ctx);
});

test('cache-hit recency evicts the least recently used buffer and preserves held response references', async () => {
  const { ctx } = fixture({ cacheBytes: 96 });
  const key = url => ctx.qishuiAudioCacheKey(url, 'fixture-key');
  const a = Buffer.alloc(32, 1);
  const b = Buffer.alloc(32, 2);
  ctx.rememberQishuiDecryptedAudio(key('https://fixture.invalid/a'), { buffer: a, at: 1 });
  ctx.rememberQishuiDecryptedAudio(key('https://fixture.invalid/b'), { buffer: b, at: 2 });
  const held = await ctx.getQishuiDecryptedAudio('https://fixture.invalid/b#auth=x');
  assert.equal(held.buffer, b);
  ctx.rememberQishuiDecryptedAudio('c', { buffer: Buffer.alloc(64), at: 3 });
  assert.equal(ctx.qishuiAudioDecryptCache.has(key('https://fixture.invalid/a')), false);
  assert.equal(ctx.qishuiAudioDecryptCache.has(key('https://fixture.invalid/b')), true);
  assertCacheAccounting(ctx);
  ctx.rememberQishuiDecryptedAudio(key('https://fixture.invalid/b'), { buffer: Buffer.alloc(256) });
  assert.equal(ctx.qishuiAudioDecryptCache.has(key('https://fixture.invalid/b')), false);
  assert.equal(held.buffer, b);
  assert.equal(held.buffer[0], 2);
  assertCacheAccounting(ctx);
});

test('over-budget decrypt returns the original Buffer to all active callers without retaining it', async () => {
  const { ctx, fetches, releaseFetch } = fixture({ bodyBytes: 256, cacheBytes: 96 });
  const decrypted = Buffer.alloc(256, 7);
  ctx.qishuiAudioDecryptor.decrypt = () => ({ buffer: decrypted, extension: '.flac' });
  const url = 'https://fixture.invalid/uncached#auth=x';
  const pending = [ctx.getQishuiDecryptedAudio(url), ctx.getQishuiDecryptedAudio(url)];
  releaseFetch();
  const results = await Promise.all(pending);
  assert.equal(fetches.length, 1);
  for (const result of results) {
    assert.equal(result.buffer, decrypted);
    assert.equal(result.contentType, 'audio/flac');
  }
  const sent = {};
  const response = {
    writeHead(status, headers) { sent.status = status; sent.headers = headers; },
    end(buffer) { sent.buffer = buffer; },
  };
  ctx.sendAudioBuffer(response, results[0].buffer, results[0].contentType, '');
  assert.equal(sent.status, 200);
  assert.equal(sent.buffer, decrypted);
  ctx.sendAudioBuffer(response, results[0].buffer, results[0].contentType, 'bytes=4-11');
  assert.equal(sent.status, 206);
  assert.equal(sent.headers['Content-Range'], 'bytes 4-11/256');
  assert.deepEqual(sent.buffer, decrypted.subarray(4, 12));
  assert.equal(ctx.qishuiAudioDecryptCache.size, 0);
  assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
  assertCacheAccounting(ctx);
  assert.equal((await ctx.getQishuiDecryptedAudio(url)).buffer, decrypted);
  assert.equal(fetches.length, 2);
  assertCacheAccounting(ctx);
});

test('an aborted late response cannot overwrite a replacement request or disturb byte accounting', async () => {
  const { ctx } = fixture({ cacheBytes: 96 });
  const gates = [];
  ctx.fetchPublicResource = () => new Promise(resolve => { gates.push(resolve); });
  const response = length => ({ ok: true, headers: new Headers({ 'content-length': String(length) }), body: null, length });
  ctx.readBoundedResponseBuffer = async up => Buffer.alloc(up.length);
  const url = 'https://fixture.invalid/retry#auth=x';
  const controller = new AbortController();
  const cancelled = ctx.getQishuiDecryptedAudio(url, { signal: controller.signal });
  const rejected = assert.rejects(cancelled, { name: 'AbortError' });
  controller.abort();
  await rejected;
  const active = ctx.getQishuiDecryptedAudio(url);
  gates[1](response(48));
  const result = await active;
  gates[0](response(64));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, 48);
  assert.equal([...ctx.qishuiAudioDecryptCache.values()][0].buffer, result.buffer);
  assertCacheAccounting(ctx);
});

test('release clears retained audio accounting without mutating buffers held by active responses', async () => {
  const { ctx } = fixture({ cacheBytes: 96 });
  const buffer = Buffer.alloc(48, 9);
  const key = ctx.qishuiAudioCacheKey('https://fixture.invalid/held', 'fixture-key');
  ctx.rememberQishuiDecryptedAudio(key, { buffer });
  const held = await ctx.getQishuiDecryptedAudio('https://fixture.invalid/held#auth=x');
  const result = ctx.releaseGeneratedMemoryCaches();
  assert.equal(result.memoryFreedBytes, 56); // Logical audio + cover cache bytes.
  assert.equal(ctx.qishuiAudioDecryptCache.size, 0);
  assertCacheAccounting(ctx);
  assert.equal(held.buffer, buffer);
  assert.equal(held.buffer[0], 9);
  let sent;
  ctx.sendAudioBuffer({ writeHead() {}, end(value) { sent = value; } }, held.buffer, 'audio/mp4', '');
  assert.equal(sent, buffer);
  assert.equal(ctx.releaseGeneratedMemoryCaches().memoryFreedBytes, 8);
  assertCacheAccounting(ctx);
});

test('release lets old in-flight success/failure settle without refilling cache; new generations can cache', async () => {
  const { ctx } = fixture({ cacheBytes: 96 });
  const gates = [];
  const signals = [];
  ctx.fetchPublicResource = (url, options) => {
    signals.push(options.signal);
    return new Promise((resolve, reject) => { gates.push({ resolve, reject }); });
  };
  ctx.readBoundedResponseBuffer = async up => Buffer.alloc(up.length, 3);
  const response = length => ({ ok: true, body: null, length });
  const url = 'https://fixture.invalid/success#auth=x';
  const oldSuccess = ctx.getQishuiDecryptedAudio(url);
  const oldFailure = ctx.getQishuiDecryptedAudio('https://fixture.invalid/failure#auth=x');
  const rejected = assert.rejects(oldFailure, /fixture failure/);
  ctx.releaseGeneratedMemoryCaches();
  assert.equal(ctx.qishuiAudioDecryptInflight.size, 2);
  assert(signals.every(signal => !signal.aborted));
  // A new caller may still share an old download for playback, never retention.
  const shared = ctx.getQishuiDecryptedAudio(url);
  gates[0].resolve(response(48));
  gates[1].reject(new Error('fixture failure'));
  const [first, second] = await Promise.all([oldSuccess, shared]);
  await rejected;
  assert.equal(first.buffer, second.buffer);
  assert.equal(first.buffer.length, 48);
  assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
  assert.equal(ctx.qishuiAudioDecryptCache.size, 0);
  assertCacheAccounting(ctx);
  const fresh = ctx.getQishuiDecryptedAudio(url);
  gates[2].resolve(response(32));
  const freshResult = await fresh;
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, 32);
  assert.equal([...ctx.qishuiAudioDecryptCache.values()][0].buffer, freshResult.buffer);
  assertCacheAccounting(ctx);
});

test('oversized encrypted audio is rejected by header and by streamed size', async () => {
  for (const declared of [true, false]) {
    const { ctx, releaseFetch } = fixture({ bodyBytes: 8192, declared, maxBytes: 4096 });
    releaseFetch();
    await assert.rejects(ctx.getQishuiDecryptedAudio('https://fixture.invalid/big.m4a#auth=x'), { code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
    assert.equal(ctx.qishuiAudioDecryptCache.size, 0);
    assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
  }
});

test('disconnecting one encrypted-audio subscriber preserves the shared download for another', async () => {
  const { ctx, fetches, releaseFetch } = fixture();
  const first = new AbortController();
  const second = new AbortController();
  const url = 'https://fixture.invalid/shared.m4a#auth=x';
  const cancelled = ctx.getQishuiDecryptedAudio(url, { signal: first.signal });
  const rejected = assert.rejects(cancelled, { name: 'AbortError' });
  const active = ctx.getQishuiDecryptedAudio(url, { signal: second.signal });
  first.abort();
  await rejected;
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].signal.aborted, false);
  releaseFetch();
  assert.equal((await active).buffer.length, 1024);
  assert.equal(ctx.qishuiAudioDecryptCacheBytes, 1024);
});

test('the last departing subscriber aborts its shared upstream without caching stale audio', async () => {
  const { ctx, fetches, releaseFetch } = fixture();
  const controller = new AbortController();
  const url = 'https://fixture.invalid/cancelled.m4a#auth=x';
  const pending = ctx.getQishuiDecryptedAudio(url, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
  assert.equal(fetches[0].signal.aborted, true);
  assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
  // Even an upstream stub that ignores abort cannot publish a stale cache.
  releaseFetch();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.qishuiAudioDecryptCache.size, 0);
});

test('aborting a stalled encrypted-audio body settles promptly and cancels its reader', async () => {
  const { ctx, releaseFetch } = fixture();
  let cancelled = 0;
  let started;
  const reading = new Promise(resolve => { started = resolve; });
  ctx.fetchPublicResource = async () => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
    read: () => { started(); return new Promise(() => {}); }, cancel: async () => { cancelled += 1; },
  }) } });
  releaseFetch();
  const controller = new AbortController();
  const pending = ctx.getQishuiDecryptedAudio('https://fixture.invalid/stalled.m4a#auth=x', { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await reading;
  controller.abort();
  await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert(cancelled > 0);
  assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
});
