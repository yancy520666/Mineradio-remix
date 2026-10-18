'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'qishui-auth-v6/security_host.html'), 'utf8');
const hostScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('window._SdkGlueInit('));
const flush = () => new Promise(setImmediate);

function renderer() {
  const state = { scripts: [], timers: new Map(), xhrs: [], renders: [] };
  const status = { style: {} };
  class Xhr {
    constructor() { state.xhrs.push(this); }
    open() {}
    setRequestHeader() {}
    send() {}
    abort() { this.aborted = true; }
    getAllResponseHeaders() { return ''; }
    respond(body) { this.status = 200; this.responseText = JSON.stringify(body); this.onload(); }
  }
  const window = { _SdkGlueInit() {} };
  const context = vm.createContext({
    window, URL, URLSearchParams, TextEncoder, AbortController, XMLHttpRequest: Xhr,
    safeUrl: value => String(value),
    document: {
      getElementById: () => status,
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { appendChild(script) { state.scripts.push(script); } },
    },
    setTimeout(callback, ms) { const id = Symbol(); state.timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { state.timers.delete(id); },
  });
  vm.runInContext(hostScript, context);
  const fire = ms => {
    const entry = [...state.timers.entries()].find(([, timer]) => timer.ms === ms);
    assert.ok(entry, 'missing timer ' + ms); state.timers.delete(entry[0]); entry[1].callback();
  };
  const installComponent = () => { window.ucWebSecondVerify = data => state.renders.push(data); };
  return { window, state, fire, installComponent };
}

const componentDecision = { url: 'https://official-fixture.invalid/component.js' };

test('Qishui cancellation exists during decision loading and aborts its request', async () => {
  const { window, state } = renderer();
  const result = window.__qishuiSecondVerify({ verify_from: 'verify_center' }, { attemptId: '1' });
  assert.equal(state.xhrs.length, 1);
  window.__qishuiCancelSecondVerify();
  assert.equal((await result).status, false);
  assert.equal(state.xhrs[0].aborted, true);
  state.xhrs[0].respond({ data: componentDecision });
  await flush();
  assert.equal(state.scripts.length, 0, 'late decision must never load a component after cancellation');
  assert.equal(state.timers.size, 0);
});

test('Qishui cancellation while the component loads settles and blocks a late render', async () => {
  const { window, state, installComponent } = renderer();
  const result = window.__qishuiSecondVerify(componentDecision, { attemptId: '1' });
  await flush();
  const script = state.scripts[0], lateLoad = script.onload;
  window.__qishuiCancelSecondVerify();
  assert.equal((await result).status, false);
  assert.equal(script.removed, true);
  installComponent(); lateLoad();
  await flush();
  assert.equal(state.renders.length, 0);
  assert.equal(state.timers.size, 0);
});

test('Qishui decision and script loading both have finite deadlines', async () => {
  const decision = renderer();
  const pendingDecision = decision.window.__qishuiSecondVerify({ verify_from: 'verify_center' });
  decision.fire(45000);
  assert.equal((await pendingDecision).code, 'QISHUI_MFA_LOAD_TIMEOUT');
  assert.equal(decision.state.xhrs[0].aborted, true);
  const script = renderer();
  const pendingScript = script.window.__qishuiSecondVerify(componentDecision);
  await flush(); script.fire(20000);
  assert.match((await pendingScript).message, /加载超时/);
  assert.equal(script.state.scripts[0].removed, true);
  assert.equal(script.state.timers.size, 0);
});

test('Qishui pre-entry cancel and replaced callback cannot affect a new manual attempt', async () => {
  const { window, state, installComponent } = renderer();
  window.__qishuiCancelSecondVerify('1');
  assert.equal((await window.__qishuiSecondVerify(componentDecision, { attemptId: '1' })).status, false);
  assert.equal(state.scripts.length, 0);
  installComponent();
  const old = window.__qishuiSecondVerify(componentDecision, { attemptId: '2' });
  await flush();
  const oldCallback = state.renders[0].verifyFinishCallback;
  const current = window.__qishuiSecondVerify(componentDecision, { attemptId: '3' });
  assert.equal((await old).status, false);
  await flush();
  assert.equal(state.renders.length, 2);
  let settled = false; current.then(() => { settled = true; });
  oldCallback({ status: true });
  window.__qishuiCancelSecondVerify('2');
  await flush();
  assert.equal(settled, false, 'only the current official UI callback can finish this manual verification');
  state.renders[1].verifyFinishCallback({ status: true });
  assert.equal((await current).status, true);
  assert.equal(state.timers.size, 0);
});

function mainRuntime() {
  const state = { scripts: [], hidden: 0, timers: new Map() };
  const source = fs.readFileSync(path.join(__dirname, '..', 'qishui-auth-v6.js'), 'utf8');
  const context = vm.createContext({
    module: { exports: {} }, __dirname: path.join(__dirname, '..'), console, Buffer, URL,
    setTimeout(callback, ms) { const id = Symbol(); state.timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { state.timers.delete(id); },
    require(name) {
      if (name === 'electron') return {};
      if (name === 'qrcode') return {};
      return require(name);
    },
  });
  vm.runInContext(source + '\nmodule.exports.Runtime = QishuiAuthRuntime;', context);
  const runtime = new context.module.exports.Runtime();
  runtime.window = {
    isDestroyed: () => false, setTitle() {}, setSize() {}, center() {}, show() {}, focus() {},
    hide() { state.hidden++; },
    webContents: {
      executeJavaScript() { throw new Error('load-completion API must not be used'); },
      mainFrame: { executeJavaScript(script) { state.scripts.push(script); return script.includes('__qishuiSecondVerify(') ? new Promise(() => {}) : Promise.resolve(); } },
    },
  };
  return { runtime, state };
}

test('Qishui main process cancellation settles even if renderer execution never resolves', async () => {
  const { runtime, state } = mainRuntime();
  const result = runtime.secondVerify(componentDecision, { deviceId: 'fake', installId: 'fake' });
  runtime.cancelSecondVerify();
  assert.equal((await result).status, false);
  assert.equal(state.hidden, 1);
  assert.ok(state.scripts[1].includes('__qishuiCancelSecondVerify("1")'));
  assert.equal(state.timers.size, 0);
});

test('Qishui replaced main attempt cannot hide the newer window, and parent deadline settles a hung page', async () => {
  const { runtime, state } = mainRuntime();
  const old = runtime.secondVerify(componentDecision, { deviceId: 'fake', installId: 'fake' });
  const current = runtime.secondVerify(componentDecision, { deviceId: 'fake', installId: 'fake' });
  assert.equal((await old).status, false);
  assert.equal(state.hidden, 0);
  const timer = [...state.timers.values()][0];
  assert.equal(timer.ms, 6 * 60 * 1000); timer.callback();
  assert.match((await current).message, /超时/);
  assert.equal(state.hidden, 1);
  assert.equal(state.timers.size, 0);
});
