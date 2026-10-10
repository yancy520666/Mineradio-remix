'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { createSpillRelay, cleanupStaleSpillFiles } = require('../audio-spill-relay');

const CHUNK = 64 * 1024;

function payload(bytes) {
  return crypto.randomBytes(bytes);
}

// Serves `data` through the relay as an upstream would deliver it: chunk by
// chunk, without waiting for the client.
async function scenario({ data, memoryLimit, directory, client }) {
  let relay;
  let relayDone;
  const server = http.createServer(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/flac', 'Content-Length': String(data.length) });
    relay = createSpillRelay(res, { memoryLimit, directory });
    relayDone = relay.done;
    for (let offset = 0; offset < data.length; offset += CHUNK) {
      await relay.push(new Uint8Array(data.subarray(offset, offset + CHUNK)));
      if (offset % (CHUNK * 8) === 0) await new Promise(resolve => setImmediate(resolve));
    }
    relay.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const received = await client(server.address().port, () => relay);
    const stats = await relayDone;
    return { received, stats };
  } finally {
    server.close();
  }
}

function slowClient(pauseMs) {
  return (port, getRelay) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/' }, res => {
      const parts = [];
      res.pause();
      // Like a paused <audio>: stop reading until the upstream has finished.
      setTimeout(() => {
        res.on('data', part => parts.push(part));
        res.on('end', () => resolve({ body: Buffer.concat(parts), relay: getRelay() }));
        res.resume();
      }, pauseMs);
    }).on('error', reject);
  });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-spill-test-'));
}

test('a client that stops reading keeps relay memory capped and receives identical bytes', async () => {
  const directory = tempDir();
  try {
    const data = payload(24 * 1024 * 1024);
    const memoryLimit = 1024 * 1024;
    const { received, stats } = await scenario({ data, memoryLimit, directory, client: slowClient(400) });
    assert.ok(received.body.equals(data), 'bytes and order preserved');
    assert.ok(stats.spilledBytes > 0, 'overflow went to disk');
    assert.ok(stats.peakMemoryBytes <= memoryLimit, `peak ${stats.peakMemoryBytes} within ${memoryLimit}`);
    assert.equal(stats.spillFailed, false);
    assert.deepEqual(fs.readdirSync(directory), [], 'spill file removed after the response ends');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a reading client never touches the disk at the default 16 MB window', async () => {
  const directory = tempDir();
  try {
    const data = payload(6 * 1024 * 1024);
    const { received, stats } = await scenario({ data, directory, client: slowClient(0) });
    assert.ok(received.body.equals(data));
    assert.equal(stats.spilledBytes, 0);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('closing the player mid-song removes the spill file', async () => {
  const directory = tempDir();
  try {
    const data = payload(16 * 1024 * 1024);
    const { stats } = await scenario({
      data, memoryLimit: 256 * 1024, directory,
      client: port => new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/' }, res => {
          res.pause();
          setTimeout(() => { req.destroy(); resolve(null); }, 300);
        });
        req.on('error', error => (error.code === 'ECONNRESET' ? resolve(null) : reject(error)));
      }),
    });
    assert.ok(stats.spilledBytes > 0, 'the scenario did spill before the close');
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an unusable spill directory applies bounded memory backpressure', async () => {
  const directory = tempDir();
  const blocked = path.join(directory, 'not-a-directory');
  fs.writeFileSync(blocked, 'x');
  try {
    const data = payload(8 * 1024 * 1024);
    const { received, stats } = await scenario({ data, memoryLimit: 256 * 1024, directory: blocked, client: slowClient(300) });
    assert.ok(received.body.equals(data), 'playback data still complete and ordered');
    assert.equal(stats.spillFailed, true);
    assert.ok(stats.peakMemoryBytes <= 256 * 1024);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('startup cleanup removes files of exited processes only', () => {
  const directory = tempDir();
  try {
    const own = path.join(directory, `spill-${process.pid}-abc123.tmp`);
    const dead = path.join(directory, 'spill-999999-def456.tmp');
    const unrelated = path.join(directory, 'keep.txt');
    for (const file of [own, dead, unrelated]) fs.writeFileSync(file, 'x');
    assert.equal(cleanupStaleSpillFiles(directory), 1);
    assert.deepEqual(fs.readdirSync(directory).sort(), [path.basename(unrelated), path.basename(own)].sort());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function shortWriteScenario(writePlan) {
  let disk = Buffer.alloc(256 * 1024);
  let diskSize = 0;
  let writes = 0;
  const handle = {
    close: async () => {},
    write: async (buf, offset, length, position) => {
      const accepted = writePlan(++writes, length);
      if (accepted instanceof Error) throw accepted;
      buf.copy(disk, position, offset, offset + accepted);
      diskSize = Math.max(diskSize, position + accepted);
      return { bytesWritten: accepted };
    },
    read: async (buf, offset, length, position) => {
      const bytesRead = Math.min(length, diskSize - position);
      disk.copy(buf, offset, position, position + bytesRead);
      return { bytesRead };
    },
  };
  const fakeFs = { promises: { mkdir: async () => {}, open: async () => handle, unlink: async () => {} }, unlinkSync: () => {} };
  const context = vm.createContext({ Buffer, setImmediate, module: { exports: {} }, process: { pid: 123, once: () => {}, env: {} }, require: name => name === 'fs' ? fakeFs : require(name) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'audio-spill-relay.js'), 'utf8'), context);
  const res = new EventEmitter();
  res.writableNeedDrain = true;
  const received = [];
  res.write = buf => { received.push(Buffer.from(buf)); return true; };
  res.end = () => res.emit('close');
  res.destroy = () => { res.destroyed = true; res.emit('close'); };
  const relay = context.module.exports.createSpillRelay(res, { memoryLimit: CHUNK, directory: '/isolated-fake' });
  const chunks = [Buffer.alloc(CHUNK, 1), Buffer.alloc(CHUNK, 2), Buffer.alloc(CHUNK, 3)];
  const producer = (async () => { for (const chunk of chunks) await relay.push(chunk); })();
  await new Promise(resolve => setImmediate(resolve));
  res.writableNeedDrain = false;
  res.emit('drain');
  await producer;
  const stats = await relay.end();
  assert(stats.peakMemoryBytes <= CHUNK, 'failed spill also respects the queue budget');
  assert(Buffer.concat(received).equals(Buffer.concat(chunks)), 'no missing or duplicated bytes after replay');
  assert.notEqual(res.destroyed, true);
  return { stats, writes };
}

test('spill retries short writes at the actual offset until every byte is stored', async () => {
  const { stats, writes } = await shortWriteScenario((_attempt, length) => Math.min(10000, length));
  assert(writes > 2);
  assert.equal(stats.spilledBytes, CHUNK * 2);
  assert.equal(stats.spillFailed, false);
});

test('a spill failure after a short prefix queues only the unwritten suffix', async () => {
  const { stats, writes } = await shortWriteScenario(attempt => attempt === 1 ? 12345 : new Error('disk full'));
  assert.equal(writes, 2);
  assert.equal(stats.spilledBytes, 12345);
  assert.equal(stats.spillFailed, true);
});

test('a zero-progress spill write stops retrying and safely falls back to memory', async () => {
  const { stats, writes } = await shortWriteScenario(() => 0);
  assert.equal(writes, 1);
  assert.equal(stats.spilledBytes, 0);
  assert.equal(stats.spillFailed, true);
});

function blockedDiskRelay() {
  const directory = tempDir();
  const blocked = path.join(directory, 'file'); fs.writeFileSync(blocked, 'x');
  const res = new EventEmitter(), received = [];
  res.writableNeedDrain = true;
  res.write = chunk => { received.push(Buffer.from(chunk)); return true; };
  res.end = () => res.emit('close'); res.destroy = res.end;
  return { directory, res, received, relay: createSpillRelay(res, { memoryLimit: CHUNK, directory: blocked }) };
}
test('failed spill splits an oversized chunk and waits until the reader resumes', async () => {
  const fixture = blockedDiskRelay();
  const { directory, res, received, relay } = fixture;
  try {
    const first = Buffer.alloc(CHUNK, 1), large = Buffer.alloc(CHUNK * 8, 2);
    await relay.push(first);
    let returned = false;
    const producer = relay.push(large).then(() => { returned = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(returned, false, 'upstream waits while paused instead of queuing all bytes');
    assert.equal(relay.stats.spillFailed, true);
    assert(relay.stats.peakMemoryBytes <= CHUNK);
    res.writableNeedDrain = false; res.emit('drain');
    await producer; await relay.end();
    assert(Buffer.concat(received).equals(Buffer.concat([first, large])));
    assert(relay.stats.peakMemoryBytes <= CHUNK);
  } finally { await relay.abort(); fs.rmSync(directory, { recursive: true, force: true }); }
});
for (const action of ['abort', 'close']) {
  test(`failed-spill backpressure releases the waiting producer on ${action}`, async () => {
    const { directory, res, relay } = blockedDiskRelay();
    try {
      await relay.push(Buffer.alloc(CHUNK));
      let returned = false;
      const producer = relay.push(Buffer.alloc(CHUNK * 4)).then(() => { returned = true; });
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(returned, false);
      if (action === 'abort') await relay.abort(); else res.emit('close');
      await producer; await relay.done;
      assert.equal(relay.pendingBytes(), 0);
      assert(relay.stats.peakMemoryBytes <= CHUNK);
    } finally { await relay.abort(); fs.rmSync(directory, { recursive: true, force: true }); }
  });
}

test('queued head owns its bounded bytes rather than the upstream backing buffer', async () => {
  const { directory, res, received, relay } = blockedDiskRelay();
  try {
    const backing = Buffer.alloc(CHUNK * 64, 7);
    const chunk = backing.subarray(CHUNK, CHUNK * 2);
    await relay.push(chunk);
    backing.fill(9);
    res.writableNeedDrain = false; res.emit('drain'); await relay.end();
    assert(Buffer.concat(received).equals(Buffer.alloc(CHUNK, 7)), 'head owns a copy, not the caller backing buffer');
    assert.equal(relay.stats.peakMemoryBytes, CHUNK);
  } finally { await relay.abort(); fs.rmSync(directory, { recursive: true, force: true }); }
});
