'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../public/js/modules/05-playback/20-microphone-mixer-ui.js'),'utf8');
function fixture() {
 const events=[];const devices=[{kind:'audioinput',deviceId:'mic',label:'Headset mic'},{kind:'audioinput',deviceId:'communications',label:'Mic'},{kind:'audioinput',deviceId:'loop',label:'CABLE Output'},{kind:'audiooutput',deviceId:'default',label:'Default',groupId:'physical'},{kind:'audiooutput',deviceId:'speaker',label:'Speakers',groupId:'physical'},{kind:'audiooutput',deviceId:'virtual',label:'CABLE Input'}];
 const c={console,Promise,localStorage:{getItem:()=>JSON.stringify({enabled:true,microphone:'mic',target:'virtual'}),setItem(){}},audioInputDevices:[],audioOutputDevices:devices.filter(d=>d.kind==='audiooutput'),audioOutputDefaultDeviceId:'speaker',audio:{sinkId:'speaker'},audioCtx:null,effectiveAudioPrimaryId:()=> 'speaker',isVirtualMicOutputDevice:d=>/CABLE/.test(d.label),navigator:{mediaDevices:{enumerateDevices:async()=>{events.push('enumerate');return devices},getUserMedia:()=>{throw Error('unexpected capture')}}},window:{desktopWindow:{beginMicrophoneEnumeration:async()=>{events.push('grant');return {ok:true,token:'e'}},endMicrophoneCapture:async token=>events.push('end:'+token)}}};vm.createContext(c);vm.runInContext(source,c);return {c,events,devices};
}
test('first device discovery never captures or restores enabled state and filters aliases/loopback',async()=>{const {c,events}=fixture();assert.equal(c.microphoneMixerPreference.enabled,undefined);await c.discoverMicrophoneMixerInputs();assert.deepEqual(events,['grant','enumerate','end:e']);assert.deepEqual(Array.from(c.microphoneMixerInputs(),d=>d.deviceId),['mic']);assert.deepEqual(Array.from(c.microphoneMixerTargets(),d=>d.deviceId),['virtual']);assert.equal(c.audioOutputDefaultDeviceId,'speaker');assert.equal(c.microphoneMixerRuntime,null);});
test('late enumeration after explicit cancellation cannot update devices and always revokes grant',async()=>{const {c,events}=fixture();let finish;c.navigator.mediaDevices.enumerateDevices=()=>new Promise(r=>finish=r);const pending=c.discoverMicrophoneMixerInputs();await new Promise(r=>setImmediate(r));c.stopMicrophoneMixer();finish([{kind:'audioinput',deviceId:'late',label:'Mic'}]);await pending;assert.equal(c.audioInputDevices.length,0);assert.equal(c.microphoneMixerDiscovering,false);assert.ok(events.includes('end:e'));});
test('failed primary switch excludes actual old output as a mixed target',()=>{const {c}=fixture();c.audio.sinkId='virtual';assert.equal(c.microphoneMixerTargets().length,0);});
test('a Web Audio routed element with no own sink does not read as a virtual system default',()=>{const {c}=fixture();c.audioOutputDefaultDeviceId='virtual';c.audio.sinkId='';c.audioCtx={sinkId:'speaker'};c.audioMediaRoutedThroughWebAudio=media=>media===c.audio;assert.deepEqual(Array.from(c.microphoneMixerTargets(),d=>d.deviceId),['virtual']);c.audioMediaRoutedThroughWebAudio=()=>false;assert.equal(c.microphoneMixerTargets().length,0);});
test('discovery cleanup errors do not leave the UI stuck',async()=>{const {c}=fixture();c.window.desktopWindow.endMicrophoneCapture=async()=>{throw Error('ipc gone')};await c.discoverMicrophoneMixerInputs();assert.equal(c.microphoneMixerDiscovering,false);});

function panelFixture() {
  const { c, events, devices } = fixture();
  function node() {
    const attributes = {};
    return { hidden: false, textContent: '', value: '', innerHTML: '', disabled: false,
      setAttribute: (name, value) => { attributes[name] = String(value); },
      getAttribute: name => attributes[name] };
  }
  const selectors = ['[data-mixer-expand]', '.audio-mixer-body', '[data-mixer-state]', '[data-mixer-discover]',
    '[data-mixer-enable]', '[data-mixer-message]', '[data-mixer-meter]', '.audio-mixer-feedback'];
  ['microphone', 'target'].forEach(key => selectors.push('[data-mixer-device="' + key + '"]'));
  ['microphone', 'music'].forEach(key => ['level', 'value', 'mute'].forEach(kind => selectors.push('[data-mixer-' + kind + '="' + key + '"]')));
  const nodes = Object.fromEntries(selectors.map(selector => [selector, node()]));
  const listeners = {};
  const panel = { innerHTML: '', querySelector: selector => nodes[selector], addEventListener: (name, listener) => { listeners[name] = listener; } };
  c.document = { createElement: () => panel, getElementById: () => null };
  c.window.addEventListener = () => {};
  c.audioInputDevices = devices.filter(device => device.kind === 'audioinput');
  c.escHtml = value => String(value);
  c.audioRouteMuteIcon = () => '<svg></svg>';
  c.audioRouteSetting = () => ({ volume: 100, delay: 0, muted: false });
  let state = { phase: 'off', reason: '', peak: 0, target: 'virtual' };
  c.microphoneMixerRuntime = { getState: () => state, setLevels() {}, setOutputSettings() {},
    disable() { events.push('disable'); state = { phase: 'off', reason: '', peak: 0, target: '' }; c.renderMicrophoneMixerPanel(); },
    async start(config) { events.push('start:' + config.microphone + ':' + config.target); return false; } };
  c.mountMicrophoneMixerPanel({ appendChild() {} });
  return { c, events, panel, nodes, listeners, setState: value => { state = value; c.renderMicrophoneMixerPanel(); } };
}

test('disclosure and mixer action keep separate meanings without rebuilding focused controls', async () => {
  const { c, events, panel, nodes, listeners, setState } = panelFixture();
  const originalMarkup = panel.innerHTML;
  assert.match(originalMarkup, /data-mixer-expand aria-expanded="false" aria-controls="audio-microphone-mixer-body"/);
  assert.match(originalMarkup, /class="audio-mixer-disclosure" aria-hidden="true"/);
  assert.match(originalMarkup, /id="audio-microphone-mixer-body" class="audio-mixer-body"/);
  assert.equal(nodes['[data-mixer-state]'].textContent, '未启用');
  assert.equal(nodes['[data-mixer-enable]'].textContent, '启用混音');
  assert.equal(nodes['[data-mixer-enable]'].getAttribute('aria-pressed'), 'false');
  listeners.click({ target: { closest: selector => selector === '[data-mixer-expand]' ? nodes[selector] : null } });
  assert.equal(nodes['[data-mixer-expand]'].getAttribute('aria-expanded'), 'true');
  assert.equal(nodes['.audio-mixer-body'].hidden, false);
  assert.deepEqual(events, []);
  await c.toggleMicrophoneMixer();
  assert.deepEqual(events, ['start:mic:virtual']);
  setState({ phase: 'starting', reason: '', peak: 0, target: 'virtual' });
  assert.equal(nodes['[data-mixer-state]'].textContent, '启动中');
  assert.equal(nodes['[data-mixer-enable]'].textContent, '取消启用');
  assert.equal(nodes['[data-mixer-enable]'].getAttribute('aria-pressed'), 'true');
  await c.toggleMicrophoneMixer();
  assert.equal(events.at(-1), 'disable');
  setState({ phase: 'running', reason: '', peak: .42, target: 'virtual' });
  assert.equal(nodes['[data-mixer-state]'].textContent, '已启用');
  assert.equal(nodes['[data-mixer-enable]'].textContent, '停用混音');
  await c.toggleMicrophoneMixer();
  assert.equal(nodes['[data-mixer-state]'].textContent, '未启用');
  assert.equal(panel.innerHTML, originalMarkup);
});

test('meter appears only for running audio and permission/device failures retain feedback', () => {
  const { c, panel, nodes, setState } = panelFixture();
  assert.match(panel.innerHTML, /aria-label="混音电平" hidden/);
  const meter = nodes['[data-mixer-meter]'], feedback = nodes['.audio-mixer-feedback'];
  assert.equal(meter.hidden, true);
  assert.equal(feedback.hidden, true);
  setState({ phase: 'starting', reason: '', peak: 0, target: 'virtual' });
  assert.equal(meter.hidden, true);
  setState({ phase: 'running', reason: '', peak: .42, target: 'virtual' });
  assert.equal(meter.hidden, false);
  assert.equal(meter.value, .42);
  assert.equal(feedback.hidden, false);
  for (const reason of ['麦克风权限被拒绝，请主动开启并检查系统权限', '设备已断开，请重新开启']) {
    setState({ phase: 'error', reason, peak: 0, target: 'virtual' });
    assert.equal(nodes['[data-mixer-state]'].textContent, '未启用');
    assert.equal(nodes['[data-mixer-enable]'].textContent, '启用混音');
    assert.equal(nodes['[data-mixer-enable]'].getAttribute('aria-pressed'), 'false');
    assert.equal(meter.hidden, true);
    assert.equal(feedback.hidden, false);
    assert.equal(nodes['[data-mixer-message]'].textContent, reason);
  }
  setState({ phase: 'off', reason: '', peak: 0, target: '' });
  c.microphoneMixerDiscovering = true; c.renderMicrophoneMixerPanel();
  assert.equal(nodes['[data-mixer-enable]'].disabled, true);
  assert.equal(meter.hidden, true);
  c.microphoneMixerDiscovering = false; c.audioOutputDevices = []; c.renderMicrophoneMixerPanel();
  assert.equal(meter.hidden, true);
  assert.equal(feedback.hidden, false);
  assert.equal(nodes['[data-mixer-message]'].textContent, '未检测到虚拟音频播放端，需要软件虚拟音频设备');
});

test('missing virtual output and unread microphone have separate feedback and saved input remains visible', () => {
  const { c, nodes } = panelFixture();
  c.updateMicrophoneMixerInputSnapshot([{ kind: 'audioinput', deviceId: 'default', label: '' }], false);
  c.audioOutputDevices = []; c.renderMicrophoneMixerPanel();
  assert.match(nodes['[data-mixer-message]'].textContent, /未检测到虚拟音频播放端/);
  assert.match(nodes['[data-mixer-message]'].textContent, /麦克风列表未完整读取/);
  assert.match(nodes['[data-mixer-device="microphone"]'].innerHTML, /value="mic" disabled>已保存的麦克风（待重新读取）/);
  assert.equal(nodes['[data-mixer-device="microphone"]'].value, 'mic');
});
