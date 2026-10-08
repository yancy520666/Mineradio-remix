'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createGeneratedCachePruner } = require('../generated-cache-pruner');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function statsHarness(storage = new Map(), limit = Infinity) {
  const writes = [];
  const c = vm.createContext({ console, HOME_LISTEN_STATS_KEY: 'stats', localStorage: {
    getItem: key => storage.get(key) || null,
    setItem(key, value) {
      writes.push(value.length * 2);
      if (value.length * 2 > limit) { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; }
      storage.set(key, value);
    }
  } });
  vm.runInContext(read('public/js/modules/05-playback/02-listen-stats.js'), c);
  return { c, storage, writes };
}
function legacyStats(count) {
  const songs = {}, artists = {};
  for (let i = 0; i < count; i++) {
    songs['song-' + i] = { name: 'song ' + i, artist: 'artist ' + i, plays: i === 0 ? 999 : 2, lastPlayedAt: i, cover: 'https://example.invalid/' + 'a'.repeat(150) };
    artists['artist-' + i] = { name: 'artist ' + i, plays: 2, lastPlayedAt: i };
  }
  return { songs, artists, history: [], updatedAt: 1 };
}
test('legacy statistics shrink on startup while preserving lifetime count, leaders and settings', () => {
  const storage = new Map([['stats', JSON.stringify(legacyStats(8000))], ['preferences', 'keep-me']]);
  const { c } = statsHarness(storage);
  c.listenStatsState = c.loadListenStatsState();
  const state = c.listenStatsState;
  assert(Object.keys(state.songs).length <= 2000);
  assert(Object.keys(state.artists).length <= 1000);
  assert(storage.get('stats').length * 2 <= 512 * 1024);
  assert.equal(c.homeListenSummary().totalPlays, 7999 * 2 + 999);
  assert(state.songs['song-0']);
  assert.equal(storage.get('preferences'), 'keep-me');
  c.saveListenStatsState();
  c.listenStatsState = c.loadListenStatsState();
  assert.equal(c.homeListenSummary().totalPlays, 7999 * 2 + 999);
});
test('statistics retry within quota without removing any other storage key', () => {
  const { c, storage, writes } = statsHarness(new Map([['preferences', 'saved']]), 64 * 1024);
  c.listenStatsState = legacyStats(2000);
  c.saveListenStatsState();
  assert(storage.get('stats').length * 2 <= 64 * 1024);
  assert(writes.length > 1);
  assert.equal(c.homeListenSummary().totalPlays, 1999 * 2 + 999);
  assert.equal(storage.get('preferences'), 'saved');
});
test('daily details remain bounded without resetting total listening time', () => {
  const { c, storage } = statsHarness();
  const daily = {};
  for (let i = 0; i < 1000; i++) daily[String(i).padStart(4, '0')] = { listenMs: 1 };
  storage.set('mineradio-listen-rollup-v2', JSON.stringify({ totalListenMs: 123456, sessions: 1000, daily }));
  const rollup = c.loadListenRollupV2();
  assert.equal(Object.keys(rollup.daily).length, 730);
  assert.equal(rollup.totalListenMs, 123456);
  assert.equal(rollup.sessions, 1000);
});
function memoryHarness() {
  const c = vm.createContext({});
  const source = read('public/js/modules/00-state/03-beat-dj-state.js');
  vm.runInContext(source.slice(0, source.indexOf('var targetVolume')), c);
  return c;
}
test('beat memory uses LRU, accounts for replacements and leaves active maps intact', () => {
  const c = memoryHarness(), cache = c.createBeatMapMemoryCache(2048, 2);
  const active = { beats: [1, 2, 3] };
  cache.a = active; cache.b = { beats: [4] };
  assert.strictEqual(cache.a, active);
  cache.c = { beats: [5] };
  assert.equal(cache.b, undefined);
  assert.deepEqual(active.beats, [1, 2, 3]);
  cache.a = { beats: [6] };
  assert.equal(Object.keys(cache).length, 2);
  cache.huge = { samples: new Uint8Array(3000) };
  assert.equal(cache.huge, undefined);
  delete cache.a;
  assert.equal(Object.keys(cache).length, 1);
});
test('both beat modes stop accumulating after hundreds of tracks', () => {
  const c = memoryHarness();
  for (const mode of ['mr', 'dj']) {
    const cache = c.createBeatMapMemoryCache();
    for (let i = 0; i < 400; i++) cache[mode + i] = { beats: [i] };
    assert.equal(Object.keys(cache).length, 24);
    assert.equal(cache[mode + '0'], undefined);
    assert(cache[mode + '399']);
  }
});
async function withCache(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mineradio-cache-fixture-'));
  try { await fn(dir); } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
}
test('disk pruning enforces size/count and ignores user files, folders and current packages', async () => withCache(async dir => {
  const names = [1, 2, 3, 4].map(i => String(i).repeat(64) + '.pkg');
  for (let i = 0; i < names.length; i++) {
    const file = path.join(dir, names[i]);
    await fs.promises.writeFile(file, Buffer.alloc(8));
    await fs.promises.utimes(file, new Date(1000 + i), new Date(1000 + i));
  }
  await fs.promises.writeFile(path.join(dir, 'notes.txt'), 'keep');
  await fs.promises.mkdir(path.join(dir, 'folder'));
  await fs.promises.writeFile(path.join(dir, 'folder', names[0]), 'keep');
  const prune = createGeneratedCachePruner({ root: dir, pattern: /^[a-f0-9]{64}\.pkg$/, maxBytes: 16, maxEntries: 2, keep: () => [path.join(dir, names[0])] });
  await Promise.all([prune(), prune(), prune()]);
  assert.deepEqual((await fs.promises.readdir(dir)).filter(n => n.endsWith('.pkg')).sort(), [names[0], names[3]]);
  assert.equal(await fs.promises.readFile(path.join(dir, 'notes.txt'), 'utf8'), 'keep');
  assert.equal(await fs.promises.readFile(path.join(dir, 'folder', names[0]), 'utf8'), 'keep');
}));
test('one oversized active package stays usable; after release it can be evicted', async () => withCache(async dir => {
  const file = path.join(dir, 'a'.repeat(64) + '.pkg');
  await fs.promises.writeFile(file, Buffer.alloc(10));
  let pinned = true;
  const prune = createGeneratedCachePruner({ root: dir, pattern: /^[a-f0-9]{64}\.pkg$/, maxBytes: 8, keep: () => pinned ? [file] : [] });
  await prune(); assert(fs.existsSync(file));
  pinned = false; await prune(); assert(!fs.existsSync(file));
}));

test('server beat persistence prunes legacy entries and rejects oversized writes', async () => withCache(async dir => {
  const source = read('server.js');
  let pending;
  const c = vm.createContext({ fs, path, crypto: require('node:crypto'), Buffer, Date, console,
    BEATMAP_CACHE_DIR: dir,
    createGeneratedCachePruner: opts => {
      const prune = createGeneratedCachePruner({ ...opts, maxBytes: 1024 });
      return () => (pending = prune());
    }
  });
  vm.runInContext(source.slice(source.indexOf("let beatCachePinnedFile = ''"), source.indexOf('function localUpdateFallback(')), c);
  for (let i = 0; i < 12; i++) c.writeBeatMapCache({ key: 'fixture-' + i, map: { beats: [i], data: 'x'.repeat(50) } });
  await pending;
  const remaining = await fs.promises.readdir(dir);
  const total = remaining.reduce((bytes, name) => bytes + fs.statSync(path.join(dir, name)).size, 0);
  assert(total <= 1024);
  assert.equal(c.readBeatMapCache('fixture-11').map.beats[0], 11);
  assert.equal(c.writeBeatMapCache({ key: 'large', map: { data: 'x'.repeat(8 * 1024 * 1024) } }).error, 'BEATMAP_CACHE_TOO_LARGE');
  assert(!fs.existsSync(c.safeBeatMapCacheFile('large')));
}));
test('wallpaper cache pins both active and preparing sessions during concurrent cleanup', async () => withCache(async dir => {
  const { WallpaperEngineRuntime } = require('../desktop/wallpaper-engine-runtime');
  const cacheRoot = path.join(dir, 'wallpaper-engine-muted-package-cache');
  await fs.promises.mkdir(cacheRoot);
  const files = [1, 2, 3].map(i => path.join(cacheRoot, String(i).repeat(64) + '.pkg'));
  for (const file of files) { await fs.promises.writeFile(file, 'fixture'); await fs.promises.utimes(file, new Date(1), new Date(1)); }
  const runtime = Object.create(WallpaperEngineRuntime.prototype);
  runtime.nativeTempPath = dir;
  runtime.active = { mutedScenePackageCacheFile: files[0] };
  runtime.pending = { mutedScenePackageCacheFile: files[1] };
  await Promise.all([runtime._pruneMutedScenePackages(files[2]), runtime._pruneMutedScenePackages()]);
  assert(files.every(file => fs.existsSync(file)));
  runtime.active = null; runtime.pending = null;
  await runtime._pruneMutedScenePackages();
  assert(files.every(file => !fs.existsSync(file)));
}));
