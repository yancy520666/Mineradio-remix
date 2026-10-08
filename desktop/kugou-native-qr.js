'use strict';

// Official client QR contract, referenced from MakcRe/KuGouMusicApi (GPL-3.0).
// A website `t` cookie is not proof that cloudlist accepts the session.
const https = require('https');
const crypto = require('crypto');
const QRCode = require('qrcode');

function requestQr(path, params, mid) {
  const query = { dfid: '-', mid, uuid: '-', appid: 1005, clientver: 20489,
    clienttime: Math.floor(Date.now() / 1000), srcappid: 2919, ...params };
  const salt = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
  query.signature = crypto.createHash('md5').update(salt + Object.keys(query).sort()
    .map(k => k + '=' + query[k]).join('') + salt).digest('hex');
  const url = new URL(path, 'https://login-user.kugou.com');
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const req = https.get(url, { headers: { Referer: 'https://www.kugou.com/', 'User-Agent': 'Mozilla/5.0' } }, res => {
      const chunks = [];
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 256 * 1024) req.destroy(new Error('KUGOU_QR_RESPONSE_TOO_LARGE'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('KUGOU_QR_RESPONSE_ABORTED')));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode !== 200 || Number(json.status) !== 1) throw new Error('KUGOU_QR_REQUEST_FAILED');
          resolve(json.data || {});
        } catch (_) { reject(new Error('KUGOU_QR_REQUEST_FAILED')); }
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error('KUGOU_QR_TIMEOUT')), 8000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
  });
}

function createKugouNativeQrSession(options) {
  const request = options.request || requestQr;
  const renderQr = options.renderQr || (url => QRCode.toDataURL(url, { width: 240, margin: 2 }));
  const mid = crypto.randomBytes(16).toString('hex');
  let stopped = false, busy = false, generation = 0, key = '', image = '', expired = false, started = 0, failures = 0;
  const finish = result => { if (!stopped) { stop(); options.finish(result); } };
  async function refresh() {
    const epoch = ++generation;
    key = ''; expired = false;
    try {
      const data = await request('/v2/qrcode', { appid: 1001, type: 1, plat: 4,
        qrcode_txt: 'https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=1005&' }, mid);
      if (stopped || epoch !== generation) return;
      const nextKey = String(data.qrcode || '');
      if (!nextKey || nextKey.length > 4096) throw new Error('KUGOU_QR_INVALID');
      const nextImage = await renderQr('https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=' + encodeURIComponent(nextKey));
      if (stopped || epoch !== generation) return;
      key = nextKey; image = nextImage; expired = false; started = Date.now(); failures = 0;
      options.notify({ stage: 'qr', image, expired: false });
    } catch (_) {
      if (!stopped && epoch === generation) finish({ ok: false, inline: true, fallback: true, error: 'KUGOU_QR_UNAVAILABLE' });
    }
  }
  async function poll() {
    if (stopped || busy || !key || expired) return;
    const epoch = generation;
    busy = true;
    try {
      const data = await request('/v2/get_userinfo_qrcode', { plat: 4, qrcode: key }, mid);
      if (stopped || epoch !== generation) return;
      failures = 0;
      const status = Number(data.status);
      if (status === 4) {
        const userid = String(data.userid || '');
        const token = String(data.token || '');
        if (!/^[1-9]\d{0,19}$/.test(userid) || !token || token.length > 2048 || /[;\r\n]/.test(token)) {
          finish({ ok: false, inline: true, error: 'KUGOU_QR_AUTH_INCOMPLETE' }); return;
        }
        finish({ ok: true, cookie: 'userid=' + userid + '; token=' + token + '; kg_mid=' + mid + '; kg_dfid=-' });
      } else if (status === 0 || Date.now() - started > 180000) {
        expired = true; options.notify({ stage: 'qr', image, expired: true });
      } else if (status === 2) options.notify({ stage: 'scanned' });
    } catch (_) {
      if (!stopped && epoch === generation && ++failures >= 3) finish({ ok: false, inline: true, fallback: true, error: 'KUGOU_QR_UNAVAILABLE' });
    } finally { busy = false; }
  }
  const timer = setInterval(poll, 1200);
  if (timer.unref) timer.unref();
  function stop() { stopped = true; generation++; key = ''; clearInterval(timer); }
  refresh();
  return { stop, poll, cancel: () => finish({ ok: false, inline: true, cancelled: true }),
    click: () => { if (stopped || !expired) return false; refresh(); return true; } };
}

module.exports = { createKugouNativeQrSession, requestQr };
