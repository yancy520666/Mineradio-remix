'use strict';
// Deterministic policy math using production functions. No GPU/browser timing.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const rel='public/js/modules/01-scene/00-renderer-quality.js';
const current=fs.readFileSync(path.join(root,rel),'utf8').split('var renderer =')[0];
const baseline=cp.execFileSync('git',['show','a746952:'+rel],{cwd:root,encoding:'utf8'}).split('var renderer =')[0];
function run(source,width,height,dpr,tier,lowSpec){const c={fx:{performanceQuality:tier},innerWidth:width,innerHeight:height,window:{devicePixelRatio:dpr},runtimeHardwareProfile:{lowSpec},normalizePerformanceQuality:v=>v,THREE:{Scene:function(){},PerspectiveCamera:function(){}}};vm.runInNewContext(source,c);return {ratio:c.getRenderPixelRatio(),pixels:c.getRenderPixelLoad(),budget:c.renderQualityProfile().budget};}
const rows=[];
for(const [width,height] of [[1920,1080],[2560,1440]]) for(const dpr of [1,1.25,1.5,2]) for(const quality of ['eco','balanced','high','ultra']) for(const lowSpec of [false,true]){
const before=run(baseline,width,height,dpr,quality,lowSpec),after=run(current,width,height,dpr,quality,lowSpec);
assert.deepEqual(after,before,'render pixel policy must remain unchanged');
rows.push({width,height,dpr,quality,lowSpec,...after,unchanged:true});
}
const output={kind:'synthetic-policy-math-not-gpu-performance',baseline:'a746952',scope:'1920x1080 and 2560x1440 CSS pixels, DPR 1/1.25/1.5/2, four quality tiers and both hardware flags',cases:rows.length,allUnchanged:true,rows};
fs.writeFileSync(path.join(__dirname,'quality-matrix.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({cases:rows.length,allUnchanged:true}));
