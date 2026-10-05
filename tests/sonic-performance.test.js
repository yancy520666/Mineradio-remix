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
  assert.equal(policy.targetFps('vsync', p, 144), 144, 'lower detail never lowers the frame-rate goal');
});

test('ultra is the original wallpaper and default vsync leaves the renderer uncapped', () => {
  const ultra = policy.profile('ultra', true, 0);
  assert.equal(ultra.fps, 0);
  assert.equal(ultra.floatingCount, 100, 'ultra keeps the full user-selectable block range');
  assert.equal(policy.pixelRatio(ultra, 3840, 2160, 2), policy.pixelRatio(null, 3840, 2160, 2));
  assert.equal(policy.targetFps('vsync', ultra, 144), 144);
  assert.equal(policy.fpsLimit('vsync', null, 100), 0);
  assert.equal(policy.fpsLimit('vsync', ultra, 144), 0);
  assert.equal(policy.fpsLimit('45', null, 144), 45);
  assert.equal(policy.fpsLimit('vsync', policy.profile('eco', true, 0), 144), 0, 'no tier caps FPS under follow-screen');
  assert.equal(policy.fpsLimit('60', policy.profile('eco', true, 3), 144), 60, 'a fixed cap stays the user cap');
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
  assert.equal(runFrames(meter, 100, 14, 30, 30).length, 0, '3s warmup plus a 12s plain window');
  const samples = runFrames(meter, 14100, 2, 30, 30);
  assert.equal(samples.length, 1);
  assert(Math.abs(samples[0].fps - 30) < 0.1);
  assert.equal(policy.createGovernor().sample(samples[0], 16100, 'eco', false), '');
  assert.equal(runFrames(meter, 16100, 30, 5, 30, false).length, 0);
  assert.equal(runFrames(meter, 46100, 4, 30, 30).length, 0);
  assert.equal(runFrames(meter, 50100, 4, 60, 60).length, 0, 'target change starts another warmup');
  const slow = runFrames(policy.createMeter(), 100, 12, 20, 30)[0];
  assert.equal(slow.target, 30, 'a slow renderer keeps the requested target');
  assert.equal(slow.sustained, true);
  assert(Math.abs(slow.fps - 20) < 0.1, 'measure actual throughput rather than the cap');
  assert.equal(policy.createGovernor().sample(slow, 12100, 'eco', true), 'lower');
});
test('sustained load lowers only opted-in visuals without stacked cooldowns; recovery is slow and bounded', () => {
  const g = policy.createGovernor(), slow = { fps: 40, target: 60, duration: 12000 };
  assert.equal(g.sample(slow, 8000, 'balanced', false), '');
  assert.equal(g.sample(slow, 20000, 'balanced', false), 'recommend');
  assert.equal(g.reduction(), 0);
  assert.equal(g.sample(slow, 20000, 'balanced', true), 'lower');
  assert.equal(g.sample(slow, 21000, 'balanced', true), '', 'a report already in flight is not new evidence');
  assert.equal(g.sample(slow, 27000, 'balanced', true), 'lower', 'the next fresh report may lower again');
  assert.equal(g.sample(slow, 62000, 'balanced', true), '');
  assert.equal(g.reduction(), 2);
  for (let i = 0; i < 4; i++) assert.equal(g.sample({ fps: 30, target: 30, duration: 12000 }, 90000 + i * 12000, 'balanced', true), '');
  assert.equal(g.sample({ fps: 30, target: 30, duration: 12000 }, 138000, 'balanced', true), 'restore');
  assert.equal(g.reduction(), 1);
  g.reset(); assert.equal(g.reduction(), 0);
});

test('very slow frames drop two tiers; a tier whose restore brings load back is not retried for a while', () => {
  const g = policy.createGovernor();
  assert.equal(g.sample({ fps: 25, target: 60, duration: 4000, early: true }, 10000, 'ultra', true), 'lower');
  assert.equal(g.reduction(), 2);
  const good = { fps: 60, target: 60, duration: 12000 };
  let now = 10000, action = '';
  while (action !== 'restore') { now += 12000; action = g.sample(good, now, 'ultra', true); }
  assert.equal(g.reduction(), 1);
  assert(now - 10000 >= 60000 && now - 10000 < 75000, 'first restore after about a minute');
  assert.equal(g.sample({ fps: 40, target: 60, duration: 8000, sustained: true }, now + 10000, 'ultra', true), 'lower');
  const loweredAt = now + 10000;
  let restoredAt = 0;
  for (let t = loweredAt + 12000; !restoredAt && t < loweredAt + 3600000; t += 12000) {
    if (g.sample(good, t, 'ultra', true) === 'restore') restoredAt = t;
  }
  assert(restoredAt - loweredAt >= 600000, 'the failed tier waits at least 10 minutes');
  assert.equal(g.sample({ fps: 40, target: 60, duration: 8000, sustained: true }, restoredAt + 10000, 'ultra', true), 'lower');
  const again = restoredAt + 10000;
  let next = 0;
  for (let t = again + 12000; !next && t < again + 7200000; t += 12000) {
    if (g.sample(good, t, 'ultra', true) === 'restore') next = t;
  }
  assert(next - again >= 1200000, 'repeated failures double the wait');
  g.reset();
  g.sample({ fps: 25, target: 60, duration: 4000, early: true }, 10000, 'ultra', true);
  now = 10000; action = '';
  while (action !== 'restore') { now += 12000; action = g.sample(good, now, 'ultra', true); }
  assert(now - 10000 < 75000, 'a reset (new target, preset or opt-in) forgets old blocks');
});

test('follow-screen trades at most one tier for refresh above 60 FPS; fixed caps are honored fully', () => {
  const floor = policy.smoothnessFloor('vsync');
  assert.equal(floor, 60);
  assert.equal(policy.smoothnessFloor('120'), 0);
  const g = policy.createGovernor();
  const at = fps => ({ fps, target: 144, duration: 12000 });
  assert.equal(g.sample(at(100), 1000, 'ultra', true, floor), 'lower', 'original detail chases the screen rate');
  assert.equal(g.reduction(), 1);
  assert.equal(g.sample(at(100), 20000, 'ultra', true, floor), '', 'below the top tier, 100 FPS is smooth enough');
  assert.equal(g.sample(at(45), 30000, 'ultra', true, floor), 'lower', 'under the 60 FPS floor detail still drops');
  assert.equal(g.reduction(), 2);
  const fixed = policy.createGovernor();
  fixed.sample(at(100), 1000, 'ultra', true, policy.smoothnessFloor('120'));
  assert.equal(fixed.sample({ fps: 80, target: 120, duration: 12000 }, 20000, 'ultra', true, 0), 'lower',
    'an explicit 120 FPS cap is the goal at every tier');
  const advice = policy.createGovernor();
  assert.equal(advice.sample({ ...at(100), sustained: true, duration: 8000 }, 1000, 'ultra', false, floor), '',
    '100 FPS on a 144 Hz screen is not reported as frame loss');
  assert.equal(advice.sample({ ...at(40), sustained: true, duration: 8000 }, 2000, 'ultra', false, floor), 'recommend');
});

function controller(storage = new Map()) {
  const nodes = new Map(), events = {}, flags = new Set(), frameWindow = { postMessage() {} };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle() {} } });
    return nodes.get(id);
  };
  let tick, time = 20000, focused = true;
  const doc = { hidden: false, hasFocus: () => focused,
    body: { classList: { contains: name => flags.has(name) } }, getElementById: node,
    querySelector: () => ({ contentWindow: frameWindow }) };
  const window = { fx: { preset: 8, performanceQuality: 'eco', foregroundFpsMode: 'vsync' },
    MineradioSonicPerformancePolicy: policy,
    addEventListener: (name, fn) => { events[name] = fn; },
    classifyRendererGpu: vm.runInNewContext(fs.readFileSync(path.join(__dirname,
      '../public/js/modules/00-state/08a-first-run-quality.js'), 'utf8') + '\nclassifyRendererGpu') };
  const context = { window, document: doc,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    location: { origin: 'http://localhost' }, performance: { now: () => time },
    setInterval: fn => { tick = fn; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sonic-performance.js'), 'utf8'), context);
  tick();
  return { api: window.MineradioSonicPerformance, window, node, tick, storage, flags,
    runTicks: ms => { for (let elapsed = 0; elapsed < ms; elapsed += 500) { time += 500; tick(); } },
    focus: value => { focused = value; }, hide: value => { doc.hidden = value; }, advance: ms => { time += ms; },
    emit: (data, source = frameWindow) => events.message({ source, origin: 'http://localhost', data }) };
}
test('keep-current is remembered; opt-in/disable restores the saved visual without writing fx', () => {
  const c = controller();
  assert.equal(c.api.profile(), null);
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 15, target: 60, duration: 12000 } };
  c.emit(slow, {}); assert.equal(c.api.snapshot().recommendation, false, 'reject old/foreign iframe');
  c.focus(false); c.emit(slow); assert.equal(c.api.snapshot().recommendation, false);
  c.focus(true); c.emit(slow); assert.equal(c.api.snapshot().recommendation, false);
  c.emit(slow); assert.equal(c.api.snapshot().recommendation, true);
  c.api.dismiss(); c.emit(slow); assert.equal(c.api.snapshot().recommendation, false);
  const reopened = controller(c.storage); reopened.emit(slow);
  assert.equal(reopened.api.snapshot().recommendation, false);
  reopened.api.setEnabled(true); assert.equal(reopened.api.profile().gridSize, 112);
  reopened.emit(slow);
  assert.equal(reopened.api.profile().gridSize, 80);
  assert.equal(reopened.window.fx.performanceQuality, 'eco');
  reopened.api.setEnabled(false); assert.equal(reopened.api.profile(), null);
  reopened.api.qualityChanged(); assert.equal(reopened.api.profile().gridSize, 112);
  assert.equal(reopened.api.stageProfile(), null, 'quality choice alone leaves the topography stage unchanged');
  assert.equal(controller(c.storage).api.profile().gridSize, 112, 'manual-quality intent survives restart');
});
test('a healthy window clears the recommendation without dismissing future load reports', () => {
  const c = controller();
  const emit = fps => c.emit({ type: 'mineradio-sonic-performance-sample', sample: { fps, target: 60, duration: 12000 } });
  emit(42);
  assert.equal(c.api.snapshot().recommendation, false);
  emit(42);
  assert.equal(c.api.snapshot().recommendation, true);
  emit(60);
  assert.equal(c.api.snapshot().recommendation, false);
  assert.equal(c.node('sonic-performance-notice').hidden, true);
  assert.equal(c.api.snapshot().preferences.dismissed, false);
  emit(42);
  emit(42);
  assert.equal(c.api.snapshot().recommendation, true);
});

test('changing the requested FPS clears old advice and rejects late samples for the old target', () => {
  const c = controller();
  const emit = (fps, target) => c.emit({ type: 'mineradio-sonic-performance-sample', sample: { fps, target, duration: 12000 } });
  emit(42, 60);
  emit(42, 60);
  c.window.fx.foregroundFpsMode = '30'; c.tick();
  assert.equal(c.api.snapshot().recommendation, false);
  assert.equal(c.api.snapshot().sample, null);
  emit(42, 60);
  assert.equal(c.api.snapshot().recommendation, false);
  assert.equal(c.api.snapshot().sample, null);
  emit(30, 30);
  assert.equal(c.api.snapshot().sample.target, 30);
});

test('render interruption times out, recovers, and leaves the selected wallpaper intact', () => {
  const c = controller();
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'lost' });
  assert.equal(c.node('sonic-performance-notice').hidden, false);
  c.hide(true); c.advance(30000); c.tick();
  assert.equal(c.api.snapshot().health[8].state, 'lost', 'hidden time does not count toward the timeout');
  c.hide(false); c.tick(); c.runTicks(16500);
  assert.equal(c.api.snapshot().health[8].state, 'failed');
  assert.equal(c.window.fx.preset, 8);
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'ready' });
  assert.equal(c.node('sonic-performance-notice').hidden, true);
});

test('suspended background timers do not cause an immediate failure on resume', () => {
  const c = controller();
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'lost' });
  c.runTicks(5000);
  c.hide(true); c.advance(30000); // No tick while the renderer is suspended.
  c.hide(false); c.tick();
  assert.equal(c.api.snapshot().health[8].state, 'lost');
  c.runTicks(14000);
  assert.equal(c.api.snapshot().health[8].state, 'lost');
  c.runTicks(2000);
  assert.equal(c.api.snapshot().health[8].state, 'failed');
});

test('missing successful draws fail even after ready; current draws recover and old frames cannot', () => {
  const c = controller(), draw = { type: 'mineradio-sonic-performance-draw' };
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'ready' });
  c.runTicks(17000);
  assert.equal(c.api.snapshot().health[8].state, 'failed');
  c.emit(draw, {});
  assert.equal(c.api.snapshot().health[8].state, 'failed');
  c.emit(draw);
  assert.equal(c.api.snapshot().health[8].state, 'ready');
  c.focus(false); c.runTicks(20000);
  assert.equal(c.api.snapshot().health[8].state, 'ready', 'occluded/unfocused frame suspension is not a render failure');
  c.focus(true); c.tick();
  for (let i = 0; i < 20; i++) { c.runTicks(1000); c.emit(draw); }
  assert.equal(c.api.snapshot().health[8].state, 'ready');
});

test('severe sustained drops are reported after warmup and four slow seconds', () => {
  const samples = runFrames(policy.createMeter(), 100, 8, 15, 60);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].early, true);
  assert(samples[0].duration >= 4000 && samples[0].duration < 4200);
  assert(Math.abs(samples[0].fps - 15) < 0.1);
  assert.equal(policy.createGovernor().sample(samples[0], 7200, 'ultra', false), 'recommend');
  assert.equal(policy.createGovernor().sample(samples[0], 7200, 'ultra', true), 'lower');
  const c = controller();
  c.emit({ type: 'mineradio-sonic-performance-sample', sample: samples[0] });
  assert.equal(c.api.snapshot().recommendationReason, 'load');
});

test('borderline loss keeps long-window confirmation; brief freezes and alternating load do not trigger fast advice', () => {
  const borderline = runFrames(policy.createMeter(), 100, 12, 42, 60)[0];
  assert(!borderline.early);
  assert(borderline.duration >= 8000 && borderline.duration < 8200, 'about 11s including warmup');
  const g = policy.createGovernor();
  assert.equal(borderline.sustained, true);
  assert.equal(g.sample(borderline, 18000, 'ultra', false), 'recommend');
  for (const freezeAt of [7900, 8100, 10900]) {
    const meter = policy.createMeter(), samples = [];
    for (let now = 100; now < 18000; now += 1000 / 60) {
      if (now >= freezeAt && now < freezeAt + 800) continue;
      const sample = meter.frame(now, 60, true);
      if (sample) samples.push(sample);
    }
    assert(samples.every(sample => !sample.early), 'one freeze must not trigger the fast path');
  }
  const meter = policy.createMeter(), alternating = [];
  let now = 100;
  for (const [seconds, fps] of [[8, 60], [3, 15], [3, 60], [3, 15], [3, 60]]) {
    for (let i = 0; i < seconds * fps; i++) {
      now += 1000 / fps;
      const sample = meter.frame(now, 60, true);
      if (sample) alternating.push(sample);
    }
  }
  assert(alternating.every(sample => !sample.early));
  assert.equal(policy.validSample({ fps: 15, target: 60, duration: 3799, early: true }), false);
  assert.equal(policy.validSample({ fps: 42, target: 60, duration: 4000, early: true }), false);
  assert.equal(policy.validSample({ fps: 42, target: 60, duration: 7599, sustained: true }), false);
  assert.equal(policy.validSample({ fps: 50, target: 60, duration: 8000, sustained: true }), false);
});

test('hardware advice uses the active background renderer, waits for visible readiness and is shown once', () => {
  const c = controller();
  c.api.snapshot().gpu[7] = 'Intel UHD Graphics 620';
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'ready', gpu: 'NVIDIA GeForce RTX 4070' });
  c.runTicks(6000);
  assert.equal(c.api.snapshot().recommendation, false, 'an unused integrated renderer must not influence the workshop');
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'ready', gpu: 'Intel Iris Xe Graphics' });
  c.focus(false); c.runTicks(6000);
  assert.equal(c.api.snapshot().recommendation, false);
  c.focus(true); c.runTicks(5000);
  assert.equal(c.api.snapshot().recommendation, false);
  c.runTicks(1000);
  assert.equal(c.api.snapshot().recommendationReason, 'gpu');
  assert.equal(c.window.fx.performanceQuality, 'eco', 'advice must not change a saved quality');
  c.api.closeNotice();
  const reopened = controller(c.storage);
  reopened.emit({ type: 'mineradio-sonic-performance-health', state: 'ready', gpu: 'Intel Iris Xe Graphics' });
  reopened.runTicks(6000);
  assert.equal(reopened.api.snapshot().recommendation, false, 'the GPU tip is shown once');
  assert.equal(reopened.api.snapshot().preferences.dismissed, false, 'closing is not a remembered refusal');
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 15, target: 60, duration: 4000, early: true } };
  reopened.emit(slow);
  assert.equal(reopened.api.snapshot().recommendationReason, 'load', 'real load can still be suggested later');
  reopened.api.keep();
  assert.equal(reopened.api.snapshot().preferences.dismissed, true);
});

test('manual disable stays disabled across restart; opting back in permits adaptation', () => {
  const c = controller();
  c.api.setEnabled(true); c.api.setEnabled(false);
  const reopened = controller(c.storage);
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 15, target: 60, duration: 12000 } };
  reopened.emit(slow); reopened.emit(slow);
  assert.equal(reopened.api.snapshot().recommendation, false);
  assert.equal(reopened.api.snapshot().preferences.enabled, false);
  reopened.api.setEnabled(true);
  reopened.emit(slow);
  assert.equal(reopened.api.profile().tier, 0);
});

test('guides, background interruptions and target changes break consecutive evidence', () => {
  const c = controller();
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 42, target: 60, duration: 12000 } };
  c.emit(slow);
  c.flags.add('visual-guide-active'); c.tick(); c.emit(slow);
  assert.equal(c.api.snapshot().recommendation, false);
  c.flags.clear(); c.emit(slow);
  assert.equal(c.api.snapshot().recommendation, false);
  c.hide(true); c.tick(); c.hide(false); c.emit(slow);
  assert.equal(c.api.snapshot().recommendation, false);
  c.window.fx.foregroundFpsMode = '30'; c.tick();
  c.emit({ ...slow, sample: { fps: 20, target: 30, duration: 12000 } });
  assert.equal(c.api.snapshot().recommendation, false);
});

test('recovery returns to original detail without any FPS cap and honors a manual cap', () => {
  const g = policy.createGovernor();
  g.sample({ fps: 100, target: 144, duration: 12000 }, 20000, 'ultra', true);
  assert.equal(g.reduction(), 1);
  assert.equal(policy.fpsLimit('vsync', policy.profile('ultra', true, g.reduction()), 144), 0);
  for (let i = 0; i < 5; i++) g.sample({ fps: 144, target: 144, duration: 12000 }, 30000 + i * 12000, 'ultra', true);
  assert.equal(g.reduction(), 1, 'restoring waits at least 60s after lowering');
  g.sample({ fps: 144, target: 144, duration: 12000 }, 92000, 'ultra', true);
  assert.equal(g.reduction(), 0);
  const restored = policy.profile('ultra', true, g.reduction());
  assert.equal(restored.gridSize, 320);
  assert.equal(policy.fpsLimit('vsync', restored, 144), 0);
  assert.equal(policy.fpsLimit('30', restored, 144), 30);
});

test('reduced-motion advice skips animation; closing snoozes without a remembered refusal', () => {
  const c = controller();
  c.window.matchMedia = () => ({ matches: true });
  const banner = c.node('sonic-performance-notice');
  banner.animate = () => { throw new Error('reduced-motion users must not receive entrance animations'); };
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 15, target: 60, duration: 4000, early: true } };
  c.emit(slow);
  assert.equal(banner.hidden, false);
  assert.equal(banner.inert, false);
  c.api.closeNotice();
  assert.equal(banner.hidden, true);
  assert.equal(banner.inert, true);
  assert.equal(c.api.snapshot().preferences.dismissed, false, 'closing only snoozes');
  c.emit(slow);
  assert.equal(c.api.snapshot().recommendation, false, 'snoozed for the rest of this run');
});

test('hardware advice hidden by another settings tab does not consume the one-time prompt', () => {
  const c = controller();
  const panel = c.node('fx-panel');
  panel.classList.contains = name => name === 'peek';
  panel.getAttribute = () => 'motion';
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'ready', gpu: 'Intel Iris Xe Graphics' });
  c.runTicks(6000);
  assert.equal(c.node('sonic-performance-notice').hidden, true);
  assert.equal(c.api.snapshot().preferences.hardwarePrompted, false);
  c.window.fx.preset = 0; c.tick();
  panel.classList.contains = () => false;
  c.window.fx.preset = 8; c.tick(); c.runTicks(6000);
  assert.equal(c.api.snapshot().recommendationReason, 'gpu');
  assert.equal(c.node('sonic-performance-notice').hidden, false);
  assert.equal(c.api.snapshot().preferences.hardwarePrompted, true);
});

test('ordinary scenes on an integrated GPU suggest a lower quality tier once, without changing it unasked', () => {
  const c = controller();
  const applied = [];
  c.window.renderer = { getContext: () => ({ getExtension: () => null, RENDERER: 1, getParameter: () => 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)' }) };
  c.window.setPerformanceQualityMode = q => { applied.push(q); c.window.fx.performanceQuality = q; c.api.qualityChanged(); };
  c.window.fx.preset = 0; c.window.fx.performanceQuality = 'ultra'; c.tick();
  c.focus(false); c.runTicks(6000);
  assert.equal(c.api.snapshot().recommendation, false, 'unfocused time does not count');
  c.focus(true); c.runTicks(4000);
  assert.equal(c.api.snapshot().recommendation, false);
  c.runTicks(2000);
  assert.equal(c.api.snapshot().recommendationReason, 'scene-gpu');
  assert.equal(c.node('sonic-performance-notice').hidden, false);
  assert.equal(c.node('sonic-performance-enable').textContent, '调到中画质');
  assert.equal(c.window.fx.performanceQuality, 'ultra', 'advice alone keeps original quality');
  c.api.accept();
  assert.deepEqual(applied, ['balanced']);
  assert.equal(c.api.snapshot().recommendation, false);
  const again = controller(c.storage);
  again.window.renderer = c.window.renderer;
  again.window.fx.preset = 0; again.window.fx.performanceQuality = 'ultra'; again.tick(); again.runTicks(8000);
  assert.equal(again.api.snapshot().recommendation, false, 'shown once');
});

test('ordinary-scene advice skips discrete GPUs, manual quality choices and keeps Sonic preferences', () => {
  const make = name => {
    const c = controller();
    c.window.renderer = { getContext: () => ({ getExtension: () => null, RENDERER: 1, getParameter: () => name }) };
    c.window.fx.preset = 0; c.window.fx.performanceQuality = 'ultra'; c.tick();
    return c;
  };
  const rtx = make('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)');
  rtx.runTicks(8000);
  assert.equal(rtx.api.snapshot().recommendation, false);
  const manual = make('Intel UHD Graphics 620');
  manual.api.qualityChanged(); manual.runTicks(8000);
  assert.equal(manual.api.snapshot().recommendation, false, 'an explicit tier choice is respected');
  const software = make('Google SwiftShader');
  software.runTicks(6000);
  assert.equal(software.api.snapshot().recommendationReason, 'scene-software');
  assert.equal(software.node('sonic-performance-enable').textContent, '调到低画质');
  software.api.keep();
  assert.equal(software.api.snapshot().recommendation, false);
  assert.equal(software.api.snapshot().preferences.dismissed, false, 'keeping ultra does not refuse Sonic adaptive advice');
  assert.equal(software.window.fx.performanceQuality, 'ultra');
});
