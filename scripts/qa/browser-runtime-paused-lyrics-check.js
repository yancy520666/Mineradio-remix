'use strict';
const {app,BrowserWindow,session,net}=require('electron');
const http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const root=path.resolve(__dirname,'..','..');
const out=path.resolve(process.env.MINERADIO_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'mineradio-browser-evidence-')));fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync('/tmp/mineradio-browser-runtime-');
app.setPath('userData',path.join(temp,'profile'));app.setPath('sessionData',path.join(temp,'session'));
app.commandLine.appendSwitch('mute-audio');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed',()=>{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={scope:'Original Node server static frontend in an isolated ordinary browser window. Frontend API responses are labelled fake-platform/empty fixtures; only the initial no-account backend status reads are real. This does not validate desktop/main, preload/IPC, Windows, real accounts, upstream platforms or online playback.',temp,logs:[],requests:[],blockedExternal:[],permissions:[],serverLog:'',screenshots:[],states:[]};
report.sourceSnapshot={head:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),sharedWorktreeStatus:spawnSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).stdout.trim(),files:{}};
for(const relative of ['public/js/modules/02-visual/12-lyrics-row-layers.js','public/js/modules/02-visual/12a-lyrics-edit-preview.js','public/js/modules/02-visual/14-stage-lyrics-rendering.js','public/js/modules/05-playback/06-track-detail-lyrics-actions.js','public/js/modules/07-fx/05-fx-panel-performance.js','public/js/modules/10-shell/03-splash.js']) report.sourceSnapshot.files[relative]=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex');
let child,win,fixture;
async function done(code,error){if(error)report.error=String(error.stack||error);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));if(fixture)fixture.close();if(child&&!child.killed)child.kill('SIGTERM');console.log('QA_RESULT '+JSON.stringify({scope:report.scope,error:report.error,states:report.states,screenshots:report.screenshots,report:path.join(out,'result.json')}));app.exit(code);}
setTimeout(()=>done(2,new Error('QA timeout')),100000).unref();
app.whenReady().then(async()=>{
 child=spawn('node',[path.join(__dirname,'browser-runtime-server.js'),root,temp],{env:{PATH:process.env.PATH,HOME:temp,USERPROFILE:temp,APPDATA:temp,LOCALAPPDATA:temp,TMPDIR:temp,TMP:temp,TEMP:temp,XDG_CACHE_HOME:path.join(temp,'xdg'),ELECTRON_RUN_AS_NODE:'',NODE_PATH:path.join(root,'node_modules')}});
 let address;
 child.stdout.on('data',chunk=>{report.serverLog+=String(chunk);const m=report.serverLog.match(/QA_SERVER_ADDRESS (\{[^\n]+\})/);if(m)address=JSON.parse(m[1]);});
 child.stderr.on('data',c=>report.serverLog+=String(c));
 const deadline=Date.now()+10000;while(!address){if(Date.now()>deadline)throw Error('Node server did not start: '+report.serverLog);await wait(50);}
 report.serverAddress=address;const origin='http://127.0.0.1:'+address.port;
 const ses=session.fromPartition('qa-browser-runtime-'+process.pid);
 ses.setPermissionRequestHandler((_wc,permission,cb)=>{report.permissions.push({mode:'request',permission,granted:false});cb(false);});
 ses.setPermissionCheckHandler((_wc,permission)=>{report.permissions.push({mode:'check',permission,granted:false});return false;});
 // Read the original backend's no-account status routes once, before fixtures.
 report.backendStatuses=[];
 for(const endpoint of ['/api/login/status','/api/qq/login/status','/api/kugou/login/status','/api/qishui/status']){
  const res=await net.fetch(origin+endpoint);const body=await res.json();
  report.backendStatuses.push({endpoint,status:res.status,loggedIn:body.loggedIn,provider:body.provider});
 }
 fixture=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  report.requests.push({path:u.pathname,type:'api-fixture',method:req.method});res.on('finish',()=>report.requests.push({path:u.pathname,type:'api-fixture-completed',method:req.method,status:res.statusCode}));
  res.setHeader('access-control-allow-origin',origin);res.setHeader('access-control-allow-headers','content-type');res.setHeader('x-qa-fixture','fake-platform-empty');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='GET'){res.writeHead(405);res.end('QA writes disabled');return;}
  let body={code:200,ok:true,loggedIn:false,songs:[],items:[],playlists:[],programs:[],total:0,hasMore:false};
  if(u.pathname.endsWith('/status'))body={code:200,loggedIn:false,provider:u.pathname.split('/')[2],capabilities:{}};
  if(u.pathname.includes('/search'))body={code:200,songs:[],items:[],total:0,hasMore:false,more:false};
  if(u.pathname==='/api/update/latest')body={configured:false,currentVersion:'2.4.2',version:'2.4.2',updateAvailable:false,notes:[]};
  if(u.pathname==='/api/discover/home')body={loggedIn:false,mode:'starter',dailySongs:[],playlists:[],podcasts:[]};
  if(u.pathname==='/api/cover'){res.setHeader('content-type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));return;}
  res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(body));
 });
 await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
 const fixtureOrigin='http://127.0.0.1:'+fixture.address().port;report.fixtureOrigin=fixtureOrigin;
 ses.webRequest.onBeforeRequest((details,cb)=>{
  const u=new URL(details.url);report.requests.push({path:u.pathname,type:details.resourceType});
  if(!['http:','data:','blob:','file:'].includes(u.protocol)||u.protocol==='http:'&&![origin,fixtureOrigin].includes(u.origin)){report.blockedExternal.push(details.url);return cb({cancel:true});}
  if(u.origin===origin&&u.pathname.startsWith('/api/'))return cb({redirectURL:fixtureOrigin+u.pathname+u.search});
  cb({});
 });
 ses.webRequest.onCompleted(details=>{if(new URL(details.url).origin===origin)report.requests.push({path:new URL(details.url).pathname,type:'real-static-completed',status:details.statusCode});});
 win=new BrowserWindow({width:1280,height:820,minWidth:1280,minHeight:820,show:true,frame:false,webPreferences:{partition:'qa-browser-runtime-'+process.pid,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 win.webContents.setAudioMuted(true);
 report.runtimeExceptions=[];win.webContents.debugger.attach('1.3');win.webContents.debugger.on('message',(_e,m,p)=>{if(m==='Runtime.exceptionThrown')report.runtimeExceptions.push(p.exceptionDetails);});win.webContents.debugger.sendCommand('Runtime.enable').catch(e=>report.debuggerError=String(e));
 win.webContents.on('console-message',(_e,...args)=>{const d=typeof args[0]==='object'?args[0]:{level:args[0],message:args[1],lineNumber:args[2],sourceId:args[3]};report.logs.push(d);});
 win.webContents.on('console-message',async(_e,...a)=>{const m=typeof a[0]==='object'?a[0].message:a[1];if(typeof m==='string'&&m.startsWith('QA_STAGE_SHOT ')){const name=m.slice(14);try{await wait(80);const img=await win.webContents.capturePage();const file=path.join(out,name+'.png');fs.writeFileSync(file,img.toPNG());report.screenshots.push({path:file,size:img.getSize()});}catch(e){report.screenshotError=String(e);}}});
 win.webContents.on('render-process-gone',(_e,d)=>report.rendererGone=d);
 await win.loadURL(origin+'/');await wait(600);
 report.splashColdStart=await win.webContents.mainFrame.executeJavaScript(`(()=>{const g=splashGl,p=splashGlProgram;return {context:!!g,program:!!p,isProgram:!!g&&!!p&&g.isProgram(p),linked:!!g&&!!p&&g.getProgramParameter(p,g.LINK_STATUS),programInfo:!!g&&!!p?g.getProgramInfoLog(p):null,glError:!!g?g.getError():null,fallback2d:!!splashCtx};})()`);
 if(!report.splashColdStart.linked)throw Error('Original cold-start splash WebGL program was not linked');
 fs.writeFileSync(path.join(out,'splash-cold-start.png'),(await win.webContents.capturePage()).toPNG());report.screenshots.push({path:path.join(out,'splash-cold-start.png'),size:(await win.webContents.capturePage()).getSize()});

 await win.webContents.mainFrame.executeJavaScript("localStorage.setItem('mineradio-login-guide-seen-v1','1');localStorage.setItem(VISUAL_GUIDE_SEEN_STORE_KEY,'1');localStorage.setItem('mineradio-startup-fast-skip-v1','1');");
 await win.loadURL(origin+'/');
 const [w,h]=win.getSize();win.setSize(w+1,h);win.setSize(w,h);await wait(1800);
 const evalPage=source=>win.webContents.mainFrame.executeJavaScript(source,true);
 const measure=async(name,selectors,extra='{}')=>{const result=await evalPage(`(()=>{const selectors=${JSON.stringify(selectors)};return {name:${JSON.stringify(name)},viewport:{width:innerWidth,height:innerHeight},nodes:selectors.map(sel=>{const e=document.querySelector(sel);if(!e)return {selector:sel,missing:true};const r=e.getBoundingClientRect(),s=getComputedStyle(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {selector:sel,x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity,text:e.innerText.slice(0,600),value:e.value,centerHit:hit&&(hit.id||hit.className),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};}),extra:(${extra})};})()`);report.states.push(result);return result;};
 const shot=async name=>{await wait(200);const img=await win.webContents.capturePage();const file=path.join(out,name+'.png');fs.writeFileSync(file,img.toPNG());report.screenshots.push({path:file,size:img.getSize()});};
 await measure('startup',['#empty-home','#home-next-title','#search-input','#bottom-bar'],"({ready:document.readyState,node:typeof require,bridge:typeof window.desktopWindow,renderer:!!renderer&&!!renderer.getContext(),splashVisible:!document.getElementById('splash').classList.contains('hide'),loginChecks:{netease:loginStatusChecked,qq:qqLoginStatus.loggedIn,kugou:kugouLoginStatus.loggedIn,qishui:qishuiLoginStatus.loggedIn},queueLength:playQueue.length})");await shot('startup');
 await evalPage("MineradioSonicPerformance.closeNotice()");
 // Real HTMLMediaElement smoke, using generated all-zero PCM WAV Blobs.
 // No user file, online audio, account, microphone or device grant is used.
 const mediaLogStart=report.logs.length;
 report.media=await evalPage(`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const result={sourceHashes:${JSON.stringify(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'public/js/modules/02-visual/14-stage-lyrics-rendering.js'))).digest('hex'))},scope:'Generated silent 12-second PCM WAV Files -> original localSongFromAudioFile -> playQueueAt/togglePlay/commitProgressSeek. Real HTMLMediaElement, BrowserWindow audio muted.',steps:[]};
  function wav(name){const samples=8000*12,b=new ArrayBuffer(44+samples*2),v=new DataView(b);const ascii=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};ascii(0,'RIFF');v.setUint32(4,36+samples*2,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,samples*2,true);return new File([b],name,{type:'audio/wav',lastModified:1});}
  const songs=[0,1,2].map(i=>localSongFromAudioFile(wav('qa-silence-'+i+'.wav')));
  const urls=songs.map(s=>s.localUrl);playQueue=songs;currentIdx=-1;safeRenderQueuePanel('qa-generated-audio');
  const snapshot=name=>({name,realMedia:audio instanceof HTMLMediaElement,constructor:audio&&audio.constructor.name,currentIdx,queueCount:playQueue.length,localKey:currentLocalSong&&currentLocalSong.localKey,queueKey:playQueue[currentIdx]&&playQueue[currentIdx].localKey,source:audio&&audio.currentSrc,sourceMatches:!!audio&&audio.currentSrc===playQueue[currentIdx].localUrl,ownershipMatches:!!audio&&playbackMediaMatchesCurrentQueueItem(audio),duration:audio&&audio.duration,currentTime:audio&&audio.currentTime,paused:audio&&audio.paused,playing,readyState:audio&&audio.readyState,error:audio&&audio.error&&{code:audio.error.code,message:audio.error.message},switchToken:trackSwitchToken});
  try{
   const started=await Promise.race([playQueueAt(0,{manual:true,suppressPlayFailureNotice:true}),wait(4500).then(()=>{throw Error('Real local media start timeout');})]);
   result.started=started;await wait(300);result.steps.push(snapshot('started'));
   const t=audio&&audio.currentTime;await wait(450);const progress=snapshot('advanced');progress.advancedFrom=t;result.steps.push(progress);
   if(!started||!progress.realMedia||progress.paused||progress.currentTime<=t)throw Error('Real HTMLMediaElement did not start and advance');
   await Promise.race([togglePlay(),wait(2000).then(()=>{throw Error('Real pause timeout');})]);await wait(120);result.steps.push(snapshot('paused'));const held=audio.currentTime;await wait(220);const still=snapshot('pause-held');still.delta=still.currentTime-held;result.steps.push(still);
   commitProgressSeek(6,false);await wait(450);result.steps.push(snapshot('seek-paused'));
   await Promise.race([togglePlay(),wait(2500).then(()=>{throw Error('Real resume timeout');})]);await wait(180);result.steps.push(snapshot('resumed'));
   const a=playQueueAt(1,{manual:true,suppressPlayFailureNotice:true});await wait(10);const b=playQueueAt(0,{manual:true,suppressPlayFailureNotice:true});await wait(10);const c=playQueueAt(2,{manual:true,suppressPlayFailureNotice:true});
   result.switchResults=await Promise.race([Promise.allSettled([a,b,c]).then(x=>x.map(v=>({status:v.status,value:v.value,reason:v.reason&&String(v.reason)}))),wait(5000).then(()=>{throw Error('Rapid switch timeout');})]);await wait(400);result.steps.push(snapshot('rapid-switch-final'));
   result.assertions={startedAndAdvanced:progress.currentTime>t,paused:result.steps.find(x=>x.name==='paused').paused&&result.steps.find(x=>x.name==='paused').playing===false,pauseHeld:still.delta<0.02,seekReached:Math.abs(result.steps.find(x=>x.name==='seek-paused').currentTime-6)<0.15,resumed:!result.steps.find(x=>x.name==='resumed').paused,rapidSwitchOwned:currentIdx===2&&audio.currentSrc===songs[2].localUrl&&playbackMediaMatchesCurrentQueueItem(audio),allRealMedia:result.steps.every(x=>x.realMedia),allSourcesMatch:result.steps.every(x=>x.sourceMatches&&x.ownershipMatches)};
   // Two targeted paused-lyric boundary checks, normal original scheduler.
   document.getElementById('local-beat-later-btn').click();MineradioSonicPerformance.closeNotice();
   await togglePlay();audio.pause();playing=false;audio.currentTime=1.8;
   fx.lyricPauseHold=true;fx.lyricDisplayMode='single';fx.lyricTranslationMode='off';
   lyricsLines=[{t:0,duration:2,text:'暂停校准 A',charCount:6},{t:2,duration:2,text:'暂停校准 B',charCount:6},{t:4,duration:2,text:'暂停校准 C',charCount:6}];lyricsTranslationLines=[];
   clearStageLyrics();showStageLine(buildStageLyricDisplayPayload(0),true);stageLyrics.currentIdx=0;await wait(850);
   const stageSnapshot=name=>{const data=stageLyrics.current&&stageLyrics.current.userData.lyric;const gl=renderer.getContext();return {name,audioPaused:audio.paused,playing,mediaTime:audio.currentTime,index:stageLyrics.currentIdx,text:stageLyrics.currentText,displayKey:stageLyrics.currentDisplayKey,meshId:stageLyrics.current&&stageLyrics.current.id,clarity:fx.lyricTextureClarity,glowEnabled:fx.lyricGlow,glowStrength:fx.lyricGlowStrength,displayMode:data&&data.displayMode,fxEditTextOnly:data&&data.fxEditTextOnly,pausedFxCommitToken:data&&data.pausedFxCommitToken,pausedFxCommitRows:data&&data.pausedFxCommitRows&&data.pausedFxCommitRows.length,offset:typeof currentLyricTimingOffsetSeconds==='function'?currentLyricTimingOffsetSeconds():null,prewarm:stageLyricPrewarm.build&&{reason:stageLyricPrewarm.build.reason,phase:stageLyricPrewarm.build.state&&stageLyricPrewarm.build.state.phase},scheduler:lyricWorkScheduler.snapshot(),ownerActive:!!data&&lyricFxPausedCommitActive(data),fxEditActive:lyricFxEditActive(),pendingInput:stageLyricShouldYieldToPendingInput(),resident:(()=>{const j=stageLyricResidentBuild.job,z=j&&j.state;return j&&{reason:j.reason,effectsOnly:j.effectsOnly,token:j.token,trackToken:j.trackToken,start:j.start,end:j.end,trackKeyMatches:!!data&&j.trackKey===data.trackKey,state:z&&{cursor:z.cursor,completedPhases:z.completedPhases,totalPhases:z.totalPhases,pendingPhase:z.pendingPhase,lastPhase:z.lastPhase,textOnly:z.textOnly,done:z.done,rows:z.rows&&z.rows.length}};})(),overlays:{localBeatShow:document.getElementById('local-beat-modal').classList.contains('show'),localBeatDisplay:getComputedStyle(document.getElementById('local-beat-modal')).display,localBeatActive:localBeatAnalysis.active,performanceHidden:document.getElementById('sonic-performance-notice').hidden},programs:renderer.info.programs.map(p=>({id:p.id,linked:gl.getProgramParameter(p.program,gl.LINK_STATUS),info:gl.getProgramInfoLog(p.program)})),glError:gl.getError(),rows:data&&data.rowLayers.map(r=>{const currentMap=lyricQualityCurrentMap(r),target=lyricQualityCandidateTarget({row:r,tier:lyricTextureClarityScale()});return {lineIndex:r.lineIndex,isPrimary:r.isPrimary,isTranslation:r.isTranslation,renderWindowActive:r.renderWindowActive,visible:r.mesh.visible,uploaded:r.renderLineUploaded,readability:!!r.readability,readabilityUploaded:r.renderReadabilityUploaded,glow:!!r.glow,glowUploaded:r.renderGlowUploaded,editTextPreview:r.editTextPreview,editRasterKey:r.editRasterKey,editUniform:r.mat&&r.mat.uniforms&&r.mat.uniforms.uEditPreview&&r.mat.uniforms.uEditPreview.value,qualityWanted:r.qualityWanted,qualityTier:r.qualityTier,qualityQueuedKey:r.qualityQueuedKey,qualityPending:!!r.qualityPendingTexture,qualityTexture:r.qualityTexture&&r.qualityTexture.uuid,currentMap:currentMap&&currentMap.uuid,mapIsQuality:!!r.qualityTexture&&currentMap===r.qualityTexture,targetTier:target&&target.metrics.tier,rasterKeyMatches:!!target&&r.qualityRasterKey===target.key};})};};
   const committed=s=>{const rows=s.rows&&s.rows.filter(r=>r.renderWindowActive);return !!rows&&rows.length>0&&s.pausedFxCommitToken==null&&!s.fxEditTextOnly&&rows.every(r=>r.visible&&r.uploaded&&r.readabilityUploaded&&(!s.glowEnabled||!(s.glowStrength>0)||r.glowUploaded)&&!r.editTextPreview&&r.editUniform===0&&(!r.qualityWanted||r.mapIsQuality&&r.qualityTier===r.targetTier&&r.rasterKeyMatches&&!r.qualityQueuedKey&&!r.qualityPending));};
   const waitCommitted=async(name,steps)=>{const started=performance.now();await wait(1200);let snap=stageSnapshot(name+'-1200ms');steps.push(snap);while(!committed(snap)&&performance.now()-started<20000){await wait(1000);snap=stageSnapshot(name+'-'+Math.round(performance.now()-started)+'ms');steps.push(snap);}return snap;};
   result.pausedOffset=[];result.pausedOffset.push(stageSnapshot('before-offset'));
   setCurrentLyricTimingOffset(0.5,{silent:true});await wait(900);result.pausedOffset.push(stageSnapshot('after-offset'));closeLocalBeatModal();MineradioSonicPerformance.closeNotice();await wait(600);console.log('QA_STAGE_SHOT offset-after');await wait(300);
   setCurrentLyricTimingOffset(0,{silent:true});clearStageLyrics();showStageLine(buildStageLyricDisplayPayload(0),true);stageLyrics.currentIdx=0;await wait(850);
   setLyricTextureClarity(4,true);fx.lyricGlow=true;fx.lyricGlowStrength=0.4;
   result.pausedFxCommit=[];result.pausedFxCommit.push(stageSnapshot('before-edit'));
   beginFxSliderEdit('lyricWeight',77,false);fx.lyricWeight=fx.lyricWeight===900?700:900;syncLyricFxLiveRows('lyricWeight');await wait(300);result.pausedFxCommit.push(stageSnapshot('editing'));
   endFxSliderEdit();const singleFinal=await waitCommitted('after-commit',result.pausedFxCommit);closeLocalBeatModal();MineradioSonicPerformance.closeNotice();await wait(600);console.log('QA_STAGE_SHOT fx-commit-after');await wait(300);
   audio.currentTime=2.2;setCurrentLyricTimingOffset(0,{silent:true});setLyricDisplayMode('triple');await wait(850);
   result.pausedTripleCommit=[stageSnapshot('triple-before-edit')];
   beginFxSliderEdit('lyricWeight',78,false);fx.lyricWeight=fx.lyricWeight===900?700:900;syncLyricFxLiveRows('lyricWeight');await wait(300);result.pausedTripleCommit.push(stageSnapshot('triple-editing'));
   endFxSliderEdit();const tripleFinal=await waitCommitted('triple-after-commit',result.pausedTripleCommit);closeLocalBeatModal();MineradioSonicPerformance.closeNotice();await wait(600);console.log('QA_STAGE_SHOT triple-fx-commit-after');await wait(300);
   result.stageAssertions={offsetChangedWhilePaused:result.pausedOffset[1].index===1&&result.pausedOffset[1].text==='暂停校准 B',singleNewMesh:singleFinal.meshId!==result.pausedFxCommit[0].meshId,singleCommitFullyRendered:committed(singleFinal),singleClarity4:singleFinal.clarity===4&&singleFinal.rows.filter(r=>r.renderWindowActive&&r.qualityWanted).every(r=>r.mapIsQuality&&r.qualityTier===r.targetTier&&r.targetTier===4),tripleNewMesh:tripleFinal.meshId!==result.pausedTripleCommit[0].meshId,tripleIndex1:tripleFinal.index===1,tripleVisibleIndexes:JSON.stringify(tripleFinal.rows.filter(r=>r.renderWindowActive&&r.isPrimary).map(r=>r.lineIndex).sort())==='[0,1,2]',tripleCommitFullyRendered:committed(tripleFinal),allProgramsLinked:[singleFinal,tripleFinal].every(s=>s.programs.length>0&&s.programs.every(p=>p.linked)&&s.glError===0),stillPaused:audio.paused&&playing===false};
  }catch(e){result.error=String(e.stack||e);}finally{if(audio){audio.__mineradioPlaybackExpected=false;audio.pause();}playing=false;for(const u of urls)URL.revokeObjectURL(u);}
  return result;
 })()`);
 report.media.console=report.logs.slice(mediaLogStart).filter(x=>x.level>=2);report.media.windowMuted=win.webContents.isAudioMuted();await evalPage("closeLocalBeatModal();MineradioSonicPerformance.closeNotice();");await wait(650);report.finalOverlayState=await evalPage("({localBeatShow:document.getElementById('local-beat-modal').classList.contains('show'),localBeatDisplay:getComputedStyle(document.getElementById('local-beat-modal')).display,performanceHidden:document.getElementById('sonic-performance-notice').hidden})");await shot('media-final');
 report.validation={splashLinked:report.splashColdStart.linked,mediaChecksPassed:!!report.media.assertions&&Object.values(report.media.assertions).every(Boolean),windowMuted:report.media.windowMuted,apiWritesRejected:report.requests.filter(x=>x.type==='api-fixture-completed'&&x.method==='POST').every(x=>x.status===405),pausedOffsetCorrect:report.media.pausedOffset?.[1]?.index===1&&report.media.pausedOffset?.[1]?.text==='暂停校准 B',stageChecksPassed:!!report.media.stageAssertions&&Object.values(report.media.stageAssertions).every(Boolean)};
 fs.writeFileSync(path.join(out,'final-dom.html'),await evalPage('document.documentElement.outerHTML'));
 if(!Object.values(report.validation).every(Boolean))throw Error('Actual runtime validation failed; see report.validation and media.stageAssertions');
 await done(0);
}).catch(e=>done(1,e));
