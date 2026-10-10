'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { loadFunctions } = require('./helpers/classic-functions');
const playback = 'public/js/modules/05-playback/13-playback-start-audio.js';
const disk = 'public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js';
const output = 'public/js/modules/05-playback/00-api-quality-output.js';
const flush = () => new Promise(setImmediate);
function gate() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function beatFixture() {
  const pending = gate(), events = [], song = { id:'A', provider:'qq' };
  const c = vm.createContext({ Promise, console: { warn() {} }, Date, encodeURIComponent, audio:{ src:'fixture', currentTime:2, paused:true },
    trackSwitchToken:4, beatMapToken:8, beatMapCache:{}, playQueue:[song], currentIdx:0, currentBeatMap:null,
    queueItemKey:s=>s.id, songProviderKey:s=>s.provider, auth:'account-A', playbackQualityAuthorizationKey:()=>c.auth,
    ensureBeatDiskCacheStatus:async()=>({enabled:true}), apiJson:()=>pending.promise,
    unpackLocalBeatMap:x=>x, updateBeatDiskCacheStatus(){}, applyCinemaProfileFromBeatMap:m=>events.push(['profile',m]),
    syncBeatMapPlaybackCursor:(time,momentum)=>events.push(['cursor',time,momentum]), notifyDesktopLyricsBeatMapReady:()=>events.push(['notify']),
    scheduleQueueBeatPrefetch:()=>events.push(['prefetch']), scheduleBeatAnalysis:()=>events.push(['analysis']) });
  vm.runInContext(fs.readFileSync('public/js/modules/00-state/03-beat-dj-state.js', 'utf8').split('var targetVolume')[0], c);
  c.beatMapCache = c.createBeatMapMemoryCache();
  loadFunctions(c, disk, ['readBeatDiskCache']); loadFunctions(c, playback, ['schedulePlaybackBeatCacheRestore']);
  const options={key:'qq:A',song,index:0,media:c.audio,trackToken:4,beatToken:8,proxyUrl:'fixture',preserveMomentum:false};
  return {c,options,pending,events};
}
test('audio start does not await disk lookup; late map uses the advancing media clock', async()=>{
  const f=beatFixture(), job=f.c.schedulePlaybackBeatCacheRestore(f.options); await flush();
  f.events.push(['play']); assert.deepEqual(f.events,[['play']], 'unresolved disk lookup does not gate caller continuation');
  f.c.audio.currentTime=7.25; const map={kicks:[1,2]}; f.pending.resolve({hit:true,map});
  assert.equal(await job,true); assert.equal(f.c.currentBeatMap,map);
  assert.deepEqual(f.events[2],['cursor',7.25,true]);
  const source=fs.readFileSync(playback,'utf8');
  assert.doesNotMatch(source,/await\s+readBeatDiskCache/);
  assert.doesNotMatch(source,/await\s+schedulePlaybackBeatCacheRestore/);
  assert.ok(source.indexOf('schedulePlaybackBeatCacheRestore({ key: bmKey') < source.indexOf("markPlayPhase('audio-start')"));
});
for(const [label, mutate] of [
  ['track token', c=>c.trackSwitchToken++], ['beat token',c=>c.beatMapToken++],
  ['media identity',c=>c.audio={src:'other',currentTime:0}], ['media source',c=>c.audio.src='replacement'], ['queue identity',c=>c.playQueue=[{id:'A'}]],
  ['song identity',c=>c.playQueue[0]={id:'B'}], ['cache identity',c=>c.beatMapCache={}],
  ['account authorization',c=>c.auth='account-B']
]) test('late disk data cannot publish after '+label+' changes',async()=>{
  const f=beatFixture(), cache=f.c.beatMapCache, job=f.c.schedulePlaybackBeatCacheRestore(f.options); await flush();
  mutate(f.c); f.pending.resolve({hit:true,map:{kicks:[9]}}); assert.equal(await job,false);
  assert.equal(cache['qq:A'],undefined); assert.equal(f.c.currentBeatMap,null); assert.deepEqual(f.events,[]);
  assert.equal(f.c.beatMapCacheObservers.get(cache).size,0);
});
test('miss and failed disk API preserve deferred analysis without rejecting playback work',async()=>{
  for(const fail of [false,true]) { const f=beatFixture(), job=f.c.schedulePlaybackBeatCacheRestore(f.options); await flush();
    if(fail) f.pending.reject(new Error('disk unavailable')); else f.pending.resolve({hit:false});
    assert.equal(await job,false); assert.deepEqual(f.events,[['analysis']]); }
});
function outputFixture() {
  const calls=[], targets=[];
  function target(label) { const t={sinkId:'',state:'running',async setSinkId(id){calls.push([label,id]);this.sinkId=id;}}; targets.push(t); return t; }
  const c=vm.createContext({Promise,console:{warn(){}},audioOutputApplyQueue:Promise.resolve(),audioOutputSinkEpoch:0,audioOutputSinkApplications:new WeakMap(),
    audioOutputDeviceId:'A',audioOutputDeviceById:id=>['A','B'].includes(id),audioCtx:target('ctx'),uiSfxCtx:target('sfx'),audioReady:true,gainNode:{},
    bindAudioOutputMirrorEvents(){},syncAudioOutputMirrors(){},renderAudioOutputDeviceUi(){}});
  const media=target('media');loadFunctions(c,output,['invalidateAudioOutputSinkApplications','applyAudioOutputDevice','applyAudioOutputDeviceNow']);
  return {c,calls,media,target,targets};
}
test('three identical sink applications make three calls instead of nine, verified on actual targets',async()=>{
  const f=outputFixture(); await Promise.all([f.c.applyAudioOutputDevice(f.media),f.c.applyAudioOutputDevice(f.media),f.c.applyAudioOutputDevice(f.media)]);
  assert.deepEqual(f.calls,[['media','A'],['ctx','A'],['sfx','A']]);
  f.media.sinkId='external'; await f.c.applyAudioOutputDevice(f.media); assert.deepEqual(f.calls.at(-1),['media','A']); assert.equal(f.calls.length,4);
});
test('queued manual device selections keep A then B even before the queue begins',async()=>{
  const f=outputFixture(), a=f.c.applyAudioOutputDevice(f.media);f.c.audioOutputDeviceId='B';const b=f.c.applyAudioOutputDevice(f.media);
  await Promise.all([a,b]);assert.deepEqual(f.calls,[['media','A'],['ctx','A'],['sfx','A'],['media','B'],['ctx','B'],['sfx','B']]);
});
test('device invalidation, replaced target, failed sink, and unverified sink never incorrectly skip',async()=>{
  const f=outputFixture();await f.c.applyAudioOutputDevice(f.media);f.c.invalidateAudioOutputSinkApplications();await f.c.applyAudioOutputDevice(f.media);assert.equal(f.calls.length,6);
  const replacement=f.target('new'); await f.c.applyAudioOutputDevice(replacement);assert.equal(f.calls.length,7);
  let attempts=0;replacement.sinkId='';replacement.setSinkId=async id=>{attempts++;if(attempts===1)throw new Error('offline');replacement.sinkId=id;};
  await f.c.applyAudioOutputDevice(replacement);await f.c.applyAudioOutputDevice(replacement);assert.equal(attempts,2);
  const unverified={setSinkId:async()=>attempts++};await f.c.applyAudioOutputDevice(unverified);await f.c.applyAudioOutputDevice(unverified);assert.equal(attempts,4);
});
test('in-flight device invalidation cannot certify the old application in the new epoch',async()=>{
  const f=outputFixture(), wait=gate();let times=0;
  f.media.setSinkId=async id=>{times++;if(times===1)await wait.promise;f.media.sinkId=id;};
  const old=f.c.applyAudioOutputDevice(f.media);await flush();f.c.invalidateAudioOutputSinkApplications();wait.resolve();await old;
  await f.c.applyAudioOutputDevice(f.media);assert.equal(times,2);
});
function panelFixture(){
 const calls=[], body={html:'',contains:()=>false,addEventListener(){},set innerHTML(v){calls.push('body');this.html=v;}}, list={set innerHTML(v){calls.push('summary');this.html=v;}}, modal={visible:false,classList:{contains:()=>modal.visible}};
 const elements={'audio-output-list':list,'audio-output-workflow-body':body,'audio-output-workflow-modal':modal};
 const c=vm.createContext({document:{getElementById:id=>elements[id]||null,activeElement:null},audioRouteVisibleIds:()=>[],effectiveAudioPrimaryId:()=>c.audioOutputDeviceId,
  audioOutputDeviceStatusText:()=>c.audioOutputDeviceId,audioOutputMirrorConfirmedCount:()=>0,escHtml:String,audioOutputDeviceId:'A',audioOutputDevices:[],
  audioRouteSetting:()=>({name:'fixture',volume:100,delay:0,muted:false}),audioOutputDeviceLabel:d=>d.label,isVirtualMicOutputDevice:()=>false,
  audioOutputMirrorRuntimeFor:()=>null,audioOutputMirrorStatusText:()=>'',audioRouteWorkflowDrag:null,mountMicrophoneMixerPanel:()=>calls.push('mixer'),
  requestAnimationFrame:()=>calls.push('frame'),renderAudioRouteWorkflowEdges(){},openGsapModal:()=>{modal.visible=true;},bindAudioOutputControls(){},refreshAudioOutputDevices(){}});
 loadFunctions(c,output,['renderAudioOutputDeviceUi','openAudioOutputWorkflowPanel']);return {c,calls,body,list,modal};
}
test('hidden route panel does zero body rebuilds, and opening rebuilds latest state',()=>{
 const f=panelFixture();f.c.renderAudioOutputDeviceUi();f.c.audioOutputDeviceId='B';f.c.renderAudioOutputDeviceUi();
 assert.deepEqual(f.calls,['summary','summary']);assert.match(f.list.html,/B/);
 f.c.openAudioOutputWorkflowPanel();assert.equal(f.calls.filter(x=>x==='body').length,1);assert.equal(f.calls.filter(x=>x==='mixer').length,1);assert.match(f.body.html,/data-output-primary="B"/);
});
test('visible route controls preserve focused input until focusout refresh',()=>{
 const f=panelFixture();f.modal.visible=true;f.body.contains=()=>true;f.c.document.activeElement={matches:()=>true};
 f.c.renderAudioOutputDeviceUi();assert.deepEqual(f.calls,['summary']);
 f.body.contains=()=>false;f.c.renderAudioOutputDeviceUi();assert.equal(f.calls.filter(x=>x==='body').length,1);
});

test('an edited map wins over in-flight disk data and observed key metadata is released',async()=>{
 const f=beatFixture(), job=f.c.schedulePlaybackBeatCacheRestore(f.options);await flush();
 assert.equal(f.c.beatMapCacheObservers.get(f.c.beatMapCache).size,1);
 const edited={kicks:[77],edited:true};f.c.beatMapCache['qq:A']=edited;
 f.pending.resolve({hit:true,map:{kicks:[1]}});assert.equal(await job,true);
 assert.equal(f.c.beatMapCache['qq:A'],edited);assert.equal(f.c.currentBeatMap,edited);
 assert.equal(f.c.beatMapCacheObservers.get(f.c.beatMapCache).size,0);
 assert.deepEqual(Object.keys(f.c.beatMapCache),['qq:A']);
});
test('an already-active edited map is never replaced or profiled again by the disk completion',async()=>{
 const f=beatFixture(), job=f.c.schedulePlaybackBeatCacheRestore(f.options);await flush();
 const edited={kicks:[77]};f.c.currentBeatMap=edited;f.c.beatMapCache['qq:A']=edited;
 f.pending.resolve({hit:true,map:{kicks:[1]}});assert.equal(await job,false);assert.equal(f.c.currentBeatMap,edited);assert.deepEqual(f.events,[]);
});
test('deleting an observed key cancels a late read, including failure, without repopulating or scheduling analysis',async()=>{
 for(const fail of [false,true]) { const f=beatFixture(), job=f.c.schedulePlaybackBeatCacheRestore(f.options);await flush();
  delete f.c.beatMapCache['qq:A'];
  if(fail) f.pending.reject(new Error('late failure'));else f.pending.resolve({hit:true,map:{kicks:[1]}});
  assert.equal(await job,false);assert.equal(f.c.beatMapCache['qq:A'],undefined);assert.deepEqual(f.events,[]);
  assert.equal(f.c.beatMapCacheObservers.get(f.c.beatMapCache).size,0);
 }
});
test('cache observation tickets release after hit, miss and read rejection',async()=>{
 for(const result of ['hit','miss','reject']) { const f=beatFixture(), job=f.c.schedulePlaybackBeatCacheRestore(f.options);await flush();
  if(result==='reject')f.pending.reject(new Error('read failed'));else f.pending.resolve({hit:result==='hit',map:{kicks:[]}});
  await job;assert.equal(f.c.beatMapCacheObservers.get(f.c.beatMapCache).size,0);
 }
});
test('cache mutation tickets are key-local, invalidate on set/delete/LRU trim, and never enter serialization',()=>{
 const f=beatFixture(), cache=f.c.createBeatMapMemoryCache(8192,1);
 cache.A={kicks:[1]};const a=f.c.observeBeatMapCacheKey(cache,'A'), b=f.c.observeBeatMapCacheKey(cache,'B');
 cache.B={kicks:[2]};assert.equal(a.valid,false,'LRU removal invalidates A');assert.equal(b.valid,false,'set invalidates B');
 a.release();b.release();assert.equal(f.c.beatMapCacheObservers.get(cache).size,0);
 const current=f.c.observeBeatMapCacheKey(cache,'B'), absent=f.c.observeBeatMapCacheKey(cache,'C');
 delete cache.C;assert.equal(absent.valid,false);assert.equal(current.valid,true);
 assert.equal(JSON.stringify(cache),'\{"B":{"kicks":[2]}\}');current.release();absent.release();
 assert.equal(f.c.beatMapCacheObservers.get(cache).size,0);
});
test('actual refresh/retry/disconnect entry points invalidate prior sink verification',async()=>{
 const f=outputFixture();f.c.audio=f.media;
 Object.assign(f.c,{navigator:{mediaDevices:{enumerateDevices:async()=>[{kind:'audiooutput',deviceId:'A',label:'speaker'}]}},
  clearAudioOutputMirrors(){},saveAudioOutputMirrorPreference(){},saveAudioInputBridgePreference(){}});
 loadFunctions(f.c,output,['refreshAudioOutputDevices','retryAudioRoutes','disconnectAdditionalAudioRoutes']);
 await f.c.applyAudioOutputDevice(f.media);assert.equal(f.calls.length,3);
 await f.c.refreshAudioOutputDevices(false);assert.equal(f.calls.length,6);
 f.c.retryAudioRoutes();await f.c.audioOutputApplyQueue;assert.equal(f.calls.length,9);
 f.c.disconnectAdditionalAudioRoutes();await f.c.applyAudioOutputDevice(f.media);assert.equal(f.calls.length,12);
});
test('offline/reconnect keeps chosen primary but forces default then selected hardware',async()=>{
 const f=outputFixture();f.c.audio=f.media;let devices=[{kind:'audiooutput',deviceId:'A',label:'speaker'}];
 f.c.navigator={mediaDevices:{enumerateDevices:async()=>devices}};f.c.audioOutputDevices=devices;
 loadFunctions(f.c,output,['audioOutputDeviceById','refreshAudioOutputDevices']);
 await f.c.applyAudioOutputDevice(f.media);devices=[];await f.c.refreshAudioOutputDevices(false);
 assert.equal(f.c.audioOutputDeviceId,'A');assert.equal(f.media.sinkId,'');
 devices=[{kind:'audiooutput',deviceId:'A',label:'speaker'}];await f.c.refreshAudioOutputDevices(false);
 assert.equal(f.media.sinkId,'A');assert.equal(f.calls.length,9);
});
test('full-track beat prefetch excludes explicitly unknown source extent in both URL paths but preserves legacy responses',async()=>{
 for(const resolverAvailable of [true,false]) {
  let response;
  const c=vm.createContext({Promise,encodeURIComponent,songProviderKey:s=>s.provider,
   normalizePlaybackQualityForProvider:()=> 'hires',getPlaybackQualityForSong:()=> 'hires',playbackQualityCapValue:()=>'',playbackQualityAboveCap:()=>false,
   apiJson:async()=>response});
  if(resolverAvailable)c.resolveAlbumGaplessPlaybackData=async()=>response;
  loadFunctions(c,disk,['fetchBeatPrefetchAudioUrl']);
  for(const trial of [null,false]) {
   response={url:'fixture',trialKnown:false,trial,sourceDuration:0,duration:240};
   assert.equal(await c.fetchBeatPrefetchAudioUrl({id:'A',provider:'qq'}),null);
  }
  response={url:'fixture',trialKnown:true,trial:true};assert.equal(await c.fetchBeatPrefetchAudioUrl({id:'A',provider:'qq'}),null);
  for(const responseValue of [{url:'fixture',trialKnown:true,trial:false},{url:'fixture',trial:false},{url:'fixture'}]) {
   response=responseValue;assert.equal(await c.fetchBeatPrefetchAudioUrl({id:'A',provider:'qq'}),'/api/audio?url=fixture');
  }
 }
});
