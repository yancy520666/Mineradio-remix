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
const hashFile=relative=>require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex');
const addFiles=directory=>{for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){const relative=path.join(directory,entry.name);if(entry.isDirectory())addFiles(relative);else if(entry.isFile()&&entry.name.endsWith('.js'))report.sourceSnapshot.files[relative]=hashFile(relative);}};
addFiles('public/js/modules');for(const relative of ['public/index.html','public/js/index-loader.js','public/css/index.css','public/sonic-performance.js','server.js'])report.sourceSnapshot.files[relative]=hashFile(relative);
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
 win.webContents.setAudioMuted(true);report.runtimeExceptions=[];win.webContents.debugger.attach('1.3');win.webContents.debugger.on('message',(_e,m,p)=>{if(m==='Runtime.exceptionThrown')report.runtimeExceptions.push(p.exceptionDetails);});win.webContents.debugger.sendCommand('Runtime.enable').catch(e=>report.debuggerError=String(e));
 win.webContents.on('console-message',(_e,...args)=>{const d=typeof args[0]==='object'?args[0]:{level:args[0],message:args[1],lineNumber:args[2],sourceId:args[3]};report.logs.push(d);});
 win.webContents.on('render-process-gone',(_e,d)=>report.rendererGone=d);
 await win.loadURL(origin+'/');await wait(600);
 report.splashColdStart=await win.webContents.mainFrame.executeJavaScript(`(()=>{const g=splashGl,p=splashGlProgram;return {context:!!g,program:!!p,isProgram:!!g&&!!p&&g.isProgram(p),linked:!!g&&!!p&&g.getProgramParameter(p,g.LINK_STATUS),programInfo:!!g&&!!p?g.getProgramInfoLog(p):null,glError:!!g?g.getError():null,fallback2d:!!splashCtx};})()`);
 if(!report.splashColdStart.linked)throw Error('Original cold-start splash WebGL program was not linked');
 fs.writeFileSync(path.join(out,'splash-cold-start.png'),(await win.webContents.capturePage()).toPNG());report.screenshots.push({path:path.join(out,'splash-cold-start.png'),size:(await win.webContents.capturePage()).getSize()});

 await win.webContents.mainFrame.executeJavaScript("localStorage.setItem('mineradio-login-guide-seen-v1','1');localStorage.setItem(VISUAL_GUIDE_SEEN_STORE_KEY,'1');localStorage.setItem('mineradio-startup-fast-skip-v1','1');localStorage.setItem('mineradio-custom-lyric-fonts-v1',JSON.stringify([{id:'qa-saved',name:'QA Saved',family:'MineradioCustomLyricFont-qa-saved',dataUrl:'data:font/ttf;base64,AAAA',size:3,savedAt:1}]));");
 await win.loadURL(origin+'/');
 const [w,h]=win.getSize();win.setSize(w+1,h);win.setSize(w,h);await wait(1800);
 const evalPage=source=>win.webContents.mainFrame.executeJavaScript(source);
 const measure=async(name,selectors,extra='{}')=>{const result=await evalPage(`(()=>{const selectors=${JSON.stringify(selectors)};return {name:${JSON.stringify(name)},viewport:{width:innerWidth,height:innerHeight},nodes:selectors.map(sel=>{const e=document.querySelector(sel);if(!e)return {selector:sel,missing:true};const r=e.getBoundingClientRect(),s=getComputedStyle(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {selector:sel,x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity,text:e.innerText.slice(0,600),value:e.value,centerHit:hit&&(hit.id||hit.className),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};}),extra:(${extra})};})()`);report.states.push(result);return result;};
 const shot=async name=>{await wait(200);const img=await win.webContents.capturePage();const file=path.join(out,name+'.png');fs.writeFileSync(file,img.toPNG());report.screenshots.push({path:file,size:img.getSize()});};
 await measure('startup',['#empty-home','#home-next-title','#search-input','#bottom-bar'],"({ready:document.readyState,node:typeof require,bridge:typeof window.desktopWindow,renderer:!!renderer&&!!renderer.getContext(),splashVisible:!document.getElementById('splash').classList.contains('hide'),loginChecks:{netease:loginStatusChecked,qq:qqLoginStatus.loggedIn,kugou:kugouLoginStatus.loggedIn,qishui:qishuiLoginStatus.loggedIn},queueLength:playQueue.length})");await shot('startup');
 report.savedFontColdStart=await evalPage("({scope:'Invalid generated three-byte saved font, not a valid font ready/metrics test',ready:document.readyState,renderer:!!renderer&&!!renderer.getContext(),homeRevealed:getComputedStyle(document.getElementById('empty-home')).display!=='none'&&getComputedStyle(document.getElementById('empty-home')).visibility!=='hidden'&&document.getElementById('empty-home').getBoundingClientRect().width>0&&document.getElementById('splash').classList.contains('hide'),registeredSavedCount:customLyricFonts.length,savedRecord:customLyricFonts.find(f=>f.id==='qa-saved'),ownerMap:customLyricFontFaceOwners instanceof Map,remainingOwner:customLyricFontFaceOwners.has('qa-saved'),ownerCount:customLyricFontFaceOwners.size})");await shot('saved-font-cold-start');
 await evalPage("MineradioSonicPerformance.closeNotice()");
 // Actual DOM input event and the production debounce/search routines.
 await evalPage("document.getElementById('search-input').focus();document.getElementById('search-input').value='qa-no-result-20261009';document.getElementById('search-input').dispatchEvent(new Event('input',{bubbles:true}));");await wait(550);
 await measure('search-empty',['#search-input','#search-results'],"({mode:searchMode,query:searchLastResultQuery,resultCount:playlist.length,loading:document.getElementById('loading-overlay').className})");await shot('search-empty');
 await evalPage("document.getElementById('search-mode-qq').click()");await wait(350);
 await measure('search-qq-empty',['#search-results','#search-mode-qq'],"({mode:searchMode,resultCount:playlist.length})");
 await evalPage("document.getElementById('search-input').value='';document.getElementById('search-input').dispatchEvent(new Event('input',{bubbles:true}));togglePlaylistPanel(true);");await wait(450);await evalPage("document.getElementById('tab-queue').click()");await wait(250);
 await measure('queue-empty',['#playlist-panel','#queue-list','#queue-clear-btn'],"({queueLength:playQueue.length,pinned:playlistPanelPinned,tab:queueViewTab})");await shot('queue-empty');
 await evalPage("document.getElementById('tab-pl').click()");await wait(350);
 await measure('playlists-empty',['#pl-pane'],"({playlistCount:userPlaylists.length,tab:queueViewTab})");await shot('playlists-empty');
 await evalPage("togglePlaylistPanel(false);applyDiyMode(true,{save:false});document.getElementById('fx-fab').click()");await wait(450);
 await measure('settings-open',['#fx-panel','#fx-panel-tabs'],"({open:isFxPanelOpen(),activeTab:document.querySelector('[data-fx-page].active')&&document.querySelector('[data-fx-page].active').getAttribute('data-fx-page'),desktopBridgeAbsent:!window.desktopWindow})");await shot('settings-open');
 await evalPage("document.getElementById('fx-fab').click()");await wait(250);await measure('settings-toggle-close',['#fx-panel'],"({open:isFxPanelOpen()})");
 await evalPage("document.getElementById('user-btn').click()");await wait(500);
 await measure('login-open',['#login-modal','.dual-login-modal','#refresh-qr-btn'],"({provider:loginProvider,qrStarted:typeof qrPollTimer!=='undefined'&&!!qrPollTimer,bridge:typeof window.desktopWindow})");await shot('login-open');
 await evalPage("selectLoginProviderNode('qq')");await wait(350);await measure('login-qq-select',['#login-modal','#netease-web-fallback-btn','#refresh-qr-btn'],"({provider:loginProvider})");await shot('login-qq-select');
 await evalPage("closeLoginModal()");await wait(350);await measure('login-close',['#login-modal'],"({show:document.getElementById('login-modal').classList.contains('show')})");
 // Visual-only extension. All choices and saved settings are confined to this
 // throwaway browser profile; there is no platform account or native bridge.
 await evalPage("window.__qaOriginalFx=JSON.parse(JSON.stringify(fx));window.__qaOriginalPreset=fx.preset;homeForcedOpen=false;homeSuppressed=true;updateEmptyHomeVisibility();toggleFxPanel(true);");await wait(250);
 const gpuSnapshot=()=>evalPage(`(()=>{renderer.compile(scene,camera);renderer.render(scene,camera);const g=renderer.getContext();return {preset:fx.preset,uniformPreset:uniforms.uPreset.value,contextLost:g.isContextLost(),glError:g.getError(),programs:renderer.info.programs.map(p=>({name:p.name,linked:g.getProgramParameter(p.program,g.LINK_STATUS),info:g.getProgramInfoLog(p.program)})),drawCalls:renderer.info.render.calls,points:renderer.info.render.points,visibleObjects:(()=>{const a=[];scene.traverseVisible(o=>{if(o.isMesh||o.isPoints||o.isInstancedMesh)a.push({name:o.name,type:o.type,material:o.material&&o.material.type,vertices:o.geometry&&o.geometry.attributes.position&&o.geometry.attributes.position.count});});return a;})(),skull:{asset:!!skullParticleAsset.data,visible:!!skullParticleGroup&&skullParticleGroup.visible},sonic:{active:MineradioSonicTopography.isActive(fx),root:!!scene.getObjectByName('sonic-topography-root'),visible:!!scene.getObjectByName('sonic-topography-root')&&scene.getObjectByName('sonic-topography-root').visible},workshop:{active:MineradioSonicWorkshop.isActive(fx),iframe:!!document.querySelector('#sonic-workshop-layer iframe'),canvas:!!document.querySelector('#sonic-workshop-layer iframe')&&!!document.querySelector('#sonic-workshop-layer iframe').contentDocument.querySelector('canvas')}};})()`);
 report.visualPresets=[];
 const presets=await evalPage("presetMeta.map((x,id)=>({id,name:x.name}))");
 for(const preset of presets){
  const logStart=report.logs.length;
  await evalPage(`document.querySelector('#preset-grid [data-preset="${preset.id}"]').click()`);await wait(preset.id===8?2600:preset.id===6?900:420);
  const state=await gpuSnapshot();
  state.presetName=preset.name;state.console=report.logs.slice(logStart).filter(x=>x.level>=2);report.visualPresets.push(state);
  if([6,7,8,9,10,11,12].includes(preset.id))await shot('preset-'+preset.id);
  await evalPage("setPreset(__qaOriginalPreset,{silent:true,noSave:true,skipTransition:true})");await wait(180);
  state.restoredPreset=await evalPage('fx.preset');
 }
 report.visualToggles=[];
 for(const key of ['aeroWaterTheme','bloom','edge','cinema','backgroundStarRiver','lyricGlow','lyricGlowBeat','lyricGlowParticles','lyricVerticalFloat','floatLayer']){
  const logStart=report.logs.length;
  const change=await evalPage(`(()=>{const key=${JSON.stringify(key)},e=document.getElementById('t-'+(key==='floatLayer'?'float':key));const before=fx[key];if(e)e.click();return {key,before,after:fx[key],controlPresent:!!e,locked:isDevelopmentLockedFx(key),scope:visualEffectScope(key),floatLayerExists:!!floatGroup,backgroundRiverVisible:!!backgroundStarRiverParticles&&backgroundStarRiverParticles.visible,lyricPresent:!!stageLyrics.current};})()`);await wait(200);
  change.gpu=await gpuSnapshot();change.console=report.logs.slice(logStart).filter(x=>x.level>=2);
  await evalPage(`(()=>{const key=${JSON.stringify(key)};if(fx[key]!==__qaOriginalFx[key])toggleFx(key);})()`);change.restored=await evalPage(`fx[${JSON.stringify(key)}]===__qaOriginalFx[${JSON.stringify(key)}]`);report.visualToggles.push(change);
 }
 // Separate synthetic lyric geometry proof: original build/render functions,
 // fake text only, no track, stream, microphone or platform operation.
 const lyricLogStart=report.logs.length;
 await evalPage("window.__qaSyntheticLyricMesh=buildLyricMesh('隔离测试歌词 QA shader');scene.add(__qaSyntheticLyricMesh);primeLyricMeshOpacity(__qaSyntheticLyricMesh,1)");
 await evalPage("(async()=>{const d=__qaSyntheticLyricMesh.userData.lyric;for(let i=0;i<12;i++){updateLyricRowLayers(d,{opacity:.9,readability:.6,contextIntro:1,time:uniforms.uTime.value});await new Promise(r=>setTimeout(r,60));}})()");
 report.syntheticLyric={scope:'Synthetic fake-text geometry actually uploaded/rendered by original buildLyricMesh and updateLyricRowLayers; not song timing or audio playback.',rows:await evalPage("__qaSyntheticLyricMesh.userData.lyric.rowLayers.map(r=>({visible:r.mesh.visible,uploaded:r.renderLineUploaded,opacity:r.mat.uniforms&&r.mat.uniforms.uOpacity&&r.mat.uniforms.uOpacity.value}))"),gpu:await gpuSnapshot()};await shot('synthetic-lyric');
 report.syntheticLyric.console=report.logs.slice(lyricLogStart).filter(x=>x.level>=2);await evalPage("scene.remove(__qaSyntheticLyricMesh);disposeLyricMesh(__qaSyntheticLyricMesh);delete window.__qaSyntheticLyricMesh;setPreset(__qaOriginalPreset,{silent:true,noSave:true,skipTransition:true});homeSuppressed=false;updateEmptyHomeVisibility();");
 report.validation={splashLinked:report.splashColdStart.linked,presetShaderLinks:report.visualPresets.every(x=>!x.contextLost&&x.glError===0&&x.programs.every(p=>p.linked)),presetsRestored:report.visualPresets.every(x=>x.restoredPreset===report.visualPresets[0].restoredPreset),togglesRestored:report.visualToggles.every(x=>x.restored),noApiWrites:!report.requests.some(x=>x.type==='api-fixture'&&x.method!=='GET'),savedFontRestoredWithoutStartupAbort:report.savedFontColdStart.registeredSavedCount===1&&report.savedFontColdStart.renderer&&report.savedFontColdStart.ready==='complete'&&report.savedFontColdStart.homeRevealed&&report.savedFontColdStart.ownerMap&&!report.savedFontColdStart.remainingOwner,syntheticLyricActuallyUploaded:report.syntheticLyric.rows.length>0&&report.syntheticLyric.rows.every(r=>r.visible&&r.uploaded),properScreenshots:report.screenshots.every(x=>x.size&&x.size.width===1280&&x.size.height===820),noSplashShaderWarnings:!report.logs.some(x=>/Splash shader (compile|link) failed/.test(x.message))};
 report.sourceSnapshot.changedDuringRun=Object.keys(report.sourceSnapshot.files).filter(relative=>hashFile(relative)!==report.sourceSnapshot.files[relative]);
 fs.writeFileSync(path.join(out,'final-dom.html'),await evalPage('document.documentElement.outerHTML'));
 if(!Object.values(report.validation).every(Boolean))throw Error('Browser runtime validation failed: '+JSON.stringify(report.validation));
 await done(0);
}).catch(e=>done(1,e));
