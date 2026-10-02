'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function fixture({ bodyBytes = 1024, declared = true, maxBytes = 4096 } = {}) {
  const fetches = [];
  let releaseFetch;
  const gate = new Promise(resolve => { releaseFetch = resolve; });
  const ctx = vm.createContext({
    Buffer, setTimeout, clearTimeout,
    qishuiAudioDecryptCache: new Map(),
    qishuiAudioDecryptInflight: new Map(),
    qishuiAudioDecryptCacheBytes: 0,
    QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES: 1 << 20,
    QISHUI_AUDIO_ENCRYPTED_MAX_BYTES: maxBytes,
    qishuiAudioAuthFromUrl: url => ({ cleanUrl: url.split('#')[0], auth: 'fixture-key' }),
    qishuiAudioCacheKey: (url, auth) => url + '|' + auth,
    audioProxyHeadersFor: () => ({}),
    qishuiAudioDecryptor: { decrypt: ({ encryptedBuffer }) => ({ buffer: Buffer.from(encryptedBuffer), extension: '.m4a' }) },
    fetchPublicResource: async (url) => {
      fetches.push(url);
      await gate;
      const bytes = new Uint8Array(bodyBytes);
      const half = bodyBytes >> 1;
      const headers = new Headers(declared ? { 'content-length': String(bodyBytes) } : {});
      return new Response(new ReadableStream({
        start(controller) { controller.enqueue(bytes.slice(0, half)); controller.enqueue(bytes.slice(half)); controller.close(); },
      }), { status: 200, headers });
    },
  });
  loadFunctions(ctx, 'server.js', ['readStreamChunkWithTimeout', 'readBoundedResponseBuffer', 'rememberQishuiDecryptedAudio', 'getQishuiDecryptedAudio']);
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

test('oversized encrypted audio is rejected by header and by streamed size', async () => {
  for (const declared of [true, false]) {
    const { ctx, releaseFetch } = fixture({ bodyBytes: 8192, declared, maxBytes: 4096 });
    releaseFetch();
    await assert.rejects(ctx.getQishuiDecryptedAudio('https://fixture.invalid/big.m4a#auth=x'), { code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
    assert.equal(ctx.qishuiAudioDecryptCache.size, 0);
    assert.equal(ctx.qishuiAudioDecryptInflight.size, 0);
  }
});
