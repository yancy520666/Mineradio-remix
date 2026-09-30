'use strict';

// Based on upstream PR #304, with DNS results pinned to each socket.
const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');
const { Readable } = require('stream');
const SAFE_COVER_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']);
const blockedV4 = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blockedV4.addSubnet(address, prefix);
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new net.BlockList();
for (const [address, prefix] of [['2001::', 32], ['2001:db8::', 32], ['2002::', 16]]) blockedV6.addSubnet(address, prefix, 'ipv6');
function hostname(value) { return String(value || '').toLowerCase().replace(/^\[|\]$/g, ''); }
function isBlockedIpAddress(value) {
  const ip = hostname(value);
  if (net.isIPv4(ip)) return blockedV4.check(ip);
  if (net.isIPv6(ip)) return !globalV6.check(ip, 'ipv6') || blockedV6.check(ip, 'ipv6');
  return true;
}
function isTrustedLocalApiRequest(req) {
  try {
    const host = new URL('http://' + req.headers.host);
    if (String(req.headers.host).toLowerCase() !== host.host) return false;
    if (!['localhost', '127.0.0.1', '::1'].includes(hostname(host.hostname)) || host.username || host.password || host.pathname !== '/') return false;
    if (req.socket.localPort && Number(host.port || 80) !== req.socket.localPort) return false;
    const peer = hostname(req.socket.remoteAddress);
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) return false;
    const site = String(req.headers['sec-fetch-site'] || '');
    if (site && site !== 'same-origin' && site !== 'none') return false;
    if (req.headers.origin && (new URL(req.headers.origin).origin !== host.origin || new URL(req.headers.origin).origin !== req.headers.origin)) return false;
    if (!req.headers.origin && req.headers.referer && new URL(req.headers.referer).origin !== host.origin) return false;
    return true;
  } catch (_) { return false; }
}
function proxyError(code) { return Object.assign(new Error(code), { code }); }
async function resolvePublicTarget(value, lookup = dns.lookup) {
  let url;
  try { url = new URL(value); } catch (_) { throw proxyError('INVALID_PROXY_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw proxyError('INVALID_PROXY_URL');
  const host = hostname(url.hostname);
  if (host === 'localhost' || host.endsWith('.localhost')) throw proxyError('UNSAFE_PROXY_URL');
  let addresses;
  try { addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true, verbatim: true }); }
  catch (_) { throw proxyError('PROXY_DNS_FAILED'); }
  if (!addresses.length || addresses.some(item => isBlockedIpAddress(item.address))) throw proxyError('UNSAFE_PROXY_URL');
  return { url, address: addresses[0].address, family: addresses[0].family };
}
function requestPinned(target, options = {}) {
  return new Promise((resolve, reject) => {
    let headerTimer;
    const request = (target.url.protocol === 'https:' ? https : http).request(target.url, {
      method: options.method || 'GET', headers: options.headers, agent: false,
      lookup: (_host, lookupOptions, callback) => lookupOptions.all
        ? callback(null, [{ address: target.address, family: target.family }])
        : callback(null, target.address, target.family),
    }, response => {
      clearTimeout(headerTimer);
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) if (value != null) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        const noBody = options.method === 'HEAD' || [204, 205, 304].includes(response.statusCode);
        if (noBody) response.resume();
        resolve(new Response(noBody ? null : Readable.toWeb(response), { status: response.statusCode, headers }));
      } catch (error) { response.destroy(); request.destroy(); reject(error); }
    });
    request.setTimeout(9000, () => request.destroy(proxyError('PROXY_TIMEOUT')));
    headerTimer = setTimeout(() => request.destroy(proxyError('PROXY_TIMEOUT')), 9000);
    request.on('error', error => { clearTimeout(headerTimer); reject(error); });
    request.end();
  });
}
async function fetchPublicResource(value, options = {}, dependencies = {}) {
  const resolveTarget = dependencies.resolveTarget || resolvePublicTarget;
  const send = dependencies.request || requestPinned;
  let target = await resolveTarget(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await send(target, options);
    if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.get('location')) return response;
    if (response.body) await response.body.cancel();
    if (redirects === 5) throw proxyError('PROXY_REDIRECT_LIMIT');
    target = await resolveTarget(new URL(response.headers.get('location'), target.url).href);
  }
}
module.exports = { SAFE_COVER_CONTENT_TYPES, isTrustedLocalApiRequest, isBlockedIpAddress, resolvePublicTarget, requestPinned, fetchPublicResource };
