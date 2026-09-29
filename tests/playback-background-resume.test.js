'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '05-playback', '14-player-controls.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = source.indexOf('\n}\n', start);
  assert.ok(next > start, `unterminated ${name}`);
  return source.slice(start, next + 3);
}

function makeContext() {
  const calls = [];
  const media = {
    src: 'https://example.invalid/test.mp3',
    currentSrc: 'https://example.invalid/test.mp3',
    paused: true,
    ended: false,
    play() {
      calls.push('play');
      assert.equal(context.audioCtx.state, 'running', 'media.play started while its AudioContext was suspended');
      this.paused = false;
      return Promise.resolve();
    },
  };
  const context = vm.createContext({
    audio: media,
    audioCtx: { state: 'suspended' },
    trackSwitchToken: 7,
    playQueue: [],
    currentIdx: -1,
    calls,
    canResumePausedAudioFast: () => true,
    playbackAttemptStillCurrent: (item, token) => item === context.audio && token === context.trackSwitchToken,
    isSameAudioPlaybackTarget: (item, src) => item === context.audio && (item.currentSrc || item.src) === src,
    playbackMediaMatchesCurrentQueueItem: () => true,
    playbackResumePausedLongEnough: () => false,
    ensurePlaybackAudioGraph: async () => { calls.push('graph'); context.audioCtx.state = 'running'; return true; },
    awaitMediaPlayWithTimeout: async (_item, promise) => promise,
    applyAudioOutputDevice: async () => { calls.push('output'); },
    audioGraphHealthy: () => true,
    initAudio: () => true,
    restorePlaybackGain() {},
    preparePlaybackFadeIn() {},
    switchPlaybackVisualToEmily() {},
    setPlayIcon() {},
    markStageLyricsPlaybackResume() {},
    forcePlaybackControlsInteractive() {},
    hideLoading() {},
    schedulePausedAudioResumeMaintenance() {},
    completeAudioPlayStart: async (_opts, _reason, item) => { assert.equal(item, context.audio); return true; },
    console: { warn() {} },
    setTimeout() {},
    Promise,
  });
  vm.runInContext(functionSource('resumePausedAudioFast') + '\n' + functionSource('attemptAudioPlay'), context);
  return { context, calls, media };
}

async function testFastResumeWakesGraphBeforePlayback() {
  const { context, calls } = makeContext();
  assert.equal(await context.resumePausedAudioFast({ manual: true }), true);
  assert.deepEqual(calls.slice(0, 2), ['graph', 'play']);
}

async function testManualFallbackWakesGraphBeforePlayback() {
  const { context, calls } = makeContext();
  context.resumePausedAudioFast = async () => null;
  assert.equal(await context.attemptAudioPlay({ manual: true, fade: false }), true);
  assert.deepEqual(calls.slice(0, 3), ['graph', 'output', 'play']);
}

async function testSuspendedContextNeverClaimsFastResume() {
  const { context, calls } = makeContext();
  context.ensurePlaybackAudioGraph = async () => { calls.push('graph-failed'); return false; };
  assert.equal(await context.resumePausedAudioFast({ manual: true }), null);
  assert.deepEqual(calls, ['graph-failed']);
}

async function testClosedContextReplacementKeepsManualRequest() {
  const { context, calls, media } = makeContext();
  const replacement = { ...media, paused: true };
  context.resumePausedAudioFast = async () => {
    context.audio = replacement;
    return null;
  };
  assert.equal(await context.attemptAudioPlay({ manual: true, fade: false }), true);
  assert.equal(replacement.paused, false);
  assert.equal(media.paused, true);
  assert.deepEqual(calls.slice(0, 3), ['graph', 'output', 'play']);
}

Promise.resolve()
  .then(testFastResumeWakesGraphBeforePlayback)
  .then(testManualFallbackWakesGraphBeforePlayback)
  .then(testSuspendedContextNeverClaimsFastResume)
  .then(testClosedContextReplacementKeepsManualRequest)
  .then(() => console.log('OK playback-background-resume'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
