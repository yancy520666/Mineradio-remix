'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function workshop() {
  let source = fs.readFileSync(path.join(__dirname, '../public/sonic-workshop-preset.js'), 'utf8');
  // Expose private inputs only inside the test VM; production has no test API.
  source = source.replace('  global.MineradioSonicWorkshop = {', `
    global.testAudio = {
      samples: buildAudioSamples, push: pushAudio, recover: recoverAudioAnalysis,
      attach: function (frame) { state.iframe = frame; }
    };
    global.MineradioSonicWorkshop = {`);
  const listeners = {};
  const output = [];
  const window = {
    location: { origin: "http://localhost" },
    fx: { preset: 8 }, playing: true, audio: { paused: false, currentTime: 1 },
    frequencyData: new Uint8Array(1024), performance: { now: () => 1000 },
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  vm.runInNewContext(source, { window, document: {}, performance: window.performance, console, setTimeout, clearTimeout });
  const frameWindow = {
    __mineradioApplyAudio: samples => output.push(Array.from(samples)),
    __mineradioApplyProperties() {}, __mineradioApplyMedia() {},
  };
  window.testAudio.attach({ contentWindow: frameWindow });
  return { window, api: window.testAudio, output, listeners, frame: frameWindow };
}

const bands = { subBass: 0.6, bass: 0.6, lowMid: 0.6, mid: 0.6, highMid: 0.6, presence: 0.6, brilliance: 0.6 };
const mean = samples => samples.reduce((sum, value) => sum + value, 0) / samples.length;

test('retained zero FFT uses valid bands, while genuine silence remains silent', () => {
  const { api } = workshop();
  assert(mean(api.samples(bands)) > 0.05, 'active band data must reach the light effects');
  assert(api.samples({}).every(value => value === 0), 'silence must not invent musical activity');
});

test('FFT downsampling preserves peaks between sampled bins', () => {
  const { window, api } = workshop();
  for (let i = 1; i < window.frequencyData.length; i += 2) window.frequencyData[i] = 210;
  assert(mean(api.samples({})) > 0.05, 'odd-bin peaks must not disappear during 1024-to-512 conversion');
});

test('byte noise is not full-scale audio and paused attenuation stays intact', () => {
  const { window, api } = workshop();
  window.frequencyData.fill(1);
  assert(api.samples({}).every(value => value === 0), 'byte value 1 must mean 1/255, not normalized 1');
  window.frequencyData = new Float32Array(512).fill(0.8);
  const active = api.samples({});
  assert(mean(active) > 0.05);
  window.audio.paused = true;
  const paused = api.samples({});
  assert(paused.every((value, index) => Math.abs(value - active[index] * 0.12) < 1e-6));
});

test('iframe readiness replays the latest band frame instead of empty audio', () => {
  const { api, listeners, output, frame } = workshop();
  api.push(true, bands);
  listeners.message({ source: frame, origin: 'http://localhost', data: { type: 'mineradio-sonic-workshop-ready', generation: 0 } });
  assert.equal(output.length, 2);
  assert(mean(output[1]) > 0.05);
  assert.deepEqual(output[1], output[0]);
});

test('activation repairs analysis once and ignores a song changed during recovery', async () => {
  const { window, api } = workshop();
  let repairs = 0, scheduled = 0, finish;
  window.ensurePlaybackAudioGraph = () => { repairs++; return new Promise(resolve => { finish = resolve; }); };
  window.schedulePlaybackAnalyserRecovery = () => scheduled++;
  api.recover(); api.recover();
  assert.equal(repairs, 1);
  finish(true); await new Promise(setImmediate);
  assert.equal(scheduled, 1);
  window.audio = { paused: false };
  api.recover();
  window.audio = { paused: false };
  finish(true); await new Promise(setImmediate);
  assert.equal(scheduled, 1, 'old recovery must not act on the new song');
  window.audio.paused = true;
  api.recover();
  assert.equal(repairs, 2, 'activating a visual must not resume paused playback');
  window.audio = { paused: false };
  window.audioCtx = { state: 'closed' };
  api.recover();
  assert.equal(repairs, 2, 'background activation must not replace the media element for a closed context');
});
