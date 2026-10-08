'use strict';
// Only the isolated child loads the user-provided official native SDK.
let sdk;
process.on('message', message => {
  const id = message && message.id;
  try {
    const url = new URL(message.url);
    if (url.protocol !== 'https:' || url.hostname !== 'api.qishui.com' || url.pathname !== '/luna/pc/track_v2'
        || url.username || url.password || url.hash || url.port && url.port !== '443') throw Error('TARGET_REJECTED');
    if (!sdk) { sdk = require(message.modulePath); sdk.init({ deviceId: message.deviceId }); }
    const start = performance.now();
    const lines = Object.entries(message.headers).map(([name, value]) => name + '\r\n' + value).join('\r\n');
    const raw = sdk.generateHttpSignatureHeaders(url.href, lines);
    const fields = String(raw || '').split('\r\n').filter(item => item.trim());
    const headers = {};
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const name = fields[i].toLowerCase(), value = fields[i + 1];
      if (/^x-(helios|medusa)$/.test(name) && value.length < 16384 && !/[\r\n]/.test(value)) headers[name] = value;
    }
    if (!headers['x-helios'] || !headers['x-medusa']) throw Error('SIGNATURE_INCOMPLETE');
    if (process.connected) process.send({ id, headers, signMs: performance.now() - start });
  } catch (_) { if (process.connected) process.send({ id, error: 'QISHUI_NATIVE_SIGN_FAILED' }); }
});
process.on('disconnect', () => process.exit(0));
