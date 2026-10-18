/* Bounded handoff around the original WE ripple formula. */
(function (global) {
  'use strict';
  var pools = new Set(), paused = false;
  try { if (parent.MineradioSonicPerformance) paused = !!parent.MineradioSonicPerformance.config().paused; } catch (_) {}
  function contribution(ripple, time) {
    var age = Math.max(0, time - ripple.time), white = ripple.rippleType > 0.5;
    return Math.sqrt(Math.exp(-age * (white ? 18 / 18 : 14 / 22)) * Math.max(0, Math.min(1, ripple.strength * 0.4)));
  }
  function create(Vector2) {
    var values = Array.from({ length: 14 }, function () { return { pos: new Vector2(), time: -100, strength: 0, isActive: 0, rippleType: 0, retireFade: 1 }; });
    var index = 0, queue = [], lastRaw = null, clock = 0, resetAnchor = false, disposed = false;
    function time(raw) {
      if (!Number.isFinite(raw)) return clock;
      if (lastRaw == null) clock = raw;
      else if (!paused && !resetAnchor) clock += Math.max(0, raw - lastRaw);
      lastRaw = raw; resetAnchor = false; return clock;
    }
    function retireDone(now) {
      for (var i = 10; i < 14; i++) {
        var ripple = values[i];
        if (!ripple.isActive) continue;
        var amount = Math.max(0, Math.min(1, (now - ripple.retiredAt) / 0.2));
        ripple.retireFade = 1 - amount * amount * (3 - 2 * amount);
        if (amount >= 1) ripple.isActive = 0;
      }
    }
    function insert(event, now) {
      var slot = -1;
      for (var i = 0; i < 10; i++) if (!values[i].isActive || contribution(values[i], now) < 0.002) { slot = i; break; }
      if (slot < 0) {
        slot = index;
        var retiring = values.slice(10).findIndex(function (ripple) { return !ripple.isActive; });
        if (retiring < 0) return false;
        var old = values[slot];
        values[10 + retiring] = { pos: old.pos, time: old.time, strength: old.strength, isActive: 1, rippleType: old.rippleType, retireFade: 1, retiredAt: now };
      }
      values[slot] = event; index = (slot + 1) % 10; return true;
    }
    function step(now) {
      if (disposed) return values;
      retireDone(now);
      while (queue.length) {
        var event = queue[0];
        if (contribution(event, now) < 0.002) { queue.shift(); continue; }
        if (!insert(event, now)) break;
        queue.shift();
      }
      return values;
    }
    function spawn(x, z, strength, white, now) {
      if (disposed || ![x, z, strength, now].every(Number.isFinite)) return;
      step(now);
      var event = { pos: new Vector2(x, z), time: now, strength: strength, isActive: 1, rippleType: white ? 1 : 0, retireFade: 1 };
      if (!queue.length && insert(event, now)) return;
      var duplicate = queue.find(function (item) { return item.pos.x === x && item.pos.y === z && item.rippleType === event.rippleType && Math.abs(item.time - now) < 0.016; });
      if (duplicate) { duplicate.strength = Math.max(duplicate.strength, strength); return; }
      queue.push(event);
      if (queue.length > 8) {
        var weakest = 0;
        for (var i = 1; i < queue.length; i++) if (contribution(queue[i], now) < contribution(queue[weakest], now)) weakest = i;
        queue.splice(weakest, 1);
      }
    }
    var pool = { values: values, time: time, spawn: spawn, step: step,
      resetAnchor: function () { resetAnchor = true; },
      snapshot: function () { return { active: values.slice(0, 10).filter(function (r) { return r.isActive; }).length,
        retiring: values.slice(10).filter(function (r) { return r.isActive; }).length, queued: queue.length, time: clock }; },
      dispose: function () { disposed = true; queue = []; values.forEach(function (r) { r.isActive = 0; }); pools.delete(pool); }
    };
    pools.add(pool); return pool;
  }
  global.addEventListener('message', function (event) {
    if (event.source !== parent || event.origin !== location.origin || !event.data || event.data.type !== 'mineradio-sonic-performance-config') return;
    var next = !!(event.data.config && event.data.config.paused);
    if (next !== paused) pools.forEach(function (pool) { pool.resetAnchor(); });
    paused = next;
  });
  global.addEventListener('pagehide', function () { pools.forEach(function (pool) { pool.dispose(); }); });
  global.MineradioWorkshopRipples = { create: create, snapshot: function () { return Array.from(pools, function (pool) { return pool.snapshot(); }); } };
})(window);
