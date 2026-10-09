'use strict';

// Protocol reference: L-1124/QQMusicApi (GPL-3.0), versioning.py, qimei.py and
// android_session.py at 27861e51432ea6b6e88dc35c4e8c8e239c0339e8 (checked 2026-10-09).
// The pinned Node SDK still owns MQTT, cookie transport and credential validation.
const crypto = require('node:crypto');
const PROFILE = Object.freeze({ version: 20090008, appVersion: '20.9.0.8', qimeiSdkVersion: '1.2.13.6' });
const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QIMEI_URL = 'https://api.tencentmusic.com/tme/trpc/proxy';
const APP_KEY = '0AND0HD6FE4HY80F';
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEIxgwoutfwoJxcGQeedgP7FG9qaIuS0qzfR8gWkrkTZKM2iWHn2ajQpBRZjMSoSf6+KJGvar2ORhBfpDXyVtZCKpqLQ+FLkpncClKVIrBwv6PHyUvuCb0rIarmgDnzkfQAqVufEtR64iazGDKatvJ9y6B9NMbHddGSAUmRTCrHQIDAQAB
-----END PUBLIC KEY-----`;
const md5 = (...parts) => crypto.createHash('md5').update(parts.join('')).digest('hex');
const hex = length => crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
function aes(key, data, iv = key) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}
function qqNativeUserAgent(osRelease) {
  const release = String(osRelease || '10').replace(/[^\w. -]/g, '').slice(0, 32);
  return `QQMusic ${PROFILE.version}(android ${release})`;
}
function normalizeNativeComm(comm, now = Date.now()) {
  const next = { ...comm, cv: PROFILE.version, v: PROFILE.version };
  const id = next.qq || next.OpenUDID || next.udid;
  next.traceid = `10002_${id}_${Math.floor(now / 1000)}`;
  return next;
}
function migrateDevice(device) {
  const openUdid2 = typeof device.openUdid2 === 'string' && /^[a-f0-9]{32}$/i.test(device.openUdid2) ? device.openUdid2 : hex(32);
  const next = { ...device, openUdid2, protocolVersion: PROFILE.version };
  if (device.protocolVersion !== PROFILE.version) {
    // Keep the device identity; only version-bound bootstrap results need refreshing.
    for (const field of ['qimei', 'qimei36', 'qimeiSavedAt', 'sessionUid', 'sessionSid', 'sessionVkey']) delete next[field];
  }
  return next;
}
function qimeiPayload(device, now = new Date()) {
  const dated = new Set([1, 2, 13, 14, 17, 18, 21, 22, 25, 26, 29, 30, 33, 34, 37, 38]);
  const prefix = `${now.toISOString().slice(0, 7)}-01${crypto.randomInt(100000, 1000000)}.${crypto.randomInt(100000000, 1000000000)}`;
  const beacon = Array.from({ length: 40 }, (_, i) => {
    const n = i + 1;
    return `k${n}:` + (dated.has(n) ? prefix : n === 3 ? '0000000000000000' : n === 4 ? hex(16).replaceAll('0', '1') : crypto.randomInt(10000));
  }).join(';') + ';';
  const token = value => aes(Buffer.from('lvcwmSYVr2Axv1gn'), Buffer.from(value), Buffer.from('Zs0ntDqG2jyhKN0c')).toString('base64');
  const digest = Buffer.from(md5(device.androidId), 'hex');
  const reserved = { harmony: '0', clone: '0', containe: '', oz: token(device.androidId), oo: token(device.model), kelong: '0',
    ip: `192.168.${digest[0]}.${digest[1] % 253 + 2}`, uptimes: new Date(now.getTime() - crypto.randomInt(14401) * 1000).toISOString().replace('T', ' ').slice(0, 19),
    multiUser: '0', bod: device.board, brd: device.brand, dv: device.device, firstLevel: String(device.sdk),
    manufact: device.brand, name: device.product, host: 'se.infra', kernel: device.procVersion, pre: '0', av: PROFILE.appVersion, ch: '' };
  return { androidId: device.androidId, platformId: 1, appKey: APP_KEY, appVersion: PROFILE.appVersion,
    beaconIdSrc: beacon, brand: device.brand, channelId: '10003505', cid: '', imei: device.imei, imsi: '', mac: '',
    model: device.model, networkType: 'wifi', oaid: '', osVersion: `Android ${device.osRelease},level ${device.sdk}`,
    qimei: '', qimei36: '', sdkVersion: PROFILE.qimeiSdkVersion, targetSdkVersion: '30', audit: '', userId: '{}',
    packageId: 'com.tencent.qqmusic', deviceType: 'Phone', sdkName: '', reserved: JSON.stringify(reserved) };
}
function buildQimeiRequest(device, now = new Date(), publicKey = PUBLIC_KEY) {
  const keyBytes = Buffer.from(hex(16)), nonce = hex(16), timestamp = Math.floor(now.getTime() / 1000);
  const key = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, keyBytes).toString('base64');
  const params = aes(keyBytes, Buffer.from(JSON.stringify(qimeiPayload(device, now)))).toString('base64');
  const extra = JSON.stringify({ appKey: APP_KEY });
  return { headers: { Host: 'api.tencentmusic.com', method: 'GetQimei', service: 'trpc.tme_datasvr.qimeiproxy.QimeiProxy',
    appid: 'qimei_qq_android', sign: md5('qimei_qq_androidpzAuCmaFAaFaHrdakPjLIEqKrGnSOOvH', String(timestamp)),
    'User-Agent': 'QQMusic', timestamp: String(timestamp) },
    body: { app: 0, os: 1, qimeiParams: { key, params, time: String(timestamp), nonce,
      sign: md5(key, params, String(timestamp * 1000), nonce, 'ZdJqM15EeO2zWc08', extra), extra } } };
}
// One adapter per QR runtime: no shared axios defaults, changes to SDK exports or global diagnostics.
function createNativeProtocol(http, repository) {
  let device, exchangeFailure;
  const deviceRepository = { kind: repository.kind,
    load() {
      const stored = repository.load();
      if (!stored) return null;
      device = migrateDevice(stored);
      if (stored.protocolVersion !== PROFILE.version || stored.openUdid2 !== device.openUdid2) repository.save(device);
      return device;
    },
    save(value) {
      // A newly generated SDK device is published before its bootstrap requests start.
      Object.assign(value, migrateDevice(value));
      device = value; repository.save(value);
    },
    clear() { device = undefined; repository.clear(); } };
  async function request(config) {
    let next = config;
    if (config.url === QIMEI_URL) {
      if (!device) throw new Error('QQ_NATIVE_DEVICE_MISSING');
      const bootstrap = buildQimeiRequest(device);
      next = { ...config, data: bootstrap.body, headers: bootstrap.headers };
    } else if (config.url === MUSICU_URL && config.data && config.data.comm) {
      const data = config.data;
      const req = data.req_0;
      const comm = normalizeNativeComm({ ...data.comm, OpenUDID2: device && device.openUdid2 || data.comm.OpenUDID2 });
      let param = req && req.param;
      if (req && req.module === 'music.login.LoginServer' && req.method === 'CreateQRCode') {
        param = { ...param, ct: 11, cv: PROFILE.version }; comm.ct = 23; comm.cv = 0;
      } else if (req && req.module === 'music.getSession.session' && req.method === 'GetSession') {
        param = { ...param, caller: param.uid ? 1 : 2 }; delete comm.uid; delete comm.sid;
      }
      const headers = { ...config.headers };
      for (const key of Object.keys(headers)) if (key.toLowerCase() === 'user-agent') delete headers[key];
      headers['User-Agent'] = qqNativeUserAgent(comm.os_ver);
      next = { ...config, data: { ...data, comm, ...(req ? { req_0: { ...req, param } } : {}) }, headers };
    }
    const response = await http.request(next);
    const req = next.data && next.data.req_0;
    if (next.url === MUSICU_URL && req && req.module === 'music.login.LoginServer' && req.method === 'Login') {
      const body = response.data || {}, item = body.req_0 || {};
      exchangeFailure = Number.isSafeInteger(item.code) && item.code !== 0 ? { exchangeUpstreamCode: item.code } : undefined;
    }
    return response;
  }
  return { deviceRepository, diagnostics: () => exchangeFailure || {},
    http: { request, post: (url, data, config = {}) => request({ ...config, url, data, method: 'POST' }), getCookieHeader: () => http.getCookieHeader() } };
}
module.exports = { PROFILE, qqNativeUserAgent, normalizeNativeComm, migrateDevice, qimeiPayload, buildQimeiRequest, createNativeProtocol };
