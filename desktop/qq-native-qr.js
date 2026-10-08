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
  let key = '', stopped = false, busy = false, refreshing = false, confirming = false, retryable = false, image = '';
  let epoch = 0, failures = 0, terminalSince = 0, retryAt = 0;
  let baselineTokens = new Set(), deadline, retryTimer, wakeRetry;
  const scanApp = 'QQ 音乐 App（不支持 QQ／微信扫一扫）';
  const finish = result => { if (!stopped) { stop(); options.finish(result); } };
  function fail(message, detail) {
    retryable = true; refreshing = false; confirming = false; clearTimeout(deadline);
    options.notify({ stage: 'failed', image, expired: false, retryable: true, scanApp, message,
      failureStage: detail && detail.failureStage, failureReason: detail && detail.failureReason,
      upstreamCode: detail && detail.upstreamCode });
  }
  function delay(ms) {
    return new Promise(resolve => { wakeRetry = resolve; retryTimer = setTimeout(() => { wakeRetry = null; resolve(); }, ms); });
  }
  async function refresh() {
    const generation = ++epoch;
    refreshing = true; confirming = false; retryable = false; terminalSince = 0; image = '';
    if (key && service) service.cancelSession(key);
    key = '';
    options.notify({ stage: 'loading', scanApp, message: retryAt > Date.now() ? '稍候自动刷新客户端二维码…' : '正在生成 QQ 音乐 App 二维码…' });
    clearTimeout(deadline);
    deadline = setTimeout(() => {
      if (stopped || generation !== epoch) return;
      epoch++; if (key && service) service.cancelSession(key); key = '';
      fail('客户端二维码生成超时，请点击刷新重试；也可以选择 QQ 网页登录。', { failureReason: 'network-timeout' });
    }, options.timeoutMs || 45000);
    try {
      if (retryAt > Date.now()) await delay(Math.min(retryAt - Date.now(), 30000));
      if (stopped || generation !== epoch) return;
      // Each code owns its auth store: a late confirmation for the old code cannot log in the new one.
      if (!options.service) { const runtime = (options.createRuntime || nativeService)(); service = runtime.service; sessions = runtime.sessions; }
      baselineTokens = new Set((sessions ? sessions() : []).map(item => item.token));
      const currentService = service;
      const nextKey = await currentService.createSession('qq');
      if (stopped || generation !== epoch) { currentService.cancelSession(nextKey); return; }
      key = nextKey;
      const nextImage = await currentService.createQr(key);
      if (stopped || generation !== epoch) return;
      if (!/^data:image\/(png|jpeg);base64,/.test(nextImage) || nextImage.length > 1024 * 1024) throw new Error('QQ_APP_QR_INVALID');
      clearTimeout(deadline); refreshing = false; failures = 0;
      image = nextImage;
      options.notify({ stage: 'qr', image, expired: false, scanApp });
    } catch (error) {
      if (stopped || generation !== epoch) return;
      const wait = Math.max(0, Number(error.retryAfterMs) || 0);
      retryAt = Date.now() + Math.min(wait, 30000);
      fail('客户端二维码暂时无法生成，请刷新重试；不会自动切到网页登录。', error.diagnostics);
    }
  }
  async function poll() {
    if (stopped || busy || refreshing || !key || !image) return;
    const generation = epoch, currentService = service, currentSessions = sessions;
    busy = true;
    try {
      const delivered = retryable && (currentSessions ? currentSessions() : []).find(item => !baselineTokens.has(item.token) && item.credential && Number(item.credential.loginType) === 6 && item.expiresAt > Date.now());
      if (retryable && !delivered) return;
      const result = delivered ? { code: 803, cookie: 'qqmusic_session=' + delivered.token } : await currentService.checkQr(key, 1000);
      failures = 0;
      if (stopped || generation !== epoch) {
        if (result.code === 803 && result.cookie) await currentService.logout(String(result.cookie).replace(/^qqmusic_session=/, ''));
        return;
      }
      const issued = (currentSessions ? currentSessions() : []);
      const token = String(result.cookie || '').replace(/^qqmusic_session=/, '');
      const auth = result.code === 803 ? issued.find(item => item.token === token)
        : issued.find(item => !baselineTokens.has(item.token) && item.credential && item.expiresAt > Date.now());
      if (result.code === 803 || auth) {
        let cookie;
        try { cookie = credentialCookie(auth && auth.credential); } catch (_) {
          if (auth) baselineTokens.add(auth.token);
          fail('手机已确认，但没有收到完整播放凭据。请用 QQ 音乐 App 刷新重试，或选择 QQ 网页登录。', { failureStage: 'credential-validation', failureReason: 'missing-credential' }); return;
        }
        await currentService.logout(auth.token);
        if (!stopped && generation === epoch) finish({ ok: true, cookie, nativeQr: true });
      } else if (result.code === 802) {
        confirming = true; terminalSince = 0; options.notify({ stage: 'scanned', message: '已扫码，正在接收 QQ 音乐授权…' });
      } else if (result.code === 800) {
        // SDK 800 covers both expiry and failure. Keep polling briefly for an in-flight credential exchange.
        if (!terminalSince) terminalSince = Date.now();
        const grace = options.confirmationGraceMs ?? 8000;
        if (Date.now() - terminalSince < grace) {
          confirming = true; options.notify({ stage: 'scanned', message: '正在核对手机端授权结果…' }); return;
        }
        retryAt = Math.max(retryAt, Date.now() + Math.min(Math.max(0, Number(result.retryAfterMs) || 0), 30000));
        if (result.failureReason === 'qr-timeout' || (!result.failureReason && result.message === 'QR code expired')) {
          retryable = true; confirming = false;
          options.notify({ stage: 'qr', image, expired: true, retryable: true, scanApp });
        } else {
          fail('扫码授权未完成。此二维码仅支持 QQ 音乐 App；若用了 QQ 或微信，请刷新后换 QQ 音乐 App 扫码。', result);
        }
      }
    } catch (_) {
      if (!stopped && generation === epoch && ++failures >= 3) fail('授权连接暂时中断，请刷新客户端二维码重试；手机上的成功提示不代表播放凭据已经收到。');
    } finally { busy = false; }
  }
  const timer = setInterval(poll, 1200);
  if (timer.unref) timer.unref();
  function stop() {
    stopped = true; epoch++; clearTimeout(deadline); clearTimeout(retryTimer); clearInterval(timer);
    if (wakeRetry) { wakeRetry(); wakeRetry = null; }
    if (key && service) service.cancelSession(key); key = '';
  }
  refresh();
  return { stop, poll, cancel: () => finish({ ok: false, inline: true, cancelled: true }),
    click: () => { if (stopped || refreshing || busy || confirming) return false; refresh(); return true; } };
}

module.exports = { createQQNativeQrSession, credentialCookie, nativeCommForCookie };
