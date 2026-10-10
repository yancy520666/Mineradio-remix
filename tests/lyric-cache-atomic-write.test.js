'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');
const { createCacheReleaseCoordinator } = require('../desktop/cache-release');
const source = fs.readFileSync(path.join(__dirname, '..', 'desktop/main.js'), 'utf8');

function fixture(t, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-owned-write-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const handlers = new Map();
  const file = path.join(root, 'a'.repeat(64) + '.json');
  const legacy = file + '.tmp';
  fs.writeFileSync(file, 'old final');
  fs.writeFileSync(legacy, 'legacy unknown');
  let active, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const io = { ...fs, promises: new Proxy(fs.promises, {
    get(target, key) {
      if (key === 'open') return async (...args) => {
        const handle = await target.open(...args);
        if (mode === 'write') handle.writeFile = async () => { throw new Error('injected write'); };
        if (mode === 'close') {
          const close = handle.close.bind(handle);
          let failed = false;
          handle.close = async () => {
            if (!failed) { failed = true; throw new Error('injected close'); }
            return close();
          };
        }
        return handle;
      };
      if (key === 'rename') return async (...args) => {
        active = args[0];
        if (mode === 'rename') throw new Error('injected rename');
        if (mode === 'paused') await barrier;
        return target.rename(...args);
      };
      return target[key];
    },
  }) };
  const context = vm.createContext({
    fs: io, path, crypto, process, Buffer, console,
    cacheSettings: { lyricsPath: root },
    LYRIC_CACHE_VERSION: 1,
    LYRIC_CACHE_ENTRY_MAX_BYTES: 1024 * 1024,
    cacheReleaseCoordinator: createCacheReleaseCoordinator(),
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    lyricCacheFilePath: () => file,
    pruneLyricCache: async () => {},
  });
  const begin = source.indexOf("ipcMain.handle('mineradio-cache-write-lyric'");
  const end = source.indexOf("ipcMain.handle('desktop-window-close'", begin);
  assert(begin >= 0 && end > begin);
  vm.runInContext(source.slice(begin, end), context);
  return { root, file, legacy, context,
    write: handlers.get('mineradio-cache-write-lyric'), active: () => active, release };
}

for (const mode of ['write', 'rename', 'close']) {
  test(mode + ' failure only removes own new temp and preserves old final/unknown legacy', async t => {
    const h = fixture(t, mode);
    assert.equal((await h.write({}, 'key', { lyric: 'new' }, 0)).ok, false);
    assert.equal(fs.readFileSync(h.file, 'utf8'), 'old final');
    assert.equal(fs.readFileSync(h.legacy, 'utf8'), 'legacy unknown');
    assert.equal(fs.readdirSync(h.root).length, 2);
  });
}

test('success publishes complete record and leaves unrelated legacy untouched', async t => {
  const h = fixture(t);
  assert.equal((await h.write({}, 'key', { lyric: 'new' }, 0)).ok, true);
  assert.equal(JSON.parse(fs.readFileSync(h.file)).payload.lyric, 'new');
  assert.equal(fs.readFileSync(h.legacy, 'utf8'), 'legacy unknown');
  assert.equal(fs.readdirSync(h.root).length, 2);
});

test('exclusive collision cannot overwrite or remove existing temp', async t => {
  const h = fixture(t);
  h.context.crypto = { randomBytes: () => ({ toString: () => 'b'.repeat(24) }) };
  const collision = h.file + '.' + process.pid + '.' + 'b'.repeat(24) + '.tmp';
  fs.writeFileSync(collision, 'other writer');
  assert.equal((await h.write({}, 'key', { lyric: 'new' }, 0)).ok, false);
  assert.equal(fs.readFileSync(collision, 'utf8'), 'other writer');
  assert.equal(fs.readFileSync(h.file, 'utf8'), 'old final');
});

test('live paused atomic writer retains temp until publish', async t => {
  const h = fixture(t, 'paused');
  const work = h.write({}, 'key', { lyric: 'new' }, 0);
  try {
    while (!h.active()) await new Promise(resolve => setImmediate(resolve));
    assert(fs.existsSync(h.active()));
    assert.equal(fs.readFileSync(h.file, 'utf8'), 'old final');
  } finally {
    h.release();
  }
  assert.equal((await work).ok, true);
  assert(!fs.existsSync(h.active()));
});

test('stale generation cannot create a temp', async t => {
  const h = fixture(t);
  const result = await h.write({}, 'key', { lyric: 'new' }, 99);
  assert.equal(result.error, 'CACHE_GENERATION_CHANGED');
  assert.equal(fs.readdirSync(h.root).length, 2);
});
