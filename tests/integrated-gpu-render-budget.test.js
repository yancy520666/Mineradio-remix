'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../public/vendor/three.r128.min.js');
const read = p => fs.readFileSync(p, 'utf8');
const particlesSource = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
const profileSource = (() => {
  const src = read('public/js/modules/00-state/08-desktop-render-power.js');
  const start = src.indexOf('function performanceDetailProfile()');
  return src.slice(start, src.indexOf('function runtimeAudioAnalysisScale()'));
})();
function particleContext(resolution = 1.55, quality = 'high') {
  const c = vm.createContext({ THREE, fx: { coverResolution: resolution, performanceQuality: quality },
    fxDefaults: { coverResolution: 1.55, performanceQuality: 'ultra' },
    particles: {}, bloomParticles: {},
    uniforms: { uBurstAmt: { value: 0 }, uBloomDensitySize: { value: 1 }, uGridPointScale: { value: 1 }, uCoverRes: { value: 1 } } });
  const helpers = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  vm.runInContext(helpers.slice(0, helpers.indexOf('var currentFxAutosaveDiskTimer')), c);
  vm.runInContext(profileSource, c);
  vm.runInContext(particlesSource.slice(particlesSource.indexOf('var PLANE_SIZE ='), particlesSource.indexOf('// 涟漪数据纹理')), c);
  c.applyCoverParticleQualityBudget();
  return c;
}

function assertRegularGrid(geometry) {
  const grid=geometry.userData.grid, count=grid*grid;
  assert.equal(geometry.index,null);
  for(const name of ['position','aUv','aRand'])assert.equal(geometry.getAttribute(name).count,count);
  const pos=geometry.getAttribute('position').array, uv=geometry.getAttribute('aUv').array;
  for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
    const i=y*grid+x;
    assert(Math.abs(pos[i*3]-((x/(grid-1)-.5)*4.8))<1e-6);
    assert(Math.abs(pos[i*3+1]-((y/(grid-1)-.5)*4.8))<1e-6);
    assert(Math.abs(uv[i*2]-(x+.5)/grid)<1e-6);
    assert(Math.abs(uv[i*2+1]-(y+.5)/grid)<1e-6);
  }
}
test('default cover detail: high keeps the authored grid; lower tiers and glow draw complete smaller grids',()=>{
  const c=particleContext(1.55), original=c.geo, seeds=original.getAttribute('aRand');
  let disposed=0;original.addEventListener('dispose',()=>disposed++);
  for(let repeat=0;repeat<3;repeat++)for(const quality of ['eco','balanced','high','ultra']){
    c.fx.performanceQuality=quality;c.applyCoverParticleQualityBudget();
    const main=c.particles.geometry, glow=c.bloomParticles.geometry;
    assertRegularGrid(main);assertRegularGrid(glow);
    const grid={eco:97,balanced:127,high:183,ultra:183}[quality];
    assert.equal(main.userData.grid,grid);
    assert.equal(c.coverParticleCountLabel(1.55),grid+'x'+grid);
    assert.equal(c.fx.coverResolution,1.55);
    if(quality==='high'||quality==='ultra'){assert.equal(main,original);assert.equal(main.getAttribute('aRand'),seeds);assert.equal(c.uniforms.uGridPointScale.value,1);}
    else assert(c.uniforms.uGridPointScale.value>1);
    if(quality==='ultra')assert.equal(glow,main);
    else assert(glow.userData.count<main.userData.count*.55);
    // Glow points widen with the spacing so the glow stays one continuous area.
    assert(Math.abs(c.uniforms.uBloomDensitySize.value-grid/glow.userData.grid)<1e-12);
  }
  assert.equal(disposed,0);
});

test('a user-chosen cover detail is kept in every quality tier',()=>{
  for(const resolution of [.75,.9,1,1.1,1.32]){
    const c=particleContext(resolution), original=c.geo;
    for(const quality of ['eco','balanced','high','ultra']){
      c.fx.performanceQuality=quality;c.applyCoverParticleQualityBudget();
      assert.equal(c.particles.geometry,original);
      assert.equal(c.coverParticleCountLabel(resolution),original.userData.grid+'x'+original.userData.grid);
      assert.equal(c.uniforms.uGridPointScale.value,1);
      assert.equal(c.coverTextureSizeForResolution(resolution),resolution>=1.32?512:(resolution>=1.1?384:256));
    }
  }
});

test('explicit resolution edit while eco keeps the new custom detail and releases old geometries', () => {
  const c = particleContext(1.55, 'eco');
  const full = c.geo, low = c.particles.geometry, glow = c.bloomParticles.geometry;
  let released = 0;
  for (const g of [full, low, glow]) g.addEventListener('dispose', () => released++);
  c.applyCoverParticleResolution(1.32, { reload: false });
  assert.equal(released, 3); assert.equal(c.fx.coverResolution, 1.32);
  assert.equal(c.particles.geometry, c.geo); assert.equal(c.geo.userData.grid, 157);
  c.fx.performanceQuality = 'ultra'; c.applyCoverParticleResolution(1.32, { reload: false });
  assert.equal(c.particles.geometry.userData.grid, 157); assert.equal(c.bloomParticles.geometry, c.geo);
});

test('1080p / 1440p quality and DPR matrix keeps bounded pixels with a floor against blur', () => {
  const source = read('public/js/modules/01-scene/00-renderer-quality.js').split('var renderer =')[0];
  for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
    for (const dpr of [1, 1.25, 1.5, 2]) for (const lowSpec of [false, true]) {
      for (const quality of ['eco', 'balanced', 'high', 'ultra']) {
        const c = particleContext(1.32, quality);
        Object.assign(c, { innerWidth: width, innerHeight: height, window: { devicePixelRatio: dpr }, runtimeHardwareProfile: { lowSpec } });
        vm.runInContext(source, c);
        const caps = { eco: lowSpec ? .88 : .95, balanced: lowSpec ? .98 : 1.12, high: lowSpec ? 1.05 : 1.20, ultra: 2 };
        const mins = { eco: lowSpec ? .72 : .78, balanced: .85, high: lowSpec ? .66 : .72, ultra: .5 };
        const budgets = { eco: lowSpec ? 1900000 : 2400000, balanced: lowSpec ? 2800000 : 3800000, high: lowSpec ? 3200000 : 4600000, ultra: Infinity };
        const floor = Math.min(mins[quality], Math.sqrt(budgets[quality] * 1.5 / (width * height)));
        const expected = Math.max(floor, Math.min(dpr, caps[quality], Math.sqrt(budgets[quality] / (width * height))));
        assert(Math.abs(c.getRenderPixelRatio() - expected) < 1e-12);
        assert.equal(c.fx.coverResolution, 1.32);
        assert.equal(c.particles.geometry.userData.count, 24649);
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
