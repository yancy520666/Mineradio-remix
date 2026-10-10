'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { loadFunctions } = require('./helpers/classic-functions');
const stagePath = 'public/js/modules/02-visual/14-stage-lyrics-rendering.js';
const offsetPath = 'public/js/modules/06-lyrics/06-lyric-timing-offset.js';

function schedulerContext() {
  let now = 100, serial = 0;
  const timers = new Map(), frames = new Map();
  const c = vm.createContext({
    console, performance: { now: () => now }, document: { hidden: false },
    audio: { src: 'fixture.wav', paused: true },
    setTimeout(fn, ms) { timers.set(++serial, { fn, due: now + ms }); return serial; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  vm.runInContext(fs.readFileSync('public/js/modules/02-visual/02a-lyric-work-scheduler.js', 'utf8'), c);
  function frame() {
    now += 17;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
    const pending = [...frames]; frames.clear();
    for (const [, run] of pending) run(now);
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
  }
  return { c, frame, timers, frames };
}

test('explicit raster commit finishes on a paused track; ordinary prewarm still waits', () => {
  const { c, frame } = schedulerContext();
  const calls = [];
  const current = { userData: { lyric: {} } };
  Object.assign(c, {
    stageLyrics: { current, currentIdx: 0 }, stageLyricPrewarm: { build: null, token: 3 },
    fx: { particleLyrics: true }, lyricsLines: [{ t: 0, text: 'fixture' }],
    stageLyricNowMs: () => c.performance.now(), stageLyricPlaybackSeconds: () => 1,
    getAdjustedLyricPlaybackTime: time => time, findStageLyricIndexAtTime: () => 0,
    buildStageLyricDisplayPayload: () => ({ mode: 'single', entries: [{ text: 'fixture' }], trackIndex: 0 }),
    stageLyricPreparedKey: () => 'fixture-key', stageLyricPrewarmBuildGuardKey: () => 'fixture-style',
    cancelStageLyricResidentBuild() {}, disposeStageLyricPrewarmMesh() {}, clearStageLyricSingleLinePrewarmCache() {},
    cancelStageLyricPrewarmBuildOnly() { c.stageLyricPrewarm.build = null; },
    beginCooperativeLyricMeshBuild: () => ({ totalRows: 1, totalPhases: 2 }),
    stepCooperativeLyricMeshBuild() { calls.push('step'); return true; },
    stageLyricShouldYieldToPendingInput: () => false, updateStageLyricBuildStats() {},
    finishStageLyricCooperativePrewarm(job) { calls.push('commit'); c.stageLyricPrewarm.build = null; },
  });
  loadFunctions(c, stagePath, ['startStageLyricCooperativePrewarm', 'scheduleStageLyricCooperativeWork',
    'runStageLyricCooperativePrewarm', 'stageLyricCooperativeNextDelay']);
  loadFunctions(c, 'public/js/modules/02-visual/12a-lyrics-edit-preview.js', ['finishLyricFxEditWork']);
  c.finishLyricFxEditWork(true);
  for (let i = 0; i < 150; i++) frame();
  assert.deepEqual(calls, ['step', 'commit'], 'user-selected final glyphs cannot wait indefinitely for play');
  assert.equal(c.stageLyricPrewarm.build, null);
  c.startStageLyricCooperativePrewarm({ mode: 'single' }, 'normal', 3, true, 'playback-resume');
  for (let i = 0; i < 150; i++) frame();
  assert.deepEqual(calls, ['step', 'commit'], 'ordinary decoration still respects pause');
});

test('paused timing calibration applies the adjusted line through the existing restoration path', () => {
  const calls = [];
  const group = {}, scene = { add(object) { object.parent = this; } }; group.parent = scene;
  const oldMesh = { parent: group, userData: { lyric: {}, state: 'in', age: 1 } };
  const c = vm.createContext({
    fx: { particleLyrics: true, lyricPauseHold: true },
    audio: { src: 'fixture.wav', paused: true, currentTime: 1.8, ended: false },
    trackSwitchToken: 1, playing: false, stageLyricIntro: null, scene,
    lyricsLines: [{ t: 0, text: 'A' }, { t: 2, text: 'B' }],
    stageLyrics: { group, current: oldMesh, currentIdx: 0, currentText: 'A', currentPayload: { text: 'A' } },
    stageLyricPlaybackSeconds: () => 1.8, getAdjustedLyricPlaybackTime: time => time + 0.5,
    findStageLyricIndexAtTime: time => time >= 2 ? 1 : 0,
    buildStageLyricDisplayPayload: index => ({ key: 'line-' + index, text: index ? 'B' : 'A' }),
    currentLyricFallbackText: () => 'Title', stageLyricProgressPreviewActive: () => false,
    showStageLine(payload) {
      calls.push(payload.text); c.stageLyrics.currentText = payload.text;
      c.stageLyrics.current = { parent: group, userData: { lyric: {}, age: 0 } };
      return true;
    },
    getLyricLineProgress: () => 0.4, lyricLineHasNativeKaraoke: () => false,
    updateLyricMeshProgress() {}, scheduleStageLyricFullTrackWarmup() {}, resetStageLyricResumeFrameGates() {},
    pushDesktopLyricsState: () => calls.push('desktop'),
  });
  loadFunctions(c, stagePath, ['stageLyricIntroActive', 'restoreCurrentStageLyrics', 'restorePausedStageLyrics', 'tickLyricsParticles']);
  loadFunctions(c, offsetPath, ['refreshLyricTimingAfterOffsetChange']);
  c.refreshLyricTimingAfterOffsetChange();
  c.tickLyricsParticles();
  assert.equal(c.stageLyrics.currentIdx, 1);
  assert.equal(c.stageLyrics.currentText, 'B');
  assert.deepEqual(calls, ['B', 'desktop']);
  assert.equal(c.audio.paused, true);
  calls.length = 0; c.fx.lyricPauseHold = false;
  c.refreshLyricTimingAfterOffsetChange();
  assert.deepEqual(calls, ['desktop'], 'pause-hide preference must not reveal or rebuild the hidden caption');
  assert.equal(c.audio.paused, true);
});

test('playing timing changes leave restoration to the normal lyric tick', () => {
  let restored = 0, desktop = 0;
  const c = vm.createContext({ stageLyrics: { currentIdx: 0 },
    audio: { paused: false }, restorePausedStageLyrics() { restored++; },
    pushDesktopLyricsState() { desktop++; } });
  loadFunctions(c, offsetPath, ['refreshLyricTimingAfterOffsetChange']);
  c.refreshLyricTimingAfterOffsetChange();
  assert.equal(restored, 0); assert.equal(desktop, 1); assert.equal(c.stageLyrics.currentIdx, -999);
});
