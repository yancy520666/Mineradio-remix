'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../../..', 'cuefield');
const beforeSource = path.join(__dirname, 'before-source');
const { planCuefieldTransitionFromCache } = require(path.join(source, 'mineradio-bridge'));
const { buildCueProfile } = require(path.join(source, 'cue-profile'));
const { buildCueProfile: buildBeforeProfile } = require(path.join(beforeSource, 'cue-profile'));
const { chooseTransitionWindow } = require(path.join(beforeSource, 'transition-window-planner'));
const { planBridge } = require(path.join(beforeSource, 'bridge-planner'));
let state = 20261009;
const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
function map(duration, start) {
  const cameraBeats = [];
  for (let i = 0, time = .13; time < duration - .04; i += 1, time += .5) {
    const impact = time >= 16 && time < 64 ? .75 : .45;
    cameraBeats.push([time, impact, .9, impact, .3, .3, .3, i % 4 ? 2 : 1, 7, .3, .3, .5]);
  }
  return { duration, gridStep: .5, cameraBeats, edgeEvidence: { audibleStart: start,
    audibleEnd: Math.max(start, duration - .1), containerEnd: duration, confidence: .86 } };
}
const checks = [];
for (let i = 0; i < 48; i += 1) {
  const a = Math.round((10 + random() * 160) * 1000) / 1000;
  const b = Math.round((.3 + random() * 120) * 1000) / 1000;
  const bStart = Math.round(Math.min(5, Math.max(0, b - .2), random() * 2) * 1000) / 1000;
  const floor = i % 6 === 0 ? a : (i % 6 === 1 ? Math.max(0, a - .5) : a * random() * .55);
  const cache = { a: { key: 'a', map: map(a, 0) }, b: { key: 'b', map: map(b, bStart) } };
  const plan = planCuefieldTransitionFromCache({ fromKey: 'a', toKey: 'b', readBeatMapCache: k => cache[k],
    minimumListenUntil: floor, enableLiveEndCrossfadeFallback: true, enableCadenceFallback: i % 4 === 0,
    ...(i % 3 === 0 ? { fromLrc: '[00:32]first repeated line\n[00:40]second repeated line\n[01:20]first repeated line\n[01:28]second repeated line',
      toLrc: '[00:32][01:20]first repeated line\n[00:40][01:28]second repeated line' } : {}) });
  if (plan.ok) {
    assert(Number.isFinite(plan.chosen.mixStart)); assert(Number.isFinite(plan.chosen.handoffAt));
    assert(plan.chosen.handoffAt > plan.chosen.mixStart);
    assert(plan.chosen.handoffAt <= a + .001);
    assert(plan.chosen.mixStart >= plan.chosen.protectedUntil - .001);
    const actions = plan.chosen.timeline;
    const handoff = actions.filter(action => action.op === 'handoff').at(-1);
    const plays = actions.filter(action => action.deck === 'B' && action.op === 'play' && action.t <= handoff.t);
    const play = plays.at(-1);
    const rate = actions.filter(action => action.deck === 'B' && action.op === 'rate' && action.t <= play.t).at(-1);
    const finalSourcePosition = play.at + (handoff.t - play.t) * (rate ? rate.value : 1);
    assert(finalSourcePosition <= b + .05);
  } else {
    assert.equal(plan.chosen.technicalFailure, true); assert.deepEqual(plan.chosen.timeline, []);
  }
  checks.push({ case: i, a, b, bStart, floor, ok: plan.ok, recipe: plan.chosen.transitionRecipe,
    error: plan.error || '', mixStart: plan.chosen.mixStart, handoffAt: plan.chosen.handoffAt });
}
function profile(duration) {
  const bars = Array.from({ length: Math.ceil(duration / 2) }, (_, i) => ({ start: i * 2, end: Math.min(duration, i * 2 + 2),
    energy: .5, lowDensity: .35, bodyDensity: .3, snapDensity: .3, beatStability: .9 }));
  return { duration, bpm: 120, gridStep: .5, bars, downbeats: bars.map(b => ({ time: b.start, confidence: .9 })),
    gridQuality: { downbeatCount: bars.length, downbeatConfidence: .9, beatStability: .9, timingStability: 1 },
    windows: { energy: [{ start: 0, end: duration, value: .5 }], bass: [{ start: 0, end: duration, value: .35 }] }, candidates: [],
    musicalProfile: { confidence: 1, noteCount: 60, key: { root: 0, mode: 'major' }, pitchClassProfile: [1,0,0,0,0,0,0,0,0,0,0,0], intervalProfile: [1,0,0] } };
}
const fromProfile = profile(128), toProfile = profile(20);
const teaserPlan = chooseTransitionWindow({ duration: 128, cueProfile: fromProfile, musicalProfile: fromProfile.musicalProfile,
  structureMap: { protectedUntil: 40, exitCandidates: [{ type: 'release', role: 'exit', source: 'structure', time: 72,
    confidence: .9, energyBefore: .6, energyAfter: .5, lowDensity: .35 }] } },
{ duration: 20, cueProfile: toProfile, musicalProfile: toProfile.musicalProfile, structureMap: { structureSource: 'beat-only',
  entryCandidates: [{ type: 'drop', role: 'entry', source: 'beat-only', time: 19.9, playFrom: 19.9, landingAt: 19.9,
    confidence: .9, energyBefore: .4, energyAfter: .5, lowDensity: .35 }] } });
const slowBridge = planBridge({ fromAnalysis: { cueProfile: { ...profile(300), bpm: 40, gridStep: 1.5 },
  structureMap: { duration: 300, protectedUntil: 40, exitCandidates: [{ time: 120 }] } },
  toAnalysis: { cueProfile: { ...profile(200), bpm: 40, gridStep: 1.5 }, structureMap: { sections: [{ type: 'drop', start: 120, confidence: .9 }] } },
  directPlan: { policy: { route: 'late-contrast-rise', compatibilityClass: 'contrast', contrastDirection: 'rising' },
    exit: { time: 120 }, evaluation: { score: .1 } } });
const timing = [];
for (const seconds of [120, 600, 1200]) {
  const beats = Array.from({ length: seconds * 2 }, (_, i) => ({ time: i * .5, combo: i % 4 ? 'push' : 'downbeat',
    confidence: .9, impact: .5, low: .3, body: .3, snap: .3 }));
  const input = { track: { duration: seconds }, map: { duration: seconds, gridStep: .5, beats } };
  const run = fn => { const start = process.hrtime.bigint(); fn(input); return Number(process.hrtime.bigint() - start) / 1e6; };
  timing.push({ seconds, beats: beats.length, beforeMs: run(buildBeforeProfile), afterMs: run(buildCueProfile) });
}
const results = { seed: 20261009, cases: checks, healthyTiming: timing,
  supplementalFindings: { teaserRecipe: teaserPlan.chosen.recipeCandidate.recipe,
    teaserTimeline: teaserPlan.chosen.timeline, slowBridge: { bars: slowBridge.bars, totalDuration: slowBridge.totalDuration,
      stageDurations: slowBridge.stageDurations }, note: 'Supplemental paths are evidence only; no policy change applied.' } };
fs.writeFileSync(path.join(__dirname, 'final-sweep.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ cases: checks.length, successful: checks.filter(c => c.ok).length,
  failureCodes: [...new Set(checks.map(c => c.error).filter(Boolean))], healthyTiming: timing,
  teaserRecipe: results.supplementalFindings.teaserRecipe, slowBridge: results.supplementalFindings.slowBridge }, null, 2));
