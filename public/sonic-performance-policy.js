/* Shared by the player and the bundled Sonic iframe. No hardware-name guesses. */
(function (root) {
  'use strict';
  var levels = ['eco', 'balanced', 'high', 'ultra'];
  var grids = [80, 112, 160, 224, 320];
  var ratios = [0.7, 0.9, 1.1, 1.35, 2];
  // The top tier is the original wallpaper: no pixel budget and no extra FPS cap.
  var budgets = [1300000, 1800000, 2800000, 4000000, Infinity];
  function ceiling(quality) { return Math.max(0, levels.indexOf(quality)) + 1; }
  function profile(quality, managed, reduction) {
    if (!managed) return null;
    var tier = Math.max(0, ceiling(quality) - Math.max(0, reduction || 0));
    return { tier: tier, gridSize: grids[tier], dpr: ratios[tier], pixels: budgets[tier],
      fps: [30, 30, 45, 60, 0][tier], floatingCount: [8, 20, 40, 60, 100][tier] };
  }
  function pixelRatio(value, width, height, device) {
    var base = Math.min(2, Math.max(1, device || 1));
    if (!value) return base;
    return Math.min(base, value.dpr, Math.sqrt(value.pixels / Math.max(1, width * height)));
  }
  function targetFps(mode, value, displayHz) {
    var display = Math.max(30, Math.min(240, Number(displayHz) || 60));
    var limit = /^(30|45|60|75|90|120)$/.test(String(mode)) ? Number(mode) : display;
    return Math.min(display, limit, value && value.fps ? value.fps : display);
  }
  // Limit handed to the renderer; 0 keeps the original uncapped vsync drawing.
  function fpsLimit(mode, value, displayHz) {
    if (!/^(30|45|60|75|90|120)$/.test(String(mode)) && !(value && value.fps)) return 0;
    return targetFps(mode, value, displayHz);
  }
  // Count observed active intervals, not wall time across suspended timers.
  function createVisibleClock() {
    var previous = null, wasActive = false, elapsed = 0;
    return {
      reset: function (now) { previous = now; wasActive = false; elapsed = 0; },
      advance: function (now, active) {
        var gap = previous === null ? 0 : now - previous;
        if (active && wasActive && gap >= 0 && gap <= 1500) elapsed += gap;
        else elapsed = 0;
        previous = now; wasActive = active;
        return elapsed;
      }
    };
  }
  // Frames are counted in 1s buckets after a 3s warmup. A report needs most of
  // the recent buckets to be slow, so one hitch (song change, cover decode, GC)
  // cannot trigger it on its own:
  //   severe: all of the last 4 buckets below 60%          -> about 7s
  //   load:   7 of the last 8 below 80% and their mean too -> about 11s
  // Every 12s a plain window is also reported for recovery decisions.
  var WARMUP = 3000, SEVERE = 4, LOAD = 8, LOAD_SLOW = 7, WINDOW = 12000;
  function createMeter() {
    var previous = 0, warmUntil = 0, target = 0;
    var start = 0, frames = 0, bucketStart = 0, bucketFrames = 0, buckets = [];
    function reset(now) {
      previous = 0; warmUntil = now + WARMUP;
      start = 0; frames = 0; bucketStart = 0; bucketFrames = 0; buckets = [];
    }
    function recent(count) {
      var list = buckets.slice(-count), time = 0, n = 0;
      list.forEach(function (b) { time += b.time; n += b.frames; });
      return { list: list, fps: time ? n * 1000 / time : 0, duration: time };
    }
    function below(list, ratio) {
      return list.filter(function (b) { return b.frames * 1000 / b.time < target * ratio; }).length;
    }
    function report(window, flag) {
      var sample = { fps: window.fps, target: target, duration: window.duration };
      sample[flag] = true;
      // The next report needs fresh evidence; the plain window restarts too.
      buckets = []; start = previous; frames = 0;
      return sample;
    }
    return {
      reset: reset,
      frame: function (now, nextTarget, eligible) {
        if (!eligible || nextTarget !== target || !previous || now - previous > 1500) {
          reset(now); target = nextTarget; previous = now; return null;
        }
        previous = now;
        if (now < warmUntil) return null;
        if (!start) { start = bucketStart = now; frames = bucketFrames = 0; return null; }
        frames++; bucketFrames++;
        if (now - bucketStart >= 1000) {
          buckets.push({ frames: bucketFrames, time: now - bucketStart });
          if (buckets.length > LOAD) buckets.shift();
          bucketStart = now; bucketFrames = 0;
          var severe = recent(SEVERE);
          if (severe.list.length === SEVERE && below(severe.list, 0.6) === SEVERE) return report(severe, 'early');
          var load = recent(LOAD);
          if (load.list.length === LOAD && below(load.list, 0.8) >= LOAD_SLOW && load.fps < target * 0.8) {
            return report(load, 'sustained');
          }
        }
        var elapsed = now - start;
        if (elapsed < WINDOW) return null;
        var sample = { fps: frames * 1000 / elapsed, target: target, duration: elapsed };
        start = now; frames = 0;
        return sample;
      }
    };
  }
  function validSample(sample) {
    if (!sample || !Number.isFinite(sample.fps) || sample.fps < 0 ||
        !Number.isFinite(sample.target) || sample.target < 1 || !Number.isFinite(sample.duration)) return false;
    if (sample.duration >= WINDOW) return true;
    if (sample.early === true) return sample.duration >= 3800 && sample.fps < sample.target * 0.6;
    return sample.sustained === true && sample.duration >= 7600 && sample.fps < sample.target * 0.8;
  }
  // Lowering may happen again as soon as a fresh report arrives: the meter
  // restarts with its warmup after each change, so no cooldown is stacked on
  // top. Very slow frames (< 50%) drop two tiers. Restoring stays slow, and a
  // restore followed by load within 30s doubles the stable time required next.
  function createGovernor() {
    var reduction = 0, goodWindows = 0, slowWindows = 0, lowerAfter = 0, restoreAfter = 0;
    var restoredAt = -Infinity, restoreWindows = 5;
    return {
      reduction: function () { return reduction; },
      reset: function () {
        reduction = 0; goodWindows = 0; slowWindows = 0; lowerAfter = 0; restoreAfter = 0;
        restoredAt = -Infinity; restoreWindows = 5;
      },
      clearEvidence: function () { goodWindows = 0; slowWindows = 0; },
      sample: function (sample, now, quality, enabled) {
        if (!validSample(sample)) return '';
        var slow = sample.fps < sample.target * 0.8;
        if (!enabled) {
          slowWindows = slow ? (sample.early === true || sample.sustained === true ? 2 : slowWindows + 1) : 0;
          return slowWindows >= 2 ? 'recommend' : '';
        }
        goodWindows = sample.fps >= sample.target * 0.94 ? goodWindows + 1 : 0;
        if (slow && reduction < ceiling(quality)) {
          // Reports already in flight before the last change are not new evidence.
          if (now < lowerAfter) return '';
          if (now - restoredAt < 30000) restoreWindows = Math.min(20, restoreWindows * 2);
          reduction = Math.min(ceiling(quality), reduction + (sample.fps < sample.target * 0.5 ? 2 : 1));
          goodWindows = 0; lowerAfter = now + 2500; restoreAfter = now + 60000;
          return 'lower';
        }
        if (goodWindows >= restoreWindows && reduction > 0 && now >= restoreAfter) {
          reduction--; goodWindows = 0; restoredAt = now; restoreAfter = now + 60000;
          return 'restore';
        }
        return '';
      }
    };
  }
  var api = { profile: profile, pixelRatio: pixelRatio, targetFps: targetFps, fpsLimit: fpsLimit,
    createVisibleClock: createVisibleClock, createMeter: createMeter, createGovernor: createGovernor, validSample: validSample };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MineradioSonicPerformancePolicy = api;
})(typeof window === 'undefined' ? globalThis : window);
