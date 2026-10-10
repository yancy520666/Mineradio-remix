'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const { PROFILE, qimeiPayload, buildQimeiRequest, migrateDevice, createNativeProtocol, qqNativeUserAgent } = require('../desktop/qq-native-protocol');
const { createQQNativeRuntime, createQQNativeQrSession } = require('../desktop/qq-native-qr');
const base = path.join(path.dirname(require.resolve('@yakult-green-tea/qq-music-api/package.json')), 'dist/src/services/auth');
const { createAndroidDevice } = require(path.join(base, 'androidDevice'));
const settle = () => new Promise(resolve => setImmediate(resolve));
function repository(seed) {
  let saved = seed;
  return { kind: 'memory', load: () => saved && { ...saved }, save: value => { saved = { ...value }; }, clear: () => { saved = null; } };
}
function runtimeFixture(rejectExchange = false) {
  const requests = [], store = repository(createAndroidDevice());
  let emit, ready;
  const listening = new Promise(resolve => { ready = resolve; });
  const runtime = createQQNativeRuntime({ deviceRepository: store,
    http: { getCookieHeader: () => '', request: async config => {
      if (typeof config.data === 'string') config = { ...config, data: JSON.parse(config.data) };
      requests.push(config);
      if (config.url.includes('tme/trpc')) return { status: 200, data: { code: 0, data: JSON.stringify({ code: 0, data: { q16: 'fixture-q16', q36: 'fixture-q36' } }) } };
      const req = config.data.req_0;
      let code = 0, data = {};
      if (req.method === 'GetSession') data = { session: { uid: 'fixture-session-uid', sid: 'fixture-session-sid' } };
      if (req.method === 'CreateQRCode') data = { qrcodeID: 'fixture-qr', qrcode: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') };
      if (req.method === 'Login') { code = rejectExchange ? 50006 : 0; data = { musicid: '123', musickey: 'formal-fixture-key', loginType: 2 }; }
      if (req.method === 'GetLoginUserInfo') code = 1000;
      return { status: 200, data: { code: 0, req_0: { code, data } } };
    } },
    listen: (_id, onEvent) => { emit = onEvent; ready(); return { ready: Promise.resolve(), done: new Promise(() => {}), close() {} }; } });
  return { runtime, requests, store, listening, confirm: () => emit({ type: 'cookies', payload: { cookies: {
    qqmusic_uin: { value: '123' }, qqmusic_key: { value: 'interim-fixture-token' } } } }) };
}
test('new protocol refreshes derived bootstrap cache once without replacing device identity', () => {
  const old = { ...createAndroidDevice(), qimei: 'old', qimei36: 'old36', qimeiSavedAt: Date.now(), sessionUid: 'old-uid', sessionSid: 'old-sid' };
  const migrated = migrateDevice(old);
  for (const field of ['androidId', 'openUdid', 'imei', 'model']) assert.equal(migrated[field], old[field]);
  assert.equal(migrated.qimei, undefined); assert.equal(migrated.sessionUid, undefined);
  assert.equal(old.qimei, 'old'); assert.notEqual(migrated.openUdid2, migrated.openUdid);
  const current = { ...migrated, qimei: 'current', qimei36: 'current36', qimeiSavedAt: Date.now() };
  assert.deepEqual(migrateDevice(current), current);
});
test('QIMEI envelope encrypts the current version and signs the exact transmitted ciphertext', () => {
  const device = migrateDevice(createAndroidDevice()), now = new Date('2026-10-09T00:00:00Z');
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  const request = buildQimeiRequest(device, now, keys.publicKey);
  const wrapped = crypto.privateDecrypt({ key: keys.privateKey, padding: crypto.constants.RSA_NO_PADDING }, Buffer.from(request.body.qimeiParams.key, 'base64'));
  assert.equal(wrapped[1], 2);
  const key = wrapped.subarray(wrapped.indexOf(0, 2) + 1);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, key);
  const body = request.body.qimeiParams;
  const plain = JSON.parse(Buffer.concat([decipher.update(Buffer.from(body.params, 'base64')), decipher.final()]));
  assert.equal(plain.appVersion, PROFILE.appVersion); assert.equal(plain.sdkVersion, PROFILE.qimeiSdkVersion);
  assert.equal(JSON.parse(plain.reserved).av, plain.appVersion);
  const expected = crypto.createHash('md5').update([body.key, body.params, String(Number(body.time) * 1000), body.nonce, 'ZdJqM15EeO2zWc08', body.extra].join('')).digest('hex');
  assert.equal(body.sign, expected); assert.equal(request.headers.timestamp, body.time);
  const other = qimeiPayload({ ...device, androidId: 'other-fixture-id', model: 'other-model' }, now);
  assert.notEqual(JSON.parse(plain.reserved).oz, JSON.parse(other.reserved).oz);
  assert.notEqual(JSON.parse(plain.reserved).oo, JSON.parse(other.reserved).oo);
});
test('real pinned SDK uses one protocol for bootstrap, QR and credential exchange', async () => {
  const f = runtimeFixture(), { service } = f.runtime;
  const key = await service.createSession('qq'); await service.createQr(key); f.confirm(); await settle();
  const result = await service.checkQr(key);
  assert.equal(result.code, 803); assert.equal(f.runtime.sessions()[0].credential.loginType, 2);
  const rpc = f.requests.filter(req => req.data.req_0);
  for (const config of rpc) {
    assert.equal(config.data.comm.v, String(PROFILE.version));
    assert(Object.values(config.data.comm).every(value => typeof value === 'string'));
    for (const field of ['QIMEI', 'devicelevel', 'newdevicelevel', 'rom']) assert.equal(config.data.comm[field], undefined);
    assert.match(config.data.comm.traceid, /^10002_/);
    assert.equal(config.headers['User-Agent'], qqNativeUserAgent(config.data.comm.os_ver));
  }
  const session = rpc.find(req => req.data.req_0.method === 'GetSession');
  assert.equal(session.data.req_0.param.caller, 2); assert.equal(session.data.comm.sid, undefined);
  const qr = rpc.find(req => req.data.req_0.method === 'CreateQRCode');
  assert.equal(qr.data.comm.ct, '23'); assert.equal(qr.data.comm.cv, '0'); assert.equal(qr.data.req_0.param.cv, PROFILE.version);
  const login = rpc.find(req => req.data.req_0.method === 'Login');
  assert.equal(login.data.comm.cv, String(PROFILE.version)); assert.equal(login.data.comm.tmeLoginType, '6');
  assert.equal(login.data.comm.uid, 'fixture-session-uid'); assert.equal(login.data.comm.sid, 'fixture-session-sid');
  assert.equal(login.data.req_0.param.token, 'interim-fixture-token');
  const otherKey = await service.createSession('qq');
  const refreshed = f.requests.filter(req => req.data.req_0 && req.data.req_0.method === 'GetSession').at(-1);
  assert.equal(refreshed.data.req_0.param.caller, 1); service.cancelSession(otherKey); await service.logout(result.cookie.replace('qqmusic_session=', ''));
});
test('exchange rejection keeps 50006 and validation 1000; UI never claims expiry or a wrong scanner', async () => {
  const f = runtimeFixture(true), notices = [], results = [];
  const session = createQQNativeQrSession({ ...f.runtime, confirmationGraceMs: 0, timeoutMs: 1000,
    notify: notice => notices.push(notice), finish: value => results.push(value) });
  try {
    await f.listening; f.confirm(); await settle(); await session.poll();
    const notice = notices.at(-1);
    assert.equal(notice.stage, 'failed'); assert.equal(notice.expired, false);
    assert.equal(notice.upstreamCode, 1000); assert.equal(notice.exchangeUpstreamCode, 50006);
    assert.match(notice.message, /手机确认已收到/); assert.match(notice.message, /50006/);
    assert.doesNotMatch(notice.message, /若用了|二维码已过期|interim-fixture/);
    assert.equal(results.length, 0); assert.equal(f.runtime.sessions().length, 0);
  } finally { session.stop(); }
});
test('adapter leaves other HTTP routes unchanged and does not mutate caller RPC parameters', async () => {
  const seen = [], store = repository(migrateDevice(createAndroidDevice()));
  const protocol = createNativeProtocol({ request: async config => { seen.push(config); return { data: {} }; }, getCookieHeader: () => '' }, store);
  protocol.deviceRepository.load();
  const web = { url: 'https://ptlogin2.qq.com/fixture', headers: { 'User-Agent': 'web-fixture' } };
  await protocol.http.request(web); assert.equal(seen[0], web);
  const body = { comm: { ct: 11, cv: 14090008, os_ver: '15' }, req_0: { module: 'music.getSession.session', method: 'GetSession', param: { uid: 'existing', caller: 0 } } };
  await protocol.http.post('https://u.y.qq.com/cgi-bin/musicu.fcg', body);
  assert.equal(body.comm.cv, 14090008); assert.equal(body.req_0.param.caller, 0);
  assert.equal(seen[1].data.req_0.param.caller, 1); assert.match(seen[1].headers['User-Agent'], /android 15/);
});
test('server sends the same native profile for playback while web requests retain their original headers', async () => {
  for (const native of [true, false]) {
    let request;
    const context = vm.createContext({ nativeCommForCookie: () => native ? { cv: PROFILE.version, os_ver: '15' } : null,
      qqCookieObject: () => ({}), qqNativeUserAgent, QQ_HEADERS: { 'User-Agent': 'web-original' }, Buffer, qqCookie: 'fixture-cookie',
      requestText: async (url, options, body) => { request = options; request.body = body; return '{}'; }, parseJSONText: JSON.parse, QQ_MUSICU_URL: 'https://u.y.qq.com/cgi-bin/musicu.fcg' });
    loadFunctions(context, 'server.js', ['parseCookieString', 'qqMusicRequest']);
    await context.qqMusicRequest({ comm: { cv: 14090008 }, req_0: {} }, { cookie: true });
    assert.equal(request.headers['User-Agent'], native ? qqNativeUserAgent('15') : 'web-original');
    assert.equal(JSON.parse(request.body).comm.cv, native ? PROFILE.version : 14090008);
  }
});
test('19-digit WeChat/phone account ids reach the exchange and the saved cookie without rounding', async () => {
  const uin = '1152921504838201234', requests = [], store = repository(createAndroidDevice());
  let emit, ready;
  const listening = new Promise(resolve => { ready = resolve; });
  const runtime = createQQNativeRuntime({ deviceRepository: store,
    http: { getCookieHeader: () => '', request: async config => {
      requests.push(config);
      if (config.url.includes('tme/trpc')) return { status: 200, data: { code: 0, data: JSON.stringify({ code: 0, data: { q16: 'q16', q36: 'q36' } }) } };
      if (typeof config.data === 'string') {
        assert.equal(config.responseType, 'text');
        assert.match(config.data, new RegExp('"musicid":' + uin + '[,}]'));
        return { status: 200, data: '{"code":0,"req_0":{"code":0,"data":{"musicid":' + uin + ',"musickey":"Q_H_L_fixture:1152921504838201999,","loginType":1}}}' };
      }
      const req = config.data.req_0;
      let data = {};
      if (req.method === 'GetSession') data = { session: { uid: 'uid', sid: 'sid' } };
      if (req.method === 'CreateQRCode') data = { qrcodeID: 'fixture-qr', qrcode: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') };
      if (req.method === 'Login') throw new Error('exchange must not be sent as a rounded object');
      return { status: 200, data: { code: 0, req_0: { code: 0, data } } };
    } },
    listen: (_id, onEvent) => { emit = onEvent; ready(); return { ready: Promise.resolve(), done: new Promise(() => {}), close() {} }; } });
  const results = [];
  const session = createQQNativeQrSession({ ...runtime, timeoutMs: 1000, notify: () => {}, finish: value => results.push(value) });
  try {
    await listening;
    emit({ type: 'cookies', payload: { cookies: { qqmusic_uin: { value: uin }, qqmusic_key: { value: 'interim' } } } });
    await settle(); await session.poll();
    assert.equal(results.length, 1);
    assert.match(results[0].cookie, new RegExp('qqmusic_uin=' + uin + ';'));
    assert.match(results[0].cookie, /qm_keyst=Q_H_L_fixture:1152921504838201999,;/);
    assert.match(results[0].cookie, /tmeLoginType=1;/);
  } finally { session.stop(); }
});
test('large-integer JSON parsing leaves strings and safe numbers alone', () => {
  const { parseJsonKeepingLargeIntegers } = require('../desktop/qq-native-protocol');
  assert.deepEqual(parseJsonKeepingLargeIntegers('{"a":1152921504838201234,"b":"x\\"12345678901234567890","c":-3.5e2,"d":[42,9007199254740993]}'),
    { a: '1152921504838201234', b: 'x"12345678901234567890', c: -350, d: [42, '9007199254740993'] });
});
