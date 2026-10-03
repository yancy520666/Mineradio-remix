'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

function fixture(index = 2) {
  const calls = [], snapshots = [];
  const noop = () => {};
  const c = vm.createContext({
    playQueue: ['A', 'B', 'C', 'D'].map(name => ({ name })), currentIdx: index,
    trackSwitchToken: 7, pendingQueuePlaybackToken: 0, playing: true, audioFadeSerial: 0,
    startupRestoreHomePending: false, pendingPlaybackResumeAt: 0, restoredLastPlaybackSnapshot: null,
    currentLocalSong: null, LAST_PLAYBACK_STORE_KEY: 'fixture', localStorage: { removeItem: noop },
    audio: { src: 'C.wav', paused: false, onended: noop,
      __mineradioPlaybackStartedToken: 7, __mineradioQueueItemKey: 'C',
      pause() { this.paused = true; }, removeAttribute() { this.src = ''; }, load: noop },
    playQueueAt: async (idx, options) => { calls.push({ idx, options }); c.currentIdx = idx; c.trackSwitchToken++; },
    queueItemKey: song => song.name,
    playbackMediaMatchesCurrentQueueItem: media => media.__mineradioQueueItemKey === c.playQueue[c.currentIdx]?.name,
    cancelPlaylistQueueHydration: noop, safeRenderQueuePanel: noop, safeShelfRebuild: noop,
    updateCustomCoverButton: noop, updateCustomLyricControls: noop, updateEmptyHomeVisibility: noop,
    saveLastPlaybackSnapshot: () => snapshots.push({ current: c.playQueue[c.currentIdx]?.name, idx: c.currentIdx }),
    cancelSourceFallbackRecovery: noop, clearAlbumGaplessPreload: noop, resetCuefieldAutoMix: noop,
    clearPlaybackResumeWatchdogs: noop, playbackResumeRecovery: { serial: 0, pending: true },
    cancelBeatAnalysisTimer: noop, cancelBeatPrefetchTimer: noop, cancelDjBeatAnalysisTimer: noop,
    beatMapToken: 0, djBeatMapToken: 0, localBeatAnalysis: { active: false }, cancelLocalBeatAnalysis: noop,
    clearAudioFadeTimers: noop, setPlayIcon: noop, hideLoading: noop, forcePlaybackControlsInteractive: noop,
    syncPlaybackStateFromAudioEvent: noop, finalizeListenSession: noop,
    console, Promise,
  });
  loadFunctions(c, 'public/js/modules/05-playback/12-playback-switch-core.js', ['pauseCurrentAudioForTrackSwitch']);
  loadFunctions(c, 'public/js/modules/05-playback/14-player-controls.js', ['clearQueue', 'removeFromQueue']);
  return { c, calls, snapshots };
}

test('removing before the current song preserves its identity and the next song', async () => {
  const { c, calls, snapshots } = fixture();
  await c.removeFromQueue(0);
  assert.equal(c.currentIdx, 1); assert.equal(c.playQueue[c.currentIdx].name, 'C');
  assert.equal(c.playQueue[(c.currentIdx + 1) % c.playQueue.length].name, 'D');
  assert.equal(c.audio.paused, false); assert.equal(calls.length, 0);
  assert.deepEqual(snapshots, [{ current: 'C', idx: 1 }]);
});

test('removing the current song plays its successor, including wraparound and shuffle order', async () => {
  for (const index of [2, 3]) {
    const { c, calls } = fixture(index);
    await c.removeFromQueue(index);
    assert.equal(calls.length, 1);
    assert.equal(c.playQueue[calls[0].idx].name, index === 2 ? 'D' : 'A');
    assert.equal(calls[0].options.skipShuffleOrder, true);
    assert.equal(calls[0].options.resumeAt, 0);
  }
});

test('removing the last song stops media and invalidates outstanding playback', async () => {
  const { c, calls, snapshots } = fixture(0);
  c.playQueue = [{ name: 'C' }];
  await c.removeFromQueue(0);
  assert.equal(c.currentIdx, -1); assert.equal(c.playQueue.length, 0);
  assert.equal(c.audio.paused, true); assert.equal(c.audio.src, ''); assert.equal(c.audio.onended, null);
  assert.equal(c.trackSwitchToken, 8); assert.equal(c.playing, false);
  assert.equal(c.playbackResumeRecovery.pending, false); assert.equal(calls.length, 0);
  assert.equal(snapshots.at(-1).idx, -1);
});

test('removing a paused current song selects the successor without resuming it', async () => {
  const { c, calls } = fixture(); c.audio.paused = true; c.audio.ended = false;
  await c.removeFromQueue(2);
  assert.equal(c.playQueue[c.currentIdx].name, 'D');
  assert.equal(calls[0].options.selectOnly, true);
});

test('removing before an unresolved playback restarts the same song at its new index', async () => {
  const { c, calls } = fixture(); c.pendingQueuePlaybackToken = 7; c.audio = null;
  await c.removeFromQueue(0);
  assert.equal(calls.length, 1); assert.equal(calls[0].idx, 1);
  assert.equal(c.playQueue[c.currentIdx].name, 'C'); assert.equal(c.trackSwitchToken, 8);
});

test('removing a later item or an invalid index cannot change current playback', async () => {
  const { c, calls } = fixture();
  for (const idx of [-1, 4, NaN, 0.5, '0']) await c.removeFromQueue(idx);
  assert.equal(c.playQueue.length, 4);
  await c.removeFromQueue(3);
  assert.equal(c.currentIdx, 2); assert.equal(c.playQueue[c.currentIdx].name, 'C');
  assert.equal(c.audio.paused, false); assert.equal(calls.length, 0);
});
