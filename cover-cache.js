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
  const entries = new Map();
  const pending = new Map();
  let totalBytes = 0;

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
  function load(key, download) {
    const cached = get(key);
    if (cached) return Promise.resolve(cached);
    if (pending.has(key)) return pending.get(key);
    const task = Promise.resolve().then(download).then(result => {
      set(key, result);
      return result;
    }).finally(() => { pending.delete(key); });
    pending.set(key, task);
    return task;
  }
  return {
    get, set, load,
    stats: () => ({ entries: entries.size, bytes: totalBytes, pending: pending.size }),
  };
}

module.exports = { createCoverCache };
