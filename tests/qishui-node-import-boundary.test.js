'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadAuth(processValue, electron) {
  let electronLoads = 0;
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, process: processValue, __dirname: root,
    console, Buffer, URL, setTimeout, clearTimeout,
    require(name) {
      if (name === 'electron') {
        electronLoads++;
        if (!electron) throw new Error('Electron must not load in a Node-only backend');
        return electron;
      }
      if (name === 'qrcode') return {};
      return require(name);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'qishui-auth-v6.js'), 'utf8'), context);
  return { auth: module.exports, electronLoads: () => electronLoads };
}

test('Node-only auth import, configuration and clear never resolve the Electron package', async () => {
  const fixture = loadAuth({ versions: { node: process.versions.node } });
  fixture.auth.configure({ getConfig: () => ({}), updateConfig() {} });
  await fixture.auth.clear();
  await assert.rejects(fixture.auth.initSignEngine(), { code: 'QISHUI_ELECTRON_REQUIRED' });
  assert.equal(fixture.electronLoads(), 0);
});

test('Electron main clear still waits for readiness and clears the persistent partition', async () => {
  const calls = [];
  const fixture = loadAuth({ versions: { electron: 'fixture' }, type: 'browser' }, {
    app: { isReady: () => false, whenReady: async () => calls.push('ready') },
    session: { fromPartition(partition) {
      calls.push(partition);
      return { clearStorageData: async options => calls.push([...options.storages]),
        flushStorageData: async () => calls.push('flushed') };
    } },
  });
  assert.equal(fixture.electronLoads(), 0, 'import is lazy even in desktop main');
  await fixture.auth.clear();
  assert.equal(fixture.electronLoads(), 1);
  assert.deepEqual(calls, ['ready', 'persist:mineradio-qishui-auth-v6',
    ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'], 'flushed']);
});

test('injected QR authentication never loads the default desktop auth module', () => {
  const module = { exports: {} };
  let configured = 0;
  const context = vm.createContext({ module, exports: module.exports, __dirname: root, process, console,
    require(name) {
      if (name === './qishui-auth-v6' || name === 'electron') throw new Error('Unexpected desktop auth import');
      if (name === './cookie-storage') return { createCookieStore: () => ({ read: () => '' }) };
      return require(name);
    } });
  vm.runInContext(fs.readFileSync(path.join(root, 'qishui-qr-login.js'), 'utf8'), context);
  const bridge = module.exports.createQishuiQrLoginBridge({
    auth: { configure() { configured++; } }, configFile: '/nonexistent-qishui-fixture/config.json',
  });
  assert.equal(configured, 1);
  assert.equal(bridge.getStatus().loggedIn, false);
});
