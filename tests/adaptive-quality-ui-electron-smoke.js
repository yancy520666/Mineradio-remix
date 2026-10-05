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
    while (Date.now() < end) { if (read()) return; await wait(100); }
    throw new Error(label);
  };
  closeVisualGuide(true);
  document.hasFocus = () => true;
  Object.defineProperty(desktopRuntimeState, 'focused', { configurable: true, get: () => true, set() {} });
  check(fx.performanceQuality === 'ultra' && fx.foregroundFpsMode === 'vsync', 'fresh profile lost original defaults');
  check(!MineradioSonicPerformance.snapshot().preferences.enabled, 'adaptation must be opt-in');
  check(renderer.getPixelRatio() === Math.min(devicePixelRatio, 2), 'main renderer still compresses original resolution');
  const initialDpr = renderer.getPixelRatio();
  setPreset(8);
  const frame = () => document.querySelector('#sonic-workshop-layer iframe').contentWindow;
  const workshop = () => frame().__mineradioWorkshopPerformance?.snapshot();
  await until(() => workshop()?.state === 'ready', 'workshop did not initialize');
  await wait(6000);
  const original = workshop();
  check(original.triangles > 1000000 && original.config.fpsLimit === 0, 'original wallpaper was reduced');
  const hardwareReason = MineradioSonicPerformance.snapshot().recommendationReason;
  const activeGpuClass = classifyRendererGpu(original.gpu);
  if (['integrated', 'software'].includes(activeGpuClass)) {
    check(['gpu', 'software'].includes(hardwareReason), 'active GPU advice was missing');
  }
  const emit = sample => frame().eval('parent.postMessage(' + JSON.stringify({
    type: 'mineradio-sonic-performance-sample', sample
  }) + ',location.origin)');
  emit({ fps: 15, target: MineradioSonicPerformance.config().target, duration: 6000, early: true });
  await until(() => MineradioSonicPerformance.snapshot().recommendationReason === 'load', 'fast evidence did not reach the UI');
  const notice = document.getElementById('sonic-performance-notice');
  await wait(300);
  check(!notice.hidden && !notice.inert && notice.getAttribute('aria-hidden') === 'false', 'visible advice is inaccessible');
  check(document.getElementById('sonic-performance-enable').textContent === '开启自适应', 'action label is misleading');
  check(isPointerOverUi({ clientX: notice.getBoundingClientRect().x + 20,
    clientY: notice.getBoundingClientRect().y + 20 }), 'notice clicks leak into scene gestures');
  document.getElementById('sonic-performance-keep').focus();
  document.getElementById('sonic-performance-keep').click();
  check(notice.inert && notice.getAttribute('aria-hidden') === 'true', 'exiting advice still receives keyboard input');
  await until(() => notice.hidden, 'advice exit animation did not finish');
  check(!MineradioSonicPerformance.snapshot().preferences.enabled, 'keep-current enabled adaptation');
  check(JSON.parse(localStorage.getItem('mineradio-sonic-performance-v1')).dismissed, 'keep-current was not saved');
  applyDiyMode(true, { save: false });
  toggleFxPanel(true);
  setFxPanelTab('system');
  const group = document.querySelector('[data-fx-console-group="performance"]');
  group.classList.add('open');
  group.querySelector('button').setAttribute('aria-expanded', 'true');
  document.getElementById('sonic-performance-toggle').click();
  await until(() => workshop()?.config.profile?.tier === 4, 'enable reduced original detail before any load evidence');
  const target = MineradioSonicPerformance.config().target;
  emit({ fps: target / 4, target, duration: 6000, early: true });
  await until(() => workshop()?.config.profile?.tier === 3, 'fast lowering did not reach the real renderer');
  const lowered = workshop();
  check(lowered.triangles < original.triangles && fx.performanceQuality === 'ultra', 'lowering did not reduce geometry or overwrote saved quality');
  document.getElementById('sonic-performance-toggle').click();
  await until(() => workshop()?.config.profile === null && workshop().triangles === original.triangles,
    'manual disable did not restore original detail');
  check(JSON.parse(localStorage.getItem('mineradio-sonic-performance-v1')).dismissed, 'manual disable did not suppress repeated advice');
  // Finish on adaptive feedback for optional screenshots of both window sizes.
  MineradioSonicPerformance.setEnabled(true);
  emit({ fps: target / 4, target, duration: 6000, early: true });
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
    initialDpr, originalTriangles: original.triangles, loweredTriangles: lowered.triangles,
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
