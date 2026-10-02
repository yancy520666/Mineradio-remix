'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

test('known offline entries do not exhaust the playback failure budget before an available song', async () => {
  for (const allOffline of [false, true]) {
    let terminal = 0, visited = 0;
    const queue = Array.from({ length: 41 }, (_, i) => ({ type: 'local', localFileId: String(i), name: 'fixture-' + i }));
    const c = vm.createContext({
      trackSwitchToken: 1, playQueue: queue,
      window: { desktopWindow: { resolveLocalMusicTrack: async () => ({ localMissing: true }) } },
      showSourceFallbackNotice() {}, settleSourceFallbackTerminal: () => { terminal++; return false; },
    });
    loadFunctions(c, 'public/js/modules/05-playback/13-playback-start-audio.js', ['skipUnavailableLocalQueueSong', 'playLocalQueueSong']);
    c.playQueueAt = async (index, opts) => {
      visited++;
      if (!allOffline && index === 40) return true;
      c.trackSwitchToken++;
      return c.playLocalQueueSong(queue[index], index, c.trackSwitchToken, false, opts, 0);
    };
    const result = await c.playLocalQueueSong(queue[0], 0, 1, false, {}, 0);
    assert.equal(result, !allOffline);
    assert.equal(terminal, allOffline ? 1 : 0);
    assert.equal(visited, 40, 'scan at most one queue cycle, including over 12 offline entries');
  }
});

test('actual local read failures still stop at twelve attempts', async () => {
  let terminal = 0;
  const c = vm.createContext({ trackSwitchToken: 1, playQueue: Array.from({ length: 41 }, () => ({ name: 'fixture' })),
    showSourceFallbackNotice() {}, settleSourceFallbackTerminal: () => { terminal++; return false; } });
  loadFunctions(c, 'public/js/modules/05-playback/13-playback-start-audio.js', ['skipUnavailableLocalQueueSong']);
  c.playQueueAt = (index, opts) => c.skipUnavailableLocalQueueSong(c.playQueue[index], index, 1, 'decode failed', opts);
  assert.equal(await c.skipUnavailableLocalQueueSong(c.playQueue[0], 0, 1, 'decode failed', {}), false);
  assert.equal(terminal, 1);
});

test('offline skips name the song, coalesce notices and terminate instead of cycling', async () => {
  const notices = [], attempts = [];
  let terminal = 0;
  const context = vm.createContext({
    window: { desktopWindow: { resolveLocalMusicTrack: async () => ({ localMissing: true }) } },
    trackSwitchToken: 1, playQueue: [{ type: 'local', name: '离线歌曲', localFileId: 'fixture' }, { type: 'local', name: '下一首', localFileId: 'fixture2' }],
    showSourceFallbackNotice: (...args) => notices.push(args),
    settleSourceFallbackTerminal: () => { terminal++; return false; },
    playQueueAt: async (index, options) => { attempts.push({ index, options }); return true; }
  });
  loadFunctions(context, 'public/js/modules/05-playback/13-playback-start-audio.js', ['skipUnavailableLocalQueueSong', 'playLocalQueueSong', 'handleLocalPlaybackReadFailure']);
  const song = context.playQueue[0];
  assert.equal(await context.playLocalQueueSong(song, 0, 1, false, {}, 0), true);
  assert.equal(attempts[0].index, 1); assert.match(notices[0][1], /离线歌曲.*离线或已移动/);
  const key = notices[0][2].coalesceKey;
  context.skipUnavailableLocalQueueSong(song, 1, 1, '地址失效', { localMissingChecked: 1, localSkipNoticeKey: key });
  assert.equal(terminal, 1); assert.equal(notices[1][2].coalesceKey, key); assert.match(notices[1][0], /已停止/);
  const count = notices.length;
  context.trackSwitchToken = 2;
  assert.equal(await context.playLocalQueueSong(song, 0, 1, false, {}, 0), false);
  assert.equal(notices.length, count, 'stale requests cannot show warnings or skip a newer selection');
  context.currentIdx = 0;
  context.audio = { error: { code: 2 }, __mineradioLocalPlaybackStarted: 2, __mineradioLocalSkipOptions: {} };
  assert.equal(context.handleLocalPlaybackReadFailure(context.audio), true);
  assert.match(notices.at(-1)[1], /磁盘可能已断开/);
  assert.equal(context.handleLocalPlaybackReadFailure(context.audio), false, 'duplicate error events cannot start another skip');
});

test('output-device waits cannot overwrite a newer local track selection', async () => {
  let release;
  const deviceWait = new Promise(resolve => { release = resolve; });
  const original = { src: '', pause() {} }, replacement = { src: 'new-track' };
  const song = { type: 'local', localUrl: 'old-track', name: 'old' };
  const noop = () => {};
  const context = vm.createContext({
    window: {}, document: { getElementById: () => ({ classList: { remove() {} } }) },
    audio: original, playQueue: [song], trackSwitchToken: 1, audioFadeSerial: 0,
    updateCustomCoverButton: noop, clearAudioFadeTimers: noop, resetPlaybackAudioGraphForSourceSwitch: noop,
    syncActiveAudioRepeatMode: noop, bindPlaybackProgressEvents: noop, applyVolumeToAudio: noop,
    applyAudioOutputDevice: () => deviceWait,
  });
  loadFunctions(context, 'public/js/modules/05-playback/13-playback-start-audio.js', ['playLocalQueueSong']);
  const pending = context.playLocalQueueSong(song, 0, 1, false, {}, 0);
  context.trackSwitchToken = 2; context.audio = replacement; release();
  assert.equal(await pending, false); assert.equal(replacement.src, 'new-track'); assert.equal(original.src, '');
});
