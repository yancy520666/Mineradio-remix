'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Only flat, recognized generated files are candidates; never follow links or
// recurse into a user-selected cache directory. Coalesce concurrent requests.
function createGeneratedCachePruner({ root, pattern, maxBytes, maxEntries = Infinity, maxAgeMs = Infinity, keep = () => [] }) {
  root = path.resolve(root);
  let pending = null;
  let again = false;
  async function sweep() {
    let names;
    try { names = await fs.promises.readdir(root, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const entries = [];
    for (const entry of names) {
      if (!entry.isFile() || !pattern.test(entry.name)) continue;
      const file = path.join(root, entry.name);
      const stat = await fs.promises.lstat(file).catch(() => null);
      if (stat && stat.isFile() && !stat.isSymbolicLink()) entries.push({ file, bytes: stat.size, age: stat.mtimeMs });
    }
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    let count = entries.length;
    for (const entry of entries.sort((a, b) => a.age - b.age)) {
      if (total <= maxBytes && count <= maxEntries && Date.now() - entry.age <= maxAgeMs) continue;
      // Re-evaluate pins immediately before removal: a new playback session may
      // have adopted this package while the asynchronous scan was running.
      if (keep().some(file => path.resolve(file) === entry.file)) continue;
      const current = await fs.promises.lstat(entry.file).catch(() => null);
      if (!current || !current.isFile() || current.isSymbolicLink() || current.mtimeMs !== entry.age || current.size !== entry.bytes) continue;
      if (keep().some(file => path.resolve(file) === entry.file)) continue;
      try { await fs.promises.unlink(entry.file); total -= entry.bytes; count--; }
      catch (error) { if (!['ENOENT', 'EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error; }
    }
  }
  return function prune() {
    again = true;
    if (!pending) pending = (async () => {
      do { again = false; await sweep(); } while (again);
    })().finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createGeneratedCachePruner };
