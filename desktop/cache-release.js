'use strict';
const fs = require('node:fs');
const path = require('node:path');

function emptyResult(category) {
  return { category, freedBytes: 0, deletedFiles: 0, skippedFiles: 0, skippedBytes: 0, failedFiles: 0, errors: [] };
}
// Reject links in every path component, including a linked custom cache root.
// Only known flat generated names are considered; never recurse into user data.
function assertUnlinkedDirectory(root, io = fs) {
  const resolved = path.resolve(root);
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = io.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Object.assign(new Error('CACHE_PATH_NOT_DIRECTORY'), { code: 'CACHE_UNSAFE_PATH' });
  }
  return resolved;
}
function releaseFlatCache({ category, root, pattern, keep = () => [], preserve = () => false, validate }, io = fs) {
  const result = emptyResult(category);
  try {
    root = assertUnlinkedDirectory(root, io);
    for (const entry of io.readdirSync(root, { withFileTypes: true })) {
      pattern.lastIndex = 0;
      if (!pattern.test(entry.name)) continue;
      const file = path.join(root, entry.name);
      try {
        const stat = io.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || preserve() || keep().some(pin => pin && path.resolve(pin) === file)
            || (validate && !validate(file, stat, io))) { result.skippedFiles++; if (stat.isFile()) result.skippedBytes += stat.size; continue; }
        // Recheck the parent before each unlink. No await separates validation
        // and deletion, so app-owned writers cannot race this operation.
        assertUnlinkedDirectory(root, io);
        io.unlinkSync(file);
        result.freedBytes += stat.size;
        result.deletedFiles++;
      } catch (error) {
        if (error.code !== 'ENOENT') { result.failedFiles++; result.errors.push(error.code || 'CACHE_DELETE_FAILED'); }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') { result.failedFiles++; result.errors.push(error.code || 'CACHE_SCAN_FAILED'); }
  }
  return result;
}
function summarize(categories) {
  const result = { ok: true, partial: false, freedBytes: 0, deletedFiles: 0, skippedFiles: 0, skippedBytes: 0, failedFiles: 0, categories, errors: [] };
  for (const category of categories) {
    for (const field of ['freedBytes', 'deletedFiles', 'skippedFiles', 'skippedBytes', 'failedFiles']) result[field] += category[field] || 0;
    result.errors.push(...(category.errors || []));
  }
  result.partial = result.skippedFiles > 0 || result.failedFiles > 0;
  result.ok = result.failedFiles === 0;
  return result;
}
// Advance the generation synchronously, before waiting for existing writes.
// A stale renderer fetch can finish for its consumer but cannot repopulate disk.
function createCacheReleaseCoordinator() {
  let generation = 0, queue = Promise.resolve(), pending = null;
  function enqueue(operation) {
    const next = queue.catch(() => {}).then(operation);
    queue = next;
    return next;
  }
  return {
    generation: () => generation,
    write(token, operation) {
      return enqueue(() => Number.isInteger(token) && token === generation
        ? operation() : { ok: false, skipped: true, error: 'CACHE_GENERATION_CHANGED' });
    },
    release(operation) {
      if (pending) return pending;
      generation++;
      pending = enqueue(operation).finally(() => { pending = null; });
      return pending;
    },
  };
}
module.exports = { emptyResult, releaseFlatCache, summarize, createCacheReleaseCoordinator, assertUnlinkedDirectory };
