'use strict';

// Relays an upstream audio stream to an HTTP response without changing how
// fast the upstream is read. When the client stops reading (pause, read-ahead
// satisfied), at most `memoryLimit` bytes wait in memory; the rest goes to a
// temporary file and is replayed in order once the client drains.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_MEMORY_LIMIT = 16 * 1024 * 1024;
const SPILL_READ_BYTES = 256 * 1024;
const SPILL_FILE_PREFIX = 'spill-';
const activeSpillFiles = new Set();
process.once('exit', () => {
  for (const target of activeSpillFiles) { try { fs.unlinkSync(target); } catch (_) {} }
});

function defaultSpillDirectory() {
  return process.env.MINERADIO_AUDIO_SPILL_DIR || path.join(os.tmpdir(), 'mineradio-audio-spill');
}

function processAlive(pid) {
  if (!pid || pid === process.pid) return pid === process.pid;
  try { process.kill(pid, 0); return true; } catch (error) { return error && error.code === 'EPERM'; }
}

// Removes files left by crashed processes. Files of running processes (an
// installed build and a dev build may share the temp directory) are kept.
function cleanupStaleSpillFiles(directory) {
  directory = directory || defaultSpillDirectory();
  let names = [];
  try { names = fs.readdirSync(directory); } catch (_) { return 0; }
  let removed = 0;
  for (const name of names) {
    const match = /^spill-(\d+)-[0-9a-f]+\.tmp$/.exec(name);
    if (!match || processAlive(Number(match[1]))) continue;
    try { fs.unlinkSync(path.join(directory, name)); removed += 1; } catch (_) {}
  }
  return removed;
}

function createSpillRelay(res, options) {
  options = options || {};
  const memoryLimit = Math.max(64 * 1024, Number(options.memoryLimit) || DEFAULT_MEMORY_LIMIT);
  const directory = options.directory || defaultSpillDirectory();
  const head = [];      // oldest pending bytes, in memory
  const tail = [];      // newest bytes, only used if the spill file failed
  let headBytes = 0;
  let tailBytes = 0;
  let file = null;
  let filePath = '';
  let fileOpening = null;
  let fileWrite = 0;
  let fileRead = 0;
  let spillDisabled = false;
  let ended = false;
  let closed = false;
  let finished = false;
  let pumping = false;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const stats = { spilledBytes: 0, peakMemoryBytes: 0, spillFailed: false };

  const filePending = () => fileRead < fileWrite;
  const pendingBytes = () => headBytes + (fileWrite - fileRead) + tailBytes;
  function noteMemory() {
    stats.peakMemoryBytes = Math.max(stats.peakMemoryBytes, headBytes + tailBytes);
  }

  async function releaseFile() {
    const handle = file;
    const target = filePath;
    file = null;
    filePath = '';
    if (target) activeSpillFiles.delete(target);
    if (handle) { try { await handle.close(); } catch (_) {} }
    if (target) { try { await fsp.unlink(target); } catch (_) {} }
  }

  function cleanup() {
    if (finished) return;
    finished = true;
    head.length = 0; tail.length = 0; headBytes = 0; tailBytes = 0;
    const opening = fileOpening;
    Promise.resolve(opening).catch(() => {}).then(releaseFile).then(() => resolveDone(stats));
  }

  function onClose() {
    closed = true;
    cleanup();
  }
  res.once('close', onClose);
  res.on('drain', () => { pump(); });

  async function openFile() {
    if (file) return file;
    if (!fileOpening) {
      fileOpening = (async () => {
        await fsp.mkdir(directory, { recursive: true });
        const name = SPILL_FILE_PREFIX + process.pid + '-' + crypto.randomBytes(6).toString('hex') + '.tmp';
        const target = path.join(directory, name);
        const handle = await fsp.open(target, 'wx+');
        if (finished) {
          try { await handle.close(); } catch (_) {}
          try { await fsp.unlink(target); } catch (_) {}
          return null;
        }
        file = handle;
        filePath = target;
        activeSpillFiles.add(target);
        return handle;
      })();
    }
    return fileOpening;
  }

  async function appendToFile(buf) {
    if (!spillDisabled) {
      try {
        const handle = await openFile();
        if (!handle) return;
        await handle.write(buf, 0, buf.length, fileWrite);
        fileWrite += buf.length;
        stats.spilledBytes += buf.length;
        return;
      } catch (_) {
        // Disk full or blocked: keep the old in-memory behaviour rather than
        // failing playback. Order is kept by queuing behind the file region.
        spillDisabled = true;
        stats.spillFailed = true;
      }
    }
    tail.push(buf);
    tailBytes += buf.length;
    noteMemory();
  }

  async function push(chunk) {
    if (closed || finished || ended || !chunk || !chunk.byteLength) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    if (!pendingBytes() && !res.writableNeedDrain) {
      res.write(buf);
      return;
    }
    if (!filePending() && !tailBytes && headBytes + buf.length <= memoryLimit) {
      head.push(buf);
      headBytes += buf.length;
      noteMemory();
    } else if (spillDisabled) {
      tail.push(buf);
      tailBytes += buf.length;
      noteMemory();
    } else {
      await appendToFile(buf);
    }
    if (!res.writableNeedDrain) pump();
  }

  async function pump() {
    if (pumping || closed || finished) return;
    pumping = true;
    try {
      while (!closed && !finished && !res.writableNeedDrain) {
        if (head.length) {
          const buf = head.shift();
          headBytes -= buf.length;
          res.write(buf);
          continue;
        }
        if (filePending()) {
          const length = Math.min(SPILL_READ_BYTES, fileWrite - fileRead);
          const buf = Buffer.allocUnsafe(length);
          let bytesRead = 0;
          try {
            ({ bytesRead } = await file.read(buf, 0, length, fileRead));
          } catch (error) {
            if (closed || finished) return;
            throw error;
          }
          if (closed || finished) return;
          if (!bytesRead) throw new Error('AUDIO_SPILL_READ_SHORT');
          fileRead += bytesRead;
          res.write(bytesRead === length ? buf : buf.subarray(0, bytesRead));
          continue;
        }
        if (tail.length) {
          const buf = tail.shift();
          tailBytes -= buf.length;
          res.write(buf);
          continue;
        }
        break;
      }
      if (ended && !pendingBytes() && !closed && !finished) {
        res.end();
        cleanup();
      }
    } catch (_) {
      if (!closed && !finished) { try { res.destroy(); } catch (__) {} }
    } finally {
      pumping = false;
    }
    // A drain may have arrived while a file read was awaited.
    if (!closed && !finished && !res.writableNeedDrain && (pendingBytes() || ended)) setImmediate(pump);
  }

  function end() {
    if (!ended) {
      ended = true;
      pump();
    }
    return done;
  }

  function abort() {
    ended = true;
    cleanup();
    return done;
  }

  return { push, end, abort, done, stats, pendingBytes };
}

module.exports = { createSpillRelay, cleanupStaleSpillFiles, defaultSpillDirectory, DEFAULT_MEMORY_LIMIT };
