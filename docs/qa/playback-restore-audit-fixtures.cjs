'use strict';
const vm=require('node:vm');const {loadFunctions}=require('../../tests/helpers/classic-functions');const no=()=>{};
(async()=>{
 const A={id:'local:a',localKey:'a',localFileId:'a',type:'local',name:'A'},B={id:'qq-b',mid:'qq-b',provider:'qq',name:'B'},C={id:'local:c',localKey:'c',localFileId:'c',type:'local',name:'C'},D={id:'local:d',localKey:'d',localFileId:'d',type:'local',name:'D'};
 const snapshot={current:A,currentIdx:0,currentTime:40,duration:100,playMode:'shuffle',queue:[A,B,C]};
 const c=vm.createContext({window:{desktopWindow:{listLocalMusicLibrary:async()=>({ok:true,missing:0,tracks:[A,C,D].map(s=>({...s,localUrl:'fixture:'+s.name}))})}},
  restoredLastPlaybackSnapshot:null,readLastPlaybackSnapshot:()=>snapshot,startupAutoplayPreference:false,startupResumeSecondsFromSnapshot:s=>s.currentTime,playQueue:[],currentIdx:-1,currentLocalSong:null,
  hydrateCustomCover:s=>s,cloneSong:s=>({...s}),currentCoverSong:()=>c.playQueue[c.currentIdx]||c.currentLocalSong,playMode:'loop',audio:null,trackSwitchToken:0,miniQueueOpen:false,
  updateControlTrackInfo:no,songSourceLabel:()=>'',document:{getElementById:()=>null},applyRestoredPlaybackProgressUi:no,showRestoredPlaybackControls:no,safeRenderQueuePanel:no,updateEmptyHomeVisibility:no,playbackRestoreSongSnapshot:s=>({...s}),queueItemKey:s=>s&&s.id,console});
 loadFunctions(c,'public/js/modules/05-playback/09-queue-snapshot-autoplay.js',['restoreLastPlaybackSnapshot']);
 loadFunctions(c,'public/js/modules/06-lyrics/05-upload-dragdrop.js',['isLocalPlaybackSnapshot','restoredLocalTrackIndex','restorePersistedLocalLibrary']);
 c.restoreLastPlaybackSnapshot();await c.restorePersistedLocalLibrary();
 console.log('PBL-08 mixed local checkpoint restore',JSON.stringify({savedQueue:snapshot.queue.map(s=>s.name),restoredQueue:c.playQueue.map(s=>s.name),savedMode:snapshot.playMode,restoredMode:c.playMode}));
})().catch(e=>{console.error(e);process.exitCode=1;});
