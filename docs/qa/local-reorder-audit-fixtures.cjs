'use strict';const vm=require('node:vm');const {loadFunctions}=require('../../tests/helpers/classic-functions');const no=()=>{};
(async()=>{
 let resolveLocal,resolveOutput;const localGate=new Promise(r=>resolveLocal=r),outputGate=new Promise(r=>resolveOutput=r);
 const song={type:'local',name:'B',localFileId:'b',localKey:'b'};const c=vm.createContext({window:{desktopWindow:{resolveLocalMusicTrack:()=>localGate}},document:{getElementById:()=>({classList:{remove:no}})},
  playQueue:[{name:'A'},song,{name:'C'}],currentIdx:1,trackSwitchToken:7,pendingQueuePlaybackToken:7,audio:{pause:no},audioFadeSerial:0,queueLogicalOrderState:{queue:null,next:0},
  updateCustomCoverButton:no,clearAudioFadeTimers:no,resetPlaybackAudioGraphForSourceSwitch:no,syncActiveAudioRepeatMode:no,bindPlaybackProgressEvents:no,applyVolumeToAudio:no,
  applyAudioOutputDevice:()=>outputGate,safeRenderQueuePanel:no,safeShelfRebuild:no,saveLastPlaybackSnapshot:no,queueItemKey:s=>s.name,console});
 loadFunctions(c,'public/js/modules/05-playback/10-queue-actions.js',['syncQueueLogicalOrder','queueLogicalEntries','moveQueueLogicalEntry','moveQueueIndex']);
 loadFunctions(c,'public/js/modules/05-playback/13-playback-start-audio.js',['playLocalQueueSong']);
 const playing=c.playLocalQueueSong(song,1,7,false,{},0);c.moveQueueIndex(1,0);const before=Array.from(c.playQueue,s=>s.name);
 resolveLocal({...song,localUrl:'fixture:B'});await new Promise(setImmediate);console.log('PBL-09 pending local reorder',JSON.stringify({beforeResolution:before,afterResolution:Array.from(c.playQueue,s=>s.name),currentIdx:c.currentIdx}));
 c.trackSwitchToken++;resolveOutput();await playing;
})().catch(e=>{console.error(e);process.exitCode=1;});
