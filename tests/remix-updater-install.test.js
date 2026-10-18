'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRemixUpdater } = require('../desktop/remix-updater');
async function fixture(options = {}) {
  const native = new EventEmitter();
  native.quitAndInstallCalled = false;
  native.checkForUpdates = async () => native.emit('update-available', { version: '2.4.3' });
  native.downloadUpdate = async () => ['fixture.exe'];
  const calls = [];
  native.quitAndInstall = (...args) => { calls.push(args); native.quitAndInstallCalled = true; };
  const updater = createRemixUpdater({ app: { getVersion: () => '2.4.2' }, enabled: true, loadUpdater: () => native, ...options });
  await updater.check(); await updater.download();
  return { native, updater, calls };
}

test('installer waits for shutdown preparation; duplicate clicks/checks/stale events cannot replace installing state', async () => {
  let finish;
  const { updater, native, calls } = await fixture({ beforeInstall: () => new Promise(resolve => { finish = resolve; }) });
  const install = updater.install();
  await Promise.resolve();
  assert.equal(updater.getState().status, 'installing');
  assert.equal(calls.length, 0);
  assert.equal(updater.install().status, 'installing');
  await updater.check(); await updater.download();
  native.emit('update-not-available'); native.emit('update-available', { version: '9.9.9' });
  native.emit('download-progress', { percent: 1 }); native.emit('update-downloaded', { version: '9.9.9' });
  assert.equal(updater.getState().status, 'installing');
  assert.equal(updater.getState().version, '2.4.3');
  finish(); assert.equal((await install).ok, true);
  assert.deepEqual(calls, [[true, true]]);
});

test('synchronous throw, emitted failure and asynchronous spawn failure preserve verified download and allow one retry', async () => {
  for (const kind of ['throw', 'event', 'async']) {
    let errors = 0;
    const { updater, native, calls } = await fixture({ onInstallError: () => errors++ });
    const good = native.quitAndInstall;
    native.quitAndInstall = () => {
      native.quitAndInstallCalled = true;
      if (kind === 'throw') throw new Error('EACCES fixture');
      if (kind === 'event') native.emit('error', new Error('EACCES fixture'));
      else setImmediate(() => native.emit('error', new Error('EACCES fixture')));
    };
    const result = updater.install();
    if (kind !== 'async') assert.equal(result.ok, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(errors, 1);
    assert.equal(updater.getState().status, 'downloaded');
    assert.match(updater.getState().error, /EACCES/);
    assert.equal(native.quitAndInstallCalled, false);
    native.quitAndInstall = good;
    assert.equal(updater.install().ok, true);
    updater.install(); assert.equal(calls.length, 1);
  }
});

test('failed preparation never launches, and an inconclusive restart timeout never unlocks a duplicate installer', async () => {
  const failed = await fixture({ beforeInstall: async () => { throw new Error('flush failed'); } });
  assert.equal((await failed.updater.install()).ok, false);
  assert.equal(failed.calls.length, 0);
  assert.equal(failed.updater.getState().status, 'downloaded');
  const timed = await fixture({ installTimeoutMs: 5 });
  timed.updater.install();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.match(timed.updater.getState().error, /UPDATE_RESTART_TIMEOUT/);
  assert.equal(timed.updater.getState().status, 'installing');
  timed.updater.install(); assert.equal(timed.calls.length, 1);
});

test('verified completion event does not make a still-pending or rejected download installable', async () => {
  const { updater, native } = await fixture();
  // Separate instance, with an event fired before the native promise rejects.
  native.downloadUpdate = async () => { native.emit('update-downloaded', { version: '2.4.3' }); throw new Error('late digest failure'); };
  const next = createRemixUpdater({ app: { getVersion: () => '2.4.2' }, enabled: true, loadUpdater: () => native });
  await next.check(); await next.download();
  assert.equal(next.getState().status, 'error');
  assert.equal(next.install().ok, false);
  assert.equal(updater.getState().status, 'downloaded');
});

test('renderer disables repeated install, shows errors and restores restart action after failed launch', async () => {
  const nodes = new Map();
  function node(id) { if (!nodes.has(id)) nodes.set(id, { classList: { toggle() {} }, textContent: '', disabled: false }); return nodes.get(id); }
  let resolveInstall, installs = 0;
  const context = vm.createContext({ URL, console, setTimeout, clearTimeout,
    updatePreviewState: { autoMode: true, status: 'downloaded', version: '2.4.3', currentVersion: '2.4.2', updateAvailable: true },
    window: { desktopWindow: { installRemixUpdate: () => { installs++; return new Promise(resolve => { resolveInstall = resolve; }); } } },
    document: { getElementById: node, querySelector: () => null, querySelectorAll: () => [] } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/modules/08-account/00-update-preview.js'), 'utf8'), context);
  context.renderUpdatePreviewPanel = () => context.syncUpdatePreviewStateClass();
  context.setUpdatePreviewVisible = () => {};
  const first = context.startUpdatePreviewDownload();
  await context.startUpdatePreviewDownload();
  assert.equal(installs, 1); assert.equal(node('update-primary-btn').disabled, true);
  assert.equal(node('update-btn-label').textContent, '正在重启…');
  resolveInstall({ ok: false, error: 'fixture launch failure' }); await first;
  assert.equal(context.updatePreviewState.status, 'downloaded');
  assert.equal(node('update-primary-btn').disabled, false);
  assert.match(node('update-footnote').textContent, /fixture launch failure/);
});

test('real main quit handlers block shutdown during preparation and preserve server/tray until successful quit', async () => {
  const source = fs.readFileSync(require.resolve('../desktop/main.js'), 'utf8');
  const start = source.indexOf('  prepareUpdateShutdown = ({ forInstall = false } = {}) => {');
  const end = source.lastIndexOf('\n}');
  assert(start > 0 && end > start);
  const app = new EventEmitter();
  let quits = 0, serverClosed = 0, trayDestroyed = 0, finishDesktop, guideCancels = 0, guideDisposals = 0;
  const cleanupOrder = [];
  app.quit = () => { quits++; };
  const noop = () => {};
  const context = vm.createContext({ console, Promise, AbortController, setTimeout, clearTimeout, app,
    appQuitting: false, appQuitCleanupComplete: false, appQuitCleanupPromise: null,
    updateInstallerLaunched: false, blockFailedUpdateQuit: false,
    virtualAudioSetupGuide: { cancel: () => { guideCancels++; return { ok: true }; }, dispose: () => guideDisposals++ },
    remixUpdater: { getState: () => ({ status: 'installing' }) },
    mainWindow: null, fullDesktopModeRuntime: { dispose: (reason) => {
      assert.equal(reason, 'app-before-quit'); cleanupOrder.push('detach-start');
      return new Promise(resolve => { finishDesktop = value => { cleanupOrder.push('detach-end'); resolve(value); }; });
    } },
    wallpaperLoopCache: { abortAll: async () => { cleanupOrder.push('abort-loops'); } },
    wallpaperEngineRuntime: { dispose: async () => { cleanupOrder.push('dispose-wallpaper'); return { ok: true }; } },
    playbackCheckpointStore: { flush: async () => {} },
    clearWallpaperEngineCaptureGrant: noop, wallpaperEngineLibrary: { dispose: noop },
    stopMemoryAutoTimer: noop, unregisterFullDesktopEscapeShortcut: noop, unregisterMineradioGlobalHotkeys: noop,
    closeDesktopLyricsWindow: noop, localServer: { close: () => serverClosed++ }, tray: { destroy: () => trayDestroyed++ },
  });
  vm.runInContext(source.slice(start, end), context);
  const pending = context.prepareUpdateShutdown();
  assert.equal(guideCancels, 1, 'shutdown cancels pre-handoff virtual driver preparation');
  let prevented = 0;
  app.emit('before-quit', { preventDefault: () => prevented++ });
  assert.equal(prevented, 1); assert.equal(quits, 0);
  assert.equal(serverClosed, 0); assert.equal(trayDestroyed, 0);
  assert.deepEqual(cleanupOrder, ['detach-start'], 'wallpaper must remain alive until HUD detach acknowledges');
  finishDesktop({ ok: true }); await pending;
  assert.equal(context.appQuitCleanupComplete, true);
  assert.deepEqual(cleanupOrder, ['detach-start', 'detach-end', 'abort-loops', 'dispose-wallpaper']);
  assert.equal(quits, 0, 'preparation must never quit ahead of installer launch');
  context.updateInstallerLaunched = true;
  app.emit('before-quit', { preventDefault: () => prevented++ });
  assert.equal(prevented, 1, 'native quit after preparation must not be delayed');
  context.blockFailedUpdateQuit = true;
  app.emit('before-quit', { preventDefault: () => prevented++ });
  assert.equal(prevented, 2, 'queued native quit is blocked if installer spawn failed');
  assert.equal(context.appQuitting, false);
  app.emit('will-quit');
  assert.equal(serverClosed, 1); assert.equal(trayDestroyed, 1);
  assert.equal(guideDisposals, 1, 'successful final quit disposes virtual driver guide listeners');

  // The same preparation path must also complete an ordinary user quit.
  context.remixUpdater.getState = () => ({ status: 'idle' });
  context.appQuitCleanupComplete = false; context.appQuitCleanupPromise = null;
  app.emit('before-quit', { preventDefault: () => prevented++ });
  assert.equal(guideCancels, 4, 'ordinary quit cancels the guide before and during shared cleanup');
  assert.equal(prevented, 3); assert.equal(quits, 0);
  finishDesktop({ ok: true }); await context.appQuitCleanupPromise;
  await Promise.resolve();
  assert.equal(quits, 1);
});

test('failed installer leaves reversible desktop and wallpaper runtimes usable for subsequent enable/load', async () => {
  const source = fs.readFileSync(require.resolve('../desktop/main.js'), 'utf8');
  assert.match(source, /return prepareUpdateShutdown\(\{ forInstall: true \}\)/);
  const start = source.indexOf('  prepareUpdateShutdown = ({ forInstall = false } = {}) => {');
  const calls = [];
  let guideCancels = 0;
  const desktop = {
    disposed: false,
    async disable() { calls.push('disable'); return { ok: true }; },
    async dispose() { this.disposed = true; calls.push('desktop-dispose'); return { ok: true }; },
    async enable() { if (this.disposed) throw new Error('FULL_DESKTOP_DISPOSED'); calls.push('enable'); return { ok: true }; },
  };
  const wallpaper = {
    disposed: false,
    async stop() { calls.push('stop'); return { ok: true, stopped: true, active: false }; },
    async dispose() { this.disposed = true; calls.push('wallpaper-dispose'); return { ok: true }; },
    async start() { if (this.disposed) throw new Error('WALLPAPER_ENGINE_DISPOSED'); calls.push('load'); return { ok: true }; },
  };
  const context = vm.createContext({ console, Promise, AbortController, setTimeout, clearTimeout, app: new EventEmitter(),
    appQuitting: false, appQuitCleanupComplete: false, appQuitCleanupPromise: null,
    updateInstallerLaunched: false, blockFailedUpdateQuit: false, mainWindow: null,
    virtualAudioSetupGuide: { cancel: () => { guideCancels++; return { ok: true }; }, dispose() {} },
    fullDesktopModeRuntime: desktop, wallpaperEngineRuntime: wallpaper,
    wallpaperLoopCache: { abortAll: async () => {} }, playbackCheckpointStore: { flush: async () => {} },
  });
  vm.runInContext(source.slice(start, source.lastIndexOf('\n}')), context);
  // Execute the real production recovery callback, including shutdown flag reset.
  const callback = source.slice(source.indexOf('  onInstallError: () => {') + '  onInstallError: '.length, source.indexOf('\n  enabled: process.platform'));
  const recover = vm.runInContext('(' + callback.trim().replace(/,$/, '') + ')', context);
  const { updater, native } = await fixture({
    beforeInstall: () => context.prepareUpdateShutdown({ forInstall: true }),
    onInstallError: recover,
  });
  context.remixUpdater = updater;
  native.quitAndInstall = () => { throw new Error('fixture installer launch failed'); };
  assert.equal((await updater.install()).ok, false);
  assert.equal(updater.getState().status, 'downloaded');
  assert.equal(context.appQuitting, false);
  assert.equal(context.appQuitCleanupComplete, false);
  assert.equal(context.appQuitCleanupPromise, null);
  assert.equal(guideCancels, 1, 'update shutdown cancels pre-handoff driver preparation');
  assert.deepEqual(calls, ['disable', 'stop']);
  assert.equal((await desktop.enable()).ok, true);
  assert.equal((await wallpaper.start()).ok, true);
  // An ordinary later exit retains permanent final disposal.
  await context.prepareUpdateShutdown();
  assert.equal(guideCancels, 2, 'a later ordinary shutdown also cancels the guide');
  assert.equal(desktop.disposed, true); assert.equal(wallpaper.disposed, true);
  assert.deepEqual(calls, ['disable', 'stop', 'enable', 'load', 'desktop-dispose', 'wallpaper-dispose']);
});

test('timed-out preparation cannot stop resumed wallpaper or overwrite a newer retry after delayed cache cleanup', async () => {
  const source = fs.readFileSync(require.resolve('../desktop/main.js'), 'utf8');
  const start = source.indexOf('  prepareUpdateShutdown = ({ forInstall = false } = {}) => {');
  let timeout, finishOldAbort, abortCalls = 0, wallpaperStops = 0, guideCancels = 0;
  const context = vm.createContext({ console, Promise, AbortController, clearTimeout: () => {},
    setTimeout: (callback, ms) => { if (ms === 15000) timeout = callback; return { unref() {} }; },
    app: new EventEmitter(), appQuitting: false, appQuitCleanupComplete: false, appQuitCleanupPromise: null,
    updateInstallerLaunched: false, blockFailedUpdateQuit: false, mainWindow: null,
    virtualAudioSetupGuide: { cancel: () => { guideCancels++; return { ok: true }; }, dispose() {} },
    fullDesktopModeRuntime: { disable: async () => ({ ok: true }) },
    wallpaperEngineRuntime: { stop: async () => { wallpaperStops++; return { ok: true, stopped: true }; } },
    wallpaperLoopCache: { abortAll: () => ++abortCalls === 1 ? new Promise(resolve => { finishOldAbort = resolve; }) : Promise.resolve() },
    playbackCheckpointStore: { flush: async () => {} },
  });
  vm.runInContext(source.slice(start, source.lastIndexOf('\n}')), context);
  const old = context.prepareUpdateShutdown({ forInstall: true });
  const failed = assert.rejects(old, /UPDATE_SHUTDOWN_TIMEOUT/);
  await new Promise(resolve => setImmediate(resolve));
  timeout(); await failed;
  assert.equal(wallpaperStops, 0);
  // The install failure callback releases these flags; the user can resume or retry.
  context.appQuitCleanupComplete = false; context.appQuitCleanupPromise = null;
  await context.prepareUpdateShutdown({ forInstall: true });
  assert.equal(guideCancels, 2, 'both timeout and retry shutdown attempts cancel driver preparation');
  assert.equal(wallpaperStops, 1);
  finishOldAbort(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(wallpaperStops, 1, 'obsolete cleanup must not stop the new session');
  assert.equal(context.appQuitCleanupComplete, true, 'obsolete cleanup cannot reset the newer attempt');
});

test('already-running native cleanup owns old sessions and desktop enable queues behind old disable', async () => {
  const { WallpaperEngineRuntime } = require('../desktop/wallpaper-engine-runtime');
  const { FullDesktopModeRuntime } = require('../desktop/full-desktop-mode-runtime');
  let finishClose, finishDisable;
  const old = { sessionId: 'old', launched: true }, resumed = { sessionId: 'resumed', launched: true };
  const wallpaper = Object.create(WallpaperEngineRuntime.prototype);
  wallpaper.active = old; wallpaper.pending = null; wallpaper.generation = 0;
  wallpaper._closeSession = session => { assert.equal(session, old); return new Promise(resolve => { finishClose = resolve; }); };
  const stopping = wallpaper.stop();
  wallpaper.active = resumed;
  finishClose(true); await stopping;
  assert.equal(wallpaper.active, resumed, 'late session close must not clear replacement session');
  assert.equal(resumed.stopping, undefined);
  const desktop = Object.create(FullDesktopModeRuntime.prototype);
  desktop.queue = Promise.resolve(); desktop.snapshot = null;
  desktop.abortNative = desktop.abortIconShapeProbe = desktop.requestIconShapeWatcherStop = () => {};
  const order = [];
  desktop.disableInternal = () => { order.push('disable'); return new Promise(resolve => { finishDisable = resolve; }); };
  const disabling = desktop.disable();
  const enabling = desktop.enqueue('enable', async () => { order.push('enable'); return { ok: true }; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['disable']);
  finishDisable({ ok: true }); await disabling; await enabling;
  assert.deepEqual(order, ['disable', 'enable']);
});
