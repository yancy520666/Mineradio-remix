'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { normalize } = require('../public/js/playback-checkpoint-format');

function createPlaybackCheckpointStore(directory, options = {}) {
  const io = options.io || fs.promises;
  const file = path.join(directory, 'playback-checkpoint.json');
  const backup = file + '.bak';
  let pending = Promise.resolve();
  function readFile(name) {
    try {
      if (fs.statSync(name).size > 524288) return null;
      return normalize(JSON.parse(fs.readFileSync(name, 'utf8')));
    } catch (_) { return null; }
  }
  function read() {
    // The backup is always written before the primary, so a valid primary is
    // the latest write even if the system clock was set back in between.
    return readFile(file) || readFile(backup);
  }
  let committed = read();
  const initialPrimary = readFile(file);
  let primaryReady = !!(initialPrimary && committed && initialPrimary.savedAt === committed.savedAt
    && content(initialPrimary) === content(committed));
  let latestAcceptedAt = committed ? committed.savedAt : 0;
  function content(payload) { return JSON.stringify({ ...payload, savedAt: 0, reason: '' }); }
  async function durableReplace(target, payload) {
    const temporary = target + '.tmp';
    const handle = await io.open(temporary, 'w', 0o600);
    try { await handle.writeFile(JSON.stringify(payload), 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await io.rename(temporary, target);
  }
  function save(value) {
    const payload = normalize(value);
    if (!payload) return Promise.resolve({ ok: false, error: 'INVALID_PLAYBACK_CHECKPOINT' });
    const job = pending.then(async () => {
      // Only a slightly older task is a late write to drop. A jump far back
      // means the system clock was set back; keep saving progress after it.
      const clockSetBack = latestAcceptedAt - payload.savedAt > 60000;
      if (payload.savedAt <= latestAcceptedAt && !clockSetBack) return { ok: true, skipped: true };
      // Timestamp/reason-only changes do not require another durable write.
      // Keep an in-memory ordering watermark so an older task cannot rewind us.
      if (primaryReady && committed && content(payload) === content(committed)) {
        latestAcceptedAt = payload.savedAt;
        return { ok: true, skipped: true, savedAt: committed.savedAt };
      }
      try {
        await io.mkdir(directory, { recursive: true });
        if (committed) await durableReplace(backup, committed);
        await durableReplace(file, payload);
        committed = payload;
        primaryReady = true;
        latestAcceptedAt = payload.savedAt;
        return { ok: true, savedAt: payload.savedAt };
      } catch (error) { return { ok: false, error: error.code || 'CHECKPOINT_SAVE_FAILED' }; }
    });
    pending = job.then(() => {});
    return job;
  }
  return { read, save, flush: () => pending };
}
module.exports = { createPlaybackCheckpointStore };
