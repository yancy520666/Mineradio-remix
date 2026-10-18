'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function renderer() {
  const requests = [], timers = new Map(); let next = 0;
  const c = vm.createContext({ console, AbortController, setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    beatMapToken: 1, beatMapBusy: false, beatAnalysisTimer: null, djBeatMapToken: 1, djBeatMapBusy: false, djBeatAnalysisTimer: null, djMode: { active: true },
    cinemaAnalysisProfileForSong: () => ({}), showBeatChip() {}, hideBeatChip() {}, beatAnalysisYieldMs: () => 0, yieldToIdle: async () => {},
    fetch: async (url, options) => {
      const request = { url, signal: options.signal, aborted: false };
      requests.push(request);
      const readBody = () => new Promise((resolve, reject) => {
        request.resolve = resolve;
        request.signal.addEventListener('abort', () => { request.aborted = true; reject(Object.assign(new Error('fixture-aborted'), { name: 'AbortError' })); }, { once: true });
      });
      return { ok: true, arrayBuffer: readBody, json: readBody };
    }
  });
  vm.runInContext(read('public/js/modules/03-beat/01-audio-beat-analysis.js'), c);
  vm.runInContext(read('public/js/modules/03-beat/02-podcast-dj-analysis.js'), c);
  loadFunctions(c, 'public/js/modules/01-scene/02-beat-camera-runtime.js', ['cancelBeatAnalysisTimer']);
  loadFunctions(c, 'public/js/modules/00-state/03-beat-dj-state.js', ['cancelDjBeatAnalysisTimer']);
  return { c, requests, timers };
}
test('a track switch aborts the owned MR body and releases busy without waiting for old download', async () => {
  const { c, requests } = renderer();
  const old = c.analyzeAudioBeats('fixture.wav', null, 1, { skipMusicTempo: true }); await tick();
  assert.equal(c.beatMapBusy, true); c.cancelBeatAnalysisTimer(); c.beatMapToken++;
  assert.equal(await old, null); assert.equal(requests[0].aborted, true);
  assert.equal(c.beatAnalysisRequestOwners.mr.size, 0); assert.equal(c.beatMapBusy, false);
});
test('DJ intro and full map keep separate ownership; cancelling an old pair cannot clear a new busy job', async () => {
  const { c, requests } = renderer();
  const intro = c.analyzePodcastDjIntroBeats('https://fixture.invalid/a.mp3', 1, 4000);
  const full = c.analyzePodcastDjBeats('https://fixture.invalid/a.mp3', 1, 4000); await tick();
  assert.equal(requests.length, 2); assert.notStrictEqual(requests[0].signal, requests[1].signal);
  c.cancelDjBeatAnalysisTimer(); c.djBeatMapToken++;
  const replacement = c.analyzePodcastDjBeats('https://fixture.invalid/b.mp3', 2, 4000);
  assert.equal(await intro, null); assert.equal(await full, null); await tick();
  assert.equal(c.djBeatMapBusy, true); assert.equal(c.beatAnalysisRequestOwners.dj.size, 1);
  requests[2].resolve({ ok: true, map: { beats: [] } });
  assert((await replacement).beats); assert.equal(c.djBeatMapBusy, false);
});
test('an old idle continuation cannot hide the replacement analysis chip', async () => {
  for (const mode of ['mr', 'dj']) {
    const { c, requests } = renderer(); let releaseOld, hidden = 0, yields = 0;
    c.hideBeatChip = () => { hidden++; };
    c.yieldToIdle = () => ++yields === 1 ? new Promise(resolve => { releaseOld = resolve; }) : Promise.resolve();
    const start = token => mode === 'mr' ? c.analyzeAudioBeats('fixture.wav', null, token, { skipMusicTempo: true })
      : c.analyzePodcastDjBeats('https://fixture.invalid/a.mp3', token, 4000);
    const old = start(1);
    if (mode === 'mr') { c.cancelBeatAnalysisTimer(); c.beatMapToken++; }
    else { c.cancelDjBeatAnalysisTimer(); c.djBeatMapToken++; }
    const current = start(2); await tick(); releaseOld(); assert.equal(await old, null);
    assert.equal(hidden, 0, 'stale owner must not clear the current chip');
    if (mode === 'mr') c.cancelBeatAnalysisTimer(); else c.cancelDjBeatAnalysisTimer();
    await current; assert.equal(requests[0].aborted, true);
  }
});
test('worker abort or failed transfer terminates promptly and clears its watchdog', async () => {
  for (const transferError of [false, true]) {
    const s = renderer(), workers = [];
    s.c.Worker = function () {
      this.terminated = 0; this.terminate = () => { this.terminated++; };
      this.postMessage = () => { if (transferError) throw new Error('fixture-transfer-error'); };
      workers.push(this);
    };
    s.c.Blob = Blob; s.c.URL = { createObjectURL: () => 'blob:fixture' }; s.c.location = { origin: 'https://fixture.invalid' };
    s.c.isHiddenForBackgroundOptimization = () => false;
    vm.runInContext(read('public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js'), s.c);
    const abort = new AbortController(), buffer = { numberOfChannels: 1, length: 10, sampleRate: 1000, getChannelData: () => new Float32Array(10) };
    const work = s.c.analyzeMusicTempoInWorker(buffer, 1, abort.signal); await tick();
    if (!transferError) abort.abort();
    assert.equal(await work, null); assert.equal(workers[0].terminated, 1); assert.equal(s.timers.size, 0);
    workers[0].onmessage({ data: { ok: true, beats: [1] } }); assert.equal(workers[0].terminated, 1);
  }
});
function backend() {
  let freed = 0, cancelled = 0, decodes = 0, options;
  const c = vm.createContext({ console, setImmediate, require: name => name === './server-security' ? {
    fetchPublicResource: async (_url, opts) => { options = opts; return { ok: true, body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => { cancelled++; } }) } }; }
  } : require(name), module: { exports: {} },
    importDecoder: async () => ({ MPEGDecoder: class {
      constructor() { this.ready = Promise.resolve(); }
      decode() { decodes++; return {}; }
      free() { freed++; }
    } })
  });
  vm.runInContext(read('dj-analyzer.js').replace(/await import\('mpg123-decoder'\)/g, 'await importDecoder()'), c);
  return { c, stats: () => ({ freed, cancelled, decodes, options }) };
}
test('backend cancellation interrupts a pending body, frees its decoder, and never falls back to another download', async () => {
  for (const intro of [false, true]) {
    const s = backend(), abort = new AbortController();
    const work = intro ? s.c.analyzePodcastDjIntro('https://fixture.invalid/a.mp3', { durationSec: 4000, signal: abort.signal })
      : s.c.analyzePodcastDjStream('https://fixture.invalid/a.mp3', { durationSec: 4000, signal: abort.signal });
    const rejection = assert.rejects(work, { name: 'AbortError' }); await tick(); abort.abort(); await rejection;
    const stats = s.stats(); assert.equal(stats.freed, 1); assert(stats.cancelled > 0); assert.equal(stats.decodes, 0); assert.strictEqual(stats.options.signal, abort.signal);
  }
});
test('analysis limiter preserves intro/full capacity, bounds the queue, and cancels only the departing job', async () => {
  const { createPodcastAnalysisLimiter } = require('../dj-analyzer');
  const limiter = createPodcastAnalysisLimiter(), completed = [], controllers = [0, 1, 2, 3, 4].map(() => new AbortController());
  const pending = controllers.map((controller, i) => limiter.run(() => new Promise(resolve => { completed.push({ i, resolve }); }), controller.signal));
  const overflow = assert.rejects(pending[4], { code: 'ANALYSIS_QUEUE_FULL' });
  const queuedAbort = assert.rejects(pending[2], { name: 'AbortError' });
  await tick(); assert.deepEqual(limiter.snapshot(), { active: 2, queued: 2, maxActive: 2, maxQueued: 2 });
  controllers[2].abort(); await queuedAbort; await overflow;
  completed[0].resolve('intro'); assert.equal(await pending[0], 'intro'); await tick();
  assert.deepEqual(completed.map(entry => entry.i), [0, 1, 3]);
  completed[1].resolve('full'); completed[2].resolve('next'); await Promise.all([pending[1], pending[3]]); await tick();
  assert.equal(limiter.snapshot().active, 0); assert.equal(limiter.snapshot().queued, 0);
});
test('a departing HTTP analysis cancels only its own job and removes route listeners', async () => {
  const { EventEmitter } = require('node:events');
  const { createPodcastAnalysisLimiter } = require('../dj-analyzer');
  const jobs = [], replies = [], limiter = createPodcastAnalysisLimiter();
  const source = read('server.js'), start = source.indexOf("  if (pn === '/api/podcast/dj-beatmap') {"), end = source.indexOf("\n  if (pn === '/api/login/qr/key')", start);
  assert(start >= 0 && end > start);
  const context = vm.createContext({ AbortController, console: { log() {}, error() {} }, UA: 'fixture', podcastAnalysisLimiter: limiter,
    analyzePodcastDjStream: (_url, options) => new Promise((resolve, reject) => {
      const job = { resolve, signal: options.signal }; jobs.push(job);
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('fixture-aborted'), { name: 'AbortError' })), { once: true });
    }), sendJSON: (res, data, status) => replies.push({ res, data, status }) });
  const route = vm.runInContext('(async function(req,res,url){var pn="/api/podcast/dj-beatmap";\n' + source.slice(start, end) + '\n})', context);
  const pairs = [0, 1].map(i => ({ req: new EventEmitter(), res: new EventEmitter(), url: new URL('https://fixture.invalid/api?url=https://fixture.invalid/' + i + '.mp3&duration=4000') }));
  const tasks = pairs.map(pair => route(pair.req, pair.res, pair.url)); await tick();
  assert.equal(jobs.length, 2); pairs[0].res.destroyed = true; pairs[0].res.emit('close'); await tasks[0];
  assert.equal(jobs[0].signal.aborted, true); assert.equal(jobs[1].signal.aborted, false); assert.equal(replies.length, 0);
  jobs[1].resolve({ visualBeatCount: 4 }); await tasks[1]; await tick();
  assert.equal(replies.length, 1); assert.strictEqual(replies[0].res, pairs[1].res); assert.equal(replies[0].data.ok, true);
  for (const pair of pairs) { assert.equal(pair.req.listenerCount('aborted'), 0); assert.equal(pair.res.listenerCount('close'), 0); }
  const departed = { req: new EventEmitter(), res: new EventEmitter() }; departed.req.aborted = true;
  await route(departed.req, departed.res, pairs[0].url); assert.equal(jobs.length, 2);
  assert.equal(limiter.snapshot().active, 0);
});
test('memory status names its main-process RSS rather than implying whole-player memory', () => {
  const c = vm.createContext({}); loadFunctions(c, 'public/js/modules/00-state/11-system-memory-controls.js', ['memoryFormatSnapshot']);
  assert.match(c.memoryFormatSnapshot({ totalMB: 8000, usedMB: 2000, freeMB: 6000, usedPercent: 25, process: { rssMB: 90 } }), /主进程 90 MB/);
});
