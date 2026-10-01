'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const PREFERENCE_KEYS = [
  'apex-player-volume', 'mineradio-audio-fade-v1', 'mineradio-playback-quality-v1',
  'mineradio-audio-output-device-v1', 'mineradio-audio-output-mirror-v1',
  'mineradio-visual-guide-seen-v2',
];

// Read Chromium storage from bounded copies; never open the original database.
async function readOriginalPreferences({ originalPath, defaultCacheRoot, BrowserWindow, session }) {
  let cacheRoot = defaultCacheRoot;
  let port = 3000;
  try {
    const config = path.join(originalPath, 'cache-settings.json');
    if (fs.statSync(config).size <= 32768) {
      const value = JSON.parse(fs.readFileSync(config, 'utf8'));
      if (typeof value.rootPath === 'string' && path.isAbsolute(value.rootPath)) cacheRoot = value.rootPath;
    }
  } catch (_) { }
  try {
    const config = path.join(originalPath, 'startup-state.json');
    if (fs.statSync(config).size <= 32768) {
      const value = JSON.parse(fs.readFileSync(config, 'utf8'));
      if (Number.isInteger(value.port) && value.port > 0 && value.port <= 65535) port = value.port;
    }
  } catch (_) { }
  const roots = [originalPath, path.join(cacheRoot, 'chromium', 'Mineradio')];
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-original-preferences-'));
  const values = {};
  let failed = false;
  try {
    for (let index = 0; index < roots.length; index++) {
      const source = path.join(roots[index], 'Local Storage', 'leveldb');
      if (!fs.existsSync(source)) continue;
      let win, isolatedSession, timer;
      try {
        if (fs.lstatSync(source).isSymbolicLink()) continue;
        const files = fs.readdirSync(source).map(name => ({ name, file: path.join(source, name) }));
        if (files.length > 256) throw new Error('STORAGE_TOO_LARGE');
        let bytes = 0;
        for (const entry of files) {
          const stat = fs.lstatSync(entry.file);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('INVALID_STORAGE_FILE');
          bytes += stat.size;
        }
        if (bytes > 32 * 1024 * 1024) throw new Error('STORAGE_TOO_LARGE');
        const isolatedRoot = path.join(temporaryRoot, String(index));
        const destination = path.join(isolatedRoot, 'Local Storage', 'leveldb');
        fs.mkdirSync(destination, { recursive: true });
        for (const entry of files) fs.copyFileSync(entry.file, path.join(destination, entry.name));
        isolatedSession = session.fromPath(isolatedRoot, { cache: false });
        isolatedSession.protocol.handle('http', () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
        win = new BrowserWindow({ show: false, webPreferences: { session: isolatedSession, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true } });
        timer = setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 5000);
        await win.loadURL(`http://127.0.0.1:${port}/`);
        const selected = await win.webContents.executeJavaScript(`Object.fromEntries(${JSON.stringify(PREFERENCE_KEYS)}.map(key => [key, localStorage.getItem(key)]).filter(entry => entry[1] !== null))`);
        for (const key of PREFERENCE_KEYS) {
          if (typeof selected[key] === 'string' && selected[key].length <= 16384) values[key] = selected[key];
        }
      } catch (_) { failed = true; }
      finally {
        clearTimeout(timer);
        if (win && !win.isDestroyed()) win.destroy();
        if (isolatedSession) {
          isolatedSession.protocol.unhandle('http');
          await isolatedSession.clearStorageData().catch(() => {});
        }
      }
    }
  } finally {
    // Sessions can retain Windows file locks until exit; cleared temporary
    // copies contain no retained preferences and never share a user directory.
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (_) { }
  }
  return { values, failed };
}
module.exports = { readOriginalPreferences, PREFERENCE_KEYS };
