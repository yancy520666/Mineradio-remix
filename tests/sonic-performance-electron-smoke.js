'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function probe() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const until = async (read, label, timeout = 12000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (read()) return; await wait(100); }
    throw new Error(label + ': ' + JSON.stringify({ performance: MineradioSonicPerformance.snapshot(),
      config: MineradioSonicPerformance.config(), windowState: desktopRuntimeState, body: document.body.className }));
  };
  closeVisualGuide(true); markVisualGuideSeen();
  // Automated QA can lose focus to other windows. Only the test's eligibility
  // check is overridden; real frames still come from the real WebGL renderer.
  document.hasFocus = () => true;
  Object.defineProperty(desktopRuntimeState, 'focused', { configurable: true, get: () => true, set() {} });
  setPreset(8);
  const frame = () => document.querySelector('#sonic-workshop-layer iframe')?.contentWindow;
  const snapshot = () => frame()?.__mineradioWorkshopPerformance?.snapshot();
  await until(() => snapshot()?.state === 'ready', 'bundled workshop renderer did not initialize');
  await wait(500);
  const legacy = snapshot();
  check(fx.performanceQuality === 'eco' && fx.foregroundFpsMode === 'vsync' &&
    !MineradioSonicPerformance.snapshot().preferences.enabled && legacy.config.fpsLimit === 0,
    'first-run quality, frame cadence or opt-in defaults changed');
  check(legacy.config.profile === null && legacy.triangles > 1000000, 'legacy geometry changed');
  MineradioSonicPerformance.setEnabled(true);
  setForegroundFpsMode('30', true);
  await wait(1000);
  const eco = snapshot();
  check(eco.config.profile.gridSize === 112, 'opt-in grid was not applied');
  check(eco.triangles < legacy.triangles / 4 && eco.width < legacy.width, 'actual GPU budget did not decrease');
  await until(() => MineradioSonicPerformance.snapshot().sample, 'iframe frame measurement did not arrive', 22000);
  const measured = MineradioSonicPerformance.snapshot().sample;
  // A cap is an upper bound, not a minimum throughput guarantee. CI's software
  // renderer may legitimately miss it; deterministic meter tests check accuracy.
  check(measured.target === 30 && measured.fps > 0 && measured.fps < 35,
    'fixed 30 FPS target or upper bound incorrect: ' + JSON.stringify({ measured, gpu: eco.gpu }));
  check(!MineradioSonicPerformance.snapshot().recommendation, 'intentional frame cap was treated as load');
  // A controlled load report tests the governor-to-renderer connection, while
  // the measurement above uses actual drawing rather than synthetic timing.
  frame().eval("parent.postMessage({type:'mineradio-sonic-performance-sample',sample:{fps:15,target:30,duration:12000}},location.origin)");
  await until(() => snapshot().config.profile.gridSize === 80, 'automatic lowering did not reach the renderer');
  check(fx.performanceQuality === 'eco', 'automatic lowering overwrote the saved quality');
  const gl = frame().document.querySelector('canvas').getContext('webgl2');
  const loss = gl.getExtension('WEBGL_lose_context');
  check(loss, 'context-loss test extension unavailable');
  loss.loseContext();
  await until(() => MineradioSonicPerformance.snapshot().health[8]?.state === 'lost', 'loss event missing');
  loss.restoreContext();
  await until(() => MineradioSonicPerformance.snapshot().health[8]?.state === 'ready', 'restored renderer did not draw');
  await wait(500);
  loss.loseContext();
  await until(() => MineradioSonicPerformance.snapshot().health[8]?.state === 'failed', 'loss timeout missing', 18000);
  check(fx.preset === 8 && !document.getElementById('sonic-performance-retry').hidden, 'failure changed wallpaper or hid retry');
  MineradioSonicPerformance.retry();
  await until(() => snapshot()?.state === 'ready', 'retry did not recreate the renderer');
  MineradioSonicPerformance.setEnabled(false);
  await wait(700);
  const restored = snapshot();
  check(restored.triangles === legacy.triangles && restored.width === legacy.width, 'disable did not restore original geometry and pixels');
  setPerformanceQualityMode('balanced', true);
  await wait(1000);
  check(snapshot().config.profile.gridSize === 160, 'manual quality selection was not applied');

  // Non-rendering script errors must not flash a failure, while an actual
  // drawing exception must show retry even after the first healthy frame.
  frame().dispatchEvent(new (frame().ErrorEvent)('error', { message: 'QA unrelated script error' }));
  check(MineradioSonicPerformance.snapshot().health[8].state === 'ready', 'unrelated error changed render health');
  frame().eval("const qaGl=document.querySelector('canvas').getContext('webgl2');for(const key of ['drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced'])qaGl[key]=function(){throw new Error('QA drawing failure');}");
  await until(() => MineradioSonicPerformance.snapshot().health[8]?.state === 'failed', 'runtime drawing failure was not reported');
  MineradioSonicPerformance.diagnostics();
  check(getComputedStyle(document.getElementById('sonic-performance-diagnostics')).userSelect === 'text', 'diagnostic text cannot be selected');
  MineradioSonicPerformance.retry();
  await until(() => snapshot()?.state === 'ready', 'runtime failure retry did not recreate the renderer');

  setPerformanceQualityMode('eco', true);
  MineradioSonicPerformance.setEnabled(true);
  setPreset(7);
  await until(() => MineradioSonicPerformance.snapshot().health[7]?.state === 'ready', 'normal stage render was not observed');
  await until(() => MineradioSonicPerformance.snapshot().sample, 'stage frame measurement missing', 22000);
  const stage = MineradioSonicPerformance.snapshot().sample;
  check(stage.target === 30 && stage.fps > 0 && stage.fps < 35,
    'stage target or upper bound incorrect: ' + JSON.stringify(stage));
  const stageLoss = renderer.getContext().getExtension('WEBGL_lose_context');
  stageLoss.loseContext();
  await until(() => MineradioSonicPerformance.snapshot().health[7]?.state === 'lost', 'stage loss missing');
  MineradioSonicPerformance.retry();
  await until(() => MineradioSonicPerformance.snapshot().health[7]?.state === 'ready', 'stage did not restore after retry');

  setPerformanceQualityMode('ultra', true);
  fx.sonicGroundFloatingCount = 100;
  await wait(500);
  const floating = [];
  scene.getObjectByName('sonic-topography-root').traverse(object => { if (object.isInstancedMesh) floating.push(object.count); });
  check(floating.includes(100), 'ultra did not preserve the user-selected 100 floating blocks');

  // Fail WebGL creation inside a disposable bundled iframe only. The parent
  // renderer and the real machine's acceleration settings remain untouched.
  setPreset(8);
  await until(() => snapshot()?.state === 'ready', 'workshop did not remount after stage');
  const html = await (await fetch('/vendor/sonic-workshop/mineradio-bridge.html')).text();
  const unavailable = '<base href="' + location.origin + '/vendor/sonic-workshop/">' +
    '<script>const original = HTMLCanvasElement.prototype.getContext;' +
    'HTMLCanvasElement.prototype.getContext = function(kind, ...args) {' +
    'return kind === "webgl2" ? null : original.call(this, kind, ...args);};</script>';
  MineradioSonicPerformance.beginWorkshop();
  document.querySelector('#sonic-workshop-layer iframe').srcdoc = html.replace('<head>', '<head>' + unavailable);
  await until(() => MineradioSonicPerformance.snapshot().health[8]?.state === 'failed', 'initialization failure was not reported', 18000);
  check(fx.preset === 8 && !document.getElementById('sonic-performance-retry').hidden, 'initialization failure hid retry or replaced wallpaper');
  MineradioSonicPerformance.retry();
  await until(() => snapshot()?.state === 'ready', 'initialization retry did not recreate a working renderer');
  return { legacy, eco, measured, restored, stage, selectedPreset: fx.preset };
}

const root = path.resolve(__dirname, '..');
const temporaryRoot = path.resolve(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(temporaryRoot, 'mineradio-sonic-performance-'));
try {
  const page = path.join(fixture, 'probe.js');
  fs.writeFileSync(page, '(' + probe.toString() + ')()');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const run = spawnSync(require('electron'), ['scripts/qa/isolated-electron.js', '--page', page, '--visible', '--timeout', '105000'], {
    cwd: root, env, encoding: 'utf8', timeout: 115000, windowsHide: true,
  });
  const line = run.stdout?.split('\n').find(value => value.startsWith('QA_RESULT '));
  assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
  assert(line, 'isolated player did not return the Sonic result');
  const result = JSON.parse(line.slice('QA_RESULT '.length));
  assert(!result.error, JSON.stringify(result));
  console.log('SONIC_PERFORMANCE:' + JSON.stringify(result));
} finally {
  assert.equal(path.dirname(path.resolve(fixture)), temporaryRoot);
  fs.rmSync(fixture, { recursive: true, force: true });
}
