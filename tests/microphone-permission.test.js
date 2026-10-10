'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MicrophonePermissionGate } = require('../desktop/microphone-permission');

function fixture() {
  let time = 1000;
  const timers = new Map();
  let serial = 0;
  const frame = { url: 'http://127.0.0.1:3000/index.html', parent: null, isDestroyed: () => false,
    executeJavaScript: async (_code, userGesture) => { assert.equal(userGesture, false); return true; } };
  const wc = Object.assign(new EventEmitter(), { mainFrame: frame, isDestroyed: () => false, getURL: () => frame.url });
  const win = Object.assign(new EventEmitter(), { webContents: wc, isDestroyed: () => false });
  const gate = new MicrophonePermissionGate({ getMainWindow: () => win,
    isTrustedDocument: (url) => /^http:\/\/127\.0\.0\.1:3000\/(?:index\.html)?$/.test(url),
    now: () => time,
    setTimer: (callback) => { const id = ++serial; timers.set(id, callback); return id; },
    clearTimer: (id) => timers.delete(id) });
  gate.attach(win);
  const event = { sender: wc, senderFrame: frame };
  const details = () => ({ isMainFrame: true, requestingUrl: frame.url, mediaTypes: ['audio'] });
  const click = () => wc.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' });
  return { gate, frame, wc, win, event, details, click, timers, advance: (ms) => { time += ms; } };
}

test('microphone requires native activation and the exact trusted main frame', async () => {
  const f = fixture();
  assert.equal((await f.gate.begin(f.event)).error, 'MICROPHONE_USER_ACTIVATION_REQUIRED');
  f.click();
  assert.equal((await f.gate.begin({ ...f.event, senderFrame: { ...f.frame, parent: f.frame } })).ok, false);
  f.frame.executeJavaScript = async () => false;
  assert.equal((await f.gate.begin(f.event)).ok, false);
  f.frame.executeJavaScript = async () => true;
  f.advance(5001);
  assert.equal((await f.gate.begin(f.event)).ok, false);
  f.click();
  const grant = await f.gate.begin(f.event);
  assert.equal(grant.ok, true);
  assert.equal((await f.gate.begin(f.event)).ok, false, 'the same click cannot authorize twice');
});

test('only one audio request consumes a grant; frames, guests, video and loopback remain denied', async () => {
  const f = fixture(); f.click(); await f.gate.begin(f.event);
  const consume = (details, wc = f.wc, origin = 'http://127.0.0.1:3000') => f.gate.consume(wc, origin, details);
  for (const patch of [{ isMainFrame: false }, { isMainFrame: undefined }, { mediaTypes: ['video'] },
    { mediaTypes: ['audio', 'video'] }, { mediaTypes: [] }, { mediaTypes: ['audio', 'audio'] },
    { audioRequested: true }, { mediaType: 'unknown' }, { requestingUrl: 'http://127.0.0.1:3000/guest.html' }]) {
    assert.equal(consume({ ...f.details(), ...patch }), false);
  }
  assert.equal(consume(f.details(), { ...f.wc }), false);
  assert.equal(consume(f.details(), f.wc, 'https://example.com'), false);
  assert.equal(consume(f.details()), true);
  assert.equal(consume(f.details()), false, 'permission is never cached for a second capture');
});

test('expiry, token cancellation and stale cancellation cannot grant or revoke another operation', async () => {
  const f = fixture(); f.click(); const first = await f.gate.begin(f.event);
  f.click(); const second = await f.gate.begin(f.event);
  f.gate.end(f.event, first.token);
  assert.equal(f.gate.grant.token, second.token);
  f.gate.end(f.event, second.token);
  assert.equal(f.gate.consume(f.wc, f.frame.url, f.details()), false);
  f.click(); await f.gate.begin(f.event); f.advance(10000);
  assert.equal(f.gate.consume(f.wc, f.frame.url, f.details()), false);
  assert.equal(f.timers.size, 0);
});

test('navigation, renderer loss and window destruction cancel in-flight activation and grant', async () => {
  for (const close of [f => f.wc.emit('did-start-navigation', {}, f.frame.url, false, true),
    f => f.wc.emit('render-process-gone'), f => f.wc.emit('destroyed'), f => f.win.emit('closed')]) {
    const f = fixture(); f.click();
    let resolve;
    f.frame.executeJavaScript = () => new Promise(r => { resolve = r; });
    const pending = f.gate.begin(f.event); close(f); resolve(true);
    assert.equal((await pending).error, 'MICROPHONE_CAPTURE_CANCELLED');
    assert.equal(f.gate.grant, null);
    assert.equal(f.timers.size, 0);
  }
});

test('preload cannot invoke begin without real Chromium activation; end remains available', async () => {
  const calls = []; let bridge;
  const context = vm.createContext({ window: { addEventListener() {} }, navigator: { userActivation: { isActive: false } },
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ ok: true }); },
        sendSync: () => null, send() {}, on() {}, removeListener() {} }, clipboard: {}, webUtils: {} }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../desktop/preload.js'), 'utf8'), context);
  assert.equal((await bridge.beginMicrophoneCapture()).ok, false);
  assert.equal(calls.length, 0);
  context.navigator.userActivation.isActive = true;
  await bridge.beginMicrophoneCapture(); await bridge.endMicrophoneCapture('one');
  assert.equal(calls[0][0], 'mineradio-microphone-begin-capture');
  assert.deepEqual(calls[1], ['mineradio-microphone-end-capture', 'one']);
});

test('session media check denies microphone caching while request consumes grant and preserves camera rules', async () => {
  const f = fixture(); f.click(); await f.gate.begin(f.event);
  let check, request;
  const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  const start = source.indexOf('function configureLocalAppPermissions()');
  const tail = source.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /) + 1;
  assert.ok(end > 0);
  const ses = { setPermissionCheckHandler: fn => { check = fn; }, setPermissionRequestHandler: fn => { request = fn; },
    setDisplayMediaRequestHandler() {} };
  const camera = (_wc, _origin, details) => details.mediaType === 'video' || (details.mediaTypes || []).join() === 'video';
  const context = vm.createContext({ session: { defaultSession: ses }, microphonePermissionGate: f.gate,
    isTrustedWallpaperEngineDisplayCapturePermission: () => false,
    isTrustedWallpaperEnginePreparationMediaPermission: () => false, isTrustedGestureCameraMediaPermission: camera,
    LOCAL_APP_PERMISSION_ALLOWLIST: new Set(), isLocalAppUrl: () => false });
  vm.runInContext(tail.slice(0, end), context); context.configureLocalAppPermissions();
  assert.equal(check(f.wc, 'media', f.frame.url, { ...f.details(), mediaType: 'audio' }), false);
  let allowed;
  request(f.wc, 'media', value => { allowed = value; }, f.details()); assert.equal(allowed, true);
  request(f.wc, 'media', value => { allowed = value; }, f.details()); assert.equal(allowed, false);
  request(f.wc, 'media', value => { allowed = value; }, { ...f.details(), mediaTypes: ['video'] }); assert.equal(allowed, true);
  assert.equal(check(f.wc, 'media', f.frame.url, { mediaType: 'video' }), true);
});

test('explicit enumeration grants labels only, never capture, and expires on end/navigation', async () => {
  const f = fixture();
  assert.equal((await f.gate.begin(f.event, 'enumerate')).ok, false);
  f.click(); const grant = await f.gate.begin(f.event, 'enumerate');
  assert.equal(grant.ok, true);
  const detail = { ...f.details(), mediaType: 'audio' };
  assert.equal(f.gate.canEnumerate(f.wc, f.frame.url, detail), true);
  assert.equal(f.gate.canEnumerate(f.wc, f.frame.url, { ...detail, isMainFrame: false }), false);
  assert.equal(f.gate.canEnumerate(f.wc, f.frame.url, { ...detail, mediaType: 'video' }), false);
  assert.equal(f.gate.consume(f.wc, f.frame.url, f.details()), false);
  f.gate.end(f.event, grant.token);
  assert.equal(f.gate.canEnumerate(f.wc, f.frame.url, detail), false);
  f.click(); await f.gate.begin(f.event, 'enumerate'); f.advance(10001);
  assert.equal(f.gate.canEnumerate(f.wc, f.frame.url, detail), false);
});
test('one-click setup promotes the same fresh token once without extending expiry or caching capture permission', async () => {
  const f = fixture(); f.click(); const setup = await f.gate.begin(f.event, 'setup');
  assert.equal(setup.ok, true);
  const details = { ...f.details(), mediaType: 'audio' };
  assert.equal(f.gate.canEnumerate(f.wc, f.frame.url, details), true);
  assert.equal(f.gate.consume(f.wc, f.frame.url, f.details()), false, 'setup cannot authorize capture');
  f.advance(1200); const prepared = f.gate.prepare(f.event, setup.token);
  assert.equal(prepared.ok, true); assert.equal(prepared.token, setup.token); assert.equal(prepared.expiresAt, setup.expiresAt);
  assert.equal(f.gate.canEnumerate(f.wc, f.frame.url, details), false, 'capture must go through request/consume, never a cached check');
  assert.equal(f.gate.prepare(f.event, setup.token).ok, false);
  assert.equal(f.gate.consume(f.wc, f.frame.url, f.details()), true);
  assert.equal(f.gate.consume(f.wc, f.frame.url, f.details()), false);
});
test('setup promotion rejects stale, mismatched, cancelled and plain enumeration grants', async () => {
  for (const kind of ['capture', 'enumerate']) {
    const f = fixture(); f.click(); const grant = await f.gate.begin(f.event, kind);
    assert.equal(f.gate.prepare(f.event, grant.token).ok, false);
  }
  for (const change of [f => f.advance(5001), f => f.wc.emit('did-start-navigation', {}, f.frame.url, false, true),
    f => f.wc.emit('render-process-gone'), f => f.win.emit('closed')]) {
    const f = fixture(); f.click(); const grant = await f.gate.begin(f.event, 'setup'); change(f);
    assert.equal(f.gate.prepare(f.event, grant.token).ok, false);
  }
  const f = fixture(); f.click(); const old = await f.gate.begin(f.event, 'setup');
  assert.equal(f.gate.prepare({ ...f.event, senderFrame: { ...f.frame, parent: f.frame } }, old.token).ok, false);
  f.click(); const current = await f.gate.begin(f.event, 'setup');
  assert.equal(f.gate.prepare(f.event, old.token).ok, false); assert.equal(f.gate.grant.token, current.token);
  assert.equal(f.gate.prepare(f.event, current.token).ok, true);
});
