'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const policy = require('../public/sonic-performance-policy');

test('opt-in budgets preserve legacy defaults and stay below the saved quality', () => {
  assert.equal(policy.profile('eco', false, 4), null);
  assert.equal(policy.profile('ultra', true, 0).gridSize, 320);
  assert.equal(policy.profile('eco', true, 0).gridSize, 112);
  assert.equal(policy.profile('eco', true, 3).gridSize, 80);
  const p = policy.profile('eco', true, 0);
  const dpr = policy.pixelRatio(p, 3840, 2160, 2);
  assert(3840 * 2160 * dpr * dpr <= p.pixels + 1);
  assert.equal(policy.targetFps('30', null, 144), 30);
  assert.equal(policy.targetFps('120', null, 60), 60);
  assert.equal(policy.targetFps('vsync', p, 144), 30);
});

function runFrames(meter, start, seconds, fps, target, eligible = true) {
  const samples = [];
  for (let i = 0; i < seconds * fps; i++) {
    const value = meter.frame(start + i * 1000 / fps, target, eligible);
    if (value) samples.push(value);
  }
  return samples;
}
test('measurement excludes warmup, background, resume and deliberate frame caps', () => {
  const meter = policy.createMeter();
  assert.equal(runFrames(meter, 100, 16, 30, 30).length, 0);
  const samples = runFrames(meter, 16100, 2, 30, 30);
  assert.equal(samples.length, 1);
  assert(Math.abs(samples[0].fps - 30) < 0.1);
  assert.equal(policy.createGovernor().sample(samples[0], 18100, 'eco', false), '');
  assert.equal(runFrames(meter, 18100, 30, 5, 30, false).length, 0);
  assert.equal(runFrames(meter, 48100, 4, 30, 30).length, 0);
  assert.equal(runFrames(meter, 52100, 4, 60, 60).length, 0, 'target change starts another warmup');
});
test('sustained load lowers only opted-in visuals; recovery is slow and bounded', () => {
  const g = policy.createGovernor(), slow = { fps: 20, target: 60, duration: 12000 };
  assert.equal(g.sample(slow, 20000, 'balanced', false), 'recommend');
  assert.equal(g.reduction(), 0);
  assert.equal(g.sample(slow, 20000, 'balanced', true), 'lower');
  assert.equal(g.sample(slow, 21000, 'balanced', true), '');
  assert.equal(g.sample(slow, 41000, 'balanced', true), 'lower');
  assert.equal(g.sample(slow, 62000, 'balanced', true), '');
  assert.equal(g.reduction(), 2);
  for (let i = 0; i < 4; i++) assert.equal(g.sample({ fps: 30, target: 30, duration: 12000 }, 80000 + i * 12000, 'balanced', true), '');
  assert.equal(g.sample({ fps: 30, target: 30, duration: 12000 }, 128000, 'balanced', true), 'restore');
  assert.equal(g.reduction(), 1);
  g.reset(); assert.equal(g.reduction(), 0);
});

function controller(storage = new Map()) {
  const nodes = new Map(), events = {}, frameWindow = { postMessage() {} };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle() {} } });
    return nodes.get(id);
  };
  let tick, time = 20000, focused = true;
  const window = { fx: { preset: 8, performanceQuality: 'eco', foregroundFpsMode: 'vsync' },
    MineradioSonicPerformancePolicy: policy,
    addEventListener: (name, fn) => { events[name] = fn; } };
  const context = { window, document: { hidden: false, hasFocus: () => focused,
    body: { classList: { contains: () => false } }, getElementById: node,
    querySelector: () => ({ contentWindow: frameWindow }) },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    location: { origin: 'http://localhost' }, performance: { now: () => time },
    setInterval: fn => { tick = fn; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sonic-performance.js'), 'utf8'), context);
  tick();
  return { api: window.MineradioSonicPerformance, window, node, tick, storage,
    focus: value => { focused = value; }, advance: ms => { time += ms; },
    emit: (data, source = frameWindow) => events.message({ source, origin: 'http://localhost', data }) };
}
test('keep-current is remembered; opt-in/disable restores the saved visual without writing fx', () => {
  const c = controller();
  assert.equal(c.api.profile(), null);
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 15, target: 60, duration: 12000 } };
  c.emit(slow, {}); assert.equal(c.api.snapshot().recommendation, false, 'reject old/foreign iframe');
  c.focus(false); c.emit(slow); assert.equal(c.api.snapshot().recommendation, false);
  c.focus(true); c.emit(slow); assert.equal(c.api.snapshot().recommendation, true);
  c.api.dismiss(); c.emit(slow); assert.equal(c.api.snapshot().recommendation, false);
  const reopened = controller(c.storage); reopened.emit(slow);
  assert.equal(reopened.api.snapshot().recommendation, false);
  reopened.api.setEnabled(true); assert.equal(reopened.api.profile().gridSize, 112);
  reopened.emit(slow); assert.equal(reopened.api.profile().gridSize, 80);
  assert.equal(reopened.window.fx.performanceQuality, 'eco');
  reopened.api.setEnabled(false); assert.equal(reopened.api.profile(), null);
  reopened.api.qualityChanged(); assert.equal(reopened.api.profile().gridSize, 112);
  assert.equal(controller(c.storage).api.profile().gridSize, 112, 'manual-quality intent survives restart');
});
test('render interruption times out, recovers, and leaves the selected wallpaper intact', () => {
  const c = controller();
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'lost' });
  assert.equal(c.node('sonic-performance-notice').hidden, false);
  c.advance(16000); c.tick();
  assert.equal(c.api.snapshot().health[8].state, 'failed');
  assert.equal(c.window.fx.preset, 8);
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'ready' });
  assert.equal(c.node('sonic-performance-notice').hidden, true);
});
