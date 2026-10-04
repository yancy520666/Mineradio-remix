'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const policy = require('../public/sonic-performance-policy');

function scheduler(hz, fps) {
  let next = 0, time = 0, draws = 0;
  const callbacks = new Map(), events = {};
  const raf = fn => { callbacks.set(++next, fn); return next; };
  const root = { frameloop: 'demand', scene: {}, camera: {},
    clock: { getDelta: () => 1 / hz },
    internal: { active: true, priority: 0, subscribers: [], frames: 0 },
    gl: { render: () => { draws++; } } };
  const parent = { postMessage() {}, MineradioSonicPerformance: {
    config: () => ({ profile: null, target: hz, fpsLimit: fps, eligible: true, paused: false })
  } };
  const context = vm.createContext({ parent, location: { origin: 'http://localhost' },
    window: { MineradioSonicPerformancePolicy: policy,
      addEventListener: (name, fn) => { events[name] = fn; } },
    document: { addEventListener() {} }, performance: { now: () => time },
    requestAnimationFrame: raf, cancelAnimationFrame: id => callbacks.delete(id),
    Nf: new Map([['root', { store: { getState: () => root } }]]), $m() {} });
  // Execute the vendored R3F demand loop, including its pending-frame coalescing.
  const vendor = fs.readFileSync(path.join(__dirname, '../public/vendor/sonic-workshop/assets/index-Z-j1MQ-r.js'), 'utf8');
  const start = vendor.indexOf('let Rb,Db;function wM('), end = vendor.indexOf('function oC(', start);
  assert(start >= 0 && end > start, 'Locate the actual vendored render loop');
  vm.runInContext(vendor.slice(start, end), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/vendor/sonic-workshop/mineradio-performance.js'), 'utf8'), context);
  const stop = context.window.__mineradioWorkshopSchedule(() => context.RM(root), fps);
  return { stop, draws: () => draws,
    run: seconds => {
      for (let i = 0; i < Math.round(seconds * hz); i++) {
        time += 1000 / hz;
        for (const id of Array.from(callbacks.keys())) {
          const callback = callbacks.get(id);
          if (callback) { callbacks.delete(id); callback(time); }
        }
      }
    },
    pause: paused => events.message({ source: parent, origin: 'http://localhost',
      data: { type: 'mineradio-sonic-performance-config', config: {
        profile: null, target: hz, fpsLimit: fps, eligible: !paused, paused
      } } }) };
}

test('uncapped workshop draws at display cadence rather than half refresh', () => {
  for (const hz of [60, 144, 240]) {
    const s = scheduler(hz, 0);
    s.run(10);
    assert(Math.abs(s.draws() - (hz * 10 - 1)) <= 1, hz + ' Hz: ' + s.draws() + ' draws');
    s.stop();
  }
});

test('fixed caps, paused rendering and scheduler cleanup retain their cadence', () => {
  for (const fps of [30, 45, 60, 120]) {
    const s = scheduler(240, fps);
    s.run(10);
    assert(Math.abs(s.draws() - fps * 10) <= 1, fps + ' FPS: ' + s.draws() + ' draws');
    s.pause(true); s.run(0.1);
    const pausedDraws = s.draws();
    s.run(2); assert.equal(s.draws(), pausedDraws);
    s.pause(false); s.run(2);
    assert(Math.abs(s.draws() - pausedDraws - fps * 2) <= 1);
    s.stop(); s.run(0.1);
    const stoppedDraws = s.draws();
    s.run(2); assert.equal(s.draws(), stoppedDraws);
  }
});
