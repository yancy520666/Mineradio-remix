'use strict';

// Real desktop main/preload/server, separate processes and PID-based QA ports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { app, BrowserWindow, session } = require('electron');
const root = path.resolve(__dirname, '..');
const child = process.argv.indexOf('--child');

if (child < 0) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-quality-reset-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let exitCode = 0;
  try {
    const results = [];
    for (const mode of ['seed', 'upgrade', 'restart', 'choose', 'chosen']) {
      const run = spawnSync(process.execPath, [__filename, '--child', profile, mode], {
        cwd: root, env, encoding: 'utf8', timeout: 45000, windowsHide: true,
      });
      assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
      const line = run.stdout.split('\n').find(row => row.startsWith('QUALITY_RESET_DESKTOP:'));
      assert(line, 'missing real desktop evidence');
      const result = JSON.parse(line.slice('QUALITY_RESET_DESKTOP:'.length));
      results.push(result);
      if (mode === 'seed') fs.unlinkSync(path.join(profile, 'user', 'sonic-performance-preferences.json'));
    }
    assert(new Set(results.map(row => row.origin)).size > 1, 'must test different desktop origins');
    console.log('MINERADIO_QUALITY_RESET_SMOKE:' + JSON.stringify({ ok: true, results }));
  } catch (error) { console.error(error.stack); exitCode = 1; }
  finally {
    assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
    assert(path.basename(profile).startsWith('mineradio-quality-reset-'));
    fs.rmSync(profile, { recursive: true, force: true });
  }
  app.exit(exitCode);
} else {
  const profile = process.argv[child + 1], mode = process.argv[child + 2];
  app.setPath('appData', profile);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Quality Reset QA';
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  process.env.MINERADIO_STARTUP_QA_USER_DATA = path.join(profile, 'user');
  app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] },
      (_details, callback) => callback({ cancel: true }));
  });
  require('../desktop/main');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    let win, ready;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
      if (win) {
        ready = await win.webContents.executeJavaScript(`typeof setPerformanceQualityMode === 'function' &&
          !!window.MineradioSonicPerformance && MineradioSonicPerformance.snapshot().preferences.qualityReset`).catch(() => false);
        if (ready) break;
      }
      await sleep(100);
    }
    assert(ready, 'desktop did not initialize and finish migration');
    if (mode === 'seed') {
      await win.webContents.executeJavaScript(`setPerformanceQualityMode('balanced', true);
        saveLyricLayout({ user: true, syncDisk: true, reason: 'performanceQuality' });
        localStorage.setItem('mineradio-sonic-performance-v1', JSON.stringify({ enabled: false, manualQuality: false, dismissed: false }));`);
    }
    if (mode === 'choose') {
      await win.webContents.executeJavaScript(`setPerformanceQualityMode('balanced', true);
        MineradioSonicPerformance.setEnabled(false);
        saveLyricLayout({ user: true, syncDisk: true, reason: 'performanceQuality' });`);
    }
    const state = await win.webContents.executeJavaScript(`({ quality: fx.performanceQuality,
      prefs: MineradioSonicPerformance.snapshot().preferences, origin: location.origin })`);
    const disk = JSON.parse(fs.readFileSync(path.join(profile, 'user', 'current-fx-autosave.json'), 'utf8'));
    if (mode === 'upgrade' || mode === 'restart') {
      assert.equal(state.quality, 'ultra');
      assert.equal(state.prefs.manualQuality, false);
      assert.equal(state.prefs.qualityReset, true);
    } else assert.equal(state.quality, 'balanced');
    assert.equal(disk.performanceQuality, state.quality, 'the durable tier must match the renderer');
    if (mode === 'choose' || mode === 'chosen') {
      assert.equal(state.prefs.manualQuality, true);
      assert.equal(state.prefs.enabled, false);
      assert.equal(state.prefs.dismissed, true);
    }
    if (mode !== 'seed') {
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'user', 'sonic-performance-preferences.json'), 'utf8'));
      assert.equal(saved.qualityReset, true);
      assert.equal(saved.manualQuality, state.prefs.manualQuality);
      assert.equal(saved.enabled, state.prefs.enabled);
    }
    session.defaultSession.flushStorageData();
    console.log('QUALITY_RESET_DESKTOP:' + JSON.stringify({ mode, ...state, diskQuality: disk.performanceQuality }));
    app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
