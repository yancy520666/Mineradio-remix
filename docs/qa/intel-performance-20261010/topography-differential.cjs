'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),THREE=require(path.join(root,'public/vendor/three.r128.min.js'));
const rel='public/sonic-topography-preset.js';
function fixture(source){let rng=23;const math=Object.create(Math);math.random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
const window={},c=vm.createContext({window,THREE,Math:math});
vm.runInContext(source.replace('global.MineradioSonicTopography = {','global.probe = {state:state, ensureLayer:ensureLayer, update:updateMeteorsAndTrails, meteor:addMeteor}; global.MineradioSonicTopography = {'),c);
const p=window.probe;p.ensureLayer(new THREE.Scene(),{preset:7,performanceQuality:'high'});let matrixWrites=0;
for(const m of [p.state.meteors,p.state.trails]){const original=m.setMatrixAt;m.setMatrixAt=function(...args){matrixWrites++;return original.apply(this,args)}}
p.writes=()=>matrixWrites;return p;}
const before=fixture(cp.execFileSync('git',['show','a746952:'+rel],{cwd:root,encoding:'utf8'})),after=fixture(fs.readFileSync(path.join(root,rel),'utf8'));
assert(after.state.terrain.visible,'terrain must stay visible after initial construction');
let frames=0,activeSlotComparisons=0;
for(let i=0;i<720;i++){const dt=[1/60,1/144,1/30,.05][i%4];for(const p of [before,after]){p.state.sonicTime+=dt;if(i===60||i===180||i===400)p.meteor(.8);p.update(dt)}
assert.deepEqual(JSON.parse(JSON.stringify(after.state.meteorsData)),JSON.parse(JSON.stringify(before.state.meteorsData)));
assert.deepEqual(JSON.parse(JSON.stringify(after.state.trailsData)),JSON.parse(JSON.stringify(before.state.trailsData)));
for(const [mesh,data] of [['meteors','meteorsData'],['trails','trailsData']]){
for(let j=0;j<after.state[data].length;j++){
const a=after.state[mesh].instanceMatrix.array.slice(j*16,j*16+16),b=before.state[mesh].instanceMatrix.array.slice(j*16,j*16+16);
if(after.state[data][j].active){assert.deepEqual(a,b);activeSlotComparisons++}else{assert.equal(a[0],0);assert.equal(a[5],0);assert.equal(a[10],0)}
}
assert.equal(after.state[mesh].visible,after.state[data].some(p=>p.active));
}frames++;}
const result={kind:'deterministic-VM-three-matrix-comparison-not-rendered-image-or-GPU-timing',frames,activeSlotComparisons,baselineMatrixWrites:before.writes(),optimizedMatrixWrites:after.writes(),terrainVisible:after.state.terrain.visible,simulationStateEquivalent:true};
fs.writeFileSync(path.join(__dirname,'topography-differential.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
