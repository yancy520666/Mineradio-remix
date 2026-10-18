'use strict';

const os = require('os');

// Playback shares the machine with builds, test runs and other heavy programs.
// Under full CPU load the Windows scheduler can starve the audio pipeline of an
// already-cached song, so the player's own processes sit one step above normal.
// ABOVE_NORMAL (not HIGH) leaves the rest of the system responsive.
const REFRESH_MS = 20000;

function raisePlayerProcessPriority(app, options = {}) {
  const setPriority = options.setPriority || os.setPriority;
  const level = options.level != null ? options.level : os.constants.priority.PRIORITY_ABOVE_NORMAL;
  if (process.platform !== 'win32' || process.env.MINERADIO_DISABLE_PRIORITY_BOOST === '1') {
    return { stop() {} };
  }
  const applied = new Set();
  function apply() {
    let pids = [process.pid];
    try { pids = pids.concat(app.getAppMetrics().map((row) => row && row.pid)); } catch (_) { /* metrics unavailable */ }
    for (const pid of pids) {
      if (!Number.isInteger(pid) || pid <= 0 || applied.has(pid)) continue;
      applied.add(pid);
      try { setPriority(pid, level); } catch (_) { /* process gone or access denied: keep default */ }
    }
  }
  apply();
  // Renderer, GPU and audio-service processes are spawned and respawned after startup.
  const timer = setInterval(apply, options.refreshMs || REFRESH_MS);
  if (timer.unref) timer.unref();
  return { stop() { clearInterval(timer); }, apply };
}

module.exports = { raisePlayerProcessPriority };
