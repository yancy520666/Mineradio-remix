'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createKugouNativeQrSession } = require('../desktop/kugou-native-qr');
const turn = () => new Promise(setImmediate);
function harness(check) {
  const notifications = [], results = [];
  const session = createKugouNativeQrSession({
    request: async (path, params) => path === '/v2/qrcode' ? { qrcode: 'fixture-qr' } : check(params),
    renderQr: async () => 'data:image/png;base64,fixture',
    notify: x => notifications.push(x), finish: x => results.push(x),
  });
  return { session, notifications, results };
}
test('native QR uses only a confirmed complete client session and stops afterward', async () => {
  const h = harness(async () => ({ status: 4, userid: 123, token: 'fixture-client-token' }));
  try {
    await turn(); assert.equal(h.notifications[0].stage, 'qr');
    await h.session.poll(); await h.session.poll();
    assert.equal(h.results.length, 1);
    assert.equal(h.results[0].ok, true);
    assert.match(h.results[0].cookie, /userid=123; token=fixture-client-token/);
  } finally { h.session.stop(); }
});
test('cancellation rejects a late scan confirmation without changing the previous login', async () => {
  let resolve;
  const h = harness(() => new Promise(r => { resolve = r; }));
  await turn(); const pending = h.session.poll(); h.session.cancel();
  resolve({ status: 4, userid: 123, token: 'late-token' }); await pending;
  assert.equal(h.results.length, 1); assert.equal(h.results[0].cancelled, true); assert.equal(h.results[0].cookie, undefined);
});
test('expired QR refreshes on click and malformed credentials never count as login', async () => {
  let status = 0;
  const h = harness(async () => ({ status, userid: 123, token: 'bad;cookie' }));
  try {
    await turn(); await h.session.poll(); assert.equal(h.notifications.at(-1).expired, true);
    assert.equal(h.session.click(), true); await turn(); assert.equal(h.notifications.at(-1).expired, false);
    status = 4; await h.session.poll(); assert.equal(h.results[0].ok, false); assert.equal(h.results[0].cookie, undefined);
  } finally { h.session.stop(); }
});
test('QR creation security challenges retain only validated official URLs and never fall back', async () => {
  for (const challenge of [
    { err_code: 30020, verification_url: 'https://verify.kugou.com/challenge?ticket=fixture' },
    { message: '请完成安全验证', url: 'https://h5.kugou.com/captcha' },
    { err_code: 30020, verify_url: 'https://evil.test/captcha' },
  ]) {
    const results = [];
    const session = createKugouNativeQrSession({ request: async () => challenge,
      renderQr: async () => { throw Error('must not render'); }, notify() {}, finish: result => results.push(result) });
    try {
      await turn();
      assert.equal(results.length, 1);
      assert.equal(results[0].verificationRequired, true);
      assert.equal(results[0].ok, false);
      assert.equal(results[0].fallback, undefined);
      assert.equal(results[0].verificationUrl, challenge.verify_url ? undefined : challenge.verification_url || challenge.url);
    } finally { session.stop(); }
  }
});

test('polling security challenge takes precedence over a complete-looking confirmation and late polls', async () => {
  const h = harness(async () => ({ status: 4, userid: 123, token: 'fixture', err_code: 30020,
    verification_url: 'https://h5.kugou.com/captcha' }));
  try {
    await turn(); await h.session.poll(); await h.session.poll();
    assert.equal(h.results.length, 1);
    assert.equal(h.results[0].verificationRequired, true);
    assert.equal(h.results[0].cookie, undefined);
    assert.equal(h.results[0].fallback, undefined);
  } finally { h.session.stop(); }
});

test('ordinary QR network failures still fall back, while thrown explicit captcha errors do not', async () => {
  for (const message of ['network unavailable', '安全验证']) {
    const results = [];
    const session = createKugouNativeQrSession({ request: async () => { throw new Error(message); },
      renderQr: async () => '', notify() {}, finish: result => results.push(result) });
    try {
      await turn();
      assert.equal(results[0].fallback, message === 'network unavailable' ? true : undefined);
      assert.equal(results[0].verificationRequired, message === '安全验证' ? true : undefined);
    } finally { session.stop(); }
  }
});
