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
    // Ultra retains every original adaptive endpoint. Lower tiers use tighter
    // decorative budgets without changing frame cadence or governor behavior.
    var detailGrids = quality === 'ultra' ? grids : [80, 96, 128, 192, 320];
    var detailRatios = quality === 'ultra' ? ratios : [0.7, 0.8, 1, 1.2, 2];
    var detailBudgets = quality === 'ultra' ? budgets : [1300000, 1400000, 2100000, 3200000, Infinity];
    function mix(values) { return values[low] + (values[high] - values[low]) * blend; }
    return { tier: tier, gridSize: Math.round(mix(detailGrids)), dpr: mix(detailRatios),
      pixels: high === 4 ? Infinity : mix(detailBudgets),
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
      var originalRatio = ratio(low) + (ratio(high) - ratio(low)) * (value.tier - low);
      // Keep legacy interpolation as a ceiling, including for explicit profiles.
      // Original/ultra profiles already fit these bounds and remain unchanged.
      return Math.min(originalRatio, value.dpr, Math.sqrt(value.pixels / Math.max(1, width * height)));
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
  // The smoothness goal is the same for every tier and for default-on or
  // manual adaptation: 60 FPS (or the screen, if slower) when following the
  // screen, otherwise the user's fixed cap. Running below a high refresh rate
  // is never frame loss on its own, nor is running slower than earlier in the
  // song; only falling under this goal or repeated long frames are.
  function loadTarget(target, floor) {
    return Math.min(target, Number(floor) > 0 ? Number(floor) : target);
  }
  // Frames are counted in 1s buckets after a 3s warmup. A report needs most of
  // the recent buckets to be bad, so one hitch (song change, cover decode, GC)
  // cannot trigger it on its own:
  //   severe: all of the last 4 buckets below 60% of the goal       -> about 7s
  //   load:   7 of the last 8 below 80% and their mean too         -> about 11s
  //   jank:   6 of the last 8 with 2+ long frames (> 2.5 intervals) -> about 11s
  // Every 12s a plain window is also reported for recovery decisions. Each
  // report carries `long`, the long frames per second it saw.
  var WARMUP = 3000, SEVERE = 4, LOAD = 8, LOAD_SLOW = 7, JANK_BUCKETS = 6, JANK_FRAMES = 2, WINDOW = 12000;
  function createMeter() {
    var previous = 0, warmUntil = 0, target = 0, lossTarget = 0, longMs = Infinity;
    var start = 0, frames = 0, longFrames = 0, bucketStart = 0, bucketFrames = 0, bucketLong = 0, buckets = [];
    function reset(now) {
      previous = 0; warmUntil = now + WARMUP;
      start = 0; frames = 0; longFrames = 0; bucketStart = 0; bucketFrames = 0; bucketLong = 0; buckets = [];
    }
    function recent(count) {
      var list = buckets.slice(-count), time = 0, n = 0, long = 0;
      list.forEach(function (b) { time += b.time; n += b.frames; long += b.long; });
      return { list: list, fps: time ? n * 1000 / time : 0, long: time ? long * 1000 / time : 0, duration: time };
    }
    function below(list, ratio) {
      return list.filter(function (b) { return b.frames * 1000 / b.time < lossTarget * ratio; }).length;
    }
    function janky(list) {
      return list.filter(function (b) { return b.long >= JANK_FRAMES; }).length;
    }
    function report(window, flag) {
      var sample = { fps: window.fps, target: target, lossTarget: lossTarget, duration: window.duration, long: window.long };
      sample[flag] = true;
      // The next report needs fresh evidence; the plain window restarts too.
      buckets = []; start = previous; frames = 0; longFrames = 0;
      return sample;
    }
    return {
      reset: reset,
      frame: function (now, nextTarget, eligible, nextLossTarget) {
        nextLossTarget = Math.min(nextTarget, Number(nextLossTarget) || nextTarget);
        if (!eligible || nextTarget !== target || nextLossTarget !== lossTarget || !previous || now - previous > 1500) {
          reset(now); target = nextTarget; lossTarget = nextLossTarget; longMs = 2500 / Math.max(1, lossTarget);
          previous = now; return null;
        }
        var gap = now - previous;
        previous = now;
        if (now < warmUntil) return null;
        if (!start) { start = bucketStart = now; frames = bucketFrames = longFrames = bucketLong = 0; return null; }
        frames++; bucketFrames++;
        if (gap > longMs) { longFrames++; bucketLong++; }
        if (now - bucketStart >= 1000) {
          buckets.push({ frames: bucketFrames, time: now - bucketStart, long: bucketLong });
          if (buckets.length > LOAD) buckets.shift();
          bucketStart = now; bucketFrames = 0; bucketLong = 0;
          var severe = recent(SEVERE);
          if (severe.list.length === SEVERE && below(severe.list, 0.6) === SEVERE) return report(severe, 'early');
          var load = recent(LOAD);
          if (load.list.length === LOAD && below(load.list, 0.8) >= LOAD_SLOW && load.fps < lossTarget * 0.8) {
            return report(load, 'sustained');
          }
          if (load.list.length === LOAD && janky(load.list) >= JANK_BUCKETS) return report(load, 'jank');
        }
        var elapsed = now - start;
        if (elapsed < WINDOW) return null;
        var sample = { fps: frames * 1000 / elapsed, target: target, lossTarget: lossTarget, duration: elapsed,
          long: longFrames * 1000 / elapsed };
        start = bucketStart = now; frames = bucketFrames = longFrames = bucketLong = 0; buckets = [];
        return sample;
      }
    };
  }
  function validSample(sample) {
    if (!sample || !Number.isFinite(sample.fps) || sample.fps < 0 ||
        !Number.isFinite(sample.target) || sample.target < 1 || !Number.isFinite(sample.duration)) return false;
    var evidenceTarget = sample.lossTarget == null ? sample.target : sample.lossTarget;
    if (!Number.isFinite(evidenceTarget) || evidenceTarget < 1 || evidenceTarget > sample.target) return false;
    if (sample.long != null && !(Number(sample.long) >= 0)) return false;
    if (sample.duration >= WINDOW) return true;
    if (sample.early === true) return sample.duration >= 3800 && sample.fps < evidenceTarget * 0.6;
    if (sample.jank === true) return sample.duration >= 7600;
    return sample.sustained === true && sample.duration >= 7600 && sample.fps < evidenceTarget * 0.8;
  }
  // Lowering may happen again as soon as a fresh report arrives: the meter
  // restarts with its warmup after each change. Each lowering is checked by the
  // next report: if frames are still bad and neither FPS (+10%) nor long frames
  // (-30%) improved, detail was not the bottleneck (CPU work, another program
  // on the GPU), so the step is undone and lowering pauses for 5 minutes,
  // doubling up to 20 while it keeps happening under the same workload. New
  // severe loss or a material change in FPS/jank can end the pause early.
  //
  // Restoring probes only a quarter tier after 24s of stable evidence and at
  // least 30s since the last change. A failed probe rolls back just that step,
  // then tries an eighth tier. Each consecutive failure doubles the wait (60s,
  // 2, 4, 8, then 10 min max), so step-like load (e.g. a dense chorus) cannot
  // cause a stutter every minute; a successful probe or a new goal resets it.
  function createGovernor() {
    var reduction = 0, goodMs = 0, lowerAfter = 0, restoreAfter = 0;
    var probe = null, restoreStep = 0.25, retryWait = 30000, lastSampleAt = null, targetKey = '';
    var pending = null, pauseUntil = 0, pauseWait = 300000;
    var pausedLoad = null;
    function goal(target, floor) { return loadTarget(target, floor); }
    function clearEvidence() {
      goodMs = 0; lastSampleAt = null; pending = null;
      if (probe) probe.goodMs = 0;
    }
    function retarget() {
      clearEvidence(); probe = null; restoreStep = 0.25; retryWait = 30000;
      lowerAfter = restoreAfter = 0; targetKey = ''; pauseUntil = 0; pauseWait = 300000;
      pausedLoad = null;
    }
    return {
      reduction: function () { return reduction; },
      goal: goal,
      reset: function () {
        reduction = 0; retarget();
      },
      retarget: retarget,
      clearEvidence: clearEvidence,
      sample: function (sample, now, quality, enabled, floor) {
        if (!validSample(sample) || !enabled) return '';
        var nextKey = sample.target + ':' + (Number(floor) || 0);
        if (targetKey && targetKey !== nextKey) retarget();
        targetKey = nextKey;
        var lossGoal = goal(sample.target, floor);
        // Fast flags are valid only for the threshold that actually counted
        // the bad buckets. Never promote 144Hz evidence into a 60FPS verdict.
        if (sample.duration < WINDOW && (sample.lossTarget == null ? sample.target : sample.lossTarget) !== lossGoal) return '';
        // Reports already in flight before the last change are not new evidence.
        if (now < lowerAfter) return '';
        var freshMs = lastSampleAt === null ? Math.min(WINDOW, sample.duration) :
          Math.max(0, Math.min(WINDOW, sample.duration, now - lastSampleAt));
        lastSampleAt = now;
        var long = Number(sample.long) || 0;
        var bad = sample.fps < lossGoal * 0.8 || sample.jank === true;
        // Backoff applies to the same ineffective workload, not to a new
        // severe drop. Fresh reports still supply the usual drop confirmation.
        if (pausedLoad && now < pauseUntil && bad &&
            (sample.fps < pausedLoad.fps * 0.75 || sample.fps > pausedLoad.fps * 1.25 ||
             (pausedLoad.fps >= lossGoal * 0.6 && sample.fps < lossGoal * 0.6) ||
             long > Math.max(2, pausedLoad.long * 1.5) || (sample.jank === true && pausedLoad.long < 0.5))) {
          pauseUntil = 0; pauseWait = 300000; pausedLoad = null;
        }
        if (pending) {
          var improved = sample.fps >= pending.fps * 1.1 || (pending.long > 0 && long <= pending.long * 0.7);
          var lowered = pending;
          pending = null;
          if (bad && !improved) {
            reduction = lowered.from; probe = null; goodMs = 0;
            pauseUntil = now + pauseWait; pauseWait = Math.min(1200000, pauseWait * 2);
            pausedLoad = { fps: sample.fps, long: long };
            lowerAfter = now + 2500; restoreAfter = now + 30000;
            return 'ineffective';
          }
          if (improved) pauseWait = 300000;
        }
        var good = !bad && sample.fps >= lossGoal * 0.94 && long < 0.5;
        goodMs = (reduction > 0 || probe) && good ? goodMs + freshMs : 0;
        if (bad && probe) {
          reduction = probe.from; probe = null; goodMs = 0;
          restoreStep = 0.125; retryWait = Math.min(600000, retryWait * 2);
          lowerAfter = now + 2500; restoreAfter = now + retryWait;
          return 'rollback';
        }
        if (probe) {
          probe.goodMs = good ? probe.goodMs + freshMs : 0;
          if (probe.goodMs >= 24000) { probe = null; restoreStep = 0.25; retryWait = 30000; }
        }
        if (bad && reduction < ceiling(quality) && now >= pauseUntil) {
          pending = { from: reduction, fps: sample.fps, long: long };
          reduction = Math.min(ceiling(quality), reduction + (sample.fps < lossGoal * 0.5 ? 2 : 1));
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
  // Adaptive quality never caps FPS by itself. Following the screen, detail is
  // traded only to keep 60 FPS; a fixed cap (30/45/.../120) is its own goal.
  function smoothnessFloor(mode) {
    return /^(30|45|60|75|90|120)$/.test(String(mode)) ? 0 : 60;
  }
  var api = { profile: profile, pixelRatio: pixelRatio, targetFps: targetFps, fpsLimit: fpsLimit,
    createVisibleClock: createVisibleClock, createMeter: createMeter, createGovernor: createGovernor, validSample: validSample,
    smoothnessFloor: smoothnessFloor, loadTarget: loadTarget };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MineradioSonicPerformancePolicy = api;
})(typeof window === 'undefined' ? globalThis : window);
