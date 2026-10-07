'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

const c = vm.createContext({ clampRange: (v, min, max) => Math.max(min, Math.min(max, v)) });
loadFunctions(c, 'public/js/modules/02-visual/12-lyrics-row-layers.js', ['lyricTrackGlideEase', 'lyricTrackGlideOffset', 'lyricTrackFarFollowScale']);
c.LYRIC_TRACK_GLIDE_MIN_ROWS = 1.5;

test('a progress-bar jump glides fast first, then decelerates and stops exactly on the target', () => {
  const data = { trackScrollOffset: 0 };
  const samples = [];
  for (let ms = 0; ms <= 600; ms += 16) {
    const offset = c.lyricTrackGlideOffset(data, 20, 1, ms, false);
    if (offset == null) break;
    data.trackScrollOffset = offset;
    samples.push(offset);
  }
  assert.equal(samples.at(-1), 20, 'ends exactly on the target');
  assert.equal(data.trackGlide, null);
  assert.ok((samples.length - 1) * 16 <= 512, 'finishes within the playlist-like 0.3-0.5 s');
  const steps = samples.slice(1).map((v, i) => v - samples[i]);
  assert.ok(steps.every(step => step >= 0), 'never overshoots or reverses');
  assert.ok(steps[0] > steps.at(-2) * 5, 'early frames move much farther than the final frames');
});

test('a new target mid-glide restarts from the current position; drags and line advances do not glide', () => {
  const data = { trackScrollOffset: 0 };
  c.lyricTrackGlideOffset(data, 20, 1, 0, false);
  data.trackScrollOffset = c.lyricTrackGlideOffset(data, 20, 1, 100, false);
  const mid = data.trackScrollOffset;
  assert.equal(c.lyricTrackGlideOffset(data, 5, 1, 116, false), mid, 'retarget starts where the track is');
  assert.equal(c.lyricTrackGlideOffset(data, 40, 1, 132, true), null, 'held progress bar keeps the follow motion');
  assert.equal(data.trackGlide, null);
  assert.equal(c.lyricTrackGlideOffset({ trackScrollOffset: 3 }, 4, 1, 0, false), null, 'one-line advance keeps its easing');
  assert.equal(c.lyricTrackFarFollowScale(1, 1), 1, 'near targets keep the per-frame bound');
  assert.ok(c.lyricTrackFarFollowScale(20, 1) > 5, 'far drag targets loosen it');
});
