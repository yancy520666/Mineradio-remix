'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.argv.includes('--child')) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-guide-ui-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const run = require('node:child_process').spawnSync(require('electron'), [__filename, '--child', temp, ...process.argv.slice(2)], {
      cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 120000, windowsHide: true,
    });
    assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
    const evidence = run.stdout.split('\n').find(line => line.startsWith('ONBOARDING_UI:'));
    assert(evidence, run.stdout); console.log(evidence);
  } finally {
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert(path.basename(temp).startsWith('mineradio-guide-ui-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  const temp = process.argv[process.argv.indexOf('--child') + 1];
  const shotIndex = process.argv.indexOf('--shots');
  const shots = shotIndex >= 0 ? path.resolve(process.argv[shotIndex + 1]) : '';
  const user = path.join(temp, 'user'); fs.mkdirSync(user);
  if (shots) fs.mkdirSync(shots, { recursive: true });
  app.setPath('appData', temp);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Guide QA ' + process.pid;
  process.env.MINERADIO_STARTUP_QA_USER_DATA = user;
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  app.commandLine.appendSwitch('mute-audio');
  fs.writeFileSync(path.join(user, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(temp, 'cache') }));
  fs.writeFileSync(path.join(user, 'onboarding-state.json'), JSON.stringify({ visual: true, login: true }));
  app.on('browser-window-created', (_event, win) => {
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] },
      (_details, callback) => callback({ cancel: true }));
  });
  require('../desktop/main');
  require('./helpers/electron-frames').keepTestWindowFramesRunning(app);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  setTimeout(() => { console.error('guide check timed out'); app.exit(2); }, 110000).unref();
  app.whenReady().then(async () => {
    let win;
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
      ready = win && await win.webContents.mainFrame.executeJavaScript('typeof startVisualGuide === "function" && document.readyState !== "loading"').catch(() => false);
      if (!ready) await wait(100);
    }
    assert(ready, 'Player did not initialize');
    const evaluate = script => win.webContents.mainFrame.executeJavaScript(script);
    win.webContents.debugger.attach('1.3');
    const mouse = (x, y) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    const capture = async name => { if (shots) fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
    await evaluate(`dismissSplash({instant:true}); markStartupGuideSeen('login'); startupLoginGuideShown=true; closeLoginModal(); true`);
    if (shots) win.show();
    await wait(1200);
    const results = [];
    const snapshot = `(() => {
      const box = el => { const r=el.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
      const step=visualGuideSteps[visualGuideStep], target=guideTargetRect(step);
      const ring=box(document.getElementById('visual-guide-ring')), card=box(document.getElementById('visual-guide-card'));
      const panel=document.getElementById('fx-panel'), shell=document.getElementById('desktop-window-shell');
      return {key:step.key,target,ring,card,w:innerWidth,h:innerHeight,
        shellScroll:[shell.scrollLeft,shell.scrollTop], rootScroll:[scrollX,scrollY],
        bottomOpacity:Number(getComputedStyle(document.getElementById('bottom-bar')).opacity),
        playlistPeek:document.getElementById('playlist-panel').classList.contains('peek'),
        panelOpen:panel.classList.contains('peek')||panel.classList.contains('show'),
        panelOpacity:Number(getComputedStyle(panel).opacity), title:document.getElementById('visual-guide-title').textContent};
    })()`;
    const verify = (state, bounds) => {
      assert.deepEqual(win.getBounds(), bounds, state.key + ' resized or moved the window');
      assert.deepEqual(state.shellScroll, [0, 0], state.key + ' scrolled the desktop shell');
      assert.deepEqual(state.rootScroll, [0, 0], state.key + ' scrolled the document');
      assert.equal(state.playlistPeek, false, state.key + ' pointer opened an unrelated playlist panel');
      assert(state.card.left >= 15 && state.card.top >= 15 && state.card.right <= state.w - 15 && state.card.bottom <= state.h - 15,
        state.key + ' card escapes the viewport: ' + JSON.stringify(state));
      if (state.key === 'welcome') return;
      assert(state.target && state.target.width > 0 && state.target.height > 0, state.key + ' has no visible target');
      for (const edge of ['left', 'top', 'right', 'bottom']) {
        const expected = edge === 'left' || edge === 'top' ? Math.max(4, state.target[edge] - 6)
          : Math.min((edge === 'right' ? state.w : state.h) - 4, state.target[edge] + 6);
        assert(Math.abs(state.ring[edge] - expected) <= 2, state.key + ' ring misses ' + edge + ': ' + JSON.stringify(state));
      }
      const overlap = Math.max(0, Math.min(state.card.right,state.ring.right)-Math.max(state.card.left,state.ring.left))
        * Math.max(0, Math.min(state.card.bottom,state.ring.bottom)-Math.max(state.card.top,state.ring.top));
      assert(overlap <= 1, state.key + ' card covers its target');
      if (state.key === 'comments' || state.key === 'quality') assert(state.bottomOpacity > .5, 'Control bar is hidden');
      if (state.key === 'background' || state.key === 'wallpaper') assert(state.panelOpen && state.panelOpacity > .9, 'Console is hidden');
    };
    for (const size of [[1280,820], [960,600]]) {
      win.setSize(...size); await wait(400);
      await evaluate(`closeVisualGuide(false); applyDiyMode(false,{save:false}); controlsAutoHide=true;
        controlsHovering=false; controlsRevealHoldUntil=0; setHomeControlsLocked(true);
        document.getElementById('bottom-bar').classList.remove('visible','soft-hidden');
        document.getElementById('control-title-text').textContent='引导测试歌曲';
        document.getElementById('control-artist').textContent='隔离测试歌手';
        window.guideQaPref=localStorage.getItem('mineradio-diy-player-mode-v1'); startVisualGuide({manual:true}); true`);
      const bounds = win.getBounds();
      for (let index=0; index<8; index++) {
        await evaluate(`showVisualGuideStep(${index}); true`); await wait(1600);
        let state = await evaluate(snapshot);
        await mouse(state.card.left + 20, state.card.top + 20);
        if (index === 2 || index === 3) {
          await evaluate('controlsHovering=false; controlsRevealHoldUntil=0; setControlsHidden(true); scheduleControlsHide(10); true');
          await wait(index === 3 ? 2800 : 500);
        } else await wait(300);
        state = await evaluate(snapshot); verify(state, bounds);
        if ([3,4,5,7].includes(index)) await capture(size.join('x') + '-' + state.key);
        results.push({size:size.join('x'),step:state.key,target:state.target,ring:state.ring,card:state.card});
      }
      await evaluate('closeVisualGuide(true); true'); await wait(400);
      assert(await evaluate(`!diyPlayerMode && localStorage.getItem('mineradio-diy-player-mode-v1')===guideQaPref
        && document.body.classList.contains('home-controls-locked') && !document.getElementById('fx-panel').classList.contains('peek')`), 'Simple/Home preferences were not restored');
      // Check reopening on an existing DIY console, including a folded background group.
      await evaluate(`applyDiyMode(true,{save:false}); setHomeControlsLocked(false); setFxPanelTab('lyrics',{scroll:false});
        setPeek(document.getElementById('fx-panel'),true,'fx'); fxPanelPinned=true; true`);
      await wait(600);
      await evaluate(`document.getElementById('fx-panel').scrollTop=90; window.guideQaScroll=document.getElementById('fx-panel').scrollTop;
        window.guideQaFold=document.querySelector('.bg-media-row').closest('.fx-console-group');
        guideQaFold.classList.remove('open'); startVisualGuide({manual:true}); showVisualGuideStep(5); true`);
      await wait(1600); verify(await evaluate(snapshot), bounds);
      assert(await evaluate('guideQaFold.classList.contains("open")'), 'Closed background group was not revealed');
      await evaluate('nextVisualGuideStep(); prevVisualGuideStep(); true'); await wait(1500);
      verify(await evaluate(snapshot), bounds);
      await evaluate('closeVisualGuide(true); true'); await wait(100);
      assert(await evaluate(`diyPlayerMode && fxPanelPinned && fxPanelTab==='lyrics'
        && document.getElementById('fx-panel').classList.contains('peek')
        && Math.abs(document.getElementById('fx-panel').scrollTop-guideQaScroll)<1 && !guideQaFold.classList.contains('open')`), 'Existing console state was not restored');
    }
    // Native fullscreen must stay fullscreen while the real titlebar targets appear.
    await evaluate('closeVisualGuide(false); window.desktopWindow.toggleFullscreen()'); await wait(1100);
    const fullBounds = win.getBounds();
    assert(await evaluate('desktopFullscreenActive'), 'Native fullscreen did not activate');
    await evaluate('startVisualGuide({manual:true}); true');
    for (const index of [4,5,7]) {
      await evaluate(`showVisualGuideStep(${index}); true`); await wait(1800);
      const state=await evaluate(snapshot); verify(state,fullBounds);
      await capture('fullscreen-' + state.key); results.push({size:'fullscreen',step:state.key,target:state.target,ring:state.ring,card:state.card});
    }
    await evaluate('closeVisualGuide(true); true'); await wait(200);
    assert(await evaluate('desktopFullscreenActive && getComputedStyle(document.getElementById("desktop-titlebar")).display==="none"'), 'Fullscreen titlebar override leaked after close');
    assert.deepEqual(win.getBounds(),fullBounds);
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name:'prefers-reduced-motion', value:'reduce' }] });
    await evaluate('startVisualGuide({manual:true}); showVisualGuideStep(6); true'); await wait(1200);
    verify(await evaluate(snapshot),fullBounds);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
    assert(await evaluate('!visualGuideActive'), 'Escape did not skip the guide');
    // A user-selected mode survives; closing during a pending content swap cannot reopen the card.
    await evaluate(`applyDiyMode(false,{save:false}); startVisualGuide({manual:true}); showVisualGuideStep(4); toggleDiyMode();
      showVisualGuideStep(5); closeVisualGuide(true); true`); await wait(1000);
    assert(await evaluate('diyPlayerMode && localStorage.getItem("mineradio-diy-player-mode-v1")==="1" && !document.getElementById("visual-guide-card").classList.contains("is-ready")'), 'Manual mode choice or close cleanup failed');
    console.log('ONBOARDING_UI:' + JSON.stringify({steps:results,restored:true,manualChoice:true,fullscreen:true}));
    app.exit(0);
  }).catch(error => { console.error(error.stack || error); app.exit(1); });
}
