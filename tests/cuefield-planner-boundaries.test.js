'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// The override lets QA run exactly the same isolated assertions on the saved before source.
const source = process.env.CUEFIELD_PURE_SOURCE_ROOT
  ? path.resolve(process.env.CUEFIELD_PURE_SOURCE_ROOT)
  : path.resolve(__dirname, '../cuefield');
const load = name => require(path.join(source, name));
const { buildCueProfile } = load('cue-profile');
const { evaluateCadenceBoundary } = load('boundary-evidence');
const { chooseTransitionWindow } = load('transition-window-planner');
const { planCuefieldTransitionFromCache } = load('mineradio-bridge');
const { buildTransitionArtifact, verifyTransitionArtifact } = load('transition-artifact');
const { appendCuefieldFeedback, buildCuefieldFeedbackRecord, compactTransition, readCuefieldFeedbackStats } = load('feedback-log');
const { buildCuefieldVersion } = load('version');
const { planRecipeCandidates, measureTimelineWindow } = load('recipe-planner');
const { parseLrc } = load('lrc-anchors');
const { scoreLyricLink } = load('lyric-link');

function temporaryFixture(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-cuefield-pure-'));
  try { return fn(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function meterBeats(explicit) {
  return Array.from({ length: 10 }, (_, index) => ({
    time: index * .5, confidence: .9,
    ...(explicit ? { downbeat: index === 2 || index === 6, combo: index === 2 || index === 6 ? 'downbeat' : 'push' } : {}),
  }));
}

function compressedMap(duration, audibleStart = 0) {
  const cameraBeats = [];
  for (let index = 0, time = 0; time < duration - .04; index += 1, time += .5) {
    cameraBeats.push([time, .5, .9, .4, .4, .38, .3, index % 4 ? 2 : 1, 7, .4, .3, .5]);
  }
  return { duration, gridStep: .5, cameraBeats,
    edgeEvidence: { audibleStart, audibleEnd: duration - .1, containerEnd: duration, confidence: .86 } };
}

function cadencePlan(aDuration, bDuration, floor, tailEvidence = {}) {
  return chooseTransitionWindow({ cueProfile: { duration: aDuration }, structureMap: { protectedUntil: floor } },
    { cueProfile: { duration: bDuration } }, { enableCadenceFallback: true, tailEvidence });
}

test('multi-tag and interleaved LRC preserve lyric evidence and long minute timestamps', () => {
  const repeated = parseLrc('[00:10.00][00:30.00]same chorus\n[00:20.00][00:40.00]second chorus');
  assert.deepEqual(repeated.map(line => [line.time, line.text]), [
    [10, 'same chorus'], [20, 'second chorus'], [30, 'same chorus'], [40, 'second chorus'],
  ]);
  assert.deepEqual(parseLrc('[00:10]one phrase[00:15]next phrase').map(line => [line.time, line.text]), [
    [10, 'one phrase'], [15, 'next phrase'],
  ]);
  assert.equal(parseLrc('[120:00.00]long podcast')[0].time, 7200);
  assert.equal(parseLrc('[01:02:50]old colon fraction')[0].time, 62.5);
  assert.deepEqual(parseLrc('[ar:metadata]\n[00:10]\nnot timed'), []);
});

test('English first-person links require an i token and preserve real English/CJK responses', () => {
  const score = (from, to) => scoreLyricLink({ fromLines: [{ time: 1, text: from }],
    toLines: [{ time: 1, text: to }], exitTime: 2, climaxTime: 1 });
  assert.deepEqual(score('night falls', 'you run'), { score: 0, reasons: ['no-link'] });
  assert.deepEqual(score('i wait', 'you run'), { score: .18, reasons: ['call-response'] });
  assert.deepEqual(score('我等待', '你奔跑'), { score: .18, reasons: ['call-response'] });
});

test('interrupted volume ramps keep their original time basis and ordinary ramps stay unchanged', () => {
  const timeline = curve => [{ t: 0, deck: 'B', op: 'play', at: 0, volume: 0 },
    { t: 0, deck: 'B', op: 'volume', value: 1, duration: 4000, curve },
    { t: 2, deck: 'B', op: 'volume', value: 0, duration: 0 },
    { t: 2, deck: 'B', op: 'handoff' }];
  const linear = measureTimelineWindow(timeline(''));
  assert.equal(linear.audibleStart, .32);
  assert.equal(linear.audibleOverlap, 1.68);
  const power = measureTimelineWindow(timeline('equal-power-in'));
  const expected = 4 * Math.asin(.08) / (Math.PI / 2);
  assert.equal(Math.abs(power.audibleStart - expected) <= .005, true);
  const ordinary = measureTimelineWindow([{ t: 0, deck: 'B', op: 'play', at: 0, volume: 0 },
    { t: 0, deck: 'B', op: 'volume', value: 1, duration: 4000 }, { t: 4, deck: 'B', op: 'handoff' }]);
  assert.equal(ordinary.audibleStart, .32);
  assert.equal(ordinary.audibleOverlap, 3.68);
});

test('known duration remains seconds and does not grow to the next grid beat', () => {
  const map = { duration: 10.13, gridStep: .5, beats: [{ time: 10, downbeat: true }] };
  assert.equal(buildCueProfile({ track: { duration: 10.13 }, map }).duration, 10.13);
  assert.equal(buildCueProfile({ track: { duration: 1800 }, map }).duration, 1800);
  assert.equal(buildCueProfile({ map: { gridStep: .5, beats: [{ time: 10 }] } }).duration, 10.5);
});

test('explicit meter is authoritative while unmarked beat maps keep the old index inference', () => {
  const explicit = buildCueProfile({ track: { duration: 5 }, map: { gridStep: .5, beats: meterBeats(true), gridBeats: meterBeats(true) } });
  assert.deepEqual(explicit.downbeats.map(beat => beat.time), [1, 3]);
  assert.equal(explicit.gridQuality.downbeatCount, 2);
  const implicit = buildCueProfile({ track: { duration: 5 }, map: { gridStep: .5, beats: meterBeats(false) } });
  assert.deepEqual(implicit.downbeats.map(beat => beat.time), [0, 2, 4]);
});

test('missing loudness values stay unavailable and a measured zero peak stays valid', () => {
  for (const missing of [null, undefined, '', NaN, Infinity]) {
    const profile = buildCueProfile({ map: { audioMetrics: { shortTermLufs: missing, truePeakDbtp: missing } } });
    assert.equal(profile.shadow.loudness.available, false);
    assert.equal(profile.audioMetrics.shortTermLufs, null);
    assert.equal(profile.audioMetrics.truePeakDbtp, null);
  }
  const profile = buildCueProfile({ map: { audioMetrics: { shortTermLufs: -14, truePeakDbtp: 0 } } });
  assert.equal(profile.shadow.loudness.available, true);
  assert.equal(profile.shadow.loudness.truePeakDbtp, 0);
});

test('end crossfade budgets source-zero pre-roll on both tracks and after listening protection', () => {
  const planned = cadencePlan(20, 1, 0, { audibleEnd: 20, toAudibleStart: .8, requestedDuration: 1.6 });
  const chosen = planned.chosen;
  assert.equal(chosen.recipeCandidate.recipe, 'end-of-track-crossfade');
  assert.equal(chosen.preRollDuration, .8);
  assert.equal(chosen.audibleOverlap, .2);
  assert.equal(chosen.mixStart, 19.8);
  assert.equal(chosen.handoffAt, 20);
  assert.equal(chosen.preRollDuration + chosen.audibleOverlap <= 1, true);
  assert.equal(chosen.mixStart - chosen.preRollDuration >= 0, true);
  assert.equal(cadencePlan(20, 1, 19.8, { audibleEnd: 20, toAudibleStart: .8 }).chosen.technicalFailure, true);
  const protectedPlan = cadencePlan(20, 10, 19.5, { audibleEnd: 20, toAudibleStart: .2 });
  assert.equal(protectedPlan.chosen.mixStart - protectedPlan.chosen.preRollDuration >= 19.5 - .000001, true);
  assert.equal(protectedPlan.chosen.handoffAt <= 20, true);
});

test('invalid and fully pre-rolled targets fail honestly without a zero-time executable handoff', () => {
  for (const [a, b, preRoll, code] of [
    [0, 10, 0, 'END_CROSSFADE_INVALID_DURATION'],
    [20, 0, 0, 'END_CROSSFADE_INVALID_TARGET_DURATION'],
    [20, 1, 1, 'END_CROSSFADE_INSUFFICIENT_TARGET_RUNWAY'],
  ]) {
    const plan = cadencePlan(a, b, 0, { toAudibleStart: preRoll });
    assert.equal(plan.chosen.technicalFailure, true);
    assert.equal(plan.chosen.errorCode, code);
    assert.deepEqual(plan.chosen.timeline, []);
    assert.equal(plan.diagnostics.cadenceFallbackMode, 'technical-failure');
  }
});

test('the cache bridge returns physical track durations and propagates impossible runway failure', () => {
  const cache = {
    a: { key: 'a', map: compressedMap(20.13) },
    b: { key: 'b', map: compressedMap(1, .8) },
  };
  const options = { fromKey: 'a', toKey: 'b', enableLiveEndCrossfadeFallback: true, readBeatMapCache: key => cache[key] };
  const plan = planCuefieldTransitionFromCache(options);
  assert.equal(plan.ok, true);
  assert.equal(plan.from.track.duration, 20.13);
  assert.equal(plan.to.track.duration, 1);
  assert.equal(plan.chosen.preRollDuration + plan.chosen.audibleOverlap <= 1 + .000001, true);
  assert.equal(plan.chosen.handoffAt <= 20.13, true);
  const impossible = planCuefieldTransitionFromCache({ ...options, enableCadenceFallback: true, minimumListenUntil: 20.13 });
  assert.equal(impossible.ok, false);
  assert.equal(impossible.chosen.technicalFailure, true);
  assert.deepEqual(impossible.chosen.timeline, []);
});

test('vocal avoidance cannot push terminal rescue past a measured silent tail', () => {
  const from = { cueProfile: { duration: 180, windows: { energy: [
    { start: 0, end: 160, value: .25 }, { start: 160, end: 180, value: 0 },
  ] } }, structureMap: { protectedUntil: 150, vocalWindows: [{ start: 153, end: 165 }] } };
  const plan = chooseTransitionWindow(from, { cueProfile: { duration: 30 } });
  assert.equal(plan.chosen.technicalFailure, undefined);
  assert.equal(plan.chosen.effectiveSourceEnd, 160);
  assert.equal(plan.chosen.handoffAt <= 160, true);
  assert.equal(plan.chosen.handoffAt - plan.chosen.mixStart >= 2.2, true);
  assert.equal(plan.chosen.recipeCandidate.window.runwayAvailable, true);
});

test('negative boundary distances cannot authorize an early cadence cut', () => {
  const evidence = { sources: ['audio-envelope', 'beat-grid'], audioBoundaryDistance: .02,
    barBoundaryDistance: .02, confidence: .9, vocalState: 'inactive', levelBeforeDb: -10, levelAfterDb: -14 };
  assert.equal(evaluateCadenceBoundary(evidence).eligible, true);
  const invalid = evaluateCadenceBoundary({ ...evidence, audioBoundaryDistance: -1, barBoundaryDistance: -1 });
  assert.equal(invalid.eligible, false);
  assert.equal(invalid.reasons.includes('audio-boundary-missing'), true);
  assert.equal(invalid.reasons.includes('bar-boundary-missing'), true);
});

test('new nested musical and bridge feedback round-trips and old flat feedback still migrates', () => temporaryFixture(directory => {
  const transition = { musicalEvidence: true, musicalCompatibility: .8, harmonicSimilarity: .9,
    keyCompatibility: .7, melodySimilarity: .8, musicalRisks: ['harmonic-clash'],
    bridgeSelected: true, bridgeTemplate: 'drum-build', bridgeBars: 8, bridgeClimaxType: 'hook',
    bridgeClimaxTime: 16, bridgeClimaxConfidence: .9, lyricLinkScore: .7, lyricLinkReasons: ['token-overlap'] };
  const file = path.join(directory, 'feedback.jsonl');
  const written = appendCuefieldFeedback(file, { rating: 2, transition, version: { buildSha: 'qa-build', auditionCohort: 'fixture' } });
  fs.appendFileSync(file, JSON.stringify({ rating: 3, transition }) + '\nnot-json\n');
  const stats = readCuefieldFeedbackStats(file);
  assert.equal(stats.total, 2);
  assert.deepEqual(stats.failedSamples[0].transition.musical, written.transition.musical);
  assert.deepEqual(stats.failedSamples[0].transition.bridge, written.transition.bridge);
  assert.deepEqual(stats.failedSamples[1].transition.musical, written.transition.musical);
  assert.deepEqual(stats.failedSamples[1].transition.bridge, written.transition.bridge);
  assert.equal(stats.byCohort.some(bucket => bucket.key === 'legacy-unversioned'), true);
  assert.equal(stats.byCohort.some(bucket => bucket.key === 'fixture@qa-build'), true);
  const falseNested = compactTransition({ ...transition, musical: { evidence: false, compatibility: 0 }, bridge: { selected: false, bars: 4 } });
  assert.equal(falseNested.musical.evidence, false);
  assert.equal(falseNested.musical.compatibility, 0);
  assert.equal(falseNested.bridge.selected, false);
  assert.equal(falseNested.bridge.bars, 4);
  assert.throws(() => buildCuefieldFeedbackRecord({ rating: 4 }), /RATING_MUST_BE/);
}));

test('artifact identity includes bounded bridge synthesis parameters and detects changed payloads', () => {
  const artifact = template => buildTransitionArtifact({ chosen: { transitionRecipe: 'synthetic-bridge', timeline: [
    { t: 0, deck: 'A', op: 'bridge', duration: 8000, bridge: { template, bars: 4, bpmFrom: 120, bpmTo: 120,
      stageDurations: [2, 4, 2, 999], privateExtra: 'discarded' } },
  ] } });
  const first = artifact('drum-build');
  assert.equal(verifyTransitionArtifact(first), true);
  assert.equal(Object.isFrozen(first.timeline[0].bridge), true);
  assert.deepEqual(first.timeline[0].bridge.stageDurations, [2, 4, 2]);
  assert.equal('privateExtra' in first.timeline[0].bridge, false);
  assert.notEqual(first.artifactId, artifact('echo-break').artifactId);
  const changed = JSON.parse(JSON.stringify(first));
  changed.timeline[0].bridge.bpmTo = 124;
  assert.throws(() => verifyTransitionArtifact(changed), /INTEGRITY_FAILED/);
});

test('split Cuefield runtime and loader changes update the version fingerprint', () => temporaryFixture(directory => {
  const modules = path.join(directory, 'public/js/modules/05-playback');
  fs.mkdirSync(modules, { recursive: true });
  const runtime = path.join(modules, '16-cuefield-automix-core.js');
  const loader = path.join(directory, 'public/js/index-loader.js');
  fs.writeFileSync(runtime, 'original'); fs.writeFileSync(loader, 'load-original');
  const version = () => buildCuefieldVersion({ root: directory, env: {} }).buildSha;
  const initial = version(); assert.equal(version(), initial);
  fs.writeFileSync(runtime, 'changed'); const changed = version(); assert.notEqual(changed, initial);
  fs.writeFileSync(loader, 'load-changed'); assert.notEqual(version(), changed);
  const final = version();
  fs.writeFileSync(path.join(modules, '19-audio-router.js'), 'unrelated'); assert.equal(version(), final);
  assert.throws(() => buildCuefieldVersion({ root: directory, env: { CUEFIELD_VARIANT_ID: '../bad' } }), /INVALID_CUEFIELD/);
}));

function healthyProfile(duration) {
  const bars = Array.from({ length: duration / 2 }, (_, index) => ({
    start: index * 2, end: index * 2 + 2, energy: .5, lowDensity: .35, bodyDensity: .3, snapDensity: .3, beatStability: .9,
  }));
  return { duration, bpm: 120, gridStep: .5, bars, downbeats: bars.map(bar => ({ time: bar.start, confidence: .9 })),
    gridQuality: { downbeatCount: bars.length, downbeatConfidence: .9, beatStability: .9, timingStability: 1 },
    windows: { energy: [{ start: 0, end: duration, value: .5 }], bass: [{ start: 0, end: duration, value: .35 }] },
    candidates: [], musicalProfile: { confidence: 1, noteCount: 60, key: { root: 0, mode: 'major' },
      pitchClassProfile: [1,0,0,0,0,0,0,0,0,0,0,0], intervalProfile: [1,0,0] } };
}

test('ordinary recipes retain finite second timestamps, millisecond fades and exact landing equations', () => {
  const result = planRecipeCandidates(healthyProfile(128), healthyProfile(96), {
    sectionChoice: { score: .9, exit: { role: 'exit', type: 'release', source: 'structure', time: 72, confidence: .9 },
      entry: { role: 'entry', type: 'drop', source: 'structure', time: 36, confidence: .9 },
      evaluation: { tier: 'magic', risks: [] } }, routePolicy: { route: 'structure-mix' },
  });
  assert.equal(result.candidates.length, 11);
  assert.equal(result.chosen.recipe, 'tease-roll-double-drop');
  for (const candidate of result.candidates) {
    assert.equal(Number.isFinite(candidate.score), true);
    assert.equal(Number.isFinite(candidate.window.audibleOverlap), true);
    assert.equal(Math.abs(candidate.window.landingError) <= .05, true);
    for (const action of candidate.timeline) {
      assert.equal(Number.isFinite(action.t), true);
      if ('duration' in action) assert.equal(Number.isFinite(action.duration) && action.duration >= 0, true);
      if (action.op === 'play') assert.equal(Number.isFinite(action.at) && action.at >= 0, true);
    }
  }
});

test('a trusted climax near target EOF cannot authorize a teaser that plays beyond the target', () => {
  const fromProfile = healthyProfile(128), toProfile = healthyProfile(20);
  const result = planRecipeCandidates(fromProfile, toProfile, {
    sectionChoice: { score: .9,
      exit: { type: 'release', role: 'exit', source: 'structure', time: 72, confidence: .9 },
      entry: { type: 'drop', role: 'entry', source: 'beat-only', time: 19.9, confidence: .9 },
      evaluation: { tier: 'magic', risks: [] } }, routePolicy: { route: 'structure-mix' },
  });
  for (const recipe of ['hook-teaser', 'tease-roll-double-drop']) {
    const candidate = result.candidates.find(candidate => candidate.recipe === recipe);
    assert.equal(candidate.eligible, false);
    assert.equal(candidate.eligibilityReason, 'hook teaser exceeds target duration');
  }
  assert.notEqual(result.chosen.recipe, 'tease-roll-double-drop');
  const exit = { type: 'release', role: 'exit', source: 'structure', time: 72, confidence: .9,
    energyBefore: .6, energyAfter: .5, lowDensity: .35 };
  const entry = { type: 'drop', role: 'entry', source: 'beat-only', time: 19.9, playFrom: 19.9,
    landingAt: 19.9, confidence: .9, energyBefore: .4, energyAfter: .5, lowDensity: .35 };
  const window = chooseTransitionWindow({ duration: 128, cueProfile: fromProfile, musicalProfile: fromProfile.musicalProfile,
    structureMap: { protectedUntil: 40, exitCandidates: [exit] } },
  { duration: 20, cueProfile: toProfile, musicalProfile: toProfile.musicalProfile,
    structureMap: { structureSource: 'beat-only', entryCandidates: [entry] } });
  assert.notEqual(window.chosen.recipeCandidate.recipe, 'tease-roll-double-drop');
});
