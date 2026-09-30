'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { createCookieStore, ENCRYPTED_COOKIE_PREFIX } = require('../cookie-storage');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-profile-entry-'));
const original = path.join(root, 'Mineradio');
const remix = path.join(root, 'Mineradio Remix Dev');
fs.mkdirSync(original);
fs.mkdirSync(remix);
const token = 'isolated-original-token-fixture';
fs.writeFileSync(path.join(original, '.qishui-token'), token);
fs.writeFileSync(path.join(original, 'current-fx-autosave.json'), JSON.stringify({ lyricScale: 1.2 }));
app.setPath('appData', root);
app.setPath('userData', remix);
app.setPath('sessionData', path.join(root, 'session'));
process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Remix Dev Profile QA ' + process.pid;
process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
process.env.MINERADIO_STARTUP_QA_USER_DATA = remix;
// Main-entry migration can retire old resource-directory credentials. Never
// run that migration against a checkout containing real legacy credentials.
for (const name of ['.cookie', '.qq-cookie', '.kugou-cookie', '.qishui-cookie', '.qishui-token', '.kugou-vip-evidence.json']) {
  assert(!fs.existsSync(path.join(__dirname, '..', name)), 'legacy workspace credentials must be absent in this isolated check');
}
require('../desktop/main');
let restarted = false;
ipcMain.removeHandler('mineradio-restart-app');
ipcMain.handle('mineradio-restart-app', () => { restarted = true; return { ok: true }; });
const deadline = Date.now() + 30000;
async function run() {
  while (Date.now() < deadline) {
    const win = BrowserWindow.getAllWindows().find(value => /^http:\/\/127\.0\.0\.1:/.test(value.webContents.getURL()));
    if (win && !win.webContents.isLoading()) {
      const ready = await win.webContents.executeJavaScript('typeof openOriginalProfileImport === "function" && typeof onUserBtnClick === "function"');
      if (ready) {
        const result = await win.webContents.executeJavaScript(`(async () => {
          document.querySelectorAll('.modal-mask.show').forEach(el => el.classList.remove('show'));
          onUserBtnClick();
          const button = document.querySelector('.original-profile-link');
          const visibleUntil = Date.now() + 5000;
          while (getComputedStyle(button).visibility === 'hidden' && Date.now() < visibleUntil) await new Promise(r => setTimeout(r, 25));
          const style = getComputedStyle(button);
          const visible = !button.hidden && !button.closest('#login-auth-drawer') && style.display !== 'none' && style.visibility !== 'hidden' && button.getBoundingClientRect().height > 0;
          const info = await desktopWindow.inspectOriginalProfile();
          button.click();
          const until = Date.now() + 5000;
          while (!document.getElementById('original-profile-modal').classList.contains('show') && Date.now() < until) await new Promise(r => setTimeout(r, 25));
          const opened = document.getElementById('original-profile-modal').classList.contains('show');
          await confirmOriginalProfileImport();
          return { visible, opened, supported: info.supported, available: info.available, description: document.getElementById('original-profile-description').textContent };
        })()`);
        for (const key of ['visible', 'opened', 'supported', 'available']) assert.equal(result[key], true, key);
        assert(restarted, 'the import confirmation requests an application restart');
        assert.equal(createCookieStore(path.join(remix, '.qishui-token')).read(), token);
        assert(fs.readFileSync(path.join(remix, '.qishui-token'), 'utf8').startsWith(ENCRYPTED_COOKIE_PREFIX));
        assert.equal(fs.readFileSync(path.join(original, '.qishui-token'), 'utf8'), token);
        assert.equal(JSON.parse(fs.readFileSync(path.join(remix, 'current-fx-autosave.json'), 'utf8')).lyricScale, 1.2);
        assert.equal(JSON.parse(fs.readFileSync(path.join(original, 'current-fx-autosave.json'), 'utf8')).lyricScale, 1.2);
        console.log('MINERADIO_PROFILE_ENTRY_SMOKE:' + JSON.stringify({ ok: true, result }));
        app.exit(0); return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Original-profile entry startup timed out');
}
app.whenReady().then(run).catch(error => { console.error(error.stack || error); app.exit(1); });
process.on('exit', () => {
  if (path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('mineradio-profile-entry-')) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
});
