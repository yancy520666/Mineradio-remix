'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { app, BrowserWindow } = require('electron');
require('./helpers/electron-frames').keepTestWindowFramesRunning(app);

const publicRoot = path.resolve(__dirname, '../public');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-wallpaper-cover-'));
app.setPath('userData', profile);
let server, win;

async function exercise() {
  const calls = [];
  let stopPromise;
  getDesktopWindowApi = () => ({ stopWallpaperEngineScene: payload => {
    calls.push(payload);
    stopPromise = Promise.resolve({ ok: true, stopped: true });
    return stopPromise;
  } });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  canvas.getContext('2d').fillStyle = '#1155cc';
  canvas.getContext('2d').fillRect(0, 0, 16, 16);
  const cover = canvas.toDataURL();
  albumBackgroundCurrentSrc = cover;
  fx.wallpaperMode = false;
  wallpaperEngineSelection = normalizeWallpaperEngineSelection({ active: true,
    id: '1234567890abcdef12345678', kind: 'engine' });
  wallpaperEngineNativeSessionId = 'abcdef1234567890abcdef12';
  wallpaperEngineLayerReady('dwm', wallpaperEngineLayerToken);
  const previousLayerActive = document.body.classList.contains('wallpaper-engine-dwm-active');
  setCustomBackgroundAlbumCover(true, true);
  const stopped = await stopPromise;
  // The cover layer fades in; wait for its real rendered state, not font timing.
  for (let attempt = 0; attempt < 40; attempt++) {
    if (Number(getComputedStyle(document.getElementById('custom-bg'), '::before').opacity) > 0) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const result = {
    previousLayerActive, calls: calls.slice(), stopped: stopped.stopped, wallpaperMode: fx.wallpaperMode,
    engineSelected: wallpaperEngineSelection.active,
    engineSession: wallpaperEngineNativeSessionId,
    engineVisible: document.body.classList.contains('wallpaper-engine-active'),
    dwmVisible: document.body.classList.contains('wallpaper-engine-dwm-active'),
    coverSelected: document.body.classList.contains('custom-background-album-cover'),
    coverSourceCorrect: document.getElementById('custom-bg').style.getPropertyValue('--custom-bg-image').includes(cover),
    coverOpacity: getComputedStyle(document.getElementById('custom-bg'), '::before').opacity,
  };
  // A late ready callback from the outgoing layer must not resurrect it.
  wallpaperEngineLayerReady('dwm', wallpaperEngineLayerToken - 1);
  result.lateReadyIgnored = !document.body.classList.contains('wallpaper-engine-active');
  // Switch real image elements, including an 8K source, after adjusting framing.
  const ids = ['111111111111111111111111', '222222222222222222222222'];
  const sources = new Map();
  for (let index=0; index<2; index++) {
    const fixture = document.createElement('canvas');
    fixture.width = index ? 8192 : 2048; fixture.height = fixture.width*9/16;
    const paint = fixture.getContext('2d'); paint.fillStyle = index ? '#31634b' : '#384d75';
    paint.fillRect(0,0,fixture.width,fixture.height);
    sources.set(ids[index], fixture.toDataURL('image/png')); fixture.width=fixture.height=1;
  }
  wallpaperEngineProjects = ids.map(id => ({id,title:id,playable:true,mediaType:'image',hasPreview:true}));
  wallpaperEngineMediaUrl = item => sources.get(item.id);
  const image = document.getElementById('wallpaper-engine-image');
  async function select(id) {
    activateWallpaperEngineItem(id);
    for (let attempt=0; attempt<100; attempt++) {
      if (image.src === sources.get(id) && image.complete && image.naturalWidth
        && document.getElementById('wallpaper-engine-layer').classList.contains('image-ready')) {
        return {source:[image.naturalWidth,image.naturalHeight],settings:wallpaperEngineVisualSettings(),transform:getComputedStyle(image).transform};
      }
      await new Promise(resolve => setTimeout(resolve,30));
    }
    throw new Error('Wallpaper image switch timed out');
  }
  await select(ids[0]);
  setWallpaperEngineVisualSetting('scale',1.5); setWallpaperEngineVisualSetting('positionX',30);
  result.nextImage = await select(ids[1]);
  result.restoredImage = await select(ids[0]);
  return result;
}

app.whenReady().then(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(publicRoot, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end(); return;
    }
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, width: 960, height: 540,
    frame: false, transparent: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] },
    (_details, callback) => callback({ cancel: true }));
  await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
  await win.webContents.mainFrame.executeJavaScript(`new Promise((resolve,reject)=>{const until=Date.now()+20000;
    function wait(){if(typeof setCustomBackgroundAlbumCover==='function'&&typeof wallpaperEngineLayerReady==='function')return resolve();
    if(Date.now()>until)return reject(new Error('Renderer unavailable'));setTimeout(wait,40)}wait()})`);
  const result = await win.webContents.mainFrame.executeJavaScript('(' + exercise.toString() + ')()');
  assert(result.previousLayerActive && result.coverSelected && result.coverSourceCorrect);
  assert(!result.engineSelected && !result.engineSession && !result.engineVisible && !result.dwmVisible);
  assert.equal(result.wallpaperMode, false);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].sessionId, 'abcdef1234567890abcdef12');
  assert(result.stopped);
  assert(result.lateReadyIgnored);
  assert(Number(result.coverOpacity) > 0);
  assert.deepEqual(result.nextImage.source, [8192,4608]);
  assert.equal(result.nextImage.settings.scale, 1.08);
  assert.equal(result.nextImage.settings.positionX, 0);
  assert.match(result.nextImage.transform, /^matrix\(1\.08, 0, 0, 1\.08, 0, 0\)$/);
  assert.equal(result.restoredImage.settings.scale, 1.5);
  assert.equal(result.restoredImage.settings.positionX, 0.3);
  console.log('WALLPAPER_COVER_OK:' + JSON.stringify(result));
}).then(() => finish(0)).catch(error => { console.error(error.stack); finish(1); });

function finish(code) {
  if (win && !win.isDestroyed()) win.destroy();
  if (server) server.close();
  app.quit();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
  app.exit(code);
}
