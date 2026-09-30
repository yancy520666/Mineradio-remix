'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const clampRange = (v, min, max) => Math.max(min, Math.min(max, v));
const c = vm.createContext({ fxDefaults: { lyricTranslationGap: 0.92 }, gap: 0.28, clampRange,
  lyricTranslationGapValue: () => c.gap });
loadFunctions(c, 'public/js/modules/02-visual/12a-lyrics-edit-preview.js', [
  'lyricMaskInkBounds', 'lyricTranslationTightDistance', 'lyricTranslationDistanceForRow',
]);
const parent = { lineMask: { inkBounds: { top: -62, bottom: 12, em: 128 } }, mesh: { scale: { x: 1 } } };
const row = { lineMask: { inkBounds: { top: -44, bottom: 28, em: 128 } }, mesh: { scale: { x: 0.92 } } };
const units = 6.1 / 2048;
for (const scale of [0.46, 0.78, 1.12]) {
  row.mesh.scale.x = scale;
  c.gap = 0.28;
  const distance = c.lyricTranslationDistanceForRow(row, parent, 0.44);
  const inkGap = distance + row.lineMask.inkBounds.top * units * scale - parent.lineMask.inkBounds.bottom * units;
  assert(Math.abs(inkGap - 128 * units * 0.02) < 1e-12, 'minimum uses scaled ink bounds with a 2% em gap');
  let previous = distance;
  for (let gap = 0.29; gap < 0.92; gap += 0.01) {
    c.gap = gap;
    const next = c.lyricTranslationDistanceForRow(row, parent, 0.44);
    assert(next > previous, 'low range must have no dead zone');
    previous = next;
  }
  for (const gap of [0.92, 1.72, 2.2]) {
    c.gap = gap;
    assert.equal(c.lyricTranslationDistanceForRow(row, parent, 0.44), 0.44, 'default and larger spacing stay compatible');
  }
}
assert.equal(c.lyricTranslationDistanceForRow(row, null, 0.44), 0.44);

let nextTimer = 0;
const timers = new Map();
const events = new Map();
const calls = { suspend: 0, finish: 0, save: 0 };
const g = vm.createContext({ Set, window: { addEventListener: (name, fn) => events.set(name, fn) },
  document: { addEventListener() {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id),
  suspendLyricFxEditWork: () => calls.suspend++, finishLyricFxEditWork: () => calls.finish++,
  flushLyricLayoutSave: () => calls.save++, lyricRealtimeRefreshTimer: null, trackSwitchToken: 0 });
vm.runInContext(fs.readFileSync('public/js/modules/07-fx/06a-slider-preview.js', 'utf8'), g);
g.beginFxSliderEdit('lyricTranslationGap', 7, false);
g.commitFxSliderPreview();
assert.equal(calls.finish, 0, 'native change while held cannot restore expensive effects');
events.get('pointerup')({ pointerId: 8 });
assert(g.isLyricFxEditPreviewActive(), 'unrelated pointer cannot terminate the edit');
events.get('pointercancel')({ pointerId: 7 });
assert.equal(calls.finish, 1);
g.commitFxSliderPreview();
assert.equal(calls.finish, 1, 'change and pointerup must not duplicate restoration');
g.beginFxSliderEdit('lyricWeight', null, true);
assert.equal(timers.size, 0, 'keyboard hold cannot expire between repeated keys');
events.get('blur')();
assert.equal(calls.finish, 2);
assert.equal(g.isLyricFxEditPreviewActive(), false);
const mesh = {};
const resident = vm.createContext({ stageLyrics: { current: mesh }, trackSwitchToken: 8 });
loadFunctions(resident, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['stageLyricResidentJobIsCurrent']);
const job = { mesh, trackKey: '', singleEffects: true, trackToken: 8 };
const singleData = { trackKey: '', trackPersistent: false };
assert(resident.stageLyricResidentJobIsCurrent(job, singleData), 'single effects can extend the existing text mesh');
resident.trackSwitchToken++;
assert(!resident.stageLyricResidentJobIsCurrent(job, singleData), 'track change invalidates single effects');
resident.trackSwitchToken = 8;
resident.stageLyrics.current = {};
assert(!resident.stageLyricResidentJobIsCurrent(job, singleData), 'new displayed text invalidates old effects');
console.log('[OK] Gesture lifetime and compact translation spacing.');
