'use strict';
// Run the real Mineradio player in a throwaway profile and execute a page
// script against it. Never touches the user's installed app or real data.
//
//   node_modules/electron/dist/electron.exe scripts/qa/isolated-electron.js \
//     --page probe.js [--shot out.png] [--size 1280x820] [--visible] [--settle 600]
//
// The page script is evaluated in the renderer (it may be an async IIFE) and
// its JSON-serialisable result is printed as one line: "QA_RESULT {...}".
// Lessons this encodes (each cost real debugging time):
// - webContents.executeJavaScript waits for the page to stop loading, which
//   can take very long; mainFrame.executeJavaScript runs immediately.
// - A hidden QA window's capturePage() can return a stale frame: use
//   --visible for screenshots (a muted window briefly appears).
// - Windows pauses animation frames for occluded windows; disabled here.
// - Google Fonts can hang offline/blocked networks and keep the page loading.
// - First-run guides and the splash cover the UI; both are skipped.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

function arg(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith('--') ? true : value;
}

const root = path.resolve(__dirname, '..', '..');
const pageFile = arg('page', '');
if (!pageFile || !fs.existsSync(pageFile)) {
  console.error('QA_ERROR --page <script.js> is required');
  process.exit(2);
}
const shot = arg('shot', '');
const [width, height] = String(arg('size', '1280x820')).split('x').map(Number);
const visible = arg('visible', false) === true;
const settleMs = Number(arg('settle', 600)) || 0;
const timeoutMs = Number(arg('timeout', 60000)) || 60000;

app.commandLine.appendSwitch('mute-audio');
// Chromium keeps session files locked until the process is gone, so a run
// cannot always delete its own profile; sweep ones older than an hour.
for (const name of fs.readdirSync(os.tmpdir())) {
  if (!/^mineradio-qa-/.test(name)) continue;
  const dir = path.join(os.tmpdir(), name);
  try { if (Date.now() - fs.statSync(dir).mtimeMs > 3600000) fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-qa-'));
const runtimeName = 'Mineradio QA ' + process.pid;
const userData = path.join(temp, runtimeName);
fs.mkdirSync(userData);
fs.writeFileSync(path.join(userData, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(temp, 'cache') }));
fs.writeFileSync(path.join(userData, 'onboarding-state.json'), JSON.stringify({ visual: true, login: true }));
app.setPath('appData', temp);
app.setPath('userData', userData);
app.setPath('sessionData', path.join(temp, 'session'));
process.env.MINERADIO_RUNTIME_NAME = runtimeName;
process.env.MINERADIO_STARTUP_QA_USER_DATA = userData;
if (!visible) process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';

process.on('exit', () => { try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) {} });
app.on('browser-window-created', (_event, win) => {
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] },
    (_details, callback) => callback({ cancel: true }));
});

require(path.join(root, 'desktop', 'main'));
require(path.join(root, 'tests', 'helpers', 'electron-frames')).keepTestWindowFramesRunning(app);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function stopQaWallpaper(win) {
  if (!win || win.isDestroyed()) return;
  // app.exit bypasses before-quit. Close only this throwaway profile's native
  // popout, otherwise its Web process/cache can break the next isolated run.
  await Promise.race([
    win.webContents.mainFrame.executeJavaScript(`(async () => {
      const api = window.desktopWindow;
      if (api && typeof api.stopWallpaperEngineScene === 'function') {
        await api.stopWallpaperEngineScene({});
      }
    })()`).catch(() => {}),
    wait(8000),
  ]);
}
setTimeout(async () => {
  console.log('QA_RESULT ' + JSON.stringify({ error: 'timeout' }));
  await stopQaWallpaper(BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL())));
  app.exit(3);
}, timeoutMs).unref();

app.whenReady().then(async () => {
  for (;;) {
    const win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
    const ready = win && await win.webContents.mainFrame
      .executeJavaScript('typeof dismissSplash === "function" && typeof playQueueAt === "function" && document.readyState !== "loading"')
      .catch(() => false);
    if (ready) {
      if (width && height) win.setSize(width, height);
      await win.webContents.mainFrame.executeJavaScript('try { dismissSplash({ instant: true }); } catch (e) {} true');
      await wait(1500);
      let result;
      try {
        result = await win.webContents.mainFrame.executeJavaScript(fs.readFileSync(pageFile, 'utf8'));
      } catch (error) {
        result = { error: String(error && error.message || error) };
      }
      if (shot) {
        await wait(settleMs);
        fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
      }
      console.log('QA_RESULT ' + JSON.stringify(result === undefined ? null : result));
      await stopQaWallpaper(win);
      app.exit(0);
      return;
    }
    await wait(300);
  }
}).catch(error => { console.log('QA_RESULT ' + JSON.stringify({ error: String(error) })); app.exit(1); });
