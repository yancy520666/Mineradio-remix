'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/09-idle-toast-libraries.js'), 'utf8');
function harness() {
  const scripts = [], timers = new Map(); let next = 0, ready = false;
  const head = { appendChild(script) { scripts.push(script); script.parentNode = head; },
    removeChild(script) { scripts.splice(scripts.indexOf(script), 1); script.parentNode = null; } };
  function script() {
    const handlers = new Map();
    return { handlers, addEventListener: (name, fn) => handlers.set(name, fn),
      removeEventListener: (name, fn) => { if (handlers.get(name) === fn) handlers.delete(name); },
      emit: name => { const fn = handlers.get(name); if (fn) fn(); } };
  }
  const c = vm.createContext({ Promise, Map,
    setTimeout(fn, ms) { assert.equal(ms, 20000); const id = ++next; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    document: { querySelector: q => scripts.find(s => q.includes(s.src)) || null, createElement: script, head }
  });
  const start = source.indexOf('var scriptLoadOnceOwners');
  vm.runInContext(source.slice(start, source.indexOf('// ============================================================', start)), c);
  return { c, scripts, timers, makeScript: script, head, isReady: () => ready, setReady: value => { ready = value; } };
}
test('simultaneous callers wait for the same load and verify the expected SDK symbol', async () => {
  const s = harness(); let resolved = false;
  const first = s.c.loadScriptOnce('sdk.js', s.isReady), second = s.c.loadScriptOnce('sdk.js', s.isReady);
  assert.strictEqual(first, second); first.then(() => { resolved = true; });
  await Promise.resolve(); assert.equal(resolved, false); assert.equal(s.scripts.length, 1);
  s.setReady(true); s.scripts[0].emit('load'); await first;
  assert.equal(resolved, true); assert.equal(s.timers.size, 0);
  await s.c.loadScriptOnce('sdk.js', s.isReady); assert.equal(s.scripts.length, 1);
});
test('network failure removes the failed node and permits a fresh retry', async () => {
  const s = harness(), first = s.c.loadScriptOnce('sdk.js', s.isReady);
  const rejected = assert.rejects(first, /SCRIPT_LOAD_FAILED/); s.scripts[0].emit('error'); await rejected;
  assert.equal(s.scripts.length, 0); assert.equal(s.c.scriptLoadOnceOwners.size, 0);
  const retry = s.c.loadScriptOnce('sdk.js', s.isReady);
  s.setReady(true); s.scripts[0].emit('load'); await retry;
});
test('timeout releases listeners; a stale late load cannot resolve or replace the retry owner', async () => {
  const s = harness(), first = s.c.loadScriptOnce('sdk.js', s.isReady), old = s.scripts[0];
  const late = old.handlers.get('load'), rejected = assert.rejects(first, /SCRIPT_LOAD_TIMEOUT/);
  [...s.timers.values()][0](); await rejected;
  assert.equal(old.handlers.size, 0); assert.equal(s.scripts.length, 0);
  const retry = s.c.loadScriptOnce('sdk.js', s.isReady), owner = s.c.scriptLoadOnceOwners.get('sdk.js');
  s.setReady(true); late();
  assert.strictEqual(s.c.scriptLoadOnceOwners.get('sdk.js'), owner);
  assert.equal(old.__mineradioScriptLoaded, undefined);
  s.scripts[0].emit('load'); await retry;
});
test('an unmanaged existing script waits while loading, while an available SDK needs no node', async () => {
  const s = harness(), external = s.makeScript(); external.src = 'sdk.js'; s.head.appendChild(external);
  let settled = false; const waiting = s.c.loadScriptOnce('sdk.js', s.isReady).then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false); assert.equal(s.scripts.length, 1);
  s.setReady(true); external.emit('load'); await waiting;
  s.head.removeChild(external); await s.c.loadScriptOnce('sdk.js', s.isReady); assert.equal(s.scripts.length, 0);
});
test('a load event without the promised SDK symbol is recoverable failure', async () => {
  const s = harness(), loading = s.c.loadScriptOnce('sdk.js', s.isReady), rejected = assert.rejects(loading, /SCRIPT_SYMBOL_UNAVAILABLE/);
  s.scripts[0].emit('load'); await rejected; assert.equal(s.scripts.length, 0);
});
test('a synchronous append failure never leaves a rejected singleflight owner', async () => {
  const s = harness(); s.head.appendChild = () => { throw new Error('fixture-append-failure'); };
  await assert.rejects(s.c.loadScriptOnce('sdk.js', s.isReady), /fixture-append-failure/);
  assert.equal(s.c.scriptLoadOnceOwners.size, 0); assert.equal(s.timers.size, 0);
});
