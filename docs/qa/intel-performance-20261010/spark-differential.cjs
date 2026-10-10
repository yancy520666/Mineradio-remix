'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),rel='public/js/modules/02-visual/14-stage-lyrics-rendering.js';
function fixture(source){const start=source.indexOf('      if (data.sparks && data.sparkMat) data.sparks.visible'),end=source.indexOf('      return true;',start);let updates=0,trig=0;const math=Object.create(Math);for(const n of ['sin','cos'])math[n]=x=>{trig++;return Math[n](x)};
const pos={array:new Float32Array(396),set needsUpdate(v){if(v)updates++}};
const c={Math:math,performance:{now:()=>c.now},now:0,data:{sparks:{geometry:{attributes:{position:pos}},rotation:{z:0,x:0}},sparkMat:{},basePositions:Float32Array.from({length:396},(_,i)=>Math.sin(i)*.25)},fx:{lyricGlowParticles:false},editPreview:false,getLyricSparkOpacity:()=>c.opacity,opacity:0,stageLyrics:{beatGlow:0},dt:1/60,t:1,seed:1,bass:0,mid:0};vm.createContext(c);return{c,step:()=>vm.runInContext(source.slice(start,end),c),updates:()=>updates,trig:()=>trig};}
const before=fixture(cp.execFileSync('git',['show','a746952:'+rel],{cwd:root,encoding:'utf8'})),after=fixture(fs.readFileSync(path.join(root,rel),'utf8'));let visibleFrames=0;
for(let frame=0;frame<600;frame++){
for(const f of [before,after]){Object.assign(f.c,{dt:[1/60,1/144,1/30,.05][frame%4],t:frame/60,now:frame===310?100000:frame*1000/60,opacity:frame%100>90?.2:0,editPreview:frame>=200&&frame<210,bass:.5,mid:.3});f.c.fx.lyricGlowParticles=frame>=300;f.c.stageLyrics.beatGlow=(frame%20)/20;f.step();}
assert.equal(after.c.data.sparks.visible,before.c.data.sparks.visible);
assert.equal(after.c.data.sparks.rotation.z,before.c.data.sparks.rotation.z,'hidden phase must use baseline delta, not wall time');
if(before.c.data.sparks.visible){visibleFrames++;assert.equal(after.c.data.sparks.rotation.x,before.c.data.sparks.rotation.x);assert.deepEqual(after.c.data.sparks.geometry.attributes.position.array,before.c.data.sparks.geometry.attributes.position.array)}
}
const result={kind:'production-excerpt-VM-not-GPU-timing',frames:600,visibleFrames,baselineTrigCalls:before.trig(),optimizedTrigCalls:after.trig(),baselineAttributeDirtyWrites:before.updates(),optimizedAttributeDirtyWrites:after.updates(),allVisiblePositionsAndRotationEquivalent:true};fs.writeFileSync(path.join(__dirname,'spark-differential.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
