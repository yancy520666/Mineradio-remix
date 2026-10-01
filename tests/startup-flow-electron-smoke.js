'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
if (!process.argv.includes('--child')) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-startup-flow-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    for (const mode of ['first', 'restart']) {
      const result = spawnSync(require('electron'), [__filename, '--child', profile, mode], { cwd: root, env, encoding: 'utf8', timeout: 45000 });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
      const evidence = result.stdout.split('\n').find(line => line.startsWith('STARTUP_FLOW:'));
      assert(evidence, result.stdout + result.stderr);
      console.log(evidence);
    }
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow } = require('electron');
  const profile = process.argv[process.argv.indexOf('--child') + 1];
  const mode = process.argv[process.argv.indexOf('--child') + 2];
  const started = Date.now();
  app.setPath('appData', profile);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Startup Flow QA';
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  process.env.MINERADIO_KEEP_BACKGROUND_RENDERING = '1';
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  process.env.MINERADIO_STARTUP_QA_USER_DATA = path.join(profile, 'user');
  fs.mkdirSync(process.env.MINERADIO_STARTUP_QA_USER_DATA, { recursive: true });
  fs.writeFileSync(path.join(process.env.MINERADIO_STARTUP_QA_USER_DATA, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(profile, 'cache') }));
  let firstShowMs = null;
  app.on('browser-window-created', (_event, win) => {
    win.once('show', () => { firstShowMs = Date.now() - started; });
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] }, (_details, callback) => callback({ cancel: true }));
  });
  require('../desktop/main');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const deadline = Date.now() + 30000;
    let win, ready;
    while (Date.now() < deadline) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && /^http:\/\/127\.0\.0\.1:/.test(win.webContents.getURL())) {
        ready = await win.webContents.executeJavaScript('typeof startVisualGuide === "function" && typeof splashStartedAt !== "undefined" && splashStartedAt !== null && document.readyState !== "loading"').catch(() => false);
        if (ready) break;
      }
      await sleep(50);
    }
    assert(ready, 'renderer did not initialize');
    assert(win.isVisible(), 'a single launch must show the native window');
    assert(firstShowMs !== null, 'first launch must not require second-instance activation');
    const intro = await win.webContents.executeJavaScript('({started: splashStartedAt, age: performance.now() - splashStartedAt, pending: document.documentElement.classList.contains("splash-intro-pending"), ready: splashReadyToEnter})');
    assert(intro.started !== null && !intro.pending);
    if (intro.age < 5200) assert.equal(intro.ready, false, 'intro must not allow entry before the logo finishes');
    await sleep(Math.max(0, 5300 - intro.age));
    while (Date.now() < deadline && !await win.webContents.executeJavaScript('splashReadyToEnter')) await sleep(100);
    const logo = await win.webContents.executeJavaScript('(() => { const el = document.querySelector(".splash-word-radio"); return {ready: splashReadyToEnter, opacity: getComputedStyle(el).opacity, animation: getComputedStyle(el).animationName, playState: getComputedStyle(el).animationPlayState, animations: el.getAnimations().map(a => ({currentTime: a.currentTime, playState: a.playState})), classes: document.documentElement.className}; })()');
    assert(logo.ready);
    assert.equal(Number(logo.opacity), 1, 'complete logo must be visible before entry');
    const guides = await win.webContents.executeJavaScript(`(() => {
      const before = startupGuideWasSeen('visual');
      dismissSplash({instant: true});
      startVisualGuide({manual: ${mode === 'restart'}});
      return {before, active: visualGuideActive, seen: startupGuideWasSeen('visual')};
    })()`);
    assert.equal(guides.before, mode === 'restart');
    assert(guides.active && guides.seen, 'guide is recorded when displayed and remains manually accessible');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'user', 'onboarding-state.json'))).visual, true);
    console.log('STARTUP_FLOW:' + JSON.stringify({ mode, firstShowMs, fontsBlocked: true, introAgeMs: Math.round(intro.age), logo, guides }));
    app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
