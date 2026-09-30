'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');
const baseline = process.argv.includes('--baseline');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-slider-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
process.on('exit', () => {
  if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mineradio-slider-')) {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
  }
});

// Diagnostic baseline uses the committed renderer, without changing the checkout.
const originals = new Map();
if (baseline) {
  for (const name of execFileSync('git', ['diff', '--name-only', '--', 'public'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)) {
    originals.set(path.resolve(root, name), execFileSync('git', ['show', 'HEAD:' + name], { cwd: root }));
  }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const file = path.resolve(publicRoot, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(originals.get(file) || fs.readFileSync(file));
});

async function exercise(fixtureBase64) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const counts = { uniforms: 0, saves: 0, rebuilds: 0, coverBuilds: 0, videoLoads: 0, blobReads: 0 };
  const wrap = (name, counter) => {
    const fn = window[name];
    window[name] = function () {
      counts[counter]++;
      return fn.apply(this, arguments);
    };
  };
  const blob = new Blob([Uint8Array.from(atob(fixtureBase64), character => character.charCodeAt(0))], { type: 'video/webm' });
  getCustomBackgroundBlob = async () => { counts.blobReads++; await sleep(10); return blob; };
  fx.backgroundMedia = { type: 'video', id: 'slider-qa-video' };
  fx.backgroundAlbumCover = false;
  document.body.classList.remove('wallpaper-engine-active');
  applyCustomBackground();
  const video = document.getElementById('custom-bg-video');
  const deadline = Date.now() + 5000;
  while (video.readyState < 2) {
    if (Date.now() > deadline) throw new Error('Fixture video failed to decode: ' + JSON.stringify({ bytes: blob.size,
      error: video.error && video.error.message, src: video.getAttribute('src'), reads: counts.blobReads }));
    await sleep(20);
  }
  const initialSource = video.getAttribute('src');
  const nativeLoad = video.load.bind(video);
  video.load = () => { counts.videoLoads++; return nativeLoad(); };
  wrap('syncFxUniforms', 'uniforms');
  wrap('saveLyricLayout', 'saves');
  wrap('refreshStageLyricDisplayMode', 'rebuilds');
  wrap('applyCoverParticleResolution', 'coverBuilds');
  clearStageLyrics();
  fx.particleLyrics = true;
  fx.lyricDisplayMode = 'cinema';
  fx.lyricTranslationMode = 'multi';
  lyricsLines = Array.from({ length: 5 }, (_, index) => ({ t: index * 5, text: 'Slider fixture ' + index,
    translation: 'Translation ' + index, duration: 5, charCount: 16 }));
  lyricsTranslationLines = [];
  const state = beginCooperativeLyricMeshBuild(buildStageLyricDisplayPayload(0, { lightweightTrack: true }));
  let steps = 0;
  while (!stepCooperativeLyricMeshBuild(state, 1, 3)) { if (++steps > 2000) throw new Error('Fixture lyrics did not build'); }
  const mesh = finishCooperativeLyricMeshBuild(state);
  if (!mesh) throw new Error('Fixture lyrics missing');
  stageLyrics.current = mesh;
  stageLyrics.group.add(mesh);
  counts.blobReads = 0;
  saveLyricLayout({ user: true, force: true, reason: 'slider-qa-baseline' });
  const untouched = readCurrentFxAutosaveRaw().depth;
  counts.saves = 0;
  // An unrelated runtime value must not overwrite the stored value on a scoped save.
  fx.depth = untouched === 0.5 ? 0.6 : 0.5;
  const controls = [
    ['fx-lyriclineheight', 'lyricLineHeight', 1.67], ['fx-lyricscale', 'lyricScale', 1.23],
    ['fx-lyricglitchintensity', 'lyricGlitchIntensity', 0.52], ['fx-bgopacity', 'backgroundOpacity', 0.63],
    ['fx-bgzoom', 'backgroundMediaZoom', 1.73], ['fx-glassaberration', 'controlGlassChromaticOffset', 91]
  ];
  let inputCount = 0;
  for (let frame = 0; frame < 8; frame++) {
    for (let burst = 0; burst < 4; burst++) {
      for (const [id, , value] of controls) {
        const el = document.getElementById(id);
        el.value = String(value - (7 - frame) * 0.01);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        inputCount++;
      }
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    await sleep(20);
  }
  const dragging = { ...counts };
  const liveLineStep = mesh.userData.lyric.lineWorldStep;
  const expectedLineStep = lyricTrackLineStepWorld();
  const sameVideoSource = video.getAttribute('src') === initialSource;
  controls.forEach(([id]) => document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true })));
  await sleep(450);
  const saved = readCurrentFxAutosaveRaw();
  const finalValues = Object.fromEntries(controls.map(([, key]) => [key, fx[key]]));
  const savedValues = Object.fromEntries(controls.map(([, key]) => [key, saved[key]]));
  const restoredValues = Object.fromEntries(controls.map(([, key]) => [key, readSavedLyricLayout()[key]]));
  const settled = { ...counts };
  const videoDecoded = video.readyState >= 2;
  counts.coverBuilds = 0;
  const cover = document.getElementById('fx-coverres');
  for (let i = 0; i < 24; i++) {
    cover.value = String(0.75 + i * 0.01);
    cover.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const coverBuildsBeforeCommit = counts.coverBuilds;
  cover.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(220);
  const coverBuildsAfterCommit = counts.coverBuilds;
  const pending = {};
  counts.blobReads = 0;
  getCustomBackgroundBlob = id => { counts.blobReads++; return new Promise(resolve => { pending[id] = resolve; }); };
  fx.backgroundMedia = { type: 'video', id: 'pending-a' };
  applyCustomBackground();
  for (let i = 0; i < 16; i++) applyCustomBackground();
  fx.backgroundMedia = { type: 'video', id: 'pending-b' };
  applyCustomBackground();
  const pendingReads = counts.blobReads;
  pending['pending-b'](blob);
  await sleep(40);
  const latestSource = video.getAttribute('src');
  pending['pending-a'](blob);
  await sleep(30);
  const staleLoadIgnored = video.getAttribute('src') === latestSource && latestSource !== initialSource;
  fx.backgroundMedia = null;
  applyCustomBackground();
  const videoCleared = !video.getAttribute('src') && !customBgObjectUrl;
  return { inputCount, dragging, settled, sameVideoSource, videoDecoded,
    untouched, savedUntouched: saved.depth, finalValues, savedValues, restoredValues, liveLineStep, expectedLineStep,
    coverBuildsBeforeCommit, coverBuildsAfterCommit, pendingReads, staleLoadIgnored, videoCleared };
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const win = new BrowserWindow({ show: false, width: 1280, height: 720, paintWhenInitiallyHidden: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const end = Date.now() + 20000;
    function ready() {
      if (typeof fx !== 'undefined' && typeof bindFxPanel === 'function' && typeof renderer !== 'undefined' && renderer) return resolve();
      if (Date.now() > end) return reject(new Error('Renderer not ready'));
      setTimeout(ready, 50);
    } ready();
  })`);
  // Generated test pattern, 32x32 / 12 fps / 1 s, encoded as VP8 with ffmpeg.
  const fixtureBase64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'slider-video.webm')).toString('base64');
  const result = await win.webContents.executeJavaScript('(' + exercise.toString() + ')(' + JSON.stringify(fixtureBase64) + ')');
  console.log('MINERADIO_SLIDER_SMOKE:' + JSON.stringify({ baseline, result }));
  if (!baseline) {
    assert.equal(result.dragging.saves, 0, 'continuous inputs must not serialize settings');
    assert.equal(result.dragging.rebuilds, 0, 'continuous inputs must not repeatedly rebuild lyrics');
    assert(result.dragging.uniforms <= 10, 'burst inputs must coalesce to one preview per frame');
    assert.equal(result.dragging.videoLoads, 0, 'opacity/crop cannot reload playing video');
    assert.equal(result.dragging.blobReads, 0, 'opacity/crop cannot reread local video');
    assert.equal(result.sameVideoSource, true);
    assert.equal(result.videoDecoded, true);
    assert(Math.abs(result.liveLineStep - result.expectedLineStep) < 1e-10, 'line spacing must preview on the existing mesh');
    assert.equal(result.savedUntouched, result.untouched, 'scoped save cannot overwrite an unrelated runtime value');
    assert.deepEqual(result.savedValues, result.finalValues, 'multiple touched controls must all persist');
    assert.deepEqual(result.restoredValues, result.finalValues);
    assert.equal(result.settled.rebuilds, 0, 'layout and glitch uniforms must not rebuild glyphs on commit');
    assert.equal(result.coverBuildsBeforeCommit, 0);
    assert.equal(result.coverBuildsAfterCommit, 1);
    assert.equal(result.pendingReads, 2, 'pending local loads must survive appearance-only updates');
    assert.equal(result.staleLoadIgnored, true, 'old source completions cannot replace the latest video');
    assert.equal(result.videoCleared, true);
  }
  // A reload must restore the accumulated values even after unrelated runtime changes.
  await win.loadURL(win.webContents.getURL());
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const end = Date.now() + 20000;
    function ready() {
      if (typeof fx !== 'undefined' && typeof renderer !== 'undefined' && renderer) return resolve();
      if (Date.now() > end) return reject(new Error('Renderer reload not ready'));
      setTimeout(ready, 50);
    } ready();
  })`);
  if (!baseline) {
    const reloaded = await win.webContents.executeJavaScript('Object.fromEntries(' + JSON.stringify(Object.keys(result.finalValues)) + '.map(key => [key, fx[key]]))');
    assert.deepEqual(reloaded, result.finalValues);
    const storedDepth = await win.webContents.executeJavaScript('readCurrentFxAutosaveRaw().depth');
    assert.equal(storedDepth, result.untouched, 'pagehide without dirty inputs must preserve the stored snapshot');
  }
  win.destroy();
  server.close();
  app.exit(0);
}
app.whenReady().then(main).catch(error => { console.error(error.stack || error); server.close(); app.exit(1); });
