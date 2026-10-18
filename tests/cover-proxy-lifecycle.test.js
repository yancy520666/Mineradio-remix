'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), http = require('node:http');
const { once } = require('node:events');
const { createCoverCache } = require('../cover-cache');
const { loadFunctions } = require('./helpers/classic-functions');
const source = fs.readFileSync('server.js', 'utf8');
const routeStart = source.indexOf("  if (pn === '/api/cover') {");
const routeEnd = source.indexOf('  // ---------- 音频代理', routeStart);
const route = '(async () => {' + source.slice(routeStart, routeEnd) + '})()';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function downloadContext(extra) {
  const ctx = vm.createContext({ Buffer, AbortController, setTimeout, clearTimeout, UA: 'isolated-test', COVER_MAX_BYTES: 16 * 1024 * 1024,
    SAFE_COVER_CONTENT_TYPES: new Set(['image/png']), ...extra });
  loadFunctions(ctx, 'server.js', ['downloadCover', 'readStreamChunkWithTimeout']);
  return ctx;
}

test('cover downstream closing before upstream headers aborts the orphan request', async t => {
  let upstreamSignal, start;
  const started = new Promise(resolve => { start = resolve; });
  const helper = downloadContext({ fetchPublicResource: (_url, opts) => {
    upstreamSignal = opts.signal; start();
    return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true }));
  } });
  const cache = createCoverCache({ deadlineMs: 300 });
  const server = http.createServer((req, res) => {
    const ctx = vm.createContext({ pn: '/api/cover', generatedCacheGeneration: 0, url: new URL(req.url, 'http://localhost'), req, res, AbortController,
      coverCache: cache, downloadCover: helper.downloadCover, console });
    vm.runInContext(route, ctx).catch(error => { res.destroy(error); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const request = http.get(`http://127.0.0.1:${server.address().port}/api/cover?url=https%3A%2F%2Ffixture.invalid%2Fa.png`);
  request.on('error', () => {}); await started;
  request.destroy();
  for (let i = 0; i < 30 && !upstreamSignal.aborted; i++) await delay(2);
  assert.equal(upstreamSignal.aborted, true);
  assert.equal(cache.stats().active, 0); assert.equal(cache.stats().pending, 0);
});

test('cover total deadline aborts a continuous drip, and incomplete or unsupported images never cache', async () => {
  let cancelCount = 0;
  const helper = downloadContext({ fetchPublicResource: async () => ({ status: 200,
    headers: { get: key => key === 'content-type' ? 'image/png' : null }, body: { getReader: () => ({
      read: async () => { await delay(8); return { done: false, value: Buffer.alloc(1) }; }, cancel: async () => { cancelCount++; },
    }) } }) });
  const cache = createCoverCache({ deadlineMs: 30 });
  await assert.rejects(cache.load('drip', context => helper.downloadCover('https://fixture.invalid/a', context)), /COVER_DEADLINE/);
  assert(cancelCount > 0); assert.equal(cache.stats().inflightBytes, 0);
  helper.fetchPublicResource = async () => ({ status: 200, headers: { get: key => key === 'content-type' ? 'image/png' : '5' },
    body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => {} }) } });
  await assert.rejects(cache.load('incomplete', context => helper.downloadCover('https://fixture.invalid/a', context)), /COVER_INCOMPLETE/);
  helper.fetchPublicResource = async () => ({ status: 200, headers: { get: () => 'text/html' }, body: { cancel: async () => {} } });
  assert.equal((await cache.load('html', context => helper.downloadCover('https://fixture.invalid/a', context))).status, 415);
  assert.equal(cache.stats().entries, 0);
});

test('a cover finishing across explicit cache release cannot repopulate browser HTTP cache', async () => {
  const { EventEmitter } = require('node:events');
  const res = new EventEmitter(); let finish, headers;
  res.writeHead = (_status, value) => { headers = value; };
  res.end = () => { res.writableEnded = true; };
  const ctx = vm.createContext({ pn: '/api/cover', generatedCacheGeneration: 0,
    url: new URL('http://localhost/api/cover?url=https://fixture.invalid/a.png'), req: {}, res, AbortController, console,
    downloadCover: () => {}, coverCache: { load: () => new Promise(resolve => { finish = resolve; }) } });
  const pending = vm.runInContext(route, ctx);
  ctx.generatedCacheGeneration++;
  finish({ status: 200, contentType: 'image/png', body: Buffer.from('image') });
  await pending;
  assert.equal(headers['Cache-Control'], 'no-store'); assert.equal(res.writableEnded, true);
});
