'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMusicDnsResolver } = require('../music-dns');
const { resolvePublicTarget, fetchPublicResource } = require('../server-security');
const fakeLookup = async () => [{ address: '198.18.0.2', family: 4 }];
test('installer includes the resolver required by the server boundary', () => {
  assert(require('../package.json').build.files.includes('music-dns.js'));
});
const reply = (host, ttl = 30) => ({ Status: 0, Question: [{ name: host + '.', type: 1 }], Answer: [
  { name: host + '.', type: 5, data: 'cdn.example.', TTL: ttl },
  { name: 'cdn.example.', type: 1, data: '8.8.8.8', TTL: ttl },
] });

test('known music fake-IP uses real addresses; public DNS and unsafe hosts do not use DoH', async () => {
  let calls = 0;
  const musicLookup = async host => { calls++; assert.equal(host, 'p1.music.126.net'); return [{ address: '8.8.8.8', family: 4 }]; };
  const target = await resolvePublicTarget('https://p1.music.126.net/image', fakeLookup, musicLookup);
  assert.equal(target.address, '8.8.8.8');
  assert.equal(target.url.hostname, 'p1.music.126.net');
  await resolvePublicTarget('https://p1.music.126.net/image', async () => [{ address: '8.8.4.4', family: 4 }], musicLookup);
  for (const host of ['unknown.test', 'music.126.net.evil.test', '198.18.0.2', 'localhost']) {
    await assert.rejects(resolvePublicTarget('https://' + host + '/', fakeLookup, musicLookup));
  }
  await assert.rejects(resolvePublicTarget('https://p1.music.126.net/', async () => [
    { address: '198.18.0.2', family: 4 }, { address: '127.0.0.1', family: 4 },
  ], musicLookup), { code: 'UNSAFE_PROXY_URL' });
  assert.equal(calls, 1);
});

test('DoH answers and redirects retain private-IP blocking and Range requests', async () => {
  const url = 'https://p1.music.126.net/song';
  for (const address of ['127.0.0.1', '10.0.0.1', '198.18.0.3', '::ffff:127.0.0.1']) {
    await assert.rejects(resolvePublicTarget(url, fakeLookup, async () => [{ address, family: address.includes(':') ? 6 : 4 }]), { code: 'UNSAFE_PROXY_URL' });
  }
  await assert.rejects(resolvePublicTarget(url, fakeLookup, async () => { throw new Error('offline'); }), { code: 'PROXY_DNS_FAILED' });
  let requests = 0;
  await assert.rejects(fetchPublicResource(url, { headers: { Range: 'bytes=0-3' } }, {
    resolveTarget: value => resolvePublicTarget(value, fakeLookup, async () => [{ address: '8.8.8.8', family: 4 }]),
    request: async (target, options) => {
      requests++; assert.equal(target.address, '8.8.8.8'); assert.equal(options.headers.Range, 'bytes=0-3');
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } });
    },
  }), { code: 'UNSAFE_PROXY_URL' });
  assert.equal(requests, 1);
});

test('DoH can be disabled without allowing fake-IP sockets', async () => {
  const old = process.env.MINERADIO_MUSIC_DOH;
  process.env.MINERADIO_MUSIC_DOH = '0';
  try {
    await assert.rejects(resolvePublicTarget('https://p1.music.126.net/', fakeLookup, async () => { throw new Error('must not run'); }), { code: 'UNSAFE_PROXY_URL' });
  } finally { if (old === undefined) delete process.env.MINERADIO_MUSIC_DOH; else process.env.MINERADIO_MUSIC_DOH = old; }
});

test('DoH coalesces queries, honors CNAME TTL and retries after expiration', async () => {
  let clock = 0, calls = 0;
  const resolve = createMusicDnsResolver({ now: () => clock, requestJson: async host => { calls++; return reply(host, 1); } });
  const values = await Promise.all([resolve('music.example'), resolve('music.example')]);
  assert.equal(calls, 1); assert.equal(values[0][0].address, '8.8.8.8');
  values[0][0].address = '127.0.0.1';
  assert.equal((await resolve('music.example'))[0].address, '8.8.8.8');
  clock = 1001; await resolve('music.example'); assert.equal(calls, 2);
});

test('DoH validates question and responses, uses second bootstrap and does not cache failure', async () => {
  const attempts = [];
  const resolve = createMusicDnsResolver({ requestJson: async (host, address) => {
    attempts.push(address); if (address === '223.5.5.5') throw new Error('timeout'); return reply(host);
  } });
  assert.equal((await resolve('music.example'))[0].address, '8.8.8.8');
  assert.deepEqual(attempts, ['223.5.5.5', '223.6.6.6']);
  for (const body of [{ Status: 2 }, reply('other.example'), { ...reply('music.example'), TC: true },
    { ...reply('music.example'), Answer: [{ name: 'unrelated.example', type: 1, data: '8.8.8.8' }] }]) {
    let calls = 0;
    const invalid = createMusicDnsResolver({ requestJson: async () => { calls++; return body; } });
    await assert.rejects(invalid('music.example')); await assert.rejects(invalid('music.example')); assert.equal(calls, 4);
  }
});
