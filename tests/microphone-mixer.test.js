const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const runtimePath = path.join(__dirname, '../public/js/modules/05-playback/19-microphone-mixer-runtime.js');
const scope = { Float32Array, Map, Promise, Object, Number, Math, isFinite, setInterval, clearInterval };
vm.runInNewContext(fs.readFileSync(runtimePath, 'utf8'), scope);
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function stream() {
  const track = { stopped: 0, onended: null, stop() { this.stopped += 1; } };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}
function context() {
  const nodes = [], ctx = { state: 'running', currentTime: 2, destination: { monitor: true }, nodes, closed: 0,
    close() { this.state = 'closed'; this.closed += 1; return Promise.resolve(); }, resume() { return Promise.resolve(); } };
  function node(kind) {
    const n = { kind, context: ctx, connections: [], disconnects: [], gain: { value: 1, setTargetAtTime(value) { this.value = value; } },
      connect(target) { this.connections.push(target); }, disconnect(target) { this.disconnects.push(target || 'all'); },
      getFloatTimeDomainData(samples) { samples[0] = .9; } };
    if (kind === 'destination') n.stream = stream(); nodes.push(n); return n;
  }
  ctx.createGain = () => node('gain'); ctx.createDelay = () => { const n = node('delay'); n.delayTime = { setTargetAtTime(v) { this.value = v; } }; return n; }; ctx.createWaveShaper = () => node('limiter'); ctx.createAnalyser = () => node('analyser');
  ctx.createMediaStreamDestination = () => node('destination'); ctx.createMediaStreamSource = () => node('source');
  return ctx;
}
function setup(overrides = {}) {
  const ctxs = [], audios = [], inputs = [], states = [], calls = [], timers = new Map(); let nextTimer = 0;
  const options = { createContext() { const c = context(); ctxs.push(c); return c; },
    createAudio() { const a = { muted: false, srcObject: null, played: 0, pauses: 0, async setSinkId(id) { calls.push('sink:' + id); this.sinkId = id; }, async play() { assert.equal(this.sinkId, 'virtual'); assert.equal(this.muted, false); this.played += 1; }, pause() { this.pauses += 1; } }; audios.push(a); return a; },
    async requestPermission() { calls.push('permission'); return { ok: true, token: 'grant' }; }, revokePermission() { calls.push('revoke'); },
    async getUserMedia(constraints) { calls.push('microphone'); assert.equal(constraints.video, false); assert.equal(constraints.audio.deviceId.exact, 'mic'); const s = stream(); inputs.push(s); return s; },
    isInputAvailable: id => id === 'mic', isTargetAvailable: id => id === 'virtual', onState: s => states.push(s),
    setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); }, ...overrides };
  const runtime = scope.createMicrophoneMixerRuntime(options);
  return { runtime, options, ctxs, audios, inputs, states, calls, timers, config: { microphone: 'mic', target: 'virtual' } };
}
test('explicit enable targets virtual output first, never monitors microphone, preserves saved levels and pauses only music', async () => {
  const s = setup(); assert.equal(s.calls.length, 0); assert.equal(s.runtime.getState().phase, 'off');
  s.runtime.setLevels({ microphone: 42, music: 67, musicMuted: true });
  assert.equal(await s.runtime.start(s.config), true);
  assert.deepEqual(s.calls.slice(0, 3), ['sink:virtual', 'permission', 'microphone']);
  const ctx = s.ctxs[0]; assert.equal(ctx.nodes.some(n => n.connections.includes(ctx.destination)), false);
  const gains = ctx.nodes.filter(n => n.kind === 'gain'); assert.equal(gains[0].gain.value, .42); assert.equal(gains[1].gain.value, 0);
  const musicContext = context(), current = musicContext.createGain(), prepared = musicContext.createGain();
  s.runtime.attachMusic('current', musicContext, [current]); s.runtime.attachMusic('next', musicContext, [prepared]);
  assert.equal(current.connections.length, 1); assert.equal(prepared.connections.length, 1);
  s.runtime.detachMusic('current'); assert.equal(s.audios[0].played, 1); assert.equal(s.audios[0].pauses, 0);
  assert.equal(s.inputs[0].track.stopped, 0); assert.equal(s.runtime.getState().phase, 'running');
  s.runtime.disable(); assert.equal(s.inputs[0].track.stopped, 1); assert.equal(s.timers.size, 0); assert.equal(ctx.closed, 1);
});
test('duplicate enables share one pending capture; cancelled late stream is stopped and never played', async () => {
  const capture = deferred(), late = stream(); const s = setup({ getUserMedia: () => capture.promise });
  const first = s.runtime.start(s.config), second = s.runtime.start(s.config); assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  s.runtime.disable('panel-closed'); capture.resolve(late);
  assert.equal(await first, false); assert.equal(late.track.stopped, 1); assert.equal(s.audios[0].played, 0); assert.equal(s.runtime.getState().phase, 'off');
});
test('sink and permission failures do not open microphone or fall back to system speakers', async () => {
  const s = setup({ createAudio: () => ({ muted: true, async setSinkId() { throw new Error('sink fail'); }, pause() {} }) });
  assert.equal(await s.runtime.start(s.config), false); assert.equal(s.calls.includes('permission'), false); assert.equal(s.inputs.length, 0); assert.equal(s.runtime.getState().phase, 'error');
  const denied = setup({ requestPermission: async () => false }); assert.equal(await denied.runtime.start(denied.config), false); assert.equal(denied.inputs.length, 0);
  const unavailable = setup(); assert.equal(await unavailable.runtime.start({ microphone: 'loopback', target: 'virtual' }), false); assert.equal(unavailable.ctxs.length, 0);
});
test('device unplug, track end and output failure stop capture and never reopen automatically', async () => {
  for (const action of [s => s.runtime.checkDevices([], [{ deviceId: 'virtual' }]), s => s.inputs[0].track.onended(), s => s.audios[0].onerror()]) {
    const s = setup(); await s.runtime.start(s.config); action(s);
    assert.equal(s.inputs[0].track.stopped, 1); assert.equal(s.runtime.getState().phase, 'off');
    s.runtime.checkDevices([{ deviceId: 'mic' }], [{ deviceId: 'virtual' }]); assert.equal(s.inputs.length, 1);
  }
});
test('a permission-hidden input snapshot never falsely stops capture but real track loss still does', async () => {
  const s = setup(); await s.runtime.start(s.config);
  s.runtime.checkDevices([], [{ deviceId: 'virtual' }], false);
  assert.equal(s.runtime.getState().phase, 'running'); assert.equal(s.inputs[0].track.stopped, 0);
  s.inputs[0].track.onended();
  assert.equal(s.runtime.getState().phase, 'off'); assert.equal(s.inputs[0].track.stopped, 1);
});
test('permission-hidden outputs retain the verified sink but output errors and full absence still stop it', async () => {
  for (const action of [s => s.audios[0].onerror(), s => s.runtime.checkDevices([{ deviceId: 'mic' }], [], true, true)]) {
    const s = setup(); await s.runtime.start(s.config);
    s.runtime.checkDevices([], [], false, false);
    assert.equal(s.runtime.getState().phase, 'running'); assert.equal(s.audios[0].sinkId, 'virtual');
    assert.equal(s.calls.filter(value => value.startsWith('sink:')).length, 1, 'never fall back to the system default');
    action(s); assert.equal(s.runtime.getState().phase, 'off'); assert.equal(s.inputs[0].track.stopped, 1);
  }
});
test('prepared one-click authorization is consumed by one final capture and revoked on early failure or cancellation', async () => {
  const grant = { ok: true, token: 'prepared-setup' };
  const s = setup({ requestPermission: () => { throw Error('must not mint another gesture grant'); } });
  assert.equal(await s.runtime.start({ ...s.config, authorization: grant }), true);
  assert.equal(s.calls.filter(value => value === 'microphone').length, 1); assert.equal(s.calls.filter(value => value === 'revoke').length, 1);
  s.runtime.disable();
  const invalid = setup(); assert.equal(await invalid.runtime.start({ microphone: '', target: '', authorization: grant }), false);
  assert.equal(invalid.calls.filter(value => value === 'revoke').length, 1); assert.equal(invalid.inputs.length, 0);
  const sinkWait = deferred(), cancelled = setup({ createAudio: () => ({ muted: true, setSinkId: () => sinkWait.promise, pause() {} }) });
  const pending = cancelled.runtime.start({ ...cancelled.config, authorization: grant }); await new Promise(resolve => setImmediate(resolve));
  cancelled.runtime.disable(); sinkWait.resolve(); assert.equal(await pending, false);
  assert.equal(cancelled.calls.filter(value => value === 'revoke').length, 1); assert.equal(cancelled.inputs.length, 0);
});
test('music bridges stay unique across AutoMix adoption and never disconnect monitor nodes globally', async () => {
  const s = setup(); await s.runtime.start(s.config); const ctx = context(), gain = ctx.createGain(), wet = ctx.createGain();
  assert.equal(s.runtime.attachMusic(gain, ctx, [gain, wet]), true); assert.equal(s.runtime.attachMusic(gain, ctx, [gain, wet]), true); assert.equal(gain.connections.length, 1);
  s.runtime.detachMusic(gain); assert.equal(gain.disconnects.length, 1); assert.notEqual(gain.disconnects[0], 'all');
  ctx.createMediaStreamDestination = () => { throw new Error('closed'); };
  assert.equal(s.runtime.attachMusic('bad', ctx, [gain]), false); assert.equal(gain.disconnects.length, 1);
  s.runtime.disable();
});
test('sample safety ceiling and low-rate meter bound the sum; input and music mutes are independent', async () => {
  const s = setup(); const curve = s.runtime.limiterCurve(); assert.equal(curve[1024], 0); assert.ok(Math.max(...curve) <= .951); assert.ok(Math.min(...curve) >= -.951);
  await s.runtime.start(s.config); s.runtime.setLevels({ microphoneMuted: true, music: 33 });
  const gains = s.ctxs[0].nodes.filter(n => n.kind === 'gain'); assert.equal(gains[0].gain.value, 0); assert.equal(gains[1].gain.value, .33);
  [...s.timers.values()][0](); assert.ok(s.runtime.getState().peak <= 1); s.runtime.disable();
});
test('immediate construction errors can be retried and play failure releases every stream', async () => {
  let attempts = 0; const s = setup({ createContext() { if (!attempts++) throw new Error('no context'); return context(); } });
  assert.equal(await s.runtime.start(s.config), false); assert.equal(await s.runtime.start(s.config), true); s.runtime.disable();
  const failed = setup(); failed.options.createAudio = () => ({ muted: true, async setSinkId() {}, async play() { throw new Error('play failed'); }, pause() {} });
  assert.equal(await failed.runtime.start(failed.config), false); assert.equal(failed.inputs[0].track.stopped, 1); assert.equal(failed.timers.size, 0);
});
