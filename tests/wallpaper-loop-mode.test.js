'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/07-fx/03b-wallpaper-engine-loop.js'), 'utf8');
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const lookup = defer(), stop = defer(), storage = new Map(); let loaded = 0;
  const video = { set src(value) { this.lastSrc = value; }, load() { loaded++; } };
  const item = { id: 'a'.repeat(24), projectType: 'scene', enginePlayable: true };
  const api = { wallpaperEngineLoopCache: () => lookup.promise };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Date,
    window: { addEventListener() {} }, document: { getElementById: id => id === 'wallpaper-engine-video' ? video : null },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    wallpaperEngineSelection: { active: true, id: item.id, kind: 'engine' }, wallpaperEngineLayerToken: 0,
    wallpaperEngineDesktopApi: () => api, wallpaperEngineProjectById: () => item,
    stopWallpaperEngineNativeSession: () => stop.promise,
    cancelWallpaperEngineSwitchTimer() {}, restoreOriginalBackgroundAfterWallpaperEngine() {},
    clearWallpaperEngineLayerMedia() {}, saveWallpaperEngineSelection() {}, flushWallpaperEngineVisualSettings() {},
    applyWallpaperEngineBackground() {}, showToast() {}, renderWallpaperEngineLibrary() {},
  });
  vm.runInContext(source, c);
  c.setWallpaperEnginePlaybackMode('loop');
  return { c, item, lookup, stop, storage, video, loaded: () => loaded };
}
test('late cached response cannot play after the user switches back to native', async () => {
  const s = setup(); s.c.startWallpaperEngineLoopBackground(s.item);
  s.c.setWallpaperEnginePlaybackMode('native');
  s.lookup.resolve({ ok: true, cached: true, url: 'mineradio-wallpaper://loop/old' });
  await settle(); await settle();
  assert.equal(s.loaded(), 0); assert.equal(s.c.wallpaperEnginePlaybackMode, 'native');
  assert.equal(s.storage.get(s.c.WALLPAPER_ENGINE_MODE_KEY), 'native');
});
test('changing wallpaper while native teardown waits discards the old cached video', async () => {
  const s = setup(); s.c.startWallpaperEngineLoopBackground(s.item);
  s.lookup.resolve({ ok: true, cached: true, url: 'mineradio-wallpaper://loop/old' });
  await settle(); s.c.wallpaperEngineSelection.id = 'b'.repeat(24);
  s.stop.resolve({ ok: true }); await settle();
  assert.equal(s.loaded(), 0); assert.equal(s.c.wallpaperEngineSelection.kind, 'engine');
});
test('cached playback closes the native instance before loading a looping muted video', async () => {
  const s = setup(); s.c.startWallpaperEngineLoopBackground(s.item);
  s.lookup.resolve({ ok: true, cached: true, url: 'mineradio-wallpaper://loop/current' });
  await settle(); assert.equal(s.loaded(), 0);
  s.stop.resolve({ ok: true }); await settle();
  assert.equal(s.loaded(), 1); assert.equal(s.c.wallpaperEngineSelection.kind, 'loop');
  assert.equal(s.video.lastSrc, 'mineradio-wallpaper://loop/current');
  assert.equal(s.video.loop, true); assert.equal(s.video.muted, true);
});

test('desktop visibility pauses and resumes a cached loop despite stale page visibility', () => {
  const s = setup(); let visible = true, played = 0;
  s.c.wallpaperEngineDesktopHostIsVisible = () => visible;
  s.c.cancelWallpaperEngineVideoRetry = () => {};
  s.c.requestWallpaperEngineVideoPlayback = (video, item, kind) => { assert.equal(kind, 'loop'); played++; video.paused = false; };
  s.video.getAttribute = () => 'mineradio-wallpaper://loop/current';
  s.video.readyState = 2; s.video.paused = false; s.video.pause = () => { s.video.paused = true; };
  s.c.document.hidden = true; s.c.wallpaperEngineSelection.kind = 'loop';
  visible = false; s.c.syncWallpaperEngineLoopVisibility(); assert.equal(s.video.paused, true);
  visible = true; s.c.syncWallpaperEngineLoopVisibility(); assert.equal(played, 1);
  s.c.syncWallpaperEngineLoopVisibility(); assert.equal(played, 1);
});

test('failed native recording source falls back without routing into a second loop job', () => {
  const s = setup(), library = fs.readFileSync(path.join(__dirname, '../public/js/modules/07-fx/03-wallpaper-engine-library.js'), 'utf8');
  vm.runInContext(library.slice(library.indexOf('function wallpaperEngineLayerFailed('), library.indexOf('function applyWallpaperEngineBackground(')), s.c);
  let fallback;
  Object.assign(s.c, { wallpaperEngineRuntimeError: 'native failed', wallpaperEngineNativeSessionId: '',
    wallpaperEngineHostRecoveryInFlight: false, wallpaperLoopJob: { item: s.item },
    cancelWallpaperEngineFirstFrameWait() {}, stopWallpaperEngineCaptureStream() {}, cancelWallpaperEngineHostRecovery() {},
    applyWallpaperEngineBackground: (item, quiet, nativeOnly) => { fallback = nativeOnly; } });
  s.c.wallpaperEngineLayerFailed({ ...s.item, hasPreview: true }, 'engine', 0);
  assert.equal(fallback, true); assert.equal(s.c.wallpaperEngineSelection.kind, 'preview');
});

test('native session restart during recording aborts instead of caching a frozen frame', async () => {
  const s = setup(); let draws = 0;
  const track = { readyState: 'live', stop() {} };
  const stream = { getVideoTracks: () => [track] };
  const source = { videoWidth: 1280, videoHeight: 720, srcObject: stream, dataset: { wallpaperEngineSession: 'c'.repeat(24) } };
  const recorder = { state: 'inactive', start() { this.state = 'recording'; },
    stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); } };
  s.c.MediaRecorder = Object.assign(function () { return recorder; }, { isTypeSupported: () => true });
  s.c.document.createElement = () => ({ getContext: () => ({ drawImage() { draws++; } }),
    captureStream: () => ({ getTracks: () => [] }) });
  s.c.document.body = { classList: { contains: () => true } };
  s.c.wallpaperEngineNativeSessionId = 'c'.repeat(24);
  s.c.wallpaperEngineDesktopHostIsVisible = () => true;
  s.c.wallpaperLoopStatus = () => {};
  const job = s.c.wallpaperLoopJob = { item: s.item, cancelled: false, jobId: 'j', recording: true };
  s.c.wallpaperEngineSelection.kind = 'engine';
  const recording = s.c.recordWallpaperLoop(job, source, { width: 1920, height: 1080, fps: 30, duration: 20 });
  assert.equal(draws, 1);
  // A resize restarts the native session and the sampler drops its stream.
  s.c.wallpaperEngineNativeSessionId = 'd'.repeat(24); source.srcObject = null;
  await assert.rejects(recording, /LOOP_RECORD_INTERRUPTED/);
  assert.equal(draws, 1);
});
