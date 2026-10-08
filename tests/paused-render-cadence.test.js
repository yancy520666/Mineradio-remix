'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/modules/11-main-loop.js'), 'utf8');
function extract(name) { const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}\n',start);return source.slice(start,end+3); }
function fixture() {
 const c={fx:{foregroundFpsMode:'vsync',preset:0},playing:false,audio:{paused:true},window:{},performance:{now:()=>100},
  isDeepBackgroundMode:()=>false,normalizeForegroundFpsMode:v=>v,foregroundFixedFpsForMode:v=>/^\d+$/.test(v)?Number(v):v==='vsync'?0:null,
  RENDER_VISIBLE_VSYNC:true,isRenderInteractionActive:()=>false,mainLoopInteractionActive:()=>false,visibleMotionFollowVsync:()=>false,capMainLoopFpsForBudget:v=>v,SKULL_PRESET_INDEX:4};
 vm.createContext(c);
 vm.runInContext(['getAdaptiveRenderFps','resolveAdaptiveRenderCadence','shouldSkipFixedRenderCadenceFrame','targetMainStageLyricsFps','targetMainLyricsParticleFps'].map(extract).join('\n'),c);
 return c;
}
test('paused foreground defaults to 60 and respects lower saved rates without changing the preference',()=>{
 const c=fixture();
 for(const [mode,target] of [['vsync',60],['adaptive',60],['30',30],['45',45],['60',60],['120',60]]){
  c.fx.foregroundFpsMode=mode;assert.equal(c.getAdaptiveRenderFps(100),target);assert.equal(c.fx.foregroundFpsMode,mode);
  assert.equal(c.resolveAdaptiveRenderCadence(100,mode),null);
 }
 assert.equal(c.targetMainStageLyricsFps(100),60);assert.equal(c.targetMainLyricsParticleFps(100),60);
 c.fx.foregroundFpsMode='vsync';c.playing=true;c.audio.paused=false;assert.equal(c.getAdaptiveRenderFps(100),0);
 c.isDeepBackgroundMode=()=>true;assert.equal(c.getAdaptiveRenderFps(100),1);
});
test('paused interaction such as opening the shelf renders like playback',()=>{
 const c=fixture();c.isRenderInteractionActive=()=>true;
 for(const [mode,target] of [['vsync',0],['adaptive',0],['30',30],['120',120]]){
  c.fx.foregroundFpsMode=mode;assert.equal(c.getAdaptiveRenderFps(100),target);
 }
});
test('60 and 45 FPS background caps keep their cadence on a 144 Hz UI clock',()=>{
 const c=fixture();
 for(const target of [45,60]){
  const state={};let frames=0;
  for(let i=0;i<1440;i++)if(!c.shouldSkipFixedRenderCadenceFrame(state,100+i*1000/144,target,144,String(target)))frames++;
  assert(Math.abs(frames-target*10)<=1, `${target}: ${frames}`);
 }
});
