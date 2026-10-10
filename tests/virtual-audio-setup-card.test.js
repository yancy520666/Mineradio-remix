'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/22-virtual-audio-setup-card.js'), 'utf8');
const speaker = { kind: 'audiooutput', deviceId: 'speaker', label: 'Headset speakers' };
const cable = { kind: 'audiooutput', deviceId: 'cable', label: 'CABLE Input (VB-Audio Virtual Cable)' };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function fixture(options = {}) {
  const events = [], handlers = {}, storage = options.storage || new Map();
  let c, stateHandler;
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.parentNode = null; this.children = []; this.attributes = {};
      this.hidden = false; this.disabled = false; this.textContent = ''; this.title = ''; this.listeners = {};
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
    }
    get id() { return this.attributes.id || ''; }
    set id(value) { this.attributes.id = value; }
    get className() { return this.attributes.class || ''; }
    set className(value) { this.attributes.class = value; }
    get firstChild() { return this.children[0] || null; }
    get isConnected() { return this === root || !!(this.parentNode && this.parentNode.isConnected); }
    get innerHTML() { return this.markup || ''; }
    set innerHTML(markup) {
      this.markup = markup;
      this.replaceChildren();
      // Only the small card/entry markup needs materializing for behavioral QA.
      for (const match of markup.matchAll(/<(button|p|span)\b([^>]*)>([^<]*)/g)) {
        const child = new Node(match[1]);
        for (const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child.setAttribute(attribute[1], attribute[2] || '');
        child.hidden = child.hasAttribute('hidden'); child.textContent = match[3]; this.appendChild(child);
      }
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, before) {
      if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
      node.parentNode = this;
      const index = before ? this.children.indexOf(before) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      return node;
    }
    replaceChildren(...nodes) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; nodes.forEach(node => this.appendChild(node)); }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(item => this.matches(item.trim()));
      if (selector[0] === '[') return this.hasAttribute(selector.slice(1, -1));
      if (selector[0] === '#') return this.id === selector.slice(1);
      if (selector[0] === '.') return this.className.split(' ').includes(selector.slice(1));
      return this.tagName.toLowerCase() === selector;
    }
    querySelector(selector) { for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; } return null; }
    closest(selector) { return this.matches(selector) ? this : this.parentNode && this.parentNode.closest(selector); }
    focus() { c.document.activeElement = this; events.push('focus:' + (this.id || this.getAttribute('data-virtual-audio-install') || this.textContent)); }
    addEventListener(name, handler) { (this.listeners[name] || (this.listeners[name] = [])).push(handler); }
    click() { if (!this.disabled) { let node = this; while (node) { (node.listeners.click || []).forEach(handler => handler({ target: this })); node = node.parentNode; } } }
  }
  const root = new Node(), modal = new Node(), body = new Node(), panel = new Node(), head = new Node(), expand = new Node('button'), enable = new Node('button');
  modal.id = 'audio-output-workflow-modal'; body.id = 'audio-output-workflow-body'; panel.id = 'audio-microphone-mixer';
  head.className = 'audio-mixer-head'; expand.setAttribute('data-mixer-expand', ''); enable.setAttribute('data-mixer-enable', '');
  root.appendChild(modal); modal.appendChild(body); body.appendChild(panel); panel.appendChild(head); head.appendChild(expand); head.appendChild(enable);
  if (options.open !== false) modal.classList.add('show');
  c = { Promise, console,
    document: { activeElement: expand, createElement: tag => new Node(tag), getElementById: id => root.querySelector('#' + id),
      addEventListener: (name, handler) => { (handlers[name] || (handlers[name] = [])).push(handler); } },
    window: { desktopWindow: options.bridge === null ? null : {
      getVirtualAudioSetupInfo: () => { events.push('info'); return options.info || Promise.resolve({ supported: true, mode: 'official-guide' }); },
      beginVirtualAudioSetup: topic => { events.push('begin:' + topic); return options.begin ? options.begin() : Promise.resolve({ ok: false, canceled: true }); },
    } },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    isVirtualMicOutputDevice: device => /cable|virtual|voicemeeter|blackhole/i.test(device.label),
    microphoneMixerState: () => ({ phase: c.phase || 'off' }), showToast: text => events.push('toast:' + text),
    navigator: { mediaDevices: { getUserMedia: () => { throw new Error('real microphone must never be requested'); } } },
    fetch: () => { throw new Error('renderer must never download a driver'); },
  };
  if (options.nativeState && c.window.desktopWindow) {
    c.window.desktopWindow.onVirtualAudioSetupState = callback => { stateHandler = callback; events.push('subscribe'); return () => {}; };
    c.window.desktopWindow.cancelVirtualAudioSetup = () => { events.push('cancel-download'); return options.cancel ? options.cancel() : Promise.resolve({ ok: true, canceled: true }); };
  }
  vm.createContext(c); vm.runInContext(source, c);
  const sync = (extra = {}) => c.syncVirtualAudioSetupCard({ routeOpen: true, enumerationComplete: true, outputs: [speaker], ...extra });
  const key = (extra = {}) => { const event = { key: 'Escape', defaultPrevented: false, isComposing: false,
    preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra }; handlers.keydown.forEach(handler => handler(event)); return event; };
  return { c, events, storage, root, modal, body, panel, head, expand, enable, sync, key, emit: state => stateHandler(state),
    card: () => c.virtualAudioSetupCard, install: () => c.virtualAudioSetupCard.querySelector('[data-virtual-audio-install]'),
    entry: () => c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-install]') };
}

test('module load and route opening never request microphone permission or start installation', async () => {
  const f = fixture(); assert.deepEqual(f.events, []);
  f.sync({ enumerationComplete: false }); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.card(), null); assert.deepEqual(f.events, ['info']);
  assert.equal(f.entry().textContent, '下载驱动'); assert.equal(f.entry().isConnected, true);
});

test('only a complete, identified live output snapshot offers the optional card', () => {
  for (const extra of [ { enumerationComplete: false }, { outputs: null }, { outputs: [speaker, { deviceId: 'unknown', label: '' }] },
    { outputs: [{ deviceId: '', label: 'Unidentified' }] }, { outputs: [{ ...speaker, offline: true }] },
    { outputs: [{ ...speaker, kind: 'audioinput' }] }, { routeOpen: false } ]) {
    const f = fixture(); f.sync(extra); assert.equal(f.card(), null, JSON.stringify(extra));
  }
  const missingClassifier = fixture(); missingClassifier.c.isVirtualMicOutputDevice = undefined; missingClassifier.sync(); assert.equal(missingClassifier.card(), null);
  const emptyComplete = fixture(); emptyComplete.sync({ outputs: [] }); assert.equal(emptyComplete.card().hidden, false);
});

test('all virtual outputs count as detected, including a virtual endpoint used as main listening output', () => {
  const f = fixture(); f.c.effectiveAudioPrimaryId = () => 'cable'; f.sync({ outputs: [speaker, cable] });
  assert.equal(f.card(), null);
  f.sync(); assert.equal(f.card().hidden, false);
  f.install().focus(); f.sync({ outputs: [speaker, cable] });
  assert.equal(f.card().hidden, true); assert.equal(f.c.document.activeElement, f.expand);
});

test('a visible hint survives routing DOM rebuilds without repeating or stealing focus', () => {
  const f = fixture(); f.sync(); const card = f.card();
  assert.equal(f.c.document.activeElement, f.expand); assert.deepEqual(f.events, []);
  f.sync(); assert.equal(f.card(), card); assert.equal(f.body.children.filter(node => node === card).length, 1);
  f.body.replaceChildren(f.panel); f.sync();
  assert.equal(f.card(), card); assert.equal(card.parentNode, f.body); assert.equal(card.hidden, false);
  assert.equal(f.head.children.filter(node => node === f.c.virtualAudioSetupEntry).length, 1);
  assert.doesNotMatch(card.innerHTML, /aria-modal|role="dialog"/, 'the hint does not create a second modal focus trap');
});

test('Not now, close and Escape dismiss for this session and restore only owned focus', () => {
  const f = fixture(); f.sync(); f.install().focus();
  const ime = f.key({ isComposing: true }); assert.equal(ime.defaultPrevented, false); assert.equal(f.card().hidden, false);
  const consumed = f.key({ defaultPrevented: true }); assert.equal(consumed.stopped, undefined);
  const escape = f.key(); assert.equal(escape.defaultPrevented, true); assert.equal(escape.stopped, true);
  assert.equal(f.card().hidden, true); assert.equal(f.c.document.activeElement, f.expand);
  f.sync(); assert.equal(f.card().hidden, true);
  const reloaded = fixture({ storage: f.storage }); reloaded.sync(); assert.equal(reloaded.card(), null);
  const other = fixture(); other.sync(); assert.equal(other.key().defaultPrevented, false, 'Escape elsewhere keeps route-close behavior');
  other.card().querySelector('[data-virtual-audio-dismiss]').click(); other.sync(); assert.equal(other.card().hidden, true);
});

test('late snapshots after route close cannot show a hint, and ongoing mixing is never interrupted', () => {
  const f = fixture({ open: false }); f.sync(); assert.equal(f.card(), null);
  f.modal.classList.add('show'); f.c.beginVirtualAudioSetupRoute(); f.modal.setAttribute('aria-hidden', 'true'); f.sync(); assert.equal(f.card(), null);
  f.c.beginVirtualAudioSetupRoute();
  f.modal.setAttribute('aria-hidden', 'false'); f.c.phase = 'running'; f.sync(); assert.equal(f.card(), null);
  f.c.phase = 'off'; f.sync(); assert.equal(f.card().hidden, false);
  f.c.hideVirtualAudioSetupCard(); f.modal.classList.remove('show'); f.sync(); assert.equal(f.card().hidden, true);
});

test('Close blocks first-time late discovery during the route fade until a new explicit Open', () => {
  const f = fixture(); f.sync({ enumerationComplete: false });
  f.c.hideVirtualAudioSetupCard();
  assert.equal(f.modal.classList.contains('show'), true, 'the route can still carry .show while its close animation runs');
  f.sync(); assert.equal(f.card(), null);
  f.c.beginVirtualAudioSetupRoute(); f.sync(); assert.equal(f.card().hidden, false);
});

test('card and permanent download entry share one explicitly clicked native action, with cancellation retryable', async () => {
  const pending = deferred(); const f = fixture({ begin: () => pending.promise }); f.sync();
  const first = f.c.beginVirtualAudioSetupFromUi(); const second = f.c.beginVirtualAudioSetupFromUi();
  assert.deepEqual(f.events, ['begin:install']); assert.equal(f.install().disabled, true); assert.equal(f.entry().disabled, true);
  pending.resolve({ ok: false, canceled: true }); await first; await second;
  assert.equal(f.install().disabled, false); assert.equal(f.entry().disabled, false); assert.equal(f.card().hidden, false);
  f.c.window.desktopWindow.beginVirtualAudioSetup = async topic => { f.events.push('retry:' + topic); return { ok: true, opened: true, mode: 'official-guide' }; };
  f.entry().click(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.events.includes('retry:install')); assert.equal(f.card().hidden, true);
  assert.ok(f.events.some(event => event.includes('官方安装指引已打开')));
  assert.ok(!f.events.some(event => event.includes('安装完成')));
});

test('native failure retains a concise retryable status while late close suppresses feedback', async () => {
  const failing = fixture({ begin: async () => { throw new Error('IPC closed'); } }); failing.sync(); await failing.c.beginVirtualAudioSetupFromUi();
  const feedback = failing.card().querySelector('[data-virtual-audio-status]');
  assert.equal(feedback.hidden, false); assert.match(feedback.textContent, /请重试/); assert.equal(failing.entry().disabled, false);
  const pending = deferred(); const f = fixture({ begin: () => pending.promise }); f.sync();
  const operation = f.c.beginVirtualAudioSetupFromUi(); f.c.hideVirtualAudioSetupCard(); f.modal.classList.remove('show');
  pending.resolve({ ok: true, opened: true, mode: 'official-guide' }); await operation;
  assert.equal(f.card().hidden, true); assert.ok(!f.events.some(event => event.startsWith('toast:')));
});

test('unsupported capability disables both actions without inventing an installed state', async () => {
  const f = fixture({ info: Promise.resolve({ supported: false, automaticInstall: false }) }); f.sync(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.entry().disabled, true); assert.equal(f.install().disabled, true);
  await f.c.beginVirtualAudioSetupFromUi(); assert.ok(!f.events.some(event => event.startsWith('begin:')));
  const browser = fixture({ bridge: null }); browser.sync(); assert.equal(browser.entry().disabled, true);
});

test('native progress stays compact, subscribes once and allows explicit download cancellation only before handoff', async () => {
  const f = fixture({ nativeState: true }); f.sync(); f.sync();
  assert.equal(f.events.filter(event => event === 'subscribe').length, 1);
  f.emit({ phase: 'downloading', busy: true, canCancel: true });
  const cardCancel = f.card().querySelector('[data-virtual-audio-cancel]');
  assert.equal(f.install().disabled, true); assert.equal(f.entry().disabled, true); assert.equal(cardCancel.hidden, false);
  assert.match(f.card().querySelector('[data-virtual-audio-status]').textContent, /正在下载官方驱动/);
  assert.equal(f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-status]').hidden, true);
  f.c.dismissVirtualAudioSetupCard();
  assert.ok(!f.events.includes('cancel-download'), 'closing the optional card is not canceling a download or installer');
  const entryCancel = f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-cancel]');
  assert.equal(entryCancel.hidden, false); assert.equal(f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-status]').hidden, false);
  await f.c.cancelVirtualAudioSetupFromUi(); assert.equal(f.events.filter(event => event === 'cancel-download').length, 1);
  f.emit({ phase: 'handoff', busy: true, canCancel: false });
  assert.equal(entryCancel.hidden, true); await f.c.cancelVirtualAudioSetupFromUi();
  assert.equal(f.events.filter(event => event === 'cancel-download').length, 1);
  assert.match(f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-status]').textContent, /官方安装程序/);
});

test('a cancel-to-handoff race reports native ownership without claiming the driver was canceled', async () => {
  const pending = deferred(); const f = fixture({ nativeState: true, cancel: () => pending.promise }); f.sync();
  f.emit({ phase: 'verifying', busy: true, canCancel: true });
  const first = f.c.cancelVirtualAudioSetupFromUi(), second = f.c.cancelVirtualAudioSetupFromUi();
  assert.equal(f.events.filter(event => event === 'cancel-download').length, 1);
  pending.resolve({ ok: false, error: 'VIRTUAL_AUDIO_INSTALLER_HANDOFF_IN_PROGRESS' }); await first; await second;
  assert.equal(f.card().querySelector('[data-virtual-audio-status]').textContent, '官方安装程序已接管，请在安装窗口中操作');
});

test('handoff removes Cancel without leaving keyboard focus on an invisible action', () => {
  const f = fixture({ nativeState: true }); f.sync(); f.emit({ phase: 'downloading', busy: true, canCancel: true });
  const cancel = f.card().querySelector('[data-virtual-audio-cancel]'); cancel.focus();
  f.emit({ phase: 'handoff', busy: true, canCancel: false });
  assert.equal(cancel.hidden, true); assert.equal(f.c.document.activeElement, f.card().querySelector('[data-virtual-audio-dismiss]'));
  f.c.dismissVirtualAudioSetupCard(); f.emit({ phase: 'verifying', busy: true, canCancel: true });
  f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-cancel]').focus();
  f.emit({ phase: 'handoff', busy: true, canCancel: false }); assert.equal(f.c.document.activeElement, f.expand);
});

test('installer handoff releases the frontend without claiming installation, and later exit stays informational', async () => {
  const pending = deferred(); const f = fixture({ nativeState: true, begin: () => pending.promise }); f.sync();
  const operation = f.c.beginVirtualAudioSetupFromUi();
  f.emit({ phase: 'handoff', busy: true, canCancel: false });
  f.emit({ phase: 'installer-opened', busy: true, canCancel: false });
  pending.resolve({ ok: true, installerOpened: true, mode: 'guided-installer' }); await operation;
  assert.equal(f.card().hidden, true); assert.equal(f.c.virtualAudioSetupPending, false);
  assert.equal(f.entry().disabled, true, 'a running official installer blocks duplicate launch, not closing the route');
  assert.ok(f.events.some(event => event.includes('安装程序已打开')));
  f.emit({ phase: 'installer-exited', busy: false, canCancel: false });
  assert.equal(f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-status]').textContent, '安装程序已结束，重启后刷新接口');
  assert.ok(!f.events.some(event => event.includes('安装完成')));
  f.modal.classList.remove('show'); f.c.hideVirtualAudioSetupCard();
  f.emit({ phase: 'installer-exited', busy: false, canCancel: false });
  assert.equal(f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-status]').hidden, true);
});

test('native failures offer the official fallback only through another explicit user click', async () => {
  const f = fixture({ nativeState: true, begin: async () => ({ ok: false, error: 'DOWNLOAD_FAILED', fallbackAvailable: true }) }); f.sync();
  await f.c.beginVirtualAudioSetupFromUi();
  const official = f.card().querySelector('[data-virtual-audio-official]');
  assert.equal(official.hidden, false); assert.equal(official.disabled, false);
  assert.equal(f.events.filter(event => event.startsWith('begin:')).length, 1);
  f.c.window.desktopWindow.beginVirtualAudioSetup = async topic => { f.events.push('fallback:' + topic); return { ok: true, opened: true, mode: 'official-guide' }; };
  official.click(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.events.includes('fallback:official')); assert.equal(f.card().hidden, true);
});

test('unknown installer state blocks duplicate launch but keeps the official information fallback available', async () => {
  const f = fixture({ nativeState: true }); f.sync();
  f.emit({ phase: 'error', busy: true, canCancel: false, error: 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN', fallbackAvailable: true });
  assert.equal(f.install().disabled, true); assert.equal(f.entry().disabled, true);
  const official = f.card().querySelector('[data-virtual-audio-official]'); assert.equal(official.hidden, false); assert.equal(official.disabled, false);
  assert.equal(f.card().querySelector('[data-virtual-audio-status]').textContent, '安装程序状态未知，请在官方安装窗口中检查');
  await f.c.beginVirtualAudioSetupFromUi(); assert.ok(!f.events.includes('begin:install'));
  f.c.window.desktopWindow.beginVirtualAudioSetup = async topic => { f.events.push('read:' + topic); return { ok: true, opened: true, mode: 'official-guide' }; };
  await f.c.beginVirtualAudioSetupFromUi('official');
  assert.ok(f.events.includes('read:official')); assert.equal(f.entry().disabled, true);
  assert.equal(f.c.virtualAudioSetupEntry.querySelector('[data-virtual-audio-official]').disabled, false);
});

test('an unknown native launch event arriving before the failed begin result keeps its warning and no-retry latch', async () => {
  const pending = deferred(); const f = fixture({ nativeState: true, begin: () => pending.promise }); f.sync();
  const operation = f.c.beginVirtualAudioSetupFromUi();
  f.emit({ phase: 'error', busy: true, canCancel: false, error: 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN', fallbackAvailable: true });
  pending.resolve({ ok: false, error: 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN', fallbackAvailable: true }); await operation;
  assert.equal(f.card().querySelector('[data-virtual-audio-status]').textContent, '安装程序状态未知，请在官方安装窗口中检查');
  assert.equal(f.install().disabled, true); assert.equal(f.card().querySelector('[data-virtual-audio-official]').disabled, false);
});

test('loader order and scoped styles preserve hidden semantics and compact native controls', () => {
  const loader = fs.readFileSync(path.join(__dirname, '../public/js/index-loader.js'), 'utf8');
  assert.ok(loader.indexOf('20-microphone-mixer-ui.js') < loader.indexOf('21-one-click-microphone-mixer.js'));
  assert.ok(loader.indexOf('21-one-click-microphone-mixer.js') < loader.indexOf('22-virtual-audio-setup-card.js'));
  const css = fs.readFileSync(path.join(__dirname, '../public/css/index.css'), 'utf8');
  assert.match(css, /#audio-output-workflow-modal #virtual-audio-setup-card\[hidden\],[\s\S]*?display: none !important/);
  assert.match(css, /#audio-output-workflow-modal #audio-microphone-mixer \.audio-virtual-setup-entry/);
  assert.match(source, /beginVirtualAudioSetup\(topic\)/);
  assert.doesNotMatch(source, /getUserMedia|openExternal|https?:\/\/|fetch\(/);
});
