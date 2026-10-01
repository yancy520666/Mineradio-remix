'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createOriginalProfileImporter } = require('../desktop/original-profile-import');

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
