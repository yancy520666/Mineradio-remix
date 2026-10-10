'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { parseByteRange } = require('./wallpaper-engine-library');

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_CHUNK = 1024 * 1024;
const CACHE_BUDGET_BYTES = 512 * 1024 * 1024;
const SETTINGS = { version: 1, duration: 20, width: 1920, height: 1080, fps: 30 };
// 0 means unknown (caches written before sizes were recorded).
function recordedDimension(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 2 && number <= 7680 ? number : 0;
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function sortedValues(value) {
  return Object.keys(value || {}).sort().map(key => [key, value[key]]);
}
async function webAssetStamp(root, depth = 0, result = []) {
  if (depth > 16) throw new Error('LOOP_PROJECT_TOO_LARGE');
  for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
    if (result.length >= 10000) throw new Error('LOOP_PROJECT_TOO_LARGE');
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) await webAssetStamp(file, depth + 1, result);
    else if (entry.isFile()) {
      const stat = await fs.promises.stat(file);
      result.push([file, stat.size, stat.mtimeMs, stat.ctimeMs]);
    }
  }
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}

class WallpaperLoopCache {
  constructor({ root, library, propertyStore }) {
    this.root = path.resolve(root);
    this.library = library;
    this.propertyStore = propertyStore;
    this.token = crypto.randomBytes(24).toString('hex');
    this.entries = new Map();
    this.leases = new Map();
    this.leaseCounts = new Map();
    this.legacyPins = new Set();
    this.activeStreams = new Map();
    this.jobs = new Map();
    this.writeQueue = Promise.resolve();
  }

  mutate(operation) {
    const result = this.writeQueue.catch(() => {}).then(operation);
    this.writeQueue = result;
    return result;
  }
  begin(id) { return this.mutate(() => this.beginJob(id)); }
  append(id, chunk) { return this.mutate(() => this.appendJob(id, chunk)); }
  finish(id, size, owner) { return this.mutate(() => this.finishJob(id, size, owner)); }
  abort(id) { return this.mutate(() => this.abortJob(id)); }
  abortAll({ signal } = {}) {
    // Update preparation may time out while this mutation waits behind a write.
    // Limit cancellable cleanup to jobs owned when requested, never resumed jobs.
    const ownedIds = signal ? Array.from(this.jobs.keys()) : null;
    return this.mutate(async () => {
      for (const id of ownedIds || Array.from(this.jobs.keys())) {
        if (signal && signal.aborted) return;
        await this.abortJob(id);
      }
    });
  }

  async identity(id) {
    const target = await this.library.getNativeSceneTarget(id);
    if (!['scene', 'web'].includes(target.projectType)) throw new Error('LOOP_NATIVE_PROJECT_REQUIRED');
    const details = await this.library.getProjectDetails(id);
    const properties = await this.propertyStore.values(id, details.properties);
    const files = await Promise.all([target.projectFile, target.nativeFile].map(async file => {
      const stat = await fs.promises.stat(file);
      return [file, stat.size, stat.mtimeMs, stat.ctimeMs];
    }));
    const manifest = await fs.promises.readFile(target.projectFile);
    if (manifest.length > 1024 * 1024) throw new Error('LOOP_PROJECT_TOO_LARGE');
    const assets = target.projectType === 'web' ? await webAssetStamp(path.dirname(target.projectFile)) : [];
    const key = hash(JSON.stringify([id, SETTINGS, files, hash(manifest), sortedValues(properties), assets]));
    return { id, key, ...SETTINGS };
  }

  files(key) {
    return { video: path.join(this.root, key + '.webm'), meta: path.join(this.root, key + '.json') };
  }

  url(key) { return 'mineradio-wallpaper://loop/' + key + '?token=' + this.token; }

  // Hash verification and capability pinning are one operation with respect to
  // release/finish/prune. Otherwise a release can unlink the file after the
  // read stream opens but before lookup publishes its playable URL.
  lookup(id, owner) { return this.mutate(() => this.lookupEntry(id, owner)); }

  pin(key, file, owner) {
    this.entries.set(key, file);
    // Older callers have no retirement protocol. Preserve their capabilities
    // for the instance instead of guessing when they have stopped playback.
    if (owner === undefined || owner === null) { this.legacyPins.add(key); return {}; }
    const leaseId = crypto.randomBytes(24).toString('hex');
    this.leases.set(leaseId, { key, owner });
    this.leaseCounts.set(key, (this.leaseCounts.get(key) || 0) + 1);
    return { leaseId };
  }

  retire(key) {
    if (!this.legacyPins.has(key) && !this.leaseCounts.has(key) && !this.activeStreams.has(key)) this.entries.delete(key);
  }

  releaseLease(leaseId, owner) {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.owner !== owner) return false;
    this.leases.delete(leaseId);
    const remaining = this.leaseCounts.get(lease.key) - 1;
    if (remaining) this.leaseCounts.set(lease.key, remaining);
    else this.leaseCounts.delete(lease.key);
    this.retire(lease.key);
    return true;
  }

  release(leaseId, owner) {
    return this.mutate(async () => {
      const released = this.releaseLease(leaseId, owner);
      if (released) await this.pruneEntries().catch(() => {});
      return { ok: true, released };
    });
  }

  releaseOwner(owner) {
    return this.mutate(async () => {
      for (const [leaseId, lease] of this.leases) {
        if (lease.owner === owner) this.releaseLease(leaseId, owner);
      }
      await this.pruneEntries().catch(() => {});
      return { ok: true };
    });
  }

  async lookupEntry(id, owner) {
    const identity = await this.identity(id);
    const files = this.files(identity.key);
    try {
      const meta = JSON.parse(await fs.promises.readFile(files.meta, 'utf8'));
      const stat = await fs.promises.stat(files.video);
      if (meta.key !== identity.key || meta.id !== id || !stat.isFile() || stat.size !== meta.bytes
          || stat.size < 128 || stat.size > MAX_BYTES) throw new Error('LOOP_INVALID_CACHE');
      const digest = crypto.createHash('sha256');
      for await (const chunk of fs.createReadStream(files.video)) digest.update(chunk);
      if (digest.digest('hex') !== meta.sha256) throw new Error('LOOP_INVALID_CACHE');
      const lease = this.pin(identity.key, files.video, owner);
      return { ok: true, cached: true, ...identity, ...lease, url: this.url(identity.key), bytes: stat.size,
        recordedWidth: recordedDimension(meta.recordedWidth), recordedHeight: recordedDimension(meta.recordedHeight) };
    } catch (_) {
      // A failed new verification cannot retire existing consumers or reads.
      this.retire(identity.key);
      return { ok: true, cached: false, ...identity };
    }
  }

  async beginJob(id) {
    const identity = await this.identity(id);
    for (const id of Array.from(this.jobs.keys())) await this.abortJob(id);
    await fs.promises.mkdir(this.root, { recursive: true });
    for (const name of await fs.promises.readdir(this.root)) {
      if (!/^[a-f0-9]{48}\.partial$/.test(name)) continue;
      const file = path.join(this.root, name);
      if (Date.now() - (await fs.promises.stat(file)).mtimeMs > 120000) await fs.promises.rm(file, { force: true });
    }
    const jobId = crypto.randomBytes(24).toString('hex');
    const temp = path.join(this.root, jobId + '.partial');
    await fs.promises.writeFile(temp, Buffer.alloc(0), { flag: 'wx' });
    this.jobs.set(jobId, { ...identity, jobId, temp, bytes: 0, chunks: 0,
      digest: crypto.createHash('sha256'), expires: Date.now() + 120000 });
    return { ok: true, jobId, ...identity };
  }

  job(jobId) {
    const job = this.jobs.get(String(jobId));
    if (!job || job.expires < Date.now()) throw new Error('LOOP_JOB_EXPIRED');
    return job;
  }

  async appendJob(jobId, value) {
    const job = this.job(jobId);
    if (!(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) throw new Error('LOOP_CHUNK_INVALID');
    const chunk = value instanceof ArrayBuffer ? Buffer.from(value)
      : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    if (!chunk.length || chunk.length > MAX_CHUNK || job.bytes + chunk.length > MAX_BYTES) throw new Error('LOOP_SIZE_LIMIT');
    if (!job.chunks && (chunk.length < 4 || chunk.readUInt32BE(0) !== 0x1a45dfa3)) throw new Error('LOOP_WEBM_REQUIRED');
    await fs.promises.appendFile(job.temp, chunk);
    if (!this.jobs.has(jobId)) throw new Error('LOOP_JOB_EXPIRED');
    job.digest.update(chunk); job.bytes += chunk.length; job.chunks++;
    return { ok: true };
  }

  async finishJob(jobId, size = {}, owner) {
    const job = this.job(jobId);
    if (job.bytes < 128) throw new Error('LOOP_EMPTY_RECORDING');
    const current = await this.identity(job.id);
    if (current.key !== job.key || this.jobs.get(jobId) !== job) throw new Error('LOOP_PROJECT_CHANGED');
    const files = this.files(job.key);
    // Re-recording the same identity must not replace bytes beneath an old
    // capability or an in-flight range read. Retry after the player retires it.
    if (this.entries.has(job.key)) throw new Error('LOOP_CACHE_IN_USE');
    // Keep the actual capture size so a recording made in a small window can
    // be offered a full-screen regeneration later.
    const recorded = { recordedWidth: recordedDimension(size.width), recordedHeight: recordedDimension(size.height) };
    const metadata = { ...current, ...recorded, bytes: job.bytes, sha256: job.digest.digest('hex') };
    // Regenerating replaces a video the player may have just released.
    for (let attempt = 0; ; attempt++) {
      try { await fs.promises.rename(job.temp, files.video); break; }
      catch (error) {
        if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    await fs.promises.writeFile(files.meta, JSON.stringify(metadata));
    this.jobs.delete(jobId);
    const lease = this.pin(job.key, files.video, owner);
    await this.pruneEntries(job.key).catch(() => {});
    return { ok: true, cached: true, ...current, ...recorded, ...lease, bytes: job.bytes, url: this.url(job.key) };
  }

  async abortJob(jobId) {
    const job = this.jobs.get(String(jobId));
    this.jobs.delete(String(jobId));
    if (job) await fs.promises.rm(job.temp, { force: true });
    return { ok: true };
  }

  // Issued URLs remain pinned until renderer retirement and stream closure;
  // legacy callers keep instance pins. New range requests may arrive long after
  // an earlier request finishes, so time/age is never a safe lease expiry.
  // Serialize external pruning with lookup's verification + capability pinning.
  prune(keep) { return this.mutate(() => this.pruneEntries(keep)); }

  async pruneEntries(keep) {
    const videos = [];
    for (const name of await fs.promises.readdir(this.root)) {
      if (!/^[a-f0-9]{64}\.webm$/.test(name)) continue;
      const stat = await fs.promises.stat(path.join(this.root, name));
      if (!stat.isFile()) continue;
      videos.push({ key: name.slice(0, -5), size: stat.size, age: stat.mtimeMs });
    }
    let total = videos.reduce((sum, entry) => sum + entry.size, 0);
    const protectedVideoBytes = videos.reduce((sum, entry) =>
      sum + (entry.key === keep || this.entries.has(entry.key) ? entry.size : 0), 0);
    let reclaimedVideoBytes = 0;
    for (const entry of videos.sort((a, b) => a.age - b.age)) {
      if (total <= CACHE_BUDGET_BYTES) break;
      if (entry.key === keep || this.entries.has(entry.key)) continue;
      const files = this.files(entry.key);
      await fs.promises.rm(files.video, { force: true });
      await fs.promises.rm(files.meta, { force: true });
      total -= entry.size;
      reclaimedVideoBytes += entry.size;
    }
    // This is a soft video budget, not a hard bound on live playback resources.
    // A new instance has no issued URLs and can reclaim the previous session's
    // recordings. Do not force eviction of active resources to meet the budget.
    return { videoBytes: total, protectedVideoBytes, reclaimedVideoBytes,
      budgetBytes: CACHE_BUDGET_BYTES, overBudgetBytes: Math.max(0, total - CACHE_BUDGET_BYTES) };
  }

  response(request) { return this.mutate(() => this.openResponse(request)); }

  async openResponse(request) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    const file = url.searchParams.get('token') === this.token && this.entries.get(key);
    if (!file) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    let stat;
    try { stat = await fs.promises.stat(file); } catch (_) { return new Response(null, { status: 404 }); }
    const range = request.headers.get('range') ? parseByteRange(request.headers.get('range'), stat.size) : null;
    if (range && range.invalid) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + stat.size } });
    const start = range ? range.start : 0, end = range ? range.end : stat.size - 1;
    const headers = { 'Content-Type': 'video/webm', 'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin', 'Access-Control-Allow-Origin': '*' };
    if (range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    let body = null;
    if (request.method !== 'HEAD') {
      const stream = fs.createReadStream(file, { start, end });
      this.activeStreams.set(key, (this.activeStreams.get(key) || 0) + 1);
      // Unloading the element prevents future ranges, but an already opened
      // stream must also close before its file becomes an eviction candidate.
      stream.once('close', () => {
        this.mutate(async () => {
          const count = this.activeStreams.get(key) - 1;
          if (count) this.activeStreams.set(key, count);
          else this.activeStreams.delete(key);
          this.retire(key);
          await this.pruneEntries().catch(() => {});
        }).catch(() => {});
      });
      body = Readable.toWeb(stream);
    }
    return new Response(body, { status: range ? 206 : 200, headers });
  }
}

module.exports = { WallpaperLoopCache, SETTINGS };
