'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, safeStorage } = require('electron');
const { createCookieStore, ENCRYPTED_COOKIE_PREFIX } = require('../cookie-storage');
const { createOriginalProfileImporter } = require('../desktop/original-profile-import');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-media-security-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
process.on('exit', () => {
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mineradio-media-security-')) {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
});
app.whenReady().then(async () => {
  assert(safeStorage.isEncryptionAvailable(), 'real OS credential encryption must be available');
  for (const name of ['.cookie', '.qq-cookie', '.kugou-cookie', '.qishui-cookie', '.qishui-token', '.qishui-qr-login.json']) {
    const file = path.join(profile, name), value = 'isolated-fixture-secret-' + name;
    fs.writeFileSync(file, value);
    const store = createCookieStore(file);
    assert.equal(store.read(), value);
    assert(fs.readFileSync(file, 'utf8').startsWith(ENCRYPTED_COOKIE_PREFIX));
    assert(!fs.readFileSync(file, 'utf8').includes(value));
    assert.equal(createCookieStore(file).read(), value);
    store.write(''); assert(!fs.existsSync(file));
  }
  const original = path.join(profile, 'original'), remix = path.join(profile, 'remix'); fs.mkdirSync(original);
  const cookie = 'MUSIC_U=fixture-profile-session', qr = JSON.stringify({ cookie: 'sessionid=fixture-profile', msToken: 'fixture-ms' });
  fs.writeFileSync(path.join(original, '.cookie'), cookie); fs.writeFileSync(path.join(original, '.qishui-qr-login.json'), qr);
  const imported = createOriginalProfileImporter({ originalPath: original, remixPath: remix }).importFiles();
  assert.equal(imported.importedCredentials, 2);
  assert.equal(createCookieStore(path.join(remix, '.cookie')).read(), cookie);
  assert.equal(createCookieStore(path.join(remix, '.qishui-qr-login.json')).read(), qr);
  assert(fs.readFileSync(path.join(remix, '.qishui-qr-login.json'), 'utf8').startsWith(ENCRYPTED_COOKIE_PREFIX));
  assert.equal(fs.readFileSync(path.join(original, '.cookie'), 'utf8'), cookie, 'explicit import preserves the separate original profile');
  const win = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile(path.join(root, 'public/index.html'));
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 20000;
    function ready() { if (typeof initializeSystemMediaSession === 'function' && typeof togglePlay === 'function' && renderer) return resolve(); if (Date.now() > deadline) return reject(new Error('Renderer startup timeout')); setTimeout(ready, 50); }
    ready();
  })`);
  const result = await win.webContents.executeJavaScript(`(async () => {
    const session = navigator.mediaSession, handlers = {};
    const register = session.setActionHandler.bind(session);
    session.setActionHandler = (name, fn) => { handlers[name] = fn; register(name, fn); };
    initializeSystemMediaSession();
    showSourceFallbackNotice('已跳过本地歌曲', '第一首离线', { coalesceKey: 'qa-skip' });
    showSourceFallbackNotice('已跳过本地歌曲（连续 2 首）', '第二首离线', { coalesceKey: 'qa-skip' });
    const cards = Array.from(document.querySelectorAll('.source-fallback-card')).filter(card => card._mineradioNoticeKey === 'qa-skip');
    const noticeCoalesced = cards.length === 1 && cards[0].querySelector('.source-fallback-body').textContent === '第二首离线';
    const bytes = new Uint8Array(44 + 8000 * 8 * 2), view = new DataView(bytes.buffer);
    const text = (off, value) => { for (let i = 0; i < value.length; i++) bytes[off + i] = value.charCodeAt(i); };
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    playQueue = [{ id: 'media-smoke', type: 'local', name: '系统媒体测试', artist: '测试歌手', album: '测试专辑', localUrl: url }]; currentIdx = 0;
    const media = new Audio(url); audio = media;
    media.__mineradioQueueItemKey = queueItemKey(playQueue[0]); media.__mineradioTrackSwitchToken = trackSwitchToken;
    initAudio(); bindPlaybackProgressEvents(media); await media.play(); updateSystemMediaSession();
    const title = session.metadata.title, state = session.playbackState;
    handlers.pause(); await new Promise(resolve => setTimeout(resolve, AUDIO_FADE_OUT_MS + 200));
    const paused = media.paused && session.playbackState === 'paused';
    handlers.pause(); await new Promise(resolve => setTimeout(resolve, 80));
    const stillPaused = media.paused;
    handlers.play(); await new Promise(resolve => setTimeout(resolve, 250));
    const resumed = !media.paused && session.playbackState === 'playing';
    handlers.seekto({ seekTime: 2 }); await new Promise(resolve => setTimeout(resolve, 350));
    const seeked = media.currentTime >= 2 && media.currentTime < 2.8 && !media.paused;
    const next = new Audio(url); audio = next; playQueue[0] = { ...playQueue[0], name: '交接后的歌曲' };
    bindSystemMediaAudio(next); updateSystemMediaSession(); media.pause();
    const handedOff = session.metadata.title === '交接后的歌曲' && systemMediaSessionAudio === next;
    clearSystemMediaSession(); media.pause(); next.pause(); URL.revokeObjectURL(url);
    return { title, state, paused, stillPaused, resumed, seeked, handedOff, noticeCoalesced, cleared: session.metadata === null && session.playbackState === 'none' };
  })()`);
  assert.equal(result.title, '系统媒体测试'); assert.equal(result.state, 'playing');
  for (const key of ['paused', 'stillPaused', 'resumed', 'seeked', 'handedOff', 'noticeCoalesced', 'cleared']) assert(result[key], key);
  win.destroy(); console.log('MINERADIO_MEDIA_SECURITY_SMOKE:' + JSON.stringify({ ok: true, result })); app.exit(0);
}).catch(error => { console.error(error.stack || error); app.exit(1); });
