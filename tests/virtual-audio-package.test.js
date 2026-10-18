'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const FAKE_TEMP_ROOT = path.join(path.parse(path.resolve(__dirname)).root, 'tmp', 'fake');
const { DOWNLOAD_URL, ZIP_BYTES, ZIP_SHA256, SETUP_NAME, EXTRACTED_BYTES,
  DOWNLOAD_TIMEOUT_MS, CACHE_NAME, ARCHIVE_NAME, OWNER_MARKER, MAX_RETAINED_PACKAGES,
  PACKAGE_MANIFEST, createVirtualAudioPackagePreparer, verifyArchive } = require('../desktop/virtual-audio-package');

// Every archive below is generated from inert text in memory. Network, files,
// timers, and all executable contents are fake. No official binary is read,
// downloaded, signed, spawned, or installed by these unit tests.
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function fixtureArchive(input, { method = 8, gap = false, trailingDeflate = false } = {}) {
  const files = input || [
    { name: SETUP_NAME, data: Buffer.from('INERT SYNTHETIC SETUP TEXT; NOT AN EXECUTABLE\n') },
    { name: 'readme.txt', data: Buffer.from('Synthetic package license and readme, byte-for-byte.\r\n') },
    { name: 'driver.inf', data: Buffer.from('INERT SYNTHETIC DRIVER TEXT\n') },
  ];
  const local = [], central = [], metadata = [];
  let offset = 0;
  for (const file of files) {
    const data = Buffer.from(file.data);
    const name = Buffer.from(file.name, 'ascii');
    let compressed = method === 8 ? zlib.deflateRawSync(data) : data;
    if (trailingDeflate && method === 8) compressed = Buffer.concat([compressed, Buffer.from([0])]);
    const size = file.declaredSize === undefined ? data.length : file.declaredSize;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(crc32(data), 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(size, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(0x81b40020, 38);
    record.writeUInt32LE(offset, 42);
    metadata.push({ local: offset, nameLength: name.length });
    local.push(header, name, compressed);
    central.push(record, name);
    offset += header.length + name.length + compressed.length;
    if (gap) { local.push(Buffer.from([0])); offset++; }
  }
  const localBuffer = Buffer.concat(local);
  const centralBuffer = Buffer.concat(central);
  let cursor = localBuffer.length;
  for (const item of metadata) { item.central = cursor; cursor += 46 + item.nameLength; }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(localBuffer.length, 16);
  const buffer = Buffer.concat([localBuffer, centralBuffer, end]);
  const manifest = files.map(file => ({ name: file.name,
    size: file.declaredSize === undefined ? file.data.length : file.declaredSize,
    sha256: file.expectedHash || digest(file.data) }));
  const policy = { bytes: buffer.length, sha256: digest(buffer), manifest,
    extractedBytes: manifest.reduce((sum, file) => sum + file.size, 0),
    setupName: files.some(file => file.name === SETUP_NAME) ? SETUP_NAME : files[0].name };
  return { buffer, policy, metadata, files };
}
function changed(fixture, change) {
  const buffer = Buffer.from(fixture.buffer);
  change(buffer, fixture.metadata, buffer.length - 22);
  return { ...fixture, buffer, policy: { ...fixture.policy, bytes: buffer.length, sha256: digest(buffer) } };
}
function renameRecord(buffer, item, name) {
  assert.equal(Buffer.byteLength(name), item.nameLength);
  buffer.write(name, item.local + 30, 'ascii');
  buffer.write(name, item.central + 46, 'ascii');
}

function fakeFilesystem() {
  const nodes = new Map();
  const calls = [];
  let inode = 1, unique = 0;
  const state = { writeHook: null, openHook: null };
  const fail = (code, name) => Object.assign(new Error(code + ': ' + name), { code });
  const put = (name, type, data = Buffer.alloc(0)) => {
    const node = { type, data: Buffer.from(data), ino: inode++, dev: 1 };
    nodes.set(name, node);
    return node;
  };
  for (const name of [path.parse(FAKE_TEMP_ROOT).root, path.dirname(FAKE_TEMP_ROOT), FAKE_TEMP_ROOT]) put(name, 'directory');
  const get = name => { if (!nodes.has(name)) throw fail('ENOENT', name); return nodes.get(name); };
  const stat = node => ({ dev: node.dev, ino: node.ino, size: node.data.length,
    isDirectory: () => node.type === 'directory', isFile: () => node.type === 'file',
    isSymbolicLink: () => node.type === 'symlink' });
  const children = name => [...nodes.keys()].filter(child => child !== name && path.dirname(child) === name).map(child => path.basename(child));
  const filesystem = {
    async lstat(name) { calls.push(['lstat', name]); return stat(get(name)); },
    async mkdir(name, options) {
      calls.push(['mkdir', name, options]);
      if (nodes.has(name)) throw fail('EEXIST', name);
      if (get(path.dirname(name)).type !== 'directory') throw fail('ENOTDIR', name);
      put(name, 'directory');
    },
    async mkdtemp(prefix) {
      calls.push(['mkdtemp', prefix]);
      const name = prefix + String(++unique).padStart(6, '0');
      await filesystem.mkdir(name, { mode: 0o700 });
      return name;
    },
    async readdir(name) { calls.push(['readdir', name]); get(name); return children(name); },
    async readFile(name, encoding) {
      calls.push(['readFile', name]);
      const node = get(name);
      if (node.type !== 'file') throw fail('EINVAL', name);
      return encoding ? node.data.toString(encoding) : Buffer.from(node.data);
    },
    async open(name, flags, mode) {
      calls.push(['open', name, flags, mode]);
      if (state.openHook) state.openHook(name);
      assert.equal(flags, 'wx');
      if (nodes.has(name)) throw fail('EEXIST', name);
      if (get(path.dirname(name)).type !== 'directory') throw fail('ENOTDIR', name);
      const node = put(name, 'file');
      return { async stat() { return stat(node); }, async writeFile(data) {
        node.data = Buffer.from(data);
        if (state.writeHook) await state.writeHook(name, node);
      }, async sync() { calls.push(['sync', name]); }, async close() { calls.push(['close', name]); } };
    },
    async unlink(name) { calls.push(['unlink', name]); get(name); nodes.delete(name); },
    async rmdir(name) {
      calls.push(['rmdir', name]);
      if (get(name).type !== 'directory') throw fail('ENOTDIR', name);
      if (children(name).length) throw fail('ENOTEMPTY', name);
      nodes.delete(name);
    },
  };
  return { filesystem, nodes, calls, put, state, children };
}

function fakeNetwork(buffer, routes = []) {
  const calls = [], responses = [];
  let destroyedRequests = 0;
  const request = (url, options, callback) => {
    const index = calls.length;
    calls.push({ url: url.href, options });
    const route = routes[index] || {};
    const req = new EventEmitter();
    req.destroyed = false;
    req.destroy = () => { req.destroyed = true; destroyedRequests++; };
    req.end = () => queueMicrotask(() => {
      if (req.destroyed) return;
      if (route.error) { req.emit('error', new Error(route.error)); return; }
      const response = new EventEmitter();
      response.headers = { 'content-length': String(buffer.length), ...route.headers };
      if (route.noLength) delete response.headers['content-length'];
      response.statusCode = route.status === undefined ? 200 : route.status;
      response.complete = route.complete !== false;
      response.destroyed = false;
      response.destroy = () => { response.destroyed = true; queueMicrotask(() => response.emit('close')); };
      responses.push(response);
      callback(response);
      if (route.hang || response.destroyed) return;
      queueMicrotask(() => {
        for (const chunk of route.chunks || [buffer]) {
          if (response.destroyed) return;
          response.emit('data', chunk);
        }
        if (response.destroyed) return;
        if (route.aborted) response.emit('aborted');
        else if (route.closeOnly) response.emit('close');
        else { response.emit('end'); response.emit('close'); }
      });
    });
    return req;
  };
  return { request, calls, responses, get destroyedRequests() { return destroyedRequests; } };
}
function fakeTimers() {
  const timers = [];
  return { timers, setTimer(callback, delay) { const timer = { callback, delay, active: true }; timers.push(timer); return timer; },
    clearTimer(timer) { if (timer) timer.active = false; }, fire() { for (const timer of timers) if (timer.active) timer.callback(); } };
}
function preparationFixture(archive = fixtureArchive(), routes = [], sharedFs) {
  const disk = sharedFs || fakeFilesystem();
  const network = fakeNetwork(archive.buffer, routes);
  const timers = fakeTimers();
  const prepare = createVirtualAudioPackagePreparer({ filesystem: disk.filesystem, tempRoot: FAKE_TEMP_ROOT,
    request: network.request, archivePolicy: archive.policy, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  return { archive, disk, network, timers, prepare };
}
async function until(predicate) {
  for (let tries = 0; tries < 1000; tries++) { if (predicate()) return; await Promise.resolve(); }
  throw new Error('Synthetic asynchronous operation did not reach its expected state.');
}
const packageDirectories = disk => [...disk.nodes.keys()].filter(name => /^pack45-[a-zA-Z0-9_-]+$/.test(path.basename(name)));

test('official package pins and complete license/readme manifest are immutable', () => {
  assert.equal(DOWNLOAD_URL, 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip');
  assert.equal(ZIP_BYTES, 1318877);
  assert.equal(ZIP_SHA256, 'b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb');
  assert.equal(PACKAGE_MANIFEST.length, 31);
  assert.equal(PACKAGE_MANIFEST.reduce((sum, file) => sum + file.size, 0), EXTRACTED_BYTES);
  assert.equal(PACKAGE_MANIFEST.find(file => file.name === SETUP_NAME).sha256, '734c35dfa6d98f48782a451633ceb471166ec70d60482fd89a1123d0ee3c4f41');
  assert.equal(PACKAGE_MANIFEST.find(file => file.name === 'readme.txt').sha256, 'f865f3e78e37006d48e56c93f51eff4ca79acda9969854400d79bfa3db38a8d5');
  assert.ok(Object.isFrozen(PACKAGE_MANIFEST));
  assert.ok(PACKAGE_MANIFEST.every(Object.isFrozen));
  assert.throws(() => verifyArchive(fixtureArchive().buffer), { code: 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY' });
});

for (const method of [0, 8]) test('synthetic ZIP verifies all text files and preserves every byte, method ' + method, () => {
  const archive = fixtureArchive(undefined, { method });
  const entries = verifyArchive(archive.buffer, archive.policy);
  assert.deepEqual(entries.map(entry => entry.name), archive.files.map(file => file.name));
  for (let index = 0; index < entries.length; index++) assert.deepEqual(entries[index].data, archive.files[index].data);
});

test('whole-archive size and SHA-256 are checked before ZIP parsing', () => {
  const archive = fixtureArchive();
  const buffer = Buffer.from(archive.buffer); buffer[0] ^= 1;
  assert.throws(() => verifyArchive(buffer, archive.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY' });
  assert.throws(() => verifyArchive(archive.buffer.subarray(1), archive.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY' });
});

for (const name of ['../bad.txt', '/readm.txt', '..\\bad.txt', 'C:evil.txt', 'readme.tx ', 'NUL.tx.txt']) {
  test('ZIP rejects unsafe flat Windows filename ' + name, () => {
    const archive = changed(fixtureArchive(), (buffer, meta) => renameRecord(buffer, meta[1], name));
    assert.throws(() => verifyArchive(archive.buffer, archive.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INVALID' });
  });
}
test('ZIP rejects duplicate and case-insensitive Windows collisions', () => {
  const archive = fixtureArchive([{ name: 'a.txt', data: Buffer.from('a') }, { name: 'b.txt', data: Buffer.from('b') }]);
  for (const name of ['a.txt', 'A.txt']) {
    const modified = changed(archive, (buffer, meta) => renameRecord(buffer, meta[1], name));
    assert.throws(() => verifyArchive(modified.buffer, modified.policy), /Duplicate|colliding/);
  }
});

const badMetadata = [
  ['symlink', (b, m) => b.writeUInt32LE(0xa1ff0020, m[0].central + 38)],
  ['directory', (b, m) => b.writeUInt32LE(0x41ed0010, m[0].central + 38)],
  ['encryption', (b, m) => b.writeUInt16LE(1, m[0].central + 8)],
  ['data descriptor', (b, m) => b.writeUInt16LE(8, m[0].central + 8)],
  ['unsupported compression', (b, m) => b.writeUInt16LE(12, m[0].central + 10)],
  ['ZIP64 version', (b, m) => b.writeUInt16LE(45, m[0].central + 6)],
  ['ZIP64 size sentinel', (b, m) => b.writeUInt32LE(0xffffffff, m[0].central + 24)],
  ['extra fields', (b, m) => b.writeUInt16LE(1, m[0].central + 30)],
  ['entry comments', (b, m) => b.writeUInt16LE(1, m[0].central + 32)],
  ['non-ASCII filename', (b, m) => { b[m[0].central + 46] = 0x80; }],
  ['split archive', (b, _m, end) => b.writeUInt16LE(1, end + 4)],
  ['archive comment', (b, _m, end) => b.writeUInt16LE(1, end + 20)],
  ['unsupported entry count', (b, _m, end) => { b.writeUInt16LE(2, end + 8); b.writeUInt16LE(2, end + 10); }],
  ['ZIP64 count sentinel', (b, _m, end) => { b.writeUInt16LE(0xffff, end + 8); b.writeUInt16LE(0xffff, end + 10); }],
];
for (const [name, mutate] of badMetadata) test('ZIP rejects ' + name, () => {
  const archive = changed(fixtureArchive(), mutate);
  assert.throws(() => verifyArchive(archive.buffer, archive.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INVALID' });
});
for (const [name, offset] of [['version', 4], ['flags', 6], ['compression', 8], ['time', 10], ['CRC', 14], ['compressed size', 18], ['size', 22], ['name length', 26], ['extras', 28]]) {
  test('ZIP rejects local/central disagreement in ' + name, () => {
    const archive = changed(fixtureArchive(), (buffer, meta) => { buffer[meta[0].local + offset] ^= 1; });
    assert.throws(() => verifyArchive(archive.buffer, archive.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INVALID' });
  });
}
test('ZIP rejects changed local names, gaps, trailing compressed bytes, CRC mismatch and per-file SHA mismatch', () => {
  const mismatch = changed(fixtureArchive(), (buffer, meta) => { buffer[meta[0].local + 30] ^= 1; });
  assert.throws(() => verifyArchive(mismatch.buffer, mismatch.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INVALID' });
  for (const options of [{ gap: true }, { trailingDeflate: true }]) {
    const archive = fixtureArchive(undefined, options);
    assert.throws(() => verifyArchive(archive.buffer, archive.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INVALID' });
  }
  const crc = changed(fixtureArchive(), (buffer, meta) => {
    buffer.writeUInt32LE(1, meta[0].local + 14); buffer.writeUInt32LE(1, meta[0].central + 16);
  });
  assert.throws(() => verifyArchive(crc.buffer, crc.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY' });
  const archive = fixtureArchive(); archive.policy.manifest[0].sha256 = '0'.repeat(64);
  assert.throws(() => verifyArchive(archive.buffer, archive.policy), { code: 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY' });
});
test('bounded inflate rejects compressed text bombs and mismatched manifest sizes', () => {
  const archive = fixtureArchive([{ name: SETUP_NAME, data: Buffer.alloc(100000, 65), declaredSize: 1, expectedHash: digest(Buffer.from('A')) }]);
  assert.throws(() => verifyArchive(archive.buffer, archive.policy), /oversized/);
  const normal = fixtureArchive(); normal.policy.manifest[0].size++; normal.policy.extractedBytes++;
  assert.throws(() => verifyArchive(normal.buffer, normal.policy), /manifest/);
});

test('preparation writes only verified fake text files into a unique exact-payload directory and retains the raw archive', async () => {
  const f = preparationFixture();
  const progress = [];
  const result = await f.prepare({ onProgress: value => progress.push(value) });
  assert.equal(path.dirname(result.setupPath), result.directory);
  assert.equal(path.dirname(result.directory), result.packageDirectory);
  assert.deepEqual(f.disk.children(result.directory).sort(), f.archive.files.map(file => file.name).sort());
  assert.deepEqual(f.disk.nodes.get(result.archivePath).data, f.archive.buffer);
  assert.equal(path.basename(result.archivePath), ARCHIVE_NAME);
  const owner = JSON.parse(f.disk.nodes.get(path.join(result.packageDirectory, OWNER_MARKER)).data);
  assert.equal(owner.version, 1); assert.match(owner.token, /^[a-f0-9]{32}$/);
  for (const file of f.archive.files) assert.deepEqual(f.disk.nodes.get(path.join(result.directory, file.name)).data, file.data);
  assert.deepEqual(progress, [{ received: 0, total: f.archive.buffer.length }, { received: f.archive.buffer.length, total: f.archive.buffer.length }]);
  assert.equal(f.network.calls[0].url, DOWNLOAD_URL);
  assert.equal(f.network.calls[0].options.rejectUnauthorized, true);
  assert.equal(f.network.calls[0].options.minVersion, 'TLSv1.2');
  assert.equal(f.network.calls[0].options.headers['Accept-Encoding'], 'identity');
  assert.equal(f.timers.timers[0].delay, DOWNLOAD_TIMEOUT_MS);
  assert.equal(f.timers.timers[0].active, false);
  assert.ok(f.disk.calls.filter(call => call[0] === 'open').every(call => call[2] === 'wx' && call[3] === 0o600));
  await Promise.all([result.cleanup(), result.cleanup()]);
  await result.cleanup();
  assert.deepEqual(packageDirectories(f.disk), []);
  assert.ok(f.disk.nodes.has(path.join(FAKE_TEMP_ROOT, CACHE_NAME)));
});

test('at most two retained package slots survive and cleanup allows another reservation', async () => {
  assert.equal(MAX_RETAINED_PACKAGES, 2);
  const f = preparationFixture();
  const first = await f.prepare(), second = await f.prepare();
  assert.notEqual(first.packageDirectory, second.packageDirectory);
  await assert.rejects(f.prepare(), { code: 'VIRTUAL_AUDIO_PACKAGE_CACHE_FULL' });
  assert.equal(f.network.calls.length, 2);
  await first.cleanup();
  const third = await f.prepare();
  await second.cleanup(); await third.cleanup();
  assert.equal(packageDirectories(f.disk).length, 0);
});
test('a concurrent or stale cache creation lock prevents additional reservations without deleting it', async () => {
  const f = preparationFixture(); const first = await f.prepare();
  const lock = path.join(path.dirname(first.packageDirectory), '.prepare.lock');
  f.disk.put(lock, 'file', Buffer.from('inert lock owned elsewhere'));
  await assert.rejects(f.prepare(), { code: 'VIRTUAL_AUDIO_PACKAGE_BUSY' });
  assert.ok(f.disk.nodes.has(lock));
  await first.cleanup();
});
test('symlink parents and unowned pre-existing namespace roots are refused before network access', async () => {
  for (const kind of ['parent', 'root']) {
    const f = preparationFixture();
    if (kind === 'parent') f.disk.put(FAKE_TEMP_ROOT, 'symlink');
    else f.disk.put(path.join(FAKE_TEMP_ROOT, CACHE_NAME), 'directory');
    await assert.rejects(f.prepare());
    assert.equal(f.network.calls.length, 0);
    assert.equal(f.disk.calls.filter(call => call[0] === 'unlink').length, 0);
  }
});
test('cleanup refuses unexpected payload or parent files and never recursively removes user data', async () => {
  for (const location of ['directory', 'packageDirectory']) {
    const f = preparationFixture(); const result = await f.prepare();
    const userFile = path.join(result[location], 'unrelated-user-file.txt');
    f.disk.put(userFile, 'file', Buffer.from('keep this'));
    await assert.rejects(result.cleanup(), { code: 'VIRTUAL_AUDIO_PACKAGE_DIRECTORY' });
    assert.equal(f.disk.nodes.get(userFile).data.toString(), 'keep this');
    assert.ok(f.disk.nodes.has(path.join(result.packageDirectory, OWNER_MARKER)));
    assert.ok(f.disk.nodes.has(result.setupPath));
  }
});
test('cleanup refuses swapped directory, payload, file, and ownership marker identities', async () => {
  for (const swap of ['directory', 'payload', 'file', 'marker']) {
    const f = preparationFixture(); const result = await f.prepare();
    let replaced;
    if (swap === 'directory') { replaced = result.packageDirectory; f.disk.put(replaced, 'directory'); }
    if (swap === 'payload') { replaced = result.directory; f.disk.put(replaced, 'symlink'); }
    if (swap === 'file') { replaced = result.setupPath; f.disk.put(replaced, 'file', Buffer.from('keep replacement')); }
    if (swap === 'marker') { replaced = path.join(result.packageDirectory, OWNER_MARKER); f.disk.put(replaced, 'file', Buffer.from('changed marker')); }
    await assert.rejects(result.cleanup(), { code: 'VIRTUAL_AUDIO_PACKAGE_DIRECTORY' });
    assert.ok(f.disk.nodes.has(replaced));
    assert.ok(!f.disk.calls.some(call => call[0] === 'unlink' && call[1] === replaced));
  }
});

test('redirects permit only the identical official HTTPS URL and share one overall deadline', async () => {
  const redirect = { status: 302, headers: { location: DOWNLOAD_URL } };
  const f = preparationFixture(undefined, [redirect, redirect, {}]);
  const result = await f.prepare();
  assert.equal(f.network.calls.length, 3);
  assert.equal(f.timers.timers.length, 1);
  assert.ok(f.network.calls.every(call => call.url === DOWNLOAD_URL));
  assert.ok(f.network.responses.slice(0, 2).every(response => response.destroyed));
  await result.cleanup();
});
for (const location of ['http://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip',
  'https://evil.example/VBCABLE_Driver_Pack45.zip', 'https://download.vb-audio.com:444/Download_CABLE/VBCABLE_Driver_Pack45.zip',
  'https://download.vb-audio.com:443/Download_CABLE/VBCABLE_Driver_Pack45.zip',
  'https://@download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip',
  'https://user:password@download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip',
  DOWNLOAD_URL + '?new=1', DOWNLOAD_URL + '#fragment', 'https://download.vb-audio.com/another.zip']) {
  test('download rejects source-changing redirect ' + location, async () => {
    const f = preparationFixture(undefined, [{ status: 302, headers: { location } }]);
    await assert.rejects(f.prepare(), { code: 'VIRTUAL_AUDIO_DOWNLOAD_SOURCE' });
    assert.equal(f.network.calls.length, 1);
    assert.equal(packageDirectories(f.disk).length, 0);
  });
}
test('redirect loop is bounded to two hops', async () => {
  const redirect = { status: 302, headers: { location: DOWNLOAD_URL } };
  const f = preparationFixture(undefined, [redirect, redirect, redirect]);
  await assert.rejects(f.prepare(), { code: 'VIRTUAL_AUDIO_DOWNLOAD_SOURCE' });
  assert.equal(f.network.calls.length, 3);
  assert.equal(packageDirectories(f.disk).length, 0);
});

const badResponses = [
  ['unexpected status', { status: 503 }, 'VIRTUAL_AUDIO_DOWNLOAD_FAILED'],
  ['wrong content length', { headers: { 'content-length': '1' } }, 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY'],
  ['duplicate content length', { headers: { 'content-length': ['1', '2'] } }, 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY'],
  ['HTTP compressed body', { headers: { 'content-encoding': 'gzip' } }, 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY'],
  ['truncated body', { chunks: [Buffer.from('short')] }, 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY'],
  ['unbounded body', { noLength: true, chunks: [Buffer.alloc(20000)] }, 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY'],
  ['wrong pinned SHA', { noLength: true, corrupt: true }, 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY'],
  ['connection error', { error: 'synthetic connection error' }, 'VIRTUAL_AUDIO_DOWNLOAD_FAILED'],
  ['interrupted response', { aborted: true }, 'VIRTUAL_AUDIO_DOWNLOAD_FAILED'],
  ['incomplete HTTP response', { complete: false }, 'VIRTUAL_AUDIO_PACKAGE_INTEGRITY'],
  ['closed before end', { closeOnly: true }, 'VIRTUAL_AUDIO_DOWNLOAD_FAILED'],
];
for (const [name, route, code] of badResponses) test('download rejects ' + name + ' and removes only its failed fake package', async () => {
  const archive = fixtureArchive();
  if (route.corrupt) route.chunks = [Buffer.alloc(archive.buffer.length)];
  const f = preparationFixture(archive, [route]);
  const userFile = path.join(FAKE_TEMP_ROOT, 'user-file.txt'); f.disk.put(userFile, 'file', Buffer.from('untouched'));
  await assert.rejects(f.prepare(), { code });
  assert.equal(packageDirectories(f.disk).length, 0);
  assert.equal(f.disk.nodes.get(userFile).data.toString(), 'untouched');
  assert.equal(f.timers.timers[0].active, false);
});
test('a hung request is destroyed at the overall 60-second deadline using fake timers', async () => {
  const f = preparationFixture(undefined, [{ hang: true }]);
  const pending = f.prepare();
  await until(() => f.network.responses.length === 1);
  f.timers.fire();
  await assert.rejects(pending, { code: 'VIRTUAL_AUDIO_DOWNLOAD_TIMEOUT' });
  assert.equal(f.network.responses[0].destroyed, true);
  assert.equal(f.network.destroyedRequests, 1);
  assert.equal(packageDirectories(f.disk).length, 0);
});
test('cancellation before reservation, during download, and during extraction is safe and cleans owned fake files', async () => {
  for (const point of ['before', 'download', 'write']) {
    const controller = new AbortController();
    const f = preparationFixture(undefined, point === 'download' ? [{ hang: true }] : []);
    if (point === 'before') controller.abort();
    if (point === 'write') f.disk.state.writeHook = async name => { if (path.basename(name) === 'readme.txt') controller.abort(); };
    const pending = f.prepare({ signal: controller.signal });
    if (point === 'download') { await until(() => f.network.responses.length === 1); controller.abort(); }
    await assert.rejects(pending, { code: 'VIRTUAL_AUDIO_SETUP_CANCELLED', name: 'AbortError' });
    assert.equal(packageDirectories(f.disk).length, 0);
    if (point === 'before') assert.equal(f.network.calls.length, 0);
  }
});
test('progress callback cancellation stops the bounded response and thrown progress callbacks are inert', async () => {
  const archive = fixtureArchive(); const controller = new AbortController();
  const f = preparationFixture(archive, [{ chunks: [archive.buffer.subarray(0, 10), archive.buffer.subarray(10)] }]);
  await assert.rejects(f.prepare({ signal: controller.signal, onProgress: ({ received }) => { if (received) controller.abort(); } }),
    { code: 'VIRTUAL_AUDIO_SETUP_CANCELLED' });
  assert.equal(packageDirectories(f.disk).length, 0);
  const g = preparationFixture(); const result = await g.prepare({ onProgress: () => { throw new Error('inert UI callback'); } });
  await result.cleanup();
});
test('failed fake file writes remove partial owned files and exclusive creation never overwrites a pre-existing symlink', async () => {
  const f = preparationFixture();
  f.disk.state.writeHook = async name => { if (path.basename(name) === 'readme.txt') throw new Error('synthetic disk failure'); };
  await assert.rejects(f.prepare(), /synthetic disk failure/);
  assert.equal(packageDirectories(f.disk).length, 0);
  const g = preparationFixture(); let link;
  g.disk.state.openHook = name => { if (path.basename(name) === 'readme.txt') { link = name; g.disk.put(name, 'symlink'); } };
  await assert.rejects(g.prepare(), error => error.code === 'EEXIST' && error.cleanupError.code === 'VIRTUAL_AUDIO_PACKAGE_DIRECTORY');
  assert.equal(g.disk.nodes.get(link).type, 'symlink');
  assert.ok(!g.disk.calls.some(call => call[0] === 'unlink' && call[1] === link));
});
