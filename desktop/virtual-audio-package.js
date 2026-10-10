'use strict';

// Runtime dependencies are exclusively Node built-ins. This module prepares a
// pinned, complete package; it never launches an executable or installs a driver.
const https = require('node:https');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const DOWNLOAD_URL = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';
const ZIP_BYTES = 1318877;
const ZIP_SHA256 = 'b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb';
const SETUP_NAME = 'VBCABLE_Setup_x64.exe';
const EXTRACTED_BYTES = 3467579;
const DOWNLOAD_TIMEOUT_MS = 60000;
const MAX_REDIRECTS = 2;
const CACHE_NAME = 'mineradio-remix-vbcable';
const ARCHIVE_NAME = 'VBCABLE_Driver_Pack45.zip';
const OWNER_MARKER = '.mineradio-vbcable-owner.json';
const ROOT_MARKER = '.mineradio-vbcable-cache.json';
const ROOT_MARKER_CONTENT = '{"component":"Mineradio Remix VB-CABLE cache","version":1}\n';
const MAX_RETAINED_PACKAGES = 2;
const PACKAGE_MANIFEST = Object.freeze([
  { name: 'vbMmeCable64_win10.inf', size: 11361, sha256: '61c857be74831cc299d9be62f8d49d137f14063454fc54f859d5bc9b4b813daf' },
  { name: 'pin_in.ico', size: 7358, sha256: '934865449455103c1c5997d8220acd160c3891f8a870f8e745b743d12681ac42' },
  { name: 'pin_out.ico', size: 7358, sha256: 'e8728a811e1f1af7d2ba31f77e47d449d5bba091e3e89a0df325ac7a3e67652c' },
  { name: 'readme.txt', size: 3846, sha256: 'f865f3e78e37006d48e56c93f51eff4ca79acda9969854400d79bfa3db38a8d5' },
  { name: 'vbaudio_cable_2003.cat', size: 8868, sha256: '23a10e3bcd6ffe0de6d3d67830be4c447724b3299e13e954dd6bd2257cf55da1' },
  { name: 'vbaudio_cable_2003.sys', size: 34024, sha256: '9650e20c38429d4680a7e603ecbe6601914ec4c94f8473112f21515bf53b84cf' },
  { name: 'vbaudio_cable_vista.cat', size: 8872, sha256: '810b30193a400b1559302c23f81ef8aaadf038b3caf3aff9bf200b59688a2def' },
  { name: 'vbaudio_cable_vista.sys', size: 34024, sha256: '8b02c26313b75ceb8fb9bd16b6b167cf70d7f3bc977dfc1986c0859f8c72b49f' },
  { name: 'vbaudio_cable_win7.cat', size: 8868, sha256: '1c38afacf115818c925bc26faf216e3563e85bbc4d6d793e5f76f2aa670d08e7' },
  { name: 'vbaudio_cable_win7.sys', size: 34024, sha256: 'd047e3ee66e3ee023e598232ea22aa28dbb39adeabe818adfb2a72ab738df0b9' },
  { name: 'vbaudio_cable_xp.cat', size: 8860, sha256: '51434ebbda13caf3c7617ef3035126baacca3e523feaf6828b398d52503d70d2' },
  { name: 'vbaudio_cable_xp.sys', size: 34024, sha256: '9f9bc80a96cc94c761887749e51d9b4fb7ee6741ce624b8b2f9f85cd2e3fb02e' },
  { name: 'vbaudio_cable64_2003.cat', size: 8876, sha256: '70f88e34c857c999367eb5b0303e23f5676b15a79ed4054f374749232baa0e3a' },
  { name: 'vbaudio_cable64_2003.sys', size: 41192, sha256: '5a726f3f1616f587c9f118bf337fd359df3f7cb9fc967a14229d59a31f2a9720' },
  { name: 'vbaudio_cable64_vista.cat', size: 8880, sha256: 'cc17731e91f2f071e4a108bba34a2b8dcb69ea5975f4b9c39fcbc670e5cf15fb' },
  { name: 'vbaudio_cable64_vista.sys', size: 41192, sha256: '703572fa9e8aa1616e6b2abd36b91a4718de77eadc02ae05ed2c8f304d058afc' },
  { name: 'vbaudio_cable64_win7.cat', size: 8876, sha256: '800b541f06bba3925ba058e7cc7ca837cfd4d845e073309eb2a9d36a2626403a' },
  { name: 'vbaudio_cable64_win7.sys', size: 41192, sha256: 'c7f3be383c81ab9aa642479f95872e40e19a4cfd72d4c8d7de80abc11b713e21' },
  { name: 'vbaudio_cable64_win10.cat', size: 12862, sha256: '0a921ebadbe39cf3fa7c14ff37d1ca22565a9651244bd3ac177dc810bc99072e' },
  { name: 'vbaudio_cable64_win10.sys', size: 140760, sha256: 'f01344602472f1b527de5ee98f18987c03db48fea444e457d061e937f1d531d5' },
  { name: 'vbaudio_cable64arm_win10.sys', size: 149976, sha256: '2dc35db3dfad0f25771a3e59af38e8b1268878ebe127476ea75fee109f2927dd' },
  { name: 'VBCABLE_ControlPanel.exe', size: 930048, sha256: 'f5b44706fe7ba2eed0516dee791f826dc7a9891e997f6ce9704e2899300b14ff' },
  { name: 'VBCABLE_Setup.exe', size: 914176, sha256: '01ffc86b623ff3c75a883aa900c0215a89482988e1c8e55988fc0a9fb513dbed' },
  { name: 'VBCABLE_Setup_x64.exe', size: 937728, sha256: '734c35dfa6d98f48782a451633ceb471166ec70d60482fd89a1123d0ee3c4f41' },
  { name: 'vbMmeCable_2003.inf', size: 4586, sha256: '64b67f80535d92a1a8625b4c9b9f7302ed959cb375947ca993b8cbaf205d3569' },
  { name: 'vbMmeCable_vista.inf', size: 4142, sha256: '50761a7e817b3a5e96a4eb8e3d31fbc249b0601343dcb732dd3cbe0b0a70f232' },
  { name: 'vbMmeCable_win7.inf', size: 4138, sha256: '5664f33116c1021f4280cfde1c571554fbb70b5480bd58a4fd53b281cd4f515c' },
  { name: 'vbMmeCable_xp.inf', size: 4576, sha256: '58d9737fa732c11c8cc52839a3f61ecf2cb2a98a7dfffe423e3e591de7f56d46' },
  { name: 'vbMmeCable64_2003.inf', size: 4596, sha256: '73aa40eef245da221c6fc6ea3299983421c9a9051df8da7414652304f01bb835' },
  { name: 'vbMmeCable64_vista.inf', size: 4150, sha256: '340feb0ce66ffb7922595a763bf23d2fec07bed9e50b6cb6327e559174c515d4' },
  { name: 'vbMmeCable64_win7.inf', size: 4146, sha256: 'da35387ccfe813f5c553bb7e0caf4e67adbb4429e742c2bd3c2014f80e6ec516' },
].map(entry => Object.freeze(entry)));
const OFFICIAL_POLICY = Object.freeze({ bytes: ZIP_BYTES, sha256: ZIP_SHA256,
  manifest: PACKAGE_MANIFEST, extractedBytes: EXTRACTED_BYTES, setupName: SETUP_NAME });

function packageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function abortError() {
  const error = packageError('VIRTUAL_AUDIO_SETUP_CANCELLED', 'Virtual audio package preparation was cancelled.');
  error.name = 'AbortError';
  return error;
}
function checkAbort(signal) { if (signal && signal.aborted) throw abortError(); }
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function invalidArchive(message) { return packageError('VIRTUAL_AUDIO_PACKAGE_INVALID', message); }

function safeFlatName(name) {
  if (typeof name !== 'string' || !name.length || name.length > 255
      || !/^[\x20-\x7e]+$/.test(name) || /[\\/:<>"|?*]/.test(name)
      || /[. ]$/.test(name) || name === '.' || name === '..'
      || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) {
    throw invalidArchive('Unsafe or unsupported archive filename.');
  }
  return name;
}

function validatePolicy(policy) {
  if (!policy || !Number.isSafeInteger(policy.bytes) || policy.bytes < 22 || policy.bytes > ZIP_BYTES
      || !/^[a-f0-9]{64}$/.test(policy.sha256 || '') || !Array.isArray(policy.manifest)
      || policy.manifest.length < 1 || policy.manifest.length > PACKAGE_MANIFEST.length) {
    throw invalidArchive('Invalid archive verification policy.');
  }
  let total = 0;
  const names = new Set();
  for (const item of policy.manifest) {
    safeFlatName(item.name);
    const key = item.name.toLowerCase();
    if (names.has(key) || !Number.isSafeInteger(item.size) || item.size < 0
        || item.size > 937728 || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) {
      throw invalidArchive('Invalid or duplicate manifest entry.');
    }
    names.add(key);
    total += item.size;
  }
  if (total !== policy.extractedBytes || total > EXTRACTED_BYTES) throw invalidArchive('Invalid extracted byte limit.');
  if (policy.setupName && !policy.manifest.some(item => item.name === policy.setupName)) {
    throw invalidArchive('Setup executable is missing from the manifest.');
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

// Fail closed on forms the pinned package does not use: comments, extra fields,
// data descriptors, ZIP64, split archives, encryption, and non-regular entries.
// Checking both headers and every byte range avoids ambiguous ZIP interpretations.
function verifyArchive(buffer, policy = OFFICIAL_POLICY) {
  validatePolicy(policy);
  if (!Buffer.isBuffer(buffer) || buffer.length !== policy.bytes || sha256(buffer) !== policy.sha256) {
    throw packageError('VIRTUAL_AUDIO_PACKAGE_INTEGRITY', 'Official VB-CABLE archive size or SHA-256 does not match.');
  }
  const end = buffer.length - 22;
  if (buffer.readUInt32LE(end) !== 0x06054b50 || buffer.readUInt16LE(end + 20) !== 0) {
    throw invalidArchive('Missing or unsupported ZIP end record.');
  }
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0
      || buffer.readUInt16LE(end + 8) !== count || count === 0xffff
      || centralSize === 0xffffffff || centralOffset === 0xffffffff
      || count !== policy.manifest.length || centralOffset + centralSize !== end) {
    throw invalidArchive('Unsupported ZIP entry count, disk, size, or ZIP64 layout.');
  }
  const expected = new Map(policy.manifest.map(item => [item.name, item]));
  const seen = new Set();
  const ranges = [];
  const entries = [];
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw invalidArchive('Invalid central ZIP header.');
    const version = buffer.readUInt16LE(cursor + 6);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const attributes = buffer.readUInt32LE(cursor + 38);
    const offset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    const mode = attributes >>> 16;
    const type = mode & 0xf000;
    if (version > 20 || (flags & ~0x0800) !== 0 || ![0, 8].includes(method)
        || extraLength !== 0 || commentLength !== 0 || buffer.readUInt16LE(cursor + 34) !== 0
        || (type !== 0 && type !== 0x8000) || (attributes & 0x18) !== 0
        || compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff
        || next > end || nameLength === 0 || offset + 30 > centralOffset) {
      throw invalidArchive('Unsupported or unsafe ZIP entry metadata.');
    }
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    // UTF-8 multibyte and alternate Windows path spellings are unnecessary here.
    if ([...nameBytes].some(byte => byte < 0x20 || byte > 0x7e)) throw invalidArchive('Unsupported ZIP filename encoding.');
    const name = safeFlatName(nameBytes.toString('ascii'));
    const key = name.toLowerCase();
    if (seen.has(key)) throw invalidArchive('Duplicate or Windows-colliding ZIP entries.');
    seen.add(key);
    const manifestEntry = expected.get(name);
    if (!manifestEntry || manifestEntry.size !== size) throw invalidArchive('ZIP entry does not match the complete package manifest.');
    total += size;
    if (total > policy.extractedBytes) throw invalidArchive('Extracted ZIP byte limit exceeded.');
    if (buffer.readUInt32LE(offset) !== 0x04034b50
        || buffer.readUInt16LE(offset + 4) !== version
        || buffer.readUInt16LE(offset + 6) !== flags
        || buffer.readUInt16LE(offset + 8) !== method
        || buffer.readUInt32LE(offset + 14) !== crc
        || buffer.readUInt32LE(offset + 18) !== compressedSize
        || buffer.readUInt32LE(offset + 22) !== size
        || buffer.readUInt16LE(offset + 26) !== nameLength
        || buffer.readUInt16LE(offset + 28) !== 0
        || buffer.readUInt16LE(offset + 10) !== buffer.readUInt16LE(cursor + 12)
        || buffer.readUInt16LE(offset + 12) !== buffer.readUInt16LE(cursor + 14)) {
      throw invalidArchive('Local and central ZIP headers disagree.');
    }
    const dataOffset = offset + 30 + nameLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > centralOffset || !buffer.subarray(offset + 30, dataOffset).equals(nameBytes)) {
      throw invalidArchive('Invalid local ZIP filename or data range.');
    }
    const compressed = buffer.subarray(dataOffset, dataEnd);
    let data;
    try {
      if (method === 0) data = Buffer.from(compressed);
      else {
        const inflated = zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(size, 1), info: true });
        if (inflated.engine.bytesWritten !== compressedSize) throw invalidArchive('Trailing compressed ZIP data.');
        data = inflated.buffer;
      }
    } catch (error) {
      if (error.code === 'VIRTUAL_AUDIO_PACKAGE_INVALID') throw error;
      throw invalidArchive('Invalid or oversized deflated ZIP data.');
    }
    if (data.length !== size || crc32(data) !== crc || sha256(data) !== manifestEntry.sha256) {
      throw packageError('VIRTUAL_AUDIO_PACKAGE_INTEGRITY', 'Extracted VB-CABLE file integrity does not match.');
    }
    ranges.push({ start: offset, end: dataEnd });
    entries.push({ name, data, size, sha256: manifestEntry.sha256 });
    cursor = next;
  }
  if (cursor !== end || total !== policy.extractedBytes || seen.size !== expected.size) {
    throw invalidArchive('Incomplete package manifest or central ZIP directory.');
  }
  ranges.sort((left, right) => left.start - right.start);
  let localEnd = 0;
  for (const range of ranges) {
    if (range.start !== localEnd) throw invalidArchive('Overlapping or unaccounted local ZIP data.');
    localEnd = range.end;
  }
  if (localEnd !== centralOffset) throw invalidArchive('Unaccounted ZIP prefix or trailing data.');
  return entries;
}

function assertOfficialUrl(input) {
  let url;
  try { url = new URL(input); } catch (_) { throw packageError('VIRTUAL_AUDIO_DOWNLOAD_SOURCE', 'Invalid VB-CABLE download URL.'); }
  if (typeof input !== 'string' || input !== DOWNLOAD_URL
      || url.protocol !== 'https:' || url.hostname !== 'download.vb-audio.com'
      || url.port || url.username || url.password || url.href !== DOWNLOAD_URL) {
    throw packageError('VIRTUAL_AUDIO_DOWNLOAD_SOURCE', 'Only the pinned official HTTPS download URL is allowed.');
  }
  return url;
}

function downloadArchive({ signal, onProgress, request = https.request, policy = OFFICIAL_POLICY,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  validatePolicy(policy);
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    let currentRequest = null;
    let currentResponse = null;
    let timer;
    const progress = received => { if (typeof onProgress === 'function') { try { onProgress({ received, total: policy.bytes }); } catch (_) {} } };
    const finish = (error, buffer) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (error) {
        if (currentResponse && typeof currentResponse.destroy === 'function') currentResponse.destroy();
        if (currentRequest && typeof currentRequest.destroy === 'function') currentRequest.destroy();
        reject(error);
      } else resolve(buffer);
    };
    const onAbort = () => finish(abortError());
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimer(() => finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_TIMEOUT', 'VB-CABLE download exceeded its 60-second deadline.')), DOWNLOAD_TIMEOUT_MS);
    const begin = (input, redirects) => {
      if (settled) return;
      let url;
      try { url = assertOfficialUrl(input); } catch (error) { finish(error); return; }
      try {
        currentRequest = request(url, { method: 'GET', rejectUnauthorized: true, minVersion: 'TLSv1.2',
          headers: { Accept: 'application/zip', 'Accept-Encoding': 'identity', 'User-Agent': 'Mineradio-Remix-Virtual-Audio-Setup' } }, response => {
          if (settled) { if (typeof response.destroy === 'function') response.destroy(); return; }
          currentResponse = response;
          response.on('error', error => finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_FAILED', error.message)));
          response.on('aborted', () => finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_FAILED', 'VB-CABLE response was interrupted.')));
          const status = response.statusCode;
          if ([301, 302, 303, 307, 308].includes(status)) {
            let target;
            try {
              if (redirects >= MAX_REDIRECTS || typeof response.headers.location !== 'string') throw new Error('Unsupported redirect.');
              target = assertOfficialUrl(response.headers.location);
            } catch (_) { finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_SOURCE', 'VB-CABLE redirect changed the official source or exceeded its limit.')); return; }
            // Destroy rather than drain an unbounded redirect response body.
            response.removeAllListeners('aborted');
            response.removeAllListeners('error');
            response.on('error', () => {});
            response.destroy();
            begin(target.href, redirects + 1);
            return;
          }
          if (status !== 200) { finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_FAILED', 'Official VB-CABLE download returned an unexpected HTTP status.')); return; }
          const length = response.headers['content-length'];
          const encoding = response.headers['content-encoding'];
          if ((length !== undefined && (typeof length !== 'string' || !/^\d+$/.test(length) || Number(length) !== policy.bytes))
              || (encoding !== undefined && encoding !== 'identity')) {
            finish(packageError('VIRTUAL_AUDIO_PACKAGE_INTEGRITY', 'Official download length or encoding does not match.')); return;
          }
          // One fixed buffer also bounds overhead from many tiny HTTP chunks.
          const buffer = Buffer.allocUnsafe(policy.bytes);
          let received = 0;
          response.on('data', chunk => {
            if (settled) return;
            if (!Buffer.isBuffer(chunk) || received + chunk.length > policy.bytes) {
              finish(packageError('VIRTUAL_AUDIO_PACKAGE_INTEGRITY', 'VB-CABLE download exceeded the exact archive byte limit.')); return;
            }
            chunk.copy(buffer, received);
            received += chunk.length;
            progress(received);
          });
          response.on('end', () => {
            if (settled) return;
            if (received !== policy.bytes || response.complete === false) {
              finish(packageError('VIRTUAL_AUDIO_PACKAGE_INTEGRITY', 'VB-CABLE download is incomplete.')); return;
            }
            if (sha256(buffer) !== policy.sha256) { finish(packageError('VIRTUAL_AUDIO_PACKAGE_INTEGRITY', 'VB-CABLE archive SHA-256 does not match.')); return; }
            finish(null, buffer);
          });
          response.on('close', () => {
            if (!settled) finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_FAILED', 'VB-CABLE download closed before completion.'));
          });
        });
        currentRequest.on('error', error => finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_FAILED', error.message)));
        if (settled) currentRequest.destroy();
        else currentRequest.end();
      } catch (error) { finish(packageError('VIRTUAL_AUDIO_DOWNLOAD_FAILED', error.message)); }
    };
    progress(0);
    if (signal && signal.aborted) onAbort();
    else begin(DOWNLOAD_URL, 0);
  });
}

function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
async function assertDirectoryChain(filesystem, directory) {
  const resolved = path.resolve(directory);
  const root = path.parse(resolved).root;
  let current = root;
  const components = resolved.slice(root.length).split(path.sep).filter(Boolean);
  for (const component of ['', ...components]) {
    if (component) current = path.join(current, component);
    const stat = await filesystem.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Package directory contains a symlink or a non-directory parent.');
    }
  }
  return resolved;
}

async function ensureCacheRoot(filesystem, tempRoot) {
  const parent = await assertDirectoryChain(filesystem, tempRoot);
  const root = path.join(parent, CACHE_NAME);
  let created = false;
  try { await filesystem.mkdir(root, { mode: 0o700 }); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await assertDirectoryChain(filesystem, root);
  const marker = path.join(root, ROOT_MARKER);
  if (created) {
    const handle = await filesystem.open(marker, 'wx', 0o600);
    try { await handle.writeFile(ROOT_MARKER_CONTENT); await handle.sync(); }
    finally { await handle.close(); }
  }
  const stat = await filesystem.lstat(marker);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== Buffer.byteLength(ROOT_MARKER_CONTENT)
      || await filesystem.readFile(marker, 'utf8') !== ROOT_MARKER_CONTENT) {
    throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'The fixed package cache is not owned by this application.');
  }
  return root;
}

async function reservePackageDirectory(filesystem, root) {
  await assertDirectoryChain(filesystem, root);
  const lockPath = path.join(root, '.prepare.lock');
  let lock;
  try { lock = await filesystem.open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw packageError('VIRTUAL_AUDIO_PACKAGE_BUSY', 'Another package cache reservation is pending.');
    throw error;
  }
  const lockIdentity = await lock.stat();
  try {
    const children = await filesystem.readdir(root);
    const candidates = children.filter(name => /^pack45-[a-zA-Z0-9_-]+$/.test(name));
    // Count even an interrupted reservation whose marker was never completed.
    // Never prune a package that an installer may still be using.
    if (candidates.length >= MAX_RETAINED_PACKAGES) {
      throw packageError('VIRTUAL_AUDIO_PACKAGE_CACHE_FULL', 'Two retained VB-CABLE packages already exist; no additional package will be created.');
    }
    for (const name of candidates) {
      const stat = await filesystem.lstat(path.join(root, name));
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Package cache contains an unsafe reserved path.');
    }
    await assertDirectoryChain(filesystem, root);
    return await filesystem.mkdtemp(path.join(root, 'pack45-'));
  } finally {
    await lock.close();
    await assertDirectoryChain(filesystem, root);
    const current = await filesystem.lstat(lockPath);
    if (current.isSymbolicLink() || !current.isFile() || !sameIdentity(current, lockIdentity)) {
      throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Package cache reservation lock was replaced.');
    }
    await filesystem.unlink(lockPath);
  }
}

// Dependency injection keeps unit tests fully inert. The public production entry
// below never accepts replacement archive pins, manifests, or filesystem code.
function createVirtualAudioPackagePreparer({ filesystem = fs, request = https.request,
  tempRoot = os.tmpdir(), archivePolicy = OFFICIAL_POLICY, setTimer = setTimeout,
  clearTimer = clearTimeout } = {}) {
  validatePolicy(archivePolicy);
  const policy = Object.freeze({ ...archivePolicy,
    manifest: Object.freeze(archivePolicy.manifest.map(entry => Object.freeze({ ...entry }))) });
  return async function prepare({ signal, onProgress } = {}) {
    checkAbort(signal);
    const root = await ensureCacheRoot(filesystem, tempRoot);
    checkAbort(signal);
    const directory = await reservePackageDirectory(filesystem, root);
    const payloadDirectory = path.join(directory, 'payload');
    const ownedFiles = [];
    const ownerToken = crypto.randomBytes(16).toString('hex');
    const ownerContent = JSON.stringify({ component: 'Mineradio Remix VB-CABLE package', version: 1,
      token: ownerToken, archiveSha256: policy.sha256 }) + '\n';
    let directoryIdentity;
    let payloadIdentity = null;
    let markerWritten = false;
    let cleaned = false;
    let cleanupPending = null;
    const assertOwned = async () => {
      await assertDirectoryChain(filesystem, directory);
      const current = await filesystem.lstat(directory);
      if (!sameIdentity(current, directoryIdentity)) throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Owned package directory was replaced.');
      if (payloadIdentity) {
        const payload = await filesystem.lstat(payloadDirectory);
        if (payload.isSymbolicLink() || !payload.isDirectory() || !sameIdentity(payload, payloadIdentity)) {
          throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Owned package payload directory was replaced.');
        }
      }
      if (markerWritten) {
        const markerPath = path.join(directory, OWNER_MARKER);
        const marker = await filesystem.lstat(markerPath);
        if (marker.isSymbolicLink() || !marker.isFile() || marker.size !== Buffer.byteLength(ownerContent)
            || await filesystem.readFile(markerPath, 'utf8') !== ownerContent) {
          throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Package ownership marker was replaced.');
        }
      }
    };
    const cleanup = () => {
      if (cleanupPending) return cleanupPending;
      if (cleaned) return Promise.resolve();
      cleanupPending = (async () => {
        await assertOwned();
        const parentNames = new Set(ownedFiles.filter(item => path.dirname(item.path) === directory).map(item => path.basename(item.path)));
        if (payloadIdentity) parentNames.add('payload');
        if ((await filesystem.readdir(directory)).some(name => !parentNames.has(name))) {
          throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Unexpected files in the owned package parent; cleanup stopped.');
        }
        if (payloadIdentity) {
          const payloadNames = new Set(ownedFiles.filter(item => path.dirname(item.path) === payloadDirectory).map(item => path.basename(item.path)));
          if ((await filesystem.readdir(payloadDirectory)).some(name => !payloadNames.has(name))) {
            throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Unexpected files in the package payload; cleanup stopped.');
          }
        }
        // Never recursively remove unknown files, swapped files, or user paths.
        const markerFiles = ownedFiles.filter(item => path.basename(item.path) === OWNER_MARKER);
        const dataFiles = ownedFiles.filter(item => path.basename(item.path) !== OWNER_MARKER);
        const unlinkOwned = async item => {
          await assertOwned();
          let current;
          try { current = await filesystem.lstat(item.path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
          if (current.isSymbolicLink() || !current.isFile() || !sameIdentity(current, item.stat)) {
            throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'An owned package file was replaced; cleanup stopped.');
          }
          await filesystem.unlink(item.path);
          if (path.basename(item.path) === OWNER_MARKER) markerWritten = false;
        };
        for (const item of [...dataFiles].reverse()) await unlinkOwned(item);
        if (payloadIdentity) {
          await assertOwned();
          await filesystem.rmdir(payloadDirectory);
          payloadIdentity = null;
        }
        // Keep the ownership marker if unexpected payload files prevent cleanup.
        for (const item of markerFiles) await unlinkOwned(item);
        await assertOwned();
        await filesystem.rmdir(directory);
        cleaned = true;
      })();
      return cleanupPending;
    };
    try {
      await assertDirectoryChain(filesystem, directory);
      directoryIdentity = await filesystem.lstat(directory);
      if (path.dirname(directory) !== root || !/^pack45-[a-zA-Z0-9_-]+$/.test(path.basename(directory))) {
        throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'Temporary package directory is outside the owned root.');
      }
      const write = async (name, data, target = directory) => {
        checkAbort(signal);
        await assertOwned();
        const filename = path.join(target, name);
        const handle = await filesystem.open(filename, 'wx', 0o600);
        try {
          const stat = await handle.stat();
          if (!stat.isFile()) throw packageError('VIRTUAL_AUDIO_PACKAGE_DIRECTORY', 'New package path is not a regular file.');
          ownedFiles.push({ path: filename, stat });
          checkAbort(signal);
          await handle.writeFile(data);
          await handle.sync();
          checkAbort(signal);
        } finally { await handle.close(); }
      };
      await write(OWNER_MARKER, ownerContent);
      markerWritten = true;
      checkAbort(signal);
      const buffer = await downloadArchive({ signal, onProgress, request, policy, setTimer, clearTimer });
      checkAbort(signal);
      const entries = verifyArchive(buffer, policy);
      await write(ARCHIVE_NAME, buffer);
      await assertOwned();
      await filesystem.mkdir(payloadDirectory, { mode: 0o700 });
      payloadIdentity = await filesystem.lstat(payloadDirectory);
      for (const entry of entries) await write(entry.name, entry.data, payloadDirectory);
      checkAbort(signal);
      await assertOwned();
      return { directory: payloadDirectory, packageDirectory: directory, setupPath: path.join(payloadDirectory, policy.setupName),
        archivePath: path.join(directory, ARCHIVE_NAME), cleanup };
    } catch (error) {
      if (directoryIdentity) {
        try { await cleanup(); } catch (cleanupError) { error.cleanupError = cleanupError; }
      }
      throw error;
    }
  };
}

function prepareVirtualAudioPackage({ signal, onProgress, request, httpsRequest, tempRoot } = {}) {
  return createVirtualAudioPackagePreparer({ request: request || httpsRequest || https.request,
    tempRoot: tempRoot === undefined ? os.tmpdir() : tempRoot })({ signal, onProgress });
}

module.exports = { DOWNLOAD_URL, ZIP_BYTES, ZIP_SHA256, SETUP_NAME, EXTRACTED_BYTES,
  DOWNLOAD_TIMEOUT_MS, CACHE_NAME, ARCHIVE_NAME, OWNER_MARKER, MAX_RETAINED_PACKAGES,
  PACKAGE_MANIFEST, prepareVirtualAudioPackage,
  createVirtualAudioPackagePreparer, verifyArchive };
