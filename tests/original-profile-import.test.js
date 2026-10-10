'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createOriginalProfileImporter } = require('../desktop/original-profile-import');

test('removed Spotify credentials are neither offered nor migrated and existing files remain untouched', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-removed-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const originalPath = path.join(root, 'Original');
  const remixPath = path.join(root, 'Remix');
  fs.mkdirSync(originalPath); fs.mkdirSync(remixPath);
  const names = ['.spotify-token.json', '.spotify-credentials.json'];
  for (const name of names) fs.writeFileSync(path.join(originalPath, name), '{"fixture":"original"}');
  fs.writeFileSync(path.join(remixPath, names[0]), '{"fixture":"existing"}');
  const importer = createOriginalProfileImporter({ originalPath, remixPath });
  assert.deepEqual(importer.inspect(), { available: false, credentials: 0, settings: 0 });
  assert.equal(importer.importFiles().error, 'ORIGINAL_PROFILE_NOT_FOUND');
  fs.writeFileSync(path.join(originalPath, 'desktop-behavior.json'), '{"closeBehavior":"tray"}');
  assert.equal(importer.importFiles().importedCredentials, 0);
  assert.equal(fs.readFileSync(path.join(remixPath, names[0]), 'utf8'), '{"fixture":"existing"}');
  assert.equal(fs.existsSync(path.join(remixPath, names[1])), false);
  for (const name of names) assert.equal(fs.readFileSync(path.join(originalPath, name), 'utf8'), '{"fixture":"original"}');
  const main = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  const migrationList = main.match(/const APP_OWNED_MIGRATION_FILES = \[([\s\S]*?)\];/);
  assert.ok(migrationList);
  assert.doesNotMatch(migrationList[1], /spotify/i);
});

test('original profile import fills missing files and preserves existing Remix state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const originalPath = path.join(root, 'Mineradio');
  const remixPath = path.join(root, 'Mineradio Remix');
  fs.mkdirSync(originalPath);
  fs.mkdirSync(remixPath);
  fs.writeFileSync(path.join(originalPath, '.cookie'), 'old-account');
  fs.writeFileSync(path.join(originalPath, '.qq-cookie'), 'qq-account');
  fs.writeFileSync(path.join(originalPath, 'desktop-behavior.json'), '{"closeBehavior":"tray"}');
  fs.writeFileSync(path.join(originalPath, 'current-fx-autosave.json'), '{"lyricMotionStyle":"smooth","secret":"must-not-leave-main"}');
  fs.writeFileSync(path.join(remixPath, '.cookie'), 'remix-account');
  const importer = createOriginalProfileImporter({ originalPath, remixPath });
  assert.deepEqual(importer.inspect(), { available: true, credentials: 2, settings: 2 });
  const result = importer.importFiles(['lyricMotionStyle', 'secret']);
  assert.equal(result.ok, true);
  assert.equal(result.importedCredentials, 1);
  assert.equal(result.importedSettings, 1);
  assert.equal(result.visualSettings.lyricMotionStyle, 'smooth');
  assert.equal(Object.hasOwn(result.visualSettings, 'secret'), false);
  assert.equal(fs.readFileSync(path.join(remixPath, '.cookie'), 'utf8'), 'remix-account');
  assert.equal(fs.readFileSync(path.join(originalPath, '.qq-cookie'), 'utf8'), 'qq-account');
  assert.equal(importer.importFiles(['lyricMotionStyle']).importedCredentials, 0);
});

test('damaged JSON is skipped and a source symlink cannot be copied', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const originalPath = path.join(root, 'Mineradio');
  const remixPath = path.join(root, 'Mineradio Remix');
  fs.mkdirSync(originalPath);
  fs.writeFileSync(path.join(originalPath, 'desktop-behavior.json'), '{broken');
  fs.writeFileSync(path.join(root, 'external-cookie'), 'private');
  fs.symlinkSync(path.join(root, 'external-cookie'), path.join(originalPath, '.cookie'));
  const importer = createOriginalProfileImporter({ originalPath, remixPath });
  assert.equal(importer.importFiles().ok, true);
  assert.equal(fs.existsSync(path.join(remixPath, '.cookie')), false);
  assert.equal(fs.existsSync(path.join(remixPath, 'desktop-behavior.json')), false);
});

test('original import cannot overwrite existing Remix behavior and playlist files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-import-preserve-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const originalPath = path.join(root, 'Original');
  const remixPath = path.join(root, 'Remix');
  fs.mkdirSync(originalPath); fs.mkdirSync(remixPath);
  const existing = {
    'desktop-behavior.json': '{"closeBehavior":"exit"}',
    'built-in-playlists.json': '{"playlists":[{"id":"remix-existing"}]}',
  };
  for (const [name, content] of Object.entries(existing)) {
    fs.writeFileSync(path.join(originalPath, name), '{"origin":"old-profile"}');
    fs.writeFileSync(path.join(remixPath, name), content);
  }
  const result = createOriginalProfileImporter({ originalPath, remixPath }).importFiles();
  assert.equal(result.ok, true);
  assert.equal(result.importedSettings, 0);
  for (const [name, content] of Object.entries(existing)) {
    assert.equal(fs.readFileSync(path.join(remixPath, name), 'utf8'), content, name + ' must retain the Remix choice');
    assert.equal(fs.readFileSync(path.join(originalPath, name), 'utf8'), '{"origin":"old-profile"}');
  }
});

test('visual import replaces only default Remix values and persists the merged settings', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules/08-account/06-original-profile-import.js'), 'utf8');
  const start = source.indexOf('function mergeOriginalVisualSettings(');
  const end = source.indexOf('async function openOriginalProfileImport(', start);
  let saved = null;
  const context = {
    fxDefaults: { lyricMotionStyle: 'float', lyricScale: 1, backgroundColor: '#000000' },
    readCurrentFxAutosaveRaw: () => ({ lyricMotionStyle: 'float', lyricScale: 1.4, backgroundColor: '#000000' }),
    writeCurrentFxAutosavePayload: (payload, options) => { saved = { payload, options }; return true; },
    CURRENT_FX_AUTOSAVE_SCHEMA: 'test-schema',
    VISUAL_PRESET_SCHEMA: 'test-presets',
  };
  vm.runInNewContext(source.slice(start, end), context);
  const count = context.mergeOriginalVisualSettings({ lyricMotionStyle: 'smooth', lyricScale: 0.8, secret: 'ignored' });
  assert.equal(count, 1);
  assert.equal(saved.payload.lyricMotionStyle, 'smooth');
  assert.equal(saved.payload.lyricScale, 1.4);
  assert.equal(Object.hasOwn(saved.payload, 'secret'), false);
  assert.equal(saved.options.syncDisk, true);
});

test('preference import fills audio settings without replacing user choices or importing history', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules/08-account/06-original-profile-import.js'), 'utf8');
  const saved = new Map([['apex-player-volume', '0.15']]);
  const context = { localStorage: { getItem: key => saved.has(key) ? saved.get(key) : null, setItem: (key, value) => saved.set(key, value) }, markStartupGuideSeen() {} };
  vm.runInNewContext(source.slice(source.indexOf('function mergeOriginalPreferences('), source.indexOf('async function openOriginalProfileImport(')), context);
  assert.equal(context.mergeOriginalPreferences({ 'apex-player-volume': '0.48', 'mineradio-audio-fade-v1': '{"fadeInMs":321}', 'mineradio-search-history': '["ignored"]', secret: 'ignored' }), 1);
  assert.equal(saved.get('apex-player-volume'), '0.15');
  assert.equal(saved.get('mineradio-audio-fade-v1'), '{"fadeInMs":321}');
  assert.equal(saved.has('mineradio-search-history'), false);
  assert.equal(saved.has('secret'), false);
});

test('preference consumers reject hostile keys, oversized strings and wrong types without changing current settings', () => {
  const { loadFunctions } = require('./helpers/classic-functions');
  const saved = new Map([['apex-player-volume', '0.15']]);
  const c = vm.createContext({ localStorage: { getItem: key => saved.has(key) ? saved.get(key) : null,
    setItem: (key, value) => saved.set(key, value) }, markStartupGuideSeen() {},
    fxDefaults: { lyricScale: 1 }, readCurrentFxAutosaveRaw: () => ({ lyricScale: 1.4 }),
    writeCurrentFxAutosavePayload() { throw new Error('no valid visual change'); } });
  loadFunctions(c, 'public/js/modules/08-account/06-original-profile-import.js', ['mergeOriginalPreferences', 'mergeOriginalVisualSettings']);
  const payload = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"apex-player-volume":"0.8","mineradio-audio-fade-v1":42}');
  payload['mineradio-playback-quality-v1'] = 'x'.repeat(16385);
  payload['mineradio-audio-output-device-v1'] = 'valid-fixture-device';
  assert.equal(c.mergeOriginalPreferences(payload), 1);
  assert.equal(c.mergeOriginalVisualSettings(payload), 0);
  assert.equal(saved.get('apex-player-volume'), '0.15');
  assert.deepEqual([...saved.keys()], ['apex-player-volume', 'mineradio-audio-output-device-v1']);
  assert.equal(vm.runInContext('Object.prototype.polluted', c), undefined);
});


test('startup auth migration leaves obsolete Spotify files untouched and does not import their credentials', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-startup-removed-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const resource = path.join(root, 'resources'), stable = path.join(root, 'stable');
  fs.mkdirSync(resource); fs.mkdirSync(stable);
  const names = ['.spotify-token.json', '.spotify-credentials.json', 'spotify-credentials.json'];
  for (const name of names) fs.writeFileSync(path.join(resource, name), JSON.stringify({ fixture: name }));
  const tokenTarget = path.join(stable, '.spotify-token.json');
  const configTarget = path.join(stable, '.spotify-credentials.json');
  fs.writeFileSync(tokenTarget, '{"fixture":"existing-account"}');
  const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  const start = source.indexOf('function migrateLegacyAuthStorage() {');
  const end = source.indexOf('\nasync function ensureLocalServerStarted()', start);
  assert.ok(start > 0 && end > start);
  let otherMigrations = 0;
  const context = vm.createContext({ fs, path, console,
    __dirname: path.join(resource, 'desktop'),
    process: { env: { SPOTIFY_TOKEN_FILE: tokenTarget, SPOTIFY_CONFIG_FILE: configTarget } },
    removeDeprecatedKugouVipEvidenceFiles() { otherMigrations++; },
    migrateMisplacedAppOwnedFiles() { otherMigrations++; },
  });
  vm.runInContext(source.slice(start, end), context);
  context.migrateLegacyAuthStorage();
  assert.equal(otherMigrations, 2, 'unrelated startup migrations still run');
  for (const name of names) assert.equal(fs.readFileSync(path.join(resource, name), 'utf8'), JSON.stringify({ fixture: name }));
  assert.equal(fs.readFileSync(tokenTarget, 'utf8'), '{"fixture":"existing-account"}');
  assert.equal(fs.existsSync(configTarget), false);
  fs.unlinkSync(tokenTarget);
  context.migrateLegacyAuthStorage();
  assert.equal(fs.existsSync(tokenTarget), false, 'missing removed-provider token is not silently imported');
});
