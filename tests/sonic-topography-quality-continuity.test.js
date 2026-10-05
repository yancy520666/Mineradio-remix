'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../public/vendor/three.r128.min.js');
const policy = require('../public/sonic-performance-policy');

test('quality probes resize real terrain buffers without restarting opacity, motion or active effects', () => {
  let reduction = 2;
  const window = { MineradioSonicPerformance: { stageProfile: () => policy.profile('ultra', true, reduction) } };
  const c = vm.createContext({ window, THREE });
  const source = fs.readFileSync('public/sonic-topography-preset.js', 'utf8');
  // Observe private state in this VM only; no test hooks ship in the player.
  vm.runInContext(source.replace('global.MineradioSonicTopography = {',
    'global.testState = state; global.testEnsureLayer = ensureLayer; global.MineradioSonicTopography = {'), c);
  const scene = new THREE.Scene(), fx = { preset: 7, performanceQuality: 'ultra', sonicGroundDensity: 100, sonicGroundFloatingCount: 100 };
  window.testEnsureLayer(scene, fx);
  const s = window.testState;
  s.opacity = 0.9; s.sonicTime = 8; s.autoYaw = 0.6; s.orbitThetaReady = true;
  s.ripples[0].strength = 0.8; s.meteorsData[0].active = true; s.trailsData[0].active = true;
  const root = s.root, mat = s.terrainMat, floatingMat = s.floatingMat, blocks = s.floatingData.slice();
  const ripples = s.ripples, meteors = s.meteorsData, trails = s.trailsData;
  let disposed = 0, instanceDisposed = 0;
  s.terrain.geometry.addEventListener('dispose', () => disposed++);
  s.terrain.addEventListener('dispose', () => instanceDisposed++);
  const count = s.terrain.count;
  reduction = 1.75; window.testEnsureLayer(scene, fx);
  assert(s.terrain.count > count); assert.equal(disposed, 1); assert.equal(instanceDisposed, 1);
  assert.equal(s.root, root); assert.equal(s.terrainMat, mat); assert.equal(s.terrain.material, mat);
  assert.equal(s.floatingMat, floatingMat); assert.equal(s.floatingBlocks.material, floatingMat);
  assert.equal(s.opacity, 0.9); assert.equal(s.sonicTime, 8); assert.equal(s.autoYaw, 0.6); assert(s.orbitThetaReady);
  assert.equal(s.ripples, ripples); assert.equal(s.meteorsData, meteors); assert.equal(s.trailsData, trails);
  assert.equal(s.ripples[0].strength, 0.8); assert(s.meteorsData[0].active && s.trailsData[0].active);
  blocks.forEach((block, i) => assert.equal(s.floatingData[i], block));
  reduction = 2; window.testEnsureLayer(scene, fx);
  assert.equal(s.terrain.count, count); assert.equal(s.opacity, 0.9);
  assert.equal(scene.children.length, 1); assert.equal(root.children.length, 4);
  let released = 0; mat.addEventListener('dispose', () => released++);
  let buffersReleased = 0;
  root.children.forEach(mesh => mesh.addEventListener('dispose', () => buffersReleased++));
  window.MineradioSonicTopography.clear();
  assert.equal(released, 1); assert.equal(buffersReleased, 4); assert.equal(scene.children.length, 0);
});
