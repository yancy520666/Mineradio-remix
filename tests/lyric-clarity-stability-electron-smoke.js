'use strict';
// Verify displayed maps, not just the saved tier, in an isolated real player.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');

async function exerciseClarityStability() {
  closeLoginModal(); if (typeof closeVisualGuide === 'function') closeVisualGuide();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => {
    const end = performance.now() + 12000;
    while (!fn()) {
      if (performance.now() > end) throw Error(label + ': ' + JSON.stringify(snapshot()));
      await sleep(30);
    }
  };
  const bytes = new Uint8Array(44 + 8000 * 300 * 2), wav = new DataView(bytes.buffer);
  const text = (at, value) => [...value].forEach((ch, i) => bytes[at + i] = ch.charCodeAt(0));
  text(0, 'RIFF'); wav.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
  wav.setUint32(24, 8000, true); wav.setUint32(28, 16000, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
  text(36, 'data'); wav.setUint32(40, bytes.length - 44, true);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  audio = new Audio(url); playQueue = [{ id: 'clarity-stability-fixture', source: 'local', name: 'QA' }]; currentIdx = 0;
  audio.__mineradioQueueItemKey = queueItemKey(playQueue[0]); initAudio(); await audio.play(); playing = true;
  clearStageLyrics();
  Object.assign(fx, { particleLyrics: true, lyricDisplayMode: 'triple', lyricTranslationMode: 'multi',
    lyricTextureClarity: 4, lyricContextHighQuality: true, lyricGlow: true, lyricGlowStrength: .8,
    lyricMotionStyle: 'float', lyricLineHeight: 1, lyricTranslationGap: .92, lyricScale: 1,
    lyricLetterSpacing: 0, lyricWeight: 700, lyricTranslationScale: .78 });
  lyricsLines = Array.from({ length: 12 }, (_, i) => ({ t: i * 20, text: i % 2 ? 'English lyric preview gyp' : '实时歌词预览文字',
    translation: i % 3 ? 'Original and translated words' : '紧贴原文的译文' }));
  lyricsTranslationLines = lyricsLines.map(line => ({ t: line.t, text: line.translation }));
  const lyricScene = new THREE.Scene(), render = renderer.render.bind(renderer);
  renderer.render = function (source, camera) {
    if (source === scene) { if (stageLyrics.group.parent !== lyricScene) lyricScene.add(stageLyrics.group); source = lyricScene; }
    return render(source, camera);
  };
  showStageLine(buildStageLyricDisplayPayload(0), true); stageLyrics.currentIdx = 0;
  stageLyrics.current.userData.age = 1; wakeMainLoopFromBackground();
  function snapshot() {
    const data = stageLyrics.current && stageLyrics.current.userData.lyric;
    return { selected: fx.lyricTextureClarity, effective: lyricTextureClarityScale(), target: data && data.trackTargetLineIndex,
      rows: data ? data.rowLayers.filter(row => row.renderWindowActive).map(row => ({
        original: row.isPrimary, active: row.isActive, index: row.isTranslation ? row.parentIndex : row.lineIndex,
        tier: row.qualityTier, base: lyricQualityCurrentMap(row) === row.baseLineTexture,
        required: (lyricTextureClarityScale() > 1 && fx.lyricContextHighQuality !== false)
          || row.isActive || (row.isTranslation && row.parentIndex === data.trackTargetLineIndex),
        actual: lyricQualityCurrentMap(row) && lyricQualityCurrentMap(row).image.width,
        expected: lyricQualityTargetMetrics(row.lineMask, lyricTextureClarityScale()).width
      })) : [] };
  }
  function ready() {
    const value = snapshot(), required = value.rows.filter(row => row.required);
    return required.some(row => row.original) && required.some(row => !row.original)
      && required.every(row => row.tier === value.selected && !row.base && row.actual === row.expected);
  }
  const results = [];
  async function verify(label) {
    await until(ready, label);
    for (let frame = 0; frame < 12; frame++) {
      await sleep(60);
      if (!ready()) throw Error('Displayed clarity regressed at ' + label + ': ' + JSON.stringify(snapshot()));
    }
    results.push({ label, ...snapshot() });
  }
  await verify('initial');
  audio.currentTime = 20.2;
  await until(() => snapshot().target === 1, 'line advance');
  await verify('next-line');
  audio.pause(); playing = false; await verify('paused');
  for (const tier of [1, 2, 3, 4]) { setLyricTextureClarity(tier, true); await verify('paused-tier-' + tier); }
  const oldRoot = stageLyrics.current;
  runLyricFontLoadRefresh(); await until(() => stageLyrics.current !== oldRoot, 'font redraw');
  await verify('font-loaded-paused');
  toggleFx('lyricContextHighQuality'); await verify('context-off-paused');
  toggleFx('lyricContextHighQuality'); await verify('context-on-paused');
  runtimeHardwareProfile.lowSpec = true;
  refreshVisibleLyricQuality('test-low-memory'); await verify('bounded-low-memory');
  fx.lyricDisplayMode = 'custom'; fx.lyricCustomLineCount = 10; audio.currentTime = 100.2;
  refreshStageLyricDisplayMode(); await until(() => snapshot().target === 5, 'ten-line window');
  await verify('ten-line-bilingual-window');
  audio.pause(); playing = false; URL.revokeObjectURL(url);
  return { results, uploadMax: lyricRenderUploadFrameBudget.maxConsumed };
}

const probe = path.join(os.tmpdir(), 'mineradio-clarity-stability-' + process.pid + '.js');
fs.writeFileSync(probe, '(' + exerciseClarityStability.toString() + ')()');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let run;
try {
  run = spawnSync(require('electron'), [path.resolve(__dirname, '../scripts/qa/isolated-electron.js'), '--page', probe, '--timeout', '90000'],
    { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', windowsHide: true, timeout: 95000 });
} finally { fs.unlinkSync(probe); }
assert.equal(run.status, 0, run.stderr || run.error && run.error.message);
const line = run.stdout.split(/\r?\n/).find(value => value.startsWith('QA_RESULT '));
assert(line, run.stdout || run.stderr);
const result = JSON.parse(line.slice(10)); assert(!result.error, result.error);
assert.equal(result.uploadMax, 1);
assert.equal(result.results.length, 12);
console.log('LYRIC_CLARITY_STABILITY ' + JSON.stringify(result));
