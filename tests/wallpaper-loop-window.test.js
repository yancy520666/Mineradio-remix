'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { WallpaperLoopWindow } = require('../desktop/wallpaper-loop-window');
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const win = new EventEmitter();
  Object.assign(win, { fullscreen: false, maximized: false, destroyed: false,
    bounds: { x: -1350, y: 120, width: 1100, height: 700 }, normal: { x: -1300, y: 180, width: 1000, height: 600 },
    isDestroyed() { return this.destroyed; }, isFullScreen() { return this.fullscreen; },
    isMaximized() { return this.maximized; }, getBounds() { return this.bounds; }, getNormalBounds() { return this.normal; } });
  let enter, leave, applied = 0;
  const manager = new WallpaperLoopWindow({ timeout: 100,
    enter: () => { enter = () => { win.fullscreen = true; win.bounds = { x: -1920, y: 0, width: 1920, height: 1080 }; win.emit('enter-full-screen'); }; },
    exit: () => { leave = () => { win.fullscreen = false; win.emit('leave-full-screen'); }; },
    apply: (w, snapshot) => { applied++; w.bounds = { ...snapshot.bounds }; w.maximized = snapshot.maximized; } });
  win.on('leave-full-screen', () => {
    const record = manager.current(win);
    setImmediate(() => manager.restoreOnLeave(win, record));
  });
  return { win, manager, enter: () => enter(), leave: () => leave(), applied: () => applied };
}

test('capture waits for native entry, then restores the exact original size and monitor position', async () => {
  const s = setup(), before = { ...s.win.bounds };
  let finished = false;
  const entering = s.manager.begin(s.win).then(result => { finished = true; return result; });
  await settle(); assert.equal(finished, false);
  s.enter(); const session = await entering;
  const ending = s.manager.end(s.win, session.token); await settle();
  assert.equal(s.applied(), 0);
  s.leave(); await ending;
  assert.deepEqual(s.win.bounds, before); assert.equal(s.applied(), 1);
  await s.manager.end(s.win, session.token); assert.equal(s.applied(), 1);
});

test('maximize state is retained and a stale token cannot restore a newer recording', async () => {
  const s = setup(); s.win.maximized = true;
  const entering = s.manager.begin(s.win); await settle(); s.enter(); const first = await entering;
  const ending = s.manager.end(s.win, first.token); await settle(); s.leave(); await ending;
  assert.deepEqual(s.win.bounds, s.win.normal); assert.equal(s.win.maximized, true);
  const next = s.manager.begin(s.win); await settle(); s.enter(); const second = await next;
  await s.manager.end(s.win, first.token);
  assert.equal(s.win.fullscreen, true); assert.equal(s.manager.current(s.win).token, second.token);
  const done = s.manager.end(s.win, second.token); await settle(); s.leave(); await done;
});

test('closing the window during entry rejects without keeping native event listeners', async () => {
  const s = setup(); const entry = s.manager.begin(s.win);
  await settle(); s.win.destroyed = true; s.win.emit('closed');
  await assert.rejects(entry, /WINDOW_CLOSED/);
  assert.equal(s.manager.current(s.win), undefined);
  assert.equal(s.win.listenerCount('enter-full-screen'), 0);
  assert.equal(s.win.listenerCount('closed'), 0);
});

test('restoration clears logical fullscreen even when Windows has already cleared its native flag', async () => {
  const s = setup(), before = { ...s.win.bounds }; let logicalFullscreen = false;
  s.manager.isFullscreen = win => win.fullscreen || logicalFullscreen;
  s.manager.exit = () => { logicalFullscreen = false; };
  const entering = s.manager.begin(s.win); await settle(); s.enter(); const session = await entering;
  s.win.fullscreen = false; logicalFullscreen = true;
  await s.manager.end(s.win, session.token);
  assert.equal(logicalFullscreen, false); assert.deepEqual(s.win.bounds, before);
});
