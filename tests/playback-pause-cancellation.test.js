'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '..', 'public/js/modules/05-playback');
const graph = fs.readFileSync(path.join(dir, '08-audio-graph-controls.js'), 'utf8');
const controls = fs.readFileSync(path.join(dir, '14-player-controls.js'), 'utf8');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start, name);
  return source.slice(start, end + 3);
}
function fixture() {
  const timers = new Map(); let timerId = 0;
  const media = { src: 'test.wav', paused: false, ended: false, volume: 0.6, pause() { this.paused = true; } };
  const context = vm.createContext({
    audio: media, audioCtx: null, playQueue: [], currentIdx: -1, currentLocalSong: null,
    playing: true, playToggleBusy: false, audioFadeSerial: 0, audioFadeTimer: null,
    audioElementFadeFrame: 0, pendingAudioPause: null, AUDIO_FADE_OUT_MS: 160, targetVolume: 0.6,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }, cancelAnimationFrame() {}, clearAudioAudibilityRecoveryTimers() {},
    rampAudioOutputGain() { context.clearAudioFadeTimers(); media.volume = 0.001; },
    setAudioOutputGainImmediate(value) { context.clearAudioFadeTimers(); media.volume = value; },
    currentAudioOutputGain() { return media.volume; },
    forcePlaybackControlsInteractive() {}, setPlayIcon() {}, hideLoading() {}, updateListenStatsTick() {},
    syncPlaybackStateFromAudioEvent() {}, scheduleControlsHide() {},
    safePlaybackStep(_reason, fn) { fn(); }, console: { warn() {} }, Promise,
  });
  vm.runInContext(['clearAudioFadeTimers', 'cancelAudioElementFadeFrame', 'ensureAudiblePlaybackGain', 'fadeOutAndPauseAudio'].map(name => extract(graph, name)).join('\n') + '\nasync ' + extract(controls, 'togglePlay'), context);
  return { context, media, timers, finishFade() { const fn = timers.get(context.audioFadeTimer); timers.delete(context.audioFadeTimer); assert(fn); fn(); } };
}
(async () => {
  const cancelled = fixture();
  const operation = cancelled.context.togglePlay();
  assert(cancelled.context.playToggleBusy);
  cancelled.context.clearAudioFadeTimers();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled.context.playToggleBusy, false, 'cancelled fade must release playback controls');
  await operation;
  assert.equal(cancelled.context.playing, true, 'cancelled pause must reflect the still-playing media');

  const waking = fixture();
  const pause = waking.context.togglePlay();
  for (let i = 0; i < 10; i++) assert.equal(waking.context.ensureAudiblePlaybackGain('focus'), false, 'wake recovery must not interrupt an intentional pause');
  waking.finishFade(); await pause;
  assert(waking.media.paused && !waking.context.playToggleBusy && !waking.context.playing);
  waking.media.paused = false; waking.context.playing = true;
  const secondPause = waking.context.togglePlay(); waking.finishFade(); await secondPause;
  assert(waking.media.paused && !waking.context.playToggleBusy, 'next pause must still work');

  const changed = fixture();
  const oldPause = changed.context.fadeOutAndPauseAudio();
  const replacement = { ...changed.media, paused: false };
  changed.context.audio = replacement;
  changed.finishFade(); assert.equal(await oldPause, false);
  assert.equal(replacement.paused, false, 'old fade must not pause replacement audio');
  const sourceChanged = fixture();
  const oldSourcePause = sourceChanged.context.fadeOutAndPauseAudio();
  sourceChanged.media.src = 'another.wav';
  sourceChanged.finishFade(); assert.equal(await oldSourcePause, false);
  assert.equal(sourceChanged.media.paused, false, 'old fade must not pause a new source on the same media');
  console.log('OK playback-pause-cancellation: cancellation, repeated wake, subsequent pause, replacement media/source');
})().catch(error => { console.error(error); process.exitCode = 1; });
