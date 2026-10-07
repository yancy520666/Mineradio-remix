'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');

function setup() {
  let time = 100, serial = 0;
  const rafs = new Map(), timers = new Map(), calls = [];
  const context = vm.createContext({
    performance: { now: () => time }, document: { hidden: false },
    audio: { src: 'test.wav', paused: false }, console,
    requestAnimationFrame(fn) { rafs.set(++serial, fn); return serial; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    setTimeout(fn, ms) { timers.set(++serial, { fn, due: time + ms }); return serial; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(fs.readFileSync('public/js/modules/02-visual/02a-lyric-work-scheduler.js', 'utf8'), context);
  function advance(ms) {
    time += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.due <= time) { timers.delete(id); timer.fn(); }
    }
  }
  function frame() {
    advance(17);
    const pending = [...rafs]; rafs.clear();
    for (const [, fn] of pending) fn(time);
    advance(0);
  }
  return { context, scheduler: context.lyricWorkScheduler, calls, frame, advance, rafs, timers };
}

test('lyric builds and cleanup take separate paints; replacements and cancellation reject stale work', () => {
  const { scheduler: s, calls, frame } = setup();
  s.schedule('resident', () => calls.push('old'));
  s.schedule('resident', () => calls.push('text'), { priority: 0 });
  s.schedule('quality', () => calls.push('quality'), { priority: 30 });
  s.schedule('dispose', () => calls.push('dispose'), { priority: 40 });
  s.schedule('stale', () => { throw Error('stale song ran'); }); s.cancel('stale');
  frame(); assert.deepEqual(calls, ['text']);
  frame(); assert.deepEqual(calls, ['text', 'quality']);
  frame(); assert.deepEqual(calls, ['text', 'quality', 'dispose']);
  assert.equal(s.snapshot().runs, 3);
});

test('pause keeps decoration queued, gives current text priority, and resume wakes the same jobs', () => {
  const { scheduler: s, context: c, calls, frame, advance, rafs, timers } = setup();
  c.audio.paused = true; s.hold(180);
  assert.equal(s.canPrepare(), false, 'pause also holds decorative GPU uploads');
  s.schedule('warmup', () => calls.push('warmup'));
  s.schedule('dispose', () => calls.push('dispose'), { runWhenPaused: true, priority: 40 });
  s.schedule('text', () => calls.push('text'), { urgent: true });
  frame(); assert.deepEqual(calls, ['text']);
  advance(190); frame(); assert.deepEqual(calls, ['text', 'dispose']);
  assert.equal(rafs.size + timers.size, 0, 'paused preparation must not poll every frame');
  c.audio.paused = false; s.hold(180);
  frame(); assert.equal(calls.length, 2);
  advance(190); frame(); assert.deepEqual(calls, ['text', 'dispose', 'warmup']);
  assert.equal(s.canPrepare(), true);
});

test('pending HD uploads wait through interaction hold without replacing the displayed texture', () => {
  const { context: c, scheduler: s, advance } = setup();
  let commits = 0, uploads = 0;
  const row = { qualityWanted: true, qualityPendingTexture: {} };
  Object.assign(c, {
    lyricQualityState: { frameCommits: [{ row, data: {}, priority: 1 }] },
    lyricQualityOwnerActive: () => true,
    consumeLyricRenderUploadFrameBudget: () => { uploads++; return true; },
    commitLyricRowQuality: () => { commits++; return true; },
  });
  loadFunctions(c, 'public/js/modules/02-visual/12-lyrics-row-layers.js', ['commitDeferredLyricQualityRows']);
  s.hold(180); assert.equal(c.commitDeferredLyricQualityRows(), false);
  advance(190); c.audio.paused = true; assert.equal(c.commitDeferredLyricQualityRows(), false);
  assert.equal(commits + uploads, 0);
  assert.ok(row.qualityPendingTexture, 'prepared texture remains ready for resume');
  c.audio.paused = false; assert.equal(c.commitDeferredLyricQualityRows(), true);
  assert.equal(commits, 1); assert.equal(uploads, 1);
});

test('seek preview can prepare selected HD rows even while its audio is temporarily paused', () => {
  const { context: c, scheduler: s, calls, frame } = setup();
  c.audio.paused = true;
  c.isProgressDragPreviewActive = () => true;
  assert.equal(s.canPrepare(), true);
  s.schedule('quality-build', () => calls.push('hd'));
  frame();
  assert.deepEqual(calls, ['hd']);
  c.isProgressDragPreviewActive = () => false;
  assert.equal(s.canPrepare(), false, 'ordinary pause still postpones decoration');
});

test('decoration yields to a texture upload and old cleanup cannot starve behind repeated urgent work', () => {
  const { scheduler: s, calls, frame, rafs, advance } = setup();
  s.schedule('quality', () => calls.push('quality'));
  advance(17); s.uploaded();
  const pending = [...rafs]; rafs.clear();
  for (const [, fn] of pending) fn(117);
  advance(0); assert.deepEqual(calls, []);
  frame(); assert.deepEqual(calls, ['quality']);
  s.schedule('dispose', () => calls.push('dispose'), { priority: 40 });
  for (let i = 0; i < 90 && !calls.includes('dispose'); i++) {
    s.schedule('text', () => {}, { urgent: true }); frame();
  }
  assert.ok(calls.includes('dispose'), 'aging bounds cleanup backlog');
});

test('resuming a displayed lightweight track reuses it without starting new preparation', () => {
  const { context: c, scheduler: s } = setup();
  const group = {}, data = { usesTrack: true, trackLightweight: true, renderInitialTextReady: true };
  const mesh = { parent: group, userData: { lyric: data, age: 1 } };
  Object.assign(c, {
    stageLyrics: { group, current: mesh, currentPayload: {}, currentIdx: 0 },
    stageLyricTrackSwitchBootstrapUntil: 1, stageLyricResumeWarmupLastIndex: -1, stageLyricResumeWarmupLastAt: 0,
    stageLyricNowMs: () => 100, restoreStageLyricsAfterBackground() {}, resetStageLyricResumeFrameGates() {},
    stageLyricCurrentUsesLightweightTrack: () => true,
    ensureStageLyricPlaybackWarmup() { throw Error('resume rebuilt'); },
    requestStageLyricLightweightUpgrade() { throw Error('resume upgraded'); },
    scheduleStageLyricSingleLineBootstrapPrewarm() { throw Error('resume prewarmed'); },
  });
  loadFunctions(c, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js',
    ['stageLyricCurrentCanResumeWithoutWarmup', 'markStageLyricsPlaybackResume']);
  for (let i = 0; i < 3; i++) c.markStageLyricsPlaybackResume('manual-resume-fast');
  assert.equal(c.stageLyrics.current, mesh);
  assert.equal(mesh.userData.age, 1);
  assert.equal(s.snapshot().runs, 0);
  data.renderInitialTextReady = false;
  assert.equal(c.stageLyricCurrentCanResumeWithoutWarmup(), false, 'missing text still needs preparation');
  data.renderInitialTextReady = true; mesh.userData.__mineradioDisposeQueued = true;
  assert.equal(c.stageLyricCurrentCanResumeWithoutWarmup(), false);
});

test('resident background text obeys pause and interaction hold; missing visible text can proceed', () => {
  const { context: c, scheduler: s, calls, frame, advance } = setup();
  const job = { textOnly: true, urgent: false };
  Object.assign(c, { stageLyricResidentBuild: { job }, runStageLyricResidentBuild: () => calls.push('text') });
  loadFunctions(c, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['scheduleStageLyricResidentBuildWork']);
  c.audio.paused = true; s.hold(180);
  c.scheduleStageLyricResidentBuildWork(job, 0);
  frame(); advance(200); frame(); assert.deepEqual(calls, []);
  job.urgent = true; c.scheduleStageLyricResidentBuildWork(job, 0);
  frame(); assert.deepEqual(calls, ['text']);
  job.urgent = false; c.audio.paused = false; s.hold(180);
  c.scheduleStageLyricResidentBuildWork(job, 0);
  frame(); assert.equal(calls.length, 1);
  advance(190); frame(); assert.equal(calls.length, 2);
});

test('FX editing cancels queued prewarm and quality work through the production suspend entry', () => {
  const { context: c, scheduler: s, frame } = setup();
  Object.assign(c, {
    stageLyrics: { current: null }, stageLyricPrewarm: { timer: -1 },
    lyricQualityState: { timer: 0, idle: -1 }, lyricRealtimeRefreshTimer: null, stageLyricStyleRefreshTimer: 0,
    cancelStageLyricResidentBuild() {}, cancelStageLyricPrewarmBuildOnly() {}, clearStageLyricFullTrackWarmup() {},
  });
  loadFunctions(c, 'public/js/modules/02-visual/12a-lyrics-edit-preview.js', ['suspendLyricFxEditWork']);
  for (const key of ['prewarm-start', 'quality-build']) s.schedule(key, () => { throw Error('work survived editing'); });
  c.suspendLyricFxEditWork(); frame();
  assert.equal(s.snapshot().pending.length, 0);
  assert.equal(s.snapshot().runs, 0);
});

test('cooperative preparation yields after an expensive phase and never runs a stale track job', () => {
  const { context: c } = setup();
  let elapsed = 0, cost = 3, steps = 0, cancelled = 0;
  const job = { token: 1, guardKey: 'song-a', state: {} };
  Object.assign(c, {
    stageLyricPrewarm: { build: job, token: 1 }, fx: { particleLyrics: true }, lyricsLines: [{}],
    stageLyricNowMs: () => elapsed, stageLyricPrewarmBuildGuardKey: () => 'song-a',
    stageLyricShouldYieldToPendingInput: () => false,
    stepCooperativeLyricMeshBuild: () => { elapsed += cost; steps++; return false; },
    updateStageLyricBuildStats() {}, scheduleStageLyricCooperativeWork() {}, stageLyricCooperativeNextDelay: () => 0,
    cancelStageLyricPrewarmBuildOnly: () => { cancelled++; },
  });
  loadFunctions(c, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['runStageLyricCooperativePrewarm']);
  c.runStageLyricCooperativePrewarm(job); assert.equal(steps, 1);
  cost = 0.2; c.runStageLyricCooperativePrewarm(job); assert.equal(steps, 5, 'cheap phases still have a count cap');
  c.stageLyricPrewarm.token = 2; c.runStageLyricCooperativePrewarm(job);
  assert.equal(steps, 5); assert.equal(cancelled, 1);
});
