'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-visual-resource-'));
app.setPath('userData', profile);
process.env.PORT = '0';
for (const key of ['COOKIE_FILE', 'QQ_COOKIE_FILE', 'KUGOU_COOKIE_FILE', 'QISHUI_COOKIE_FILE', 'QISHUI_TOKEN_FILE', 'QISHUI_QR_CONFIG_FILE', 'MINERADIO_LISTEN_SYNC_FILE', 'CUEFIELD_FEEDBACK_FILE']) process.env[key] = path.join(profile, key);
const security = require('../server-security');
const originalFetch = security.fetchPublicResource;
const calls = new Map();
let jpeg;
security.fetchPublicResource = async (value, options) => {
  const url = new URL(value);
  if (url.hostname !== 'fixture.invalid') return originalFetch(value, options);
  const count = (calls.get(url.pathname) || 0) + 1;
  calls.set(url.pathname, count);
  const ok = url.pathname === '/flaky' ? count > 2 : url.pathname === '/online' ? count > 4 : false;
  return new Response(ok ? jpeg : 'temporarily unavailable', { status: ok ? 200 : 503, headers: { 'Content-Type': 'image/jpg' } });
};
let server, win;
app.whenReady().then(async () => {
  server = require('../server');
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  win = new BrowserWindow({ show: false, width: 960, height: 640, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', event => {
    if (/frame-ancestors|Refused to frame/.test(event.message || '')) errors.push(event.message);
    if (event.level === 'error') console.error('[Renderer]', event.message, event.sourceId, event.lineNumber);
  });
  await win.loadURL(base);
  jpeg = Buffer.from(await win.webContents.executeJavaScript(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
    canvas.getContext('2d').fillRect(0, 0, 4, 4);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  })()`), 'base64');
  const result = await win.webContents.executeJavaScript(`(async () => {
    let stage = 'renderer startup';
    const waitFor = async (fn, ms = 20000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
      throw new Error('Visual resource condition timed out: ' + stage);
    };
    await waitFor(() => typeof setProviderAvatar === 'function' && window.MineradioSonicWorkshop);
    stage = 'WE canvas';
    fx.preset = 8;
    MineradioSonicWorkshop.onPresetChange(0, 8);
    await waitFor(() => {
      const frame = document.querySelector('#sonic-workshop-layer iframe');
      try { return frame && frame.contentDocument.querySelector('canvas') && typeof frame.contentWindow.__mineradioApplyAudio === 'function'; } catch (_) { return false; }
    });
    const frame = document.querySelector('#sonic-workshop-layer iframe');
    frame.contentWindow.__mineradioApplyMedia({ title: 'WE bridge test', artist: 'fixture', isPlaying: true });
    frame.contentWindow.__mineradioApplyAudio(new Array(512).fill(0.2));
    const bridgeReady = frame.contentWindow.__mediaState.title === 'WE bridge test';
    providerAvatarRetryDelays = [40, 80, 120];
    const add = name => {
      const holder = document.createElement('div');
      holder.innerHTML = providerAvatarHtml('netease', { avatar: 'https://fixture.invalid/' + name });
      document.body.appendChild(holder); return holder.firstChild;
    };
    const flaky = add('flaky');
    stage = 'flaky avatar';
    await waitFor(() => flaky.complete && flaky.naturalWidth > 0 && providerAvatarRecovery.get(flaky)?.failed === false);
    const recovered = flaky.naturalWidth === 4 && !providerAvatarRetryTimers.has(flaky);
    const always = add('always');
    stage = 'retry exhaustion';
    await waitFor(() => providerAvatarRecovery.get(always)?.attempts === 3 && !providerAvatarRetryTimers.has(always) && always.getAttribute('src') === providerAvatarRecovery.get(always)?.fallback && always.complete && always.naturalWidth > 0);
    const fallback = always.complete && always.naturalWidth > 0;
    always.remove();
    const removed = add('removed');
    stage = 'detached image';
    await waitFor(() => providerAvatarRetryTimers.has(removed)); removed.remove();
    await new Promise(resolve => setTimeout(resolve, 150));
    const detachedCancelled = !providerAvatarRetryTimers.has(removed);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const offline = add('offline');
    stage = 'offline fallback';
    await waitFor(() => providerAvatarRecovery.get(offline)?.failed && offline.complete && offline.naturalWidth > 0);
    await new Promise(resolve => setTimeout(resolve, 150));
    const offlineIdle = !providerAvatarRetryTimers.has(offline) && providerAvatarRecovery.get(offline).attempts === 0;
    offline.remove(); delete navigator.onLine;
    const online = add('online');
    stage = 'online retry exhaustion';
    await waitFor(() => providerAvatarRecovery.get(online)?.attempts === 3 && !providerAvatarRetryTimers.has(online) && online.getAttribute('src') === providerAvatarRecovery.get(online)?.fallback && online.complete && online.naturalWidth > 0);
    window.dispatchEvent(new Event('online'));
    stage = 'online recovery';
    await waitFor(() => providerAvatarRecovery.get(online)?.failed === false);
    const onlineRecovered = online.naturalWidth === 4;
    const modal = document.createElement('img'); document.body.appendChild(modal);
    setProviderAvatar(modal, 'netease', { avatar: 'https://fixture.invalid/changed' });
    stage = 'modal avatar';
    await waitFor(() => providerAvatarRetryTimers.has(modal));
    setProviderAvatar(modal, 'qq', {});
    stage = 'account change';
    await waitFor(() => modal.complete && modal.naturalWidth === 96);
    const accountChanged = !providerAvatarRecovery.has(modal) && !providerAvatarRetryTimers.has(modal);
    fx.preset = 0;
    MineradioSonicWorkshop.clear();
    return { bridgeReady, recovered, fallback, detachedCancelled, offlineIdle, onlineRecovered, accountChanged };
  })()`);
  for (const [key, value] of Object.entries(result)) assert(value, key);
  assert.equal(calls.get('/flaky'), 3);
  assert.equal(calls.get('/always'), 4, 'persistent failure has only three retries');
  assert.equal(calls.get('/removed'), 1, 'removed account images never retry');
  assert.equal(calls.get('/online'), 5, 'network recovery starts a fresh attempt');
  assert.equal(calls.get('/changed'), 1, 'account changes cancel the old image retry');
  assert.equal(calls.get('/offline'), 1, 'offline images wait for connectivity instead of retrying');
  assert.deepEqual(errors, []);
  console.log('MINERADIO_VISUAL_RESOURCE_SMOKE:' + JSON.stringify({ ok: true, result, requests: Object.fromEntries(calls) }));
  win.destroy(); server.close(); app.exit(0);
}).catch(error => { console.error(error.stack || error); if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); app.exit(1); });
process.on('exit', () => {
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mineradio-visual-resource-')) {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
});
