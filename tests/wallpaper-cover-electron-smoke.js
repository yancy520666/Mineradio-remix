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
let coverFixtures;
const pendingLargeCovers = [];

function createCoverFixtures() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const paint = canvas.getContext('2d');
  const gradient = paint.createLinearGradient(0, 0, 2048, 2048);
  gradient.addColorStop(0, '#1b6173'); gradient.addColorStop(1, '#c76e55');
  paint.fillStyle = gradient; paint.fillRect(0, 0, 2048, 2048);
  paint.strokeStyle = '#f4e4cb'; paint.lineWidth = 2;
  for (let radius = 10; radius < 1500; radius += 10) {
    paint.beginPath(); paint.arc(1024, 1024, radius, 0, Math.PI * 2); paint.stroke();
  }
  const low = document.createElement('canvas'); low.width = low.height = 400;
  low.getContext('2d').drawImage(canvas, 0, 0, 400, 400);
  return { low: low.toDataURL(), high: canvas.toDataURL() };
}

async function prepareCoverQuality() {
  dismissSplash({ instant: true });
  closeVisualGuide();
  fx.backgroundGlassOpacity = 0;
  const remote = 'https://p1.music.126.net/qa-cover.jpg?param=400y400';
  loadCoverFromUrl(remote, { trackToken: trackSwitchToken });
  const thumb = document.getElementById('thumb-cover');
  for (let attempt = 0; attempt < 100 && (!thumb.complete || !thumb.naturalWidth); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  setCustomBackgroundAlbumCover(true, true);
  await new Promise(resolve => setTimeout(resolve, 300));
  return { thumbnail: [thumb.naturalWidth, thumb.naturalHeight],
    fallback: document.getElementById('custom-bg').style.getPropertyValue('--custom-bg-image'),
    canvasResolution: fx.coverResolution };
}

async function finishCoverQuality() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (customBackgroundAlbumCoverSource().includes('2048y2048')) break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  const source = customBackgroundAlbumCoverSource();
  const image = new Image(); image.src = source; await image.decode();
  const layer = document.getElementById('custom-bg');
  const result = { background: [image.naturalWidth, image.naturalHeight],
    applied: layer.style.getPropertyValue('--custom-bg-image').includes(source),
    thumbnail: document.getElementById('thumb-cover').naturalWidth, canvasResolution: fx.coverResolution };
  fx.backgroundGlassOpacity = 1; applyCustomBackground();
  result.glassBlur = layer.style.getPropertyValue('--custom-bg-glass-blur');
  result.glassSourceUnchanged = layer.style.getPropertyValue('--custom-bg-image').includes(source);
  fx.backgroundGlassOpacity = 0; applyCustomBackground();
  return result;
}

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

  const editorId = '333333333333333333333333';
  const originalProperties = [
    {key:'clock',label:'显示时钟',type:'bool',value:true},
    {key:'size',label:'时钟大小',type:'slider',value:15,min:10,max:50,step:0.5},
    {key:'color',label:'时钟颜色',type:'color',value:'1 0 0'},
    {key:'mode',label:'显示模式',type:'combo',value:'1',options:[{label:'白天',value:'1'},{label:'夜间',value:'2'}]},
    {key:'text',label:'自定义文字',type:'textinput',value:'原始文字'},
    {key:'volume',label:'声音',type:'slider',value:0,autoMuted:true},
  ];
  let editedProperties = originalProperties.map(property=>({...property}));
  let failSave = false;
  let editorSaves = [];
  getDesktopWindowApi = () => ({
    getWallpaperEngineProjectDetails: async()=>({ok:true,id:editorId,title:'壁纸设置',editable:true,properties:editedProperties}),
    setWallpaperEngineProjectProperties:async payload=>{
      editorSaves.push(payload);
      if (failSave) return {ok:false,error:'WALLPAPER_PROPERTY_VALUE_INVALID'};
      editedProperties = originalProperties.map(property=>({...property,value:payload.reset?property.value:Object.prototype.hasOwnProperty.call(payload.values,property.key)?payload.values[property.key]:property.value}));
      return {ok:true,id:editorId,title:'壁纸设置',editable:true,properties:editedProperties,applied:true};
    },
  });
  await showWallpaperEngineProjectDetails(editorId);
  const edit = (key,value)=>{
    const input=document.querySelector('[data-property-key="'+key+'"]');
    if(input.type==='checkbox')input.checked=value;else input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  edit('clock',false); edit('size','20.5'); edit('color','#00ff00'); edit('mode','1'); edit('text','测试文字\n第二行');
  await saveWallpaperEngineProjectProperties(false);
  const values=editorSaves[0].values;
  const textRestored=document.querySelector('[data-property-key="text"]').value;
  const mutedReadOnly=!document.querySelector('[data-property-key="volume"]');
  failSave=true; edit('size','55'); await saveWallpaperEngineProjectProperties(false);
  const retryPreserved=wallpaperEnginePropertyChanges.size===55&&!document.getElementById('wallpaper-engine-details-save').disabled;
  failSave=false; await saveWallpaperEngineProjectProperties(true);
  filterWallpaperEngineProperties('时钟');
  const filtered=document.querySelector('[data-property-key="text"]').closest('[data-property-search]').hidden;
  filterWallpaperEngineProperties('');
  const desktopOverflow=document.getElementById('wallpaper-engine-details-properties').scrollWidth>document.getElementById('wallpaper-engine-details-properties').clientWidth;
  result.editor={values,textRestored,mutedReadOnly,retryPreserved,filtered,desktopOverflow,reset:editorSaves[2].reset};
  closeWallpaperEngineProjectDetails();
  return result;
}

app.whenReady().then(async () => {
  server = http.createServer((req, res) => {
    const request = new URL(req.url, 'http://localhost');
    if (request.pathname === '/api/cover' && request.searchParams.get('url')?.includes('/qa-cover.jpg')) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (request.searchParams.get('url').includes('2048y2048')) pendingLargeCovers.push(res);
      else res.end(coverFixtures.low);
      return;
    }
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
  const fixtures = await win.webContents.mainFrame.executeJavaScript('(' + createCoverFixtures.toString() + ')()');
  coverFixtures = Object.fromEntries(Object.entries(fixtures).map(([key, value]) => [key, Buffer.from(value.split(',')[1], 'base64')]));
  const before = await win.webContents.mainFrame.executeJavaScript('(' + prepareCoverQuality.toString() + ')()');
  assert.deepEqual(before.thumbnail, [400, 400]);
  assert(before.fallback.includes('400y400') && !before.fallback.includes('2048y2048'));
  assert.equal(pendingLargeCovers.length, 1, 'Control refreshes must reuse the in-flight large cover');
  const shotDir = process.env.MINERADIO_COVER_QA_SHOTS;
  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    fs.writeFileSync(path.join(shotDir, 'cover-before.png'), (await win.webContents.capturePage()).toPNG());
  }
  for (const response of pendingLargeCovers) response.end(coverFixtures.high);
  const after = await win.webContents.mainFrame.executeJavaScript('(' + finishCoverQuality.toString() + ')()');
  assert.deepEqual(after.background, [2048, 2048]);
  assert(after.applied && after.glassSourceUnchanged);
  assert.equal(after.thumbnail, 400);
  assert.equal(after.canvasResolution, before.canvasResolution);
  assert.equal(after.glassBlur, '32.0px');
  if (shotDir) {
    await new Promise(resolve => setTimeout(resolve, 300));
    fs.writeFileSync(path.join(shotDir, 'cover-after.png'), (await win.webContents.capturePage()).toPNG());
  }
  console.log('COVER_QUALITY_OK:' + JSON.stringify({ before, after }));
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
  assert.deepEqual(result.editor.values,{clock:false,size:20.5,color:'0 1 0',mode:'2',text:'测试文字\n第二行'});
  assert.equal(result.editor.textRestored,'测试文字\n第二行');
  assert(result.editor.mutedReadOnly&&result.editor.retryPreserved&&result.editor.filtered&&result.editor.reset);
  assert(!result.editor.desktopOverflow);
  console.log('WALLPAPER_COVER_OK:' + JSON.stringify(result));
}).then(() => finish(0)).catch(error => { console.error(error.stack); finish(1); });

function finish(code) {
  if (win && !win.isDestroyed()) win.destroy();
  if (server) server.close();
  app.quit();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
  app.exit(code);
}
