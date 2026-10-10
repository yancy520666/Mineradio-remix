'use strict';
// Read-only startup console attribution controls; no Mineradio application code.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const temp=fs.mkdtempSync('/tmp/mineradio-html-controls-');app.setPath('userData',path.join(temp,'profile'));app.setPath('sessionData',path.join(temp,'session'));
app.on('window-all-closed',()=>{});
const report={scope:'Identical ordinary BrowserWindow loopback HTML controls, no production code or credentials.',cases:[]};
const pages={empty:'<p>Empty HTML control</p>',sameCsp:'<p>Same CSP, ordinary inline control</p><script>var ordinaryControl=1;</script>',sourceUrl:'<p>Dynamic inline sourceURL control</p><script>const s=document.createElement("script");s.text="var ordinaryControl=1;\\n//# sourceURL=ordinary-control-inline.js";document.head.appendChild(s);</script>'};
app.whenReady().then(async()=>{
 const server=http.createServer((req,res)=>{const name=req.url.slice(1);res.setHeader('Content-Type','text/html');if(name!=='empty')res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");res.end('<!doctype html><meta charset="utf-8"><title>Console control</title>'+pages[name]);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(const name of Object.keys(pages)){
  const result={name,logs:[],exceptions:[],contexts:[]};
  const win=new BrowserWindow({width:1280,height:820,minWidth:1280,minHeight:820,frame:false,show:true,webPreferences:{partition:'qa-control-'+name+'-'+process.pid,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.on('console-message',(_e,...a)=>result.logs.push(typeof a[0]==='object'?a[0]:{level:a[0],message:a[1],lineNumber:a[2],sourceId:a[3]}));
  win.webContents.debugger.attach('1.3');
  win.webContents.debugger.on('message',(_e,m,p)=>{if(m==='Runtime.exceptionThrown'){result.exceptions.push(p.exceptionDetails);const f=p.exceptionDetails.stackTrace&&p.exceptionDetails.stackTrace.callFrames[0];if(f)win.webContents.debugger.sendCommand('Debugger.getScriptSource',{scriptId:f.scriptId}).then(s=>{const line=s.scriptSource.split('\n')[f.lineNumber];result.contexts.push(line.slice(Math.max(0,f.columnNumber-220),f.columnNumber+220));}).catch(e=>result.contexts.push(String(e)));}});
  win.webContents.debugger.sendCommand('Debugger.enable').catch(()=>{});win.webContents.debugger.sendCommand('Runtime.enable').catch(()=>{});
  await win.loadURL('http://127.0.0.1:'+server.address().port+'/'+name);await new Promise(r=>setTimeout(r,1300));
  result.browser=await win.webContents.mainFrame.executeJavaScript('({width:innerWidth,height:innerHeight,node:typeof require,bridge:typeof window.desktopWindow})');
  report.cases.push(result);win.destroy();
 }
 fs.writeFileSync(path.join(process.env.MINERADIO_QA_OUTPUT||temp,'empty-html-controls.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));server.close();app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
