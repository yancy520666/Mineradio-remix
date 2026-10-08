'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function probe() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const until = async (read, label) => {
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      if (visualGuideActive) { closeVisualGuide(true); markVisualGuideSeen(); }
      if (read()) return;
      await wait(100);
    }
    throw new Error(label + ' ' + JSON.stringify({ performance: MineradioSonicPerformance.snapshot(),
      config: MineradioSonicPerformance.config(), body: document.body.className }));
  };
  closeVisualGuide(true); markVisualGuideSeen();
  document.hasFocus = () => true;
  Object.defineProperty(desktopRuntimeState, 'focused', { configurable: true, get: () => true, set() {} });
  check(fx.performanceQuality === 'ultra' && fx.foregroundFpsMode === 'vsync', 'fresh profile lost original defaults');
  check(MineradioSonicPerformance.snapshot().preferences.enabled, 'adaptive quality must be on by default');
  check(renderer.getPixelRatio() === Math.min(devicePixelRatio, 2), 'main renderer still compresses original resolution');
  const initialDpr = renderer.getPixelRatio();
  // Ordinary scenes: an integrated/software renderer gets a one-time tier suggestion.
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const sceneClass = classifyRendererGpu(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  if (['integrated', 'software'].includes(sceneClass)) {
    await until(() => /^scene-/.test(MineradioSonicPerformance.snapshot().recommendationReason), 'scene GPU advice was missing');
    check(fx.performanceQuality === 'ultra', 'scene advice changed quality on its own');
    document.getElementById('sonic-performance-keep').click();
    check(fx.performanceQuality === 'ultra' && MineradioSonicPerformance.snapshot().preferences.enabled,
      'keeping ultra changed quality or switched Sonic adaptation off');
  }
  setPreset(8);
  const frame = () => document.querySelector('#sonic-workshop-layer iframe').contentWindow;
  const workshop = () => frame().__mineradioWorkshopPerformance?.snapshot();
  await until(() => workshop()?.state === 'ready', 'workshop did not initialize');
  const original = workshop();
  // Nothing plays yet, and a paused scene caps the wallpaper at 60 FPS.
  const pausedCap = playing && audio && !audio.paused ? 0 : 60;
  check(original.triangles > 1000000 && original.config.fpsLimit === pausedCap && original.config.profile?.tier === 4,
    'default adaptation reduced the original wallpaper without load');
  const hardwareReason = MineradioSonicPerformance.snapshot().recommendationReason;
  check(!hardwareReason, 'Sonic must not show opt-in advice while adaptation is already on');
  // From here on only controlled reports reach the governor: a healthy real
  // window (fast GPUs) would otherwise be judged alongside synthetic load.
  // Capture listeners on the target run before the controller's own listener.
  window.addEventListener('message', event => {
    const data = event.data || {};
    if (data.type === 'mineradio-sonic-performance-sample' && !data.qaControlled) event.stopImmediatePropagation();
  }, true);
  const emit = sample => frame().eval('parent.postMessage(' + JSON.stringify({
    type: 'mineradio-sonic-performance-sample', sample, qaControlled: true
  }) + ',location.origin)');
  // The controller ignores reports while the window is still settling (not
  // yet visible/focused); inject only once it would accept a real one.
  await until(() => MineradioSonicPerformance.config().eligible, 'controller never became eligible');
  await wait(300);
  // Synthetic reports carry the goal the real meter would use: 60 FPS while
  // following the screen, whatever the (variable) display rate is.
  const target = MineradioSonicPerformance.config().target;
  const goal = MineradioSonicPerformance.config().lossTarget;
  check(goal === Math.min(target, 60), 'following the screen must judge against 60 FPS');
  emit({ fps: goal / 4, target, lossTarget: goal, duration: 4000, early: true });
  // The config arrives before the next WebGL frame rebuilds its mesh. Wait
  // for both so a slow/software GPU cannot expose the old geometry here.
  await until(() => workshop()?.config.profile?.tier === 2 && workshop()?.triangles < original.triangles,
    'very slow frames did not drop two tiers in the real renderer');
  const lowered = workshop();
  check(lowered.triangles < original.triangles && fx.performanceQuality === 'ultra', 'lowering did not reduce geometry or overwrote saved quality');
  const notice = document.getElementById('sonic-performance-notice');
  await until(() => !notice.hidden, 'automatic lowering notice did not appear');
  await wait(300);
  check(!notice.inert && notice.getAttribute('aria-hidden') === 'false', 'visible notice is inaccessible');
  check(/关闭自适应/.test(document.getElementById('sonic-performance-message').textContent), 'first lowering does not say where to switch off');
  check(document.getElementById('sonic-performance-enable').hidden, 'Sonic notices must not offer opt-in buttons');
  check(isPointerOverUi({ clientX: notice.getBoundingClientRect().x + 20,
    clientY: notice.getBoundingClientRect().y + 20 }), 'notice clicks leak into scene gestures');
  document.getElementById('sonic-performance-close').focus();
  document.getElementById('sonic-performance-close').click();
  check(notice.inert && notice.getAttribute('aria-hidden') === 'true', 'exiting notice still receives keyboard input');
  await until(() => notice.hidden, 'notice exit animation did not finish');
  check(MineradioSonicPerformance.snapshot().preferences.enabled, 'closing a notice switched adaptation off');
  applyDiyMode(true, { save: false });
  toggleFxPanel(true);
  setFxPanelTab('system');
  const group = document.querySelector('[data-fx-console-group="performance"]');
  group.classList.add('open');
  group.querySelector('button').setAttribute('aria-expanded', 'true');
  // Advance only the controller's clock. Frames, geometry and DPR still come
  // from real WebGL; these reports exercise recovery without waiting minutes.
  const nativeNow = performance.now.bind(performance);
  let controlledNow = nativeNow(), partial;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => controlledNow });
  try {
    for (let i = 0; i < 3; i++) {
      controlledNow += 12000;
      emit({ fps: target, target, lossTarget: goal, duration: 12000 });
      await wait(100);
    }
    await until(() => workshop()?.config.profile?.tier === 2.25 && workshop()?.triangles > lowered.triangles,
      'small recovery probe did not reach real geometry');
    partial = workshop();
    check(partial.triangles > lowered.triangles && partial.triangles < original.triangles, 'recovery jumped to original detail');
    controlledNow += 11000;
    emit({ fps: goal * 2 / 3, target, lossTarget: goal, duration: 8000, sustained: true });
    await until(() => workshop()?.config.profile?.tier === 2 && workshop()?.triangles === lowered.triangles,
      'failed probe did not roll back just its small step');
    // A lowering that changes nothing (CPU-bound or another program on the
    // GPU) is undone in the real renderer instead of sinking to minimum.
    controlledNow += 11000;
    emit({ fps: goal * 2 / 3, target, lossTarget: goal, duration: 8000, sustained: true });
    await until(() => workshop()?.config.profile?.tier === 1 && workshop()?.triangles < lowered.triangles,
      'sustained loss did not lower one more tier');
    controlledNow += 11000;
    emit({ fps: goal * 2 / 3, target, lossTarget: goal, duration: 8000, sustained: true });
    await until(() => workshop()?.config.profile?.tier === 2 && workshop()?.triangles === lowered.triangles,
      'an ineffective lowering was not undone');
    check(/没有让画面更流畅/.test(document.getElementById('sonic-performance-message').textContent),
      'undoing an ineffective lowering is not explained');
  } finally { Object.defineProperty(performance, 'now', { configurable: true, value: nativeNow }); }
  document.getElementById('sonic-performance-toggle').click();
  await until(() => workshop()?.config.profile === null && workshop().triangles === original.triangles,
    'switching off did not restore original detail');
  check(JSON.parse(localStorage.getItem('mineradio-sonic-performance-v1')).dismissed, 'switching off was not remembered');
  // Finish on adaptive feedback for optional screenshots of both window sizes.
  MineradioSonicPerformance.setEnabled(true);
  emit({ fps: goal / 4, target, lossTarget: goal, duration: 4000, early: true });
  await until(() => !notice.hidden, 'adaptive feedback did not appear');
  if (innerWidth < 1000) {
    // Keep this QA panel open even if the human moves the system pointer away.
    document.getElementById('fx-panel').classList.add('show');
    document.getElementById('sonic-performance-controls').scrollIntoView({ block: 'center' });
  } else {
    toggleFxPanel(false);
  }
  await wait(500);
  const rect = notice.getBoundingClientRect();
  check(rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, 'notice clips at this window size');
  check(notice.scrollWidth <= notice.clientWidth + 1, 'notice has horizontal overflow');
  const toggle = document.getElementById('sonic-performance-toggle');
  const buttonRect = toggle.getBoundingClientRect();
  const styles = getComputedStyle(notice);
  if (innerWidth < 1000) {
    check(notice.parentElement.id === 'sonic-performance-controls', 'settings advice must be inline');
    check(rect.y >= buttonRect.bottom, 'notice covers the settings controls');
    check(styles.position === 'static', 'inline advice still floats over controls');
  }
  return { viewport: [innerWidth, innerHeight], gpu: original.gpu, hardwareReason,
    initialDpr, originalTriangles: original.triangles, loweredTriangles: lowered.triangles, partialTriangles: partial.triangles,
    notice: { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      radius: styles.borderRadius, background: styles.backgroundColor }, status: toggle.getAttribute('aria-pressed') };
}

const tempRoot = path.resolve(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(tempRoot, 'mineradio-adaptive-ui-'));
const shotIndex = process.argv.indexOf('--shots');
const shots = shotIndex >= 0 ? path.resolve(process.argv[shotIndex + 1]) : '';
if (shots) fs.mkdirSync(shots, { recursive: true });
try {
  const page = path.join(fixture, 'probe.js');
  fs.writeFileSync(page, '(' + probe.toString() + ')()');
  const results = [];
  for (const size of ['1280x820', '800x600']) {
    const args = ['scripts/qa/isolated-electron.js', '--page', page, '--size', size, '--visible', '--timeout', '40000'];
    if (shots) args.push('--shot', path.join(shots, 'adaptive-' + size + '.png'));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(require('electron'), args, { cwd: path.resolve(__dirname, '..'), env,
      encoding: 'utf8', timeout: 50000, windowsHide: true });
    assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
    const line = run.stdout?.split('\n').find(value => value.startsWith('QA_RESULT '));
    assert(line, 'UI result missing');
    const result = JSON.parse(line.slice('QA_RESULT '.length));
    assert(!result.error, JSON.stringify(result));
    results.push(result);
  }
  console.log('ADAPTIVE_QUALITY_UI:' + JSON.stringify(results));
} finally {
  assert.equal(path.dirname(path.resolve(fixture)), tempRoot);
  fs.rmSync(fixture, { recursive: true, force: true });
}
