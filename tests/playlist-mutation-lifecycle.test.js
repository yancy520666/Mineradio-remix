'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');
const no=()=>{};
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
function removalFixture(){
 const gate=deferred(),calls=[];
 const c=vm.createContext({window:{desktopWindow:{listBuiltInPlaylists:()=>{},removeBuiltInPlaylistTrack:(...args)=>{calls.push(args);return gate.promise;}}},
  builtInPlaylists:[],playlistPanelDetailState:{key:'mineradio:fixture',token:7,tracks:Array.from({length:96},(_,i)=>({id:i})),total:120,nextOffset:96,hasMore:true,loadingMore:true},
  cancelPlaylistPanelDetailRequest:no,rebuildUserPlaylistsFromCatalog:no,showToast:no,console});
 vm.runInContext(fs.readFileSync('public/js/modules/06-lyrics/00-built-in-playlists.js','utf8'),c);
 return {c,gate,calls};
}
test('built-in removal preserves unloaded songs, advances page token and suppresses index-shifting double clicks',async()=>{
 const {c,gate,calls}=removalFixture();const first=c.removeTrackFromBuiltInPlaylist('fixture',0);
 assert.equal(c.playlistPanelDetailState.token,8);assert.equal(c.playlistPanelDetailState.loadingMore,false);
 assert.equal(await c.removeTrackFromBuiltInPlaylist('fixture',0),false);assert.equal(calls.length,1);
 gate.resolve({ok:true,playlist:{id:'fixture',trackCount:119},playlists:[]});assert.equal(await first,true);
 assert.equal(c.playlistPanelDetailState.total,119);assert.equal(c.playlistPanelDetailState.nextOffset,95);assert.equal(c.playlistPanelDetailState.hasMore,true);
 assert.equal(c.playlistPanelDetailState.tracks[0].id,1);assert.equal(c.builtInPlaylistRemoveBusy.fixture,undefined);
});
test('built-in failure releases the mutation lock and a late result cannot edit another opened detail',async()=>{
 const {c,gate}=removalFixture();const first=c.removeTrackFromBuiltInPlaylist('fixture',0);
 c.playlistPanelDetailState={key:'mineradio:other',tracks:[{id:'other'}]};gate.resolve({ok:true,playlist:{trackCount:119},playlists:[]});
 assert.equal(await first,true);assert.equal(c.playlistPanelDetailState.tracks[0].id,'other');
 c.window.desktopWindow.removeBuiltInPlaylistTrack=async()=>{throw new Error('fixture-failed');};
 await assert.rejects(c.removeTrackFromBuiltInPlaylist('fixture',0),/fixture-failed/);assert.equal(c.builtInPlaylistRemoveBusy.fixture,undefined);
});
function nextFixture(){
 const gate=deferred(),calls=[];const c=vm.createContext({playQueue:[{id:'A'}],currentIdx:0,trackSwitchToken:7,playToggleBusy:false,
  queueHydrationState:{active:true,error:false},playMode:'loop',forcePlaybackControlsInteractive:no,hydratePlaylistQueueNextPage:()=>gate.promise,
  showToast:no,playQueueAt:(idx,opts)=>{calls.push({id:c.playQueue[idx].id,idx,opts});c.trackSwitchToken++;},Promise});
 c.queueHydrationState.queueRef=c.playQueue;loadFunctions(c,'public/js/modules/05-playback/14-player-controls.js',['nextTrack']);return {c,gate,calls};
}
test('tail next-page completion cannot replace a new queue or a newer selected track',async()=>{
 for(const replaceQueue of [true,false]){
  const {c,gate,calls}=nextFixture();c.nextTrack(true);
  if(replaceQueue){c.playQueue=[{id:'new-A'},{id:'new-B'},{id:'new-C'}];c.queueHydrationState={queueRef:c.playQueue};c.currentIdx=2;}
  else {c.trackSwitchToken++;}
  gate.resolve(true);await new Promise(setImmediate);assert.equal(calls.length,0);
 }
});
test('tail next-page completion advances once on its own queue despite duplicate next clicks',async()=>{
 const {c,gate,calls}=nextFixture();c.nextTrack(true);c.nextTrack(true);c.playQueue.push({id:'B'});gate.resolve(true);await new Promise(setImmediate);
 assert.equal(calls.length,1);assert.equal(calls[0].id,'B');assert.equal(calls[0].opts.manual,true);
});
function loaderFixture(){
 const gates=[deferred(),deferred()],calls=[],messages=[];let n=0;
 const c=vm.createContext({playQueue:[{id:'existing'}],currentIdx:0,trackSwitchToken:7,queueLoadRequestSerial:0,queueHydrationState:{token:1},userPlaylists:[],PLAYLIST_LAZY_BATCH_SIZE:96,PLAYLIST_QUEUE_INITIAL_BATCH_SIZE:96,
  updateEmptyHomeVisibility:no,showLoading:no,hideLoading:no,fetchPlaylistTracksPage:()=>gates[n++].promise,apiJson:()=>gates[n++].promise,
  cloneSong:s=>({...s}),isLikedPlaylistContext:()=>false,syncLikeStatusForSongs:no,safeRenderQueuePanel:no,safeSwitchPlaylistTab:no,safeShelfRebuild:no,forcePlaybackControlsInteractive:no,
  showToast:m=>messages.push(m),normalizePlaylistProvider:p=>p,playQueueAt:i=>{calls.push(c.playQueue[i].id);c.trackSwitchToken++;},clearTimeout,no,console});
 loadFunctions(c,'public/js/modules/06-lyrics/03-podcast-playlist-loaders.js',['beginQueueLoadRequest','queueLoadRequestStillCurrent','cancelPlaylistQueueHydration','playlistQueueSource','playlistQueuePageSize','loadPlaylistIntoQueueById','loadPodcastRadioIntoQueue']);
 return {c,gates,calls,messages};
}
test('a newer first-page request owns the queue even when the older request settles last',async()=>{
 const {c,gates,calls}=loaderFixture();const old=c.loadPlaylistIntoQueueById('old',true,'old'),newer=c.loadPlaylistIntoQueueById('new',true,'new');
 gates[1].resolve({tracks:[{id:'new-track'}],total:1,nextOffset:1});assert.equal(await newer,true);
 gates[0].resolve({tracks:[{id:'old-track'}],total:1,nextOffset:1});assert.equal(await old,false);assert.equal(c.playQueue[0].id,'new-track');assert.deepEqual(calls,['new-track']);
});
test('manual playback and clearing cancel late playlist and podcast first pages',async()=>{
 for(const podcast of [false,true]){
  const {c,gates,calls}=loaderFixture();const old=podcast?c.loadPodcastRadioIntoQueue('old',true,'old'):c.loadPlaylistIntoQueueById('old',true,'old');
  c.trackSwitchToken++;c.playQueue=[{id:'new-selection'}];c.currentIdx=0;
  gates[0].resolve(podcast?{programs:[{id:'old-track'}]}:{tracks:[{id:'old-track'}],total:1});assert.equal(await old,false);assert.equal(c.playQueue[0].id,'new-selection');assert.equal(calls.length,0);
 }
 const {c,gates}=loaderFixture();const old=c.loadPlaylistIntoQueueById('old',true,'old');c.cancelPlaylistQueueHydration('clear-queue');
 gates[0].resolve({tracks:[{id:'old-track'}],total:1});assert.equal(await old,false);
});
function seekCancelFixture({resume=true,changed=false}={}){
 const calls=[];const media={src:'fixture',paused:true,ended:false};
 const c=vm.createContext({trackSwitchToken:changed?8:7,progressDragState:{active:true,seekTrackToken:7,pointerStartX:0,pointerMoved:true,pointerStartedAt:0,previewTime:50,resumeAfterSeek:resume,media,mediaSrc:'fixture'},
  performance:{now:()=>300},progressBar:{classList:{remove:no},releasePointerCapture:no},flushProgressPointerPreview:no,clearProgressPreviewHold:no,
  progressSeekMediaStillCurrent:()=>true,restorePlaybackGain:()=>calls.push('gain'),attemptAudioPlay:opts=>{calls.push(opts);media.paused=false;},audio:media,Promise});
 loadFunctions(c,'public/js/modules/06-lyrics/04-progress-seek.js',['endProgressDrag']);return {c,media,calls};
}
test('cancelled seek resumes only the same previously-playing track',()=>{
 for(const options of [{resume:true},{resume:false},{resume:true,changed:true}]){
  const {c,media,calls}=seekCancelFixture(options);c.endProgressDrag({clientX:50,pointerId:1},false);
  assert.equal(media.paused,!options.resume||!!options.changed);
  const play=calls.find(call=>typeof call==='object');assert.equal(!!play,options.resume&&!options.changed);
  if(play){assert.equal(play.expectedMedia,media);assert.equal(play.expectedToken,7);}
 }
});
