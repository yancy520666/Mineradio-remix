'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

if (!process.argv.includes('--child')) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'mineradio-sonic-audio-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const run = spawnSync(require('electron'), [__filename, '--child', profile], {
      cwd: root, env, encoding: 'utf8', timeout: 30000, windowsHide: true,
    });
    assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
    console.log(run.stdout.split('\n').find(line => line.startsWith('SONIC_AUDIO:')));
  } finally {
    assert.equal(path.dirname(path.resolve(profile)), temporaryRoot);
    fs.rmSync(profile, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  const http = require('node:http');
  app.setPath('userData', process.argv[process.argv.indexOf('--child') + 1]);
  let win, server;
  app.whenReady().then(async () => {
    const publicRoot = path.join(root, 'public');
    server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<html><head><style>body{margin:0;background:#000}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head><body>
          <script>window.fx={preset:8};window.playing=true;window.audio={paused:false,currentTime:1,duration:100};window.frequencyData=new Uint8Array(1024);window.fixtureBands={};</script>
          <script src="/sonic-workshop-preset.js"></script></body></html>`);
        return;
      }
      const file = path.resolve(publicRoot, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end(); return;
      }
      const type = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)];
      if (type) res.setHeader('Content-Type', type);
      fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    win = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await win.loadURL('http://127.0.0.1:' + server.address().port);
    await win.webContents.executeJavaScript(`(async()=>{
      MineradioSonicWorkshop.onPresetChange(0,8);
      window.fixtureTimer=setInterval(()=>MineradioSonicWorkshop.update(.04,{fx,audio:fixtureBands}),40);
      const until=Date.now()+12000;
      while(Date.now()<until){
        const frame=document.querySelector('iframe')?.contentWindow;
        if(frame?.document.querySelector('canvas')&&frame.__mineradioApplyAudio&&frame.wallpaperPropertyListener) {
          const apply=frame.__mineradioApplyProperties;
          frame.__mineradioApplyProperties=p=>apply({...p,autoRotateEnabled:false,idleWaveEnabled:false});
          frame.__mineradioApplyProperties({autoRotateEnabled:false,idleWaveEnabled:false});
          const audio=frame.__mineradioApplyAudio;
          frame.__mineradioApplyAudio=s=>{window.fixtureSamples=s;audio(s)};
          return;
        }
        await new Promise(resolve=>setTimeout(resolve,40));
      }
      throw new Error('Sonic canvas was not ready');
    })()`);
    const results = {};
    for (const active of [false, true]) {
      await win.webContents.executeJavaScript(`fixtureBands=${active
        ? '{subBass:.6,bass:.6,lowMid:.6,mid:.6,highMid:.6,presence:.6,brilliance:.6}' : '{}'};`);
      await new Promise(resolve => setTimeout(resolve, 1600));
      const bitmap = (await win.webContents.capturePage()).toBitmap();
      let sum = 0, bright = 0;
      for (let i = 0; i < bitmap.length; i += 4) {
        const value = Math.max(bitmap[i], bitmap[i + 1], bitmap[i + 2]);
        sum += value; if (value > 120) bright++;
      }
      results[active ? 'active' : 'silent'] = {
        brightness: sum / (bitmap.length / 4), brightPixels: bright,
        sampleMean: await win.webContents.executeJavaScript('fixtureSamples.reduce((s,v)=>s+v,0)/fixtureSamples.length'),
      };
    }
    assert.equal(results.silent.sampleMean, 0);
    assert(results.active.sampleMean > 0.05);
    assert(results.active.brightness > results.silent.brightness + 1, 'valid bands must change the rendered light');
    assert(results.active.brightPixels > results.silent.brightPixels + 100);
    console.log('SONIC_AUDIO:' + JSON.stringify(results));
    win.destroy(); server.close(); app.exit(0);
  }).catch(error => {
    console.error(error.stack || error);
    if (win && !win.isDestroyed()) win.destroy();
    if (server) server.close();
    app.exit(1);
  });
}
