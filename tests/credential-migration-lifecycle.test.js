'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const { createCookieStore, isProtectedCredentialFile } = require('../cookie-storage');
test('old application cache credentials cannot revive after verified migration and logout', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-credential-migration-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const stable = path.join(temp, 'stable'), old = path.join(temp, 'old-cache'); fs.mkdirSync(old);
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value.split('').reverse().join('')), decryptString: bytes => bytes.toString().split('').reverse().join('') };
  const store = (file, options) => createCookieStore(file, { ...options, safeStorage, electronRuntime: true });
  const names = ['.cookie', '.qishui-qr-login.json'];
  fs.writeFileSync(path.join(old, '.cookie'), 'MUSIC_U=fixture-old-session');
  fs.writeFileSync(path.join(old, '.qishui-qr-login.json'), JSON.stringify({ cookie: 'sessionid=fixture', msToken: 'fixture-ms' }));
  const context = vm.createContext({
    fs, path, console: { log() {}, warn() {} }, APP_OWNED_MIGRATION_FILES: names,
    STABLE_USER_DATA_PATH: stable, app: { getPath: () => old }, cacheSettings: {}, chromiumSessionDataPath: () => old,
    createCookieStore: store, isProtectedCredentialFile,
    neteaseCookieHasLogin: text => text.includes('MUSIC_U='),
  });
  loadFunctions(context, 'desktop/main.js', ['appOwnedMigrationFileValid', 'migrateMisplacedAppOwnedFiles', 'migrateLegacyCredentialFile']);
  context.migrateMisplacedAppOwnedFiles();
  for (const name of names) {
    assert(!fs.existsSync(path.join(old, name)), 'verified migration retires the obsolete source');
    assert(fs.readFileSync(path.join(stable, name), 'utf8').startsWith('MINERADIO_SAFE_STORAGE_V1:'));
    store(path.join(stable, name)).write('');
  }
  context.migrateMisplacedAppOwnedFiles();
  assert(names.every(name => !fs.existsSync(path.join(stable, name))), 'logout stays logged out across a new launch');
  const legacy = path.join(old, '.cookie'); fs.writeFileSync(legacy, 'MUSIC_U=fixture-resource');
  context.migrateLegacyCredentialFile(legacy, path.join(stable, '.cookie'));
  assert(!fs.existsSync(legacy)); assert.equal(store(path.join(stable, '.cookie')).read(), 'MUSIC_U=fixture-resource');
});
