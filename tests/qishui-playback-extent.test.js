'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../qishui-api.js'), 'utf8');
const fallback = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/11-provider-fallback.js'), 'utf8');
function extract(source, name) { const start = source.indexOf('function ' + name + '('); return source.slice(start, source.indexOf('\n}\n', start) + 3); }
const c = vm.createContext({});
vm.runInContext(extract(source, 'qishuiPlaybackExtent') + extract(fallback, 'playbackDataIsFullTrack'), c);
test('Qishui known full and preview use selected source duration', () => {
  assert.equal(c.qishuiPlaybackExtent(200, 200).trial, false);
  assert.equal(c.qishuiPlaybackExtent(30, 200).trial, true);
  assert.equal(c.qishuiPlaybackExtent(30, 200).trialKnown, true);
});
test('unknown source extent preserves track display duration without claiming full or preview', () => {
  for (const duration of [undefined, null, 0, -1, NaN, Infinity]) {
    const result = c.qishuiPlaybackExtent(duration, 200);
    assert.equal(result.duration, 200);
    assert.equal(result.sourceDuration, 0);
    assert.equal(result.trialKnown, false);
    assert.equal(result.trial, null);
    assert.equal(c.playbackDataIsFullTrack({ url: 'https://fixture.invalid/song', ...result }), false);
  }
  assert.equal(c.qishuiPlaybackExtent(200, 0).trialKnown, false);
});
test('explicit unknown cannot announce a full alternative; legacy provider responses remain compatible', () => {
  assert.equal(c.playbackDataIsFullTrack({ url: 'https://fixture.invalid/song', trialKnown: false, trial: false }), false);
  assert.equal(c.playbackDataIsFullTrack({ url: 'https://fixture.invalid/song', trialKnown: true, trial: false }), true);
  assert.equal(c.playbackDataIsFullTrack({ url: 'https://fixture.invalid/song', trial: false }), true);
  assert.equal(c.playbackDataIsFullTrack({ url: 'https://fixture.invalid/song', trial: true }), false);
  assert.match(source, /playable: true,\s*\.\.\.extent,/);
});
