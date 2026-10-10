'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { loadFunctions } = require('./helpers/classic-functions');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const snapshot = { ok: true, settings: { rootPath: '/safe/cache' }, usage: { totalManagedBytes: 123 } };
function ui(bridge) {
  const nodes = {}, resets = [];
  const c = vm.createContext({ window: { desktopWindow: bridge }, setTimeout() {}, console,
    document: { getElementById(id) { return nodes[id] ||= { textContent: '', disabled: false, hidden: false, setAttribute(k,v) { this[k] = v; } }; } },
    resetGeneratedLyricCaches() { resets.push('lyrics'); }, resetGeneratedCoverCaches(reload) { resets.push(['covers', reload]); },
    resetGeneratedCommentCaches(reload) { resets.push(['comments', reload]); }
  });
  vm.runInContext(source('public/js/modules/07-fx/08-cache-storage-settings.js'), c);
  return { c, nodes, resets };
}
test('release locks all actions, avoids double invocation and renders fresh totals without changing playback', async () => {
  let finish, calls = 0, choices = 0;
  const { c, nodes, resets } = ui({ releaseCaches() { calls++; return new Promise(r => finish = r); }, chooseCacheDirectory() { choices++; }, getCacheSettings() { throw Error('snapshot should be used'); } });
  const work = c.releaseMineradioCaches(); await Promise.resolve();
  assert.equal(nodes['cache-storage-release'].disabled, true);
  assert.match(nodes['cache-storage-status'].textContent, /音乐继续播放/);
  await c.releaseMineradioCaches(); await c.chooseMineradioCacheRoot(); await c.refreshMineradioCacheSettings();
  assert.equal(calls, 1); assert.equal(choices, 0);
  finish({ ok: true, freedBytes: 1024, snapshot }); await work;
  assert.equal(nodes['cache-storage-release'].disabled, false);
  assert.match(nodes['cache-storage-status'].textContent, /1 KB/);
  assert.equal(nodes['cache-storage-total'].textContent, '已占用 123 B');
  assert.equal(resets.length, 6);
});
test('partial cleanup reports remaining files and refreshes missing snapshot', async () => {
  let reads = 0;
  const { c, nodes } = ui({ releaseCaches: async () => ({ ok: false, partial: true, freedBytes: 256, failedFiles: 1 }), getCacheSettings: async () => { reads++; return snapshot; } });
  await c.releaseMineradioCaches();
  assert.equal(reads, 1); assert.match(nodes['cache-storage-status'].textContent, /256 B.*部分缓存/);
  assert.equal(nodes['cache-storage-status']['data-state'], 'error');
});
test('rejected or synchronously throwing bridges unlock controls without claiming success', async () => {
  for (const releaseCaches of [() => { throw Error('busy'); }, () => Promise.reject(Error('busy'))]) {
    const { c, nodes } = ui({ releaseCaches }); await c.releaseMineradioCaches();
    assert.equal(nodes['cache-storage-release'].disabled, false);
    assert.match(nodes['cache-storage-status'].textContent, /未完成/);
  }
});
test('unsupported release does not reset caches or mutate anything', async () => {
  const { c, nodes, resets } = ui({}); await c.releaseMineradioCaches();
  assert.equal(resets.length, 0); assert.match(nodes['cache-storage-status'].textContent, /不支持/);
});
test('lyric writes carry the generation captured before fetch; old generation and unowned writes are dropped', async () => {
  const writes = [];
  const c = vm.createContext({ window: { desktopWindow: { readLyricCache: async () => ({ ok: true, hit: false, generation: 9 }), writeLyricCache: (...args) => { writes.push(args); return Promise.resolve(); } } }, clearTimeout() {}, console });
  vm.runInContext(source('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js'), c);
  const owner = {}; await c.readPersistentLyricCache({ id: 1 }, owner);
  c.writePersistentLyricCache({ id: 1 }, { lyric: 'text' }, owner);
  assert.equal(writes.length, 1); assert.equal(writes[0][2], 9);
  c.resetGeneratedLyricCaches(); c.writePersistentLyricCache({ id: 1 }, { lyric: 'late' }, owner);
  c.writePersistentLyricCache({ id: 1 }, { lyric: 'unowned' });
  assert.equal(writes.length, 1);
});
test('a comment result already queued before reset neither renders nor repopulates the cache, even without AbortController', async () => {
  let resolve;
  const c = vm.createContext({ document: { getElementById() { return null; } }, detailCommentsState: null, detailCommentSong: null,
    providerAuthEpoch: () => 1, apiJson: () => new Promise(r => resolve = r) });
  loadFunctions(c, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js', ['detailCommentReadStore','invalidateDetailCommentReadCache','readDetailComments','resetGeneratedCommentCaches','cancelDetailCommentReads']);
  const pending = c.readDetailComments({ config: { provider: 'netease' } }, '/comments', true);
  c.resetGeneratedCommentCaches(false); resolve({ comments: [{ id: 1 }] });
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(c.detailCommentReadStore().cache.size, 0);
});
test('intentional active-file skips show preservation rather than a retry error', async () => {
  const { c, nodes } = ui({ releaseCaches: async () => ({ ok: true, partial: true, skippedFiles: 3, freedBytes: 0, snapshot }) });
  await c.releaseMineradioCaches();
  assert.match(nodes['cache-storage-status'].textContent, /保留正在使用/);
  assert.equal(nodes['cache-storage-status']['data-state'], 'success');
});
test('cover refresh owns the current song, not a previous visible texture, and does not replace user covers', () => {
  const loads = [], song = { cover: 'https://example.invalid/current.jpg' };
  const c = vm.createContext({ generatedCoverCacheEpoch: 0, cancelCoverUrlLoad() {}, cancelUpcomingCoverPrefetch() {}, upcomingCoverPrefetch: {},
    currentCoverSource: { kind: 'url', src: 'https://example.invalid/previous.jpg' }, currentCoverSong: () => song,
    getCustomCoverForSong: () => '', coverUrlWithSize: s => s, trackSwitchToken: 4, loadCoverFromUrl: (...args) => loads.push(args) });
  loadFunctions(c, 'public/js/modules/03-beat/05-cover-loading-crop.js', ['resetGeneratedCoverCaches']);
  c.resetGeneratedCoverCaches(true);
  assert.equal(loads[0][0], song.cover); assert.equal(loads[0][1].trackToken, 4); assert.equal(loads[0][1].cacheBust, true);
  c.getCustomCoverForSong = () => 'data:image/png,user-media'; c.resetGeneratedCoverCaches(true);
  assert.equal(loads.length, 1);
});
test('queued translation fallback cannot start after cache release, including the idle-callback gap', () => {
  for (const useIdle of [false, true]) {
    const timers = [], idle = [], fetched = [];
    const c = vm.createContext({
      trackSwitchToken: 7,
      window: { requestIdleCallback: useIdle }, requestIdleCallback: fn => idle.push(fn),
      setTimeout: fn => timers.push(fn), clearTimeout() {}
    });
    // Exercise the real bounded-cache reader and its state/dependencies, not a
    // no-op helper that could hide generation or release regressions.
    vm.runInContext(source('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js'), c);
    c.shouldFetchNeteaseLyricTranslationFallback = () => true;
    c.lyricTranslationFallbackKey = () => 'song';
    c.fetchNeteaseLyricTranslationFallback = (...args) => fetched.push(args);
    c.scheduleNeteaseLyricTranslationFallback({ id: 1 }, 7, {});
    if (useIdle) timers.shift()();
    c.generatedLyricCacheEpoch++;
    if (useIdle) idle.shift()(); else timers.shift()();
    assert.equal(fetched.length, 0);
    c.scheduleNeteaseLyricTranslationFallback({ id: 1 }, 7, {});
    timers.shift()(); if (useIdle) idle.shift()();
    assert.equal(fetched.length, 1, 'fresh generation still fetches');
  }
});
