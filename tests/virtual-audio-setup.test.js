'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createVirtualAudioSetupGuide } = require('../desktop/virtual-audio-setup');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ platform = 'win32', arch = 'x64', deferred = false } = {}) {
  const frame = { url: 'http://127.0.0.1:3000/index.html', parent: null, isDestroyed: () => false };
  const wc = Object.assign(new EventEmitter(), { mainFrame: frame, isDestroyed: () => false });
  const win = Object.assign(new EventEmitter(), { webContents: wc, isDestroyed: () => false });
  const dialogs = [], opened = [], states = [], calls = [];
  const state = { response: 0, quitting: false, cleanup: 0 };
  let answer, finish;
  const completion = new Promise(resolve => { finish = resolve; });
  const pkg = { directory: 'C:\\fake\\payload', setupPath: 'C:\\fake\\payload\\VBCABLE_Setup_x64.exe',
    cleanup: async () => { state.cleanup += 1; } };
  const options = { platform, arch, getMainWindow: () => win,
    isTrustedDocument: url => url === 'http://127.0.0.1:3000/index.html',
    showMessageBox: async (owner, options) => {
      dialogs.push({ owner, options });
      return deferred ? new Promise(resolve => { answer = resolve; }) : { response: state.response };
    },
    openExternal: async url => { opened.push(url); }, isQuitting: () => state.quitting,
    onState: value => states.push(value),
    preparePackage: async ({ signal, onProgress }) => { calls.push('download'); assert.equal(signal.aborted, false);
      onProgress({ received: 100, total: 1318877 }); return pkg; },
    installer: { verify: async () => { calls.push('verify'); }, launch: async () => { calls.push('launch'); return { completion }; } } };
  const guide = createVirtualAudioSetupGuide(options); guide.attach(win);
  return { guide, frame, wc, win, dialogs, opened, states, state, calls, options, pkg,
    finish, answer: response => answer({ response }), event: { sender: wc, senderFrame: frame } };
}

test('Windows x64 capability promises visible installer assistance, never installed or ready', () => {
  const f = fixture(); const info = f.guide.getInfo();
  assert.equal(info.supported, true); assert.equal(info.mode, 'guided-installer');
  assert.equal(info.canDownloadAndLaunch, true); assert.equal(info.automaticInstall, false);
  assert.equal(info.provider, 'VB-Audio'); assert.equal(info.donationware, true);
  for (const key of ['requiresAdministrator', 'requiresReboot', 'mayChangeDefaultDevices']) assert.equal(info[key], true);
  assert.equal('installed' in info, false); assert.equal('ready' in info, false);
  info.pages.install = 'https://example.com/';
  assert.equal(f.guide.getInfo().pages.install, 'https://vb-audio.com/Cable/');
  assert.equal(fixture({ arch: 'arm64' }).guide.getInfo().canDownloadAndLaunch, false);
});

test('native explicit confirmation precedes download, verification and visible launch; cleanup waits for known exit', async () => {
  const f = fixture();
  assert.deepEqual(await f.guide.begin(f.event), { ok: true, installerOpened: true, mode: 'guided-installer', requiresReboot: true });
  assert.deepEqual(f.calls, ['download', 'verify', 'launch']); assert.equal(f.opened.length, 0);
  assert.equal(f.dialogs[0].owner, f.win);
  const options = f.dialogs[0].options;
  for (const text of ['VB-CABLE', 'VB-Audio', 'Donationware', '管理员', '重启', '默认播放和录音设备', '许可信息', '官方捐赠入口']) {
    assert.ok(options.detail.includes(text), text);
  }
  assert.equal(options.defaultId, 1); assert.equal(options.cancelId, 1);
  assert.equal(f.state.cleanup, 0, 'dependencies stay until installer exit');
  assert.equal(f.guide.getInfo().operation.busy, true);
  assert.deepEqual(f.states.map(value => value.phase), ['confirming', 'downloading', 'downloading', 'verifying', 'handoff', 'installer-opened']);
  assert.equal(f.guide.cancel(f.event).error, 'VIRTUAL_AUDIO_INSTALLER_HANDOFF_IN_PROGRESS');
  assert.equal((await f.guide.begin(f.event)).error, 'VIRTUAL_AUDIO_SETUP_BUSY');
  f.finish({ knownExit: true, exitCode: 0 }); await flush();
  assert.equal(f.state.cleanup, 1); assert.equal(f.guide.getInfo().operation.phase, 'installer-exited');
  assert.equal(f.guide.getInfo().operation.busy, false); assert.equal('installed' in f.states.at(-1), false);
});

test('native cancel and untrusted frames cannot download, verify, launch or open arbitrary pages', async () => {
  const f = fixture();
  for (const event of [null, { sender: f.wc }, { sender: { ...f.wc }, senderFrame: f.frame },
    { ...f.event, senderFrame: { ...f.frame } }, { ...f.event, senderFrame: { ...f.frame, parent: f.frame } }]) {
    assert.equal((await f.guide.begin(event)).error, 'UNTRUSTED_SENDER');
  }
  assert.equal(f.guide.cancel({ sender: f.wc }).error, 'UNTRUSTED_SENDER');
  f.frame.url = 'https://vb-audio.com/Cable/';
  assert.equal((await f.guide.begin(f.event)).error, 'UNTRUSTED_SENDER');
  f.frame.url = 'http://127.0.0.1:3000/index.html';
  f.state.response = 1; assert.equal((await f.guide.begin(f.event)).canceled, true);
  assert.equal(f.calls.length, 0); assert.equal(f.opened.length, 0);
});

test('fixed official information topics cannot accept URLs, paths or prototype names', async () => {
  const f = fixture();
  for (const topic of ['https://evil.example/', 'file:///C:/installer.exe', 'install?url=evil', '__proto__', 'constructor', {}, null]) {
    assert.equal((await f.guide.begin(f.event, topic)).error, 'INVALID_VIRTUAL_AUDIO_SETUP_TOPIC');
  }
  for (const topic of ['official', 'license', 'donation']) assert.equal((await f.guide.begin(f.event, topic)).ok, true);
  assert.deepEqual(f.opened, ['https://vb-audio.com/Cable/', 'https://vb-audio.com/Services/licensing.htm', 'https://shop.vb-audio.com/en/win-apps/11-vb-cable.html']);
  assert.equal(f.dialogs.length, 0); assert.equal(f.calls.length, 0);
});

test('repeated setup clicks share exactly one pending native confirmation', async () => {
  const f = fixture({ deferred: true }); const first = f.guide.begin(f.event);
  assert.equal(f.guide.begin(f.event), first); assert.equal(f.dialogs.length, 1);
  f.answer(0); assert.equal((await first).ok, true); assert.deepEqual(f.calls, ['download', 'verify', 'launch']);
  f.finish({ knownExit: true, exitCode: 1 }); await flush();
});

test('navigation, renderer loss, window close, disposal and quit fence late confirmation', async () => {
  for (const interrupt of [f => f.wc.emit('did-start-navigation', {}, f.frame.url, false, true),
    f => f.wc.emit('render-process-gone'), f => f.wc.emit('destroyed'), f => f.win.emit('closed'),
    f => f.guide.dispose(), f => { f.state.quitting = true; f.guide.cancel(); }]) {
    const f = fixture({ deferred: true }); const request = f.guide.begin(f.event); interrupt(f);
    assert.equal(f.dialogs[0].options.signal.aborted, true); f.answer(0);
    assert.equal((await request).canceled, true); assert.equal(f.calls.length, 0); assert.equal(f.opened.length, 0);
  }
});

test('cancel during download or verify cleans owned package and cannot reach native handoff', async () => {
  for (const stage of ['download', 'verify']) {
    const f = fixture(); let resume;
    f.options.preparePackage = async ({ signal }) => {
      if (stage === 'download') await new Promise(resolve => { resume = resolve; });
      return f.pkg;
    };
    f.options.installer.verify = async () => { if (stage === 'verify') await new Promise(resolve => { resume = resolve; }); };
    f.guide.dispose(); const guide = createVirtualAudioSetupGuide(f.options); guide.attach(f.win);
    const request = guide.begin(f.event); await flush();
    assert.equal(guide.cancel(f.event).ok, true); resume();
    assert.equal((await request).canceled, true); assert.equal(f.calls.includes('launch'), false);
    assert.equal(f.state.cleanup, 1);
  }
});

test('verification failures fail closed; no guessed launch or automatic fallback occurs', async () => {
  const f = fixture();
  f.options.installer.verify = async () => { throw new Error('VIRTUAL_AUDIO_SIGNATURE_VERIFICATION_FAILED'); };
  f.guide.dispose(); const guide = createVirtualAudioSetupGuide(f.options); guide.attach(f.win);
  const result = await guide.begin(f.event);
  assert.equal(result.error, 'VIRTUAL_AUDIO_SIGNATURE_VERIFICATION_FAILED'); assert.equal(result.fallbackAvailable, true);
  assert.equal(f.calls.includes('launch'), false); assert.equal(f.opened.length, 0); assert.equal(f.state.cleanup, 1);
});

test('UAC rejection permits safe cleanup, but uncertain launch or exit retains bounded files and blocks relaunch', async () => {
  for (const safeToClean of [true, false]) {
    const f = fixture();
    f.options.installer.launch = async () => { throw Object.assign(new Error('VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN'), { safeToClean }); };
    f.guide.dispose(); const guide = createVirtualAudioSetupGuide(f.options); guide.attach(f.win);
    assert.equal((await guide.begin(f.event)).ok, false); assert.equal(f.state.cleanup, safeToClean ? 1 : 0);
    if (!safeToClean) assert.equal((await guide.begin(f.event)).error, 'VIRTUAL_AUDIO_SETUP_BUSY');
  }
  const f = fixture(); await f.guide.begin(f.event); f.finish({ knownExit: false }); await flush();
  assert.equal(f.state.cleanup, 0); assert.equal(f.guide.getInfo().operation.busy, true);
  f.guide.dispose(); assert.equal(f.state.cleanup, 0, 'quit never removes running/uncertain dependencies');
});

test('guide rechecks frame and quitting after confirmation and refuses unsupported architectures', async () => {
  for (const change of [f => { f.frame.url = 'http://127.0.0.1:3000/guest.html'; },
    f => { f.wc.mainFrame = { ...f.frame }; }, f => { f.state.quitting = true; }]) {
    const f = fixture({ deferred: true }); const request = f.guide.begin(f.event); change(f); f.answer(0);
    assert.equal((await request).canceled, true); assert.equal(f.calls.length, 0);
  }
  for (const options of [{ platform: 'linux' }, { arch: 'arm64' }, { arch: 'ia32' }]) {
    const f = fixture(options); assert.equal((await f.guide.begin(f.event)).error, 'VIRTUAL_AUDIO_SETUP_UNSUPPORTED');
    assert.equal(f.calls.length, 0);
  }
});

test('attachment replaces lifecycle listeners; cleanup removes them and stale owners receive no state', async () => {
  const f = fixture(); f.guide.attach(f.win);
  for (const name of ['did-start-navigation', 'render-process-gone', 'destroyed']) assert.equal(f.wc.listenerCount(name), 1);
  await f.guide.begin(f.event); const before = f.states.length;
  f.wc.mainFrame = { ...f.frame }; f.finish({ knownExit: true, exitCode: 0 }); await flush();
  assert.equal(f.states.length, before);
  f.guide.dispose();
  for (const name of ['did-start-navigation', 'render-process-gone', 'destroyed']) assert.equal(f.wc.listenerCount(name), 0);
  assert.equal(f.win.listenerCount('closed'), 0);
});

test('same-frame same-URL reload fences late verification and late completion state from the next document', async () => {
  const f = fixture(); let resume;
  f.options.installer.verify = () => new Promise(resolve => { resume = resolve; });
  f.guide.dispose(); const guide = createVirtualAudioSetupGuide(f.options); guide.attach(f.win);
  const request = guide.begin(f.event); await flush();
  const before = f.states.length;
  f.wc.emit('did-start-navigation', {}, f.frame.url, false, true); resume();
  assert.equal((await request).canceled, true); assert.equal(f.calls.includes('launch'), false);
  assert.equal(f.state.cleanup, 1); assert.equal(f.states.length, before);

  const launched = fixture(); await launched.guide.begin(launched.event);
  const openedStates = launched.states.length;
  launched.wc.emit('did-start-navigation', {}, launched.frame.url, false, true);
  launched.finish({ knownExit: true, exitCode: 0 }); await flush();
  assert.equal(launched.state.cleanup, 1); assert.equal(launched.states.length, openedStates);
});

test('preload requires Chromium activation, whitelists topics and removes state subscription', async () => {
  const calls = [], events = new Map(); let bridge;
  const context = vm.createContext({ window: { addEventListener() {} }, navigator: { userActivation: { isActive: false } },
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ ok: true }); },
        on: (name, callback) => events.set(name, callback), removeListener: name => events.delete(name) } }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../desktop/preload.js'), 'utf8'), context);
  assert.equal((await bridge.beginVirtualAudioSetup()).error, 'VIRTUAL_AUDIO_SETUP_USER_ACTIVATION_REQUIRED');
  assert.equal(calls.length, 0); await bridge.getVirtualAudioSetupInfo(); await bridge.cancelVirtualAudioSetup();
  context.navigator.userActivation.isActive = true;
  await bridge.beginVirtualAudioSetup(); await bridge.beginVirtualAudioSetup('official');
  assert.equal((await bridge.beginVirtualAudioSetup('https://evil.example/')).error, 'INVALID_VIRTUAL_AUDIO_SETUP_TOPIC');
  assert.deepEqual(calls, [['mineradio-virtual-audio-setup-info'], ['mineradio-virtual-audio-setup-cancel'],
    ['mineradio-virtual-audio-setup-begin', 'install'], ['mineradio-virtual-audio-setup-begin', 'official']]);
  let received; const unsubscribe = bridge.onVirtualAudioSetupState(value => { received = value; });
  events.get('mineradio-virtual-audio-setup-state')({}, { phase: 'downloading' }); assert.equal(received.phase, 'downloading');
  unsubscribe(); assert.equal(events.size, 0);
});
