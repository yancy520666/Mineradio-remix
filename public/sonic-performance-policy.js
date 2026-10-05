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
  function createMeter() {
    var previous = 0, warmUntil = 0, start = 0, frames = 0, target = 0;
    var fastStart = 0, fastFrames = 0, fastSlow = 0, sustainedSlow = 0;
    var fastDuration = 0, fastCount = 0, fastReported = false;
    function reset(now) {
      previous = 0; start = 0; frames = 0; warmUntil = now + 5000;
      fastStart = 0; fastFrames = 0; fastSlow = 0; sustainedSlow = 0;
      fastDuration = 0; fastCount = 0; fastReported = false;
    }
    return {
      reset: reset,
      frame: function (now, nextTarget, eligible) {
        if (!eligible || nextTarget !== target || !previous || now - previous > 1500) {
          reset(now); target = nextTarget; previous = now; return null;
        }
        previous = now;
        if (now < warmUntil) return null;
        if (!start) { start = now; fastStart = now; frames = 0; return null; }
        frames++; fastFrames++;
        var shortElapsed = now - fastStart;
        if (shortElapsed >= 3000) {
          // Two consecutive 3s windows below 60% confirm severe sustained loss.
          // Borderline drops still use the full 12s measurement windows.
          var shortFps = fastFrames * 1000 / shortElapsed;
          sustainedSlow = shortFps < target * 0.8 ? sustainedSlow + 1 : 0;
          if (shortFps < target * 0.6) {
            fastSlow++; fastDuration += shortElapsed; fastCount += fastFrames;
          } else { fastSlow = 0; fastDuration = 0; fastCount = 0; }
          fastStart = now; fastFrames = 0;
          if (fastSlow >= 2 && !fastReported) {
            fastReported = true;
            var early = { fps: fastCount * 1000 / fastDuration, target: target, duration: fastDuration, early: true };
            start = now; frames = 0; sustainedSlow = 0;
            return early;
          }
        }
        var elapsed = now - start;
        if (elapsed < 12000) return null;
        var sample = { fps: frames * 1000 / elapsed, target: target, duration: elapsed,
          sustained: sustainedSlow >= 3 };
        start = now; frames = 0; sustainedSlow = 0;
        return sample;
      }
    };
  }
  function validSample(sample) {
    if (!sample || !Number.isFinite(sample.fps) || sample.fps < 0 ||
        !Number.isFinite(sample.target) || sample.target < 1 || !Number.isFinite(sample.duration)) return false;
    return sample.duration >= 12000 ||
      (sample.early === true && sample.duration >= 6000 && sample.fps < sample.target * 0.6);
  }
  function createGovernor() {
    var reduction = 0, goodWindows = 0, slowWindows = 0, nextChange = 0;
    return {
      reduction: function () { return reduction; },
      reset: function () { reduction = 0; goodWindows = 0; slowWindows = 0; nextChange = 0; },
      clearEvidence: function () { goodWindows = 0; slowWindows = 0; },
      sample: function (sample, now, quality, enabled) {
        if (!validSample(sample)) return '';
        var slow = sample.fps < sample.target * 0.8;
        if (!enabled) {
          slowWindows = slow ? (sample.early === true || sample.sustained === true ? 2 : slowWindows + 1) : 0;
          return slowWindows >= 2 ? 'recommend' : '';
        }
        goodWindows = sample.fps >= sample.target * 0.94 ? goodWindows + 1 : 0;
        if (now < nextChange) return '';
        if (slow && reduction < ceiling(quality)) {
          reduction++; goodWindows = 0; nextChange = now + 20000; return 'lower';
        }
        if (goodWindows >= 5 && reduction > 0) {
          reduction--; goodWindows = 0; nextChange = now + 60000; return 'restore';
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
