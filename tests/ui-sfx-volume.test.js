'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

function volumeContext(saved) {
  const storage = new Map(saved == null ? [] : [['mineradio-ui-sfx-volume-v1', saved]]);
  const slider = { value: '', addEventListener(type, handler) { this[type] = handler; } };
  const output = { textContent: '' };
  const context = vm.createContext({
    UI_SFX_VOLUME_STORE_KEY: 'mineradio-ui-sfx-volume-v1', UI_SFX_DEFAULT_VOLUME: 0.7,
    uiSfxVolume: 0.7, targetVolume: 0.8,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: id => id === 'ui-sfx-volume' ? slider : output }
  });
  loadFunctions(context, 'public/js/modules/00-state/02-preferences-ui-modes.js', ['normalizeUiSfxVolume', 'readSavedUiSfxVolume']);
  loadFunctions(context, 'public/js/modules/05-playback/08-audio-graph-controls.js', ['syncUiSfxVolumeUi', 'setUiSfxVolume', 'bindUiSfxVolumeControls']);
  return { context, slider, output };
}

test('prompt volume restores silence and saved choices, with a default for missing or invalid data', () => {
  for (const [saved, expected] of [[undefined, 0.7], ['', 0.7], ['broken', 0.7], ['0', 0], ['0.35', 0.35], ['2', 1], ['-1', 0]]) {
    assert.equal(volumeContext(saved).context.readSavedUiSfxVolume(), expected);
  }
  const { context } = volumeContext();
  context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  assert.equal(context.readSavedUiSfxVolume(), 0.7);
});

test('the prompt slider saves and restores its value without changing music volume', () => {
  const { context, slider, output } = volumeContext();
  const previews = [];
  context.playShelfSelectTick = (...args) => previews.push(args);
  context.bindUiSfxVolumeControls();
  slider.value = '0.42'; slider.input();
  assert.equal(context.readSavedUiSfxVolume(), 0.42);
  assert.equal(output.textContent, '42%');
  assert.equal(context.targetVolume, 0.8);
  slider.change();
  assert.deepEqual(previews, [[1, 'card']]);
  const handler = slider.input;
  context.bindUiSfxVolumeControls();
  assert.equal(slider.input, handler, 'rebinding does not duplicate slider handlers');
  slider.value = '0'; slider.input();
  assert.equal(context.readSavedUiSfxVolume(), 0);
  assert.equal(output.textContent, '0%');
});

test('muting prevents new sounds and cancels a tick waiting for the audio context to resume', async () => {
  const { context } = volumeContext();
  let resume;
  const audioContext = { state: 'suspended', resume: () => new Promise(resolve => { resume = resolve; }), createGain: () => assert.fail('muted tick created an audio node') };
  context.performance = { now: () => 500 };
  context.lastShelfSelectSfxAt = 0;
  context.ensureUiSfxContext = () => audioContext;
  loadFunctions(context, 'public/js/modules/05-playback/08-audio-graph-controls.js', ['playShelfSelectTick', 'renderShelfSelectTick']);
  context.playShelfSelectTick(1, 'card');
  context.setUiSfxVolume(0);
  audioContext.state = 'running'; resume();
  await Promise.resolve();
  context.ensureUiSfxContext = () => assert.fail('muted tick opened the audio device');
  context.playShelfSelectTick(-1, 'row');
});
