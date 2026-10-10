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
  // Hidden QA windows must render the guide transitions; production still
  // throttles hidden/minimized windows. Set before desktop/main reads it.
  process.env.MINERADIO_KEEP_BACKGROUND_RENDERING = '1';
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
      return {key:step.key,active:visualGuideActive,ready:visualGuideStepReady,swapping:document.getElementById('visual-guide-card').classList.contains('is-swapping'),
        center:!!step.center,target,loginOpen:document.getElementById('login-modal').classList.contains('show'),ring,card,w:innerWidth,h:innerHeight,
        shellScroll:[shell.scrollLeft,shell.scrollTop], rootScroll:[scrollX,scrollY],
        bottomOpacity:Number(getComputedStyle(document.getElementById('bottom-bar')).opacity),
        playlistPeek:document.getElementById('playlist-panel').classList.contains('peek'),
        panelOpen:panel.classList.contains('peek')||panel.classList.contains('show'),
        panelOpacity:Number(getComputedStyle(panel).opacity), title:document.getElementById('visual-guide-title').textContent,
        body:document.getElementById('visual-guide-body').textContent, hint:document.getElementById('visual-guide-hint').textContent};
    })()`;
    const waitForGuideStep = async key => {
      const deadline = Date.now() + 8000;
      let state;
      while (Date.now() < deadline) {
        state = await evaluate(snapshot);
        if (state.active && state.key === key && state.ready && !state.swapping) return state;
        await wait(40);
      }
      assert.fail(key + ' guide target/ring/card did not settle: ' + JSON.stringify(state));
    };
    const verify = (state, bounds) => {
      assert.deepEqual(win.getBounds(), bounds, state.key + ' resized or moved the window');
      assert.deepEqual(state.shellScroll, [0, 0], state.key + ' scrolled the desktop shell');
      assert.deepEqual(state.rootScroll, [0, 0], state.key + ' scrolled the document');
      assert.equal(state.playlistPeek, false, state.key + ' pointer opened an unrelated playlist panel');
      assert(state.card.left >= 15 && state.card.top >= 15 && state.card.right <= state.w - 15 && state.card.bottom <= state.h - 15,
        state.key + ' card escapes the viewport: ' + JSON.stringify(state));
      if (state.center) return;
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
      if (state.key === 'quality') assert.match(state.body, /先搜索并播放/, 'Empty player suggests an existing track');
      if (state.key === 'comments') assert.match(state.hint, /无需先登录/, 'Empty player requires login to continue');
      if (['presets', 'aero', 'background', 'wallpaper', 'shelf'].includes(state.key)) assert(state.panelOpen && state.panelOpacity > .9, 'Console is hidden');
      assert.equal(state.loginOpen, state.key === 'login', state.key + ' login panel state');
    };
    assert(await evaluate('!hasAnyPlatformLogin() && playQueue.length===0 && !currentCoverSong()'), 'QA must start without accounts or songs');
    for (const size of [[1280,820], [960,600]]) {
      win.setSize(...size); await wait(400);
      await evaluate(`closeVisualGuide(false); applyDiyMode(false,{save:false}); controlsAutoHide=true;
        controlsHovering=false; controlsRevealHoldUntil=0; setHomeControlsLocked(true);
        document.getElementById('bottom-bar').classList.remove('visible','soft-hidden');
        window.guideQaPref=localStorage.getItem('mineradio-diy-player-mode-v1'); true`);
      if (size[0] === 1280) {
        await evaluate(`startupOnboardingState.visual=false; localStorage.removeItem(startupGuideStoreKey('visual'));
          maybeRunStartupVisualGuide('empty-player-qa'); true`);
        await waitForGuideStep('welcome');
        assert(await evaluate('visualGuideActive'), 'First-run guide did not start for a logged-out empty player');
      } else await evaluate('startVisualGuide({manual:true}); true');
      const bounds = win.getBounds();
      const stepCount = await evaluate('visualGuideSteps.length');
      for (let index=0; index<stepCount; index++) {
        const key = await evaluate(`showVisualGuideStep(${index}); activeVisualGuideSteps()[visualGuideStep].key`);
        let state = await waitForGuideStep(key);
        await mouse(state.card.left + 20, state.card.top + 20);
        if (index === 2 || index === 3) {
          await evaluate('controlsHovering=false; controlsRevealHoldUntil=0; setControlsHidden(true); scheduleControlsHide(10); true');
          await wait(index === 3 ? 2800 : 500);
        }
        state = await waitForGuideStep(key); verify(state, bounds);
        await capture(size.join('x') + '-' + state.key);
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
        guideQaFold.classList.remove('open'); startVisualGuide({manual:true}); showVisualGuideStep(visualGuideSteps.findIndex(s=>s.key==='background')); true`);
      verify(await waitForGuideStep('background'), bounds);
      assert(await evaluate('guideQaFold.classList.contains("open")'), 'Closed background group was not revealed');
      await evaluate('nextVisualGuideStep(); prevVisualGuideStep(); true');
      verify(await waitForGuideStep('background'), bounds);
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
    for (const key of ['diy','background','login']) {
      await evaluate(`showVisualGuideStep(visualGuideSteps.findIndex(s=>s.key==='${key}')); true`);
      const state=await waitForGuideStep(key); verify(state,fullBounds);
      await capture('fullscreen-' + state.key); results.push({size:'fullscreen',step:state.key,target:state.target,ring:state.ring,card:state.card});
    }
    await evaluate('closeVisualGuide(true); true'); await wait(200);
    assert(await evaluate('desktopFullscreenActive && getComputedStyle(document.getElementById("desktop-titlebar")).display==="none"'), 'Fullscreen titlebar override leaked after close');
    assert.deepEqual(win.getBounds(),fullBounds);
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name:'prefers-reduced-motion', value:'reduce' }] });
    await evaluate(`startVisualGuide({manual:true}); showVisualGuideStep(visualGuideSteps.findIndex(s=>s.key==='wallpaper')); true`);
    verify(await waitForGuideStep('wallpaper'),fullBounds);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
    assert(await evaluate('!visualGuideActive'), 'Escape did not skip the guide');
    // Finishing on the login step leaves the panel open; skipping there closes it.
    await evaluate('startVisualGuide({manual:true}); showVisualGuideStep(visualGuideSteps.length-1); true'); await waitForGuideStep('login');
    assert(await evaluate(`document.getElementById('login-modal').classList.contains('show') && document.getElementById('visual-guide-wire').style.opacity !== ''`), 'Login step did not open the panel or play the wire');
    await evaluate('nextVisualGuideStep(); true'); await wait(600);
    assert(await evaluate(`!visualGuideActive && document.getElementById('login-modal').classList.contains('show') && startupGuideWasSeen('login')`), 'Finishing the guide closed the login panel');
    await evaluate('closeLoginModal(); true'); await wait(600);
    await evaluate('startVisualGuide({manual:true}); showVisualGuideStep(visualGuideSteps.length-1); true'); await waitForGuideStep('login');
    await evaluate('closeVisualGuide(true); true'); await wait(600);
    assert(await evaluate(`!document.getElementById('login-modal').classList.contains('show')`), 'Skipping on the login step left the panel open');
    // A user-selected mode survives; closing during a pending content swap cannot reopen the card.
    await evaluate(`applyDiyMode(false,{save:false}); startVisualGuide({manual:true}); showVisualGuideStep(4); toggleDiyMode();
      showVisualGuideStep(5); closeVisualGuide(true); true`); await wait(1000);
    assert(await evaluate('diyPlayerMode && localStorage.getItem("mineradio-diy-player-mode-v1")==="1" && !document.getElementById("visual-guide-card").classList.contains("is-ready")'), 'Manual mode choice or close cleanup failed');
    console.log('ONBOARDING_UI:' + JSON.stringify({steps:results,restored:true,manualChoice:true,fullscreen:true}));
    app.exit(0);
  }).catch(error => { console.error(error.stack || error); app.exit(1); });
}
