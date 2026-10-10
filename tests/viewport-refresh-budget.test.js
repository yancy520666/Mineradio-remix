'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

test('resize bursts preserve immediate refresh and the final three stable checks without accumulating timers', () => {
  const timers = new Map(), callbacks = [], refreshes = [];
  let serial = 0;
  const c = vm.createContext({ mainRendererViewportRefreshTimers: [], mainRendererViewportRefreshGeneration: 0,
    refreshMainRendererViewport: reason => refreshes.push(reason),
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); callbacks.push(fn); return id; },
    clearTimeout: id => timers.delete(id) });
  loadFunctions(c, 'public/js/modules/10-shell/01-viewport-resize-shortcuts.js', ['scheduleMainRendererViewportRefresh']);
  for (let i = 0; i < 100; i++) c.scheduleMainRendererViewportRefresh('resize-' + i);
  assert.equal(refreshes.length, 100);
  assert.equal(timers.size, 3);
  assert.equal(c.mainRendererViewportRefreshTimers.length, 3);
  assert.deepEqual([...timers.values()].map(entry => entry.delay), [48, 140, 320]);
  callbacks[0]();
  assert.equal(refreshes.length, 100, 'a cancelled callback already queued by the host cannot refresh a stale generation');
  assert.equal(c.mainRendererViewportRefreshTimers.length, 3);
  for (const [id, entry] of [...timers]) { timers.delete(id); entry.fn(); }
  assert.equal(c.mainRendererViewportRefreshTimers.length, 0);
  assert.deepEqual(refreshes.slice(-3), ['resize-99', 'resize-99', 'resize-99']);
  c.scheduleMainRendererViewportRefresh();
  assert.equal(refreshes.at(-1), 'sync');
  assert.equal(timers.size, 3);
});
