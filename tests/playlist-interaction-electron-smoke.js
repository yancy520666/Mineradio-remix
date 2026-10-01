'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
if (!process.argv.includes('--child')) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-interaction-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    for (const mode of ['first', 'restart']) {
      const result = spawnSync(require('electron'), [__filename, '--child', profile, mode], { cwd: root, env, encoding: 'utf8', timeout: 45000 });
      if (result.status !== 0) throw Error(result.stderr + result.stdout);
      console.log(result.stdout.split('\n').filter(line => line.startsWith('INTERACTION:')).join('\n'));
    }
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow } = require('electron');
  const profile = process.argv[process.argv.indexOf('--child') + 1];
  const mode = process.argv[process.argv.indexOf('--child') + 2];
  app.setPath('appData', profile);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Interaction QA';
  process.env.MINERADIO_STARTUP_QA_USER_DATA = path.join(profile, 'user');
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  fs.mkdirSync(process.env.MINERADIO_STARTUP_QA_USER_DATA, { recursive: true });
  fs.writeFileSync(path.join(process.env.MINERADIO_STARTUP_QA_USER_DATA, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(profile, 'cache') }));
  // Fixtures intentionally leave production background throttling enabled.
  app.on('browser-window-created', (_event, win) => win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] }, (_details, callback) => callback({ cancel: true })));
  require('../desktop/main');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const deadline = Date.now() + 25000;
    let win;
    while (Date.now() < deadline) {
      win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
      if (win && await win.webContents.executeJavaScript('typeof animatePlaylistCatalogToTop === "function" && typeof saveLastPlaybackSnapshot === "function" && document.readyState !== "loading"').catch(() => false)) break;
      await sleep(60);
    }
    assert(win && Date.now() < deadline, 'renderer did not initialize');
    assert(win.isVisible()); assert.equal(win.webContents.getBackgroundThrottling(), false);
    win.emit('blur'); await sleep(300);
    assert(win.isVisible()); assert.equal(win.webContents.getBackgroundThrottling(), false);
    const checkpoint = await win.webContents.executeJavaScript(`(async () => {
      if (${JSON.stringify(mode)} === 'restart') return readLastPlaybackSnapshot();
      playQueue = Array.from({length: 500}, (_, id) => ({ id: id + 1, name: 'Checkpoint ' + id, provider: 'netease', duration: 120 }));
      currentIdx = 350; currentLocalSong = null;
      audio = { src: 'data:audio/wav;base64,fixture', currentTime: 37.25, duration: 120, paused: true, ended: false, __mineradioQueueItemKey: queueItemKey(playQueue[currentIdx]) };
      saveLastPlaybackSnapshot(true, 'test-seek');
      await playbackCheckpointPending;
      audio = null;
      return window.desktopWindow.readPlaybackCheckpointSync().payload;
    })()`);
    assert.equal(checkpoint.current.id, 351); assert.equal(checkpoint.currentTime, 37.25);
    assert.equal(checkpoint.queue[checkpoint.currentIdx].id, 351);
    if (mode === 'first') {
      const geometry = await win.webContents.executeJavaScript(`(async () => {
        dismissSplash({instant: true});
        loginStatus.loggedIn = true;
        userPlaylists = Array.from({length: 800}, (_, id) => ({id: id + 1, name: 'Playlist ' + id, provider:'netease', trackCount: 200}));
        playlistCatalogRevision++; queueViewTab = 'playlists';
        const panel = document.getElementById('playlist-panel');
        panel.classList.add('show', 'pinned');
        document.getElementById('queue-pane').style.display='none';
        document.getElementById('pl-pane').style.display='';
        playlistPanelDetailState.key = 'netease:401';
        playlistPanelDetailState.tracks = Array.from({length: 200}, (_, id) => ({id:id+1,name:'Track '+id}));
        playlistPanelDetailState.playlist = userPlaylists[400];
        renderUserPlaylistsList({animate:false});
        panel.scrollTop = playlistPanelTopInset(panel) + 28000;
        renderUserPlaylistsList({animate:false,preserveScroll:true});
        const measure = () => {
          const card=panel.querySelector('[data-playlist-id="401"]');
          const header=panel.querySelector('.playlist-panel-sticky');
          const toolbar=panel.querySelector('#pl-pane .queue-toolbar');
          return { top:panel.scrollTop, card:card && card.getBoundingClientRect().top,
            safe:Math.max(header.getBoundingClientRect().bottom,toolbar.getBoundingClientRect().bottom), rendered:panel.querySelectorAll('.pl-card').length };
        };
        animatePlaylistCatalogToTop('netease:401');
        await new Promise(r=>setTimeout(r,750));
        const first=measure();
        panel.style.width='280px';
        await new Promise(r=>setTimeout(r,50));
        panel.scrollTop+=3000; renderUserPlaylistsList({animate:false,preserveScroll:true});
        animatePlaylistCatalogToTop('netease:401');
        await new Promise(r=>setTimeout(r,750));
        const narrow=measure();
        myPodcastCollections=[{key:'created',title:'创建播客',count:0},{key:'liked',title:'喜欢的声音',count:0}];
        renderMyPodcastCollections({animate:false});
        const defaults=Array.from(document.querySelectorAll('#podcast-list img')).map(i=>i.src.startsWith('data:image/svg+xml'));
        queueViewTab='queue'; renderQueuePanel({animate:false,scrollCurrent:false});
        const button=document.querySelector('.qi-act button');
        const svg=button.querySelector('svg');
        const b=button.getBoundingClientRect(),v=svg.getBoundingClientRect();
        return {first,narrow,defaults,iconOffset:[Math.abs((b.left+b.right-v.left-v.right)/2),Math.abs((b.top+b.bottom-v.top-v.bottom)/2)]};
      })()`);
      for (const sample of [geometry.first, geometry.narrow]) {
        assert(sample.card - sample.safe >= 7 && sample.card - sample.safe <= 11, JSON.stringify(geometry));
        assert(sample.rendered < 35);
      }
      assert.deepEqual(geometry.defaults, [true, true]);
      assert(geometry.iconOffset.every(offset => offset < 1));
      const counts = new Map(); let active = 0, peak = 0;
      const image = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#399"/></svg>';
      const server = require('node:http').createServer((req, res) => {
        counts.set(req.url, (counts.get(req.url) || 0) + 1); peak = Math.max(peak, ++active);
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*', 'Timing-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
          res.write(image.slice(0, 70));
          setTimeout(() => { res.end(image.slice(70)); active--; }, 25);
        }, 250);
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = 'http://127.0.0.1:' + server.address().port;
      const covers = await win.webContents.executeJavaScript(`(async () => {
        const proxy=coverProxySrc; coverProxySrc=url=>url.startsWith(${JSON.stringify(base)})?url:proxy(url);
        const cover=${JSON.stringify(base + '/cold.svg')};
        const load=url=>new Promise(resolve=>requestPlaylistCover(url,resolve,{priority:0}));
        try {
          const start=performance.now(); await load(cover); const coldMs=performance.now()-start;
          const repeated=performance.now(); await load(cover); const cachedMs=performance.now()-repeated;
          await Promise.all(Array.from({length:7},(_,i)=>load(${JSON.stringify(base)}+'/parallel'+i+'.svg')));
          userPlaylists=[{id:991,name:'Cover fixture',provider:'netease',cover,trackCount:1}]; myPodcastCollections=[]; playlistCatalogRevision++;
          shelfManager.setMode('side'); shelfManager.rebuild(false);
          const card=shelfManager.getCards().find(card=>card.item.cover===cover);
          const uploadStart=performance.now(); renderer.initTexture(card.texture);
          return {coldMs,cachedMs,textureSubmitMs:performance.now()-uploadStart,metrics:playlistCoverCache[cover].metrics};
        } finally { coverProxySrc=proxy; }
      })()`);
      await new Promise(resolve => server.close(resolve));
      assert(covers.coldMs >= 250); assert(covers.cachedMs < 50);
      assert.equal(counts.get('/cold.svg'), 1); assert(peak <= 4);
      console.log('INTERACTION:' + JSON.stringify({mode,geometry,covers:{...covers,requests:counts.size,maxConcurrent:peak},checkpoint:{id:checkpoint.current.id,time:checkpoint.currentTime,queue:checkpoint.queue.length},visibleUnfocusedThrottling:win.webContents.getBackgroundThrottling()}));
    } else console.log('INTERACTION:' + JSON.stringify({mode,restored:{id:checkpoint.current.id,time:checkpoint.currentTime}}));
    // app.exit bypasses before-quit: recovery must rely on the committed checkpoint.
    app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
