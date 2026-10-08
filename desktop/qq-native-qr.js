'use strict';

// Pinned MIT implementation from yakult-green-tea/qq-music-api 3.1.3.
// Import only the auth modules: the package root starts a Koa server.
const path = require('path');
const { createCookieStore } = require('../cookie-storage');
let deviceRepository;
function qqDeviceFile() {
  return process.env.QQ_NATIVE_DEVICE_FILE || path.join(__dirname, '..', '.qq-native-device.json');
}
function storedDeviceRepository() {
  const store = createCookieStore(qqDeviceFile());
  return { kind: 'encrypted-host-store',
    load: () => { try {
      const device = JSON.parse(store.read());
      const base = path.join(path.dirname(require.resolve('@yakult-green-tea/qq-music-api/package.json')), 'dist/src/services/auth');
      return require(path.join(base, 'androidDevice.js')).isAndroidDevice(device) ? device : null;
    } catch (_) { return null; } },
    save: device => store.write(JSON.stringify(device)), clear: () => store.write('') };
}
function nativeCommForCookie(cookie) {
  if (!cookie || String(cookie.tmeLoginType) !== '6') return null;
  try {
    const base = path.join(path.dirname(require.resolve('@yakult-green-tea/qq-music-api/package.json')), 'dist/src/services/auth');
    const { isAndroidDevice, buildAndroidComm } = require(path.join(base, 'androidDevice.js'));
    const device = JSON.parse(createCookieStore(qqDeviceFile(), { migrate: false }).read());
    if (!isAndroidDevice(device)) return null;
    const id = String(cookie.qqmusic_uin || cookie.uin || '').replace(/^o0*/, '');
    const key = cookie.qm_keyst || cookie.qqmusic_key;
    if (!id || !key) return null;
    return buildAndroidComm(device, { str_musicid: id, musickey: key, loginType: 6 });
  } catch (_) { return null; }
}
function nativeService() {
  let sessions = [];
  const base = path.join(path.dirname(require.resolve('@yakult-green-tea/qq-music-api/package.json')), 'dist/src/services/auth');
  const { createQrLoginService, createMqttListen } = require(path.join(base, 'qrLogin.js'));
  const { createAuthHttpClient } = require(path.join(base, 'httpClient.js'));
  const WebSocket = require(require.resolve('ws', { paths: [base] }));
  const service = createQrLoginService({ http: createAuthHttpClient(), createSessionHttp: createAuthHttpClient,
    deviceRepository: deviceRepository || (deviceRepository = storedDeviceRepository()), listen: createMqttListen(WebSocket) });
  service.configureAuthSessionRepository({ kind: 'memory', load: () => [], save: list => { sessions = list; } });
  return { service, sessions: () => sessions };
}
function credentialCookie(credential) {
  credential = credential || {};
  const id = String(credential.str_musicid || credential.musicid || '');
  const key = String(credential.musickey || '');
  if (!/^[1-9]\d{0,19}$/.test(id) || !key || key.length > 4096 || /[;\r\n]/.test(key)
      || Number(credential.loginType) !== 6) throw new Error('QQ_APP_AUTH_INCOMPLETE');
  return 'uin=' + id + '; qqmusic_uin=' + id + '; qm_keyst=' + key + '; qqmusic_key=' + key + '; tmeLoginType=6';
}
function createQQNativeQrSession(options) {
  let service = options.service, sessions = options.sessions;
  let key = '', stopped = false, busy = false, expired = false, image = '';
  let epoch = 0, failures = 0;
  const finish = result => { if (!stopped) { stop(); options.finish(result); } };
  let deadline;
  function startDeadline() {
    clearTimeout(deadline);
    deadline = setTimeout(() => finish({ ok: false, inline: true, fallback: true, error: 'QQ_APP_QR_TIMEOUT' }), options.timeoutMs || 45000);
  }
  async function refresh() {
    const generation = ++epoch;
    startDeadline();
    expired = false;
    if (key && service) service.cancelSession(key);
    key = '';
    try {
      if (!service) { const runtime = nativeService(); service = runtime.service; sessions = runtime.sessions; }
      const nextKey = await service.createSession('qq');
      if (stopped || generation !== epoch) { service.cancelSession(nextKey); return; }
      key = nextKey;
      const nextImage = await service.createQr(key);
      if (stopped || generation !== epoch) return;
      if (!/^data:image\/(png|jpeg);base64,/.test(nextImage) || nextImage.length > 1024 * 1024) throw new Error('QQ_APP_QR_INVALID');
      clearTimeout(deadline);
      image = nextImage;
      options.notify({ stage: 'qr', image, expired: false, scanApp: 'QQ 音乐 App（不是 QQ 的扫一扫）' });
    } catch (_) {
      if (!stopped && generation === epoch) finish({ ok: false, inline: true, fallback: true, error: 'QQ_APP_QR_UNAVAILABLE' });
    }
  }
  async function poll() {
    if (stopped || busy || !key || !image || expired) return;
    const generation = epoch;
    busy = true;
    try {
      const result = await service.checkQr(key, 1000);
      failures = 0;
      if (stopped || generation !== epoch) {
        if (result.code === 803 && result.cookie) await service.logout(String(result.cookie).replace(/^qqmusic_session=/, ''));
        return;
      }
      if (result.code === 803) {
        const token = String(result.cookie || '').replace(/^qqmusic_session=/, '');
        const auth = (sessions ? sessions() : []).find(item => item.token === token);
        const cookie = credentialCookie(auth && auth.credential);
        // Export only conventional music credentials, then drop the SDK session.
        await service.logout(token);
        if (!stopped && generation === epoch) finish({ ok: true, cookie, nativeQr: true });
      } else if (result.code === 802) options.notify({ stage: 'scanned' });
      else if (result.code === 800) {
        expired = true;
        options.notify({ stage: 'qr', image, expired: true, scanApp: 'QQ 音乐 App（不是 QQ 的扫一扫）' });
      }
    } catch (_) {
      if (!stopped && generation === epoch && ++failures >= 3) finish({ ok: false, inline: true, fallback: true, error: 'QQ_APP_QR_UNAVAILABLE', message: 'QQ 音乐 App 授权没有完成，请使用 QQ 音乐 App 扫码，或改用 QQ 网页登录。' });
    } finally { busy = false; }
  }
  const timer = setInterval(poll, 1200);
  if (timer.unref) timer.unref();
  function stop() { stopped = true; epoch++; clearTimeout(deadline); clearInterval(timer); if (key && service) service.cancelSession(key); key = ''; }
  refresh();
  return { stop, poll, cancel: () => finish({ ok: false, inline: true, cancelled: true }),
    click: () => { if (stopped || !expired) return false; image = ''; refresh(); return true; } };
}
module.exports = { createQQNativeQrSession, credentialCookie, nativeCommForCookie };
