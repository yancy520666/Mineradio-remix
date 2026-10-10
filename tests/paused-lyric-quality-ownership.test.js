'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture() {
  const scheduled = [], cancelled = [], built = [], committed = [], capacity = [];
  let consumed = 0;
  const row = () => ({ renderWindowActive: true, qualityGeneration: 1, qualityQueuedKey: 'target', qualityWanted: true, qualityHotUntil: 1000, lineMask: {} });
  const visible = row(), offscreen = row(), outgoing = row(); offscreen.renderWindowActive = false;
  const currentData = { pausedFxCommitToken: 7, pausedFxCommitRows: [visible], rowLayers: [visible, offscreen] }, oldData = { rowLayers: [outgoing] };
  const job = (data, row, priority) => ({ data, row, priority, globalGeneration: 1, rowGeneration: 1, key: 'target', bytes: 16, tier: 2 });
  const c = vm.createContext({ console, stageLyrics: { current: { userData: { lyric: currentData } } }, trackSwitchToken: 7,
    audio: { paused: true }, isLyricFxEditPreviewActive: () => false,
    lyricQualityState: { queue: [], timer: 0, idle: 0, generation: 1, residents: [], frameCommits: [] },
    lyricWorkScheduler: { canPrepare: () => false, cancel: key => cancelled.push(key), schedule: (key, fn, options) => scheduled.push({ key, fn, options }) },
    lyricQualityNowMs: () => 100, lyricQualityInputPending: () => false, isProgressDragPreviewActive: () => false,
    lyricQualityEnsureCapacity: (bytes, row, tier) => { capacity.push({ bytes, row, tier }); return true; },
    makeLyricQualityTexture: mask => { built.push(mask); return { texture: {}, tier: 2, key: 'target', bytes: 16 }; },
    lyricQualityRememberRow: row => c.lyricQualityState.residents.push(row), updateLyricQualityStats() {},
    setTimeout() { throw new Error('a held paused job must not start a polling timeout'); }, clearTimeout() {},
    consumeLyricRenderUploadFrameBudget: () => { if (consumed) return false; consumed++; return true; },
    commitLyricRowQuality: row => { committed.push(row); return true; } });
  loadFunctions(c, 'public/js/modules/02-visual/12a-lyrics-edit-preview.js', ['lyricFxEditActive', 'lyricFxPausedCommitActive']);
  loadFunctions(c, 'public/js/modules/02-visual/12-lyrics-row-layers.js', ['lyricQualityOwnerActive', 'scheduleLyricQualityBuild', 'commitDeferredLyricQualityRows']);
  return { c, currentData, oldData, visible, offscreen, outgoing, job, scheduled, cancelled, built, committed, capacity, resetBudget() { consumed = 0; }, used: () => consumed };
}
test('explicit paused quality replaces the held key and builds only the current visible snapshot owner', () => {
  const f = fixture();
  f.c.lyricQualityState.queue.push(f.job(f.oldData, f.outgoing, 0));
  f.c.scheduleLyricQualityBuild(0); assert.equal(f.scheduled[0].options.runWhenPaused, false);
  f.c.lyricQualityState.queue.push(f.job(f.currentData, f.offscreen, 1), f.job(f.currentData, f.visible, 10));
  f.c.scheduleLyricQualityBuild(0); assert.deepEqual(f.cancelled, ['quality-build']);
  assert.equal(f.scheduled[1].options.runWhenPaused, true);
  f.scheduled[1].fn({ didTimeout: true, timeRemaining: () => 8 });
  assert.deepEqual(f.built, [f.visible.lineMask]);
  assert.equal(f.c.lyricQualityState.queue.length, 2);
  assert(f.capacity.every(item => item.row === f.visible && item.bytes === 16 && item.tier === 2), 'original item size and tier still go through capacity checks');
  assert(f.visible.qualityPendingTexture); assert.equal(f.outgoing.qualityPendingTexture, undefined);
  const remainingRun = f.scheduled.at(-1); assert.equal(remainingRun.options.runWhenPaused, false);
  const schedules = f.scheduled.length; remainingRun.fn({ didTimeout: true, timeRemaining: () => 8 });
  assert.equal(f.scheduled.length, schedules, 'no eligible paused job means no rearm/poll');
});
test('deferred upload obeys the one-upload budget and excludes outgoing, offscreen and stale tokens', () => {
  const f = fixture();
  for (const row of [f.visible, f.offscreen, f.outgoing]) row.qualityPendingTexture = {};
  f.c.lyricQualityState.frameCommits = [f.job(f.oldData, f.outgoing, 0), f.job(f.currentData, f.offscreen, 1), f.job(f.currentData, f.visible, 10)];
  assert.equal(f.c.commitDeferredLyricQualityRows(), true); assert.deepEqual(f.committed, [f.visible]); assert.equal(f.used(), 1);
  assert.equal(f.c.commitDeferredLyricQualityRows(), false); assert.equal(f.committed.length, 1);
  f.resetBudget(); f.c.trackSwitchToken++;
  assert.equal(f.c.commitDeferredLyricQualityRows(), false); assert.equal(f.used(), 0);
  f.c.trackSwitchToken = 7; f.c.stageLyrics.current = { userData: { lyric: f.oldData } };
  assert.equal(f.c.commitDeferredLyricQualityRows(), false);
});
