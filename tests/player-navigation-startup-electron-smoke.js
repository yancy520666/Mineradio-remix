'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.argv.includes('--child')) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-navigation-startup-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const result = require('node:child_process').spawnSync(require('electron'), [__filename, '--child', temp], {
      env, cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 55000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const evidence = result.stdout.split('\n').find(line => line.startsWith('PLAYER_NAVIGATION_STARTUP:'));
    assert(evidence, result.stdout); console.log(evidence);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow } = require('electron');
  const temp = process.argv[process.argv.indexOf('--child') + 1];
  const user = path.join(temp, 'user'); fs.mkdirSync(user);
  app.setPath('appData', temp);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Navigation Startup QA';
  process.env.MINERADIO_STARTUP_QA_USER_DATA = user;
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  app.commandLine.appendSwitch('mute-audio');
  fs.writeFileSync(path.join(user, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(temp, 'cache') }));
  fs.writeFileSync(path.join(user, 'onboarding-state.json'), JSON.stringify({ visual: true, login: true }));
  fs.writeFileSync(path.join(user, 'current-fx-autosave.json'), JSON.stringify({
    preset: 2, visualPresetSchema: 'skull-preset-v2', currentAutosaveSchema: 'current-fx-autosave-v2',
    autosaveUser: true, autosavedAt: Date.now(),
  }));
  app.on('browser-window-created', (_event, win) => {
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] },
      (_details, callback) => callback({ cancel: true }));
  });
  require('../desktop/main');
  require('./helpers/electron-frames').keepTestWindowFramesRunning(app);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  setTimeout(() => { console.error('player smoke timed out'); app.exit(2); }, 45000).unref();
  app.whenReady().then(async () => {
    let win;
    async function waitReady() {
      for (let i = 0; i < 120; i++) {
        win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
        if (win && await win.webContents.mainFrame.executeJavaScript('typeof switchPlaybackVisualToEmily === "function" && typeof startupLoginStatusPromise !== "undefined" && document.readyState !== "loading"').catch(() => false)) return;
        await wait(100);
      }
      throw Error('player did not initialize');
    }
    await waitReady();
    const evaluate = script => win.webContents.mainFrame.executeJavaScript(script);
    const startup = await evaluate('(async () => { await startupLoginStatusPromise; dismissSplash({instant:true}); return {preset:fx.preset, playbackPreset:playbackVisualPreset, queue:playQueue.length}; })()');
    assert.equal(startup.queue, 0); assert.equal(startup.preset, 2); assert.equal(startup.playbackPreset, 2);
    const mouse = await evaluate(`(() => {
      return [0,1,2,3,4].map(button => ({button, cancelled: ['mousedown','mouseup','auxclick'].map(type => {
        const event = new MouseEvent(type, {button, bubbles:true, cancelable:true});
        document.body.dispatchEvent(event); return event.defaultPrevented;
      })}));
    })()`);
    for (const item of mouse) assert(item.cancelled.every(value => value === (item.button >= 3)), JSON.stringify(item));
    for (const command of ['browser-backward', 'browser-forward', 'media-play-pause']) {
      let cancelled = false;
      win.emit('app-command', { preventDefault() { cancelled = true; } }, command);
      assert.equal(cancelled, command.startsWith('browser-'));
    }
    await evaluate('history.pushState({}, "", "#navigation-qa"); true');
    const url = win.webContents.getURL();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Left', modifiers: ['alt'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Left', modifiers: ['alt'] });
    await wait(200); assert.equal(win.webContents.getURL(), url);
    await evaluate('setPreset(1, {silent:true, skipTransition:true}); saveCurrentFxAutosavePatch({preset:1}, {user:true, syncDisk:true, reason:"preset"}); true');
    assert.equal(JSON.parse(fs.readFileSync(path.join(user, 'current-fx-autosave.json'))).preset, 1);
    const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded; await waitReady();
    const restarted = await evaluate('(async () => { await startupLoginStatusPromise; dismissSplash({instant:true}); const preset = fx.preset; switchPlaybackVisualToEmily(); return {preset, playbackPreset:fx.preset}; })()');
    assert.equal(restarted.preset, 1); assert.equal(restarted.playbackPreset, 1);
    console.log('PLAYER_NAVIGATION_STARTUP:' + JSON.stringify({ startup, mouse, altBackBlocked:true, restarted }));
    app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
