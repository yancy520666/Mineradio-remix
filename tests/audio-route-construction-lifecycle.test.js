'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(point) {
  const monitor = {}, nodes = [], tracks = [], disconnectTargets = [];
  let fail = point, c;
  function failure(at) { if (fail === at) throw new Error('fixture-' + at); }
  function node(kind) {
    failure('create-' + kind);
    const n = { kind, links: [], disconnects: 0,
      gain: { setTargetAtTime(value) { this.value = value; } }, delayTime: { setTargetAtTime(value) { this.value = value; } },
      connect(target) { failure(kind + '-connect'); this.links.push(target); },
      disconnect(target) { this.disconnects++; this.links = target ? this.links.filter(entry => entry !== target) : []; } };
    nodes.push(n); return n;
  }
  const tap = { links: [monitor], connect(target) { failure('tap-connect'); this.links.push(target); },
    disconnect(target) { disconnectTargets.push(target); this.links = this.links.filter(entry => entry !== target); } };
  c = vm.createContext({ console, Promise, audioOutputSinkEpoch: 0, audioOutputSinkApplications: new WeakMap(), audioRouteSelectedIds: () => ['fixture'], effectiveAudioPrimaryId: () => '',
    audioOutputDeviceById: () => ({ deviceId: 'fixture' }), audioOutputMirrorSinkSupported: () => true,
    markAudioOutputMirrorRuntime(id, state, message) { c.audioOutputMirrorRuntime[id] = { state, message }; },
    audioOutputMirrorRuntimeFor: id => c.audioOutputMirrorRuntime[id], audioOutputMirrorReadableError: () => 'fixture-error',
    audioRouteSetting: () => ({ volume: 30, delay: 250, muted: false }), audio: { paused: false, ended: false, muted: false }, audioReady: true,
    audioCtx: { state: 'running', currentTime: 1, createDelay: () => node('delay'), createGain: () => node('gain'),
      createMediaStreamDestination() { const n = node('destination'), track = { stops: 0, stop() { this.stops++; } };
        tracks.push(track); n.stream = { getTracks: () => [track] }; return n; } }, gainNode: tap, analyser: null,
    Audio: function () {
      failure('audio-constructor'); this.paused = true; this.pause = () => { this.paused = true; };
      this.play = () => { this.paused = false; return Promise.resolve(); }; this.setSinkId = () => Promise.resolve();
      Object.defineProperty(this, 'srcObject', { get() { return this._stream; }, set(value) { if (value) failure('attach-stream'); this._stream = value; } });
    }, audioOutputMirrorElements: {}, audioOutputMirrorRuntime: {}, audioOutputMirrorSyncTimer: 0,
    setInterval: () => 1, clearInterval() {}, applyAudioOutputDevice() { c.syncAudioOutputMirrors('apply-device'); } });
  loadFunctions(c, 'public/js/modules/05-playback/00-api-quality-output.js', [
    'invalidateAudioOutputSinkApplications', 'releaseAudioOutputMirrorResources', 'removeAudioOutputMirror', 'clearAudioOutputMirrors',
    'applyAudioOutputMirrorSink', 'syncAudioOutputMirrors', 'applyAudioRouteSettings', 'retryAudioRoutes' ]);
  return { c, tap, monitor, nodes, tracks, disconnectTargets, recover() { fail = ''; } };
}
test('every construction failure retires only the owned partial route; retry preserves the normal settings', async () => {
  for (const point of ['create-delay', 'create-gain', 'create-destination', 'audio-constructor', 'tap-connect', 'delay-connect', 'gain-connect', 'attach-stream']) {
    const f = fixture(point);
    for (let attempt = 0; attempt < 3; attempt++) f.c.syncAudioOutputMirrors('clock');
    assert.deepEqual(f.tap.links, [f.monitor], point + ': preserve the independent monitor branch');
    assert.equal(Object.keys(f.c.audioOutputMirrorElements).length, 0);
    assert(f.nodes.every(node => node.disconnects === 1), point + ': release allocated nodes once');
    assert(f.tracks.every(track => track.stops === 1), point + ': stop the owned destination tracks');
    assert(f.disconnectTargets.every(Boolean), 'never call shared tap.disconnect() without the owned edge');
    f.recover(); f.c.retryAudioRoutes(); await flush();
    const mirror = f.c.audioOutputMirrorElements.fixture;
    assert(mirror); assert.equal(f.c.audioOutputMirrorRuntime.fixture.state, 'playing');
    assert.equal(mirror._route.gain.gain.value, .3); assert.equal(mirror._route.delay.delayTime.value, .25);
    f.c.removeAudioOutputMirror('fixture'); f.c.releaseAudioOutputMirrorResources(mirror, mirror._route);
    assert.deepEqual(f.tap.links, [f.monitor]); assert.equal(f.tracks.at(-1).stops, 1);
    assert.equal(mirror.srcObject, null); assert.equal(mirror._route.released, true);
  }
});
