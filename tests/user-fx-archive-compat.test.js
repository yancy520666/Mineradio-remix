'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const archivePath = 'public/js/modules/07-fx/00-preset-archive-data.js';
const archive = read(archivePath);
// Extract full declarations between function boundaries (braces in regexes are legal).
function load(context, source, names) {
  for (const name of names) {
    const matches = [...source.matchAll(new RegExp('(?:async )?function ' + name + '\\(', 'g'))];
    const start = matches.length ? matches.at(-1).index : -1;
    assert(start >= 0, name);
    const tail = source.slice(start);
    const next = tail.slice(1).search(/\n(?:async )?function |\nvar /);
    vm.runInContext(next < 0 ? tail : tail.slice(0, next + 1), context);
  }
}
function fixture() {
  const notifications = [];
  let saved = '[]', fail = false;
  const context = vm.createContext({ console, TextEncoder, TextDecoder, Uint8Array, Blob, Response,
    CompressionStream, DecompressionStream, btoa, atob, setTimeout, clearTimeout,
    VISUAL_PRESET_SCHEMA: 'skull-preset-v2', BASE_FOV: 45,
    document: { getElementById: () => null },
    localStorage: { getItem: () => saved, setItem(_key, value) { if (fail) throw Error('QuotaExceededError'); saved = value; } },
    showToast: value => notifications.push(value), renderUserFxArchives() {},
    normalizeDevelopmentLockedFxState() {},
  });
  vm.runInContext(read('public/js/modules/00-state/04-fx-defaults.js'), context);
  load(context, read('public/js/modules/02-visual/04-visual-settings-persistence.js'), ['clampRange', 'normalizeCoverResolution', 'normalizePerformanceBackgroundMode', 'normalizeAeroWaterPalette', 'normalizePerformanceQuality', 'normalizeLyricTextureClarity', 'normalizeHexColor', 'normalizeDesktopLyricsFps']);
  const displayModes = read('public/js/modules/02-visual/08-lyrics-display-modes.js');
  vm.runInContext(displayModes.slice(0, displayModes.indexOf('function ')), context);
  load(context, displayModes, ['normalizeLyricDisplayMode', 'normalizeLyricTranslationMode', 'normalizeLyricMotionStyle']);
  load(context, read('public/js/modules/02-visual/05-lyrics-fonts-texture.js'), ['normalizeLyricFontKey', 'builtinLyricFontKeyPattern', 'customLyricFontRecordForKey']);
  context.customLyricFonts = [];
  context.lyricFontOptions = [{key:'sans'}];
  const start = archive.indexOf('var USER_FX_ARCHIVE_STORE_KEY');
  const end = archive.indexOf('function defaultUserFxArchiveName');
  vm.runInContext(archive.slice(0, archive.indexOf('var USER_FX_ARCHIVE_STORE_KEY')), context);
  vm.runInContext(archive.slice(start, end), context);
  const functions = ['defaultUserFxArchiveName','normalizeUserFxArchiveName','archiveNumber','archiveMode','archiveHasCameraState','archiveHasVisualRotationState','normalizeFxArchiveSnapshot','readUserFxArchives','saveUserFxArchives','userFxShareChecksum','bytesToBase64Url','base64UrlToBytes','gzipUserFxShareText','gunzipUserFxShareText','validateImportedFxSnapshot','compactUserFxArchiveSnapshot','expandUserFxArchiveSnapshot','encodeUserFxArchiveShareCode','extractUserFxShareCode','looksLikeUserFxShareCode','decodeUserFxArchiveShareCode','addImportedUserFxArchiveSlot','normalizeImportedFxArchivePayload','importUserFxArchiveShareCodeText','importUserFxArchiveText','userFxArchiveAt','createUserFxArchive','saveUserFxArchive','commitUserFxArchiveRename','removeUserFxArchive'];
  load(context, archive, functions);
  context.userFxArchives = [];
  context.userFxArchivePersisted = '[]';
  context.userFxArchiveEditing = -1;
  context.fx = { ...context.fxDefaults };
  context.captureFxArchiveSnapshot = () => context.normalizeFxArchiveSnapshot(context.fx);
  context.renderUserFxArchives = () => {};
  return { c: context, notifications, failStorage() { fail = true; }, saved: () => JSON.parse(saved) };
}
const plain = value => JSON.parse(JSON.stringify(value));
function legacyCode(c, compact) {
  const body = 'J' + c.bytesToBase64Url(new TextEncoder().encode(JSON.stringify([1, compact])));
  return 'MR2:1.' + body + '.' + c.userFxShareChecksum('1.' + body);
}
test('v2 named complete snapshot round trips independently of mutable defaults and preserves Aero', async () => {
  const { c } = fixture();
  const snapshot = c.normalizeFxArchiveSnapshot({ ...c.fxDefaults, aeroWaterTheme: true, aeroWaterPalette: 'cyan', shelfOffsetX: -.34, performanceQuality: 'eco' });
  const code = await c.encodeUserFxArchiveShareCode({ snapshot });
  assert.match(code, /^MR2:2\./);
  c.fxDefaults.shelfOffsetX = .95;
  c.fxDefaults.performanceQuality = 'ultra';
  const decoded = await c.decodeUserFxArchiveShareCode(code);
  assert.deepEqual(plain(decoded.snapshot), plain(snapshot));
  assert.equal(decoded.snapshot.aeroWaterTheme, true);
  assert.equal(decoded.snapshot.aeroWaterPalette, 'cyan');
});
test('frozen original and Remix v1 full layouts preserve shelf fields after inserted offsets', async () => {
  const { c } = fixture();
  for (const [keys, length, start] of [[c.USER_FX_SHARE_V1_ORIGINAL_KEYS,213,163], [c.USER_FX_SHARE_V1_REMIX_KEYS,215,165]]) {
    assert.equal(keys.length, length);
    const snapshot = c.normalizeFxArchiveSnapshot({ ...c.fxDefaults, shelfOpacity: .8, shelfBgOpacity: .7, shelfAccentColor: '#12abcd', shelfDetailOffsetX: 2 });
    const values = keys.map(key => snapshot[key]);
    // Wire positions verified from upstream v2.2.0, independent of the decoder's mapping.
    values[start] = .8; values[start + 1] = .7; values[start + 2] = '#12abcd'; values[start + 3] = 2;
    const code = legacyCode(c, ['f', values]);
    const { snapshot: out } = await c.decodeUserFxArchiveShareCode(code);
    for (const key of ['shelfOpacity','shelfBgOpacity','shelfAccentColor','shelfDetailOffsetX']) assert.equal(out[key], snapshot[key]);
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'aeroWaterTheme'), false, 'old archives cannot invent an unsaved Aero value');
  }
});
test('legacy delta never uses an unidentifiable mutable baseline; unsupported lengths are rejected', async () => {
  const { c, notifications } = fixture();
  await assert.rejects(c.decodeUserFxArchiveShareCode(legacyCode(c, ['d', []])), /AMBIGUOUS_LEGACY_SHARE_BASELINE/);
  assert.equal(await c.importUserFxArchiveShareCodeText(legacyCode(c, ['d', [163,.8]])), false);
  assert.match(notifications.at(-1), /来源基线.*JSON/);
  await assert.rejects(c.decodeUserFxArchiveShareCode(legacyCode(c, ['f', [1,2]])), /INVALID_SHARE_SNAPSHOT/);
  assert.equal(c.userFxArchives.length, 0);
});
test('JSON migration accepts recognized legacy partial snapshots and rejects unrelated/future/invalid structure', () => {
  const { c } = fixture();
  assert.equal(c.normalizeImportedFxArchivePayload({ liveBackgroundKeep: true }, 'old.json').snapshot.performanceBackground, 'keep');
  assert.equal(c.normalizeImportedFxArchivePayload({ liveBackgroundKeep: true, performanceBackground: 'release' }, '').snapshot.performanceBackground, 'release');
  assert.equal(c.normalizePerformanceBackgroundMode('auto', true), 'auto');
  for (const payload of [{}, [], {hello:'world'}, {snapshot:{}}, {type:'mineradio-user-fx-archive',schema:99,snapshot:{preset:1}}, {type:'mineradio-user-fx-archive',schema:1,snapshot:{preset:1,unknown:3}}, {preset:{}}, {preset:'garbage'}, {aeroWaterTheme:'true'}]) assert.equal(c.normalizeImportedFxArchivePayload(payload, ''), null);
  assert(c.normalizeImportedFxArchivePayload({type:'mineradio-user-fx-archive',schema:1,snapshot:{preset:1}}, ''));
});
test('quota failure rolls back imports, new slots, overwrite, rename and removal without success toast', () => {
  for (const action of ['import','create','overwrite','rename','remove']) {
    const f = fixture(), c = f.c;
    c.userFxArchives = [{name:'old',createdAt:1,savedAt:1,snapshot:c.normalizeFxArchiveSnapshot(c.fxDefaults)}];
    assert.equal(c.saveUserFxArchives(), true);
    const before = plain(c.userFxArchives);
    f.failStorage();
    if (action === 'import') assert.equal(c.addImportedUserFxArchiveSlot({name:'new',snapshot:before[0].snapshot}), false);
    if (action === 'create') c.createUserFxArchive();
    if (action === 'overwrite') { c.fx.shelfOpacity = .2; c.saveUserFxArchive(0); }
    if (action === 'rename') { c.document.getElementById = () => ({value:'changed'}); c.commitUserFxArchiveRename(0); }
    if (action === 'remove') c.removeUserFxArchive(0);
    assert.deepEqual(plain(c.userFxArchives), before, action);
    assert.deepEqual(f.saved(), before, action);
    assert.match(f.notifications.at(-1), /保存失败/);
    assert.equal(f.notifications.length, 1);
  }
});

test('missing and incomplete snapshots never create a saved archive', async () => {
  const { c } = fixture();
  await assert.rejects(c.encodeUserFxArchiveShareCode({}), /EMPTY_ARCHIVE/);
  await assert.rejects(c.encodeUserFxArchiveShareCode({snapshot:{}}), /INVALID_ARCHIVE/);
  assert.equal(c.expandUserFxArchiveSnapshot(['o', {preset:1}], 2), null);
  assert.equal(c.addImportedUserFxArchiveSlot(null), false);
  c.saveUserFxArchive(42);
  assert.equal(c.userFxArchives.length, 0);
});

test('new share codec fallback and checksum/schema validation preserve integrity', async () => {
  const { c } = fixture();
  c.CompressionStream = undefined;
  const code = await c.encodeUserFxArchiveShareCode({snapshot:c.fxDefaults});
  assert.match(code, /^MR2:2\.J/);
  assert((await c.decodeUserFxArchiveShareCode(code)).snapshot);
  await assert.rejects(c.decodeUserFxArchiveShareCode(code.slice(0,-1) + (code.endsWith('A') ? 'B' : 'A')), /BAD_SHARE_CHECKSUM/);
  await assert.rejects(c.decodeUserFxArchiveShareCode(code.replace('MR2:2.', 'MR2:99.')), /UNSUPPORTED_SHARE_VERSION/);
});

test('all Aero palettes and panel glass endpoints survive complete snapshot storage/share', async () => {
  const { c } = fixture();
  for (const palette of ['clear','cyan','blue']) for (const [blur,density] of [[14,.55],[60,1]]) {
    const snapshot = c.normalizeFxArchiveSnapshot({...c.fxDefaults,aeroWaterTheme:true,aeroWaterPalette:palette,playlistPanelGlassBlur:blur,playlistPanelGlassDensity:density});
    const shared = (await c.decodeUserFxArchiveShareCode(await c.encodeUserFxArchiveShareCode({snapshot}))).snapshot;
    for (const key of ['aeroWaterTheme','aeroWaterPalette','playlistPanelGlassBlur','playlistPanelGlassDensity']) assert.equal(shared[key], snapshot[key]);
    c.userFxArchives = [{name:'glass',snapshot,createdAt:1,savedAt:1}];
    assert.equal(c.saveUserFxArchives(), true);
    c.userFxArchives = [];
    const stored = c.readUserFxArchives()[0].snapshot;
    assert.equal(stored.aeroWaterPalette, palette);
    assert.equal(stored.playlistPanelGlassBlur, blur);
    assert.equal(stored.playlistPanelGlassDensity, density);
  }
});
