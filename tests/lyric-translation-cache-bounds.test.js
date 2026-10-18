'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/06-lyrics/00-lyrics-fetch-parse.js'), 'utf8');
function harness() {
  let now = 1000, nextTimer = 0;
  const timers = new Map();
  const c = vm.createContext({
    window: {}, console: { warn() {} }, Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, trackSwitchToken: 1,
    simpleSearchNorm: s => String(s).toLowerCase(), songProviderKey: s => s.provider,
    cloneLyricLines: lines => lines.map(line => ({ ...line })),
    normalizeStageLyricText: s => String(s || '').trim()
  });
  vm.runInContext(source, c);
  return { c, timers, advance(ms) {
    now += ms;
    for (;;) {
      const due = [...timers].find(([, item]) => item.at <= now);
      if (!due) break;
      timers.delete(due[0]); due[1].fn();
    }
  } };
}
function payload(text = 'translation') { return { lines: [{ t: 0, text, duration: 1 }], source: 'tlyric', candidateId: 9, cachedAt: 1000 }; }
function store(c, key, value = payload(), miss = false) { return c.storeLyricTranslationFallbackCache(key, value, c.generatedLyricCacheEpoch, miss); }
function assertBounds(c) {
  assert(c.lyricTranslationFallbackCache.size <= 64);
  assert(c.lyricTranslationFallbackMissCache.size <= 128);
  assert(c.lyricTranslationFallbackCacheBytes <= 2 * 1024 * 1024);
  assert(c.lyricTranslationFallbackMissCacheBytes <= 128 * 1024);
  for (const [cache, recorded] of [[c.lyricTranslationFallbackCache, c.lyricTranslationFallbackCacheBytes], [c.lyricTranslationFallbackMissCache, c.lyricTranslationFallbackMissCacheBytes]]) {
    assert.equal([...cache.values()].reduce((sum, entry) => sum + entry.bytes, 0), recorded);
    assert(recorded >= 0);
  }
}
test('2,000 distinct successes and misses plateau at entry limits with one sweep timer', () => {
  const { c, timers } = harness();
  for (let i = 0; i < 2000; i++) {
    store(c, 'ok|' + i); store(c, 'miss|' + i, null, true); assertBounds(c);
    assert.equal(timers.size, 1);
  }
  assert.equal(c.lyricTranslationFallbackCache.size, 64);
  assert.equal(c.lyricTranslationFallbackMissCache.size, 128);
});
test('aggregate budgets evict large values and keys before entry count caps', () => {
  const { c } = harness();
  for (let i = 0; i < 500; i++) {
    assert(store(c, 'ok|' + i, payload('译'.repeat(60000))));
    assert(store(c, 'miss|' + i + 'x'.repeat(3500), null, true)); assertBounds(c);
  }
  assert(c.lyricTranslationFallbackCache.size < 64);
  assert(c.lyricTranslationFallbackMissCache.size < 128);
});
test('oversized single values, huge keys, cyclic and unknown shapes are not retained', () => {
  const { c } = harness();
  const cycle = {}; cycle.self = cycle;
  const accessor = {}; Object.defineProperty(accessor, 'huge', { enumerable: true, get() { throw new Error('must not execute'); } });
  for (const bad of [payload('x'.repeat(140000)), cycle, new Map([['hidden', 'x'.repeat(200000)]]), accessor, { values: Array(9000).fill(1) }]) {
    assert.equal(store(c, 'bad', bad), false);
  }
  assert.equal(store(c, 'x'.repeat(5000)), false);
  assert.equal(c.lyricTranslationFallbackCache.size, 0); assertBounds(c);
});
test('success hits refresh LRU and sliding freshness, misses expire without another lookup', () => {
  const { c, advance, timers } = harness();
  store(c, 'hot'); store(c, 'cold'); store(c, 'missing', null, true);
  advance(9 * 60 * 1000); assert(c.readLyricTranslationFallbackCache('hot'));
  for (let i = 0; i < 63; i++) store(c, 'new|' + i);
  assert(c.lyricTranslationFallbackCache.has('hot'));
  assert.equal(c.lyricTranslationFallbackCache.has('cold'), false);
  advance(60 * 1000);
  assert.equal(c.lyricTranslationFallbackMissCache.size, 0);
  for (let i = 0; i < 50; i++) assert(c.readLyricTranslationFallbackCache('hot'));
  assertBounds(c); assert.equal(timers.size, 1);
  advance(30 * 60 * 1000 - 1); assert(c.lyricTranslationFallbackCache.has('hot'));
  advance(1); assert.equal(c.lyricTranslationFallbackCache.size, 0);
  assert.equal(c.lyricTranslationFallbackCacheBytes, 0); assert.equal(timers.size, 0);
});
test('miss lookup actively removes expired entry and success wins over concurrent miss', () => {
  const { c } = harness(), song = { provider: 'qq', name: 'name' }, state = { usableLyric: true };
  const key = c.lyricTranslationFallbackKey(song);
  store(c, key, null, true); assert.equal(c.shouldFetchNeteaseLyricTranslationFallback(song, state), false);
  c.lyricTranslationFallbackMissCache.get(key).expiresAt = 0;
  assert.equal(c.shouldFetchNeteaseLyricTranslationFallback(song, state), true);
  assert.equal(c.lyricTranslationFallbackMissCacheBytes, 0);
  store(c, key, null, true); store(c, key);
  assert.equal(c.lyricTranslationFallbackMissCache.size, 0);
  assert.equal(store(c, key, null, true), false); assertBounds(c);
});
test('oversized fetched translation still renders without entering the reusable cache', async () => {
  const { c } = harness(); let rendered;
  c.findNeteaseLyricFallbackCandidate = async () => ({ id: 9 });
  c.apiJson = async () => ({ tlyric: '[00:01.00]' + '译'.repeat(140000) });
  c.mergeNeteaseFallbackTranslationsIntoCurrent = (_song, _token, data) => { rendered = data; return true; };
  assert.equal(await c.fetchNeteaseLyricTranslationFallback({ provider: 'qq', name: 'huge' }, 1, 'huge'), true);
  assert.equal(rendered.lines[0].text.length, 140000);
  assert.equal(c.lyricTranslationFallbackCache.size, 0);
  assert.equal(c.lyricTranslationFallbackMissCache.size, 0);
});
test('release preserves current lyrics and invalidates late search, response, rejection and stale sweep', async () => {
  for (const phase of ['search', 'response', 'reject']) {
    const { c, timers } = harness(); let resolve, reject, renders = 0, requests = 0;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    c.originalLyricsState = { lines: [{ text: 'current user lyric' }] };
    const original = c.originalLyricsState;
    c.findNeteaseLyricFallbackCandidate = phase === 'search' ? () => pending : async () => ({ id: 9 });
    c.apiJson = () => { requests++; return pending; };
    c.mergeNeteaseFallbackTranslationsIntoCurrent = () => { renders++; return true; };
    store(c, 'warm'); const staleSweep = [...timers.values()][0].fn;
    const work = c.fetchNeteaseLyricTranslationFallback({ provider: 'qq', name: 'late' }, 1, 'late');
    await new Promise(setImmediate);
    if (phase !== 'search') assert.equal(requests, 1);
    c.resetGeneratedLyricCaches();
    if (phase === 'reject') reject(new Error('late network failure'));
    else resolve(phase === 'search' ? { id: 9 } : { tlyric: '[00:01.00]late' });
    await work; staleSweep();
    assert.equal(renders, 0); if (phase === 'search') assert.equal(requests, 0);
    assert.equal(c.originalLyricsState, original);
    assert.equal(c.lyricTranslationFallbackCache.size, 0);
    assert.equal(c.lyricTranslationFallbackMissCache.size, 0);
    assert.equal(timers.size, 0); assertBounds(c);
  }
});
test('queued cached hit cannot render after release and normal cached hit avoids a request', async () => {
  const { c, advance } = harness(); let rendered = 0;
  const song = { provider: 'qq', name: 'cached' }, key = c.lyricTranslationFallbackKey(song);
  c.mergeNeteaseFallbackTranslationsIntoCurrent = () => { rendered++; return true; };
  c.findNeteaseLyricFallbackCandidate = () => { throw new Error('cached hit must not search'); };
  store(c, key); assert.equal(await c.fetchNeteaseLyricTranslationFallback(song, 1, key), true);
  assert.equal(rendered, 1);
  c.scheduleNeteaseLyricTranslationFallback(song, 1, { usableLyric: true });
  c.resetGeneratedLyricCaches(); advance(1); assert.equal(rendered, 1); assertBounds(c);
});
