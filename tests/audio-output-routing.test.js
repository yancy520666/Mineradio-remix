'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/modules/05-playback/00-api-quality-output.js', 'utf8');
function setup() {
  const saved = new Map();
  function node() {
    return { gain: { setTargetAtTime(value) { this.value = value; } }, delayTime: { setTargetAtTime(value) { this.value = value; } },
      links: [], connect(target) { this.links.push(target); }, disconnect(target) { this.links = target ? this.links.filter(n => n !== target) : []; } };
  }
  class Media {
    constructor() { this.paused = true; this.src = ''; this.playCalls = 0; }
    setSinkId(id) { this.sinkId = id; return Promise.resolve(); }
    play() { this.paused = false; this.playCalls++; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const ctx = {
    console, Promise, setTimeout, requestAnimationFrame() {}, setInterval() { return 1; }, clearInterval() {},
    localStorage: { getItem(key) { return saved.get(key); }, setItem(key, value) { saved.set(key, value); } },
    navigator: {}, document: { getElementById() { return null; } }, HTMLMediaElement: Media, Audio: Media,
    AUDIO_OUTPUT_DEVICE_STORE_KEY: 'primary', AUDIO_OUTPUT_MIRROR_STORE_KEY: 'mirrors', AUDIO_INPUT_BRIDGE_STORE_KEY: 'bridge',
    audio: { paused: false, ended: false, muted: false, addEventListener() {}, setSinkId() { return Promise.resolve(); } },
    audioCtx: { state: 'running', currentTime: 1, createDelay: node, createGain: node, createMediaStreamDestination() {
      const result = node(); result.stream = { getTracks: () => [{ stop() {} }] }; return result;
    }, setSinkId() { return Promise.resolve(); } },
    gainNode: node(), analyser: node(), audioReady: true, uiSfxCtx: null,
    audioOutputDeviceId: 'speaker', audioOutputDevices: [{ deviceId: 'speaker', label: 'Speakers' }, { deviceId: 'a', label: 'CABLE Input' }, { deviceId: 'b', label: 'CABLE-B Input' }],
    audioInputBridgeState: { enabled: false, deviceId: '' }, audioOutputMirrorDeviceIds: ['a', 'b'],
    audioOutputMirrorElements: {}, audioOutputMirrorRuntime: {}, audioOutputMirrorSyncTimer: 0, showToast() {},
  };
  vm.createContext(ctx); vm.runInContext(source.slice(source.indexOf('var audioRouteWorkflowDrag')), ctx);
  return ctx;
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test('short and tall audio links keep forward travel and horizontal port tangents', () => {
  const c = setup();
  for (const [gap, height] of [[12, 0], [20, 80], [42, -220], [180, 12], [420, 300]]) {
    const values = c.audioRouteBezierPath({ x: 10, y: 240 }, { x: 10 + gap, y: 240 + height }).match(/-?\d+(?:\.\d+)?/g).map(Number);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = values;
    assert.deepEqual([x0, y0, x3, y3], [10, 240, 10 + gap, 240 + height]);
    assert.equal(y0, y1, 'leave the source horizontally');
    assert.equal(y2, y3, 'enter the destination horizontally');
    assert.ok(x0 < x1 && x1 <= x2 && x2 < x3, 'short links must not reverse around the middle');
    for (let step = 0; step <= 100; step++) {
      const t = step / 100;
      const derivative = 3 * (1 - t) ** 2 * (x1 - x0) + 6 * (1 - t) * t * (x2 - x1) + 3 * t ** 2 * (x3 - x2);
      assert.ok(derivative > 0);
    }
  }
});
test('two virtual microphones receive the same graph, with independent levels and delay', async () => {
  const c = setup(); c.syncAudioOutputMirrors('play'); await flush();
  assert.equal(c.audioOutputDeviceId, 'speaker');
  for (const id of ['a', 'b']) {
    assert.equal(c.audioOutputMirrorRuntime[id].state, 'playing');
    assert.equal(c.audioOutputMirrorElements[id]._route.tap, c.gainNode);
    assert.equal(c.audioOutputMirrorElements[id].src, '', 'never re-fetch the song URL');
    assert.ok(c.audioOutputMirrorElements[id].srcObject);
  }
  c.setAudioRouteSetting('a', 'volume', 30); c.setAudioRouteSetting('a', 'delay', 250);
  assert.equal(c.audioOutputMirrorElements.a._route.gain.gain.value, .3);
  assert.equal(c.audioOutputMirrorElements.a._route.delay.delayTime.value, .25);
  assert.equal(c.audioOutputMirrorElements.b._route.gain.gain.value, 1);
  c.setAudioRouteSetting('b', 'muted', true);
  assert.equal(c.audioOutputMirrorElements.b._route.gain.gain.value, 0);
  c.audio.paused = true; c.syncAudioOutputMirrors('pause');
  assert.equal(c.audioOutputMirrorElements.a.paused, true);
  c.audio.paused = false; c.syncAudioOutputMirrors('play'); await flush();
  assert.equal(c.audioOutputMirrorRuntime.a.state, 'playing');
});
test('late sink completion cannot reactivate a disconnected route', async () => {
  const c = setup(); let resolve;
  c.Audio.prototype.setSinkId = () => new Promise(done => { resolve = done; });
  c.audioOutputMirrorDeviceIds = ['a']; c.syncAudioOutputMirrors('play');
  const route = c.audioOutputMirrorElements.a;
  c.disconnectAdditionalAudioRoutes(); resolve(); await flush();
  assert.equal(route.playCalls, 0); assert.equal(route.srcObject, null);
  assert.equal(Object.keys(c.audioOutputMirrorElements).length, 0);
  assert.equal(Object.keys(c.audioOutputMirrorRuntime).length, 0);
});
test('offline devices keep preference and rebuild from the current graph on reconnect', async () => {
  const c = setup(); c.syncAudioOutputMirrors('play'); await flush();
  c.audioOutputDevices = c.audioOutputDevices.filter(d => d.deviceId !== 'a');
  c.syncAudioOutputMirrors('devicechange');
  assert.equal(c.audioOutputMirrorRuntime.a.state, 'disconnected');
  assert.ok(c.audioOutputMirrorDeviceIds.includes('a'));
  c.audioOutputDevices.push({ deviceId: 'a', label: 'CABLE Input' });
  c.gainNode = c.audioCtx.createGain(); c.syncAudioOutputMirrors('devicechange'); await flush();
  assert.equal(c.audioOutputMirrorElements.a._route.tap, c.gainNode);
  assert.equal(c.audioOutputMirrorRuntime.a.state, 'playing');
});
test('legacy single bridge stays selected and default-device aliases never duplicate output', async () => {
  const c = setup(); c.audioOutputMirrorDeviceIds = ['a']; c.audioInputBridgeState = { enabled: true, deviceId: 'b' };
  assert.deepEqual(Array.from(c.audioRouteSelectedIds()), ['a', 'b']);
  c.audioOutputDefaultDeviceId = 'a'; c.audioOutputDeviceId = '';
  c.syncAudioOutputMirrors('play'); await flush();
  assert.equal(c.audioOutputMirrorElements.a, undefined);
  assert.ok(c.audioOutputMirrorElements.b);
  c.setAudioOutputDevice('speaker', false); await flush();
  assert.equal(c.audioInputBridgeState.enabled, true);
  assert.ok(c.audioOutputMirrorElements.a);
});
test('output switch requests are serialized and preserve an unavailable primary preference', async () => {
  const c = setup(); const calls = []; let release;
  c.audio.setSinkId = id => { calls.push(id); return calls.length === 1 ? new Promise(done => { release = done; }) : Promise.resolve(); };
  const first = c.applyAudioOutputDevice(c.audio); await flush();
  c.audioOutputDeviceId = 'b'; const second = c.applyAudioOutputDevice(c.audio); await flush();
  assert.deepEqual(calls, ['speaker']); release(); await Promise.all([first, second]);
  assert.deepEqual(calls, ['speaker', 'b']);
  c.audioOutputDeviceId = 'offline'; await c.applyAudioOutputDevice(c.audio);
  assert.equal(c.audioOutputDeviceId, 'offline'); assert.equal(calls.at(-1), '');
});

test('a failed device connection can recover on refresh and settings survive reload', async () => {
  const c = setup(); c.audioOutputMirrorDeviceIds = ['a'];
  let fail = true;
  c.Audio.prototype.setSinkId = () => fail ? Promise.reject({ name: 'NotFoundError' }) : Promise.resolve();
  c.syncAudioOutputMirrors('play'); await flush();
  assert.equal(c.audioOutputMirrorRuntime.a.state, 'sink-error');
  fail = false; c.syncAudioOutputMirrors('apply-device'); await flush();
  assert.equal(c.audioOutputMirrorRuntime.a.state, 'playing');
  c.setAudioRouteSetting('a', 'delay', 8000); c.setAudioRouteSetting('a', 'volume', -50);
  c.audioRouteSettings = c.readAudioRouteSettings();
  assert.equal(c.audioRouteSetting('a').delay, 1000);
  assert.equal(c.audioRouteSetting('a').volume, 0);
  c.audioOutputDevices = c.audioOutputDevices.filter(d => d.deviceId !== 'a'); c.syncAudioOutputMirrors('devicechange');
  assert.equal(c.audioOutputMirrorRuntime.a.state, 'disconnected');
});
