'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

function setup(saved = new Map()) {
  const inputs = new Map();
  const nativeUpdates = [];
  const properties = new Map();
  for (const id of ['opacity', 'position-x', 'position-y', 'scale']) {
    const output = { textContent: '' };
    const parent = {
      children: [],
      querySelector(selector) { return selector === 'output' ? output : this.children.find(button => button.className === 'fx-reset-one'); },
      appendChild(button) { this.children.push(button); },
    };
    inputs.set('wallpaper-engine-' + id, { value: '', parentElement: parent });
  }
  const c = vm.createContext({
    console, Number, Object, Math, JSON, setTimeout, clearTimeout,
    wallpaperEngineVisualSettingsTimer: 0,
    wallpaperEngineNativeSessionId: '1234567890abcdef12345678',
    WALLPAPER_ENGINE_SELECTION_STORE_KEY: 'selection',
    WALLPAPER_ENGINE_VISUAL_PROFILES_STORE_KEY: 'profiles',
    wallpaperEngineVisualProfiles: {},
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    document: {
      getElementById(id) { return id === 'wallpaper-engine-layer' ? { style: { setProperty: (key, value) => properties.set(key, value) } } : inputs.get(id); },
      createElement() { return { attributes: {}, listeners: {}, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, fn) { this.listeners[key] = fn; } }; },
    },
    wallpaperEngineDesktopApi: () => ({ updateWallpaperEngineVisualSettings: value => nativeUpdates.push(JSON.parse(JSON.stringify(value))) }),
    animateFxResetButton() {}, showToast() {},
  });
  loadFunctions(c, 'public/js/modules/07-fx/03-wallpaper-engine-library.js', [
    'normalizeWallpaperEngineSelection', 'normalizeWallpaperEngineVisualProfile', 'readWallpaperEngineSelection', 'readWallpaperEngineVisualProfiles',
    'rememberWallpaperEngineVisualProfile', 'saveWallpaperEngineSelection', 'wallpaperEngineVisualSettings', 'syncWallpaperEngineVisualControls',
    'flushWallpaperEngineVisualSettings', 'applyWallpaperEngineVisualSettings', 'setWallpaperEngineVisualSetting', 'resetWallpaperEngineVisualSetting',
  ]);
  loadFunctions(c, 'public/js/modules/07-fx/05-fx-panel-performance.js', ['ensureFxSliderResetButton']);
  c.wallpaperEngineSelection = c.readWallpaperEngineSelection();
  c.wallpaperEngineVisualProfiles = c.readWallpaperEngineVisualProfiles();
  return { c, saved, inputs, nativeUpdates, properties };
}

test('four WE resets use real defaults, apply immediately and preserve unrelated selection settings', () => {
  const { c, saved, inputs, nativeUpdates, properties } = setup();
  c.wallpaperEngineSelection = c.normalizeWallpaperEngineSelection({
    id: c.wallpaperEngineNativeSessionId, active: true, title: 'Fixture', kind: 'engine',
    visualOpacity: .4, visualPositionX: .2, visualPositionY: -.3, visualScale: 1.5,
  });
  c.syncWallpaperEngineVisualControls();
  c.syncWallpaperEngineVisualControls();
  const defaults = c.normalizeWallpaperEngineSelection({});
  for (const [id, field] of [
    ['opacity', 'visualOpacity'], ['position-x', 'visualPositionX'], ['position-y', 'visualPositionY'], ['scale', 'visualScale'],
  ]) {
    const input = inputs.get('wallpaper-engine-' + id);
    assert.equal(input.parentElement.children.length, 1, 'reopening must not duplicate reset buttons');
    const button = input.parentElement.children[0];
    assert.equal(button.type, 'button');
    assert.ok(button.attributes['aria-label']);
    const previous = JSON.parse(JSON.stringify(c.wallpaperEngineSelection));
    button.listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(c.wallpaperEngineSelection[field], defaults[field]);
    const expected = { ...previous, [field]: defaults[field] };
    assert.deepEqual(JSON.parse(JSON.stringify(c.wallpaperEngineSelection)), expected, 'only the selected property may change');
    assert.equal(nativeUpdates.length, ['opacity', 'position-x', 'position-y', 'scale'].indexOf(id) + 1, 'native settings apply during the reset click');
    assert.equal(c.wallpaperEngineVisualSettingsTimer, 0);
    const reloaded = setup(saved);
    assert.equal(reloaded.c.wallpaperEngineSelection[field], defaults[field]);
    reloaded.c.syncWallpaperEngineVisualControls();
    assert.equal(reloaded.inputs.get('wallpaper-engine-' + id).value, input.value);
    if (field !== 'visualOpacity') assert.equal(reloaded.c.wallpaperEngineVisualProfiles[c.wallpaperEngineNativeSessionId][field], defaults[field]);
  }
  assert.equal(properties.get('--wallpaper-engine-visual-opacity'), defaults.visualOpacity.toFixed(3));
  assert.equal(properties.get('--wallpaper-engine-visual-scale'), defaults.visualScale.toFixed(3));
  const writes = saved.size;
  c.resetWallpaperEngineVisualSetting('__proto__');
  assert.equal(saved.size, writes);
});
