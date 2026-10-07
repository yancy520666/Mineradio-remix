'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

test('a delayed lyric response keeps the current track title even after payload invalidation', () => {
  const group = {}, mesh = { parent: group, userData: { state: 'in', stageLyricText: 'Song - Artist', age: 0.8 } };
  const ctx = vm.createContext({ stageLyrics: { group, current: mesh, currentText: 'Song - Artist', currentPayload: null, currentTrackToken: 2 }, trackSwitchToken: 2 });
  loadFunctions(ctx, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['stageLyricCanKeepIntroTitle']);
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), true);
  assert.equal(ctx.stageLyrics.current, mesh);
  assert.equal(mesh.userData.age, 0.8);
  ctx.trackSwitchToken = 3;
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), false);
  ctx.trackSwitchToken = 2;
  mesh.parent = null;
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), false);
  mesh.parent = group; mesh.userData.state = 'out';
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), false);
});
