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
    const candidates = [readFile(file), readFile(backup)].filter(Boolean);
    return candidates.sort((a, b) => b.savedAt - a.savedAt)[0] || null;
  }
  let committed = read();
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
      if (committed && payload.savedAt <= committed.savedAt) return { ok: true, skipped: true };
      try {
        await io.mkdir(directory, { recursive: true });
        if (committed) await durableReplace(backup, committed);
        await durableReplace(file, payload);
        committed = payload;
        return { ok: true, savedAt: payload.savedAt };
      } catch (error) { return { ok: false, error: error.code || 'CHECKPOINT_SAVE_FAILED' }; }
    });
    pending = job.then(() => {});
    return job;
  }
  return { read, save, flush: () => pending };
}
module.exports = { createPlaybackCheckpointStore };
