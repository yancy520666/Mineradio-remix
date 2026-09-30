'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');
const baselineRef = process.argv.find(a => a.startsWith('--baseline-ref='))?.slice(15);
const cache = new Map();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-lyric-edit-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
process.on('exit', () => {
  if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mineradio-lyric-edit-')) {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
  }
});
const server = http.createServer((req, res) => {
  const file = path.resolve(publicRoot, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (baselineRef && /\.(js|html|css)$/.test(file) && !cache.has(file)) {
    cache.set(file, execFileSync('git', ['show', `${baselineRef}:${relative}`], { cwd: root }));
  }
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  res.end(cache.get(file) || fs.readFileSync(file));
});
async function exercise(baseline, fullScene) {
  console.log('EDIT_STAGE:start');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => {
    const end = performance.now() + 30000;
    while (!fn()) { if (performance.now() > end) throw new Error(label + ' ' + JSON.stringify({ build: window.__mineradioLyricBuildStats, resident: stageLyricResidentBuild.job && { reason: stageLyricResidentBuild.job.reason, textOnly: stageLyricResidentBuild.job.textOnly, phase: stageLyricResidentBuild.job.state.lastPhase, completed: stageLyricResidentBuild.job.state.completedPhases, total: stageLyricResidentBuild.job.state.totalPhases }, rows: stageLyrics.current?.userData.lyric.rowLayers.map(row => ({ index: row.lineIndex, active: row.isActive, preview: row.editTextPreview, glow: !!row.glow, visible: row.glow?.visible })), edit: typeof fxSliderEdit !== 'undefined' && { active: fxSliderEdit.active, rebuild: fxSliderEdit.rebuild }, prewarm: stageLyricPrewarm.build && { reason: stageLyricPrewarm.build.reason, guard: stageLyricPrewarm.build.guardKey === stageLyricPrewarmBuildGuardKey() }, idx: stageLyrics.currentIdx, initial: stageLyrics.current?.userData.lyric.renderInitialTextReady })); await sleep(25); }
  };
  dismissSplash({ instant: true });
  await sleep(100);
  // Real decoded audio keeps the production playback/render loop awake.
  const bytes = new Uint8Array(44 + 8000 * 40 * 2);
  const v = new DataView(bytes.buffer);
  const str = (at, s) => [...s].forEach((c, i) => bytes[at + i] = c.charCodeAt(0));
  str(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, bytes.length - 44, true);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  audio = new Audio(url);
  playQueue = [{ id: 'edit-preview-fixture', source: 'local', name: 'QA' }]; currentIdx = 0;
  audio.__mineradioQueueItemKey = queueItemKey(playQueue[0]); initAudio(); await audio.play(); playing = true;
  clearStageLyrics();
  Object.assign(fx, { particleLyrics: true, lyricDisplayMode: 'triple', lyricTranslationMode: 'multi',
    lyricTextureClarity: 4, lyricGlow: true, lyricGlowParticles: true, lyricGlowStrength: 0.8,
    lyricMotionStyle: 'glitch', lyricLineHeight: 1, lyricTranslationGap: 0.92, lyricScale: 1,
    lyricLetterSpacing: 0, lyricWeight: 700, lyricTranslationScale: 0.78 });
  lyricsLines = Array.from({ length: 12 }, (_, i) => ({ t: i * 20, text: i % 2 ? 'English lyric preview gyp' : '实时歌词预览文字', translation: i % 3 ? 'Original and translated words' : '紧贴原文的译文' }));
  lyricsTranslationLines = lyricsLines.map(line => ({ t: line.t, text: line.translation }));
  showStageLine(buildStageLyricDisplayPayload(0), true); stageLyrics.currentIdx = 0;
  stageLyrics.current.userData.age = 1;
  wakeMainLoopFromBackground();
  await until(() => stageLyrics.current?.userData.lyric.renderInitialTextReady, 'Initial visible text');
  await sleep(650);
  console.log('EDIT_STAGE:ready');
  saveLyricLayout({ user: true, force: true, reason: 'edit-fixture' });
  const counts = { rebuilds: 0, upgrades: 0, saves: 0, decorativeBuilds: 0, uploads: 0 };
  for (const [name, key] of [['refreshStageLyricDisplayMode', 'rebuilds'], ['makeLyricQualityTexture', 'upgrades'], ['saveLyricLayout', 'saves']]) {
    const fn = window[name]; window[name] = function (...args) { counts[key]++; return fn.apply(this, args); };
  }
  const resident = runStageLyricResidentBuild;
  runStageLyricResidentBuild = function (job) { if (!job.textOnly) counts.decorativeBuilds++; return resident(job); };
  const durations = [], intervals = [], drawCalls = [], longTasks = [];
  let measuring = false, previousAt = 0;
  const render = renderer.render.bind(renderer);
  const lyricScene = fullScene ? null : new THREE.Scene();
  renderer.render = function (...args) {
    // Keep the functional check independent of unrelated cover/background GPU work.
    if (lyricScene && args[0] === scene) {
      if (stageLyrics.group.parent !== lyricScene) lyricScene.add(stageLyrics.group);
      args[0] = lyricScene;
    }
    const started = performance.now(); const value = render(...args);
    if (measuring) { durations.push(performance.now() - started); drawCalls.push(renderer.info.render.calls); }
    return value;
  };
  const gl = renderer.getContext(); const upload = gl.texImage2D.bind(gl);
  gl.texImage2D = function (...args) { if (measuring) counts.uploads++; return upload(...args); };
  const observer = new PerformanceObserver(list => { if (measuring) longTasks.push(...list.getEntries().map(e => e.duration)); });
  observer.observe({ type: 'longtask', buffered: false });
  const pointer = (el, type, id = 17) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'mouse' }));
  const input = (id, value) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const gapEl = document.getElementById('fx-lyrictranslationgap');
  measuring = true; pointer(gapEl, 'pointerdown');
  for (let i = 0; i < 32; i++) {
    input('fx-lyrictranslationgap', 0.28 + (i % 16) * 0.03);
    input('fx-lyriclineheight', 0.78 + (i % 16) * 0.04);
    input('fx-lyricscale', 0.7 + (i % 16) * 0.02);
    await new Promise(resolve => requestAnimationFrame(at => { if (previousAt) intervals.push(at - previousAt); previousAt = at; resolve(); }));
    await sleep(16);
  }
  // No input events for much longer than either historical debounce.
  await sleep(900);
  const held = { ...counts };
  const mesh = stageLyrics.current, data = mesh.userData.lyric;
  const preview = data.rowLayers.some(row => row.renderWindowActive && row.mesh.visible && row.mat.uniforms.uEditPreview?.value === 1);
  input('fx-lyrictranslationgap', 0.28);
  await sleep(220);
  const original = data.rowLayers.find(row => row.isActive && row.isPrimary);
  const translation = data.rowLayers.find(row => row.isTranslation && row.parentIndex === 0);
  const physicalGap = !baseline ? original.mesh.position.y - translation.mesh.position.y
    + translation.lineMask.inkBounds.top * 6.1 / 2048 * translation.mesh.scale.x
    - original.lineMask.inkBounds.bottom * 6.1 / 2048 * original.mesh.scale.x : null;
  const expectedGap = !baseline ? original.lineMask.inkBounds.em * 6.1 / 2048 * original.mesh.scale.x * 0.02 : null;
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4), hidden = new Uint8Array(pixels.length);
  renderer.render(scene, camera); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  stageLyrics.group.visible = false; renderer.render(scene, camera); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, hidden);
  stageLyrics.group.visible = true;
  let textPixels = 0;
  for (let p = 0; p < pixels.length; p += 4) if (pixels[p] !== hidden[p] || pixels[p + 1] !== hidden[p + 1] || pixels[p + 2] !== hidden[p + 2]) textPixels++;
  measuring = false; pointer(gapEl, 'pointerup'); await sleep(220);
  const sameMeshAfterLayout = stageLyrics.current === mesh;
  console.log('EDIT_STAGE:layout');
  // Glyph changes use a bounded base-text update, then one cooperative restoration.
  const weightEl = document.getElementById('fx-lyricweight'); pointer(weightEl, 'pointerdown');
  input('fx-lyricweight', 900); input('fx-lyricspacing', 0.1);
  if (!baseline) await until(() => stageLyrics.current.userData.lyric.rowLayers.filter(row => row.renderWindowActive).every(row => row.editRasterKey === lyricFxRasterKey()), 'Visible glyph preview');
  else await sleep(450);
  const rasterVisible = !baseline && stageLyrics.current.userData.lyric.rowLayers.some(row => row.editTextPreview && row.lineMask.texture);
  const releasedAt = performance.now();
  pointer(weightEl, 'pointerup');
  if (!baseline) await until(() => stageLyrics.current !== mesh && stageLyrics.current.userData.lyric.renderInitialTextReady, 'Cooperative final text');
  else await sleep(450);
  const textReadyMs = performance.now() - releasedAt;
  if (!baseline) {
    audio.currentTime = 20.1;
    await until(() => stageLyrics.currentIdx === 1, 'Playback moves during effect restoration');
    await until(() => stageLyrics.current.userData.lyric.rowLayers.some(row => row.isActive && row.isPrimary && row.glow?.visible && row.mat.uniforms.uEditPreview?.value === 0), 'Full visible effects restored');
  }
  const effectsReadyMs = performance.now() - releasedAt;
  console.log('EDIT_STAGE:effects');
  const restored = !baseline && !lyricFxEditActive() && stageLyrics.current.userData.lyric.rowLayers.some(row => row.glow?.visible && row.mat.uniforms.uEditPreview?.value === 0);
  const saved = readCurrentFxAutosaveRaw();
  const preservedTier = fx.lyricTextureClarity;
  const uploadBudgetMax = window.__mineradioLyricUploadBudgetStats.maxConsumed;
  let spacingCases = 0;
  if (!baseline) {
    const previousFont = fx.lyricFont;
    for (const font of ['hei', 'song', 'serif-en', 'mono']) for (const [text, translated] of [['原文紧贴译文', '字形测试'], ['English gyp', 'Original translated gyp']]) for (const scale of [0.46, 1.12]) {
      fx.lyricFont = font;
      const a = makeLyricLineMask({ text, role: 'current' }, { fontSize: 128, lineHeight: 128 }, true);
      const b = makeLyricLineMask({ text: translated, role: 'translation', parentRole: 'current', translationLine: true, scale }, { fontSize: 128, lineHeight: 128 }, false);
      const parent = { lineMask: a, mesh: { scale: { x: 0.88 } } };
      const child = { lineMask: b, mesh: { scale: { x: 1.16 } } };
      const actual = lyricTranslationDistanceForRow(child, parent, 0.8) + b.inkBounds.top * 6.1 / 2048 * 1.16 - a.inkBounds.bottom * 6.1 / 2048 * 0.88;
      if (Math.abs(actual - a.inkBounds.em * 6.1 / 2048 * 0.88 * 0.02) > 1e-10) throw new Error('Actual font ink gap: ' + font);
      a.texture.dispose(); b.texture.dispose(); spacingCases++;
    }
    fx.lyricFont = previousFont;
  }
  let singleGapError = null, missingTranslationRows = null, singlePlaybackAdvanced = false;
  if (!baseline) {
    audio.currentTime = 0;
    clearStageLyrics(); fx.lyricDisplayMode = 'single';
    showStageLine(buildStageLyricDisplayPayload(0), true); stageLyrics.currentIdx = 0;
    stageLyrics.current.userData.age = 1;
    await until(() => stageLyrics.current.userData.lyric.renderInitialTextReady, 'Single line text');
    await sleep(450);
    const rows = stageLyrics.current.userData.lyric.rowLayers;
    const primary = rows.find(row => row.isPrimary), translated = rows.find(row => row.isTranslation);
    const actual = primary.mesh.position.y - translated.mesh.position.y + translated.lineMask.inkBounds.top * 6.1 / 2048 * translated.mesh.scale.x - primary.lineMask.inkBounds.bottom * 6.1 / 2048 * primary.mesh.scale.x;
    singleGapError = Math.abs(actual - primary.lineMask.inkBounds.em * 6.1 / 2048 * primary.mesh.scale.x * 0.02);
    clearStageLyricSingleLinePrewarmCache();
    console.log('EDIT_STAGE:single-ready');
    pointer(gapEl, 'pointerdown'); input('fx-lyrictranslationgap', 0.28);
    audio.currentTime = 20.1;
    await until(() => stageLyrics.currentIdx === 1 && stageLyrics.current.userData.lyric.rowLayers.some(row => row.isPrimary && row.mesh.visible && row.mat.uniforms.uEditPreview?.value === 1), 'Single line advances during drag');
    console.log('EDIT_STAGE:single-advanced');
    pointer(gapEl, 'pointerup');
    await until(() => stageLyrics.current.userData.lyric.rowLayers.some(row => row.isPrimary && row.glow?.visible && row.mat.uniforms.uEditPreview?.value === 0), 'Single line effects after drag');
    singlePlaybackAdvanced = true;
    audio.currentTime = 0;
    lyricsLines[0].translation = ''; fx.lyricDisplayMode = 'triple'; clearStageLyrics();
    showStageLine(buildStageLyricDisplayPayload(0), true); stageLyrics.currentIdx = 0;
    await until(() => stageLyrics.current.userData.lyric.renderInitialTextReady, 'Missing translation text');
    missingTranslationRows = stageLyrics.current.userData.lyric.rowLayers.filter(row => row.isTranslation && row.parentIndex === 0).length;
  }
  // End paths and stale jobs: a new gesture interrupts restoration, then a track clear invalidates it.
  pointer(weightEl, 'pointerdown'); input('fx-lyricweight', 850); await sleep(60); pointer(weightEl, 'pointerup');
  pointer(gapEl, 'pointerdown'); input('fx-lyrictranslationgap', 0.35);
  trackSwitchToken++; clearStageLyrics();
  lyricsLines = []; lyricsTranslationLines = [];
  pointer(gapEl, 'pointercancel'); await sleep(350);
  if (!baseline) {
    input('fx-lyricweight', 800); weightEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    weightEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    window.dispatchEvent(new Event('blur'));
  }
  const ended = baseline || !lyricFxEditActive();
  const staleTrackVisible = !!stageLyrics.current;
  let newTrackRestored = false;
  if (!baseline) {
    pointer(gapEl, 'pointerdown'); input('fx-lyrictranslationgap', 0.35);
    trackSwitchToken++; fx.lyricDisplayMode = 'single';
    lyricsLines = [{ t: 0, text: '切歌后的新歌词', translation: 'New track lyrics' }];
    showStageLine(buildStageLyricDisplayPayload(0), true); stageLyrics.currentIdx = 0;
    pointer(gapEl, 'pointerup');
    await until(() => stageLyrics.current.userData.lyric.rowLayers.some(row => row.isPrimary && row.glow?.visible && row.mat.uniforms.uEditPreview?.value === 0), 'New track effects after gesture');
    newTrackRestored = true;
    clearStageLyrics();
  }
  const finalValues = Object.fromEntries(['lyricWeight', 'lyricLetterSpacing', 'lyricTranslationGap', 'lyricTextureClarity'].map(key => [key, fx[key]]));
  observer.disconnect(); audio.pause(); playing = false; URL.revokeObjectURL(url);
  const p95 = values => { const a = values.slice().sort((x, y) => x - y); return +(a[Math.floor(a.length * 0.95)] || 0).toFixed(2); };
  return { held, preview, physicalGap, expectedGap, textPixels, sameMeshAfterLayout, rasterVisible, restored,
    preservedTier, savedWeight: saved.lyricWeight, savedSpacing: saved.lyricLetterSpacing, ended, staleTrackVisible,
    renderP95Ms: p95(durations), rafP95Ms: p95(intervals), drawCallsP95: p95(drawCalls), longTasks: longTasks.length,
    longestTaskMs: Math.max(0, ...longTasks), frames: durations.length, textReadyMs, effectsReadyMs, spacingCases,
    uploadBudgetMax, singleGapError, missingTranslationRows, singlePlaybackAdvanced, newTrackRestored, finalValues, fullScene };
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, paintWhenInitiallyHidden: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.message?.startsWith('EDIT_STAGE:')) console.log(event.message); });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const end = Date.now()+20000; (function ready(){ if(typeof renderer!=='undefined'&&renderer&&typeof bindFxPanel==='function')resolve();
    else if(Date.now()>end)reject(new Error('Renderer ready timeout')); else setTimeout(ready,50); })(); })`);
  const result = await win.webContents.executeJavaScript(`(${exercise.toString()})(${!!baselineRef},${process.argv.includes('--full-scene')})`);
  if (!baselineRef) {
    assert.equal(result.held.rebuilds, 0); assert.equal(result.held.upgrades, 0); assert.equal(result.held.saves, 0);
    assert.equal(result.held.decorativeBuilds, 0); assert(result.preview && result.textPixels > 100);
    assert(Math.abs(result.physicalGap - result.expectedGap) < 0.004, 'scaled glyph edges should nearly touch');
    assert(result.sameMeshAfterLayout && result.rasterVisible && result.restored && result.ended);
    assert.equal(result.preservedTier, 4); assert.equal(result.savedWeight, 900); assert.equal(result.savedSpacing, 0.1);
    assert.equal(result.staleTrackVisible, false, 'clearing a track cannot resurrect a cancelled style job');
    assert.equal(result.uploadBudgetMax, 1); assert(result.singleGapError < 0.004); assert.equal(result.missingTranslationRows, 0);
    assert.equal(result.singlePlaybackAdvanced, true);
    assert.equal(result.newTrackRestored, true);
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    await win.webContents.executeJavaScript(`new Promise(resolve => { (function ready(){ if(typeof fx!=='undefined'&&typeof bindFxPanel==='function')resolve(); else setTimeout(ready,50); })(); })`);
    const reloaded = await win.webContents.executeJavaScript(`Object.fromEntries(${JSON.stringify(Object.keys(result.finalValues))}.map(key => [key,fx[key]]))`);
    assert.deepEqual(reloaded, result.finalValues, 'committed glyph and spacing settings survive a renderer restart');
    result.reloadRestored = true;
  }
  console.log('MINERADIO_LYRIC_EDIT:' + JSON.stringify({ baselineRef, result }));
  win.destroy(); server.close(); app.exit(0);
}
app.whenReady().then(main).catch(error => { console.error(error.stack || error); server.close(); app.exit(1); });
