'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const previewPath = 'public/js/modules/02-visual/12a-lyrics-edit-preview.js';
const stagePath = 'public/js/modules/02-visual/14-stage-lyrics-rendering.js';

function ownerContext() {
  const row = { lineIndex: 5, isPrimary: true, renderWindowActive: true };
  const data = { pausedFxCommitToken: 3, pausedFxCommitRows: [row], rowLayers: [row] };
  const mesh = { userData: { lyric: data } };
  const c = vm.createContext({ stageLyrics: { current: mesh }, trackSwitchToken: 3,
    audio: { paused: true }, fx: { lyricGlow: true, lyricGlowStrength: 1 },
    isLyricFxEditPreviewActive: () => false, lyricTextureClarityScale: () => 4,
    lyricQualityCandidateTarget: () => ({ metrics: { tier: 4 }, key: 'selected-HD' }),
    lyricQualityCurrentMap: candidate => candidate.map,
  });
  loadFunctions(c, previewPath, ['lyricFxEditActive', 'lyricFxPausedCommitActive', 'finishLyricFxPausedCommit']);
  return { c, row, data, mesh };
}

test('paused commit permission belongs only to the current original visible rows and generation', () => {
  const { c, row, data, mesh } = ownerContext();
  assert.equal(c.lyricFxPausedCommitActive(data, row), true);
  assert.equal(c.lyricFxPausedCommitActive(data, { renderWindowActive: true }), false);
  row.renderWindowActive = false; assert.equal(c.lyricFxPausedCommitActive(data, row), false);
  row.renderWindowActive = true;
  c.trackSwitchToken = 4; assert.equal(c.lyricFxPausedCommitActive(data, row), false);
  c.trackSwitchToken = 3;
  mesh.userData.__mineradioDisposeQueued = true; assert.equal(c.lyricFxPausedCommitActive(data), false);
  delete mesh.userData.__mineradioDisposeQueued;
  c.audio.paused = false; assert.equal(c.lyricFxPausedCommitActive(data), false);
  c.audio.paused = true;
  c.isLyricFxEditPreviewActive = () => true; assert.equal(c.lyricFxPausedCommitActive(data), false);
  c.isLyricFxEditPreviewActive = () => false;
  c.stageLyrics.current = { userData: { lyric: {} } }; assert.equal(c.lyricFxPausedCommitActive(data), false);
});

test('finite paused commit retires only after effects and the selected HD map really commit', () => {
  const { c, row, data } = ownerContext();
  row.renderLineUploaded = true; row.readability = {}; row.renderReadabilityUploaded = true;
  row.glow = {}; row.renderGlowUploaded = true; row.editTextPreview = true;
  c.finishLyricFxPausedCommit(data); assert.equal(data.pausedFxCommitToken, 3);
  row.editTextPreview = false; row.qualityWanted = true;
  c.finishLyricFxPausedCommit(data); assert.equal(data.pausedFxCommitToken, 3);
  row.qualityTexture = {}; row.qualityTier = 4; row.qualityRasterKey = 'selected-HD';
  row.map = row.qualityTexture; row.qualityPendingTexture = {};
  c.finishLyricFxPausedCommit(data); assert.equal(data.pausedFxCommitToken, 3);
  row.qualityPendingTexture = null;
  c.finishLyricFxPausedCommit(data);
  assert.equal(data.pausedFxCommitToken, undefined); assert.equal(data.pausedFxCommitRows, undefined);
  assert.equal(c.lyricFxPausedCommitActive(data, row), false);
});

test('released multi-line edit restores only its visible effects before ordinary paused runway', () => {
  const { c, data, mesh } = ownerContext();
  const calls = [], map = {};
  data.displayMode = 'triple'; data.trackPersistent = true; data.trackTargetLineIndex = 5;
  data.rowLayers = [4, 5, 6].map(lineIndex => ({ lineIndex, isPrimary: true, renderWindowActive: true, lineMask: {} }));
  data.pausedFxCommitRows = data.rowLayers.slice();
  data.rowLayers.forEach(row => { map[row.lineIndex + '|primary'] = row; });
  Object.assign(c, { lyricsLines: Array.from({ length: 10 }, (_, index) => ({ t: index, text: 'line ' + index })),
    stageLyricResidentBuild: { job: null }, stageLyricResidentMeshIsCurrent: candidate => candidate === mesh,
    stageLyricPersistentResidentRowMap: () => map, lyricDisplayOffsetsForMode: () => [-1, 0, 1],
    stageLyricProgressPreviewActive: () => false, lyricLineDisplayTextAt: index => 'line ' + index,
    stageLyricTrackBaseEntry: index => ({ lineIndex: index }), normalizeLyricTranslationMode: () => 'off',
    stageLyricPersistentLineRowsResident: (owner, index) => !!map[index + '|primary'],
    stageLyricPersistentLineEffectsResident: (owner, index) => !!(map[index + '|primary'] && map[index + '|primary'].readability),
    cancelStageLyricResidentDemand() {}, cancelStageLyricResidentBuild() { c.stageLyricResidentBuild.job = null; },
    startStageLyricResidentBuild(root, target, start, end, options) { calls.push({ root, target, start, end, options }); return true; },
  });
  loadFunctions(c, stagePath, ['ensureStageLyricPersistentTrackRows']);
  assert.equal(c.ensureStageLyricPersistentTrackRows(mesh, 5), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].start, 4); assert.equal(calls[0].end, 6);
  assert.equal(calls[0].options.effectsOnly, true, 'visible edit effects must not wait behind off-screen text runway');
  assert.equal(calls[0].options.urgent, undefined, 'keep the original non-urgent slice and upload budgets');
});
