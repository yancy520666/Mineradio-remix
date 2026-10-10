'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');const no=()=>{};
const local=(id,rank)=>({id:'local:'+id,localKey:id,localFileId:id,type:'local',name:id,_queueOrder:rank});
function fixture({currentLocal=true,available,resolve}={}){
 const a=local('a',2),b={id:'b',mid:'b',provider:'qq',name:'b',_queueOrder:0},c=local('c',1),d=local('d',3),removed=local('removed',4);
 const snapshot={current:currentLocal?a:b,currentIdx:currentLocal?0:1,currentTime:40,duration:100,playMode:'shuffle',queue:[a,b,c,removed]};
 const saves=[];const context=vm.createContext({window:{desktopWindow:{listLocalMusicLibrary:async()=>({ok:true,tracks:(available||[a,c,d]).map(s=>({...s,localUrl:'fixture:'+s.name}))}),resolveLocalMusicTrack:resolve|| (async id=>id==='c'?{...c,localMissing:true,localUrl:'offline:c'}:null)}},
  restoredLastPlaybackSnapshot:null,readLastPlaybackSnapshot:()=>snapshot,startupAutoplayPreference:false,startupResumeSecondsFromSnapshot:s=>s.currentTime,playQueue:[],currentIdx:-1,currentLocalSong:null,
  hydrateCustomCover:s=>s,cloneSong:s=>({...s}),currentCoverSong:()=>context.playQueue[context.currentIdx]||context.currentLocalSong,playMode:'loop',audio:null,miniQueueOpen:false,trackSwitchToken:0,
  updateControlTrackInfo:no,songSourceLabel:()=>'',document:{getElementById:()=>null},applyRestoredPlaybackProgressUi:no,showRestoredPlaybackControls:no,safeRenderQueuePanel:no,safeShelfRebuild:no,updatePlayModeButton:no,updateEmptyHomeVisibility:no,playbackRestoreSongSnapshot:s=>({...s}),playbackDurationFromSong:s=>s.duration||100,
  queueItemKey:s=>s&&s.id,queueLogicalOrderState:{queue:null,next:0},saveLastPlaybackSnapshot:()=>saves.push(context.playQueue.map(s=>s.name)),localStorage:{removeItem:no},console});
 loadFunctions(context,'public/js/modules/05-playback/10-queue-actions.js',['syncQueueLogicalOrder']);
 loadFunctions(context,'public/js/modules/05-playback/09-queue-snapshot-autoplay.js',['restoreLastPlaybackSnapshot']);
 loadFunctions(context,'public/js/modules/06-lyrics/05-upload-dragdrop.js',['isLocalPlaybackSnapshot','restoredLocalTrackIndex','restorePersistedLocalLibrary']);
 context.restoreLastPlaybackSnapshot();return {c:context,snapshot,saves};
}
test('current local and current online checkpoints retain mixed queue, shuffle mode and logical ranks',async()=>{
 for(const currentLocal of [true,false]){
  const {c,saves}=fixture({currentLocal});assert.equal(await c.restorePersistedLocalLibrary(),true);
  assert.deepEqual(Array.from(c.playQueue,s=>s.name),['a','b','c']);assert.equal(c.playMode,'shuffle');assert.deepEqual(Array.from(c.playQueue,s=>s._queueOrder),[2,0,1]);
  assert.equal(c.playQueue[c.currentIdx].name,currentLocal?'a':'b');assert.equal(c.pendingPlaybackResumeAt,40);assert.equal(saves.length,1);
 }
});
test('offline records retain identity and missing status; deleted library entries are dropped, never replaced with unrelated imports',async()=>{
 const {c}=fixture({available:[local('a',2),local('d',3)]});await c.restorePersistedLocalLibrary();
 assert.deepEqual(Array.from(c.playQueue,s=>s.name),['a','b','c']);assert.equal(c.playQueue[2].localMissing,true);assert.equal(c.playQueue[2].localKey,'c');
});
test('deleted current local record selects only a saved successor at zero progress',async()=>{
 const {c,snapshot}=fixture({available:[local('d',3)],resolve:async()=>null});await c.restorePersistedLocalLibrary();
 assert.deepEqual(Array.from(c.playQueue,s=>s.name),['b']);assert.equal(c.pendingPlaybackResumeAt,0);assert.equal(snapshot.current.id,'b');assert.equal(snapshot.currentTime,0);
});
test('a delayed local resolver cannot rewrite a newer playback selection',async()=>{
 let release;const gate=new Promise(r=>release=r);const {c}=fixture({available:[local('d',3)],resolve:async()=>gate});
 const job=c.restorePersistedLocalLibrary();await new Promise(setImmediate);c.trackSwitchToken++;c.playQueue=[{id:'new'}];c.currentIdx=0;
 release(null);assert.equal(await job,false);assert.equal(c.playQueue[0].id,'new');
});
