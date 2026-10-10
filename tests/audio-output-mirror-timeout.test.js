'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/modules/05-playback/00-api-quality-output.js', 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// Deterministic graph/media doubles only: no real audio, capture, or timers.
function fixture(mode = 'sink-pending') {
  let now = 0;
  const elements = [], tracks = [], sinkCalls = [], toasts = [], timers = new Map();
  function node() {
    return { gain: { setTargetAtTime() {} }, delayTime: { setTargetAtTime() {} }, links: [],
      connect(target) { this.links.push(target); },
      disconnect(target) { this.links = target ? this.links.filter(value => value !== target) : []; } };
  }
  class Media {
    constructor() { this.paused = true; this.sinkId = ''; this.playCalls = 0; elements.push(this); }
    setSinkId(id) {
      sinkCalls.push(id);
      if (mode === 'sink-pending') return new Promise(resolve => { this.resolveSink = () => { this.sinkId = id; resolve(); }; });
      this.sinkId = id; return Promise.resolve();
    }
    play() {
      this.playCalls++;
      if (mode === 'play-abort') return Promise.reject({ name: 'AbortError' });
      if (mode === 'play-pending') return new Promise((resolve, reject) => { this.resolvePlay = resolve; this.rejectPlay = reject; });
      this.paused = false; return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  const c = {
    console, Promise, Date: { now: () => now }, setTimeout, requestAnimationFrame() {},
    setInterval(fn) { timers.set(1, fn); return 1; }, clearInterval(id) { timers.delete(id); },
    localStorage: { getItem() { return null; }, setItem() {} }, navigator: {}, document: { getElementById() { return null; } },
    HTMLMediaElement: Media, Audio: Media,
    AUDIO_OUTPUT_DEVICE_STORE_KEY: 'primary', AUDIO_OUTPUT_MIRROR_STORE_KEY: 'mirrors', AUDIO_INPUT_BRIDGE_STORE_KEY: 'bridge',
    audio: { src: 'fixture.wav', paused: false, ended: false, muted: false, sinkId: 'speaker', addEventListener() {}, setSinkId() { return Promise.resolve(); } },
    audioCtx: { state: 'running', currentTime: 1, sinkId: 'speaker', createDelay: node, createGain: node,
      createMediaStreamDestination() {
        const destination = node(), track = { stops: 0, stop() { this.stops++; } };
        tracks.push(track); destination.stream = { getTracks: () => [track] }; return destination;
      }, setSinkId() { return Promise.resolve(); } },
    gainNode: node(), analyser: node(), audioReady: true, uiSfxCtx: null,
    audioOutputDeviceId: 'speaker', audioOutputDevices: [{ deviceId: 'speaker', label: 'Speakers' }, { deviceId: 'a', label: 'CABLE Input' }],
    audioInputBridgeState: { enabled: false, deviceId: '' }, audioOutputMirrorDeviceIds: ['a'],
    audioOutputMirrorElements: {}, audioOutputMirrorRuntime: {}, audioOutputMirrorSyncTimer: 0,
    showToast(message) { toasts.push(message); },
  };
  vm.createContext(c); vm.runInContext(source.slice(source.indexOf('var audioRouteWorkflowDrag')), c);
  return { c, elements, tracks, sinkCalls, toasts, timers,
    outputs: c.audioOutputDevices.slice(),
    at(time, reason = 'clock') { now = time; c.syncAudioOutputMirrors(reason); },
    timeouts() { return toasts.filter(message => message.includes('连接超时')); },
  };
}

test('pending sink gets one timed rebuild and one stable failure; both retired sinks are cancelled', async () => {
  const f = fixture(); f.c.syncAudioOutputMirrors('play');
  const first = f.elements[0]; f.at(5999); assert.equal(f.elements.length, 1);
  f.at(6600); assert.equal(f.elements.length, 2); assert.equal(f.tracks[0].stops, 1);
  assert.equal(first.srcObject, null); assert.equal(f.c.audioOutputMirrorStall.a.retried, true);
  const second = f.elements[1]; f.at(12599); assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'sink-pending');
  f.at(13200); assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'stalled');
  assert.equal(f.tracks[1].stops, 1); assert.equal(second.srcObject, null);
  assert.equal(f.c.audioOutputMirrorElements.a, undefined); assert.equal(f.timeouts().length, 1);
  for (const time of [15400, 17600, 60000]) f.at(time);
  assert.equal(f.elements.length, 2); assert.equal(f.timeouts().length, 1);
  first.resolveSink(); second.resolveSink(); await flush();
  assert.equal(first.playCalls + second.playCalls, 0);
  assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'stalled');
  assert(f.tracks.every(track => track.stops === 1));
});

test('repeated play AbortError cannot refresh the owned attempt deadline or loop after failure', async () => {
  const f = fixture('play-abort'); f.c.syncAudioOutputMirrors('play'); await flush();
  assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'waiting');
  for (const time of [2200, 4400]) { f.at(time); await flush(); }
  assert.equal(f.c.audioOutputMirrorRuntime.a.at, 4400, 'visible state may change on every play rejection');
  assert.equal(f.c.audioOutputMirrorStall.a.startedAt, 0, 'attempt deadline remains independent of visible status');
  f.at(6600); await flush(); assert.equal(f.elements.length, 2);
  for (const time of [8800, 11000, 13200]) { f.at(time); await flush(); }
  assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'stalled'); assert.equal(f.timeouts().length, 1);
  const plays = f.elements.reduce((total, mirror) => total + mirror.playCalls, 0);
  for (let time = 15400; time <= 22000; time += 2200) { f.at(time); await flush(); }
  assert.equal(f.elements.length, 2); assert.equal(f.elements.reduce((total, mirror) => total + mirror.playCalls, 0), plays);
  assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'stalled');
});

test('global Retry starts a new full budget and notification even after a terminal failure', async () => {
  const f = fixture(); f.c.syncAudioOutputMirrors('play'); f.at(6600); f.at(13200);
  f.c.retryAudioRoutes(); await flush();
  assert.equal(f.elements.length, 3); assert.equal(f.c.audioOutputMirrorStall.a.retried, false);
  f.at(19800); assert.equal(f.elements.length, 4); assert.equal(f.timeouts().length, 1);
  f.at(26400); assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'stalled'); assert.equal(f.timeouts().length, 2);
});

test('manual disconnect/reconnect and global disconnect clear the owned retry state and resources', () => {
  const f = fixture(); f.c.syncAudioOutputMirrors('play'); f.at(6600); f.at(13200);
  f.c.toggleAudioOutputMirrorDevice('a'); assert.equal(f.c.audioOutputMirrorStall.a, undefined);
  f.c.toggleAudioOutputMirrorDevice('a'); assert.equal(f.elements.length, 3);
  f.at(19800); assert.equal(f.elements.length, 4, 'reconnected row gets its one automatic rebuild');
  f.c.disconnectAdditionalAudioRoutes();
  assert.equal(Object.keys(f.c.audioOutputMirrorStall).length, 0);
  assert.equal(Object.keys(f.c.audioOutputMirrorRuntime).length, 0);
  assert.equal(f.timers.size, 0); assert(f.tracks.every(track => track.stops === 1));
  assert(f.elements.every(mirror => mirror.srcObject === null));
});

test('incomplete enumeration and graph wait never time out before a real connection attempt', () => {
  for (const wait of ['outputs', 'graph']) {
    const f = fixture();
    if (wait === 'outputs') { f.c.audioOutputDeviceSnapshotKnown = false; f.c.audioOutputDevices = []; }
    else f.c.audioReady = false;
    f.c.syncAudioOutputMirrors('play');
    for (const time of [6600, 13200, 22000]) f.at(time);
    assert.equal(f.elements.length, 0); assert.equal(f.sinkCalls.length, 0); assert.equal(f.timeouts().length, 0);
    assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'waiting'); assert.equal(f.c.audioOutputMirrorStall.a, undefined);
    assert.match(f.c.audioOutputMirrorRuntime.a.message, wait === 'outputs' ? /设备列表未完整读取/ : /播放时自动连接/);
    f.c.audioReady = true; f.c.audioOutputDeviceSnapshotKnown = true; f.c.audioOutputDevices = f.outputs;
    f.at(23000, 'devicechange'); assert.equal(f.elements.length, 1);
    f.at(28999); assert.equal(f.elements.length, 1); f.at(29000); assert.equal(f.elements.length, 2);
  }
});

test('incomplete enumeration suspends a pending attempt without rebinding, rebuilding, or losing active age', () => {
  const f = fixture(); f.c.syncAudioOutputMirrors('play'); f.at(2200);
  f.c.audioOutputDeviceSnapshotKnown = false; f.c.audioOutputDevices = []; f.at(2200, 'devicechange');
  f.at(62000); assert.equal(f.elements.length, 1); assert.equal(f.sinkCalls.length, 1); assert.equal(f.timeouts().length, 0);
  assert.match(f.c.audioOutputMirrorRuntime.a.message, /设备列表未完整读取/);
  f.c.audioOutputDeviceSnapshotKnown = true; f.c.audioOutputDevices = f.outputs; f.at(62000, 'devicechange');
  f.at(65799); assert.equal(f.elements.length, 1); f.at(65800); assert.equal(f.elements.length, 2);
});

test('pause suspends pending timeout age, resume uses remaining budget, and paused Retry resets it', async () => {
  const f = fixture(); f.c.syncAudioOutputMirrors('play'); f.at(2200);
  f.c.audio.paused = true; f.at(2200, 'pause'); f.at(62000);
  assert.equal(f.elements.length, 1); assert.equal(f.timeouts().length, 0);
  f.c.audio.paused = false; f.at(62000, 'play');
  assert.equal(f.elements.length, 1, 'paused wall time does not cause an immediate rebuild');
  f.at(65799); assert.equal(f.elements.length, 1); f.at(65800); assert.equal(f.elements.length, 2);
  f.c.audio.paused = true; f.at(65800, 'pause'); f.c.retryAudioRoutes(); await flush();
  assert.equal(f.elements.length, 3); assert.equal(f.c.audioOutputMirrorStall.a.retried, false);
  f.at(120000); assert.equal(f.elements.length, 3);
  f.c.audio.paused = false; f.at(120000, 'play'); f.at(125999); assert.equal(f.elements.length, 3);
  f.at(126000); assert.equal(f.elements.length, 4);
  f.c.disconnectAdditionalAudioRoutes(); assert(f.tracks.every(track => track.stops === 1));
});

test('late play resolve/rejection cannot revive a retired route or overwrite the replacement', async () => {
  for (const completion of ['resolvePlay', 'rejectPlay']) {
    const f = fixture('play-pending'); f.c.syncAudioOutputMirrors('play'); await flush();
    const first = f.elements[0]; assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'play-pending');
    f.at(6600); await flush(); const second = f.elements[1];
    first[completion]({ name: 'AbortError' }); await flush();
    assert.equal(f.c.audioOutputMirrorElements.a, second); assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'play-pending');
    assert.equal(first.srcObject, null); assert.equal(f.tracks[0].stops, 1);
    f.at(13200); second[completion]({ name: 'AbortError' }); await flush();
    assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'stalled'); assert.equal(f.timeouts().length, 1);
    assert.equal(second.srcObject, null); assert.equal(f.tracks[1].stops, 1);
  }
});

test('successful late replacement clears failure budget and a new graph starts a fresh attempt', async () => {
  const f = fixture(); f.c.syncAudioOutputMirrors('play'); f.at(6600);
  f.elements[1].resolveSink(); await flush();
  assert.equal(f.c.audioOutputMirrorRuntime.a.state, 'playing'); assert.equal(f.c.audioOutputMirrorStall.a, undefined);
  f.c.gainNode = f.c.audioCtx.createGain(); f.at(22000, 'sourcechange');
  assert.equal(f.elements.length, 3); assert.equal(f.c.audioOutputMirrorStall.a.retried, false);
  assert.equal(f.tracks[1].stops, 1); f.at(28000); assert.equal(f.elements.length, 4);
});
