const fs=require('fs'), vm=require('vm');
const path=require('path'), cp=require('child_process');
const root=path.resolve(__dirname,'../..');
const baseline=process.argv.includes('--baseline');
const baseCommit='a746952de73ed3e326d3f5b343a0bafc8e6efca7';
const read=p=>baseline ? cp.execFileSync('git',['show',baseCommit+':'+p],{cwd:root,encoding:'utf8'}) : fs.readFileSync(path.join(root,p),'utf8');
const extract=(s,name,next)=>s.slice(s.indexOf('function '+name+'('),next?s.indexOf('function '+next+'(',s.indexOf('function '+name+'(')+1):undefined);
const result={variant:baseline?'baseline '+baseCommit:'working tree',note:'Exact production function/excerpt executed with controlled fake data; counts only, no browser/GPU/FPS measurement.'};
// Real pointer auto-hide handler, visible normal and DIY controls, pointer away from UI.
for(const diy of [false,true]) {
 let reads=0,hides=0,frame=null;
 const el={classList:{contains:()=>true},getBoundingClientRect:()=>{reads++;return {left:0,right:10,top:0,bottom:10}},matches:()=>false};
 const c={controlsPointerFrame:0,controlsPointerPending:null,requestAnimationFrame:fn=>{frame=fn;return 1},cancelAnimationFrame:()=>{frame=null},document:{body:{classList:{contains:()=>false}},getElementById:()=>el},isBottomControlsSuppressedForShelf:()=>false,controlsAutoHide:true,diyPlayerMode:diy,miniQueueOpen:false,performance:{now:()=>100},scheduleControlsHide:()=>hides++,revealBottomControls:()=>{},wakeBottomHandle:()=>{}};
 vm.createContext(c);
 const pointerSource=read('public/js/modules/01-scene/04-bottom-controls-cursor.js');
 const pointerStart=pointerSource.indexOf(baseline?'function updateControlsAutoHideFromPointer(':'var controlsPointerFrame =');
 vm.runInContext(pointerSource.slice(pointerStart,pointerSource.indexOf('function toggleControlsAutoHide(')),c);
 for(let i=0;i<1000;i++) (baseline?c.updateControlsAutoHideFromPointer:c.queueControlsAutoHideFromPointer)(100,100);
 if(frame)frame();
 result['pointer_'+(diy?'DIY':'normal')]={events:1000,layoutReads:reads,hideSchedulingCalls:hides};
}
// Exact invisible spark update excerpt: off switch, zero opacity.
{
 const source=read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');
 const start=source.indexOf('      if (data.sparks && data.sparkMat) data.sparks.visible');
 const end=source.indexOf('      return true;',start);
 let trig=0,uploads=0;
 const math=Object.create(Math);math.sin=x=>{trig++;return Math.sin(x)};math.cos=x=>{trig++;return Math.cos(x)};
 const pos={array:new Float32Array(132*3),set needsUpdate(v){if(v)uploads++}};
 const c={Math:math,data:{sparks:{geometry:{attributes:{position:pos}},rotation:{z:0,x:0}},sparkMat:{},basePositions:new Float32Array(396)},fx:{lyricGlowParticles:false},editPreview:false,getLyricSparkOpacity:()=>0,stageLyrics:{beatGlow:0},dt:1/60,t:1,seed:1,bass:0,mid:0};
 vm.createContext(c);for(let i=0;i<60;i++)vm.runInContext(source.slice(start,end),c);
 result.hiddenSparks={frames:60,points:132,visible:c.data.sparks.visible,trigonometricCalls:trig,positionNeedsUpdateWrites:uploads,floatComponentWrites:132*3*uploads};
}
// Real whole-row updater with minimal settled primary meshes, all textures ready.
{
 let transforms=0;
 const c={console,performance:{now:()=>1000},fx:{lyricLiveViewportFit:false},stageLyrics:{shelfLayoutMix:0},lyricsLines:Array(200).fill({}),clampRange:(v,a,b)=>Math.max(a,Math.min(b,v)),normalizeLyricTranslationMode:()=> 'off',normalizeLyricDisplayMode:()=> 'three',lyricTranslationOpacityValue:()=>1,lyricPrimaryVirtualIndex:x=>x,lyricMeshLineStepWorld:()=>1,lyricBackdropAdaptActive:()=>false,lyricTextureClarityScale:()=>1,lyricDisplayOffsetsForMode:()=>[-1,0,1],lyricLineAllowedForDisplayMode:(i,t)=>Math.abs(i-t)<=1,lyricRowTextReadyForDisplay:()=>true,registerLyricQualityCandidates:()=>{},lyricQualityState:{deferFinalize:true},updateLyricQualityStats:()=>{},lyricTrackFarFollowScale:()=>1,lyricTrackGlideOffset:()=>null};
 vm.createContext(c);vm.runInContext(read('public/js/modules/02-visual/12-lyrics-row-layers.js').slice(read('public/js/modules/02-visual/12-lyrics-row-layers.js').indexOf('function updateLyricRowLayers(')),c);
 const rows=Array.from({length:200},(_,i)=>({lineIndex:i,virtualIndex:i,isPrimary:true,targetAlpha:.5,renderLineUploaded:true,mesh:{visible:false,position:{x:0,y:50-i,z:0},scale:{x:1,y:1,z:1,setScalar(v){this.x=this.y=this.z=v;transforms++;}}},mat:{opacity:0},viewportFitScale:1}));
 const data={rowLayers:rows,usesTrack:true,trackPersistent:true,trackScrollPrimed:true,renderInitialTextReady:true,trackScrollOffset:50,trackTargetLineIndex:50,trackTargetVirtualIndex:50};
 c.data=data;c.opts={opacity:1,deltaTime:1/60,motionBlend:1};
 try { for(let frame=0;frame<350;frame++)vm.runInContext('updateLyricRowLayers(data,opts)',c); transforms=0; vm.runInContext('updateLyricRowLayers(data,opts)',c);result.lyricRows={rows:200,visibleRows:rows.filter(r=>r.mesh.visible).length,scaleSetCalls:transforms,settleFrames:350,scope:'Stationary t=0 settled scale only; all rows keep full motion/state calculations'}; }catch(e){result.lyricRowsError=e.stack;}
}
// Existing synchronous wake handler invoked by a native restore, visibility, then focus.
{
 let renders=0,rafs=0,cancels=0; const context={isContextLost:()=>false};
 const c={performance:{now:()=>100},mainLoopWakeRenderState:null,mainLoopBackgroundTimer:0,mainLoopAnimationRequested:false,mainLoopAnimationFrameId:0,mainLoopDeepBackgroundSleeping:()=>false,renderer:{getContext:()=>context,render:()=>renders++},scene:{},camera:{},cancelAnimationFrame:()=>cancels++,requestMainLoopAnimationFrame(){c.mainLoopAnimationRequested=true;c.mainLoopAnimationFrameId=++rafs;}};
 vm.createContext(c);vm.runInContext(extract(read('public/js/modules/11-main-loop.js'),baseline?'wakeMainLoopFromBackground':'mainLoopWakeCameraSignature','tickDeepBackgroundFrame'),c);
 for(let i=0;i<3;i++)c.wakeMainLoopFromBackground();
 result.wakeBurst={calls:3,synchronousRenders:renders,rafRequests:rafs,cancelledRafs:cancels};
}
console.log(JSON.stringify(result,null,2));
