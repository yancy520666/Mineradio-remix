'use strict';
// Incremental QA entry: reuse the original full-frontend render fixture unchanged.
// Only a generated eight-byte Blob is stored in the fixture's fresh IndexedDB.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..','..','..');
const out=path.resolve(process.env.MINERADIO_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'mineradio-incremental-idb-')));
fs.mkdirSync(out,{recursive:true});process.env.MINERADIO_QA_OUTPUT=out;
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const commit='bc5258d6dc2d437f677d6b7fcc45ece7ad19988b';
const loader=fs.readFileSync(path.join(root,'public/js/index-loader.js'),'utf8');
const manifest=[...loader.split('const modulePaths = [')[1].split('];')[0].matchAll(/'([^']+)'/g)].map(m=>'public/'+m[1]);
const production=[...new Set(manifest.concat(['public/index.html','public/css/index.css','public/js/index-loader.js','server.js']))];
const report={scope:'Incremental bc5258d full original frontend cold-start/Splash/render + original real IndexedDB successful put/get contract. Reuses scripts/qa/browser-runtime-render-check.js. Earlier 13-preset run remains bound to 7cf5cce. No desktop bridge/Windows/accounts/network audio/permissions or failure injection is validated here.',productionCommit:commit,sourceBefore:{},runtimeExceptions:[],idb:null};
for(const relative of production){const bytes=fs.readFileSync(path.join(root,relative)),committed=spawnSync('git',['show',commit+':'+relative],{cwd:root});report.sourceBefore[relative]={sha256:hash(bytes),matchesCommit:committed.status===0&&hash(committed.stdout)===hash(bytes)};}
let work=Promise.resolve(),loads=0;
app.on('browser-window-created',(_event,win)=>{
 win.webContents.debugger.attach('1.3');
 win.webContents.debugger.on('message',(_e,m,p)=>{if(m==='Runtime.exceptionThrown')report.runtimeExceptions.push(p.exceptionDetails);});
 win.webContents.debugger.sendCommand('Runtime.enable').catch(e=>report.debuggerError=String(e));
 win.webContents.on('did-finish-load',()=>{
  if(++loads!==2)return;
  work=(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   const deadline=Date.now()+10000;
   while(!await win.webContents.mainFrame.executeJavaScript("typeof putCustomBackgroundBlob==='function'&&typeof getCustomBackgroundBlob==='function'&&typeof renderer!=='undefined'&&!!renderer")){
    if(Date.now()>deadline)throw Error('Original full frontend IDB functions were not initialized');await wait(100);
   }
   report.idb=await win.webContents.mainFrame.executeJavaScript(`(async()=>{
    const bytes=new Uint8Array([81,65,0,1,2,3,254,255]);
    const blob=new Blob([bytes],{type:'application/octet-stream'});
    const id='qa-generated-idb-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const beforeMedia=JSON.stringify(fx.backgroundMedia);
    const started=performance.now();
    const putResult=await putCustomBackgroundBlob(id,blob,{name:'QA generated eight bytes',mime:blob.type,size:blob.size});
    const read=await getCustomBackgroundBlob(id);
    const actual=read?Array.from(new Uint8Array(await read.arrayBuffer())):null;
    const missing=await getCustomBackgroundBlob(id+'-missing');
    return {id,database:CUSTOM_BG_DB_NAME,store:CUSTOM_BG_STORE,realIndexedDb:!!window.indexedDB,originalPutType:typeof putCustomBackgroundBlob,originalGetType:typeof getCustomBackgroundBlob,putReturnType:typeof putResult,inputBytes:Array.from(bytes),readBytes:actual,inputSize:blob.size,readSize:read&&read.size,readType:read&&read.type,readIsBlob:read instanceof Blob,missingIsNull:missing===null,unchangedBackgroundMedia:beforeMedia===JSON.stringify(fx.backgroundMedia),elapsedMs:performance.now()-started,assertions:{putResolvedUndefined:typeof putResult==='undefined',roundTripSameBytes:JSON.stringify(actual)===JSON.stringify(Array.from(bytes)),realBlob:read instanceof Blob,metadataTypePreserved:read&&read.type===blob.type,missingReturnsNull:missing===null,backgroundMediaUnchanged:beforeMedia===JSON.stringify(fx.backgroundMedia)}};
   })()`);
  })().catch(e=>{report.idbError=String(e.stack||e);});
 });
});
const realExit=app.exit.bind(app);
let exiting=false;
app.exit=code=>{
 if(exiting)return;exiting=true;
 (async()=>{
  await Promise.race([work,new Promise((_,reject)=>setTimeout(()=>reject(Error('Incremental IDB smoke timeout')),12000))]);
  const original=JSON.parse(fs.readFileSync(path.join(out,'result.json'),'utf8'));
  report.render={originalExitCode:code,splash:original.splashColdStart,lyricRows:original.lyricRows,syntheticGpu:original.syntheticLyric&&original.syntheticLyric.gpu,workshopHealth:original.workshopRuntime,originalValidation:original.validation};
  const loaded=new Set(original.requests.filter(r=>r.type==='real-static-completed'&&r.status===200).map(r=>r.path));
  report.manifestEntries=manifest.length;report.manifestEntriesLoaded=manifest.filter(p=>loaded.has('/'+p.slice(7))).length;
  report.sourceChangedDuringRun=production.filter(p=>hash(fs.readFileSync(path.join(root,p)))!==report.sourceBefore[p].sha256);
  report.validation={originalExited0:code===0,splashProgramLinked:!!original.splashColdStart&&original.splashColdStart.isProgram&&original.splashColdStart.linked&&original.splashColdStart.glError===0,lyricActuallyUploaded:!!original.lyricRows&&original.lyricRows.length>0&&original.lyricRows.every(r=>r.visible&&r.uploaded&&r.opacity>0),lyricGpuLinked:!!original.syntheticLyric&&original.syntheticLyric.gpu.programs.length>0&&original.syntheticLyric.gpu.programs.every(p=>p.linked)&&original.syntheticLyric.gpu.glError===0,allOriginalScriptsLoaded:report.manifestEntriesLoaded===manifest.length,idbRoundTripPassed:!!report.idb&&Object.values(report.idb.assertions).every(Boolean),productionMatchesCommit:Object.values(report.sourceBefore).every(x=>x.matchesCommit),sourceStable:report.sourceChangedDuringRun.length===0};
  fs.writeFileSync(path.join(out,'incremental-result.json'),JSON.stringify(report,null,2));
  console.log('QA_INCREMENTAL '+JSON.stringify({validation:report.validation,idb:report.idb,error:report.idbError,result:path.join(out,'incremental-result.json')}));
  realExit(Object.values(report.validation).every(Boolean)?0:1);
 })().catch(e=>{report.error=String(e.stack||e);fs.writeFileSync(path.join(out,'incremental-result.json'),JSON.stringify(report,null,2));realExit(1);});
};
require(path.join(root,'scripts/qa/browser-runtime-render-check.js'));
