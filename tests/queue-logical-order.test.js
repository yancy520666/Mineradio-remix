'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const format = require('../public/js/playback-checkpoint-format');
const actions = 'public/js/modules/05-playback/10-queue-actions.js';
const controls = 'public/js/modules/05-playback/14-player-controls.js';
function fixture() {
  const snapshots = [], noop = () => {};
  const c = vm.createContext({
    playQueue: ['A', 'B', 'C', 'D'].map(name => ({ name })), currentIdx: 2,
    playMode: 'loop', audio: { currentTime: 83.5, src: 'C.mp3', paused: false },
    queueLogicalOrderState: { queue: null, next: 0 },
    cloneSong: song => ({ ...song }), queueItemKey: song => song.name,
    safeRenderQueuePanel: noop, safeShelfRebuild: noop, showToast: noop,
    updatePlayModeButton: noop, syncActiveAudioRepeatMode: noop,
    saveLastPlaybackSnapshot: () => snapshots.push(c.playMode),
    Math: Object.assign(Object.create(Math), { random: () => 0 }), console,
  });
  loadFunctions(c, actions, ['syncQueueLogicalOrder', 'queueLogicalEntries', 'moveQueueLogicalEntry', 'restoreQueueLogicalOrder', 'queueSong', 'moveQueueIndex', 'moveQueueIndexToTop']);
  loadFunctions(c, controls, ['shuffleArrayInPlace', 'reorderQueueForShufflePlaybackOrder', 'shuffleQueue', 'cyclePlayMode', 'playModeLabel']);
  return { c, snapshots };
}
const names = c => Array.from(c.playQueue, song => song.name);
test('shuffle, single repeat and list repeat preserve the selected media and restore logical order', () => {
  const { c, snapshots } = fixture(), queue = c.playQueue, audio = c.audio;
  for (let cycle = 0; cycle < 4; cycle++) {
    c.cyclePlayMode();
    assert.equal(c.playMode, 'shuffle'); assert.equal(c.playQueue[c.currentIdx].name, 'C');
    assert.notDeepEqual(names(c), ['A', 'B', 'C', 'D']);
    c.cyclePlayMode(); assert.equal(c.playMode, 'single');
    assert.deepEqual(names(c), ['A', 'B', 'C', 'D']);
    c.cyclePlayMode(); assert.equal(c.playMode, 'loop');
    assert.equal(c.playQueue[c.currentIdx].name, 'C'); assert.equal(c.currentIdx, 2);
    assert.equal(c.playQueue, queue); assert.equal(c.audio, audio); assert.equal(audio.currentTime, 83.5);
  }
  assert.equal(snapshots.length, 16);
});
test('new and removed entries during shuffle cannot resurrect an obsolete backup', () => {
  const { c } = fixture(); c.cyclePlayMode();
  c.playQueue.splice(c.playQueue.findIndex(s => s.name === 'A'), 1);
  c.queueSong({ name: 'E' }); c.cyclePlayMode(); c.cyclePlayMode();
  assert.deepEqual(names(c), ['B', 'C', 'D', 'E']); assert.equal(c.playQueue[c.currentIdx].name, 'C');
});
test('next insertion deduplicates the live entry and moves it after the current logical entry', () => {
  const { c } = fixture(); c.cyclePlayMode();
  c.queueSong({ name: 'A' }, { position: 'next' });
  c.queueSong({ name: 'A' }, { position: 'next' });
  c.queueSong({ name: 'E' }, { position: 'next' });
  c.cyclePlayMode(); c.cyclePlayMode();
  assert.deepEqual(names(c), ['B', 'C', 'E', 'A', 'D']);
  assert.equal(c.playQueue[c.currentIdx].name, 'C');
});
test('manual reordering moves only the chosen logical entry and survives repeated shuffle', () => {
  const { c } = fixture(); c.cyclePlayMode();
  const index = c.playQueue.findIndex(s => s.name === 'B');
  c.moveQueueIndex(index, c.playQueue.length - 1);
  c.moveQueueIndex(c.playQueue.findIndex(s => s.name === 'D'), 0);
  c.cyclePlayMode(); c.cyclePlayMode();
  assert.deepEqual(names(c), ['D', 'A', 'C', 'B']);
  assert.equal(c.playQueue[c.currentIdx].name, 'C');
});
test('replacing the queue resets ranks while progressive pages retain their provider order', () => {
  const { c } = fixture(); c.cyclePlayMode();
  c.playQueue = [{ name: 'X', _queueOrder: 100 }, { name: 'Y', _queueOrder: 0 }]; c.currentIdx = 0;
  c.syncQueueLogicalOrder();
  const page = [{ name: 'Z' }, { name: 'W' }];
  page.forEach(s => { s._queueOrder = c.queueLogicalOrderState.next++; });
  c.playQueue.push(...page.reverse());
  c.cyclePlayMode();
  assert.deepEqual(names(c), ['X', 'Y', 'Z', 'W']);
});
test('checkpoint normalization retains shuffle mode and logical positions across restart', () => {
  const { c } = fixture(); c.cyclePlayMode();
  const payload = format.normalize({ version: 1, savedAt: Date.now(), currentIdx: c.currentIdx,
    currentTime: 83.5, duration: 200, playing: true, current: c.playQueue[c.currentIdx],
    playMode: c.playMode, queue: c.playQueue });
  const restored = fixture().c; restored.playQueue = payload.queue; restored.currentIdx = payload.currentIdx;
  restored.playMode = payload.playMode; restored.syncQueueLogicalOrder(true);
  restored.cyclePlayMode(); restored.cyclePlayMode();
  assert.deepEqual(names(restored), ['A', 'B', 'C', 'D']);
  assert.equal(restored.playQueue[restored.currentIdx].name, 'C'); assert.equal(payload.currentTime, 83.5);
});
test('the explicit shuffle button outside shuffle playback commits a manual logical order', () => {
  const { c } = fixture(); c.shuffleQueue(); const manual = names(c);
  c.cyclePlayMode(); c.cyclePlayMode(); c.cyclePlayMode();
  assert.deepEqual(names(c), manual); assert.equal(c.playQueue[c.currentIdx].name, 'C');
});
test('mode changes before restored playback starts save mode and order without erasing progress', () => {
  const { c } = fixture(); let stored;
  Object.assign(c, { audio: null, restoredLastPlaybackSnapshot: { current: { name: 'C' }, currentTime: 83.5, duration: 200 },
    currentCoverSong: () => c.playQueue[c.currentIdx], performance: { now: () => 10 },
    lastPlaybackSnapshotMonotonicAt: null, lastPlaybackSnapshotSavedAt: 0,
    getPlaybackCurrentSeconds: () => 0, getPlaybackDurationSeconds: () => 0, playbackDurationFromSong: () => 200,
    localStorage: { setItem: (_key, value) => { stored = JSON.parse(value); } },
    LAST_PLAYBACK_STORE_KEY: 'fixture', persistPlaybackCheckpoint: () => {} });
  loadFunctions(c, 'public/js/modules/05-playback/09-queue-snapshot-autoplay.js', ['playbackRestoreSongSnapshot', 'saveLastPlaybackSnapshot']);
  c.cyclePlayMode(); assert.equal(stored.playMode, 'shuffle'); assert.equal(stored.currentTime, 83.5);
  c.cyclePlayMode(); c.cyclePlayMode();
  assert.equal(stored.playMode, 'loop'); assert.equal(stored.currentTime, 83.5);
  assert.deepEqual(stored.queue.map(s => s.name), ['A', 'B', 'C', 'D']);
});
