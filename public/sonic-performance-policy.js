/* Shared by the player and the bundled Sonic iframe. No hardware-name guesses. */
(function (root) {
  'use strict';
  var levels = ['eco', 'balanced', 'high', 'ultra'];
  var grids = [80, 112, 160, 224, 320];
  var ratios = [0.7, 0.9, 1.1, 1.35, 2];
  // The top tier is the original wallpaper: no pixel budget. No tier caps FPS;
  // frame rate always follows the user's foreground FPS setting.
  var budgets = [1300000, 1800000, 2800000, 4000000, Infinity];
  function ceiling(quality) { return Math.max(0, levels.indexOf(quality)) + 1; }
  function profile(quality, managed, reduction) {
    if (!managed) return null;
    var tier = Math.max(0, ceiling(quality) - Math.max(0, reduction || 0));
    var low = Math.floor(tier), high = Math.ceil(tier), blend = tier - low;
    function mix(values) { return values[low] + (values[high] - values[low]) * blend; }
    return { tier: tier, gridSize: Math.round(mix(grids)), dpr: mix(ratios),
      pixels: high === 4 ? Infinity : mix(budgets),
      fps: 0, floatingCount: Math.round(mix([8, 20, 40, 60, 100])) };
  }
  function pixelRatio(value, width, height, device) {
    var base = Math.min(2, Math.max(1, device || 1));
    if (!value) return base;
    // Blend the actual bounded resolutions, including the original no-budget
    // endpoint. A fractional recovery must not suddenly remove a 4K budget.
    if (value.tier % 1) {
      var low = Math.floor(value.tier), high = Math.ceil(value.tier);
      function ratio(tier) { return Math.min(base, ratios[tier], Math.sqrt(budgets[tier] / Math.max(1, width * height))); }
      return ratio(low) + (ratio(high) - ratio(low)) * (value.tier - low);
    }
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
  function loadTarget(target, floor, original) {
    return original ? target : Math.min(target, Number(floor) > 0 ? Number(floor) : target);
  }
  function createMeter() {
    var previous = 0, warmUntil = 0, target = 0, lossTarget = 0;
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
      return list.filter(function (b) { return b.frames * 1000 / b.time < lossTarget * ratio; }).length;
    }
    function report(window, flag) {
      var sample = { fps: window.fps, target: target, lossTarget: lossTarget, duration: window.duration };
      sample[flag] = true;
      // The next report needs fresh evidence; the plain window restarts too.
      buckets = []; start = previous; frames = 0;
      return sample;
    }
    return {
      reset: reset,
      frame: function (now, nextTarget, eligible, nextLossTarget) {
        nextLossTarget = Math.min(nextTarget, Number(nextLossTarget) || nextTarget);
        if (!eligible || nextTarget !== target || nextLossTarget !== lossTarget || !previous || now - previous > 1500) {
          reset(now); target = nextTarget; lossTarget = nextLossTarget; previous = now; return null;
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
          if (load.list.length === LOAD && below(load.list, 0.8) >= LOAD_SLOW && load.fps < lossTarget * 0.8) {
            return report(load, 'sustained');
          }
        }
        var elapsed = now - start;
        if (elapsed < WINDOW) return null;
        var sample = { fps: frames * 1000 / elapsed, target: target, lossTarget: lossTarget, duration: elapsed };
        start = bucketStart = now; frames = bucketFrames = 0; buckets = [];
        return sample;
      }
    };
  }
  function validSample(sample) {
    if (!sample || !Number.isFinite(sample.fps) || sample.fps < 0 ||
        !Number.isFinite(sample.target) || sample.target < 1 || !Number.isFinite(sample.duration)) return false;
    var evidenceTarget = sample.lossTarget == null ? sample.target : sample.lossTarget;
    if (!Number.isFinite(evidenceTarget) || evidenceTarget < 1 || evidenceTarget > sample.target) return false;
    if (sample.duration >= WINDOW) return true;
    if (sample.early === true) return sample.duration >= 3800 && sample.fps < evidenceTarget * 0.6;
    return sample.sustained === true && sample.duration >= 7600 && sample.fps < evidenceTarget * 0.8;
  }
  // Lowering may happen again as soon as a fresh report arrives: the meter
  // restarts with its warmup after each change. Restoring probes only a quarter
  // tier after 24s of stable evidence and at least 30s since the last change.
  // A failed probe rolls back just that step, then tries an eighth tier after
  // 45-60s of recovery. No tier is locked out for minutes or hours.
  //
  // `floor` is the smoothness worth trading detail for below the user's
  // ceiling tier. Following a high-refresh screen may cost one tier; below that
  // only drops under the floor (60 FPS) count. Fixed FPS caps pass their target.
  function createGovernor() {
    var reduction = 0, goodMs = 0, slowWindows = 0, lowerAfter = 0, restoreAfter = 0;
    var probe = null, restoreStep = 0.25, retryWait = 30000, lastSampleAt = null, targetKey = '';
    function clearEvidence() {
      goodMs = 0; slowWindows = 0; lastSampleAt = null;
      if (probe) probe.goodMs = 0;
    }
    function retarget() {
      clearEvidence(); probe = null; restoreStep = 0.25; retryWait = 30000;
      lowerAfter = restoreAfter = 0; targetKey = '';
    }
    return {
      reduction: function () { return reduction; },
      reset: function () {
        reduction = 0; retarget();
      },
      retarget: retarget,
      clearEvidence: clearEvidence,
      sample: function (sample, now, quality, enabled, floor) {
        if (!validSample(sample)) return '';
        var nextKey = sample.target + ':' + (Number(floor) || 0);
        if (targetKey && targetKey !== nextKey) retarget();
        targetKey = nextKey;
        var relaxed = Math.min(sample.target, Number(floor) > 0 ? Number(floor) : sample.target);
        function goal(level) { return loadTarget(sample.target, floor, level < 1); }
        var lossGoal = enabled ? goal(reduction) : relaxed;
        // Fast flags are valid only for the threshold that actually counted
        // the slow buckets. Never promote 144Hz evidence into a 60FPS verdict.
        if (sample.duration < WINDOW && (sample.lossTarget == null ? sample.target : sample.lossTarget) !== lossGoal) return '';
        var freshMs = lastSampleAt === null ? Math.min(WINDOW, sample.duration) :
          Math.max(0, Math.min(WINDOW, sample.duration, now - lastSampleAt));
        lastSampleAt = now;
        if (!enabled) {
          var slowForAdvice = sample.fps < relaxed * 0.8;
          slowWindows = slowForAdvice ? (sample.early === true || sample.sustained === true ? 2 : slowWindows + 1) : 0;
          return slowWindows >= 2 ? 'recommend' : '';
        }
        var slow = sample.fps < lossGoal * 0.8;
        goodMs = (reduction > 0 || probe) && sample.fps >= goal(Math.max(0, reduction - restoreStep)) * 0.94 ? goodMs + freshMs : 0;
        if (slow && probe) {
          if (now < lowerAfter) return '';
          reduction = probe.from; probe = null; goodMs = 0;
          restoreStep = 0.125; retryWait = Math.min(60000, retryWait + 15000);
          lowerAfter = now + 2500; restoreAfter = now + retryWait;
          return 'rollback';
        }
        if (probe) {
          probe.goodMs = sample.fps >= lossGoal * 0.94 ? probe.goodMs + freshMs : 0;
          if (probe.goodMs >= 24000) {
            probe = null;
            // A larger next step may cross from the 60FPS floor to high refresh.
            // Evidence collected for the smaller step cannot authorize it.
            if (restoreStep !== 0.25) goodMs = 0;
            restoreStep = 0.25; retryWait = 30000;
          }
        }
        if (slow && reduction < ceiling(quality)) {
          // Reports already in flight before the last change are not new evidence.
          if (now < lowerAfter) return '';
          reduction = Math.min(ceiling(quality), reduction + (sample.fps < relaxed * 0.5 ? 2 : 1));
          goodMs = 0; lowerAfter = now + 2500; restoreAfter = now + 30000;
          return 'lower';
        }
        if (goodMs >= 24000 && reduction > 0 && now >= restoreAfter) {
          probe = { from: reduction, goodMs: 0 };
          reduction = Math.max(0, reduction - restoreStep); goodMs = 0;
          lowerAfter = now + 2500; restoreAfter = now + 30000;
          return 'restore';
        }
        return '';
      }
    };
  }
  // Adaptive quality never caps FPS by itself; under "follow the screen" it aims
  // for the display rate, with detail traded down to keep at least this much.
  function smoothnessFloor(mode) {
    return /^(30|45|60|75|90|120)$/.test(String(mode)) ? 0 : 60;
  }
  var api = { profile: profile, pixelRatio: pixelRatio, targetFps: targetFps, fpsLimit: fpsLimit,
    createVisibleClock: createVisibleClock, createMeter: createMeter, createGovernor: createGovernor, validSample: validSample,
    smoothnessFloor: smoothnessFloor, loadTarget: loadTarget };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MineradioSonicPerformancePolicy = api;
})(typeof window === 'undefined' ? globalThis : window);
