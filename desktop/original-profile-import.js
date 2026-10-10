'use strict';

const fs = require('fs');
const path = require('path');
const { createCookieStore, isProtectedCredentialFile } = require('../cookie-storage');

const CREDENTIAL_FILES = [
  '.cookie', '.qq-cookie', '.kugou-cookie', '.qishui-cookie', '.qishui-token',
  '.qishui-oauth.json', '.qishui-qr-identity.json', '.qishui-qr-login.json',
];
const SETTINGS_FILES = ['desktop-behavior.json', 'built-in-playlists.json', 'local-music-library.json'];
const FX_FILE = 'current-fx-autosave.json';

function validFile(root, name, maxBytes) {
  try {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) return null;
    return file;
  } catch (_) { return null; }
}

function createOriginalProfileImporter({ originalPath, remixPath, validateSource }) {
  function sourceFile(name, maxBytes) {
    const file = validFile(originalPath, name, maxBytes);
    return file && (!validateSource || validateSource(name, file)) ? file : null;
  }
  function inspect() {
    const credentials = CREDENTIAL_FILES.filter(name => sourceFile(name, 1024 * 1024));
    const settings = SETTINGS_FILES.filter(name => sourceFile(name, 16 * 1024 * 1024));
    const fxAvailable = !!sourceFile(FX_FILE, 12 * 1024 * 1024);
    return { available: credentials.length + settings.length + Number(fxAvailable) > 0,
      credentials: credentials.length, settings: settings.length + Number(fxAvailable) };
  }

  function importFiles(visualKeys = []) {
    if (path.resolve(originalPath).toLowerCase() === path.resolve(remixPath).toLowerCase()) {
      return { ok: false, error: 'SAME_PROFILE' };
    }
    const summary = inspect();
    if (!summary.available) return { ok: false, error: 'ORIGINAL_PROFILE_NOT_FOUND' };
    fs.mkdirSync(remixPath, { recursive: true });
    let importedCredentials = 0;
    let importedSettings = 0;
    for (const name of [...CREDENTIAL_FILES, ...SETTINGS_FILES]) {
      const source = sourceFile(name, name.endsWith('.json') ? 16 * 1024 * 1024 : 1024 * 1024);
      if (!source) continue;
      const destination = path.join(remixPath, name);
      try {
        const protectedFile = isProtectedCredentialFile(name);
        if (protectedFile) {
          if (fs.existsSync(destination)) continue;
          const text = createCookieStore(source, { migrate: false }).read();
          if (!text) continue;
          if (name.endsWith('.json')) JSON.parse(text);
          createCookieStore(destination).write(text);
        } else {
          if (name.endsWith('.json')) JSON.parse(fs.readFileSync(source, 'utf8'));
          fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
        }
        if (CREDENTIAL_FILES.includes(name)) importedCredentials++;
        else importedSettings++;
      } catch (error) {
        if (error.code !== 'EEXIST') continue;
      }
    }
    let visualSettings = null;
    const visualFile = sourceFile(FX_FILE, 12 * 1024 * 1024);
    if (visualFile) {
      try {
        const parsed = JSON.parse(fs.readFileSync(visualFile, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const keys = Array.isArray(visualKeys) ? visualKeys.slice(0, 256) : [];
          visualSettings = {};
          for (const key of [...keys, 'visualPresetSchema', 'desktopLyricsSchema']) {
            if (typeof key !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(key) || /cookie|token|secret|password|credential|auth/i.test(key)) continue;
            if (Object.prototype.hasOwnProperty.call(parsed, key)) visualSettings[key] = parsed[key];
          }
        }
      } catch (_) { /* Ignore a damaged original autosave. */ }
    }
    return { ok: true, importedCredentials, importedSettings, visualSettings };
  }

  return { inspect, importFiles };
}

module.exports = { createOriginalProfileImporter };
