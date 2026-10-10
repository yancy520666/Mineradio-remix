'use strict';

// Benign, loopback-only contracts. Never disables certificate verification.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const [base, mode] = process.argv.slice(2);
assert.ok(['tls-untrusted', 'get-https-ca', 'connect-refused', 'checksum-mismatch'].includes(mode));
const sockets = new Set();
const servers = [];
const caches = [];
let proxyHits = 0;
let connectHits = 0;
let errorEvidence = null;
let tlsOptionsEvidence = null;
const listen = async server => {
  servers.push(server);
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
};
const request = (url, options) => new Promise((resolve, reject) => {
  const req = https.get(url, options, res => {
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => resolve(body));
  });
  req.setTimeout(2000, () => req.destroy(new Error('fixture timeout')));
  req.on('error', reject);
});

(async () => {
  const cert = fs.readFileSync(path.join(__dirname, 'fixture-cert.pem'));
  const key = fs.readFileSync(path.join(__dirname, 'fixture-key.pem'));
  const originPort = await listen(http.createServer((req, res) => res.end('origin-ok')));
  const securePort = await listen(https.createServer({ cert, key }, (req, res) => res.end('tls-ok')));
  const proxy = http.createServer((req, res) => {
    proxyHits += 1;
    assert.equal(req.url, `http://127.0.0.1:${originPort}/benign-fixture.txt`);
    res.end('proxy-ok');
  });
  proxy.on('connect', (req, client, head) => {
    connectHits += 1;
    assert.equal(req.url, `localhost:${securePort}`);
    if (mode === 'connect-refused') {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const dest = net.connect(securePort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) dest.write(head);
      client.pipe(dest);
      dest.pipe(client);
    });
    sockets.add(dest);
    dest.on('close', () => sockets.delete(dest));
    dest.on('error', () => client.destroy());
    client.on('error', () => dest.destroy());
  });
  const proxyPort = await listen(proxy);
  for (const name of Object.keys(process.env)) {
    if (/proxy/i.test(name)) delete process.env[name];
  }
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  process.env.GLOBAL_AGENT_HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
  process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.GLOBAL_AGENT_HTTP_PROXY;
  process.env.ELECTRON_GET_NO_PROGRESS = '1';
  const getPath = path.join(base, 'app-builder-lib/node_modules/@electron/get');
  const get = require(getPath);
  get.initializeProxy();
  const version = require(path.join(require.resolve('global-agent', { paths: [getPath] }), '../../package.json')).version;
  const originalAddRequest = https.globalAgent.addRequest;
  https.globalAgent.addRequest = function (req, config) {
    tlsOptionsEvidence = {
      hasCA: Boolean(config.ca),
      secureEndpoint: config.secureEndpoint === undefined ? 'absent' : config.secureEndpoint,
      protocol: config.protocol,
      rejectUnauthorized: config.rejectUnauthorized === undefined ? 'default' : config.rejectUnauthorized,
    };
    return originalAddRequest.call(this, req, config);
  };

  if (mode === 'tls-untrusted') {
    await assert.rejects(request(`https://localhost:${securePort}/artifact`, {}), err => {
      errorEvidence = { code: err.code, message: err.message };
      return ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(err.code);
    });
    assert.equal(connectHits, 1);
  }
  if (mode === 'connect-refused') {
    await assert.rejects(request(`https://localhost:${securePort}/artifact`, { ca: cert }), err => {
      errorEvidence = { code: err.code, message: err.message };
      return /Proxy server refused connecting.*407 Proxy Authentication Required/.test(err.message);
    });
    assert.equal(connectHits, 1);
  }
  if (mode === 'get-https-ca' || mode === 'checksum-mismatch') {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'get-extended-contract-'));
    caches.push(cacheRoot);
    const artifactName = 'benign-fixture.txt';
    const payload = mode === 'get-https-ca' ? 'tls-ok' : 'proxy-ok';
    const url = mode === 'get-https-ca'
      ? `https://localhost:${securePort}/${artifactName}`
      : `http://127.0.0.1:${originPort}/${artifactName}`;
    const options = {
      version: '9.9.9',
      artifactName,
      isGeneric: true,
      cacheRoot,
      checksums: { [artifactName]: mode === 'checksum-mismatch' ? '0'.repeat(64) : crypto.createHash('sha256').update(payload).digest('hex') },
      mirrorOptions: { resolveAssetURL: async () => url },
      downloadOptions: {
        quiet: true,
        retry: { limit: 0 },
        timeout: { request: 2000 },
        ...(mode === 'get-https-ca' ? { https: { certificateAuthority: cert, rejectUnauthorized: true } } : {}),
      },
    };
    if (mode === 'get-https-ca') {
      const file = await get.downloadArtifact(options);
      assert.equal(fs.readFileSync(file, 'utf8'), 'tls-ok');
      assert.equal(connectHits, 1);
    } else {
      await assert.rejects(get.downloadArtifact(options), err => {
        errorEvidence = { code: err.code, message: err.message };
        return err.constructor.name === 'ChecksumMismatchError' && err.filename === artifactName;
      });
      assert.equal(proxyHits, 1);
      assert.equal(fs.readdirSync(cacheRoot).length, 0);
    }
  }
  console.log(JSON.stringify({ version, mode, passed: true, proxyHits, connectHits, tlsOptionsEvidence, errorEvidence }));
})().catch(err => {
  console.error(JSON.stringify({ mode, passed: false, proxyHits, connectHits, tlsOptionsEvidence, error: { code: err.code, message: err.message } }));
  process.exitCode = 1;
}).finally(() => {
  for (const socket of sockets) socket.destroy();
  for (const server of servers) server.close();
  for (const cache of caches) fs.rmSync(cache, { recursive: true, force: true });
});
