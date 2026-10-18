'use strict';

const https = require('node:https');
const net = require('node:net');

// Bootstrap avoids the system fake-IP answer for the resolver itself. HTTPS
// still verifies dns.alidns.com's certificate and sends that TLS server name.
function requestDnsJson(host, address) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://dns.alidns.com/resolve');
    url.searchParams.set('name', host);
    url.searchParams.set('type', 'A');
    let timer;
    const req = https.get(url, {
      agent: false,
      lookup: (_host, options, callback) => options.all
        ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
    }, res => {
      if (res.statusCode !== 200) { res.destroy(); req.destroy(new Error('MUSIC_DOH_HTTP_FAILED')); return; }
      let size = 0;
      const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 65536) { req.destroy(new Error('MUSIC_DOH_RESPONSE_TOO_LARGE')); return; }
        chunks.push(chunk);
      });
      res.on('error', error => { clearTimeout(timer); reject(error); });
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (error) { reject(error); }
      });
    });
    timer = setTimeout(() => req.destroy(new Error('MUSIC_DOH_TIMEOUT')), 2500);
    req.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

function parseDnsAnswer(host, body) {
  const canonical = name => String(name || '').toLowerCase().replace(/\.$/, '');
  const questions = Array.isArray(body && body.Question) ? body.Question : [body && body.Question];
  if (!body || body.Status !== 0 || body.TC === true || !questions.some(q => q && canonical(q.name) === host && q.type === 1)) {
    throw new Error('MUSIC_DOH_INVALID_ANSWER');
  }
  const answers = Array.isArray(body.Answer) ? body.Answer : [];
  const names = new Set([host]);
  const records = [];
  for (let step = 0; step < 8; step++) {
    const aliases = answers.filter(item => item.type === 5 && names.has(canonical(item.name)) && !names.has(canonical(item.data)));
    if (!aliases.length) break;
    aliases.forEach(item => { names.add(canonical(item.data)); records.push(item); });
  }
  const ips = answers.filter(item => item.type === 1 && names.has(canonical(item.name)));
  if (!ips.length || ips.some(item => !net.isIPv4(item.data))) throw new Error('MUSIC_DOH_NO_ADDRESS');
  records.push(...ips);
  const ttl = Math.min(300, ...records.map(item => Number.isFinite(Number(item.TTL)) ? Math.max(0, Number(item.TTL)) : 0));
  return { addresses: [...new Set(ips.map(item => item.data))].map(address => ({ address, family: 4 })), ttl };
}

function createMusicDnsResolver({ requestJson = requestDnsJson, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function resolveMusicDns(host) {
    const cached = cache.get(host);
    if (cached && cached.until > now()) return cached.addresses.map(item => ({ ...item }));
    cache.delete(host);
    if (pending.has(host)) return pending.get(host);
    if (pending.size >= 32) throw new Error('MUSIC_DOH_BUSY');
    const task = (async () => {
      let lastError;
      for (const address of ['223.5.5.5', '223.6.6.6']) {
        try {
          const answer = parseDnsAnswer(host, await requestJson(host, address));
          if (answer.ttl > 0) {
            if (cache.size >= 128) cache.delete(cache.keys().next().value);
            cache.set(host, { addresses: answer.addresses, until: now() + answer.ttl * 1000 });
          }
          return answer.addresses.map(item => ({ ...item }));
        } catch (error) { lastError = error; }
      }
      throw lastError;
    })().finally(() => pending.delete(host));
    pending.set(host, task);
    return task;
  };
}

module.exports = { createMusicDnsResolver, resolveMusicDns: createMusicDnsResolver() };
