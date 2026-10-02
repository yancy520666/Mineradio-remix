'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

// Runs the real server.js with a fake NeteaseCloudMusicApi whose QR check is
// held open until the scenario releases it. No network or real account.
const child = `
const path = require('path');
const http = require('http');
const root = process.argv[1];
const scenario = process.argv[2];
let releaseQr;
const qrGate = new Promise(resolve => { releaseQr = resolve; });
let qrStarted;
const qrStartedPromise = new Promise(resolve => { qrStarted = resolve; });
const fake = new Proxy({}, { get: (_, name) => {
  if (name === '__esModule') return false;
  if (name === 'login_qr_check') return async () => { qrStarted(); await qrGate;
    return { body: { code: 803, message: 'ok' }, cookie: ['MUSIC_U=fixture-late-login; Path=/'] }; };
  return async () => ({ body: {} });
} });
const ncmPath = require.resolve('NeteaseCloudMusicApi', { paths: [root] });
require.cache[ncmPath] = { id: ncmPath, filename: ncmPath, loaded: true, exports: fake };
const server = require(path.join(root, 'server.js'));
function call(port, pn) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pn, method: pn === '/api/logout' ? 'POST' : 'GET',
      headers: { host: '127.0.0.1:' + port } }, res => {
      let body = ''; res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    });
    req.on('error', reject); req.end();
  });
}
server.on('listening', async () => {
  const port = server.address().port;
  const check = call(port, '/api/login/qr/check?key=fixture');
  await qrStartedPromise;
  if (scenario === 'logout') await call(port, '/api/logout');
  releaseQr();
  const result = await check;
  const status = await call(port, '/api/login/status');
  process.stdout.write(JSON.stringify({ check: result, status: status.body }));
  process.exit(0);
});
`;

function run(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-login-race-'));
  try {
    const env = { ...process.env, PORT: '0',
      COOKIE_FILE: path.join(dir, 'netease.txt'), QQ_COOKIE_FILE: path.join(dir, 'qq.txt'),
      KUGOU_COOKIE_FILE: path.join(dir, 'kugou.txt'), QISHUI_COOKIE_FILE: path.join(dir, 'qishui.txt'),
      QISHUI_QR_CONFIG_FILE: path.join(dir, 'qishui-qr.json'), MINERADIO_BEAT_CACHE_DIR: path.join(dir, 'beats'),
      CUEFIELD_FEEDBACK_FILE: path.join(dir, 'cuefield.jsonl'), MINERADIO_LISTEN_SYNC_FILE: path.join(dir, 'sync.json') };
    const out = execFileSync(process.execPath, ['-e', child, root, scenario], { env, timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const result = JSON.parse(out.slice(out.lastIndexOf('{"check"')));
    const saved = fs.existsSync(env.COOKIE_FILE) ? fs.readFileSync(env.COOKIE_FILE, 'utf8') : '';
    return { ...result, saved };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('NetEase QR confirmation that lands after logout does not revive the account', () => {
  const { check, saved } = run('logout');
  assert.equal(check.status, 409);
  assert.equal(check.body.status, 'cancelled');
  assert.equal(check.body.loggedIn, false);
  assert.doesNotMatch(saved, /fixture-late-login/);
});

test('NetEase QR confirmation without logout still saves the session', () => {
  const { check, saved } = run('normal');
  assert.equal(check.status, 200);
  assert.equal(check.body.code, 803);
  assert.equal(check.body.hasCookie, true);
  assert.ok(saved.length > 0, 'cookie store written');
});
