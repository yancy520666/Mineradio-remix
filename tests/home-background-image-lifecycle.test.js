'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  const images = [], nodes = [], hooks = {}, timers = new Map();
  let now = 100, nextTimer = 0, active = 0, deep = false, splash = false;
  function addHook(name, fn) { (hooks[name] ||= []).push(fn); }
  const c = vm.createContext({ console, URL, Map, Set, Date, Image: class {
    constructor() { images.push(this); } decode() { return Promise.resolve(); }
    removeAttribute() { this.src = ''; }
  }, performance: { now: () => now }, navigator: { onLine: true }, emptyHomeActive: true,
    document: { hidden: false, body: { classList: { contains: name => name === 'splash-active' && splash } },
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => nodes, addEventListener: addHook },
    window: { addEventListener: addHook }, localStorage: { getItem: () => null },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id), cssImageUrl: src => src,
    isDeepBackgroundMode: () => deep, isInlineCoverSrc: src => src.startsWith('data:'),
    reserveBackgroundImageSlot: () => {
      if (active >= 2) return null; active++;
      let released = false;
      return () => { if (!released) { released = true; active--; } };
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/03a-home-dashboard.js'), 'utf8')
    .replace(/\nbindHomeDashboardVideoControls\(\);\nbindHomePlatformRecommendationControls\(\);\nrenderHomeDashboard\(\);\s*$/, '\n');
  vm.runInContext(source, c);
  const node = () => { const n = { isConnected: true, style: { backgroundImage: 'old' } }; nodes.push(n); return n; };
  return { c, images, nodes, timers, node, active: () => active, setDeep: v => { deep = v; }, setSplash: v => { splash = v; },
    advance: ms => { now += ms; }, event: name => (hooks[name] || []).forEach(fn => fn()),
    fire: ms => { const entry = [...timers].find(([, t]) => t.ms === ms); assert(entry, 'timer ' + ms); timers.delete(entry[0]); entry[1].fn(); } };
}

test('home art owns one request, cancels superseded decodes and keeps old art until success', async () => {
  const f = fixture(), n = f.node();
  f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/a');
  const late = f.images[0].onload;
  f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/b');
  assert.equal(f.images[0].src, ''); assert.equal(f.images[0].onload, null);
  late(); await Promise.resolve(); assert.equal(n.style.backgroundImage, 'old');
  f.images[1].onload(); await Promise.resolve();
  assert.equal(n.style.backgroundImage, 'url("https://fixture/b")'); assert.equal(f.active(), 0);
  for (let i = 0; i < 20; i++) f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/b');
  assert.equal(f.images.length, 2);
});

test('startup preloads known home covers behind the splash using the existing request budget', () => {
  const f = fixture(); f.c.emptyHomeActive = false;
  f.setSplash(true);
  for (let i = 0; i < 3; i++) f.c.homeDashboardSetStableBackgroundImage(f.node(), 'https://fixture/' + i);
  assert.equal(f.images.length, 2); assert.equal(f.active(), 2);
  f.c.document.hidden = true; f.event('visibilitychange');
  assert.equal(f.active(), 0, 'minimized startup still releases all requests');
  f.c.document.hidden = false; f.setSplash(false); f.event('visibilitychange');
  assert.equal(f.active(), 0, 'leaving home does not keep speculative requests alive');
});

test('a decoded late cover fades once while subsequent renders reuse it', async () => {
  const f = fixture(), n = f.node(), reveals = [];
  n.animate = (frames, opts) => { reveals.push({ frames, opts }); return { cancel() {} }; };
  f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/late');
  assert.equal(n.style.backgroundImage, 'old');
  f.images[0].onload(); await Promise.resolve();
  assert.equal(reveals.length, 1); assert.equal(reveals[0].opts.duration, 260);
  f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/late');
  assert.equal(f.images.length, 1); assert.equal(reveals.length, 1);
});

test('failure and timeout retry once, then cooldown and online permit a fresh attempt', () => {
  const f = fixture(), n = f.node();
  f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/a');
  f.images[0].onerror(); f.fire(800); f.fire(10000);
  assert.equal(f.active(), 0); assert.equal(n.style.backgroundImage, 'old');
  for (let i = 0; i < 100; i++) f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/a');
  assert.equal(f.images.length, 2); assert.equal(n.__homeDashboardBackgroundOwner.status, 'failed');
  f.event('online'); assert.equal(f.images.length, 3);
  f.images[2].onerror(); f.fire(800); f.images[3].onerror();
  f.advance(30001); f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/a');
  assert.equal(f.images.length, 5);
});

test('home art shares two slots and releases hidden, detached and pagehide requests', () => {
  const f = fixture(), a = f.node(), b = f.node(), d = f.node();
  for (const [n, src] of [[a, 'a'], [b, 'b'], [d, 'd']]) f.c.homeDashboardSetStableBackgroundImage(n, 'https://fixture/' + src);
  assert.equal(f.images.length, 2); assert.equal(f.active(), 2);
  assert.equal(d.__homeDashboardBackgroundOwner.status, 'waiting');
  f.c.homeDashboardSetStableBackgroundImage(a, ''); f.event('mineradio-background-image-slot');
  assert.equal(f.images.length, 3); assert.equal(f.active(), 2);
  f.setDeep(true); f.event('visibilitychange'); assert.equal(f.active(), 0);
  f.setDeep(false); f.event('visibilitychange'); assert.equal(f.active(), 2);
  b.isConnected = false; f.c.homeDashboardSetStableBackgroundImage(d, 'https://fixture/new-d');
  assert.equal(b.__homeDashboardBackgroundOwner.status, 'cancelled');
  f.event('pagehide'); assert.equal(f.active(), 0); assert.equal(f.c.homeDashboardBackgroundOwners.size, 0);
});
