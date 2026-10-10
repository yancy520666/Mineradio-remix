'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../public/vendor/three.r128.min.js');
const policy = require('../public/sonic-performance-policy');
function legacy(quality, reduction) {
 const t = Math.max(0, ['eco','balanced','high','ultra'].indexOf(quality)+1-reduction), l=Math.floor(t),h=Math.ceil(t),b=t-l;
 const mix=a=>a[l]+(a[h]-a[l])*b;
 return {tier:t, gridSize:Math.round(mix([80,112,160,224,320])),dpr:mix([.7,.9,1.1,1.35,2]),pixels:h===4?Infinity:mix([1300000,1800000,2800000,4000000,Infinity]),fps:0,floatingCount:Math.round(mix([8,20,40,60,100]))};
}
function legacyRatio(p,w,h,d) {
 const base=Math.min(2,Math.max(1,d)); if(!p)return base;
 if(p.tier%1){const caps=[.7,.9,1.1,1.35,2],budgets=[1300000,1800000,2800000,4000000,Infinity];const r=t=>Math.min(base,caps[t],Math.sqrt(budgets[t]/(w*h)));const l=Math.floor(p.tier);return r(l)+(r(Math.ceil(p.tier))-r(l))*(p.tier-l);}
 return Math.min(base,p.dpr,Math.sqrt(p.pixels/(w*h)));
}
test('64 viewport/scale/profile cases never increase budgets; all ultra adaptive profiles remain exact',()=>{
 let cases=0;
 for(const [w,h] of [[1920,1080],[2560,1440]]) for(const d of [1,1.25,1.5,2]) for(const managed of [false,true]) for(const q of ['eco','balanced','high','ultra']) {
  cases++;
  for(let reduction=0;reduction<=4;reduction+=.125){
   const old=managed?legacy(q,reduction):null, now=policy.profile(q,managed,reduction);
   if(!managed){assert.equal(now,null);continue;}
   for(const key of ['gridSize','dpr','pixels','floatingCount'])assert(now[key]<=old[key],q+' '+key);
   assert.equal(now.fps,0);const actual=policy.pixelRatio(now,w,h,d),expected=legacyRatio(old,w,h,d);
   assert(actual<=expected+1e-12,q+' actual ratio');
   if(q==='ultra'){assert.deepEqual(now,old);assert(Math.abs(actual-expected)<1e-12);}
  }
 }
 assert.equal(cases,64);
});
test('fractional explicit profile caps cannot be bypassed by legacy interpolation',()=>{
 const explicit={tier:2.5,dpr:.6,pixels:700000};
 const actual=policy.pixelRatio(explicit,2560,1440,2);
 assert(actual<=.6);assert(actual**2*2560*1440<=700000+1e-6);
});
test('high stable subset uses shared source attributes and restores original ultra with no reseeding',()=>{
 const src=fs.readFileSync('public/js/modules/02-visual/00-pointer-cover-particles.js','utf8');
 const helper=fs.readFileSync('public/js/modules/02-visual/04-visual-settings-persistence.js','utf8');
 for(const resolution of [.75,.9,1,1.1,1.32,1.55]){
  const c=vm.createContext({THREE,fx:{coverResolution:resolution,performanceQuality:'high'},particles:{},bloomParticles:{},uniforms:{uBurstAmt:{value:0}}});
  vm.runInContext(helper.slice(0,helper.indexOf('var currentFxAutosaveDiskTimer')),c);
  vm.runInContext(src.slice(src.indexOf('var PLANE_SIZE ='),src.indexOf('// 涟漪数据纹理')),c);
  const original=c.geo;let disposed=0;original.addEventListener('dispose',()=>disposed++);
  for(let n=0;n<3;n++)for(const q of ['eco','balanced','high','ultra']){
   c.fx.performanceQuality=q;c.applyCoverParticleQualityBudget();const selected=c.particles.geometry;
   assert.equal(selected.userData.count,Math.min(c.GRID_X,{eco:97,balanced:127,high:167,ultra:Infinity}[q])**2);
   assert.equal(c.bloomParticles.geometry,selected);assert.equal(c.fx.coverResolution,resolution);
   for(const attr of ['position','aUv','aRand'])assert.equal(selected.getAttribute(attr),original.getAttribute(attr));
   if(selected.index){const idx=Array.from(selected.index.array);assert.equal(new Set(idx).size,idx.length);assert.equal(idx[0],0);assert.equal(idx.at(-1),c.GRID_X**2-1);}
   if(q==='ultra')assert.equal(selected,original);
  }
  assert.equal(disposed,0);
 }
});
test('Topography lower caps keep current simulation and respect stricter managed/user limits',()=>{
 let budget=null;const window={MineradioSonicPerformance:{stageProfile:()=>budget}};
 const source=fs.readFileSync('public/sonic-topography-preset.js','utf8');
 const c=vm.createContext({THREE,window});vm.runInContext(source.replace('global.MineradioSonicTopography = {','global.state = state; global.ensure = ensureLayer; global.MineradioSonicTopography = {'),c);
 const scene=new THREE.Scene(),fx={preset:7,performanceQuality:'ultra',sonicGroundDensity:46,sonicGroundFloatingCount:80};
 window.ensure(scene,fx);const s=window.state,root=s.root,mat=s.terrainMat;s.opacity=.9;s.sonicTime=8;s.autoYaw=.6;s.meteorsData[0].active=true;
 for(const managed of [false,true])for(const quality of ['eco','balanced','high','ultra']){
  fx.performanceQuality=quality;budget=policy.profile(quality,managed,0);window.ensure(scene,fx);
  assert.equal(s.gridSize,{eco:96,balanced:128,high:148,ultra:156}[quality]);assert.equal(s.floatingCount,managed?{eco:20,balanced:40,high:60,ultra:80}[quality]:80);
  assert.equal(s.root,root);assert.equal(s.terrainMat,mat);assert.equal(s.opacity,.9);assert.equal(s.sonicTime,8);assert.equal(s.autoYaw,.6);assert(s.meteorsData[0].active);
 }
 fx.performanceQuality='high';fx.sonicGroundFloatingCount=3;budget={gridSize:80,floatingCount:2};window.ensure(scene,fx);assert.equal(s.gridSize,80);assert.equal(s.floatingCount,2);
 budget=null;window.ensure(scene,fx);assert.equal(s.floatingCount,3);window.MineradioSonicTopography.clear();assert.equal(scene.children.length,0);
});
