'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/', name), 'utf8');
const output = source('00-api-quality-output.js'), ui = source('20-microphone-mixer-ui.js');
function outputFunction(name) {
  const start = output.search(new RegExp('(?:async )?function ' + name + '\\('));
  const following = output.slice(start + 1).search(/\n(?:async )?function /);
  const end = start + 1 + following;
  assert.ok(start >= 0 && end > start);
  return output.slice(start, end);
}
const physical = { kind: 'audioinput', deviceId: 'mic', groupId: 'headset', label: 'Headset microphone' };
const routes = [{ kind: 'audiooutput', deviceId: 'speaker', label: 'Speakers' },
  { kind: 'audiooutput', deviceId: 'virtual', label: 'CABLE Input' }];
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const events = [], pending = [], listeners = {};
  let devices = [physical, ...routes], state = { phase: 'off', target: '', microphone: '' };
  const c = { console, Promise, localStorage: { getItem: () => JSON.stringify({ microphone: 'mic', target: 'virtual' }), setItem() {} },
    audioInputDevices: [], audioOutputDevices: routes.slice(), audioOutputDefaultDeviceId: 'speaker', audioOutputDeviceSnapshotKnown: true, audioOutputDeviceLabels: Object.create(null), audio: { sinkId: 'speaker' }, audioCtx: null,
    effectiveAudioPrimaryId: () => 'speaker', isVirtualMicOutputDevice: d => /CABLE/.test(d.label),
    invalidateAudioOutputSinkApplications() {}, applyAudioOutputDevice: async () => {}, renderAudioOutputDeviceUi() {}, showToast: text => events.push('toast:' + text),
    cancelAudioRouteWorkflowDrag: () => events.push('cancel-drag'), closeGsapModal: () => events.push('close-panel'),
    document: { getElementById: () => ({ classList: { contains: () => false } }) },
    navigator: { mediaDevices: { enumerateDevices: () => { events.push('enumerate'); return pending.length ? pending.shift() : Promise.resolve(devices); },
      getUserMedia: () => { throw Error('test must never capture'); } } },
    window: { addEventListener: (name, fn) => { listeners[name] = fn; }, desktopWindow: {
      beginMicrophoneEnumeration: async () => { events.push('grant'); return { ok: true, token: 'enumerate-only' }; },
      endMicrophoneCapture: async token => events.push('revoke:' + token) } } };
  vm.createContext(c); vm.runInContext(ui, c);
  vm.runInContext(['updateAudioOutputDeviceSnapshot', 'refreshAudioOutputDevices', 'closeAudioOutputWorkflowPanel'].map(outputFunction).join('\n'), c);
  return { c, events, pending, listeners, setDevices: value => { devices = value; },
    setState: value => { state = value; }, makeRuntime() {
      c.microphoneMixerRuntime = { getState: () => state, disable: reason => { events.push('disable:' + (reason || '')); state = { phase: 'off', target: '', microphone: '' }; },
        checkDevices: (inputs, outputs, known, outputKnown) => {
          events.push('check:' + known);
          if ((known !== false && !inputs.some(d => d.deviceId === state.microphone)) || (outputKnown !== false && !outputs.some(d => d.deviceId === state.target))) c.microphoneMixerRuntime.disable('devices');
        } };
    } };
}
test('older output refresh cannot overwrite a newer explicitly authorized microphone snapshot', async () => {
  const f = fixture(), oldDevices = deferred(); f.pending.push(oldDevices.promise);
  const old = f.c.refreshAudioOutputDevices(false);
  await f.c.discoverMicrophoneMixerInputs();
  assert.deepEqual(Array.from(f.c.microphoneMixerInputs(), d => d.deviceId), ['mic']);
  oldDevices.resolve([{ kind: 'audioinput', deviceId: 'default', label: '' }, ...routes]); await old;
  assert.deepEqual(Array.from(f.c.microphoneMixerInputs(), d => d.deviceId), ['mic']);
  assert.equal(f.c.microphoneMixerPreference.microphone, 'mic');
});
test('output and devicechange refreshes do not compete with active microphone discovery', async () => {
  const f = fixture(), labels = deferred(); f.pending.push(labels.promise);
  const discovery = f.c.discoverMicrophoneMixerInputs(); await new Promise(r => setImmediate(r));
  const enumerations = f.events.filter(value => value === 'enumerate').length;
  await f.c.refreshAudioOutputDevices(false); await f.c.refreshAudioOutputDevices(true);
  assert.equal(f.events.filter(value => value === 'enumerate').length, enumerations);
  labels.resolve([physical, ...routes]); await discovery;
  assert.equal(f.c.microphoneMixerDiscovering, false);
  assert.equal(f.events.filter(value => value === 'grant').length, 1);
  assert.ok(f.events.includes('revoke:enumerate-only'));
});
test('output refresh stays read-only and hidden aliases/labels never masquerade as physical inputs', async () => {
  const f = fixture();
  f.setDevices([{ kind: 'audioinput', deviceId: 'default', label: '' },
    { kind: 'audioinput', deviceId: 'communications', label: '' },
    { kind: 'audioinput', deviceId: 'unidentified', label: '' }, ...routes]);
  await f.c.refreshAudioOutputDevices(true);
  assert.equal(f.events.includes('grant'), false);
  assert.equal(f.c.microphoneMixerInputs().length, 0);
  assert.equal(f.c.microphoneMixerInputSnapshotKnown, false);
  assert.equal(f.c.microphoneMixerPreference.microphone, 'mic');
});
test('known labels can identify only IDs present in a restricted response; absent microphones are unavailable', async () => {
  const f = fixture(); await f.c.discoverMicrophoneMixerInputs();
  f.setDevices([{ ...physical, label: '' }, ...routes]); await f.c.refreshAudioOutputDevices(false);
  assert.equal(f.c.microphoneMixerInputs()[0].label, 'Headset microphone');
  assert.equal(f.c.microphoneMixerInputSnapshotKnown, false);
  f.setDevices([{ kind: 'audioinput', deviceId: 'default', label: '' }, ...routes]); await f.c.refreshAudioOutputDevices(false);
  assert.equal(f.c.microphoneMixerInputs().length, 0, 'never restore missing IDs from the prior full snapshot');
  assert.equal(f.c.microphoneMixerPreference.microphone, 'mic');
});
test('a permission-limited snapshot does not falsely unplug running capture; a complete replacement does', async () => {
  const f = fixture(); await f.c.discoverMicrophoneMixerInputs(); f.makeRuntime();
  f.setState({ phase: 'running', target: 'virtual', microphone: 'mic' });
  f.setDevices([{ kind: 'audioinput', deviceId: 'default', label: '' }, ...routes]); await f.c.refreshAudioOutputDevices(false);
  assert.equal(f.c.microphoneMixerState().phase, 'running');
  f.setDevices([{ ...physical, deviceId: 'replacement' }, ...routes]); await f.c.refreshAudioOutputDevices(false);
  assert.equal(f.c.microphoneMixerState().phase, 'off');
  assert.equal(f.c.microphoneMixerPreference.microphone, 'mic');
});
test('hidden output aliases preserve the actual mixed sink without offering unavailable targets', async () => {
  const f = fixture(); await f.c.discoverMicrophoneMixerInputs(); f.makeRuntime();
  f.setState({ phase: 'running', target: 'virtual', microphone: 'mic' });
  f.c.applyAudioOutputDevice = () => { throw Error('unknown list must never redirect the selected primary sink'); };
  f.setDevices([{ kind: 'audioinput', deviceId: 'default', label: '' }, { kind: 'audiooutput', deviceId: 'default', label: '' }]);
  await f.c.refreshAudioOutputDevices(false);
  assert.equal(f.c.audioOutputDeviceSnapshotKnown, false);
  assert.equal(f.c.microphoneMixerState().phase, 'running');
  assert.equal(f.c.microphoneMixerTargets().length, 0);
  assert.equal(f.c.audio.sinkId, 'speaker');
  assert.equal(f.c.microphoneMixerPreference.target, 'virtual');
});
test('a complete output snapshot missing the virtual sink still stops the mix', async () => {
  const f = fixture(); await f.c.discoverMicrophoneMixerInputs(); f.makeRuntime();
  f.setState({ phase: 'running', target: 'virtual', microphone: 'mic' });
  f.setDevices([physical, routes[0]]); await f.c.refreshAudioOutputDevices(false);
  assert.equal(f.c.audioOutputDeviceSnapshotKnown, true);
  assert.equal(f.c.microphoneMixerState().phase, 'off');
});
test('an unknown output list cannot trigger later primary-sink fallback or mirror reconstruction', async () => {
  const f = fixture(); f.c.audioOutputDeviceSnapshotKnown = false; f.c.audioOutputDevices = [];
  f.c.audioOutputDeviceId = 'speaker';
  vm.runInContext(outputFunction('audioOutputDeviceById') + '\n' + outputFunction('applyAudioOutputDeviceNow') + '\n' + outputFunction('syncAudioOutputMirrors'), f.c);
  assert.equal(await f.c.applyAudioOutputDeviceNow(f.c.audio, 'speaker'), null);
  assert.equal(f.c.audio.sinkId, 'speaker');
  Object.assign(f.c, { audioRouteSelectedIds: () => [], audioOutputMirrorElements: {}, clearAudioOutputMirrors() {} });
  f.c.syncAudioOutputMirrors('clock');
  assert.equal(f.c.audio.sinkId, 'speaker');
});
test('explicit full discovery of no inputs reports absence without replacing saved preference', async () => {
  const f = fixture(); f.setDevices(routes); await f.c.discoverMicrophoneMixerInputs();
  assert.equal(f.c.microphoneMixerInputSnapshotKnown, true);
  assert.equal(f.c.microphoneMixerInputs().length, 0);
  assert.match(f.c.microphoneMixerDiscoveryMessage, /设备连接/);
  assert.equal(f.c.microphoneMixerPreference.microphone, 'mic');
});
test('default/communications aliases and known virtual recording endpoints do not duplicate real input', async () => {
  const f = fixture(); f.setDevices([physical, { ...physical, deviceId: 'default' }, { ...physical, deviceId: 'communications' },
    { ...physical, deviceId: 'loop', label: 'CABLE Output' }, { ...physical, deviceId: 'monitor', label: 'Monitor of headphones' }, ...routes]);
  await f.c.discoverMicrophoneMixerInputs();
  assert.deepEqual(Array.from(f.c.microphoneMixerInputs(), d => d.deviceId), ['mic']);
  assert.deepEqual(Array.from(f.c.microphoneMixerTargets(), d => d.deviceId), ['virtual']);
});
test('panel closure does not stop enabled or starting capture; actual page exit does', () => {
  for (const phase of ['starting', 'running']) {
    const f = fixture(); f.makeRuntime(); f.setState({ phase, target: 'virtual', microphone: 'mic' });
    f.c.closeAudioOutputWorkflowPanel();
    assert.equal(f.c.microphoneMixerState().phase, phase);
    assert.equal(f.events.some(value => value.startsWith('disable:')), false);
  }
  const f = fixture(); f.makeRuntime(); f.setState({ phase: 'running', target: 'virtual', microphone: 'mic' });
  // Run the production mount with tiny fake controls, without any real device.
  const nodes = new Map(), panel = { innerHTML: '', addEventListener() {}, querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { setAttribute() {}, innerHTML: '', value: '', hidden: false }); return nodes.get(selector);
  } };
  f.c.document.createElement = () => panel; f.c.escHtml = v => String(v); f.c.audioRouteMuteIcon = () => ''; f.c.audioRouteSetting = () => ({ volume: 100 });
  f.c.mountMicrophoneMixerPanel({ appendChild() {} });
  assert.equal(f.listeners.blur, undefined, 'switching to the game must not stop capture');
  assert.equal(f.listeners.visibilitychange, undefined);
  f.listeners.pagehide(); assert.equal(f.c.microphoneMixerState().phase, 'off');
  f.setState({ phase: 'running', target: 'virtual', microphone: 'mic' });
  f.listeners.beforeunload(); assert.equal(f.c.microphoneMixerState().phase, 'off');
});
test('route headings and per-sink volume labels distinguish music from mixed output', () => {
  const f = fixture(), body = { innerHTML: '', contains: () => false }, list = { innerHTML: '' };
  Object.assign(f.c, { audioOutputDeviceId: 'speaker', audioRouteVisibleIds: () => ['virtual'],
    audioOutputDeviceStatusText: () => '主监听', audioOutputMirrorConfirmedCount: () => 1, escHtml: String,
    audioRouteSetting: () => ({ volume: 70, delay: 0, muted: false }), audioOutputDeviceLabel: d => d.label, audioRouteMuteIcon: () => '',
    audioOutputMirrorRuntimeFor: () => null, audioOutputMirrorStatusText: () => '', audioRouteWorkflowDrag: null,
    mountMicrophoneMixerPanel() {}, requestAnimationFrame() {}, renderAudioRouteWorkflowEdges() {} });
  f.c.document = { activeElement: null, getElementById: id => id === 'audio-output-workflow-body' ? body : id === 'audio-output-list' ? list : id === 'audio-output-workflow-modal' ? { classList: { contains: () => true } } : null };
  vm.runInContext(outputFunction('renderAudioOutputDeviceUi'), f.c);
  f.c.renderAudioOutputDeviceUi();
  assert.match(body.innerHTML, /<b>Mineradio 音乐输出<\/b>/);
  assert.match(body.innerHTML, /<b>虚拟音频输出<\/b>/);
  assert.match(body.innerHTML, /<label>音乐音量 /);
  assert.doesNotMatch(body.innerHTML, /混音总音量/);
  f.makeRuntime(); f.setState({ phase: 'running', target: 'virtual', microphone: 'mic' });
  f.c.renderAudioOutputDeviceUi();
  assert.match(body.innerHTML, /<label>混音总音量 /);
  assert.match(body.innerHTML, /aria-label="CABLE Input 混音总音量"/);
  assert.doesNotMatch(body.innerHTML, /<label>音乐音量 /);
});
test('parent route refresh does not detach a focused microphone action button', () => {
  const f = fixture(); let writes = 0;
  const body = { contains: () => true, addEventListener() {}, set innerHTML(value) { writes++; } };
  Object.assign(f.c, { audioOutputDeviceId: 'speaker', audioRouteVisibleIds: () => [], audioOutputDeviceStatusText: () => '',
    audioOutputMirrorConfirmedCount: () => 0, escHtml: String, audioOutputDeviceLabel: d => d.label });
  f.c.document = { activeElement: { matches: selector => selector.includes('#audio-microphone-mixer button') },
    getElementById: id => id === 'audio-output-workflow-body' ? body : id === 'audio-output-list' ? {} : id === 'audio-output-workflow-modal' ? { classList: { contains: () => true } } : null };
  vm.runInContext(outputFunction('renderAudioOutputDeviceUi'), f.c); f.c.renderAudioOutputDeviceUi();
  assert.equal(writes, 0);
});
test('mixed-only target gets one live graph edge during starting/running and remains on panel reopen without saving a music mirror', () => {
  const f = fixture(), paths = [], svg = { firstChild: null, setAttribute() {} };
  const root = { clientWidth: 400, clientHeight: 200, querySelector: selector => selector === '#audio-route-workflow-svg' ? svg : { id: 'source' } };
  Object.assign(f.c, { audioOutputDeviceId: 'speaker', audioOutputMirrorDeviceIds: [], audioInputBridgeState: { enabled: false }, audioRouteWorkflowDrag: null,
    audioRoutePointForPort: port => port, audioRoutePortByAttr: (_root, _attribute, id) => ({ id }),
    appendAudioRoutePath: (_svg, _from, to, className) => paths.push({ id: to.id, className }),
    audioOutputMirrorRuntimeFor: () => null, audioRouteSetting: () => ({ muted: false }),
    openGsapModal: () => f.events.push('open-panel'), bindAudioOutputControls() {}, requestAnimationFrame: fn => fn(), setTimeout: () => 0,
    refreshAudioOutputDevices() {}, renderAudioRouteWorkflowEdges: () => draw() });
  vm.runInContext(['normalizeAudioOutputIdList', 'audioRouteSelectedIds', 'audioRouteVisibleIds', 'audioOutputMirrorRouteClass', 'renderAudioRouteWorkflowEdgesForRoot', 'openAudioOutputWorkflowPanel'].map(outputFunction).join('\n'), f.c);
  f.makeRuntime();
  function draw() { paths.length = 0; f.c.renderAudioRouteWorkflowEdgesForRoot(root); return paths.filter(entry => entry.id === 'virtual'); }
  f.setState({ phase: 'starting', microphone: 'mic', target: 'virtual' });
  assert.deepEqual(draw(), [{ id: 'virtual', className: 'workflow-link pending mirror' }]);
  f.setState({ phase: 'running', microphone: 'mic', target: 'virtual' });
  assert.deepEqual(draw(), [{ id: 'virtual', className: 'workflow-link active mirror' }]);
  f.c.closeAudioOutputWorkflowPanel(); assert.equal(f.c.microphoneMixerState().phase, 'running');
  paths.length = 0; f.c.openAudioOutputWorkflowPanel();
  assert.equal(paths.filter(entry => entry.id === 'virtual').length, 1, 'reopening renders the current owned target');
  assert.equal(f.c.audioRouteSelectedIds().length, 0, 'drawing never persists a duplicate music-only route');
  f.c.audioOutputMirrorDeviceIds = ['virtual']; assert.equal(draw().length, 1, 'selected plus owned target is a union, not duplicate edges');
  f.c.audioOutputMirrorDeviceIds = [];
  for (const phase of ['off', 'error']) { f.setState({ phase, microphone: 'mic', target: 'virtual' }); assert.equal(draw().length, 0); }
});
