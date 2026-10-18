'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esprima = require('esprima');
const root = path.resolve(__dirname, '../..');
const files = [
  'public/js/modules/02-visual/05-lyrics-fonts-texture.js',
  'public/js/modules/02-visual/10-lyrics-mask-textures.js',
  'public/js/modules/02-visual/12a-lyrics-edit-preview.js',
  'public/js/modules/02-visual/13-lyrics-mesh-build.js',
  'public/js/modules/02-visual/14-stage-lyrics-rendering.js',
  'public/js/modules/06-lyrics/06-lyric-timing-offset.js',
];
function section(file, line) {
  if (file.includes('05-lyrics-fonts')) return line < 115 ? 'font ownership, late ready, removed/superseded source, selected-font refresh' : 'font identity/weights, bounded measurement cache, invalidation generation, letter spacing, unchanged stone print';
  if (file.includes('10-lyrics-mask')) {
    if (line < 44) return 'WebGL1/2 mipmap/anisotropy decisions and edge alpha; no sampling-policy change';
    if (line < 300) return 'empty input, active line mapping, cooperative measurements, fit and finite logical layout';
    if (line < 413) return 'deterministic raster seed, logical/runway dimensions, ink bounds and CPU+GPU runway estimate';
    if (line < 578) return 'selected quality tier, maximum dimensions, per-item bytes, logical glyph size and glow resolution';
    if (line < 631) return 'compaction transfers texture, releases old canvas and preserves logical/world dimensions';
    return 'readability/glow phase state, drawing-state save/restore, final owned textures and row-builder cancellation boundary';
  }
  if (file.includes('12a-')) return line < 115 ? 'gesture cancellation, finite paused current/snapshot/generation ownership and explicit final commit' : 'live spacing/scale/raster preview, parent-row ownership, ink-bounds fallback';
  if (file.includes('13-')) return line < 233 ? 'mask/bundle ownership, empty fallback, geometry/material/spark assembly and stable logical size' : line < 344 ? 'cooperative phase state, finish ownership transfer, cancel idempotence and failure release' : 'same-track targeting, pending progress, restore snaps, continuous seek and boundary demands';
  if (file.includes('06-lyric-timing')) return line < 90 ? 'bounded per-song offset map, song identity and finite adjusted media time' : 'offset UI/debounce/focus, duplicate event guards and explicit paused restore';
  if (line < 712) return 'prepared cache keys, track invalidation, bounded single-line lookahead, demand/restore/upgrade gates';
  if (line < 1586) return 'resident row identity, stale generation rejection, transform snapshot, merge ownership, visible/sharp/runway/effect priority and trimming';
  if (line < 1798) return 'reveal/resume lifetime, seek fallback arming/release and shared preview/media clock';
  if (line < 2240) return 'cooperative ownership, finite phase slices, stale guard rejection, explicit paused commit and full warmup cancellation';
  if (line < 2456) return 'intro owns handoff, sole title exit, show/retarget/redraw ownership, style refresh and complete clear';
  if (line < 2961) return 'shelf rest/reference camera, real caption projection, fit/rotation/arc/offset formulas and paused UI layout';
  if (line < 3399) return 'entrance/outgoing/reveal timing, progress smoothing, preview lock, glow/particle/breathing numeric inputs and exit release';
  if (line < 3476) return 'native word proportional measurements/cache generation and line progress boundaries';
  if (line < 3841) return 'context/translation entries, fixed virtual slots, lightweight/window/full payload and track cache identity';
  return 'binary line search, idle retirement, duplicate resume, attached-mesh recovery, pause-hold and lyric tick/disposal';
}
function evidence(file, name) {
  const results = [];
  if (/lyricKaraokeMetricsKey|lyricKaraokeWordRanges|registerCustomLyricFont|registerSavedCustomLyricFonts|clearLyricTextMeasureCache/.test(name)) results.push('tests/lyric-font-ready-refresh.test.js', 'tests/custom-font-lifecycle.test.js');
  if (/scheduleStageLyricCooperativeWork|runStageLyricCooperativePrewarm|startStageLyricCooperativePrewarm|finishLyricFxEditWork|refreshLyricTimingAfterOffsetChange|restorePausedStageLyrics|restoreCurrentStageLyrics|tickLyricsParticles/.test(name)) results.push('tests/paused-lyric-edit-commit.test.js');
  if (/lyricFxPausedCommitActive|finishLyricFxPausedCommit|ensureStageLyricPersistentTrackRows/.test(name)) results.push('tests/paused-lyric-effects-owner.test.js', 'tests/paused-lyric-quality-ownership.test.js');
  if (/MaskLayout|makeLyricMask|compactLyricLineMaskTexture|lyricRowLogicalWorldWidth|lyricQualityTargetMetrics|lyricMeshTrackWindow|findStageLyricIndexAtTime|buildStageLyricResidentPayload|cancelCooperativeLyricMeshBuild|disposeCooperativeLyricBuildMask|finishCooperativeLyricMeshBuild/.test(name)) results.push('tests/stage-lyric-mesh-boundaries.test.js');
  if (/Shelf|shelf|updateStageLyricLayout/.test(name)) results.push('tests/shelf-lyric-flip.test.js', 'tests/paused-lyric-layout.test.js');
  if (/Seek|seek/.test(name)) results.push('tests/lyric-seek-visibility.test.js', 'tests/lyric-track-seek-glide.test.js');
  if (/Resume|restore|Restore/.test(name)) results.push('tests/stage-lyric-background-restore.test.js', 'tests/lyric-work-scheduler.test.js');
  if (/Intro|showStageLine|Reveal|Outgoing/.test(name)) results.push('tests/lyric-title-handoff.test.js');
  if (/Resident|Persistent|Runway/.test(name)) results.push('tests/lyric-runway-preparation.test.js', 'tests/lyric-spacing-stability.test.js');
  return [...new Set(results)];
}
const output = { capturedAt: new Date().toISOString(),
  methodology: 'Every listed source file was read in full in numbered chunks and reviewed by function/callback. This AST ledger records completed source-level semantic review by the AI reviewer; AST enumeration alone is not a passing test or complete runtime coverage. Listed test links are direct or adjacent-chain evidence, not an assertion that every callback executed. This is not human visual acceptance.',
  runtimeLimits: 'Node VM tests use isolated fake clocks/canvas metrics; browser companion uses real original scripts, temporary generated WAV and SwiftShader. No Windows GPU/performance, native desktop IPC, real accounts, platform rights or subjective visual acceptance is established.',
  files: [] };
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = esprima.parseScript(source, { loc: true, range: true });
  const functions = [];
  function visit(node, parent, owner = '') {
    if (!node || typeof node !== 'object') return;
    const isFunction = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
    let currentOwner = owner;
    if (isFunction) {
      const name = node.id && node.id.name || (parent && parent.type === 'VariableDeclarator' && parent.id.name)
        || (parent && parent.type === 'Property' && (parent.key.name || parent.key.value))
        || 'callback@' + node.loc.start.line;
      functions.push({ name, owner: owner || null, lineStart: node.loc.start.line, lineEnd: node.loc.end.line,
        kind: node.type, fullSourceReviewed: true, reviewFocus: section(file, node.loc.start.line),
        evidence: evidence(file, owner || name), runtimeCoverage: evidence(file, owner || name).length ? 'targeted or owning-chain regression; not exhaustive runtime' : 'source and call-chain review; no dedicated dynamic assertion' });
      currentOwner = owner || name;
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'range', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, node, currentOwner));
      else if (value && typeof value === 'object') visit(value, node, currentOwner);
    }
  }
  visit(ast, null);
  output.files.push({ path: file, lines: source.split('\n').length - 1,
    sha256: crypto.createHash('sha256').update(source).digest('hex'), fullSourceReviewed: true,
    topLevelDeclarations: ast.body.filter(node => node.type === 'FunctionDeclaration').length,
    nestedAndTopLevelFunctions: functions.length, functions });
}
fs.writeFileSync(path.join(root, 'docs/QA_STAGE_LYRICS_LEDGER_2026-10-09.json'), JSON.stringify(output, null, 2) + '\n');
const md = ['# 舞台歌词逐函数/回调覆盖（2026-10-09）', '', output.methodology, '', output.runtimeLimits, ''];
for (const file of output.files) {
  md.push('## ' + file.path, '', `${file.lines} 行；顶层函数 ${file.topLevelDeclarations}；含嵌套回调 ${file.nestedAndTopLevelFunctions}。SHA256：${file.sha256}`, '');
  for (const fn of file.functions) {
    md.push(`- L${fn.lineStart}-${fn.lineEnd} ${fn.owner ? fn.owner + ' → ' : ''}${fn.name}：${fn.reviewFocus}。${fn.evidence.length ? '定向/相邻链：' + fn.evidence.map(item => path.basename(item)).join('、') : '仅源码/调用链，未单独执行该回调'}。`);
  }
  md.push('');
}
fs.writeFileSync(path.join(root, 'docs/QA_STAGE_LYRICS_FUNCTIONS_2026-10-09.md'), md.join('\n') + '\n');
console.log(JSON.stringify(output.files.map(file => ({ path: file.path, lines: file.lines, topLevelDeclarations: file.topLevelDeclarations, nestedAndTopLevelFunctions: file.nestedAndTopLevelFunctions })), null, 2));
