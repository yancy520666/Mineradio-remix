'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../public/vendor/three.r128.min.js');
const read = p => fs.readFileSync(p, 'utf8');
const particlesSource = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
function particleContext(resolution = 1.55, quality = 'high') {
  const c = vm.createContext({ THREE, fx: { coverResolution: resolution, performanceQuality: quality },
    particles: {}, bloomParticles: {}, uniforms: { uBurstAmt: { value: 0 } } });
  const helpers = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  vm.runInContext(helpers.slice(0, helpers.indexOf('var currentFxAutosaveDiskTimer')), c);
  vm.runInContext(particlesSource.slice(particlesSource.indexOf('var PLANE_SIZE ='), particlesSource.indexOf('// 涟漪数据纹理')), c);
  c.applyCoverParticleQualityBudget();
  return c;
}

test('eco stable subsets preserve every surviving position, UV and random seed and restore exact full geometry', () => {
  for (const resolution of [0.75, 0.9, 1, 1.1, 1.32, 1.55]) {
    const c = particleContext(resolution), original = c.geo, grid = c.GRID_X;
    let disposed = 0;
    original.addEventListener('dispose', () => disposed++);
    for (let repeat = 0; repeat < 3; repeat++) {
      c.fx.performanceQuality = 'eco'; c.applyCoverParticleQualityBudget();
      const low = c.particles.geometry;
      assert.equal(low, c.bloomParticles.geometry);
      assert.equal(c.fx.coverResolution, resolution);
      assert.equal(low.userData.count, Math.min(97, grid) ** 2);
      for (const name of ['position', 'aUv', 'aRand']) assert.equal(low.getAttribute(name), original.getAttribute(name));
      if (grid > 97) {
        const indices = Array.from(low.index.array);
        assert.equal(new Set(indices).size, 97 ** 2);
        assert.equal(indices[0], 0); assert.equal(indices.at(-1), grid ** 2 - 1);
        assert.equal(indices[(indices.length - 1) / 2], (grid ** 2 - 1) / 2);
        assert(indices.every((v, i) => i === 0 || v > indices[i - 1]));
      }
      c.fx.performanceQuality = 'balanced'; c.applyCoverParticleQualityBudget();
      const medium = c.particles.geometry;
      assert.equal(medium, c.bloomParticles.geometry);
      assert.equal(medium.userData.count, Math.min(127, grid) ** 2);
      for (const name of ['position', 'aUv', 'aRand']) assert.equal(medium.getAttribute(name), original.getAttribute(name));
      if (grid > 127) {
        assert.equal(new Set(medium.index.array).size, 127 ** 2);
        assert.equal(medium.index.array[0], 0); assert.equal(medium.index.array.at(-1), grid ** 2 - 1);
      }
      for (const quality of ['ultra']) {
        c.fx.performanceQuality = quality; c.applyCoverParticleQualityBudget();
        assert.equal(c.particles.geometry, original); assert.equal(c.bloomParticles.geometry, original);
        assert.equal(c.geo.index, null); assert.equal(c.fx.coverResolution, resolution);
      }
    }
    assert.equal(disposed, 0, 'quality changes never dispose/rebuild geometry');
  }
});

test('explicit resolution edit while eco retains new custom setting and releases all old geometries', () => {
  const c = particleContext(1.55, 'eco');
  const full = c.geo, low = c.lowDetailCoverGeo, medium = c.mediumDetailCoverGeo, high = c.highDetailCoverGeo;
  let released = 0;
  full.addEventListener('dispose', () => released++); low.addEventListener('dispose', () => released++); medium.addEventListener('dispose', () => released++); high.addEventListener('dispose', () => released++);
  c.applyCoverParticleResolution(1.32, { reload: false });
  assert.equal(released, 4); assert.equal(c.fx.coverResolution, 1.32);
  assert.equal(c.particles.geometry.userData.count, 97 ** 2);
  const updated = c.geo;
  c.fx.performanceQuality = 'ultra'; c.applyCoverParticleResolution(1.32, { reload: false });
  assert.equal(c.particles.geometry, updated); assert.equal(c.geo.userData.grid, 157);
  assert.equal(c.fx.coverResolution, 1.32);
});

test('1080p / 1440p quality and DPR matrix preserves existing main pixel policies and user cover settings', () => {
  const source = read('public/js/modules/01-scene/00-renderer-quality.js').split('var renderer =')[0];
  for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
    for (const dpr of [1, 1.25, 1.5, 2]) for (const lowSpec of [false, true]) {
      for (const quality of ['eco', 'balanced', 'high', 'ultra']) {
        const c = particleContext(1.32, quality);
        Object.assign(c, { innerWidth: width, innerHeight: height, window: { devicePixelRatio: dpr }, runtimeHardwareProfile: { lowSpec } });
        vm.runInContext(source, c);
        const caps = { eco: lowSpec ? .88 : .95, balanced: lowSpec ? .98 : 1.12, high: lowSpec ? 1.12 : 1.35, ultra: 2 };
        const budgets = { eco: lowSpec ? 1900000 : 2400000, balanced: lowSpec ? 2800000 : 3800000, high: lowSpec ? 3600000 : 5200000, ultra: Infinity };
        const expected = Math.min(dpr, caps[quality], Math.sqrt(budgets[quality] / (width * height)));
        assert(Math.abs(c.getRenderPixelRatio() - expected) < 1e-12);
        assert.equal(c.fx.coverResolution, 1.32);
        assert.equal(c.particles.geometry.userData.count, quality === 'eco' ? 9409 : (quality === 'balanced' ? 16129 : 24649));
      }
    }
  }
});

test('cover shaders skip only exactly completed old-cover contributions, retaining vinyl neighbors and shared bloom program', () => {
  const vs = particlesSource.slice(particlesSource.indexOf('var vs = `'), particlesSource.indexOf('// ----- 片元 Shader'));
  assert.match(vs, /if \(uColorMixT >= 1\.0\) return current;\s*return mix\(samplePrevCoverColor\(uv\), current, clamp\(uColorMixT, 0\.0, 1\.0\)\);/);
  assert.equal((vs.match(/coverColor = sampleMixedCoverColor\(/g) || []).length, 3);
  assert.match(vs, /if \(uColorMixT < 1\.0\) \{\s*vec3 softPrev = .*coverUv \+ sx.*coverUv - sx.*coverUv \+ sy.*coverUv - sy.*\n\s*softColor = mix\(softPrev, softNew, clamp\(uColorMixT, 0\.0, 1\.0\)\);/);
  assert.match(particlesSource, /var bloomVs = vs\s*\.replace/);
  const cover = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
  assert.match(cover, /uColorMixT.value = 1/);
  // Scalar algebra of the shader helper, including a nearly-completed fade.
  for (const t of [-.1, 0, .25, .5, .999999, 1, 1.1]) {
    let oldReads = 0;
    const old = () => { oldReads++; return .2; };
    const actual = t >= 1 ? .8 : old() * (1 - Math.max(0, Math.min(1, t))) + .8 * Math.max(0, Math.min(1, t));
    const legacy = .2 * (1 - Math.max(0, Math.min(1, t))) + .8 * Math.max(0, Math.min(1, t));
    assert.equal(actual, legacy); assert.equal(oldReads, t >= 1 ? 0 : 1);
  }
});

test('empty meteor and trail frames issue no matrix writes or uploads; death clears once and recycled slots reactivate', () => {
  const window = {}, c = vm.createContext({ THREE, window });
  const source = read('public/sonic-topography-preset.js');
  vm.runInContext(source.replace('global.MineradioSonicTopography = {',
    'global.inspectState = state; global.ensureTestLayer = ensureLayer; global.updateTestEffects = updateMeteorsAndTrails; global.spawnTestMeteor = addMeteor; global.spawnTestTrail = spawnTrail; global.MineradioSonicTopography = {'), c);
  window.ensureTestLayer(new THREE.Scene(), { preset: 7, performanceQuality: 'high' });
  const s = window.inspectState;
  assert.equal(s.terrain.visible, true);
  assert.equal(s.floatingBlocks.visible, true);
  let writes = 0;
  for (const mesh of [s.meteors, s.trails]) {
    const set = mesh.setMatrixAt.bind(mesh);
    mesh.setMatrixAt = (...args) => { writes++; set(...args); };
    assert.equal(mesh.visible, false);
  }
  const versions = () => [s.meteors.instanceMatrix.version, s.trails.instanceMatrix.version];
  const initial = versions();
  for (let i = 0; i < 60; i++) window.updateTestEffects(1 / 60);
  assert.equal(writes, 0); assert.deepEqual(versions(), initial);
  window.spawnTestMeteor(.8); window.updateTestEffects(1 / 60);
  assert(s.meteors.visible); assert(s.meteors.instanceMatrix.version > initial[0]);
  s.meteorsData[0].y = .001;
  window.updateTestEffects(1 / 60);
  assert.equal(s.meteors.visible, false); assert.equal(s.meteorsData[0].active, false);
  assert.equal(s.meteors.instanceMatrix.array[0], 0);
  assert(s.trails.visible); assert(s.trailsData.filter(p => p.active).length >= 10);
  window.updateTestEffects(2);
  assert.equal(s.trails.visible, false);
  for (let i = 0; i < s.trailsData.length; i++) assert.equal(s.trails.instanceMatrix.array[i * 16], 0);
  const final = versions(), finalWrites = writes;
  for (let i = 0; i < 60; i++) window.updateTestEffects(1 / 60);
  assert.equal(writes, finalWrites); assert.deepEqual(versions(), final);
  s.meteorIdx = 0; s.trailIdx = 0; s.sonicTime += 1;
  window.spawnTestMeteor(.9); window.spawnTestTrail(1, 2, 3, 1); window.updateTestEffects(.01);
  assert(s.meteors.visible && s.trails.visible);
  assert(s.meteors.instanceMatrix.array[0] > 0); assert(s.trails.instanceMatrix.array[0] > 0);
  window.MineradioSonicTopography.clear();
  window.ensureTestLayer(new THREE.Scene(), { preset: 7 });
  window.updateTestEffects(.01);
  assert.equal(s.meteors.visible, false); assert.equal(s.trails.visible, false);
});
