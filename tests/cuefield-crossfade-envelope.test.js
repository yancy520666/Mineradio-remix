'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildCuefieldCrossfadeGains: gains } = require('../public/js/modules/05-playback/17-cuefield-timeline-executor');

const near = (a, b, eps = 1e-10) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
test('paired envelope preserves endpoints, live master and outgoing attenuation', () => {
  for (const volume of [0, 0.2, 0.7, 0.8, 1]) {
    assert.deepEqual(gains(0, volume), { outgoing: volume, incoming: 0 });
    assert.deepEqual(gains(1, volume), { outgoing: 0, incoming: volume });
    near(gains(0, volume, 0.4).outgoing, volume * 0.4);
    for (let n = 0; n <= 1000; n++) {
      const value = gains(n / 1000, volume);
      assert.ok(value.outgoing + value.incoming <= 1 + 1e-12);
      assert.ok(value.outgoing >= 0 && value.incoming >= 0);
    }
  }
});

test('synthetic correlated peaks are bounded; uncorrelated-power tradeoff is explicit', () => {
  const oldMidpointPeak = Math.SQRT2;
  const full = gains(0.5, 1);
  near(oldMidpointPeak, 1.4142135623730951);
  near(full.outgoing + full.incoming, 1);
  near(full.outgoing ** 2 + full.incoming ** 2, 0.5);
  near(10 * Math.log10(full.outgoing ** 2 + full.incoming ** 2), -3.010299956639812);
  const quiet = gains(0.5, 0.5);
  near(quiet.outgoing ** 2 + quiet.incoming ** 2, 0.25);
  // Render equal-phase unit sinusoids through the envelope without an audio device.
  let peak = 0;
  for (let n = 0; n < 48000; n++) {
    const envelope = gains(n / 47999, 1);
    const sample = Math.sin(2 * Math.PI * 440 * n / 48000);
    peak = Math.max(peak, Math.abs(sample * (envelope.outgoing + envelope.incoming)));
  }
  assert.ok(peak <= 1 + 1e-12);
});

test('smoothstep gives gentler attack/release than the raw sine envelope', () => {
  const epsilon = 1e-4;
  assert.ok(gains(epsilon, 0.5).incoming / epsilon < 0.001);
  assert.ok(gains(1 - epsilon, 0.5).outgoing / epsilon < 0.001);
  const early = 0.04 / 2.2;
  assert.ok(gains(early, 0.5).incoming < 0.1 * (0.5 * Math.sin(early * Math.PI / 2)));
});

function harness() {
  const source = fs.readFileSync(require.resolve('../public/js/modules/05-playback/18-cuefield-automix-integration.js'), 'utf8');
  const writes = [];
  const timers = new Map();
  let nextTimer = 0;
  let current = true;
  let clock = 0;
  let clears = 0;
  const media = { currentTime: 20, duration: 22.2, ended: false };
  const sandbox = {
    cuefieldMediaFadeSerial: 0, cuefieldMediaFadeRaf: 0, cuefieldMediaFadeTimer: 0, cuefieldPairFadeResolve: null,
    window: { CuefieldTimelineExecutor: { buildCuefieldCrossfadeGains: gains } }, targetVolume: 1,
    Date: { now: () => clock },
    currentAudioOutputGain: () => 1,
    cuefieldTransitionStillCurrent: () => current,
    writeAudioOutputGain: value => writes.push(['A', value]),
    cuefieldWriteIncomingGain: (_, value) => writes.push(['B', value]),
    requestAnimationFrame: () => ++nextTimer, // Intentionally starve every animation frame.
    cancelAnimationFrame: () => {},
    setInterval: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval: id => { if (timers.delete(id)) clears++; },
  };
  vm.createContext(sandbox);
  for (const [start, end] of [['function cancelCuefieldMediaFade()', 'function claimCuefieldPreparedAudioForPlayback'], ['function cuefieldRunEqualPowerCrossfade(', 'async function cuefieldWaitForMediaTime']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), sandbox);
  }
  return { sandbox, media, writes, timers, get clears() { return clears; },
    tick(time, wallMs) { media.currentTime = time; clock = wallMs; for (const fn of Array.from(timers.values())) fn(); },
    invalidate() { current = false; } };
}

test('rAF starvation uses interval-driven media progress and never wall-time-only handoff', async () => {
  const h = harness();
  const promise = h.sandbox.cuefieldRunEqualPowerCrossfade({}, {}, 2200, { outgoingMedia: h.media });
  h.tick(20, 1000); // Outgoing stalled: wall time must not advance its fade.
  assert.deepEqual(h.writes.slice(-2), [['A', 1], ['B', 0]]);
  assert.equal(h.timers.size, 1);
  h.tick(21.1, 1400);
  near(h.writes.at(-2)[1], 0.5);
  near(h.writes.at(-1)[1], 0.5);
  h.tick(22.2, 2500);
  assert.equal(await promise, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.clears, 1);
});

for (const reason of ['pause/seek/token invalidation', 'explicit cancellation', 'stalled-media watchdog']) {
  test(`${reason} settles once and removes the paired timer`, async () => {
    const h = harness();
    const promise = h.sandbox.cuefieldRunEqualPowerCrossfade({}, {}, 2200, { outgoingMedia: h.media });
    if (reason === 'explicit cancellation') h.sandbox.cancelCuefieldMediaFade();
    else {
      if (reason === 'pause/seek/token invalidation') h.invalidate();
      h.tick(20, reason === 'stalled-media watchdog' ? 5000 : 100);
    }
    assert.equal(await promise, false);
    assert.equal(h.timers.size, 0);
    assert.equal(h.clears, 1);
    assert.equal(h.writes.length, 0);
    h.sandbox.cancelCuefieldMediaFade();
    assert.equal(h.clears, 1);
  });
}

test('only the new plain safety fade takes the paired path; effect timelines remain intact', async () => {
  const source = fs.readFileSync(require.resolve('../public/js/modules/05-playback/18-cuefield-automix-integration.js'), 'utf8');
  const body = source.slice(source.indexOf('async function runCuefieldTimeline('), source.indexOf('function cuefieldFeedbackContext('));
  let pairedCalls = 0;
  const applied = [];
  const sandbox = {
    targetVolume: 0.8, cuefieldSourceLoopRuntime: null, cuefieldBridgeEngine: null,
    clearCuefieldTimelineTimers() {}, cuefieldTransitionStillCurrent: () => true,
    cuefieldRunEqualPowerCrossfade: async () => { pairedCalls++; return true; },
    cuefieldApplyTimelineAction: async action => { applied.push(action.op); return true; },
    cuefieldDelay: async () => true, cuefieldWriteIncomingGain() {}, writeAudioOutputGain() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(body, sandbox);
  const pending = { executionMode: 'end-of-track-crossfade', preRollDuration: 0,
    plan: { chosen: { listeningSafetyFallback: true } },
    timelineExecution: { handoffDelayMs: 2200, actions: ['play', 'volume', 'volume', 'handoff'].map(op => ({ op, delayMs: 0 })) } };
  const context = { outgoingMedia: { currentTime: 27.8, duration: 30 } };
  const next = { paused: false, ended: false };
  assert.equal(await sandbox.runCuefieldTimeline(pending, next, context), true);
  assert.equal(pairedCalls, 1);
  assert.deepEqual(applied, []);
  pending.executionMode = 'filtered-pickup';
  pending.timelineExecution.actions.splice(1, 0, { op: 'filter', delayMs: 0 });
  assert.equal(await sandbox.runCuefieldTimeline(pending, next, context), true);
  assert.equal(pairedCalls, 1);
  assert.deepEqual(applied, ['play', 'filter', 'volume', 'volume', 'handoff']);
});

test('real gain writers apply each nominal paired gain once across direct and graph routes', () => {
  const output = fs.readFileSync(require.resolve('../public/js/modules/05-playback/08-audio-graph-controls.js'), 'utf8');
  const integration = fs.readFileSync(require.resolve('../public/js/modules/05-playback/18-cuefield-automix-integration.js'), 'utf8');
  for (const graphEnabled of [true, false]) {
    const gainNode = graphEnabled ? { gain: { value: 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; } } } : null;
    const incoming = { volume: 1, ...(graphEnabled ? { __mineradioPreparedAudioGraph: { gainNode: { gain: { value: 0 } } } } : {}) };
    const sandbox = { audio: { volume: 1 }, audioCtx: graphEnabled ? { currentTime: 0 } : null, gainNode,
      targetVolume: 1, audioFadeEnvelope: 1, audioSilentFloor: () => 0.0001,
      clampRange: (n, lo, hi) => Math.max(lo, Math.min(hi, n)) };
    vm.createContext(sandbox);
    vm.runInContext(output.slice(output.indexOf('function normalizeAudioFadeTarget('), output.indexOf('function holdAudioOutputGain(')), sandbox);
    vm.runInContext(integration.slice(integration.indexOf('function cuefieldWriteIncomingGain('), integration.indexOf('function prepareCuefieldPendingAudio(')), sandbox);
    const midpoint = gains(0.5, 1);
    sandbox.writeAudioOutputGain(midpoint.outgoing);
    sandbox.cuefieldWriteIncomingGain(incoming, midpoint.incoming);
    const effectiveA = sandbox.audio.volume * (gainNode ? gainNode.gain.value : 1);
    const effectiveB = incoming.volume * (incoming.__mineradioPreparedAudioGraph ? incoming.__mineradioPreparedAudioGraph.gainNode.gain.value : 1);
    near(effectiveA, 0.5);
    near(effectiveB, 0.5);
    sandbox.writeAudioOutputGain(0);
    // Existing player's inaudibility floor is retained deliberately.
    near(sandbox.audio.volume * (gainNode ? gainNode.gain.value : 1), 0.0001);
  }
});
