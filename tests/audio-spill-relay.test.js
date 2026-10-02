'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
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

test('an unusable spill directory falls back to the previous in-memory behaviour', async () => {
  const directory = tempDir();
  const blocked = path.join(directory, 'not-a-directory');
  fs.writeFileSync(blocked, 'x');
  try {
    const data = payload(8 * 1024 * 1024);
    const { received, stats } = await scenario({ data, memoryLimit: 256 * 1024, directory: blocked, client: slowClient(300) });
    assert.ok(received.body.equals(data), 'playback data still complete and ordered');
    assert.equal(stats.spillFailed, true);
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
