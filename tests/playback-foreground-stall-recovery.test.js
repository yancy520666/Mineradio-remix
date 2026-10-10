'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const modules = path.join(__dirname, '../public/js/modules');
const controls = fs.readFileSync(path.join(modules, '05-playback/14-player-controls.js'), 'utf8');
const progress = fs.readFileSync(path.join(modules, '06-lyrics/04-progress-seek.js'), 'utf8');
const graph = fs.readFileSync(path.join(modules, '05-playback/08-audio-graph-controls.js'), 'utf8');
const power = fs.readFileSync(path.join(modules, '00-state/08-desktop-render-power.js'), 'utf8');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '('), end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start, name);
  return (source.slice(Math.max(0, start - 6), start) === 'async ' ? 'async ' : '') + source.slice(start, end + 3);
}
function fixture() {
  const timers = new Map(), retries = [], playCalls = [], events = { document: {}, window: {} };
  let timerId = 0, clock = 20000, graphCalls = 0, newMediaCount = 0, mediaPlayCalls = 0;
  function media() {
    const listeners = new Map();
    return { src: 'fixture://old-link', currentSrc: '', currentTime: 0, duration: 300,
      paused: false, ended: false, seeking: false, readyState: 4, networkState: 2, NETWORK_NO_SOURCE: 3,
      __mineradioQueueItemKey: 'netease:1', __mineradioTrackSwitchToken: 7,
      __mineradioPlaybackStartedToken: 7, __mineradioPlaybackExpected: true,
      addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
      emit(name) { for (const fn of listeners.get(name) || []) fn(); },
      pause() { this.paused = true; this.emit('pause'); },
      play() { mediaPlayCalls++; this.paused = false; return Promise.resolve(); }, load() {}, listeners,
    };
  }
  const original = media();
  const context = vm.createContext({
    audio: original, audioCtx: { state: 'running' }, playQueue: [{ id: 1, provider: 'netease' }],
    currentIdx: 0, trackSwitchToken: 7, pendingAudioPause: null, playMode: 'list',
    playbackResumeRecovery: { serial: 0, pending: false, lastAttemptAt: 0, timerIds: [], freshUrlAttemptCount: 1 },
    playbackBackgroundResumeTask: null, PLAYBACK_RESUME_STALL_DELAYS: [1600, 3600, 6500, 9500],
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, performance: { now: () => clock },
    queueItemKey: song => song.provider + ':' + song.id, songProviderKey: song => song.provider, normalizePlaybackProvider: p => p,
    playbackQualityAuthorizationKey: () => 'account-a',
    playbackMediaMatchesCurrentQueueItem: item => item === context.audio && item.__mineradioQueueItemKey === context.queueItemKey(context.playQueue[context.currentIdx]),
    currentResumeSeconds: () => context.audio.currentTime,
    ensurePlaybackAudioGraph: async () => { graphCalls++; context.audioCtx.state = 'running'; return true; },
    audioGraphHealthy: () => true,
    ensureAudiblePlaybackGain() {}, schedulePlaybackAnalyserRecovery() {}, isQishuiTrackStartStalled: () => false,
    recoverCurrentTrackPlaybackFromFreshUrl: async (reason, opts) => {
      retries.push({ reason, opts }); context.clearPlaybackResumeWatchdogs(); context.playbackResumeRecovery.serial++; return true;
    },
    attemptAudioPlay: async opts => { playCalls.push(opts); context.audio.paused = false; context.schedulePlaybackStallRecovery('replacement-started', {}); return true; },
    updatePlaybackProgressUi() {}, saveLastPlaybackSnapshot() {}, syncPlaybackStateFromAudioEvent() {}, playbackTransitionHasAudibleNextDeck: () => false,
    Audio: function () { newMediaCount++; const replacement = media(); replacement.src = ''; replacement.paused = true; return replacement; },
    disconnectAudioGraphNodes() {}, applyVolumeToAudio() {}, applyAudioOutputDevice() {},
    document: { hidden: false, addEventListener(name, fn) { events.document[name] = fn; } },
    window: { desktopWindow: {}, addEventListener(name, fn) { events.window[name] = fn; } },
    desktopRuntimeState: { desktop: true, minimized: false, visible: true, focused: true, fullscreen: false }, desktopRuntimeStateRevision: 0,
    isLiveBackgroundKeepMode: () => false, updateRenderPowerClasses() {}, applyRendererPowerMode() {}, recoverVisualsAfterBackground() {},
    wakeMainLoopFromBackground() {}, scheduleMainRendererViewportRefresh() {}, fx: null, console: { warn() {} }, Promise,
  });
  vm.runInContext([
    ...['isSameAudioPlaybackTarget', 'canRefreshCurrentPlaybackUrlForResume', 'trackSwitchStallRecoveryAllowed',
      'clearPlaybackResumeWatchdogs', 'playbackStallRecoveryOwnerStillCurrent', 'schedulePlaybackStallRecovery',
      'playbackBackgroundResumeTargetStillCurrent', 'recoverPlaybackAfterBackground'].map(name => extract(controls, name)),
    extract(progress, 'bindPlaybackProgressEvents'), extract(graph, 'restoreMediaTimeWhenReady'), extract(graph, 'replaceAudioElementForGraphRecovery'),
    ...['isDeepBackgroundMode', 'updateDesktopRuntimeState', 'refreshDesktopRuntimeStateAfterWake', 'installRenderPowerHooks'].map(name => extract(power, name)),
  ].join('\n'), context);
  context.bindPlaybackProgressEvents(original);
  return { context, original, timers, retries, playCalls, events,
    get graphCalls() { return graphCalls; }, get newMediaCount() { return newMediaCount; }, get mediaPlayCalls() { return mediaPlayCalls; },
    advance(ms) { clock += ms; },
    async fire(delay) { const entry = [...timers].find(([, value]) => value.delay === delay); assert(entry, 'missing ' + delay);
      timers.delete(entry[0]); clock += delay; await entry[1].fn(); },
  };
}
async function exhaustHealthyStartup(f) {
  f.context.schedulePlaybackStallRecovery('track-start', { trackSwitch: true });
  for (const [delay, seconds] of [[1600, 1], [3600, 3], [6500, 6], [9500, 9]]) {
    f.original.currentTime = seconds; await f.fire(delay);
  }
  assert.equal(f.timers.size, 0); assert.equal(f.retries.length, 0);
  f.original.currentTime = 145;
}
async function testForegroundAndWaitingAfterStartup() {
  const f = fixture(); await exhaustHealthyStartup(f);
  f.context.audioCtx.state = 'suspended';
  await f.context.recoverPlaybackAfterBackground('foreground');
  assert.equal(f.context.audioCtx.state, 'running'); assert.equal(f.timers.size, 4);
  const ids = [...f.timers.keys()];
  for (let i = 0; i < 12; i++) {
    f.original.emit('waiting'); await f.context.recoverPlaybackAfterBackground('focus');
  }
  assert.deepEqual([...f.timers.keys()], ids, 'repeated wake/waiting must preserve deadlines');
  assert.equal(f.context.playbackResumeRecovery.freshUrlAttemptCount, 1, 'wake must never reset fresh-link budget');
  await f.fire(3600); assert.equal(f.retries.length, 1); assert.equal(f.retries[0].opts.resumeAt, 145);
  assert.equal(f.newMediaCount, 0); assert.equal(f.playCalls.length, 0, 'ordinary wake must not call play again');
  const waiting = fixture(); await exhaustHealthyStartup(waiting); waiting.original.emit('waiting');
  assert.equal(waiting.timers.size, 4); await waiting.fire(3600); assert.equal(waiting.retries.length, 1);
}
async function testHealthyWakeAndIgnoredOwners() {
  const healthy = fixture(); await exhaustHealthyStartup(healthy); await healthy.context.recoverPlaybackAfterBackground('focus');
  for (const [delay, seconds] of [[1600, 146], [3600, 148], [6500, 151], [9500, 154]]) {
    healthy.original.currentTime = seconds; await healthy.fire(delay);
  }
  assert.equal(healthy.retries.length, 0); assert.equal(healthy.timers.size, 0);
  for (const mutate of [
    f => { f.original.__mineradioPlaybackExpected = false; },
    f => { f.original.paused = true; },
    f => { f.original.ended = true; },
    f => { f.original.seeking = true; },
    f => { f.original.src = ''; },
    f => { f.original.__mineradioPlaybackStartedToken = undefined; },
    f => { f.context.pendingAudioPause = {}; },
    f => { f.context.trackSwitchToken++; },
    f => { f.original.__mineradioQueueItemKey = 'netease:other'; },
  ]) {
    const f = fixture(); mutate(f); assert.equal(await f.context.recoverPlaybackAfterBackground('focus'), false);
    assert.equal(f.graphCalls, 0); assert.equal(f.timers.size, 0); assert.equal(f.playCalls.length, 0);
  }
}
async function testDeferredGraphOwnership() {
  for (const action of ['pause', 'switch', 'auth']) {
    const f = fixture(); let release;
    f.context.ensurePlaybackAudioGraph = () => new Promise(resolve => { release = resolve; });
    const first = f.context.recoverPlaybackAfterBackground('focus');
    assert.equal(f.context.recoverPlaybackAfterBackground('visibilitychange'), first, 'pending wake must reuse its Promise');
    assert.equal(f.timers.size, 4);
    if (action === 'pause') { f.original.__mineradioPlaybackExpected = false; f.original.paused = true; }
    else if (action === 'switch') f.context.trackSwitchToken++;
    else f.context.playbackQualityAuthorizationKey = () => 'account-b';
    release(true); assert.equal(await first, false);
    await f.fire(3600); assert.equal(f.retries.length, 0); assert.equal(f.playCalls.length, 0);
  }
}
async function testClosedGraphReplacement() {
  const f = fixture(); f.original.currentTime = 145; f.context.audioCtx.state = 'closed';
  f.original.__mineradioLocalPlaybackStarted = 7; f.original.__mineradioLocalSkipOptions = { localMissingChecked: 2 };
  f.context.ensurePlaybackAudioGraph = async () => {
    f.context.replaceAudioElementForGraphRecovery('closed-context'); f.context.audioCtx = { state: 'running' }; return true;
  };
  assert.equal(await f.context.recoverPlaybackAfterBackground('focus'), true);
  const replacement = f.context.audio;
  assert.notEqual(replacement, f.original); assert.equal(f.newMediaCount, 1); assert.equal(f.playCalls.length, 1);
  assert.equal(replacement.__mineradioTrackSwitchToken, 7); assert.equal(replacement.__mineradioPlaybackStartedToken, 7);
  assert.equal(replacement.__mineradioPlaybackExpected, true); assert.equal(replacement.currentTime, 145);
  assert.equal(replacement.__mineradioLocalPlaybackStarted, 7); assert.equal(replacement.__mineradioLocalSkipOptions.localMissingChecked, 2);
  assert.equal(f.playCalls[0].expectedMedia, replacement); assert.equal(f.playCalls[0].expectedToken, 7);
  assert.equal(f.timers.size, 4, 'replacement must replace stale-media checks, not multiply instances');
  const paused = fixture(); paused.original.paused = true; paused.original.__mineradioPlaybackExpected = false;
  paused.context.audioCtx.state = 'closed'; await paused.context.recoverPlaybackAfterBackground('focus');
  assert.equal(paused.newMediaCount, 0); assert.equal(paused.playCalls.length, 0);
  const switched = fixture(); switched.context.replaceAudioElementForGraphRecovery('track-switch', { preservePlayback: false });
  assert.equal(switched.context.audio.__mineradioPlaybackExpected, undefined, 'a fresh element has no established play/pause intent');
  assert.equal(switched.context.audio.__mineradioPlaybackStartedToken, undefined);

  const waiting = fixture(); waiting.original.currentTime = 145; waiting.context.audioCtx.state = 'closed';
  waiting.context.audioGraphHealthy = () => !!(waiting.context.audioCtx && waiting.context.audioCtx.state === 'running');
  waiting.context.initAudio = () => {
    waiting.context.replaceAudioElementForGraphRecovery('closed-context'); waiting.context.audioCtx = { state: 'running' }; return true;
  };
  vm.runInContext(extract(graph, 'resumeAudioAnalysis') + '\n' + extract(graph, 'ensurePlaybackAudioGraph'), waiting.context);
  waiting.original.emit('waiting'); const task = waiting.context.playbackBackgroundResumeTask;
  assert(task); assert.equal(await task.promise, true);
  assert.equal(waiting.newMediaCount, 1); assert.equal(waiting.playCalls.length, 1);
  assert.equal(waiting.context.audio.paused, false); assert.equal(waiting.timers.size, 4, 'waiting-only closed graph needs a new-media observation round');

  const stalled = fixture(); stalled.context.audioCtx.state = 'closed';
  stalled.context.audioGraphHealthy = () => !!(stalled.context.audioCtx && stalled.context.audioCtx.state === 'running');
  stalled.context.initAudio = () => {
    stalled.context.replaceAudioElementForGraphRecovery('closed-context'); stalled.context.audioCtx = { state: 'running' }; return true;
  };
  vm.runInContext(extract(graph, 'resumeAudioAnalysis') + '\n' + extract(graph, 'ensurePlaybackAudioGraph'), stalled.context);
  stalled.context.schedulePlaybackStallRecovery('stalled', {}); await stalled.fire(3600);
  assert.equal(stalled.newMediaCount, 1); assert.equal(stalled.playCalls.length, 1);
  assert.equal(stalled.context.audio.paused, false); assert.equal(stalled.timers.size, 4, 'a closed graph discovered by a watchdog must transfer its recovery owner');
}
async function testNativeAndBrowserWakeHooks() {
  const f = fixture(); const reasons = [];
  f.context.recoverPlaybackAfterBackground = reason => { reasons.push(reason); return Promise.resolve(true); };
  f.context.installRenderPowerHooks();
  f.context.document.hidden = true;
  f.context.updateDesktopRuntimeState({ isMinimized: false, isVisible: true, isFocused: true });
  assert.deepEqual(reasons, ['desktop-runtime-state'], 'an unchanged native foreground state must handle system resume');
  f.context.updateDesktopRuntimeState({ isMinimized: true, isVisible: false }); assert.equal(reasons.length, 1);
  f.context.updateDesktopRuntimeState({ isMinimized: false, isVisible: true });
  f.events.document.visibilitychange(); f.events.window.focus();
  assert.deepEqual(reasons, ['desktop-runtime-state', 'desktop-runtime-state', 'visibilitychange', 'focus']);
}
async function testReplacementResumeIntentAtAsyncBoundaries() {
  for (const boundary of ['output', 'graph-before-play', 'graph-after-play', 'complete-graph']) {
    for (const action of ['pause', 'switch', 'auth']) {
      const f = fixture(); let release, graphCount = 0;
      const graphBoundary = { 'graph-before-play': 2, 'graph-after-play': 3, 'complete-graph': 4 }[boundary];
      let announce; const reachedBoundary = new Promise(resolve => { announce = resolve; });
      function defer() { announce(); return new Promise(resolve => { release = resolve; }); }
      f.context.ensurePlaybackAudioGraph = async () => {
        graphCount++;
        if (graphCount === 1) f.context.replaceAudioElementForGraphRecovery('closed-context');
        if (graphCount === graphBoundary) return defer();
        return true;
      };
      Object.assign(f.context, {
        resumePausedAudioFast: async () => null, playbackResumePausedLongEnough: () => false,
        applyAudioOutputDevice: boundary === 'output' ? defer : async () => {},
        awaitMediaPlayWithTimeout: async (_media, promise) => promise, restorePlaybackGain() {},
        switchPlaybackVisualToEmily() {}, setPlayIcon() {}, forcePlaybackControlsInteractive() {}, hideLoading() {},
      });
      // Exercise the real async play path, not a mock that hides a late pause.
      vm.runInContext(['playbackAttemptStillCurrent', 'completeAudioPlayStart', 'attemptAudioPlay'].map(name => extract(controls, name)).join('\n'), f.context);
      const result = f.context.recoverPlaybackAfterBackground('focus');
      await reachedBoundary;
      if (action === 'pause') { f.context.audio.__mineradioPlaybackExpected = false; f.context.audio.pause(); }
      else if (action === 'switch') f.context.trackSwitchToken++;
      else f.context.playbackQualityAuthorizationKey = () => 'account-b';
      release(true); assert.equal(await result, false, boundary + '/' + action);
      assert.equal(f.mediaPlayCalls, boundary === 'output' || boundary === 'graph-before-play' ? 0 : 1);
      if (action === 'pause') assert.equal(f.context.audio.paused, true, 'late wake must not undo manual pause');
    }
  }
}
async function testOverdueTimersUseRealObservationTime() {
  const healthy = fixture(); healthy.context.schedulePlaybackStallRecovery('track-start', {});
  healthy.advance(60000); healthy.original.currentTime = 45;
  for (const delay of [1600, 3600, 6500, 9500]) {
    const entry = [...healthy.timers].find(([, value]) => value.delay === delay); healthy.timers.delete(entry[0]); await entry[1].fn();
  }
  assert.equal(healthy.retries.length, 0, 'an overdue callback burst is one healthy observation');
  const frozen = fixture(); frozen.context.schedulePlaybackStallRecovery('track-start', {});
  frozen.advance(60000); frozen.original.currentTime = 45;
  const oldIds = [...frozen.timers.keys()]; await frozen.context.recoverPlaybackAfterBackground('system-resume');
  assert.equal(frozen.timers.size, 4); assert([...frozen.timers.keys()].every(id => !oldIds.includes(id)), 'wake replaces an overdue round with real-time bounded deadlines');
  const newIds = [...frozen.timers.keys()]; frozen.original.emit('waiting'); await frozen.context.recoverPlaybackAfterBackground('focus');
  assert.deepEqual([...frozen.timers.keys()], newIds, 'repeated wake must not keep postponing the rebased deadline');
  await frozen.fire(3600); assert.equal(frozen.retries.length, 1, 'a clock frozen after the overdue round must still recover');
}
async function testGraphWaitIsBoundedAndLateResumeCannotTouchNewOwner() {
  const f = fixture(); let resolveResume, initCalls = 0;
  f.context.audioCtx = { state: 'suspended', resume: () => new Promise(resolve => { resolveResume = resolve; }) };
  f.context.initAudio = () => { initCalls++; return true; };
  vm.runInContext(extract(graph, 'resumeAudioAnalysis') + '\n' + extract(graph, 'ensurePlaybackAudioGraph'), f.context);
  const wake = f.context.recoverPlaybackAfterBackground('focus');
  // The graph timeout was armed after the four progress deadlines.
  const timeout = [...f.timers].filter(([, timer]) => timer.delay === 1600).at(-1);
  f.timers.delete(timeout[0]); f.advance(1600); timeout[1].fn();
  assert.equal(await wake, true); assert.equal(f.retries.length, 1, 'a hanging graph must enter the existing finite fresh-link recovery');
  assert.equal(f.timers.size, 0, 'hanging graph must not leave the wake or progress checks pending');
  f.context.trackSwitchToken++; const replacementGraph = { state: 'running' }; f.context.audioCtx = replacementGraph;
  f.context.audioGraphHealthy = () => false; resolveResume(); await Promise.resolve(); await Promise.resolve();
  assert.equal(initCalls, 0, 'expired old resume must not init/replace the new graph'); assert.equal(f.context.audioCtx, replacementGraph);

  const terminal = fixture(); const notices = [], recovery = {};
  terminal.context.audioCtx = { state: 'suspended', resume: () => new Promise(() => {}) };
  terminal.context.initAudio = () => true;
  vm.runInContext(extract(graph, 'resumeAudioAnalysis') + '\n' + extract(graph, 'ensurePlaybackAudioGraph'), terminal.context);
  Object.assign(terminal.context, {
    playbackStallRecoveryTransaction: () => recovery, sourceFallbackRecoveryIdentityActive: () => notices.length === 0,
    settleSourceFallbackTerminal(_idx, _token, message) {
      notices.push(message); terminal.context.clearPlaybackResumeWatchdogs();
      terminal.original.__mineradioPlaybackExpected = false; terminal.original.pause(); return false;
    },
    resumePausedAudioFast: async () => null, playbackResumePausedLongEnough: () => false,
    waitForAudioReadyToPlay: async () => true, applyAudioOutputDevice: async () => {},
    awaitMediaPlayWithTimeout: async (_media, promise) => promise, restorePlaybackGain() {},
    switchPlaybackVisualToEmily() {}, setPlayIcon() {}, forcePlaybackControlsInteractive() {}, hideLoading() {}, showToast() {},
  });
  vm.runInContext(['playbackAttemptStillCurrent', 'completeAudioPlayStart', 'attemptAudioPlay', 'retryTrackSwitchAudioPlayOnce',
    'playbackFreshUrlRecoverySongKey', 'resetPlaybackFreshUrlRecoveryBudget', 'recoverCurrentTrackPlaybackFromFreshUrl'].map(name => extract(controls, name)).join('\n'), terminal.context);
  terminal.context.playbackResumeRecovery.freshUrlAttemptCount = 0;
  let freshLoads = 0;
  terminal.context.playQueueAt = async () => {
    freshLoads++; return terminal.context.attemptAudioPlay({ trackSwitch: true, resumeRecovery: true, silent: true, fade: false, expectedMedia: terminal.original, expectedToken: 7 });
  };
  const stopped = terminal.context.recoverPlaybackAfterBackground('focus');
  // One foreground graph wait, then one fresh load and its existing single
  // startup retry. Every never-settling resume has a bounded timeout.
  for (let attempt = 0; attempt < 3; attempt++) {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const timer = [...terminal.timers].filter(([, value]) => value.delay === 1600).at(-1); assert(timer);
    terminal.timers.delete(timer[0]); terminal.advance(1600); timer[1].fn();
  }
  assert.equal(await stopped, false); assert.equal(freshLoads, 1); assert.equal(terminal.mediaPlayCalls, 0);
  assert.equal(notices.length, 1); assert.equal(terminal.original.paused, true); assert.equal(terminal.timers.size, 0);
  assert.match(notices[0], /已停止自动重试.*播放/);
  await terminal.context.recoverPlaybackAfterBackground('focus'); assert.equal(notices.length, 1, 'terminal failure must not restart on more wake events');
}
async function testCanceledStallDoesNotChangeNewOwnerGain() {
  const f = fixture(); let release, gainCalls = 0;
  f.context.ensurePlaybackAudioGraph = () => new Promise(resolve => { release = resolve; });
  f.context.ensureAudiblePlaybackGain = () => { gainCalls++; };
  f.context.schedulePlaybackStallRecovery('stalled', {});
  const fired = f.fire(3600); f.context.trackSwitchToken++; release(true); await fired;
  assert.equal(gainCalls, 0); assert.equal(f.retries.length, 0);
}
async function testRealSourceSwitchCanStartFreshRecoveryAndStillHonorsPause() {
  function prepare() {
    const f = fixture(); f.original.__mineradioMediaSourceBound = true;
    Object.assign(f.context, {
      source: {}, audioSourceMedia: f.original, resumePausedAudioFast: async () => null,
      playbackResumePausedLongEnough: () => false, waitForAudioReadyToPlay: async () => true,
      ensurePlaybackAudioGraph: async () => { f.context.audioCtx = { state: 'running' }; return true; },
      applyAudioOutputDevice: async () => {}, awaitMediaPlayWithTimeout: async (_media, promise) => promise,
      restorePlaybackGain() {}, switchPlaybackVisualToEmily() {}, setPlayIcon() {}, primeCinemaAfterTrackStart() {},
      forcePlaybackControlsInteractive() {}, hideLoading() {},
    });
    vm.runInContext(extract(graph, 'resetPlaybackAudioGraphForSourceSwitch') + '\n' +
      ['playbackAttemptStillCurrent', 'completeAudioPlayStart', 'attemptAudioPlay', 'retryTrackSwitchAudioPlayOnce'].map(name => extract(controls, name)).join('\n'), f.context);
    f.context.resetPlaybackAudioGraphForSourceSwitch('track-switch');
    assert.notEqual(f.context.audio, f.original); assert.equal(f.context.audio.__mineradioPlaybackExpected, undefined);
    // The real source setup assigns URL/key/token after reset, before playAudio.
    Object.assign(f.context.audio, { src: 'fixture://fresh-link', __mineradioQueueItemKey: 'netease:1', __mineradioTrackSwitchToken: 7 });
    return f;
  }
  const fresh = prepare();
  assert.equal(await fresh.context.attemptAudioPlay({ trackSwitch: true, resumeRecovery: true, silent: true, fade: false }), true);
  assert.equal(fresh.mediaPlayCalls, 1); assert.equal(fresh.context.audio.__mineradioPlaybackExpected, true);
  assert.equal(fresh.context.audio.__mineradioPlaybackStartedToken, 7);
  const paused = prepare(); let release, announce;
  const reached = new Promise(resolve => { announce = resolve; });
  paused.context.applyAudioOutputDevice = () => { announce(); return new Promise(resolve => { release = resolve; }); };
  const pending = paused.context.attemptAudioPlay({ trackSwitch: true, resumeRecovery: true, silent: true, fade: false });
  await reached; paused.context.audio.__mineradioPlaybackExpected = false; paused.context.audio.pause(); release();
  assert.equal(await pending, false); assert.equal(paused.mediaPlayCalls, 0); assert.equal(paused.context.audio.paused, true);
}
(async () => {
  await testForegroundAndWaitingAfterStartup(); await testHealthyWakeAndIgnoredOwners();
  await testDeferredGraphOwnership(); await testClosedGraphReplacement(); await testNativeAndBrowserWakeHooks();
  await testReplacementResumeIntentAtAsyncBoundaries();
  await testOverdueTimersUseRealObservationTime(); await testGraphWaitIsBoundedAndLateResumeCannotTouchNewOwner();
  await testCanceledStallDoesNotChangeNewOwnerGain();
  await testRealSourceSwitchCanStartFreshRecoveryAndStillHonorsPause();
  console.log('OK playback-foreground-stall-recovery: post-start stall, waiting, bounded/deduped deadlines, healthy wake, pause/switch ownership, closed graph and native/browser wakes');
})().catch(error => { console.error(error); process.exitCode = 1; });
