'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const base = 'public/js/modules/05-playback/';
const mic = { kind: 'audioinput', deviceId: 'mic', groupId: 'physical', label: 'Headset microphone' };
const speaker = { kind: 'audiooutput', deviceId: 'speaker', groupId: 'physical', label: 'Speakers' };
const cable = { kind: 'audiooutput', deviceId: 'virtual', groupId: 'cable', label: 'CABLE Input (VB-Audio Virtual Cable)' };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture({ devices = [mic, speaker, cable], preference = {}, observed = true } = {}) {
  const events = [], saved = [], authorization = { ok: true, token: 'setup-token', expiresAt: 9000 };
  let state = { phase: 'off', target: '', microphone: '' }, listed = devices;
  const bridge = {
    beginMicrophoneMixingSetup: async () => { events.push('setup'); return authorization; },
    prepareMicrophoneCapture: async token => { events.push('prepare:' + token); return authorization; },
    beginMicrophoneEnumeration: async () => { events.push('enumeration-only'); return { ok: true, token: 'enumerate-token' }; },
    endMicrophoneCapture: async token => events.push('revoke:' + token),
    beginVirtualAudioSetup: async topic => { events.push('guide:' + topic); return { ok: true, opened: true }; }
  };
  const c = vm.createContext({ console, Promise, localStorage: { getItem: () => JSON.stringify(preference), setItem: (_key, value) => saved.push(JSON.parse(value)) },
    window: { desktopWindow: bridge }, navigator: { mediaDevices: { enumerateDevices: async () => { events.push('enumerate'); return listed; },
      getUserMedia() { throw Error('no real capture in frontend tests'); } } },
    audioInputDevices: [], audioOutputDevices: [], audioOutputDeviceId: 'speaker', audioOutputDefaultDeviceId: 'speaker', audioOutputDeviceSnapshotKnown: true,
    audioOutputDeviceSnapshotObserved: observed, audioOutputDeviceLabels: Object.create(null), audio: { sinkId: 'speaker' }, audioCtx: null,
    effectiveAudioPrimaryId: () => 'speaker', renderAudioOutputDeviceUi() {}, refreshAudioOutputDevices: () => events.push('refresh-output'),
    audioRouteSetting: () => ({ volume: 100, muted: false, delay: 0 }) });
  loadFunctions(c, base + '00-api-quality-output.js', ['isVirtualMicOutputDevice', 'updateAudioOutputDeviceSnapshot']);
  vm.runInContext(fs.readFileSync(base + '20-microphone-mixer-ui.js', 'utf8'), c);
  vm.runInContext(fs.readFileSync(base + '21-one-click-microphone-mixer.js', 'utf8'), c);
  c.updateAudioOutputDeviceSnapshot(devices, true); c.audioOutputDeviceSnapshotObserved = observed;
  c.microphoneMixerRuntime = { getState: () => state, setLevels() {}, setOutputSettings() {}, disable: () => { events.push('stop'); state = { phase: 'off', microphone: '', target: '' }; },
    start: async config => { events.push('capture:' + config.microphone + ':' + config.target); if (config.authorization) assert.equal(config.authorization.token, 'setup-token');
      state = { phase: 'running', microphone: config.microphone, target: config.target }; return true; }, attachMusic() {} };
  c.syncMicrophoneMixerMusic = () => events.push('attach-music');
  return { c, events, saved, bridge, authorization, setDevices: value => { listed = value; }, setState: value => { state = value; } };
}
test('one explicit enable enumerates once then chooses unique physical microphone and CABLE before final capture', async () => {
  const f = fixture(); assert.deepEqual(f.events, []); assert.equal(f.c.microphoneMixerState().phase, 'off');
  assert.equal(await f.c.toggleMicrophoneMixer(), true);
  assert.deepEqual(f.events, ['setup', 'enumerate', 'prepare:setup-token', 'capture:mic:virtual', 'attach-music', 'refresh-output']);
  assert.equal(f.c.microphoneMixerPreference.microphone, 'mic'); assert.equal(f.c.microphoneMixerPreference.target, 'virtual');
  assert.equal(f.saved.some(value => value.enabled === true), false);
});
test('saved available choices win; otherwise a physical default group resolves multiple microphones', async () => {
  const other = { ...mic, deviceId: 'other', groupId: 'other', label: 'Desk microphone' };
  const defaults = { ...mic, deviceId: 'default' };
  const saved = fixture({ devices: [defaults, mic, other, speaker, cable], preference: { microphone: 'other', target: 'virtual' } });
  await saved.c.enableMicrophoneMixerOneClick(); assert.ok(saved.events.includes('capture:other:virtual'));
  const current = fixture({ devices: [defaults, mic, other, speaker, cable] });
  await current.c.enableMicrophoneMixerOneClick(); assert.ok(current.events.includes('capture:mic:virtual'));
});
test('ambiguous microphones and Pack45 same-group playback endpoints remain choices and revoke setup without capture', async () => {
  const cases = [[mic, { ...mic, deviceId: 'second', groupId: 'second', label: 'Desk microphone' }, speaker, cable],
    [mic, speaker, cable, { ...cable, deviceId: 'line-out', label: 'Line Out (VB-Audio Virtual Cable)' }],
    [mic, speaker, cable, { ...cable, deviceId: 'voicemeeter', label: 'Voicemeeter Input' }]];
  for (const devices of cases) {
    const f = fixture({ devices }); assert.equal(await f.c.enableMicrophoneMixerOneClick(), false);
    assert.equal(f.events.some(value => value.startsWith('capture:') || value.startsWith('prepare:')), false);
    assert.ok(f.events.includes('revoke:setup-token')); assert.match(f.c.microphoneMixerDiscoveryMessage, /多个/);
  }
});
test('virtual recording inputs are never selected as the physical mic; arbitrary virtual buses require a saved choice', async () => {
  const sonar = { ...cable, deviceId: 'sonar', label: 'SteelSeries Sonar - Gaming' };
  const f = fixture({ devices: [mic, { ...mic, deviceId: 'default', groupId: 'cable', label: 'CABLE Output' }, speaker, sonar] });
  assert.equal(await f.c.enableMicrophoneMixerOneClick(), false); assert.match(f.c.microphoneMixerDiscoveryMessage, /选择混音输出/);
  assert.equal(f.events.some(value => value.startsWith('capture:')), false); assert.ok(f.events.includes('revoke:setup-token'));
  const saved = fixture({ devices: [mic, speaker, sonar], preference: { microphone: 'mic', target: 'sonar' } });
  assert.equal(await saved.c.enableMicrophoneMixerOneClick(), true); assert.ok(saved.events.includes('capture:mic:sonar'));
});
test('missing known driver opens the official guide without any microphone authorization or capture', async () => {
  const f = fixture({ devices: [mic, speaker] });
  assert.equal(await f.c.enableMicrophoneMixerOneClick(), false); assert.deepEqual(f.events, ['guide:install']);
  assert.match(f.c.microphoneMixerDiscoveryMessage, /官方安装指引/); assert.equal(f.c.microphoneMixerState().phase, 'off');
  const cancelled = fixture({ devices: [mic, speaker] }); cancelled.bridge.beginVirtualAudioSetup = async () => ({ ok: false, canceled: true });
  assert.equal(await cancelled.c.enableMicrophoneMixerOneClick(), false); assert.equal(cancelled.c.microphoneMixerDiscoveryMessage, '');
  const shared = fixture({ devices: [mic, speaker] }); shared.c.beginVirtualAudioSetupFromUi = async topic => shared.events.push('shared-setup:' + topic);
  assert.equal(await shared.c.enableMicrophoneMixerOneClick(), false); assert.deepEqual(shared.events, ['shared-setup:install']);
  assert.equal(shared.c.microphoneMixerDiscoveryMessage, '', 'shared installation UI owns the real stage/result feedback');
});
test('unknown enumeration is not treated as missing driver and cannot prepare or start capture', async () => {
  const f = fixture({ observed: false });
  f.setDevices([{ kind: 'audioinput', deviceId: 'default', label: '' }, { kind: 'audiooutput', deviceId: 'default', label: '' }]);
  assert.equal(await f.c.enableMicrophoneMixerOneClick(), false);
  assert.deepEqual(f.events, ['setup', 'enumerate', 'revoke:setup-token']); assert.match(f.c.microphoneMixerDiscoveryMessage, /未完整读取/);
  for (const devices of [[mic, speaker, { ...cable, label: '' }], [mic, { ...mic, deviceId: 'unknown', label: '' }, speaker, cable]]) {
    const mixed = fixture({ devices }); assert.equal(await mixed.c.enableMicrophoneMixerOneClick(), false);
    assert.equal(mixed.events.some(value => value.startsWith('guide:') || value.startsWith('capture:') || value.startsWith('prepare:')), false);
    assert.ok(mixed.events.includes('revoke:setup-token')); assert.match(mixed.c.microphoneMixerDiscoveryMessage, /未完整读取/);
  }
});
test('a virtual main monitor is detected as installed and requires a physical monitor rather than opening installer', async () => {
  const f = fixture(); f.c.effectiveAudioPrimaryId = () => 'virtual'; f.c.audio.sinkId = 'virtual';
  assert.equal(await f.c.enableMicrophoneMixerOneClick(), false); assert.match(f.c.microphoneMixerDiscoveryMessage, /主监听/);
  assert.equal(f.events.includes('guide:install'), false); assert.ok(f.events.includes('revoke:setup-token'));
});
test('cancelled or repeated setup cannot publish a late device list or start capture', async () => {
  const f = fixture(), waiting = deferred();
  f.c.navigator.mediaDevices.enumerateDevices = () => { f.events.push('enumerate'); return waiting.promise; };
  const first = f.c.enableMicrophoneMixerOneClick(); await new Promise(r => setImmediate(r));
  assert.equal(await f.c.enableMicrophoneMixerOneClick(), false); f.c.stopMicrophoneMixer();
  waiting.resolve([mic, speaker, cable]); assert.equal(await first, false);
  assert.equal(f.events.filter(value => value === 'setup').length, 1);
  assert.equal(f.events.some(value => value.startsWith('capture:') || value.startsWith('prepare:')), false);
  assert.ok(f.events.includes('revoke:setup-token')); assert.equal(f.c.microphoneMixerPreference.microphone, '');
});
test('cancelled setup promotion and expired activation revoke the original grant without capture', async () => {
  const f = fixture(), preparing = deferred(); f.bridge.prepareMicrophoneCapture = () => preparing.promise;
  const first = f.c.enableMicrophoneMixerOneClick(); await new Promise(r => setImmediate(r)); f.c.stopMicrophoneMixer();
  preparing.resolve(f.authorization); assert.equal(await first, false); assert.ok(f.events.includes('revoke:setup-token'));
  assert.equal(f.events.some(value => value.startsWith('capture:')), false);
  const expired = fixture(); expired.bridge.prepareMicrophoneCapture = async () => ({ ok: false, error: 'MICROPHONE_USER_ACTIVATION_REQUIRED' });
  assert.equal(await expired.c.enableMicrophoneMixerOneClick(), false); assert.match(expired.c.microphoneMixerDiscoveryMessage, /再次点击/);
  assert.ok(expired.events.includes('revoke:setup-token')); assert.equal(expired.events.some(value => value.startsWith('capture:')), false);
});
test('starting and running mixing are never replaced by setup; old preload retains an explicit two-click flow', async () => {
  for (const phase of ['starting', 'running']) {
    const f = fixture(); f.setState({ phase, microphone: 'mic', target: 'virtual' });
    assert.equal(await f.c.enableMicrophoneMixerOneClick(), false); assert.deepEqual(f.events, []);
  }
  const old = fixture(); delete old.bridge.beginMicrophoneMixingSetup; delete old.bridge.prepareMicrophoneCapture;
  assert.equal(await old.c.enableMicrophoneMixerOneClick(), false);
  assert.equal(old.events.some(value => value.startsWith('capture:')), false); assert.ok(old.events.includes('revoke:enumerate-token'));
  assert.equal(await old.c.enableMicrophoneMixerOneClick(), true); assert.ok(old.events.includes('capture:mic:virtual'));
});
