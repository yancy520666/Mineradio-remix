// Lyric preparation shares one small turn after painting. This queue never
// changes the main renderer's cadence or the user's texture quality.
var lyricWorkScheduler = (function () {
  var jobs = [];
  var raf = 0, timer = 0, heldUntil = 0, running = false;
  var uploadedAt = -Infinity;
  var stats = { runs: 0, lastKey: '', lastMs: 0, maxMs: 0, uploadYields: 0 };
  function now() { return performance.now(); }
  function paused() {
    return typeof audio !== 'undefined' && audio && audio.src
      && (audio.paused || audio.__mineradioPausePending === true)
      && !(typeof isProgressDragPreviewActive === 'function' && isProgressDragPreviewActive());
  }
  function readyAt(job) {
    if (!job.urgent && !job.runWhenPaused && paused()) return Infinity;
    return Math.max(job.dueAt, job.urgent ? 0 : heldUntil);
  }
  function arm() {
    if (running || raf || timer || !jobs.length) return;
    var time = now(), due = Infinity;
    jobs.forEach(function (job) { due = Math.min(due, readyAt(job)); });
    if (due === Infinity) return; // Playback resume explicitly wakes this queue.
    if (due > time) {
      timer = setTimeout(function () { timer = 0; arm(); }, Math.ceil(due - time));
    } else if (typeof requestAnimationFrame === 'function' && !document.hidden) {
      raf = requestAnimationFrame(function (frameAt) {
        raf = 0;
        timer = setTimeout(function () { timer = 0; pump(frameAt); }, 0);
      });
    } else {
      timer = setTimeout(function () { timer = 0; pump(-Infinity); }, 20);
    }
  }
  function pump(frameAt) {
    var time = now();
    var ready = jobs.filter(function (job) { return readyAt(job) <= time; });
    // Current text may proceed; decoration waits for a frame without an upload.
    if (uploadedAt >= frameAt && uploadedAt > time - 24) {
      ready = ready.filter(function (job) { return job.urgent || time - job.queuedAt >= 600; });
      if (!ready.length && jobs.length) stats.uploadYields += 1;
    }
    ready.sort(function (a, b) {
      return (a.priority - (time - a.queuedAt) / 32) - (b.priority - (time - b.queuedAt) / 32);
    });
    var job = ready[0];
    if (job) {
      jobs.splice(jobs.indexOf(job), 1);
      running = true;
      var start = now();
      try { job.run(); } catch (error) { console.warn('[LyricWork]', job.key, error); }
      finally {
        stats.runs += 1;
        stats.lastKey = job.key;
        stats.lastMs = now() - start;
        stats.maxMs = Math.max(stats.maxMs, stats.lastMs);
        running = false;
      }
    }
    arm();
  }
  function cancel(key) {
    jobs = jobs.filter(function (job) { return job.key !== key; });
  }
  function rearm() {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    raf = timer = 0;
    arm();
  }
  return {
    schedule: function (key, run, options) {
      options = options || {};
      var previous = jobs.find(function (job) { return job.key === key; });
      cancel(key);
      jobs.push({ key: key, run: run, dueAt: now() + Math.max(0, Number(options.delay) || 0),
        queuedAt: previous ? previous.queuedAt : now(), priority: Number(options.priority) || 0,
        urgent: options.urgent === true, runWhenPaused: options.runWhenPaused === true });
      rearm();
    },
    cancel: cancel,
    hold: function (ms) { heldUntil = Math.max(heldUntil, now() + ms); rearm(); },
    canPrepare: function () { return !paused() && now() >= heldUntil; },
    uploaded: function () { uploadedAt = now(); },
    sliceMs: 2.4,
    snapshot: function () {
      return { pending: jobs.map(function (job) { return job.key; }), heldUntil: heldUntil,
        runs: stats.runs, lastKey: stats.lastKey, lastMs: stats.lastMs, maxMs: stats.maxMs,
        uploadYields: stats.uploadYields };
    }
  };
})();
