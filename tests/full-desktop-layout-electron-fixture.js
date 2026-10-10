'use strict';
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'mineradio-desktop-layout-'));
app.setPath('userData',profile);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let html=read('public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
html=html.replace('</head>',`<link rel="stylesheet" href="${pathToFileURL(path.join(root,'public/css/index.css'))}"></head>`);
const page=path.join(profile,'fixture.html');fs.writeFileSync(page,html);
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,cb)=>cb({cancel:true}));
 const win=new BrowserWindow({width:1280,height:900,frame:false,show:true,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
 await win.loadFile(page);
 const run=s=>win.webContents.executeJavaScript(s);
 const prefs=read('public/js/modules/00-state/02-preferences-ui-modes.js');
 const shell=read('public/js/modules/10-shell/04-desktop-overlay-fullscreen.js');
 await run(`var desktopRuntimeState={fullscreen:false},desktopFullscreenActive=false,visualGuideActive=false,immersiveMode=false,desktopWallpaperRuntimeState={};var calls=[];function desktopUsesLayeredExplorerColorkey(){return false} function desktopIconsAreVisible(){return true} function setDesktopModeControlsOpen(v){document.body.classList.toggle('desktop-mode-controls-open',v)} function setDesktopModeControlPeek(){} function startVisualGuide(){calls.push('guide')} function toggleDiyMode(){calls.push('diy')} `+prefs.slice(prefs.indexOf('function isFullscreenPlayerLayout()'),prefs.indexOf('function isDiyMode()'))+shell.slice(shell.indexOf('function syncDesktopWallpaperBodyClasses('),shell.indexOf('function releaseDesktopWallpaperStartupVisibilityGate(')));
 await run(`document.body.className='desktop-shell';document.getElementById('splash').style.display='none';document.getElementById('loading-overlay').style.display='none';`);
 const results=[];
 for(const width of [1280,700]){
  win.setSize(width,900);
  for(const mode of ['fullscreen','desktop','desktop-panel','window']){
   await run(`desktopRuntimeState.fullscreen=${mode==='fullscreen'};document.body.classList.toggle('desktop-fullscreen',${mode==='fullscreen'});syncDesktopWallpaperBodyClasses({},${mode.startsWith('desktop')},${mode.startsWith('desktop')});setDesktopModeControlsOpen(${mode==='desktop-panel'});`);
   await wait(100);
   await run(`var zone=layoutFullscreenDiyZone();updateFullscreenDiyPeekFromPointer(zone.left+zone.width/2,zone.top+zone.height/2);`);await run("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");await wait(700);
   const result=await run(`(()=>{const ids=['fullscreen-diy-btn'];return {layout:isFullscreenPlayerLayout(),titlebar:getComputedStyle(document.getElementById('desktop-titlebar')).display,zone:getComputedStyle(document.getElementById('fullscreen-diy-zone')).display,buttons:ids.map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect(),s=getComputedStyle(el);return {id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,opacity:s.opacity,pointer:s.pointerEvents,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.id}})}})()`);
   assert.equal(result.layout,mode!=='window');assert.equal(result.zone,mode==='window'?'none':'flex');
   if(mode!=='window')for(const b of result.buttons){assert.equal(b.opacity,'1');assert.equal(b.pointer,'auto');assert.equal(b.hit,b.id);assert.ok(b.left>=0&&b.right<=width&&b.top>=0&&b.bottom<=900);}
   else assert.notEqual(result.titlebar,'none');
   results.push({width,mode,...result});
   if(width===1280&&mode==='desktop') fs.writeFileSync(path.join(profile,'desktop-layout.png'),(await win.webContents.capturePage()).toPNG());
  }
 }
 assert.equal(await run("document.getElementById('fullscreen-visual-guide-btn') === null"),true);
 await run(`document.getElementById('fullscreen-diy-btn').click();`);assert.deepEqual(await run('calls'),['diy']);
 fs.writeFileSync(path.join(profile,'verification.json'),JSON.stringify({passed:true,profile,results},null,2));
 app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(profile,'verification.json'),JSON.stringify({passed:false,error:error.stack}));app.exit(1)});
