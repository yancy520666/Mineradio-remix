'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
if (!process.argv.includes('--child')) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-start-stall-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const run = spawnSync(require('electron'), [__filename, '--child', profile], { cwd: root, env, encoding: 'utf8', timeout: 45000 });
    assert.equal(run.status, 0, run.stderr + run.stdout + String(run.error || ''));
    const evidence = run.stdout.split('\n').find(line => line.startsWith('START_STALL:'));
    assert(evidence, run.stdout); console.log(evidence);
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow } = require('electron');
  const http = require('node:http');
  const profile = process.argv[process.argv.indexOf('--child') + 1];
  app.setPath('appData', profile);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Start Stall QA';
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
      if (win) ready = await win.webContents.executeJavaScript('typeof playAudio === "function" && document.readyState !== "loading"').catch(() => false);
      if (ready) break;
      await sleep(50);
    }
    assert(ready, 'renderer must initialize');
    const wav = Buffer.alloc(44 + 16000 * 20);
    wav.write('RIFF', 0);wav.writeUInt32LE(wav.length - 8, 4);wav.write('WAVEfmt ', 8);wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);wav.writeUInt16LE(1, 22);wav.writeUInt32LE(8000, 24);wav.writeUInt32LE(16000, 28);wav.writeUInt16LE(2, 32);wav.writeUInt16LE(16, 34);
    wav.write('data', 36);wav.writeUInt32LE(wav.length - 44, 40);
    let requests = 0;
    const statuses = [];
    const connections = new Set();
    const server = http.createServer((request, response) => {
      requests++;
      const headers = { 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store', 'Content-Type':'audio/wav', 'Accept-Ranges':'bytes' };
      if (requests === 1) { statuses.push(503);response.writeHead(503, headers);response.end();return; }
      const range = /bytes=(\d+)-/.exec(request.headers.range || '');
      const start = range ? Number(range[1]) : 0;
      headers['Content-Length'] = wav.length - start;
      if (range) headers['Content-Range'] = 'bytes ' + start + '-' + (wav.length - 1) + '/' + wav.length;
      statuses.push(range ? 206 : 200);response.writeHead(range ? 206 : 200, headers);
      response.end(wav.subarray(start));
    });
    server.on('connection', socket => { connections.add(socket);socket.on('close',()=>connections.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const result = await win.webContents.executeJavaScript(`(async () => {
      dismissSplash({instant:true});closeVisualGuide(false);
      playQueue=[{provider:'netease',id:99,name:'Stall fixture',artist:'QA'}];currentIdx=0;trackSwitchToken++;
      audio=new Audio();audio.crossOrigin='anonymous';audio.__mineradioQueueItemKey=queueItemKey(playQueue[0]);audio.__mineradioTrackSwitchToken=trackSwitchToken;
      bindPlaybackProgressEvents(audio);initAudio();
      audio.src=${JSON.stringify(base + '/flaky.wav')};
      const firstStarted=await playAudio({manual:true,trackSwitch:true,fade:false,expectedMedia:audio,expectedToken:trackSwitchToken});
      await new Promise(resolve=>setTimeout(resolve,300));
      const firstProgress=audio.currentTime;
      const sameSong=playQueue[0].id===99;
      const paused=audio.paused;
      audio.pause();clearPlaybackResumeWatchdogs();return {firstStarted,firstProgress,sameSong,paused};
    })()`);
    assert(result.firstStarted && result.firstProgress > 0);
    assert.equal(requests,2,'a 503 must trigger one actual audio reload');
    assert(result.sameSong && !result.paused);
    console.log('START_STALL:' + JSON.stringify({ ...result, requests, statuses }));
    for (const socket of connections) socket.destroy();server.close();app.exit(0);
  }).catch(error => { console.error(error.stack);app.exit(1); });
}
