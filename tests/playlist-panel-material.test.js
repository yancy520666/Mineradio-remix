'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const defaultsPath = 'public/js/modules/00-state/04-fx-defaults.js';
const runtimePath = 'public/js/modules/00-state/06-fx-runtime-layout.js';
const persistencePath = 'public/js/modules/02-visual/04-visual-settings-persistence.js';
const panelPath = 'public/js/modules/07-fx/05-fx-panel-performance.js';
const bindingsPath = 'public/js/modules/07-fx/07-bindings-shelf-immersive.js';
const storeKey = 'mineradio-current-fx-autosave-v1';
function fixture(saved) {
  const rootVars = new Map(), panelVars = new Map(), storage = new Map(), frames = new Map(), timers = new Map(), warnings = [];
  if (saved) storage.set(storeKey, JSON.stringify(saved));
  let sequence = 0;
  const sliders = {};
  for (const id of ['fx-playlistblur', 'fx-playlistdensity']) {
    const output = {}, events = {};
    sliders[id] = { value: '', output, events, parentElement: { querySelector: selector => selector === 'output' ? output : null },
      addEventListener: (name, fn) => (events[name] || (events[name] = [])).push(fn),
      emit(name, value) { if (value != null) this.value = String(value); (events[name] || []).forEach(fn => fn({})); } };
  }
  const noop = () => {};
  const c = vm.createContext({ console: { warn: (...args) => warnings.push(args) }, BASE_FOV: 45,
    VISUAL_PRESET_SCHEMA: 'skull-preset-v2', MAX_VISUAL_PRESET_INDEX: 12,
    CURRENT_FX_AUTOSAVE_STORE_KEY: storeKey, CURRENT_FX_AUTOSAVE_SCHEMA: 'current-fx-autosave-v2', LYRIC_LAYOUT_STORE_KEY: 'legacy',
    playing: false, currentIdx: -1, trackSwitchToken: 0, presetMeta: Array(13).fill({}), shelfManager: null, stageLyrics: {},
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { addEventListener: noop }, document: { addEventListener: noop, querySelectorAll: () => [],
      documentElement: { style: { setProperty: (key, value) => rootVars.set(key, value) } },
      getElementById: id => sliders[id] || (id === 'playlist-panel' ? { style: { setProperty: (key, value) => panelVars.set(key, value) } } :
        id.startsWith('t-') ? { classList: { toggle: noop } } : null) },
    setTimeout: fn => { timers.set(++sequence, fn); return sequence; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: id => frames.delete(id),
    normalizeCustomBackgroundMedia: () => null, normalizeCustomBackgroundImage: value => value || '', normalizeLyricFontKey: value => value || 'sans'
  });
  vm.runInContext(read(defaultsPath), c);
  vm.runInContext(read('public/js/modules/00-state/05-packaged-fx-archive.js'), c);
  vm.runInContext(read(persistencePath), c);
  vm.runInContext(read(runtimePath), c);
  // Unrelated panel controls and GPU/desktop integrations are outside this fixture.
  for (const name of ['liftFxFloatingPopups', 'relabelFxPanelControls', 'organizeFxPanel', 'bindHotkeySettings', 'bindCloseBehaviorControls',
    'bindStartupResumeModeControls', 'bindAudioOutputControls', 'bindUiSfxVolumeControls', 'buildPresetGrid', 'renderUserFxArchives',
    'buildLyricColorControls', 'ensureFxSliderResetButton', 'bindColorLabPicker', 'bindColorLabRows', 'syncFxUniforms', 'syncLyricRealtimeFxChange',
    'animateFxResetButton', 'showToast', 'applyCoverParticleResolution', 'refreshStageLyricDisplayMode', 'applyDesktopLyricsState',
    'pushDesktopLyricsState', 'applyWallpaperModeState', 'updateRenderPowerClasses', 'applyRendererPowerMode', 'setStageLyricPalette',
    'setPreset', 'destroyFloatLayer', 'applyControlGlassChromaticOffset']) c[name] = noop;
  // Stub only unrelated refreshes, retaining the real input synchronization and material application.
  const updateSource = read(panelPath).slice(read(panelPath).indexOf('function updateFxInputs('), read(panelPath).indexOf('function animateFxResetButton('));
  for (const name of new Set([...updateSource.matchAll(/\b(update\w+|refreshPresetGrid|applyStartupAutoplayUi)\(/g)].map(match => match[1]))) {
    if (name !== 'updateFxInputs') c[name] = noop;
  }
  loadFunctions(c, panelPath, ['setRange', 'updateFxInputs', 'resetFxSliderValue']);
  loadFunctions(c, bindingsPath, ['bindFxPanel', 'resetFx']);
  c.isDesktopLyricRealtimeFxKey = () => false;
  c.lyricRealtimeRefreshTimer = 0;
  vm.runInContext(read('public/js/modules/07-fx/06a-slider-preview.js'), c);
  c.bindFxPanel();
  assert.deepEqual(warnings, [], 'actual settings read must not silently fall back');
  return { c, sliders, panelVars, rootVars, storage, warnings,
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}

test('new profiles, packaged defaults and both reset paths use full density without migrating saved values', () => {
  const f = fixture(), c = f.c;
  assert.equal(c.fxDefaults.playlistPanelGlassDensity, 1);
  assert.equal(c.packagedDefaultLyricLayoutRaw().playlistPanelGlassDensity, 1);
  assert.equal(JSON.parse(read('public/default-user-fx-archive.json')).snapshot.playlistPanelGlassDensity, 1);
  assert.equal(c.fx.playlistPanelGlassDensity, 1);
  assert.equal(f.panelVars.get('--playlist-panel-density'), '1.000');
  assert.equal(f.sliders['fx-playlistdensity'].output.textContent, '1.00');
  f.sliders['fx-playlistdensity'].emit('input', .55); f.frame();
  c.resetFxSliderValue('fx-playlistdensity', 'playlistPanelGlassDensity', null);
  assert.equal(c.fx.playlistPanelGlassDensity, 1);
  assert.equal(f.panelVars.get('--playlist-panel-density'), '1.000');
  assert.equal(JSON.parse(f.storage.get(storeKey)).playlistPanelGlassDensity, 1);
  c.fx.playlistPanelGlassBlur = 60; c.fx.playlistPanelGlassDensity = .7;
  c.resetFx();
  assert.equal(c.fx.playlistPanelGlassBlur, 14);
  assert.equal(c.fx.playlistPanelGlassDensity, 1);
  assert.equal(f.panelVars.get('--playlist-panel-blur'), '14px');
  assert.equal(f.panelVars.get('--playlist-panel-density'), '1.000');
  assert.deepEqual(f.warnings, []);
  for (const density of [.55, .72, 1]) {
    const old = fixture({ playlistPanelGlassBlur: 32, playlistPanelGlassDensity: density });
    assert.equal(old.c.fx.playlistPanelGlassDensity, density, 'explicit old density survives even if it was the old default');
    assert.equal(old.c.fx.playlistPanelGlassBlur, 32);
    assert.equal(JSON.parse(old.storage.get(storeKey)).playlistPanelGlassDensity, density, 'reading never rewrites user storage');
  }
});

test('real slider input previews and commits reach panel CSS and reload with saved values', () => {
  const f = fixture();
  for (const quality of ['eco', 'balanced', 'high', 'ultra']) {
    f.c.fx.performanceQuality = quality;
    for (const [blur, density] of [[14,.55], [60,1], [32,.8]]) {
      f.sliders['fx-playlistblur'].emit('input', blur);
      f.sliders['fx-playlistdensity'].emit('input', density);
      f.frame();
      assert.equal(f.panelVars.get('--playlist-panel-blur'), blur + 'px');
      assert.equal(f.panelVars.get('--playlist-panel-density'), density.toFixed(3));
      assert.equal(f.panelVars.get('--playlist-row-a'), f.c.playlistPanelAlphaVars(density).row.toFixed(3));
      assert.ok(Number(f.panelVars.get('--playlist-row-hover-a')) > Number(f.panelVars.get('--playlist-row-a')));
      assert.ok(Number(f.panelVars.get('--playlist-row-selected-a')) > Number(f.panelVars.get('--playlist-row-hover-a')));
      for (const key of ['--playlist-panel-blur', '--playlist-panel-density', '--playlist-row-a']) assert.equal(f.rootVars.has(key), false, key + ' stays scoped to the left panel');
      f.sliders['fx-playlistdensity'].emit('change');
      const saved = JSON.parse(f.storage.get(storeKey));
      assert.equal(saved.playlistPanelGlassBlur, blur);
      assert.equal(saved.playlistPanelGlassDensity, density);
      const restarted = fixture(saved);
      assert.equal(restarted.panelVars.get('--playlist-panel-blur'), blur + 'px');
      assert.equal(restarted.panelVars.get('--playlist-panel-density'), density.toFixed(3));
    }
  }
  assert.deepEqual(f.warnings, [], 'actual autosave must succeed rather than using its unrelated critical fallback');
});
