'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const root = path.resolve(__dirname, '..');

test('confirmed expired credentials are removed from the real server cookie store', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-expired-session-'));
  const env = { ...process.env, PORT: '0', COOKIE_FILE: path.join(dir, 'netease.txt'),
    QQ_COOKIE_FILE: path.join(dir, 'qq.txt'), KUGOU_COOKIE_FILE: path.join(dir, 'kugou.txt'),
    QISHUI_COOKIE_FILE: path.join(dir, 'qishui.txt'), QISHUI_QR_CONFIG_FILE: path.join(dir, 'qr.json'),
    MINERADIO_BEAT_CACHE_DIR: path.join(dir, 'beats'), CUEFIELD_FEEDBACK_FILE: path.join(dir, 'feedback.jsonl'),
    MINERADIO_LISTEN_SYNC_FILE: path.join(dir, 'sync.json') };
  const child = `
    const root = process.argv[1];
    const ncm = require.resolve('NeteaseCloudMusicApi', { paths: [root] });
    require.cache[ncm] = { id:ncm, filename:ncm, loaded:true,
      exports:new Proxy({}, { get:(_,name) => name === '__esModule' ? false : async () => ({body:{code:301}}) }) };
    const server = require(require('path').join(root,'server.js'));
    server.on('listening', async () => {
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        const status = () => fetch(base+'/api/login/status?fresh=1').then(r=>r.json());
        const expired = await status();
        const clear = await fetch(base+'/api/login/expired-session',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({provider:'netease',sessionTag:expired.sessionTag})});
        const result = {expired,clear:await clear.json(),after:await status()};
        process.stdout.write('RESULT '+JSON.stringify(result)); process.exit(0);
      } catch(e) { console.error(e); process.exit(1); }
    });`;
  // The fixture is task-owned and contains no real login data.
  fs.writeFileSync(env.COOKIE_FILE, 'MUSIC_U=fixture-expired');
  const output = execFileSync(process.execPath, ['-e', child, root], { env, encoding: 'utf8', timeout: 30000 });
  const result = JSON.parse(output.slice(output.lastIndexOf('RESULT ') + 7));
  assert.equal(result.expired.sessionRejected, true);
  assert.equal(result.clear.cleared, true);
  assert.equal(!!result.after.hasCookie, false);
  assert.equal(result.after.loggedIn, false);
  assert.equal(fs.existsSync(env.COOKIE_FILE), false, 'removed from disk so a restart cannot restore it');
});

for (const provider of ['netease', 'qq', 'kugou', 'qishui']) {
  test(provider + ' rejects stale cleanup after a new cookie or login attempt', async () => {
    const c = vm.createContext({ crypto: require('node:crypto'), expiredSessionTagSecret: Buffer.alloc(32, 7),
      loginSessionGeneration: { [provider]: 0 }, loginAttempts: { [provider]: null }, cookie: 'old', saved: [],
      captureProviderAccountSession: () => ({ cookie: c.cookie, generation: c.loginSessionGeneration[provider] }),
      bumpLoginSessionGeneration: () => { c.loginSessionGeneration[provider]++; },
      saveCookie: value => c.saved.push(value), saveQQCookie: value => c.saved.push(value),
      saveKugouCookie: value => c.saved.push(value), saveQishuiCookie: value => c.saved.push(value),
      clearQishuiAccessToken() {}, qishuiQrLogin: { clear: async () => {} } });
    loadFunctions(c, 'server.js', ['providerSessionTag', 'clearConfirmedExpiredSession']);
    const old = c.providerSessionTag(provider);
    c.cookie = 'new';
    assert.equal((await c.clearConfirmedExpiredSession(provider, old)).changed, true);
    c.cookie = 'old'; c.loginAttempts[provider] = { id: 'new-attempt' };
    assert.equal((await c.clearConfirmedExpiredSession(provider, old)).changed, true);
    assert.equal(c.saved.length, 0);
    assert.equal((await c.clearConfirmedExpiredSession(provider, c.providerSessionTag(provider))).cleared, true);
    assert.deepEqual(Array.from(c.saved), ['']);
  });
}
