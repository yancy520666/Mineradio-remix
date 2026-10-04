'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { parseByteRange } = require('./wallpaper-engine-library');

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_CHUNK = 1024 * 1024;
const SETTINGS = { version: 1, duration: 20, width: 1920, height: 1080, fps: 30 };
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
  finish(id) { return this.mutate(() => this.finishJob(id)); }
  abort(id) { return this.mutate(() => this.abortJob(id)); }
  abortAll() { return this.mutate(async () => { for (const id of Array.from(this.jobs.keys())) await this.abortJob(id); }); }

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

  async lookup(id) {
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
      this.entries.set(identity.key, files.video);
      return { ok: true, cached: true, ...identity, url: this.url(identity.key), bytes: stat.size };
    } catch (_) {
      this.entries.delete(identity.key);
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

  async finishJob(jobId) {
    const job = this.job(jobId);
    if (job.bytes < 128) throw new Error('LOOP_EMPTY_RECORDING');
    const current = await this.identity(job.id);
    if (current.key !== job.key || this.jobs.get(jobId) !== job) throw new Error('LOOP_PROJECT_CHANGED');
    const files = this.files(job.key);
    const metadata = { ...current, bytes: job.bytes, sha256: job.digest.digest('hex') };
    await fs.promises.rename(job.temp, files.video);
    await fs.promises.writeFile(files.meta, JSON.stringify(metadata));
    this.jobs.delete(jobId);
    this.entries.set(job.key, files.video);
    await this.prune(job.key).catch(() => {});
    return { ok: true, cached: true, ...current, bytes: job.bytes, url: this.url(job.key) };
  }

  async abortJob(jobId) {
    const job = this.jobs.get(String(jobId));
    this.jobs.delete(String(jobId));
    if (job) await fs.promises.rm(job.temp, { force: true });
    return { ok: true };
  }

  async prune(keep) {
    const videos = [];
    for (const name of await fs.promises.readdir(this.root)) {
      if (!/^[a-f0-9]{64}\.webm$/.test(name)) continue;
      const stat = await fs.promises.stat(path.join(this.root, name));
      videos.push({ key: name.slice(0, -5), size: stat.size, age: stat.mtimeMs });
    }
    let total = videos.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of videos.sort((a, b) => a.age - b.age)) {
      if (total <= 512 * 1024 * 1024) break;
      if (entry.key === keep) continue;
      const files = this.files(entry.key);
      await fs.promises.rm(files.video, { force: true });
      await fs.promises.rm(files.meta, { force: true });
      this.entries.delete(entry.key); total -= entry.size;
    }
  }

  async response(request) {
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
    return new Response(request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file, { start, end })),
      { status: range ? 206 : 200, headers });
  }
}

module.exports = { WallpaperLoopCache, SETTINGS };
