'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
if(!process.argv.includes('--child')){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mineradio-detail-layout-'));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  try{
    const run=spawnSync(require('electron'),[__filename,'--child',profile],{cwd:root,env,encoding:'utf8',timeout:30000});
    if(run.status!==0)throw Error(run.stderr+run.stdout);
    console.log(run.stdout.split('\n').find(line=>line.startsWith('DETAIL_LAYOUT:')));
  }finally{fs.rmSync(profile,{recursive:true,force:true});}
}else{
  const {app,BrowserWindow}=require('electron');
  const profile=process.argv[process.argv.indexOf('--child')+1];
  app.setPath('appData',profile);
  process.env.MINERADIO_RUNTIME_NAME='Mineradio Detail Layout QA';
  process.env.MINERADIO_STARTUP_QA_USER_DATA=path.join(profile,'user');
  process.env.MINERADIO_STARTUP_QA_HIDDEN='1';
  fs.mkdirSync(process.env.MINERADIO_STARTUP_QA_USER_DATA,{recursive:true});
  fs.writeFileSync(path.join(process.env.MINERADIO_STARTUP_QA_USER_DATA,'cache-settings.json'),JSON.stringify({rootPath:path.join(profile,'cache')}));
  app.on('browser-window-created',(_event,win)=>win.webContents.session.webRequest.onBeforeRequest({urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']},(_details,callback)=>callback({cancel:true})));
  require('../desktop/main');
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  app.whenReady().then(async()=>{
    let win,ready;const deadline=Date.now()+20000;
    while(Date.now()<deadline){
      win=BrowserWindow.getAllWindows().find(w=>/^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
      if(win){ready=await win.webContents.executeJavaScript('typeof playlistPanelDetailShellHeight==="function" && document.readyState!=="loading"').catch(()=>false);if(ready)break;}
      await sleep(50);
    }
    assert(ready,'renderer must initialize');
    const result=await win.webContents.executeJavaScript(`(async()=>{
      dismissSplash({instant:true});closeVisualGuide(false);loginStatus.loggedIn=true;queueViewTab='playlists';
      const panel=document.getElementById('playlist-panel');panel.classList.add('show','pinned');
      document.getElementById('queue-pane').style.display='none';document.getElementById('pl-pane').style.display='';
      const cover='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#399"/></svg>');
      const output=[];
      for(const count of [24,200])for(const width of [340,280]){
        panel.style.width=width+'px';
        userPlaylists=Array.from({length:20},(_,i)=>({id:i+1,name:'Playlist '+i,provider:'netease',cover,trackCount:count}));playlistCatalogRevision++;
        Object.assign(playlistPanelDetailState,{key:'netease:1',playlist:userPlaylists[0],tracks:Array.from({length:count},(_,i)=>({id:i+1,name:'Track '+i+' 歌曲标题',artist:'Artist '+i,cover})),loading:false,loadingMore:false,hasMore:false,error:'',total:count});
        panel.scrollTop=0;renderUserPlaylistsList({animate:false,preserveScroll:true});
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const sample=where=>{
          const detail=panel.querySelector('[data-pl-detail]'),list=detail.querySelector('.pl-detail-list');
          const following=panel.querySelector('[data-playlist-id="2"]');
          const rows=Array.from(detail.querySelectorAll('[data-pl-detail-row]'));
          const rect=detail.getBoundingClientRect(),listRect=list.getBoundingClientRect();
          const bottom=Math.max(listRect.bottom,...rows.map(row=>row.getBoundingClientRect().bottom));
          return {count,width,where,height:rect.height,expected:playlistPanelDetailShellHeight(),overflowPx:Math.max(0,bottom-rect.bottom),
            nextGap:following?following.getBoundingClientRect().top-bottom:null,rows:rows.length,
            rowHeight:rows[0]&&rows[0].offsetHeight,top:panel.scrollTop};
        };
        output.push(sample('top'));
        panel.scrollTop=Math.max(0,playlistPanelDetailShellHeight()-panel.clientHeight+100);
        renderUserPlaylistsList({animate:false,preserveScroll:true});
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        output.push(sample('tail'));
        playlistPanelDetailState.key='';renderUserPlaylistsList({animate:false,preserveScroll:true});
        output.push({count,width,where:'collapsed',details:panel.querySelectorAll('[data-pl-detail]').length,overlaps:Array.from(panel.querySelectorAll('.pl-card')).some((card,i,cards)=>i>0&&card.getBoundingClientRect().top<cards[i-1].getBoundingClientRect().bottom-1)});
      }
      return output;
    })()`);
    console.log('DETAIL_LAYOUT:'+JSON.stringify(result));
    for(const sample of result){
      if(sample.where==='collapsed'){assert.equal(sample.details,0);assert(!sample.overlaps,JSON.stringify(sample));}
      else {assert(sample.overflowPx<=1,JSON.stringify(sample));if(sample.nextGap!==null)assert(sample.nextGap>=0,JSON.stringify(sample));assert(sample.rows<45);}
    }
    app.exit(0);
  }).catch(error=>{console.error(error.stack);app.exit(1);});
}
