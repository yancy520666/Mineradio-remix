'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
if (!process.argv.includes('--child')) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-queue-pause-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const run = spawnSync(require('electron'), [__filename, '--child', profile], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, run.stderr + run.stdout + String(run.error || ''));
    const evidence = run.stdout.split('\n').find(line => line.startsWith('QUEUE_PAUSE:'));
    assert(evidence, run.stdout); console.log(evidence);
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow } = require('electron');
  const profile = process.argv[process.argv.indexOf('--child') + 1];
  app.setPath('appData', profile);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Queue Pause QA';
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  process.env.MINERADIO_STARTUP_QA_USER_DATA = path.join(profile, 'user');
  fs.mkdirSync(process.env.MINERADIO_STARTUP_QA_USER_DATA, { recursive: true });
  fs.writeFileSync(path.join(process.env.MINERADIO_STARTUP_QA_USER_DATA, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(profile, 'cache') }));
  app.on('browser-window-created', (_event, win) => {
    win.webContents.setAudioMuted(true);
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] }, (_details, callback) => callback({ cancel: true }));
  });
  require('../desktop/main');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    let win, ready; const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
      if (win) ready = await win.webContents.executeJavaScript('typeof togglePlay === "function" && typeof renderMiniQueuePanel === "function" && document.readyState !== "loading"').catch(() => false);
      if (ready) break;
      await sleep(50);
    }
    assert(ready, 'renderer must initialize');
    const result = await win.webContents.executeJavaScript(`(async () => {
      dismissSplash({instant:true}); closeVisualGuide(false);
      playQueue = Array.from({length:6}, (_,i)=>({id:i+1,name:'Queue '+i,artist:'QA',type:'local',localKey:'qa-'+i})); currentIdx=0;
      queueViewTab='queue';
      document.getElementById('playlist-panel').classList.add('show','pinned');
      document.getElementById('queue-pane').style.display=''; document.getElementById('pl-pane').style.display='none';
      renderQueuePanel({animate:false,scrollCurrent:false}); setMiniQueueOpen(true);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const buttons=Array.from(document.querySelectorAll('.mini-queue-remove, .qi-act button[title="下一首播放"], .qi-act button[title="移除"]'));
      const centers=buttons.map(button=>{
        const svg=button.querySelector('svg'),b=button.getBoundingClientRect(),s=svg.getBoundingClientRect(),ink=svg.getBBox();
        return {title:button.title,offset:[(s.left+s.right-b.left-b.right)/2,(s.top+s.bottom-b.top-b.bottom)/2],ink:[ink.x+ink.width/2-12,ink.y+ink.height/2-12]};
      });
      const selected=playQueue[3];
      document.querySelectorAll('.mini-queue-next')[3].click(); const nextWorks=playQueue[1]===selected;
      const beforeRemove=playQueue.length; document.querySelectorAll('.mini-queue-remove:not(.mini-queue-next)')[2].click();
      const removeWorks=playQueue.length===beforeRemove-1;
      closeMiniQueue();
      // A silent local WAV exercises the real HTMLMediaElement and production controls.
      const buffer=new ArrayBuffer(44+8000*2*5),view=new DataView(buffer);
      const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
      text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
      view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
      text(36,'data');view.setUint32(40,buffer.byteLength-44,true);
      const url=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
      playQueue=[{id:99,name:'Pause fixture',type:'local',localKey:'pause-qa',localUrl:url}]; currentIdx=0;
      audio=new Audio();
      audio.src=url;audio.loop=true;audio.__mineradioQueueItemKey=queueItemKey(playQueue[0]);
      initAudio();await ensurePlaybackAudioGraph('qa');await audio.play();playing=true;restorePlaybackGain();
      const samples=[];
      for(let i=0;i<6;i++) {
        window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));
        const start=performance.now();
        if(i%2===0) document.getElementById('play-btn').click();
        else {document.activeElement.blur();document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));}
        // Restore notifications used by Alt+Tab arrive while the fade is pending.
        await new Promise(resolve=>setTimeout(resolve,40));
        window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));
        const until=Date.now()+2000;
        while((!audio.paused || playToggleBusy) && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,20));
        samples.push({input:i%2===0?'click':'space',paused:audio.paused,busy:playToggleBusy,ms:Math.round(performance.now()-start)});
        await togglePlay();
      }
      audio.pause(); URL.revokeObjectURL(url);
      return {centers,nextWorks,removeWorks,samples};
    })()`);
    assert(result.centers.length > 0);
    for (const center of result.centers) assert(center.offset.concat(center.ink).every(value => Math.abs(value) < 0.1), JSON.stringify(center));
    assert(result.nextWorks && result.removeWorks);
    for (const sample of result.samples) assert(sample.paused && !sample.busy, JSON.stringify(sample));
    console.log('QUEUE_PAUSE:' + JSON.stringify({ buttons: result.centers.length, maxCenterOffset: Math.max(...result.centers.flatMap(c => c.offset.concat(c.ink).map(Math.abs))), nextWorks: result.nextWorks, removeWorks: result.removeWorks, focusEventsSimulated: true, samples: result.samples }));
    app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
