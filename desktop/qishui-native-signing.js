'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');
const { createCookieStore } = require('../cookie-storage');

function createNativeSigner(options) {
  let child, sequence = 0, idle;
  const pending = new Map();
  function stop() {
    clearTimeout(idle);
    const old = child; child = null;
    if (old) old.kill();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('QISHUI_NATIVE_SIGN_STOPPED')); }
    pending.clear();
  }
  function armIdle() {
    clearTimeout(idle);
    if (!pending.size) { idle = setTimeout(stop, options.idleMs || 20000); if (idle.unref) idle.unref(); }
  }
  function sign(url, headers) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== 'api.qishui.com' || target.pathname !== '/luna/pc/track_v2'
        || target.username || target.password || target.hash || target.port && target.port !== '443') return Promise.reject(Error('QISHUI_SIGN_TARGET_REJECTED'));
    if (pending.size >= 2) return Promise.reject(Error('QISHUI_SIGN_BUSY'));
    clearTimeout(idle);
    if (!child) {
      const next = (options.fork || fork)(path.join(__dirname, 'qishui-sign-worker.js'), [], {
        windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      child = next;
      next.on('message', result => {
        if (child !== next) return;
        const entry = pending.get(result && result.id);
        if (!entry) return;
        pending.delete(result.id); clearTimeout(entry.timer);
        const supplied = result.headers || {};
        const signed = {};
        for (const name of ['x-helios', 'x-medusa']) {
          const value = supplied[name];
          if (typeof value === 'string' && value && value.length < 16384 && !/[\r\n]/.test(value)) signed[name] = value;
        }
        if (result.error || !signed['x-helios'] || !signed['x-medusa']) entry.reject(Error('QISHUI_NATIVE_SIGN_FAILED'));
        else entry.resolve({ ...entry.headers, ...signed });
        armIdle();
      });
      next.on('error', () => { if (child === next) stop(); });
      next.on('exit', () => { if (child === next) stop(); });
      if (next.unref) next.unref();
      if (next.channel && next.channel.unref) next.channel.unref();
    }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(stop, options.timeoutMs || 3500);
      pending.set(id, { resolve, reject, timer, headers });
      child.send({ id, url, headers, modulePath: options.modulePath, deviceId: options.deviceId }, error => { if (error) stop(); });
    });
  }
  return { sign, stop };
}
let active;
function nativePlaybackContext() {
  try {
    const file = process.env.MINERADIO_QISHUI_NATIVE_CONFIG || path.join(__dirname, '..', '.qishui-native-local.json');
    if (!fs.existsSync(file)) return null;
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (config.enabled !== true || process.platform !== 'win32') return null;
    const modulePath = path.resolve(config.modulePath || '');
    if (path.basename(modulePath) !== 'bdms.node' || !fs.existsSync(modulePath)
        || !fs.existsSync(path.join(path.dirname(modulePath), 'metasecml.dll'))) return null;
    const identityFile = process.env.QISHUI_QR_CONFIG_FILE || path.join(__dirname, '..', '.qishui-qr-login.json');
    const identity = JSON.parse(createCookieStore(identityFile, { migrate: false }).read());
    const deviceId = String(identity.deviceId || '');
    if (!/^[0-9]{8,24}$/.test(deviceId)) return null;
    const key = modulePath + '|' + deviceId;
    if (!active || active.key !== key) {
      if (active) active.signer.stop();
      active = { key, signer: createNativeSigner({ modulePath, deviceId }) };
    }
    return { signer: active.signer, deviceId, installId: String(identity.installId || ''),
      versionName: '3.8.0', versionCode: '30080000', userAgent: 'LunaPC/3.8.0(467160162)' };
  } catch (_) { return null; }
}
function signingHeaders(headers, body, context) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return { ...normalized, 'user-agent': context.userAgent, 'x-luna-is-local-user': '0',
    'x-luna-background-type': 'foreground', 'x-luna-is-background-req': '0',
    'x-ss-stub': crypto.createHash('md5').update(body).digest('hex').toUpperCase() };
}
module.exports = { createNativeSigner, nativePlaybackContext, signingHeaders };
