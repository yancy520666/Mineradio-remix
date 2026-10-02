'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!process.argv.includes('--child')) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-focus-work-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const run = spawnSync(require('electron'), [__filename, '--child', profile], {
      cwd: root, env, encoding: 'utf8', timeout: 25000, windowsHide: true,
    });
    assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
    console.log(run.stdout.split('\n').find(line => line.startsWith('FOCUS_WORK:')));
  } finally {
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert(path.basename(profile).startsWith('mineradio-focus-work-'));
    fs.rmSync(profile, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', process.argv[process.argv.indexOf('--child') + 1]);
  let win;
  app.whenReady().then(async () => {
    win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await win.loadFile(path.join(root, 'public/index.html'));
    await new Promise(resolve => setTimeout(resolve, 2200));
    const before = execFileSync('git', ['show', 'c324101:public/js/modules/02-visual/15-ripples-cover-depth.js'], { cwd: root, encoding: 'utf8' });
    const start = before.indexOf('function recoverVisualsAfterBackground(');
    const end = before.indexOf('\nfunction ', start + 1);
    assert(start >= 0 && end > start);
    const result = await win.webContents.executeJavaScript(`(async () => {
      dismissSplash({instant:true});
      Object.assign(desktopRuntimeState,{desktop:true,visible:true,minimized:false,focused:true});
      const current=recoverVisualsAfterBackground;
      const previous=(${before.slice(start, end)});
      const nativeProjection=camera.updateProjectionMatrix.bind(camera);
      let projections=0,viewportRefreshes=0;
      camera.updateProjectionMatrix=()=>{projections++;return nativeProjection()};
      const nativeViewport=refreshMainRendererViewport;
      refreshMainRendererViewport=(...args)=>{viewportRefreshes++;return nativeViewport(...args)};
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      async function sample(old) {
        const frames=[],longTasks=[];let done=false,last=0;
        const observer=new PerformanceObserver(list=>list.getEntries().forEach(e=>longTasks.push(e.duration)));
        observer.observe({type:'longtask',buffered:false});
        function frame(at){if(last)frames.push(at-last);last=at;if(!done)requestAnimationFrame(frame)}
        requestAnimationFrame(frame);
        const blur=()=>previous('blur');
        if(old)window.addEventListener('blur',blur);
        recoverVisualsAfterBackground=old?previous:current;
        projections=0;viewportRefreshes=0;
        for(let i=0;i<20;i++){window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));await wait(40)}
        await wait(400);done=true;observer.disconnect();
        if(old)window.removeEventListener('blur',blur);
        frames.sort((a,b)=>a-b);
        return {viewportRefreshes,projectionRefreshes:projections,frameSamples:frames.length,p95FrameMs:Number((frames[Math.floor(frames.length*.95)]||0).toFixed(2)),longTasks:longTasks.length};
      }
      await wait(350);
      const old=await sample(true),updated=await sample(false);
      recoverVisualsAfterBackground=current;
      return {old,updated,canvasWidth:renderer.domElement.width};
    })()`);
    assert(result.canvasWidth > 100);
    console.log('FOCUS_WORK:' + JSON.stringify(result));
    assert.equal(result.old.viewportRefreshes, 160); assert.equal(result.updated.viewportRefreshes, 0);
    assert(result.updated.frameSamples > 10, 'rendering continues through visible focus changes');
    win.destroy(); app.exit(0);
  }).catch(error => { console.error(error.stack || error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); });
}
