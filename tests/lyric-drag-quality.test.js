'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

test('dragging allows all selected visible rows at their original tier, including distant context', () => {
  const c = vm.createContext({ lyricQualityOwnerActive: () => true, lyricQualityState: { frameCandidates: [] } });
  loadFunctions(c, 'public/js/modules/02-visual/12-lyrics-row-layers.js', ['registerLyricQualityCandidates', 'lyricQualityDragBuildAllowed']);
  const rows = Array.from({ length: 5 }, (_, i) => ({ lineIndex: i, qualityWanted: true }));
  c.registerLyricQualityCandidates({}, rows.map((row, i) => ({ row, priority: i + 10, dragNear: i === 2 })), 3, 0, true);
  assert.equal(c.lyricQualityState.frameCandidates.length, 5);
  for (const candidate of c.lyricQualityState.frameCandidates) {
    assert.equal(candidate.tier, 3);
    assert.equal(candidate.buildDeferred, false);
    assert.equal(c.lyricQualityDragBuildAllowed(candidate), true);
  }
  rows[0].qualityWanted = false;
  assert.equal(c.lyricQualityDragBuildAllowed(c.lyricQualityState.frameCandidates[0]), false, 'obsolete rows do not steal drag work');
});
