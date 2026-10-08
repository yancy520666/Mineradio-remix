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
test('sustained load lowers detail while it helps; reports in flight are ignored; recovery is slow and bounded', () => {
  const g = policy.createGovernor();
  const at = (fps, duration = 12000) => ({ fps, target: 60, duration });
  assert.equal(g.sample(at(40), 8000, 'balanced', false), '', 'a switched-off governor never acts');
  assert.equal(g.sample(at(40), 20000, 'balanced', true), 'lower');
  assert.equal(g.sample(at(40), 21000, 'balanced', true), '', 'a report already in flight is not new evidence');
  assert.equal(g.sample(at(45), 27000, 'balanced', true), 'lower', 'lowering helped (+10%) but is not enough yet');
  assert.equal(g.sample(at(50), 62000, 'balanced', true), '', 'better than before, and already at the lowest tier');
  assert.equal(g.reduction(), 2);
  const good = at(60);
  assert.equal(g.sample(good, 74000, 'balanced', true), '');
  assert.equal(g.sample(good, 86000, 'balanced', true), 'restore');
  assert.equal(g.reduction(), 1.75, 'a stable renderer probes just a quarter tier');
  g.reset(); assert.equal(g.reduction(), 0);
});

test('a lowering that does not help is undone and further lowering pauses, doubling while it repeats', () => {
  const g = policy.createGovernor();
  const at = (fps, extra) => ({ fps, target: 60, duration: 12000, ...extra });
  assert.equal(g.sample(at(40), 1000, 'ultra', true), 'lower');
  assert.equal(g.reduction(), 1);
  assert.equal(g.sample(at(41), 14000, 'ultra', true), 'ineffective', 'CPU-bound or contended: detail was not the cause');
  assert.equal(g.reduction(), 0, 'the original detail comes back');
  for (let t = 27000; t < 314000; t += 12000) assert.equal(g.sample(at(40), t, 'ultra', true), '', 'lowering is paused');
  assert.equal(g.sample(at(40), 315000, 'ultra', true), 'lower', 'after 5 minutes it may try again');
  assert.equal(g.sample(at(40), 328000, 'ultra', true), 'ineffective');
  assert.equal(g.sample(at(40), 328000 + 590000, 'ultra', true), '', 'the second pause lasts 10 minutes');
  assert.equal(g.sample(at(40), 328000 + 601000, 'ultra', true), 'lower');
  // Fewer long frames also counts as help, even if average FPS barely moves.
  const j = policy.createGovernor();
  assert.equal(j.sample(at(55, { jank: true, duration: 8000, long: 4 }), 1000, 'ultra', true), 'lower');
  assert.equal(j.sample(at(56, { jank: true, duration: 8000, long: 2 }), 12000, 'ultra', true), 'lower',
    'long frames halved: keep going rather than undo');
  assert.equal(j.reduction(), 2);
  // A good report after lowering simply confirms it.
  const ok = policy.createGovernor();
  ok.sample(at(40), 1000, 'ultra', true);
  assert.equal(ok.sample(at(60), 14000, 'ultra', true), '');
  assert.equal(ok.reduction(), 1);
});

test('failed recovery rolls back just the probe; repeated failures back off up to 10 minutes', () => {
  const g = policy.createGovernor();
  assert.equal(g.sample({ fps: 25, target: 60, duration: 4000, early: true }, 10000, 'ultra', true), 'lower');
  assert.equal(g.reduction(), 2);
  const good = { fps: 60, target: 60, duration: 12000 };
  let now = 10000, action = '';
  while (action !== 'restore') { now += 12000; action = g.sample(good, now, 'ultra', true); }
  assert.equal(g.reduction(), 1.75);
  assert(now - 10000 >= 30000 && now - 10000 < 45000);
  const waits = [];
  for (let attempt = 0; attempt < 7; attempt++) {
    now += 11000;
    assert.equal(g.sample({ fps: 40, target: 60, duration: 8000, sustained: true }, now, 'ultra', true), 'rollback');
    assert.equal(g.reduction(), 2, 'the last stable detail is retained');
    const failedAt = now;
    action = '';
    while (action !== 'restore' && now - failedAt <= 700000) { now += 12000; action = g.sample(good, now, 'ultra', true); }
    assert.equal(action, 'restore');
    assert.equal(g.reduction(), 1.875, 'the next probe is only an eighth tier');
    waits.push(now - failedAt);
  }
  // Consecutive failures double the wait: about 1, 2, 4, 8 minutes, then 10 at most.
  for (let i = 0; i < 4; i++) assert(waits[i] >= 60000 * 2 ** i && waits[i] < 60000 * 2 ** i + 24000, JSON.stringify(waits));
  assert(waits.slice(4).every(w => w >= 600000 && w < 624000), 'the wait is capped at 10 minutes');
  // One successful probe returns to the normal 30s rhythm and quarter-tier steps.
  action = '';
  const settledAt = now;
  while (action !== 'restore') { now += 12000; action = g.sample(good, now, 'ultra', true); }
  assert(now - settledAt < 60000, 'success resets the backoff');
  assert.equal(g.reduction(), 1.625, 'success restores the quarter-tier step');
  g.reset();
  g.sample({ fps: 25, target: 60, duration: 4000, early: true }, 10000, 'ultra', true);
  now = 10000; action = '';
  while (action !== 'restore') { now += 12000; action = g.sample(good, now, 'ultra', true); }
  assert.equal(g.reduction(), 1.75, 'a reset returns to the normal probe size');
});

test('following the screen never trades detail for refresh above 60 FPS; a fixed cap is the goal', () => {
  const floor = policy.smoothnessFloor('vsync');
  assert.equal(floor, 60);
  assert.equal(policy.smoothnessFloor('120'), 0);
  assert.equal(policy.loadTarget(240, 60), 60);
  assert.equal(policy.loadTarget(50, 60), 50, 'a slower screen is its own goal');
  assert.equal(policy.loadTarget(120, 0), 120);
  const g = policy.createGovernor();
  const at = fps => ({ fps, target: 144, duration: 12000 });
  assert.equal(g.sample(at(80), 1000, 'ultra', true, floor), '', '80 FPS on 144 Hz keeps original detail');
  assert.equal(g.reduction(), 0);
  assert.equal(g.sample(at(45), 20000, 'ultra', true, floor), 'lower', 'under 80% of 60 FPS detail drops');
  const fixed = policy.createGovernor();
  assert.equal(fixed.sample({ fps: 80, target: 120, duration: 12000 }, 1000, 'ultra', true, 0), 'lower',
    'an explicit 120 FPS cap is the goal');
  const thirty = policy.createGovernor();
  assert.equal(thirty.sample({ fps: 29, target: 30, duration: 12000 }, 1000, 'ultra', true, 0), '',
    'a 30 FPS cap that is met is not frame loss');
});

test('repeated long frames count as stutter even when average FPS looks fine', () => {
  const m = policy.createMeter(); let now = 100, sample = null, n = 0;
  // About 70 FPS on a 144 Hz screen, but every 20th frame takes 60 ms.
  while (!sample && now < 20000) { n++; now += n % 20 === 0 ? 60 : 1000 / 75; sample = m.frame(now, 144, true, 60); }
  assert(sample && sample.jank === true, JSON.stringify(sample));
  assert(sample.fps > 60 && now < 13000, 'reported in about 11s without an FPS drop');
  assert(sample.long >= 2);
  assert.equal(policy.createGovernor().sample(sample, now, 'ultra', true, 60), 'lower');
  // One long frame per second is not "repeated" stutter; nor is a single hitch.
  const calm = policy.createMeter(); now = 100; n = 0; const reports = [];
  while (now < 30000) { n++; now += n % 75 === 0 ? 60 : 1000 / 75; const r = calm.frame(now, 144, true, 60); if (r) reports.push(r); }
  assert(reports.every(r => !r.jank && !r.early && !r.sustained), JSON.stringify(reports));
  assert(reports.length >= 2 && reports.every(r => r.long > 0 && r.long < 1.5));
  assert.equal(policy.validSample({ fps: 70, target: 144, lossTarget: 60, duration: 7599, jank: true }), false);
  assert.equal(policy.validSample({ fps: 70, target: 144, lossTarget: 60, duration: 8000, jank: true }), true);
});

function controller(storage = new Map(), bridge) {
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
    desktopWindow: bridge,
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
test('adaptive quality is on by default; switching it off is remembered and restores the saved visual', () => {
  const c = controller();
  assert.equal(c.api.snapshot().preferences.enabled, true);
  assert.equal(c.api.profile().gridSize, 112, 'eco ceiling without any load');
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 15, target: 60, duration: 12000 } };
  c.emit(slow, {}); assert.equal(c.api.profile().gridSize, 112, 'reject old/foreign iframe');
  c.focus(false); c.emit(slow); assert.equal(c.api.profile().gridSize, 112, 'unfocused reports do not count');
  c.focus(true); c.emit(slow);
  assert.equal(c.api.profile().gridSize, 80);
  assert.equal(c.window.fx.performanceQuality, 'eco', 'the saved quality is never written');
  c.api.setEnabled(false);
  assert.equal(c.api.profile(), null);
  const reopened = controller(c.storage);
  assert.equal(reopened.api.snapshot().preferences.enabled, false, 'switching off survives restart');
  reopened.emit(slow); assert.equal(reopened.api.profile(), null);
  reopened.api.qualityChanged(); assert.equal(reopened.api.profile().gridSize, 112);
  assert.equal(reopened.api.stageProfile(), null, 'quality choice alone leaves the topography stage unchanged');
  assert.equal(controller(c.storage).api.profile().gridSize, 112, 'manual-quality intent survives restart');
  reopened.api.setEnabled(true);
  assert.equal(controller(c.storage).api.snapshot().preferences.enabled, true);
});

test('older saved preferences: untouched users are switched on, an earlier refusal stays off', () => {
  const stored = value => new Map([['mineradio-sonic-performance-v1', JSON.stringify(value)]]);
  assert.equal(controller(stored({ enabled: false, dismissed: false, hardwarePrompted: true })).api.snapshot().preferences.enabled, true);
  assert.equal(controller(stored({ enabled: false, dismissed: true })).api.snapshot().preferences.enabled, false,
    '"keep current" on the 2.4.1 advice or a manual switch-off is respected');
  assert.equal(controller(stored({ enabled: true })).api.snapshot().preferences.enabled, true);
});
test('Sonic shows no opt-in advice; the first automatic lowering says where to switch it off', () => {
  const c = controller();
  c.emit({ type: 'mineradio-sonic-performance-health', state: 'ready', gpu: 'Intel Iris Xe Graphics' });
  c.runTicks(8000);
  assert.equal(c.api.snapshot().recommendation, false, 'no integrated-GPU card: adaptation is already on');
  const slow = fps => c.emit({ type: 'mineradio-sonic-performance-sample', sample: { fps, target: 60, duration: 12000 } });
  c.window.fx.performanceQuality = 'ultra'; c.api.refresh();
  slow(40);
  assert.match(c.node('sonic-performance-message').textContent, /关闭自适应/);
  assert.equal(c.node('sonic-performance-notice').hidden, false);
  c.advance(13000); slow(45);
  assert.doesNotMatch(c.node('sonic-performance-message').textContent, /关闭自适应/, 'the hint is shown once per run');
  c.advance(13000); slow(45);
  assert.match(c.node('sonic-performance-message').textContent, /没有让画面更流畅/);
  assert.equal(c.node('sonic-performance-enable').hidden, true, 'no action buttons on Sonic notices');
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
  assert.equal(policy.createGovernor().sample(samples[0], 7200, 'ultra', true), 'lower');
  const c = controller();
  c.emit({ type: 'mineradio-sonic-performance-sample', sample: samples[0] });
  assert.equal(c.api.profile().gridSize, 80);
});

test('borderline loss keeps long-window confirmation; brief freezes and alternating load do not trigger fast advice', () => {
  const borderline = runFrames(policy.createMeter(), 100, 12, 42, 60)[0];
  assert(!borderline.early);
  assert(borderline.duration >= 8000 && borderline.duration < 8200, 'about 11s including warmup');
  const g = policy.createGovernor();
  assert.equal(borderline.sustained, true);
  assert.equal(g.sample(borderline, 18000, 'ultra', true), 'lower');
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

test('guides, background interruptions and target changes keep reports from counting', () => {
  const c = controller();
  const slow = { type: 'mineradio-sonic-performance-sample', sample: { fps: 42, target: 60, duration: 12000 } };
  c.flags.add('visual-guide-active'); c.tick(); c.emit(slow);
  assert.equal(c.api.profile().gridSize, 112, 'a guide is on screen');
  c.flags.clear(); c.hide(true); c.tick(); c.emit(slow);
  assert.equal(c.api.profile().gridSize, 112, 'hidden window');
  c.hide(false); c.window.fx.foregroundFpsMode = '30'; c.tick();
  c.emit(slow);
  assert.equal(c.api.profile().gridSize, 112, 'a report for the old 60 FPS target');
  c.emit({ ...slow, sample: { fps: 20, target: 30, duration: 12000 } });
  assert.equal(c.api.profile().gridSize, 80, 'the new 30 FPS goal counts');
});

test('recovery returns to original detail without any FPS cap and honors a manual cap', () => {
  const g = policy.createGovernor();
  g.sample({ fps: 100, target: 144, duration: 12000 }, 20000, 'ultra', true);
  assert.equal(g.reduction(), 1);
  assert.equal(policy.fpsLimit('vsync', policy.profile('ultra', true, g.reduction()), 144), 0);
  let now = 20000;
  while (g.reduction() > 0 && now < 200000) {
    const before = g.reduction(); now += 12000;
    g.sample({ fps: 144, target: 144, duration: 12000 }, now, 'ultra', true);
    assert(before - g.reduction() <= 0.25, 'recovery never jumps a full tier');
  }
  assert.equal(g.reduction(), 0);
  const restored = policy.profile('ultra', true, g.reduction());
  assert.equal(restored.gridSize, 320);
  assert.equal(policy.fpsLimit('vsync', restored, 144), 0);
  assert.equal(policy.fpsLimit('30', restored, 144), 30);
});

test('fractional recovery smoothly increases actual 4K resolution and geometry without exceeding saved quality', () => {
  let previousDpr = 0, previousGrid = 0;
  for (let reduction = 1; reduction >= 0; reduction -= 0.125) {
    const p = policy.profile('ultra', true, reduction);
    const dpr = policy.pixelRatio(p, 3840, 2160, 2);
    assert(dpr >= previousDpr && p.gridSize >= previousGrid);
    if (previousDpr) assert(dpr - previousDpr < 0.2, 'each resolution probe stays small even at the no-budget endpoint');
    assert(Number.isInteger(p.gridSize) && Number.isInteger(p.floatingCount));
    previousDpr = dpr; previousGrid = p.gridSize;
  }
  assert.equal(previousDpr, 2); assert.equal(previousGrid, 320);
  assert(policy.profile('balanced', true, 0.25).gridSize < policy.profile('balanced', true, 0).gridSize);
});

test('a one-second hitch on a 144Hz screen cannot borrow severe evidence from the wrong threshold', () => {
  const m = policy.createMeter(), on = policy.createGovernor();
  let now = 100, fast = 0;
  while (now < 18000) {
    now += now >= 6000 && now < 7000 ? 200 : 1000 / 60;
    const sample = m.frame(now, 144, true, 60);
    if (!sample) continue;
    if (sample.early || sample.sustained) fast++;
    assert.equal(sample.lossTarget, 60); assert.equal(sample.target, 144);
    assert.equal(on.sample(sample, now, 'ultra', true, 60), '');
  }
  assert.equal(fast, 0); assert.equal(on.reduction(), 0, '60 FPS on a 144 Hz screen keeps original detail');
  const old = { fps: 46.5, target: 144, duration: 4067, early: true };
  assert.equal(on.sample(old, now, 'ultra', true, 60), '', 'stale flags from 144Hz are rejected');
});

test('high-refresh floor still detects actual sustained low FPS quickly', () => {
  const m = policy.createMeter(), g = policy.createGovernor(); let now = 100, sample;
  while (!sample && now < 10000) { now += 1000 / 15; sample = m.frame(now, 144, true, 60); }
  assert(sample.early); assert(now < 8000);
  assert.equal(g.sample(sample, now, 'ultra', true, 60), 'lower');
  assert.equal(policy.validSample({ ...sample, lossTarget: 145 }), false);
});

test('changing FPS after a failed probe discards recovery history without a visual jump', () => {
    const c = controller();
    const emit = (fps, target = 60, duration = 12000, sustained = false) => c.emit({
      type: 'mineradio-sonic-performance-sample', sample: { fps, target, duration, sustained }
    });
    c.window.fx.performanceQuality = 'ultra'; c.api.setEnabled(true);
    emit(40); for (let i = 0; i < 3; i++) { c.advance(12000); emit(60); }
    assert.equal(c.api.profile().tier, 3.25);
    c.advance(11000); emit(40, 60, 8000, true);
    assert.equal(c.api.profile().tier, 3);
    c.window.fx.foregroundFpsMode = '30'; c.tick();
    assert.equal(c.api.profile().tier, 3, 'changing target preserves current detail');
    for (let i = 0; i < 3; i++) { c.advance(12000); emit(30, 30); }
    assert.equal(c.api.profile().tier, 3.25, 'new target uses the normal quarter step, without the old wait');
    assert.equal(c.window.fx.performanceQuality, 'ultra');
});

test('the topography stage uses the same recovery and target-reset path without iframe reports', () => {
  const c = controller();
  c.window.renderer = { getContext: () => ({ getExtension: () => null, getParameter: () => 'Intel Graphics', isContextLost: () => false }),
    domElement: { addEventListener() {} } };
  c.window.fx.preset = 7; c.window.fx.performanceQuality = 'ultra'; c.tick(); c.api.setEnabled(true);
  const draw = (fps, seconds) => { for (let i = 0; i < fps * seconds; i++) { c.advance(1000 / fps); c.api.stageFrame(); } };
  draw(40, 17); assert.equal(c.api.stageProfile().tier, 3);
  draw(60, 41); assert.equal(c.api.stageProfile().tier, 3.25);
  draw(40, 15); assert.equal(c.api.stageProfile().tier, 3);
  c.window.fx.foregroundFpsMode = '30'; c.tick();
  assert.equal(c.api.stageProfile().tier, 3);
  draw(30, 41); assert.equal(c.api.stageProfile().tier, 3.25);
});

test('background gaps and repeated copies of a sample cannot fabricate stable recovery time', () => {
  const g = policy.createGovernor(), good = { fps: 60, target: 60, duration: 12000 };
  g.sample({ fps: 40, target: 60, duration: 12000 }, 1000, 'ultra', true);
  for (let i = 0; i < 10; i++) assert.equal(g.sample(good, 1100 + i, 'ultra', true), '');
  g.clearEvidence();
  assert.equal(g.sample(good, 100000, 'ultra', true), '', 'hidden wall time is not stable evidence');
  assert.equal(g.sample(good, 112000, 'ultra', true), 'restore');
  assert.equal(g.reduction(), 0.75);
});

test('reduced-motion notices skip animation; closing only hides the card', () => {
  const c = controller();
  c.window.matchMedia = () => ({ matches: true });
  const banner = c.node('sonic-performance-notice');
  banner.animate = () => { throw new Error('reduced-motion users must not receive entrance animations'); };
  c.emit({ type: 'mineradio-sonic-performance-sample', sample: { fps: 15, target: 60, duration: 4000, early: true } });
  assert.equal(banner.hidden, false);
  assert.equal(banner.inert, false);
  c.api.closeNotice();
  assert.equal(banner.hidden, true);
  assert.equal(banner.inert, true);
  assert.equal(c.api.snapshot().preferences.enabled, true, 'closing a notice does not switch adaptation off');
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
  assert.equal(software.api.snapshot().preferences.enabled, true, 'keeping ultra does not switch Sonic adaptation off');
  assert.equal(software.window.fx.performanceQuality, 'ultra');
});

test('the FPS goal follows the display rate reported by Electron, not the main loop estimate', () => {
  const c = controller();
  c.window.estimatedDisplayRefreshHz = () => 48;
  assert.equal(c.api.config().target, 60, 'without a reported rate the snapped estimate is used');
  c.window.desktopRuntimeState = { displayHz: 144, focused: true, visible: true };
  assert.equal(c.api.config().target, 144);
  c.window.estimatedDisplayRefreshHz = () => 238;
  assert.equal(c.api.config().target, 144, 'estimate swings cannot move the goal');
  c.window.desktopRuntimeState.displayHz = 100;
  assert.equal(c.api.config().target, 100, 'uncommon rates are used as reported');
  c.window.fx.foregroundFpsMode = '60';
  assert.equal(c.api.config().target, 60);
});

test('a saved non-ultra tier that the user never picked is reset to ultra once, through the normal save path', () => {
  const stored = value => new Map([['mineradio-sonic-performance-v1', JSON.stringify(value)]]);
  const run = (prefs, quality) => {
    const c = controller(prefs);
    const applied = [];
    c.window.fx.performanceQuality = quality;
    c.window.setPerformanceQualityMode = (q, silent) => { applied.push([q, silent]); c.window.fx.performanceQuality = q; c.api.qualityChanged(); };
    c.tick();
    return { c, applied, prefs: c.api.snapshot().preferences };
  };
  const auto = run(stored({ enabled: false, dismissed: false }), 'balanced');
  assert.deepEqual(auto.applied, [['ultra', true]], '2.4.1 GPU pick or 2.4.0 default');
  assert.equal(auto.c.window.fx.performanceQuality, 'ultra');
  assert.equal(auto.prefs.manualQuality, false, 'not recorded as a manual choice');
  assert.equal(auto.prefs.qualityReset, true);
  const again = run(auto.c.storage, 'balanced');
  assert.deepEqual(again.applied, [], 'only once: a later choice of medium is kept');
  const manual = run(stored({ manualQuality: true }), 'high');
  assert.deepEqual(manual.applied, [], 'a tier the user picked is kept');
  assert.equal(manual.c.window.fx.performanceQuality, 'high');
  const fresh = run(new Map(), 'ultra');
  assert.deepEqual(fresh.applied, []);
  assert.equal(fresh.prefs.qualityReset, true);
});

test('a reset attempted before later scripts are ready retries without being mistaken for a manual choice', () => {
  const c = controller(new Map([['mineradio-sonic-performance-v1', JSON.stringify({ dismissed: false })]]));
  c.window.fx.performanceQuality = 'eco';
  let ready = false;
  c.window.setPerformanceQualityMode = q => {
    c.window.fx.performanceQuality = q; c.api.qualityChanged();
    if (!ready) throw new Error('saveLyricLayout dependencies not loaded yet');
  };
  c.tick();
  assert.equal(c.api.snapshot().preferences.qualityReset, false);
  assert.equal(c.api.snapshot().preferences.manualQuality, false);
  ready = true; c.tick();
  assert.equal(c.window.fx.performanceQuality, 'ultra');
  assert.equal(c.api.snapshot().preferences.qualityReset, true, 'the retry still saves the reset');
  assert.equal(c.api.snapshot().preferences.manualQuality, false);
});

test('a high-refresh screen keeps original detail at any FPS above the 60 FPS goal, however fast it ran before', () => {
  const c = controller();
  c.window.fx.performanceQuality = 'ultra';
  c.window.desktopRuntimeState = { displayHz: 240, focused: true, visible: true };
  c.tick();
  function emit(fps, lossTarget, extra) {
    c.advance(12000);
    c.emit({ type: 'mineradio-sonic-performance-sample', sample: {
      fps, target: 240, lossTarget, duration: 12000, long: 0, ...extra
    } });
  }
  emit(120, 60); emit(120, 60); emit(120, 60);
  assert.equal(c.api.config().lossTarget, 60, 'a fast start is not learned as the goal');
  emit(80, 60);
  assert.equal(c.api.profile().tier, 4, '120 -> 80 FPS without stutter keeps original detail');
  emit(70, 120, { duration: 8000, sustained: true });
  assert.equal(c.api.profile().tier, 4, 'a report counted against another threshold is rejected');
  emit(40, 60);
  assert.equal(c.api.profile().tier, 3, 'falling under the 60 FPS goal still lowers detail');
});

test('ineffective backoff is limited to the old load and does not block severe loss or new jank', () => {
  const at = (fps, extra) => ({ fps, target: 60, lossTarget: 60, duration: 12000, long: 0, ...extra });
  function paused() {
    const g = policy.createGovernor();
    assert.equal(g.sample(at(40), 1000, 'ultra', true, 60), 'lower');
    assert.equal(g.sample(at(41), 14000, 'ultra', true, 60), 'ineffective');
    assert.equal(g.sample(at(40), 27000, 'ultra', true, 60), '', 'unchanged load still backs off');
    return g;
  }
  const severe = paused();
  assert.equal(severe.sample(at(15, { duration: 4000, early: true }), 34000, 'ultra', true, 60), 'lower');
  assert.equal(severe.reduction(), 2);
  const crossing = paused();
  assert.equal(crossing.sample(at(35, { duration: 4000, early: true }), 34000, 'ultra', true, 60), 'lower',
    'crossing into severe loss ends an old moderate-load pause');
  const jank = paused();
  assert.equal(jank.sample(at(40, { duration: 8000, jank: true, long: 2 }), 38000, 'ultra', true, 60), 'lower');
});

test('desktop choices override another origin mirror and retain a manual tier and explicit disable', () => {
  let disk = null;
  const bridge = {
    readSonicPreferencesSync: () => ({ ok: true, payload: disk }),
    saveSonicPreferencesSync: value => { disk = JSON.parse(JSON.stringify(value)); return { ok: true }; }
  };
  const old = controller(new Map(), bridge);
  old.api.qualityChanged(); old.api.setEnabled(false);
  const reopened = controller(new Map([['mineradio-sonic-performance-v1', '{"enabled":true}']]), bridge);
  const applied = [];
  reopened.window.setPerformanceQualityMode = q => applied.push(q);
  reopened.tick();
  assert.deepEqual(applied, []);
  assert.equal(reopened.api.snapshot().preferences.enabled, false);
  assert.equal(reopened.api.snapshot().preferences.manualQuality, true);
  assert.equal(disk.qualityReset, true);
  const corruptMirror = controller(new Map([['mineradio-sonic-performance-v1', '{broken']]), bridge);
  assert.equal(corruptMirror.api.snapshot().preferences.enabled, false, 'bad browser storage must not prevent the durable read');
});

test('already-reset legacy choices migrate without user interaction, retry failures and survive an empty origin', () => {
  let disk = null, writable = false;
  const bridge = {
    readSonicPreferencesSync: () => ({ ok: true, payload: disk }),
    saveSonicPreferencesSync: value => {
      if (!writable) return { ok: false };
      disk = JSON.parse(JSON.stringify(value)); return { ok: true };
    }
  };
  const prefs = { qualityReset: true, manualQuality: true, dismissed: true, enabled: false };
  const c = controller(new Map([['mineradio-sonic-performance-v1', JSON.stringify(prefs)]]), bridge);
  assert.equal(disk, null);
  writable = true; c.tick();
  const reopened = controller(new Map(), bridge);
  const applied = [];
  reopened.window.setPerformanceQualityMode = q => applied.push(q); reopened.tick();
  assert.deepEqual(applied, []);
  for (const key of Object.keys(prefs)) assert.equal(reopened.api.snapshot().preferences[key], prefs[key]);
});

test('a reset is not completed until both the ultra tier and the desktop marker are durable', () => {
  let diskQuality = 'balanced', writable = false;
  const bridge = {
    readSonicPreferencesSync: () => ({ ok: true, payload: null }),
    readCurrentFxAutosaveSync: () => ({ ok: true, payload: { performanceQuality: diskQuality } }),
    saveSonicPreferencesSync: () => ({ ok: writable })
  };
  const c = controller(new Map(), bridge);
  c.window.fx.performanceQuality = 'balanced';
  c.window.setPerformanceQualityMode = q => { c.window.fx.performanceQuality = q; c.api.qualityChanged(); };
  c.tick();
  assert.equal(c.api.snapshot().preferences.qualityReset, false, 'the old disk copy is still present');
  assert.equal(c.api.snapshot().preferences.manualQuality, false);
  diskQuality = 'ultra'; c.tick();
  assert.equal(c.api.snapshot().preferences.qualityReset, false, 'failed marker writes must be retried');
  writable = true; c.tick();
  assert.equal(c.api.snapshot().preferences.qualityReset, true);
});

test('a marker retry does not rebuild visuals or override a real choice made during migration', () => {
  const bridge = {
    readSonicPreferencesSync: () => ({ ok: true, payload: null }),
    saveSonicPreferencesSync: () => ({ ok: false })
  };
  const c = controller(new Map(), bridge);
  let calls = 0;
  c.window.setPerformanceQualityMode = q => { calls++; c.window.fx.performanceQuality = q; c.api.qualityChanged(); };
  c.tick(); c.tick(); c.tick();
  assert.equal(calls, 1, 'only the marker write needs retrying');
  c.window.fx.performanceQuality = 'balanced'; c.api.qualityChanged(); c.tick();
  assert.equal(calls, 1);
  assert.equal(c.api.snapshot().preferences.manualQuality, true);
  assert.equal(c.window.fx.performanceQuality, 'balanced');
});


test('paused Sonic uses 60 FPS or a lower saved cap without suspending its canvas', () => {
  const c = controller();
  c.window.playing = false; c.window.audio = { paused: true };
  c.window.desktopRuntimeState = { displayHz: 144 };
  assert.equal(c.api.config().fpsLimit, 60);
  assert.equal(c.api.config().target, 60);
  assert.equal(c.api.config().paused, false, 'only deep background suspends drawing');
  c.window.fx.foregroundFpsMode = '45';
  assert.equal(c.api.config().fpsLimit, 45);
  c.window.fx.foregroundFpsMode = '120';
  assert.equal(c.api.config().fpsLimit, 60);
  c.window.playing = true; c.window.audio.paused = false;
  assert.equal(c.api.config().fpsLimit, 120);
});
