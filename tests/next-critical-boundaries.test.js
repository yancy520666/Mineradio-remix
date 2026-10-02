'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { createCookieStore, ENCRYPTED_COOKIE_PREFIX } = require('../cookie-storage');
const { LocalMusicLibrary } = require('../desktop/local-music-library');
const { BuiltInPlaylistLibrary } = require('../desktop/built-in-playlist-library');
const { loadFunctions } = require('./helpers/classic-functions');

function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-next-boundary-'));
  t.after(() => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
const safeStorage = { isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(value), decryptString: bytes => bytes.toString() };

test('credential encryption and atomic replacement failures preserve the last encrypted account', t => {
  const file = path.join(directory(t), '.cookie');
  const store = createCookieStore(file, { safeStorage, electronRuntime: true });
  store.write('fixture-only-account');
  const previous = fs.readFileSync(file);
  const broken = createCookieStore(file, { safeStorage: { ...safeStorage, encryptString() { throw new Error('fixture encryption failed'); } }, electronRuntime: true });
  assert.throws(() => broken.write('new-fixture-account'));
  assert.deepEqual(fs.readFileSync(file), previous);
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { throw Object.assign(new Error('fixture disk full'), { code: 'ENOSPC' }); };
    assert.throws(() => store.write('new-fixture-account'), { code: 'ENOSPC' });
  } finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readFileSync(file), previous);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['.cookie'], 'failed writes leave no plaintext or temporary credential');
});

test('credential error diagnostics never echo the account value returned by a failing backend', t => {
  const file = path.join(directory(t), '.cookie'), value = 'fixture-secret-in-error';
  fs.writeFileSync(file, ENCRYPTED_COOKIE_PREFIX + Buffer.from('fixture').toString('base64'));
  const logs = [];
  const store = createCookieStore(file, { safeStorage: { ...safeStorage, decryptString() { throw new Error(value); } },
    electronRuntime: true, logger: { warn: message => logs.push(message) } });
  assert.equal(store.read(), ''); assert.equal(logs.length, 1);
  assert(!logs.join('\n').includes(value));
});

test('a damaged Spotify token file cannot expose its contents through a JSON error message', t => {
  const file = path.join(directory(t), '损坏 token.json'), value = 'fixture-private-token';
  fs.writeFileSync(file, value);
  const logs = [], c = vm.createContext({ fs, getSpotifyTokenFile: () => file,
    console: { warn: (...args) => logs.push(args.join(' ')) } });
  loadFunctions(c, 'spotify-api.js', ['readStoredSpotifyToken']);
  assert.equal(c.readStoredSpotifyToken().invalid, true);
  assert.equal(logs.length, 1); assert(!logs.join('\n').includes('fixture-'), 'even a token prefix must not reach diagnostics');
  assert.equal(fs.readFileSync(file, 'utf8'), value, 'diagnostics must not delete the source');
});

test('camera grant accepts only the trusted main document and rejects negative media/frame/expiry cases', () => {
  let now = 1000;
  const sender = { id: 12, isDestroyed: () => false, getURL: () => 'http://127.0.0.1:32199/' };
  const c = vm.createContext({ URL, path, Date: { now: () => now }, mainServerPort: 32199,
    mainWindow: { isDestroyed: () => false, webContents: sender }, gestureCameraPermissionGrant: null,
    GESTURE_CAMERA_PERMISSION_GRANT_MS: 45000 });
  loadFunctions(c, 'desktop/main.js', ['isLocalAppUrl', 'isTrustedMainDocumentUrl', 'isTrustedMainWindowIpc',
    'clearGestureCameraPermissionGrant', 'createGestureCameraPermissionGrant', 'isTrustedGestureCameraMediaPermission']);
  const event = { sender, senderFrame: { url: sender.getURL(), parent: null } };
  assert(c.createGestureCameraPermissionGrant(event));
  assert.equal(c.isTrustedGestureCameraMediaPermission(sender, sender.getURL(), { mediaType: 'video', isMainFrame: true }), true);
  for (const details of [{ mediaType: 'audio' }, { mediaTypes: ['video', 'audio'] }, { mediaType: 'video', isMainFrame: false }, { mediaType: 'unknown' }]) {
    assert.equal(c.isTrustedGestureCameraMediaPermission(sender, sender.getURL(), details), false);
  }
  assert.equal(c.isTrustedGestureCameraMediaPermission({ ...sender, id: 13 }, sender.getURL(), { mediaType: 'video' }), false);
  assert.equal(c.isTrustedGestureCameraMediaPermission(sender, 'https://attacker.invalid/', { mediaType: 'video' }), false);
  assert.equal(c.createGestureCameraPermissionGrant({ ...event, senderFrame: { url: event.senderFrame.url, parent: {} } }), null);
  assert.equal(c.createGestureCameraPermissionGrant({ ...event, senderFrame: { url: 'http://127.0.0.1:32199/remote.html' } }), null);
  now += 45001;
  assert.equal(c.isTrustedGestureCameraMediaPermission(sender, sender.getURL(), { mediaType: 'video' }), false);
  assert.equal(c.gestureCameraPermissionGrant, null);
});

test('update IPC handlers reject remote windows and subframes before invoking native operations', async () => {
  const handlers = {}, calls = [];
  const sender = { isDestroyed: () => false, getURL: () => 'http://127.0.0.1:32199/' };
  const c = vm.createContext({ URL, path, mainServerPort: 32199, appQuitting: false,
    mainWindow: { isDestroyed: () => false, webContents: sender },
    ipcMain: { handle: (key, fn) => { handlers[key] = fn; } }, remixUpdater: {
      check: () => { calls.push('check'); return {}; }, download: () => { calls.push('download'); return {}; },
      install: () => { calls.push('install'); return { ok: false, error: 'UPDATE_NOT_READY' }; },
    } });
  loadFunctions(c, 'desktop/main.js', ['isLocalAppUrl', 'isTrustedMainDocumentUrl', 'isTrustedMainWindowIpc']);
  const source = fs.readFileSync('desktop/main.js', 'utf8');
  for (const name of ['check', 'download', 'install']) {
    const key = 'mineradio-remix-update-' + name;
    const start = source.indexOf("ipcMain.handle('" + key + "'");
    assert(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), c);
    for (const event of [
      { sender: { ...sender }, senderFrame: { url: sender.getURL() } },
      { sender, senderFrame: { url: sender.getURL(), parent: {} } },
      { sender, senderFrame: { url: 'https://attacker.invalid/' } },
    ]) assert.equal((await handlers[key](event)).error, 'UNTRUSTED_SENDER');
    assert.equal(calls.length, 0);
  }
  for (const name of ['check', 'download', 'install']) await handlers['mineradio-remix-update-' + name]({ sender, senderFrame: { url: sender.getURL() } });
  assert.deepEqual(calls, ['check', 'download', 'install']); assert.equal(c.appQuitting, false);
});

test('public audio proxy headers retain Range without sending account credentials', () => {
  const c = vm.createContext({ URL, UA: 'fixture-user-agent', kugouAudioReferer: () => '',
    qishuiCookie: 'fixture-account', userCookie: 'fixture-account', qqCookie: 'fixture-account' });
  loadFunctions(c, 'server.js', ['audioProxyHeadersFor']);
  const headers = c.audioProxyHeadersFor('https://media.douyin.com/public.m4a', 'bytes=20-40');
  assert.equal(headers.Range, 'bytes=20-40'); assert.equal(headers.Referer, 'https://www.qishui.com/');
  assert.deepEqual(Object.keys(headers).sort(), ['Range', 'Referer', 'User-Agent']);
  assert(!JSON.stringify(headers).includes('fixture-account'));
});

test('local media rejects forged capabilities and malformed ranges; cover links cannot serve outside the cover cache', async t => {
  const root = directory(t), audio = path.join(root, 'song.mp3'); fs.writeFileSync(audio, 'fixture-media');
  const library = new LocalMusicLibrary({ userDataPath: root });
  const imported = await library.importFiles([audio]), track = imported.tracks[0];
  const forged = new URL(track.localUrl); forged.searchParams.set('cap', 'forged');
  assert.equal((await library.mediaResponse(new Request(forged))).status, 404);
  forged.searchParams.delete('cap'); assert.equal((await library.mediaResponse(new Request(forged))).status, 404);
  const traversal = new URL(track.localUrl); traversal.pathname = '/%2e%2e/private.txt';
  assert.equal((await library.mediaResponse(new Request(traversal))).status, 404);
  for (const range of ['bytes=100-110', 'bytes=1-0', 'bytes=0-0,2-3', 'not-a-range']) {
    assert.equal((await library.mediaResponse(new Request(track.localUrl, { headers: { range } }))).status, 416);
  }
  const outside = path.join(root, 'private.txt'); fs.writeFileSync(outside, 'fixture-private');
  fs.mkdirSync(library.coverDirectory, { recursive: true });
  const junction = path.join(library.coverDirectory, 'outside'); fs.symlinkSync(root, junction, 'junction');
  const coverPath = path.join(junction, 'private.png'); fs.writeFileSync(path.join(root, 'private.png'), 'fixture-private');
  library.records.get(track.localFileId).coverPath = coverPath;
  const cover = new URL(track.localUrl); cover.hostname = 'cover';
  assert.equal((await library.mediaResponse(new Request(cover))).status, 404);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'fixture-private');
});

test('playlist normalization bounds hostile values and drops prototype keys through persistence', async t => {
  const root = directory(t), library = new BuiltInPlaylistLibrary({ userDataPath: root });
  const id = (await library.create('fixture')).playlist.id;
  const track = JSON.parse('{"provider":"netease","id":42,"name":"fixture","__proto__":{"polluted":true},"privilege":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"st":0}}');
  track.artist = 'x'.repeat(9000);
  await library.addTrack(id, track);
  const restored = new BuiltInPlaylistLibrary({ userDataPath: root }).page(id, { limit: 1 }).tracks[0];
  assert.equal(Object.getPrototypeOf(restored.privilege), Object.prototype);
  assert.equal(Object.hasOwn(restored.privilege, '__proto__'), false);
  assert.equal(Object.hasOwn(restored.privilege, 'constructor'), false);
  assert.equal(Object.prototype.polluted, undefined);
  assert(restored.artist.length <= 4096);
  for (const damaged of ['', '{', JSON.stringify({ version: -1, playlists: [] })]) {
    fs.writeFileSync(library.indexPath, damaged);
    assert.equal(new BuiltInPlaylistLibrary({ userDataPath: root }).listSync().count, 0);
  }
});
