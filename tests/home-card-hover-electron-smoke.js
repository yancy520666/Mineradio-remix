'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.argv.includes('--child')) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-card-hover-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const run = require('node:child_process').spawnSync(require('electron'), [__filename, '--child', temp, ...process.argv.slice(2)], {
      cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
    const evidence = run.stdout.split('\n').find(line => line.startsWith('HOME_CARD_HOVER:'));
    assert(evidence, run.stdout); console.log(evidence);
  } finally {
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert(path.basename(temp).startsWith('mineradio-card-hover-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  const temp = process.argv[process.argv.indexOf('--child') + 1];
  const user = path.join(temp, 'user'); fs.mkdirSync(user);
  app.setPath('appData', temp);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Hover QA';
  process.env.MINERADIO_STARTUP_QA_USER_DATA = user;
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  app.commandLine.appendSwitch('mute-audio');
  fs.writeFileSync(path.join(user, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(temp, 'cache') }));
  app.on('browser-window-created', (_event, win) => {
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] },
      (_details, callback) => callback({ cancel: true }));
  });
  require('../desktop/main');
  require('./helpers/electron-frames').keepTestWindowFramesRunning(app);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  setTimeout(() => { console.error('hover check timed out'); app.exit(2); }, 50000).unref();
  app.whenReady().then(async () => {
    let win;
    for (let i = 0; i < 120; i++) {
      win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
      if (win && await win.webContents.mainFrame.executeJavaScript('typeof renderHomeDashboardQuickCards === "function" && document.readyState !== "loading"').catch(() => false)) break;
      await wait(100);
    }
    assert(win, 'Player did not initialize');
    const evaluate = script => win.webContents.mainFrame.executeJavaScript(script);
    win.webContents.debugger.attach('1.3');
    const mouse = (x,y) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type:'mouseMoved',x,y});
    await evaluate(`(() => {
      dismissSplash({instant:true}); markStartupGuideSeen('login'); startupLoginGuideShown=true; closeLoginModal();
      markVisualGuideSeen(); closeVisualGuide(true);
      homeDashboardCurrentSong = () => ({name:'The World Is A Beautiful Place And I Am No Longer Afraid To Die',artist:'A very long artist name',provider:'netease',id:'186016'});
      renderHomeDashboardQuickCards(); homeForcedOpen=true; updateEmptyHomeVisibility(); return true;
    })()`);
    win.show();
    await wait(1200);
    const snapshots = `(() => {
      const rect = node => { const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
      const grid=document.querySelector('#empty-home .home-quick-grid');
      return {height:innerHeight,grid:rect(grid),cards:Array.from(grid.querySelectorAll('.home-card')).map(node=>{
        const r=rect(node), css=getComputedStyle(node);
        return {rect:r,hover:node.matches(':hover'),transform:css.transform,animation:css.animationName,
          hit:node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
      })};
    })()`;
    const results = [];
    // A flat bright background exposes shadows leaking across the card gaps.
    const checkGaps = async (layout, background) => {
      await evaluate(`(() => {
        fx.backgroundMedia = null; fx.backgroundImage = ''; fx.backgroundGlassOpacity = 0;
        fx.windowBackgroundOpacity = 1; fx.backgroundOpacity = 1;
        setCustomBackgroundColor('${background}', true);
        let backdrop = document.getElementById('qa-flat-backdrop');
        if (!backdrop) { backdrop = document.createElement('style'); backdrop.id = 'qa-flat-backdrop'; document.head.append(backdrop); }
        // Remove animated scene pixels so shadow coverage can be measured exactly.
        backdrop.textContent = '#desktop-window-shell{background:${background}!important} canvas,#custom-bg,#album-bg,#album-bg-next,#wallpaper-engine-layer,#wallpaper-engine-glass-sampler{display:none!important}';
        return true;
      })()`);
      await wait(350);
      const captured = await win.webContents.capturePage();
      const bitmap = captured.toBitmap(), imageSize = captured.getSize();
      const scale = imageSize.height / layout.height;
      const expected = background.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16));
      const samples = [];
      for (let index = 1; index < layout.cards.length; index++) {
        const left = layout.cards[index-1].rect, right = layout.cards[index].rect;
        if (Math.abs(left.y-right.y) > 1) continue;
        const x = (left.x + left.width + right.x) / 2;
        for (const fraction of [0.2, 0.5, 0.8]) {
          const y = right.y + right.height * fraction;
          const offset = (Math.floor(y*scale)*imageSize.width + Math.floor(x*scale))*4;
          const pixel = [bitmap[offset+2],bitmap[offset+1],bitmap[offset]];
          assert(pixel.every((value,i) => Math.abs(value-expected[i]) <= 3),
            'Card gap darkens the background: '+JSON.stringify({background,x,y,pixel,expected}));
          samples.push(pixel);
        }
      }
      assert(samples.length > 0, 'No visible card gaps were checked');
      return {background,samples};
    };
    for (const size of [[1280,820],[1280,1080],[960,740]]) {
      win.setSize(...size);
      await mouse(1,1); await wait(650);
      const before = await evaluate(snapshots);
      for (let index=0; index<before.cards.length; index++) {
        const card = before.cards[index].rect;
        await mouse(card.x+card.width/2,card.y+card.height/2);
        await wait(350);
        const after = await evaluate(snapshots);
        const current = after.cards[index];
        assert(current.hover, 'Native mouse did not enter card: '+JSON.stringify({size,index,before,after}));
        assert(current.hit, 'Hovered card is no longer hit-testable');
        if (!process.argv.includes('--observe')) {
          assert(Math.abs(current.rect.y-card.y)<0.5, 'Hover moves card outside its row: '+JSON.stringify({before:card,after:current}));
          assert(current.rect.y >= after.grid.y-0.5 && current.rect.y+current.rect.height <= after.grid.y+after.grid.height+0.5,
            'Hovered card escapes its grid');
        }
        results.push({size,index,shift:current.rect.y-card.y,transform:current.transform,hit:current.hit});
        await mouse(1,1); await wait(300);
      }
      const gaps = [];
      for (const background of ['#f6f3eb','#13171e']) gaps.push(await checkGaps(before, background));
      results.push({size,gaps});
      // Also sample while a card is hovered, after its shadow transition ends.
      const firstCard = before.cards[0].rect;
      await mouse(firstCard.x+firstCard.width/2,firstCard.y+firstCard.height/2);
      await wait(350);
      results.push({size,hoverGaps:await checkGaps(before,'#f6f3eb')});
      const shotIndex = process.argv.indexOf('--shots');
      if (shotIndex >= 0) {
        const directory = path.resolve(process.argv[shotIndex+1]); fs.mkdirSync(directory,{recursive:true});
        const card=before.cards[0].rect;
        await mouse(card.x+card.width/2,card.y+card.height/2);
        await wait(350);
        fs.writeFileSync(path.join(directory,'home-hover-'+size.join('x')+'.png'),(await win.webContents.capturePage()).toPNG());
      }
    }
    console.log('HOME_CARD_HOVER:'+JSON.stringify(results)); app.exit(0);
  }).catch(error => { console.error(error.stack || String(error)); app.exit(1); });
}
