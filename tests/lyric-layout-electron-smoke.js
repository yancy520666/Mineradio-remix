'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const profileArg = process.argv.indexOf('--qa-profile');
const externalProfile = profileArg >= 0 ? process.argv[profileArg + 1] : null;
const userData = externalProfile ? path.resolve(externalProfile) : fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-lyric-layout-'));
if (path.dirname(userData) !== path.resolve(os.tmpdir()) || !path.basename(userData).startsWith('mineradio-lyric-layout-')) {
  throw new Error('Refusing to use a non-QA profile');
}
const settings = { lyricLineHeight: 1.8, lyricContextSpread: 2.4, lyricTranslationGap: 1.72,
  lyricTranslationScale: 0.88, lyricTranslationMode: 'multi', lyricDisplayMode: 'triple' };
app.setPath('userData', userData);
process.on('exit', () => {
  if (externalProfile) return;
  const target = path.resolve(userData);
  if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('mineradio-lyric-layout-')) {
    try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) { }
  }
});
async function openRenderer() {
  const win = new BrowserWindow({
    show: false, width: 1280, height: 720, paintWhenInitiallyHidden: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadFile(path.join(root, 'public', 'index.html'));
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 20000;
    function ready() {
      if (typeof fx !== 'undefined' && typeof saveLyricLayout === 'function'
        && typeof beginCooperativeLyricMeshBuild === 'function' && typeof renderer !== 'undefined' && renderer) return resolve();
      if (Date.now() >= deadline) return reject(new Error('Renderer did not initialize'));
      setTimeout(ready, 50);
    }
    ready();
  })`);
  return win;
}
async function main() {
  const win = await openRenderer();
  if (process.argv.includes('--restore-only')) {
    const restored = await win.webContents.executeJavaScript(`Object.fromEntries(
      ${JSON.stringify(Object.keys(settings))}.map(key => [key, fx[key]])
    )`);
    assert.deepEqual(restored, settings, 'a complete Electron process restart must restore DIY settings from disk');
    win.destroy();
    console.log('MINERADIO_LYRIC_RESTART_SMOKE:' + JSON.stringify({ ok: true, restored }));
    app.exit(0);
    return;
  }
  const result = await win.webContents.executeJavaScript(`(async () => {
    const settings = ${JSON.stringify(settings)};
    Object.assign(fx, settings);
    function pick(value) { return Object.fromEntries(Object.keys(settings).map(key => [key, value[key]])); }
    const compact = expandUserFxArchiveSnapshot(compactUserFxArchiveSnapshot(fx));
    const shareCode = await encodeUserFxArchiveShareCode({ name: 'Spacing QA', snapshot: fx });
    const shared = await decodeUserFxArchiveShareCode(shareCode);
    const snapshots = [];
    for (const texts of [
      ['短句', '第二句', '第三句'],
      ['Very long English lyric '.repeat(25), 'English', 'Another line'],
      ['很长的中文歌词'.repeat(25), '中间没有翻译', '末句']
    ]) {
      lyricsLines = texts.map((text, index) => ({ t: index * 5, text,
        translation: index === 1 ? '' : 'Translation ' + index, duration: 5, charCount: text.length }));
      lyricsTranslationLines = [];
      const payload = buildStageLyricDisplayPayload(0, { lightweightTrack: true });
      if (!payload || !payload.trackEntries || !payload.trackEntries.some(entry => entry.text === normalizeStageLyricText(texts[0]))) {
        throw new Error('Song switch reused stale lyric text');
      }
      const state = beginCooperativeLyricMeshBuild(payload);
      let iterations = 0;
      while (!stepCooperativeLyricMeshBuild(state, 1, 3)) {
        if (++iterations > 2000) throw new Error('Cooperative build failed to finish');
      }
      const rowBaseWidth = state.rowBaseMask.logicalWidth || state.rowBaseMask.width;
      const mesh = finishCooperativeLyricMeshBuild(state);
      if (!mesh) throw new Error('No lyric mesh');
      const data = mesh.userData.lyric;
      if (!data.usesTrack) throw new Error('Expected continuous multi-line lyrics');
      snapshots.push({ rowBaseWidth, lineStep: data.lineWorldStep, translationStep: data.translationLineStepWorld,
        expected: lyricTrackLineStepWorld(), translationExpected: lyricTranslationLineStepWorld() });
      disposeLyricMesh(mesh);
    }
    saveLyricLayout({ user: true, force: true, reason: 'archiveApply', syncDisk: true });
    const saved = readCurrentFxAutosaveRaw();
    const restored = readSavedLyricLayout();
    return { settings, live: pick(fx), saved: pick(saved), restored: pick(restored),
      compact: pick(compact), shared: pick(shared.snapshot), snapshots };
  })()`);
  for (const key of ['live', 'saved', 'restored', 'compact', 'shared']) {
    assert.deepEqual(result[key], result.settings, `${key} must preserve all spacing settings`);
  }
  assert.equal(result.snapshots.length, 3);
  assert(result.snapshots.some(snapshot => snapshot.rowBaseWidth > result.snapshots[0].rowBaseWidth),
    'long-line fixtures must exercise genuinely wider textures');
  for (const snapshot of result.snapshots) {
    assert(Math.abs(snapshot.lineStep - result.snapshots[0].lineStep) < 1e-10, 'song text cannot change built mesh spacing');
    assert(Math.abs(snapshot.lineStep - snapshot.expected) < 1e-10, 'mesh finalization cannot clamp authored spacing');
    assert(Math.abs(snapshot.translationStep - snapshot.translationExpected) < 1e-10);
    assert(snapshot.lineStep > 0.94, 'maximum DIY spacing must exceed the old hard cap');
  }
  // Reload from persisted storage in a new renderer; the old renderer stays alive until it is ready.
  const reopened = await openRenderer();
  const afterReload = await reopened.webContents.executeJavaScript(`Object.fromEntries(
    ${JSON.stringify(Object.keys(result.settings))}.map(key => [key, fx[key]])
  )`);
  assert.deepEqual(afterReload, result.settings, 'a fresh renderer must restore DIY spacing');
  win.destroy();
  reopened.destroy();
  console.log('MINERADIO_LYRIC_LAYOUT_SMOKE:' + JSON.stringify({ ok: true, result, afterReload }));
  app.exit(0);
}
app.whenReady().then(main).catch(error => {
  console.error(error.stack || error);
  app.exit(1);
});
