'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

test('visible focus changes keep lyric recovery without scheduling viewport bursts or long boosts', () => {
  const events = [], hooks = {};
  const c = vm.createContext({
    window: { addEventListener: (name, fn) => { hooks[name] = fn; } },
    document: { addEventListener() {} }, desktopRuntimeState: { focused: false },
    uniforms: { uLoading: { value: 0 } }, audio: { src: 'fixture', paused: false },
    loadingTween: null, loadingHideTimer: null,
    applyRendererPowerMode() {}, updateRenderPowerClasses() {},
    refreshDesktopRuntimeStateAfterWake() {}, isDeepBackgroundMode: () => false,
    restoreStageLyricsAfterBackground: reason => events.push(['lyrics', reason]),
    refreshCurrentCoverAfterBackground() {}, ensureAudiblePlaybackGain() {},
    scheduleMainRendererViewportRefresh: () => events.push(['viewport']),
    markRenderInteraction: (reason, ms) => events.push(['boost', ms]),
  });
  loadFunctions(c, 'public/js/modules/02-visual/15-ripples-cover-depth.js', ['recoverVisualsAfterBackground']);
  loadFunctions(c, 'public/js/modules/00-state/08-desktop-render-power.js', ['installRenderPowerHooks']);
  c.installRenderPowerHooks();
  for (let i = 0; i < 20; i++) { hooks.blur(); hooks.focus(); }
  assert.equal(events.filter(e => e[0] === 'viewport').length, 0);
  assert.equal(events.filter(e => e[0] === 'lyrics').length, 20, 'focus still repairs missing current lyrics');
  assert(events.filter(e => e[0] === 'boost').every(e => e[1] <= 180));
  c.recoverVisualsAfterBackground('desktop-runtime-state');
  assert.equal(events.filter(e => e[0] === 'viewport').length, 1, 'real hide/restore retains the viewport recovery');
});
