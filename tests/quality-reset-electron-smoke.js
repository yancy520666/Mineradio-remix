'use strict';

// Upgrade path: a saved non-ultra tier the user never picked (2.4.0 default
// "low", 2.4.1 GPU pick) becomes ultra once and stays ultra after restarts; a
// tier chosen afterwards is kept. Runs in a disposable temp profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-quality-reset-'));
app.setPath('userData', userData);
// Windows are reopened one after another; closing one must not quit the app.
app.on('window-all-closed', () => {});
process.on('exit', () => {
  const target = path.resolve(userData);
  if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('mineradio-quality-reset-')) {
    try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) { }
  }
});
async function openRenderer() {
  const win = new BrowserWindow({
    show: false, width: 1280, height: 720, paintWhenInitiallyHidden: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadFile(path.join(root, 'public', 'index.html'));
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 20000;
    function ready() {
      if (typeof fx !== 'undefined' && typeof saveLyricLayout === 'function' && window.MineradioSonicPerformance &&
        typeof setPerformanceQualityMode === 'function') return setTimeout(resolve, 1500);
      if (Date.now() >= deadline) return reject(new Error('Renderer did not initialize'));
      setTimeout(ready, 50);
    }
    ready();
  })`);
  return win;
}
const read = win => win.webContents.executeJavaScript(`({ quality: fx.performanceQuality,
  prefs: MineradioSonicPerformance.snapshot().preferences })`);
async function main() {
  // A 2.4.1 profile: saved "medium" from the GPU pick, Sonic preferences
  // without any manual tier choice and without the one-time reset.
  let win = await openRenderer();
  await win.webContents.executeJavaScript(`
    fx.performanceQuality = 'balanced';
    saveLyricLayout({ user: true, reason: 'qa-upgrade-fixture' });
    localStorage.setItem('mineradio-sonic-performance-v1', JSON.stringify({ enabled: false, manualQuality: false, dismissed: false }));
  `);
  win.destroy();
  win = await openRenderer();
  const upgraded = await read(win);
  assert.equal(upgraded.quality, 'ultra', 'an automatic tier was not reset');
  assert.equal(upgraded.prefs.qualityReset, true);
  assert.equal(upgraded.prefs.manualQuality, false, 'the reset must not count as a manual choice');
  win.destroy();
  win = await openRenderer();
  const restarted = await read(win);
  assert.equal(restarted.quality, 'ultra', 'the old tier came back after a restart');
  await win.webContents.executeJavaScript(`setPerformanceQualityMode('balanced', true)`);
  win.destroy();
  win = await openRenderer();
  const chosen = await read(win);
  assert.equal(chosen.quality, 'balanced', 'a tier chosen after the reset must be kept');
  assert.equal(chosen.prefs.manualQuality, true);
  win.destroy();
  console.log('MINERADIO_QUALITY_RESET_SMOKE:' + JSON.stringify({ ok: true, upgraded, restarted, chosen }));
  app.exit(0);
}
app.whenReady().then(main).catch(error => {
  console.error(error.stack || error);
  app.exit(1);
});
