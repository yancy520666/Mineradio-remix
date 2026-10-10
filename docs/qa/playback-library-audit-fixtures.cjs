'use strict';
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), os=require('node:os');
const {loadFunctions}=require('../../tests/helpers/classic-functions');
const {BuiltInPlaylistLibrary}=require('../../desktop/built-in-playlist-library');
const no=()=>{};
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mineradio-audit-built-in-'));
 const lib=new BuiltInPlaylistLibrary({userDataPath:root});
 const id='abcdef012345abcdef012345';
 lib.playlists=[{id,name:'temporary 120 songs',createdAt:1,updatedAt:1,tracks:Array.from({length:120},(_,i)=>({provider:'netease',source:'netease',type:'song',id:i+1,name:'fixture-'+(i+1),builtInIdentity:'netease:'+(i+1)}))}];
 const page=lib.page(id,{limit:96});
 const c=vm.createContext({window:{desktopWindow:{listBuiltInPlaylists:async()=>lib.listSync(),removeBuiltInPlaylistTrack:async(id,index)=>lib.removeTrack(id,index)}},
  playlistPanelDetailState:{key:'mineradio:'+id,tracks:page.tracks,total:page.total,nextOffset:page.nextOffset,hasMore:page.hasMore},
  builtInPlaylists:[],neteasePlaylists:[],qqPlaylists:[],kugouPlaylists:[],qishuiPlaylists:[],spotifyPlaylists:[],playlistCatalogRevision:0,rebuildUserPlaylistsFromCatalog:no,showToast:no,console});
 vm.runInContext(fs.readFileSync('public/js/modules/06-lyrics/00-built-in-playlists.js','utf8'),c);
 await c.removeTrackFromBuiltInPlaylist(id,0);
 console.log('PBL-01 pagination',JSON.stringify({actualDiskTotal:lib.page(id).total,rendererTotal:c.playlistPanelDetailState.total,rendererHasMore:c.playlistPanelDetailState.hasMore,nextOffset:c.playlistPanelDetailState.nextOffset}));
 const visibleSecond=c.playlistPanelDetailState.tracks[0].id;const diskBeforeIds=lib.page(id,{limit:500}).tracks.map(t=>t.id);
 await Promise.all([c.removeTrackFromBuiltInPlaylist(id,0),c.removeTrackFromBuiltInPlaylist(id,0)]);
 console.log('PBL-02 double-click removal',JSON.stringify({intendedRemoveId:visibleSecond,remainingFirstId:lib.page(id).tracks[0].id,actualDeletedIds:diskBeforeIds.filter(id=>!lib.page(lib.playlists[0].id,{limit:500}).tracks.some(t=>t.id===id))}));
 let release;const gate=new Promise(r=>release=r);const calls=[];
 const q=vm.createContext({adjacentPreparationDirection:0,playQueue:[{id:'old-tail'}],currentIdx:0,playToggleBusy:false,trackSwitchToken:7,
  queueHydrationState:{queueRef:null,active:true,loading:false,error:false},playMode:'loop',forcePlaybackControlsInteractive:no,
  hydratePlaylistQueueNextPage:()=>gate,showToast:no,playQueueAt:(idx,opts)=>calls.push({id:q.playQueue[idx].id,idx,opts}),Promise});
 q.queueHydrationState.queueRef=q.playQueue;loadFunctions(q,'public/js/modules/05-playback/14-player-controls.js',['nextTrack']);
 q.nextTrack(true);q.playQueue=[{id:'new-A'},{id:'new-B'},{id:'new-C'}];q.currentIdx=2;q.queueHydrationState={queueRef:q.playQueue,active:false,error:false};release();await new Promise(setImmediate);
 console.log('PBL-03 stale tail next',JSON.stringify({selectedBefore:'new-C',selectedAfter:q.playQueue[q.currentIdx].id,calls}));
 fs.rmSync(root,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
