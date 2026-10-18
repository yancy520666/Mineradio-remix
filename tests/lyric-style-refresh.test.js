'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const stagePath = 'public/js/modules/02-visual/14-stage-lyrics-rendering.js';

function setup() {
  const calls = [];
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    stageLyrics: { currentText: 'old lyric', currentIdx: 0, transitionLineStep: 2 },
    audio: {}, trackSwitchToken: 7,
    lyricsLines: [{ text: 'old lyric' }, { text: 'new lyric' }],
    stageLyricStyleRefreshTimer: 0,
    setTimeout(fn, ms) { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    cancelStageLyricResidentBuild() { calls.push('cancel-resident'); },
    clearStageLyricSingleLinePrewarmCache() { calls.push('clear-prewarm'); },
    disposeStageLyricPrewarmMesh() { calls.push('dispose-prewarm'); },
    stageLyricPlaybackSeconds: () => 12,
    getAdjustedLyricPlaybackTime: time => time + 0.5,
    findStageLyricIndexAtTime(time) { assert.equal(time, 12.5); return 1; },
    getLyricLineProgress: () => 0.4,
    buildStageLyricDisplayPayload(index, options) {
      calls.push(['payload', index, options.lightweightTrack]);
      return { text: 'new lyric' };
    },
    currentLyricFallbackText: () => 'instrumental',
    showStageLine(payload, redraw) {
      calls.push(['show', payload, redraw]);
      context.stageLyrics.current = { userData: {} };
      return true;
    },
    updateLyricMeshProgress(mesh, progress) { calls.push(['progress', progress]); },
    scheduleStageLyricFullTrackWarmup(reason, delay) { calls.push(['warmup', reason, delay]); },
  });
  loadFunctions(context, stagePath, ['applyCurrentLyricStyleRefresh', 'refreshCurrentLyricStyle']);
  loadFunctions(context, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js', ['refreshStageLyricDisplayMode']);
  return { context, calls, timers };
}

{
  const { context: c, calls, timers } = setup();
  c.refreshStageLyricDisplayMode();
  c.refreshStageLyricDisplayMode();
  assert.equal(calls.length, 0, 'UI changes must not synchronously build lyrics');
  assert.equal(timers.size, 1, 'rapid changes must coalesce');
  const timer = [...timers.values()][0];
  assert.equal(timer.ms, 80);
  timer.fn();
  assert.deepEqual(calls.find(v => v[0] === 'payload'), ['payload', 1, true], 'rebuild from adjusted playback time using a lightweight payload');
  assert.equal(c.stageLyrics.currentIdx, 1);
  assert.equal(c.stageLyrics.transitionLineStep, 0);
  assert.equal(c.stageLyrics.current.userData.age, 0.48);
  assert.deepEqual(calls.find(v => v[0] === 'progress'), ['progress', 0.4]);
  assert.deepEqual(calls.find(v => v[0] === 'warmup'), ['warmup', 'style-refresh', 180]);
}
for (const stalePoint of ['payload', 'show']) {
  for (const staleField of ['audio', 'trackSwitchToken']) {
    const { context: c, calls } = setup();
    const fn = stalePoint === 'payload' ? 'buildStageLyricDisplayPayload' : 'showStageLine';
    const original = c[fn];
    c[fn] = (...args) => {
      const result = original(...args);
      c[staleField] = staleField === 'audio' ? {} : 8;
      return result;
    };
    c.applyCurrentLyricStyleRefresh();
    assert.equal(c.stageLyrics.currentIdx, 0, 'stale refresh must not update the new song index');
    assert(!calls.some(v => v[0] === 'progress' || v[0] === 'warmup'), 'stale refresh must not schedule new-song work');
    if (stalePoint === 'payload') assert(!calls.some(v => v[0] === 'show'));
  }
}
{
  const { context: c, calls } = setup();
  c.findStageLyricIndexAtTime = () => -1;
  c.applyCurrentLyricStyleRefresh();
  assert.equal(c.stageLyrics.currentIdx, -2);
  assert.equal(calls.find(v => v[0] === 'show')[1], 'instrumental');
  assert(!calls.some(v => v[0] === 'warmup'));
}
console.log('[OK] Lyric style refresh is deferred, coalesced, lightweight and track-safe.');
