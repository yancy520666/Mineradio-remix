'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
test('left-panel sliders and resets update the complete panel without changing other panel scopes or storage fields', () => {
  const rootVars = new Map(), panelVars = new Map();
  const c = vm.createContext({ fx: { playlistPanelGlassBlur:14, playlistPanelGlassDensity:.55,
      playlistPanelOpenDuration:.2, playlistPanelCloseDuration:.14 },
    fxDefaults:{playlistPanelGlassBlur:14,playlistPanelGlassDensity:.55},
    clampRange:(v,a,b)=>Math.max(a,Math.min(b,v)), document:{ documentElement:{style:{setProperty:(k,v)=>rootVars.set(k,v)}},
      getElementById:id=>id==='playlist-panel'?{style:{setProperty:(k,v)=>panelVars.set(k,v)}}:null } });
  loadFunctions(c,'public/js/modules/00-state/06-fx-runtime-layout.js',[
    'clampPlaylistPanelFxSettings','playlistPanelAlphaVars','setPlaylistPanelCssVar','applyPlaylistPanelFxSettings']);
  for(const [blur,density] of [[14,.55],[60,1],[32,.8],[14,.55]]) {
    c.fx.playlistPanelGlassBlur=blur; c.fx.playlistPanelGlassDensity=density;
    c.applyPlaylistPanelFxSettings();
    assert.equal(panelVars.get('--playlist-panel-blur'),blur+'px');
    assert.equal(panelVars.get('--playlist-panel-density'),density.toFixed(3));
    assert.equal(panelVars.get('--playlist-row-a'),c.playlistPanelAlphaVars(density).row.toFixed(3));
    assert.ok(Number(panelVars.get('--playlist-row-hover-a'))>Number(panelVars.get('--playlist-row-a')));
    assert.ok(Number(panelVars.get('--playlist-row-selected-a'))>Number(panelVars.get('--playlist-row-hover-a')));
    assert.equal(rootVars.has('--playlist-row-a'),false,'row opacity remains inside the left panel');
    assert.equal(rootVars.has('--playlist-panel-blur'),false,'blur is scoped to the left panel');
    assert.equal(rootVars.has('--playlist-panel-density'),false,'opacity cannot leak into search or settings');
    assert.equal(c.fx.playlistPanelGlassDensity,density,'the existing saved key and valid value survive unchanged');
  }
});
