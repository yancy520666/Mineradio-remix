'use strict';

// Constructor/lifecycle contract only: no Electron executable, remote SDK,
// credentials, network requests or claimed real verification coverage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'qishui-auth-v6.js'), 'utf8');

async function fixture() {
  const state = { events: new Map(), loads: [], config: {} };
  class Window {
    constructor(options) {
      state.options = options;
      this.webContents = {
        setUserAgent() {},
        setWindowOpenHandler(handler) { state.open = handler; },
        on(name, handler) { state.events.set(name, handler); },
        async executeJavaScript() { return ''; },
      };
    }
    setMenuBarVisibility() {}
    on() {}
    async loadURL(url) { state.loads.push(url); }
  }
  const authSession = {};
  const context = vm.createContext({
    module: { exports: {} }, __dirname: path.join(__dirname, '..'), console, Buffer, URL,
    process: { versions: { electron: 'mock-only' }, type: 'browser' },
    require(name) {
      if (name === 'electron') return {
        BrowserWindow: Window, app: { isReady: () => true },
        session: { fromPartition(partition) { state.partition = partition; return authSession; } },
      };
      if (name === 'qrcode') return {};
      return require(name);
    },
  });
  vm.runInContext(source + '\nmodule.exports.Runtime = QishuiAuthRuntime;', context);
  context.module.exports.configure({
    getConfig: () => ({ deviceId: 'fixture', installId: 'fixture', verifyPortraitId: 'fixture', computerName: 'fixture' }),
    updateConfig: value => Object.assign(state.config, value),
  });
  const runtime = new context.module.exports.Runtime();
  runtime.assetBase = 'http://127.0.0.1:12345/fixture/';
  runtime._startAssetServer = async () => {};
  runtime._installSessionHooks = () => {};
  runtime.waitForBdms = async () => {};
  await runtime._initialize();
  return { state, runtime };
}

function prevented(handler, url, isMainFrame) {
  let count = 0;
  const event = { url, isMainFrame, preventDefault() { count++; } };
  handler(event, url, false, isMainFrame);
  return count;
}

test('Qishui constructor pins isolated guest-free configuration without adding a preload bridge', async () => {
  const { state } = await fixture();
  const preferences = state.options.webPreferences;
  for (const flag of ['nodeIntegration', 'nodeIntegrationInSubFrames', 'nodeIntegrationInWorker', 'webviewTag']) {
    assert.equal(preferences[flag], false, flag);
  }
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(Object.hasOwn(preferences, 'preload'), false);
  assert.equal(preferences.partition, 'persist:mineradio-qishui-auth-v6');
  assert.equal(state.partition, preferences.partition);
  // This residual is intentionally not represented as a security pass.
  assert.equal(preferences.webSecurity, false);
});

test('Qishui rejects Electron guests, popups and non-host top-level navigations', async () => {
  const { state, runtime } = await fixture();
  assert.equal(prevented(state.events.get('will-attach-webview')), 1);
  assert.equal(state.open({ url: 'https://example.invalid/' }).action, 'deny');
  for (const event of ['will-navigate', 'will-redirect']) {
    for (const url of ['https://example.invalid/', 'file:///fixture', 'javascript:void(0)', runtime.assetBase + 'security_host.html?next=remote']) {
      assert.equal(prevented(state.events.get(event), url, true), 1, event + ' ' + url);
    }
    for (const name of ['security_seed.html', 'security_host.html']) {
      assert.equal(prevented(state.events.get(event), runtime.assetBase + name, true), 0);
    }
  }
  assert.deepEqual(state.loads, [runtime.assetBase + 'security_seed.html', runtime.assetBase + 'security_host.html']);
});

test('Qishui retains unverified subframe redirect behavior rather than inventing a trusted origin', async () => {
  const { state } = await fixture();
  assert.equal(prevented(state.events.get('will-redirect'), 'https://component-fixture.invalid/', false), 0);
});
