'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules/02-visual/14-stage-lyrics-rendering.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf('\nfunction ', start + 1);
  assert.ok(end > start, `unterminated ${name}`);
  return source.slice(start, end);
}

function makeLyricsContext() {
  const calls = [];
  const group = {};
  const lyricsLines = [{ t: 0, text: '第一句' }, { t: 10, text: '第二句' }];
  const stageLyrics = { group, current: null, currentIdx: -1, transitionLineStep: 0 };
  const audio = { src: 'song-a', paused: true, ended: false, currentTime: 12 };
  const context = vm.createContext({
    fx: { particleLyrics: true }, audio, lyricsLines, stageLyrics,
    trackSwitchToken: 1, playing: false,
    stageLyricBackgroundRestoreLastAt: 0,
    stageLyricPlaybackSeconds: () => audio.currentTime,
    stageLyricNowMs: () => 1000,
    getAdjustedLyricPlaybackTime: (time) => time,
    findStageLyricIndexAtTime: (time) => time >= 10 ? 1 : 0,
    buildStageLyricDisplayPayload: (index) => ({ key: `line-${index}`, text: lyricsLines[index].text }),
    currentLyricFallbackText: () => '歌曲标题',
    showStageLine(payload, redrawOnly) {
      calls.push(['show', payload.text, redrawOnly]);
      stageLyrics.current = { parent: group, userData: {} };
      stageLyrics.currentPayload = payload;
      return true;
    },
    getLyricLineProgress: () => 0.4,
    lyricLineHasNativeKaraoke: () => false,
    updateLyricMeshProgress: () => calls.push(['progress']),
    scheduleStageLyricFullTrackWarmup: () => calls.push(['warmup']),
    resetStageLyricResumeFrameGates: () => calls.push(['frame']),
    stageLyricProgressPreviewActive: () => false,
  });
  vm.runInContext([
    functionSource('restorePausedStageLyrics'),
    functionSource('restoreStageLyricsAfterBackground'),
    functionSource('tickLyricsParticles'),
  ].join('\n'), context);
  return { context, calls, audio, stageLyrics };
}

test('paused lyrics are rebuilt from the current position after the mesh disappears', () => {
  const { context, calls, stageLyrics } = makeLyricsContext();
  context.tickLyricsParticles();
  assert.equal(stageLyrics.currentIdx, 1);
  assert.equal(stageLyrics.currentPayload.text, '第二句');
  assert.deepEqual(calls[0], ['show', '第二句', true]);
  assert.ok(calls.some((call) => call[0] === 'progress'));
  const mesh = stageLyrics.current;
  const showCount = calls.filter(call => call[0] === 'show').length;
  context.retireCurrentStageLyricForIdle = () => { throw new Error('paused lyrics must not retire'); };
  for (let i = 0; i < 100; i++) context.tickLyricsParticles();
  assert.equal(stageLyrics.current, mesh, 'repeated paused ticks keep the restored mesh');
  assert.equal(calls.filter(call => call[0] === 'show').length, showCount, 'pause hold must not repeatedly rebuild');
});

test('foreground recovery redraws a paused mesh once and rejects a stale track', () => {
  const { context, calls, stageLyrics } = makeLyricsContext();
  assert.equal(context.restoreStageLyricsAfterBackground('focus'), true);
  assert.equal(calls.filter((call) => call[0] === 'show').length, 1);
  assert.equal(context.restoreStageLyricsAfterBackground('focus-again'), true);
  assert.equal(calls.filter((call) => call[0] === 'show').length, 1);

  stageLyrics.current = null;
  context.buildStageLyricDisplayPayload = () => {
    context.trackSwitchToken += 1;
    return { key: 'stale', text: '旧歌词' };
  };
  assert.equal(context.restorePausedStageLyrics('stale-track', true), false);
  assert.equal(calls.filter((call) => call[0] === 'show').length, 1);
});

test('pause-hide preference keeps lyrics hidden while paused', () => {
  const { context, calls } = makeLyricsContext();
  context.fx.lyricPauseHold = false;
  assert.equal(context.restoreStageLyricsAfterBackground('focus'), false);
  assert.equal(calls.filter((call) => call[0] === 'show').length, 0);
});
