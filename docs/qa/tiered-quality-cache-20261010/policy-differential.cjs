'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process'),assert=require('assert/strict');const root=path.resolve(__dirname,'../../..'),rel='public/sonic-performance-policy.js',baseline='703448ffdfc12f13aecc198e2cb8e2ace810dc6b';
function policy(source){const c={module:{exports:{}},exports:{}};vm.runInNewContext(source,c);return c.module.exports}
const before=policy(cp.execFileSync('git',['show',baseline+':'+rel],{cwd:root,encoding:'utf8'})),after=policy(fs.readFileSync(path.join(root,rel),'utf8'));let cases=0,ultraCases=0;const rows=[];
for(const[w,h]of [[1920,1080],[2560,1440]])for(const dpr of[1,1.25,1.5,2])for(const quality of['eco','balanced','high','ultra'])for(const managed of[false,true])for(let r=0;r<=4;r+=.25){
const a=before.profile(quality,managed,r),b=after.profile(quality,managed,r),ap=before.pixelRatio(a,w,h,dpr),bp=after.pixelRatio(b,w,h,dpr);
assert(bp<=ap+1e-12,`${quality} DPR increased at reduction${r}`);if(a&&b)for(const key of['gridSize','floatingCount','dpr'])assert(b[key]<=a[key],`${quality} ${key} increased`);
if(quality==='ultra'){assert.equal(bp,ap,'ultra pixelRatio changed');if(a&&b)for(const key of Object.keys(a))assert.equal(b[key],a[key],`ultra ${key} changed at reduction${r}`);else assert.equal(b,a);ultraCases++;}
if(r===0&&managed)rows.push({width:w,height:h,dpr,quality,grid:b.gridSize,floating:b.floatingCount,pixelRatio:bp,baselinePixelRatio:ap});cases++;}
const result={kind:'policy-arithmetic-not-real-GPU-FPS',baseline,cases,ultraCases,allBudgetsNonIncreasing:true,ultraOriginalAdaptiveLadderEquivalent:true,managedEndpointRows:rows};fs.writeFileSync(path.join(__dirname,'policy-differential.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({cases,ultraCases,allBudgetsNonIncreasing:true,ultraOriginalAdaptiveLadderEquivalent:true}));
