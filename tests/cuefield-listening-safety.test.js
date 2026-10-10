const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { listeningSafePlan, listeningFloor, introLimit, createCuefieldAutoMix } = require('../public/js/modules/05-playback/16-cuefield-automix-core');
const { buildCuefieldTimelineExecution } = require('../public/js/modules/05-playback/17-cuefield-timeline-executor');

function plan({ start = 150, end = 154, entry = 4, confidence = 0.9 } = {}) {
  return { ok: true, chosen: {
    mixStart: start, handoffAt: end, protectedUntil: 30,
    transitionRecipe: 'filtered-pickup', evaluation: { tier: 'usable', score: confidence },
    entry: { time: entry }, timeline: [
      { t: 0, deck: 'B', op: 'play', at: entry, volume: 0 },
      { t: 0, deck: 'B', op: 'volume', value: 1, duration: (end - start) * 1000 },
      { t: 0, deck: 'A', op: 'volume', value: 0, duration: (end - start) * 1000 },
      { t: end - start, deck: 'B', op: 'handoff' },
    ],
  } };
}
const context = (extra = {}) => ({ currentDuration: 200, nextDuration: 200, currentTime: 10, listenStartedAt: 0, ...extra });

for (const duration of [30, 60]) {
  test(`${duration}s songs keep their body and incoming short songs start at zero`, () => {
    const result = listeningSafePlan(plan({ start: 12, end: 20, entry: 22 }), context({ currentDuration: duration, nextDuration: duration }));
    assert.equal(result.chosen.entry.time, 0);
    assert.equal(result.chosen.mixStart, duration - 2.2);
    assert.equal(result.chosen.handoffAt, duration);
    const execution = buildCuefieldTimelineExecution({ ...result.chosen, executionMode: result.chosen.transitionRecipe });
    assert.equal(execution.bStart, 0);
    assert.equal(execution.handoffDelayMs, 2200);
    assert.equal(execution.actions[0].delayMs, 0);
  });
}

test('high confidence only preserves an intro-bounded sufficiently late musical window', () => {
  const original = plan();
  assert.strictEqual(listeningSafePlan(original, context()), original);
  for (const unsafe of [plan({ entry: 60 }), plan({ start: 30, end: 34 }), plan({ confidence: 0.3 })]) {
    assert.equal(listeningSafePlan(unsafe, context()).chosen.transitionRecipe, 'end-of-track-crossfade');
  }
  assert.equal(introLimit(30), 3);
  assert.equal(introLimit(200), 12);
});

test('entry-relative residence survives an already advanced incoming deck', () => {
  assert.equal(listeningFloor(200, 135), 180);
  const result = listeningSafePlan(plan(), context({ listenStartedAt: 135, currentTime: 140 }));
  assert.ok(result.chosen.mixStart >= 180);
});

test('late preparation uses remaining natural tail; unknown duration defers to ended', () => {
  const result = listeningSafePlan(plan(), context({ currentTime: 199 }));
  assert.equal(result.chosen.mixStart, 199);
  assert.equal(result.chosen.handoffAt, 200);
  assert.equal(result.chosen.timeline[1].duration, 1000);
  assert.equal(listeningSafePlan(plan(), context({ currentDuration: Infinity })), null);
  assert.equal(listeningSafePlan(plan(), context({ currentDuration: 0 })), null);
  assert.equal(listeningSafePlan(plan(), context({ currentTime: 199.8 })), null);
  assert.equal(listeningSafePlan(plan(), context({ nextDuration: 0 })).chosen.entry.time, 0);
});

test('safety preparation honors caller residence and does not add a phantom preroll', async () => {
  const runtime = createCuefieldAutoMix({ listeningSafety: true, allowSafetyFallback: true, allowLiveEndCrossfadeFallback: true,
    planTransition: async () => plan(), prepareAudioUrl: async () => 'audio' });
  runtime.setEnabled(true);
  const ctx = { ...context({ currentDuration: 60, nextDuration: 30 }), token: 1, currentIndex: 0, nextIndex: 1,
    currentSong: { key: 'a' }, nextSong: { key: 'b' }, leadSec: 4, minimumListenUntil: 57.8 };
  const result = await runtime.prepare(ctx);
  assert.equal(result.status, 'ready');
  assert.equal(result.pending.triggerAt, 57.8);
  assert.equal(runtime.shouldTrigger({ token: 1, currentIndex: 0, currentTime: 54, nextKey: 'b' }), false);
  assert.equal(runtime.shouldTrigger({ token: 1, currentIndex: 0, currentTime: 57.8, nextKey: 'b' }), true);
  runtime.reset('manual-seek');
  assert.equal(runtime.shouldTrigger({ token: 1, currentIndex: 0, currentTime: 59, nextKey: 'b' }), false);
});

test('rapid next invalidates a slow preparation without capturing the new track', async () => {
  let finish;
  const runtime = createCuefieldAutoMix({ listeningSafety: true, allowSafetyFallback: true, allowLiveEndCrossfadeFallback: true,
    planTransition: () => new Promise(resolve => { finish = resolve; }), prepareAudioUrl: async () => 'audio' });
  runtime.setEnabled(true);
  const pending = runtime.prepare({ ...context(), token: 1, currentIndex: 0, nextIndex: 1,
    currentSong: { key: 'a' }, nextSong: { key: 'b' } });
  await Promise.resolve();
  runtime.reset('track-switch');
  finish(plan());
  assert.equal((await pending).status, 'stale');
  assert.equal(runtime.snapshot().pending, null);
});

test('timeline play does not rewind a next deck that already became audible', async () => {
  const source = fs.readFileSync(require.resolve('../public/js/modules/05-playback/18-cuefield-automix-integration.js'), 'utf8');
  const begin = source.indexOf('function cuefieldApplyTimelineAction(');
  const end = source.indexOf('\nasync function runCuefieldTimeline', begin);
  let seeks = 0;
  const sandbox = { cuefieldSetMediaTime: () => { seeks++; } };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(begin, end), sandbox);
  const media = { currentTime: 5, paused: false };
  const result = await sandbox.cuefieldApplyTimelineAction({ deck: 'B', op: 'play', at: 0 }, { incomingStarted: true }, media, {});
  assert.equal(result, true);
  assert.equal(seeks, 0);
});

test('a tiny incoming clip is not consumed entirely by the overlap', () => {
  const result = listeningSafePlan(plan(), context({ nextDuration: 5 }));
  assert.equal(result.chosen.audibleOverlap, 0.5);
  assert.equal(listeningSafePlan(plan(), context({ nextDuration: 1 })), null);
});

test('cache-to-planner output carries the short-track residence floor', () => {
  const { planCuefieldTransitionFromCache } = require('../cuefield/mineradio-bridge');
  for (const duration of [30, 60]) {
    const cameraBeats = Array.from({ length: duration * 2 }, (_, i) => [i * 0.5, 0.5, 0.9, 0.4, 0.4, 0.38, 0.3, i % 4 ? 2 : 1, 7, 0.4, 0.3, 0.5]);
    const map = { duration, gridStep: 0.5, cameraBeats, edgeEvidence: { audibleStart: 0, audibleEnd: duration - 0.1, containerEnd: duration, confidence: 0.86 } };
    const result = planCuefieldTransitionFromCache({ fromKey: 'a', toKey: 'b', readBeatMapCache: () => ({ map }), enableLiveEndCrossfadeFallback: true });
    assert.ok(result.chosen.protectedUntil >= duration - 2.2);
    if (result.ok) assert.ok(result.chosen.mixStart >= duration - 2.2);
  }
});
