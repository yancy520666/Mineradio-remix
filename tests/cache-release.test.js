'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { releaseFlatCache, summarize, createCacheReleaseCoordinator } = require('../desktop/cache-release');
const { createCoverCache } = require('../cover-cache');
const pattern = /^[a-f0-9]{64}\.json$/;
const name = letter => letter.repeat(64) + '.json';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test('only allowlisted flat generated files are deleted; active and user files survive', t => {
  const root = fixture(t);
  const cache = path.join(root, 'lyrics'); fs.mkdirSync(cache);
  fs.writeFileSync(path.join(cache, name('a')), 'generated');
  fs.writeFileSync(path.join(cache, name('b')), 'active');
  fs.mkdirSync(path.join(cache, 'nested'));
  fs.writeFileSync(path.join(cache, 'nested', name('c')), 'nested user file');
  for (const file of ['Cookies', 'preferences.json', 'favorites.json', 'song.mp3', 'font.ttf', 'feedback.json', 'custom-beatmap.json']) fs.writeFileSync(path.join(cache, file), 'keep');
  const result = releaseFlatCache({ category: 'lyrics', root: cache, pattern, keep: () => [path.join(cache, name('b'))] });
  assert.equal(result.freedBytes, 9); assert.equal(result.deletedFiles, 1); assert.equal(result.skippedFiles, 1);
  assert(fs.existsSync(path.join(cache, name('b'))));
  assert(fs.existsSync(path.join(cache, 'nested', name('c'))));
  for (const file of ['Cookies', 'preferences.json', 'favorites.json', 'song.mp3', 'font.ttf', 'feedback.json', 'custom-beatmap.json']) assert(fs.existsSync(path.join(cache, file)));
});
test('symlink file, root and ancestor cannot escape the allowlist', t => {
  const root = fixture(t), target = path.join(root, 'target'); fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, name('a')), 'outside');
  const link = path.join(root, 'linked'); fs.symlinkSync(target, link, 'dir');
  let result = releaseFlatCache({ category: 'lyrics', root: link, pattern });
  assert.equal(result.failedFiles, 1); assert.equal(result.freedBytes, 0);
  fs.mkdirSync(path.join(target, 'child')); fs.writeFileSync(path.join(target, 'child', name('a')), 'child');
  result = releaseFlatCache({ category: 'lyrics', root: path.join(link, 'child'), pattern });
  assert.equal(result.failedFiles, 1);
  const cache = path.join(root, 'cache'); fs.mkdirSync(cache);
  fs.symlinkSync(path.join(target, name('a')), path.join(cache, name('b')));
  result = releaseFlatCache({ category: 'lyrics', root: cache, pattern });
  assert.equal(result.skippedFiles, 1); assert.equal(fs.readFileSync(path.join(target, name('a')), 'utf8'), 'outside');
});
test('active generation skips files, validation preserves unknown data and errors are partial', t => {
  const root = fixture(t); fs.writeFileSync(path.join(root, name('a')), '123');
  let result = releaseFlatCache({ category: 'native', root, pattern, preserve: () => true });
  assert.equal(result.skippedFiles, 1);
  result = releaseFlatCache({ category: 'lyrics', root, pattern, validate: () => false });
  assert.equal(result.skippedFiles, 1);
  const io = Object.assign({}, fs, { unlinkSync() { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } });
  result = releaseFlatCache({ category: 'lyrics', root, pattern }, io);
  const report = summarize([result]); assert.equal(report.ok, false); assert.equal(report.partial, true); assert.equal(report.freedBytes, 0); assert.equal(report.failedFiles, 1); assert.deepEqual(report.errors, ['EBUSY']);
});
test('release is singleflight and drains existing writers; stale callbacks cannot rewrite', async () => {
  const coordinator = createCacheReleaseCoordinator();
  let unblock, started, writes = 0, releases = 0;
  const began = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { unblock = resolve; });
  const oldWrite = coordinator.write(0, async () => { writes++; started(); await gate; });
  await began;
  const release = coordinator.release(() => { releases++; assert.equal(writes, 1); return 'released'; });
  assert.equal(coordinator.release(() => { releases++; }), release);
  assert.equal(coordinator.generation(), 1);
  unblock(); await oldWrite; assert.equal(await release, 'released');
  const stale = await coordinator.write(0, () => { writes++; }); assert.equal(stale.error, 'CACHE_GENERATION_CHANGED');
  await coordinator.write(1, () => { writes++; });
  assert.equal(writes, 2); assert.equal(releases, 1);
});
test('cover clear allows active request to finish but prevents stale memory resurrection', async () => {
  const cache = createCoverCache(); let finish;
  const response = value => ({ status: 200, contentType: 'image/png', body: Buffer.from(value) });
  const old = cache.load('cover', () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve(); cache.clear();
  await cache.load('cover', async () => response('new'));
  finish(response('old')); assert.equal((await old).body.toString(), 'old');
  assert.equal(cache.get('cover').body.toString(), 'new'); assert.equal(cache.stats().active, 0);
});
test('search clear does not let old completion replace a fresh result or remove its inflight request', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const begin = source.indexOf('function createSearchResultCache('), end = source.indexOf('\nconst neteaseSearchCache', begin);
  const context = vm.createContext({ SEARCH_RESULT_CACHE_TTL_MS: 120000 });
  const create = vm.runInContext(source.slice(begin, end) + '\ncreateSearchResultCache', context);
  const cache = create(5); let oldFinish, newFinish;
  const old = cache.wrap('key', () => new Promise(resolve => { oldFinish = resolve; })); await Promise.resolve();
  cache.clear();
  const fresh = cache.wrap('key', () => new Promise(resolve => { newFinish = resolve; })); await Promise.resolve();
  oldFinish(['old']); await old;
  const joined = cache.wrap('key', () => { throw new Error('duplicate'); });
  newFinish(['fresh']); await fresh; await joined;
  assert.deepEqual(await cache.wrap('key', () => []), ['fresh']);
});
function mainHandlers(t, options = {}) {
  const root = fixture(t), lyrics = path.join(root, 'lyrics'), native = path.join(root, 'native-helper-temp');
  fs.mkdirSync(lyrics); fs.mkdirSync(native);
  const source = fs.readFileSync(path.join(__dirname, '..', 'desktop/main.js'), 'utf8');
  const handlers = new Map(), coordinator = createCacheReleaseCoordinator();
  const loop = { root: path.join(native, 'wallpaper-engine-muted-package-cache', 'loop-videos'), jobs: new Map(), entries: new Map(),
    mutate: fn => Promise.resolve().then(fn), files: key => ({ video: path.join(loop.root, key + '.webm'), meta: path.join(loop.root, key + '.json') }) };
  const runtime = { active: null, pending: null };
  let cacheBytes = 50, cleared = 0;
  const context = vm.createContext({ fs, path, process, crypto: require('node:crypto'), Number, Date, Buffer, console,
    cacheReleaseCoordinator: coordinator, releaseFlatCache, summarize,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    isTrustedMainWindowIpc: event => event.trusted,
    cacheSettings: { lyricsPath: lyrics }, NATIVE_HELPER_TEMP_PATH: native,
    LYRIC_CACHE_VERSION: 1, LYRIC_CACHE_ENTRY_MAX_BYTES: 1024,
    wallpaperEngineRuntime: runtime, wallpaperLoopCache: loop,
    defaultSpillDirectory: () => path.join(root, 'spill'),
    localServer: { releaseGeneratedCaches: () => ({ ok: true, memoryFreedBytes: 99 }) },
    cacheSettingsSnapshot: async () => ({ ok: true, usage: { test: true } }),
    lyricCacheFilePath: key => path.join(lyrics, name(key)), pruneLyricCache: async () => {},
  });
  const releaseStart = source.indexOf("ipcMain.handle('mineradio-cache-release'");
  vm.runInContext(source.slice(releaseStart, source.indexOf("ipcMain.handle('mineradio-cache-get-settings'", releaseStart)), context);
  const readStart = source.indexOf("ipcMain.handle('mineradio-cache-read-lyric'");
  vm.runInContext(source.slice(readStart, source.indexOf("ipcMain.handle('desktop-window-close'", readStart)), context);
  const event = { trusted: true, sender: { session: { getCacheSize: async () => cacheBytes,
    clearCache: async () => { cleared++; cacheBytes = 0; }, clearStorageData: () => { throw new Error('MUST_NOT_CLEAR_USER_STORAGE'); } } } };
  return { root, lyrics, native, loop, runtime, handlers, coordinator, event, cleared: () => cleared };
}
test('desktop release reports exact disk bytes and retains active wallpaper, login files and edited maps', async t => {
  const h = mainHandlers(t);
  const lyric = JSON.stringify({ version: 1, payload: { lyric: 'generated' } });
  fs.writeFileSync(path.join(h.lyrics, name('a')), lyric);
  fs.writeFileSync(path.join(h.root, 'Cookies'), 'login');
  fs.mkdirSync(path.join(h.root, 'beatmaps')); fs.writeFileSync(path.join(h.root, 'beatmaps', 'edited.json'), 'user edits');
  fs.mkdirSync(h.loop.root, { recursive: true });
  const key = 'b'.repeat(64), active = h.loop.files(key);
  fs.writeFileSync(active.video, 'active video'); fs.writeFileSync(active.meta, 'active metadata'); h.loop.entries.set(key, active.video);
  const unused = h.loop.files('c'.repeat(64)); fs.writeFileSync(unused.video, 'old'); fs.writeFileSync(unused.meta, '{}');
  const pkg = path.join(h.native, 'wallpaper-engine-muted-package-cache', 'd'.repeat(64) + '.pkg'); fs.writeFileSync(pkg, 'active package');
  h.runtime.active = { mutedScenePackageCacheFile: pkg };
  const release = h.handlers.get('mineradio-cache-release');
  const result = await release(h.event, { root: h.root });
  assert.equal(result.ok, true); assert.equal(result.partial, true);
  assert.equal(result.freedBytes, Buffer.byteLength(lyric) + 5 + 50); assert.equal(result.skippedFiles, 3);
  assert.equal(h.cleared(), 1); assert.equal(result.generation, 1);
  assert(fs.existsSync(active.video)); assert(fs.existsSync(active.meta)); assert(fs.existsSync(pkg));
  assert.equal(fs.readFileSync(path.join(h.root, 'Cookies'), 'utf8'), 'login');
  assert.equal(fs.readFileSync(path.join(h.root, 'beatmaps', 'edited.json'), 'utf8'), 'user edits');
  assert.equal(result.snapshot.ok, true);
});
test('desktop IPC rejects untrusted release and stale lyric writes while fresh writes continue', async t => {
  const h = mainHandlers(t), release = h.handlers.get('mineradio-cache-release');
  const read = h.handlers.get('mineradio-cache-read-lyric'), write = h.handlers.get('mineradio-cache-write-lyric');
  assert.equal((await release({ trusted: false })).error, 'UNTRUSTED_CACHE_REQUEST'); assert.equal(h.cleared(), 0);
  const before = await read(h.event, 'a'); assert.equal(before.generation, 0);
  await release(h.event);
  assert.equal((await write(h.event, 'a', { lyric: 'late' }, before.generation)).error, 'CACHE_GENERATION_CHANGED');
  assert(!fs.existsSync(path.join(h.lyrics, name('a'))));
  const current = await read(h.event, 'a'); assert.equal(current.generation, 1);
  assert.equal((await write(h.event, 'a', { lyric: 'fresh' }, current.generation)).ok, true);
  assert.equal((await read(h.event, 'a')).payload.lyric, 'fresh');
});
