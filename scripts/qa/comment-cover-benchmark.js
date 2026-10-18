'use strict';
// Controlled read/cache-layer benchmark: fake payloads only, no platform account
// or CDN calls. Baseline source is read from Git; no worktree checkout is changed.
const vm = require('node:vm'), fs = require('node:fs'), { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createCoverCache } = require('../../cover-cache');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const baselineCommit = '451b6cf178fb6d872368941020141c312f02c4a3';
const baselineSource = execFileSync('git', ['show', baselineCommit + ':cover-cache.js'], { encoding: 'utf8' });
const baseline = { module: { exports: {} }, Buffer, Promise, Map, Date };
vm.runInNewContext(baselineSource, baseline);
const image = () => ({ status: 200, contentType: 'image/png', body: Buffer.alloc(32768) });
const stats = values => { const sorted = values.slice().sort((a, b) => a - b); return { p50Ms: +sorted[Math.floor(sorted.length / 2)].toFixed(3), p95Ms: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(3) }; };
async function timedReads(read) {
  const cold = [], hot = [];
  for (let i = 0; i < 10; i++) {
    let start = performance.now(); await read('url-' + i); cold.push(performance.now() - start);
    start = performance.now(); await read('url-' + i); hot.push(performance.now() - start);
  }
  return { cold: stats(cold), repeated: stats(hot) };
}
async function coverRun(factory) {
  const cache = factory(); let calls = 0;
  const timings = await timedReads(key => cache.load(key, async () => { calls++; await delay(20); return image(); }));
  return { ...timings, upstreamCalls: calls };
}
async function coverBurst(factory) {
  const cache = factory(); let active = 0, peak = 0, retained = 0, peakRetained = 0;
  const start = performance.now();
  await Promise.all(Array.from({ length: 32 }, (_, i) => cache.load('burst-' + i, async context => {
    active++; peak = Math.max(peak, active); retained += 65536; peakRetained = Math.max(peakRetained, retained);
    if (context && context.addBytes) context.addBytes(65536);
    await delay(20); active--; retained -= 65536; return image();
  })));
  return { maximumActive: peak, simulatedRetainedBytes: peakRetained, all32DurationMs: +(performance.now() - start).toFixed(3) };
}
(async () => {
  const payload = { comments: Array.from({ length: 30 }, (_, i) => ({ id: String(i), content: 'fixture comment ' + i })), nextCursor: 'next', hasMore: true };
  let oldCalls = 0, newCalls = 0;
  const oldComments = await timedReads(async () => { oldCalls++; await delay(20); return payload; });
  const ctx = vm.createContext({ AbortController, providerAuthEpoch: () => 1,
    apiJson: async () => { newCalls++; await delay(20); return payload; } });
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js', ['detailCommentReadStore', 'invalidateDetailCommentReadCache', 'readDetailComments']);
  const newComments = await timedReads(url => ctx.readDetailComments({ config: { provider: 'netease' } }, url, true));
  const beforeFactory = () => baseline.module.exports.createCoverCache();
  const afterFactory = () => createCoverCache();
  const result = {
    timestamp: new Date().toISOString(), baselineCommit, testedHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: 'Controlled Node read/cache layer; 20ms fake upstream, 10 cold/repeated pairs; no real account, CDN, browser paint or official-client comparison.',
    comments: { before: { ...oldComments, upstreamCalls: oldCalls }, after: { ...newComments, upstreamCalls: newCalls } },
    cover: { before: await coverRun(beforeFactory), after: await coverRun(afterFactory) },
    uniqueCoverBurst: { before: await coverBurst(beforeFactory), after: await coverBurst(afterFactory) },
    interpretation: 'Repeated comment reads avoid upstream delay; covers already had a hot cache. Bounding a 32-URL burst trades bulk completion time for bounded concurrent work; it is not a claim of faster cold CDN downloads.',
  };
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
