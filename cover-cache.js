'use strict';

// Small in-memory cover cache for /api/cover. The same image is often asked
// for by the thumbnail, control bar, background and particle texture at once,
// and again when a song or album comes back; keep finished downloads briefly
// and let concurrent requests share one upstream download.
function createCoverCache(options = {}) {
  const maxEntries = options.maxEntries || 240;
  const maxBytes = options.maxBytes || 48 * 1024 * 1024;
  const maxItemBytes = options.maxItemBytes || 3 * 1024 * 1024;
  const ttlMs = options.ttlMs || 30 * 60 * 1000;
  const now = options.now || Date.now;
  const maxConcurrent = options.maxConcurrent || 4;
  const maxQueued = options.maxQueued || 64;
  const maxInflightBytes = options.maxInflightBytes || 32 * 1024 * 1024;
  const deadlineMs = options.deadlineMs || 12000;
  const entries = new Map();
  const pending = new Map();
  const tasks = new Set();
  const queue = [];
  let totalBytes = 0, inflightBytes = 0, active = 0, generation = 0;

  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    totalBytes -= entry.body.length;
  }
  function get(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) { remove(key); return null; }
    // Map keeps insertion order; re-inserting marks it most recently used.
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }
  function set(key, result) {
    if (!result || result.status !== 200 || !Buffer.isBuffer(result.body) || !result.body.length) return;
    if (result.body.length > maxItemBytes) return;
    remove(key);
    entries.set(key, { status: 200, contentType: result.contentType, body: result.body, expiresAt: now() + ttlMs });
    totalBytes += result.body.length;
    while (entries.size > maxEntries || totalBytes > maxBytes) remove(entries.keys().next().value);
  }
  // Only complete 200 responses are stored; a failed download is forgotten
  // immediately so the next request starts a fresh attempt.
  function abortError(code = 'COVER_CANCELLED') {
    return Object.assign(new Error(code), { name: 'AbortError', code });
  }
  function finish(task, error, result) {
    if (task.finished) return;
    task.finished = true;
    tasks.delete(task);
    clearTimeout(task.timer);
    const queuedIndex = queue.indexOf(task);
    if (queuedIndex >= 0) queue.splice(queuedIndex, 1);
    if (pending.get(task.key) === task) pending.delete(task.key);
    if (task.started) active--;
    inflightBytes -= task.bytes; task.bytes = 0;
    if (!error && task.generation === generation) set(task.key, result);
    task.waiters.forEach(waiter => {
      if (waiter.signal) waiter.signal.removeEventListener('abort', waiter.abort);
      if (error) waiter.reject(error); else waiter.resolve(result);
    });
    task.waiters.clear();
    pump();
  }
  function stop(task, error) {
    task.controller.abort();
    finish(task, error);
  }
  function pump() {
    queue.sort((a, b) => a.priority - b.priority);
    while (active < maxConcurrent && queue.length) {
      // Background work cannot fill every slot while the current cover waits.
      const backgroundActive = Array.from(tasks).filter(t => t.started && !t.finished && t.priority > 0).length;
      const index = queue.findIndex(t => t.finished || t.priority === 0 || backgroundActive < Math.max(1, maxConcurrent - 2));
      if (index < 0) break;
      const task = queue.splice(index, 1)[0];
      if (task.finished) continue;
      task.started = true; active++;
      const context = {
        signal: task.controller.signal,
        addBytes(size) {
          if (task.finished || task.controller.signal.aborted) throw abortError();
          const backgroundBytes = Array.from(tasks).filter(t => t.priority > 0).reduce((sum, t) => sum + t.bytes, 0);
          if (!Number.isFinite(size) || size < 0 || inflightBytes + size > maxInflightBytes
            || task.priority > 0 && backgroundBytes + size > maxInflightBytes / 2) throw Object.assign(new Error('COVER_INFLIGHT_BUDGET'), { code: 'COVER_INFLIGHT_BUDGET' });
          task.bytes += size; inflightBytes += size;
        },
      };
      Promise.resolve().then(() => task.download(context)).then(
        result => finish(task, null, result), error => { task.controller.abort(); finish(task, error); });
    }
  }
  function load(key, download, opts = {}) {
    if (opts.signal && opts.signal.aborted) return Promise.reject(abortError());
    const cached = get(key);
    if (cached) return Promise.resolve(cached);
    let task = pending.get(key);
    if (!task) {
      if (tasks.size >= maxConcurrent + maxQueued) return Promise.reject(Object.assign(new Error('COVER_QUEUE_FULL'), { code: 'COVER_QUEUE_FULL' }));
      task = { key, download, generation, controller: new AbortController(), waiters: new Set(), bytes: 0,
        priority: opts.priority === 'background' ? 1 : 0, started: false, finished: false };
      task.timer = setTimeout(() => stop(task, abortError('COVER_DEADLINE')), deadlineMs);
      pending.set(key, task); tasks.add(task); queue.push(task);
    } else if (opts.priority !== 'background') task.priority = 0;
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal: opts.signal };
      waiter.abort = () => {
        task.waiters.delete(waiter);
        waiter.signal.removeEventListener('abort', waiter.abort);
        reject(abortError());
        if (!task.waiters.size) stop(task, abortError());
      };
      task.waiters.add(waiter);
      if (waiter.signal) waiter.signal.addEventListener('abort', waiter.abort, { once: true });
      pump();
    });
  }
  return {
    get, set, load,
    clear() {
      const bytes = totalBytes;
      generation++;
      entries.clear(); totalBytes = 0;
      // Active consumers finish uninterrupted, but new requests must fetch fresh.
      pending.clear();
      return { bytes };
    },
    stats: () => ({ entries: entries.size, bytes: totalBytes, pending: tasks.size, active, queued: queue.filter(t => !t.finished).length, inflightBytes }),
  };
}

module.exports = { createCoverCache };
