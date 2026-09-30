'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { isTrustedLocalApiRequest, resolvePublicTarget, fetchPublicResource, requestPinned } = require('../server-security');

test('HTTP boundary preserves same-origin/native requests and rejects remote authority', () => {
  const request = headers => ({ headers: { host: '127.0.0.1:3000', ...headers }, socket: { remoteAddress: '127.0.0.1', localPort: 3000 } });
  for (const headers of [{}, { origin: 'http://127.0.0.1:3000' }, { referer: 'http://127.0.0.1:3000/index.html', 'sec-fetch-site': 'same-origin' }]) assert(isTrustedLocalApiRequest(request(headers)));
  for (const headers of [{ host: 'evil.test:3000' }, { host: '127.0.0.1:4000' }, { host: 'user@127.0.0.1:3000' }, { host: '127.0.0.1:3000/#x' }, { origin: 'null' }, { origin: 'http://evil.test' }, { origin: 'http://user@127.0.0.1:3000' }, { referer: 'https://evil.test/' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal(isTrustedLocalApiRequest(request(headers)), false, JSON.stringify(headers));
  const remote = request({}); remote.socket.remoteAddress = '192.168.1.20'; assert.equal(isTrustedLocalApiRequest(remote), false);
});

test('proxy blocks encoded, mapped, DNS and redirect targets before opening a socket', async () => {
  for (const url of ['http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://10.0.0.1', 'http://169.254.169.254', 'http://[::1]', 'http://[0:0:0:0:0:ffff:7f00:1]', 'http://[fc00::1]', 'http://user:pass@8.8.8.8', 'file:///C:/secret']) await assert.rejects(resolvePublicTarget(url));
  await assert.rejects(resolvePublicTarget('https://rebind.test/', async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), { code: 'UNSAFE_PROXY_URL' });
  let requests = 0;
  const send = async target => { requests++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }); };
  await assert.rejects(fetchPublicResource('http://8.8.8.8/', {}, { request: send }), { code: 'UNSAFE_PROXY_URL' });
  assert.equal(requests, 1);
  const good = await fetchPublicResource('http://8.8.8.8/', { headers: { Range: 'bytes=0-3' } }, {
    request: async (target, options) => {
      assert.equal(options.headers.Range, 'bytes=0-3');
      return target.url.pathname === '/' ? new Response(null, { status: 302, headers: { location: '/song.mp3' } }) : new Response('wave', { status: 206 });
    }
  });
  assert.equal(good.status, 206); assert.equal(await good.text(), 'wave');
});

test('transport uses its validated address, preserving HEAD and Range bytes', async t => {
  const server = http.createServer((req, res) => {
    assert(req.headers.host.startsWith('unresolvable.invalid:'));
    if (req.url === '/reset') { res.writeHead(205); res.end(); return; }
    if (req.url === '/invalid-status') { res.writeHead(600); res.end(); return; }
    if (req.url === '/broken') { res.writeHead(200); res.write('wave'); setTimeout(() => res.destroy(), 30); return; }
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-length': '4' }); res.end(); }
    else { assert.equal(req.headers.range, 'bytes=0-3'); res.writeHead(206, { 'content-range': 'bytes 0-3/10' }); res.end('wave'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const target = { url: new URL(`http://unresolvable.invalid:${server.address().port}/song`), address: '127.0.0.1', family: 4 };
  const head = await requestPinned(target, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const range = await requestPinned(target, { headers: { Range: 'bytes=0-3' } }); assert.equal(range.status, 206); assert.equal(await range.text(), 'wave');
  target.url.pathname = '/reset'; assert.equal((await requestPinned(target)).status, 205);
  target.url.pathname = '/invalid-status'; await assert.rejects(requestPinned(target));
  target.url.pathname = '/broken'; const broken = await requestPinned(target); await assert.rejects(broken.text());
});

test('actual server rejects cross-site calls and every private media entry', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-security-'));
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, PORT: String(port) };
  for (const key of ['COOKIE_FILE', 'QQ_COOKIE_FILE', 'KUGOU_COOKIE_FILE', 'QISHUI_COOKIE_FILE', 'QISHUI_TOKEN_FILE', 'QISHUI_QR_CONFIG_FILE', 'MINERADIO_LISTEN_SYNC_FILE', 'CUEFIELD_FEEDBACK_FILE']) env[key] = path.join(temp, key);
  // Only the synthetic host uses a controlled transport fixture. All other
  // URLs still exercise the production resolver/private-address checks.
  const boot = `const http = require('http'), security = require('./server-security');
    const upstream = http.createServer((req, res) => {
      if (req.url === '/svg') { res.writeHead(200, {'content-type':'image/svg+xml'}); res.end('<svg/>'); return; }
      if (req.url === '/jpg') { res.writeHead(200, {'content-type':'image/jpg; charset=binary'}); res.end(Buffer.from([255,216,255,217])); return; }
      res.writeHead(200, {'content-type':'image/png'}); res.write('fixture'); setTimeout(() => res.destroy(), 30);
    });
    upstream.listen(0, '127.0.0.1', () => {
      const original = security.fetchPublicResource;
      security.fetchPublicResource = (value, options) => {
        const url = new URL(value);
        if (url.hostname !== 'fixture.invalid') return original(value, options);
        return security.requestPinned({url:new URL('http://fixture.invalid:' + upstream.address().port + url.pathname), address:'127.0.0.1', family:4}, options);
      };
      require('./server');
    });`;
  const child = spawn(process.execPath, ['-e', boot], { cwd: path.resolve(__dirname, '..'), env, stdio: 'ignore' });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); } fs.rmSync(temp, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let retry = 0; retry < 80; retry++) {
    try { ready = (await fetch(base + '/api/app/version')).ok; if (ready) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert(ready, 'isolated server started');
  const legitimate = await fetch(base + '/api/app/version'); assert.equal(legitimate.headers.get('access-control-allow-origin'), null);
  const bridge = await fetch(base + '/vendor/sonic-workshop/mineradio-bridge.html');
  assert.equal(bridge.headers.get('content-security-policy'), "frame-ancestors 'self'");
  assert.equal(bridge.headers.get('x-frame-options'), 'SAMEORIGIN');
  const player = await fetch(base + '/index.html');
  assert.equal(player.headers.get('content-security-policy'), "frame-ancestors 'none'");
  assert.equal(player.headers.get('x-frame-options'), 'DENY');
  for (const headers of [{ Origin: 'https://evil.test' }, { Host: 'evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const status = await new Promise((resolve, reject) => {
      http.get(base + '/api/app/version', { headers }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  for (const route of ['/api/cover?url=', '/api/audio?url=']) {
    const blocked = await fetch(base + route + encodeURIComponent('http://127.0.0.1:1/private'));
    assert(!blocked.ok);
  }
  const decrypt = await fetch(base + '/api/audio?url=' + encodeURIComponent('http://127.0.0.1:1/private#auth=fixture')); assert(!decrypt.ok);
  const podcast = await fetch(base + '/api/podcast/dj-beatmap?intro=1&url=' + encodeURIComponent('http://127.0.0.1:1/private')); assert(!podcast.ok);
  const svg = await fetch(base + '/api/cover?url=' + encodeURIComponent('https://fixture.invalid/svg')); assert.equal(svg.status, 415);
  const jpg = await fetch(base + '/api/cover?url=' + encodeURIComponent('https://fixture.invalid/jpg'));
  assert.equal(jpg.status, 200); assert.equal(jpg.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await jpg.arrayBuffer()), Buffer.from([255,216,255,217]));
  await assert.rejects(async () => {
    const interrupted = await fetch(base + '/api/cover?url=' + encodeURIComponent('https://fixture.invalid/broken'));
    await interrupted.arrayBuffer();
  });
  assert((await fetch(base + '/api/app/version')).ok, 'interrupted cover streams cannot crash or hang the server');
  const source = fs.readFileSync(path.join(__dirname, '../dj-analyzer.js'), 'utf8');
  assert(!/\bfetch\(audioUrl/.test(source), 'podcast alternate path uses the shared boundary');
});
