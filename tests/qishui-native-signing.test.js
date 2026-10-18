'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createNativeSigner, signingHeaders } = require('../desktop/qishui-native-signing');
const target = 'https://api.qishui.com/luna/pc/track_v2';
function harness(extra = {}) {
  const child = new EventEmitter(); child.messages = []; child.kill = () => { child.killed = true; };
  child.send = (message, callback) => { child.messages.push(message); callback(); };
  let starts = 0;
  const signer = createNativeSigner({ modulePath: 'fixture/bdms.node', deviceId: '123456789', ...extra,
    fork: (file, args, options) => { starts++; assert.equal(options.windowsHide, true); assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']); assert.deepEqual(args, []); return child; } });
  const reply = (index, headers = { 'x-helios': 'signature-a', 'x-medusa': 'signature-b' }) => child.emit('message', { id: child.messages[index].id, headers });
  return { signer, child, reply, starts: () => starts };
}
test('signing covers exact UTF-8 body and lowercases the actual headers', () => {
  const body = JSON.stringify({ name: '歌曲' });
  const headers = signingHeaders({ Cookie: 'fixture', 'Content-Length': Buffer.byteLength(body) }, body, { userAgent: 'fixture-client' });
  assert.equal(headers.cookie, 'fixture'); assert.equal(headers['content-length'], Buffer.byteLength(body));
  assert.equal(headers['x-ss-stub'], crypto.createHash('md5').update(body).digest('hex').toUpperCase());
});
test('concurrent signatures preserve each request headers, bound concurrency and isolate the worker', async () => {
  const h = harness();
  const first = h.signer.sign(target + '?track_id=1', { cookie: 'first' });
  const second = h.signer.sign(target + '?track_id=2', { cookie: 'second' });
  await assert.rejects(h.signer.sign(target, {}), /BUSY/);
  h.reply(1); h.reply(0);
  assert.equal((await first).cookie, 'first'); assert.equal((await second).cookie, 'second');
  assert.equal(h.starts(), 1); h.signer.stop(); assert.equal(h.child.killed, true);
});
test('signature injection and targets outside the single official endpoint are rejected', async () => {
  const h = harness();
  for (const url of ['https://evil.invalid/luna/pc/track_v2', 'http://api.qishui.com/luna/pc/track_v2', target + '#fragment']) await assert.rejects(h.signer.sign(url, {}), /TARGET_REJECTED/);
  assert.equal(h.starts(), 0);
  const pending = h.signer.sign(target, {}); h.reply(0, { 'x-helios': 'unsafe\r\ninjected: x', 'x-medusa': 'x' });
  await assert.rejects(pending, /SIGN_FAILED/); h.signer.stop();
});
test('hung workers release pending requests; idle workers are reclaimed', async () => {
  const h = harness({ timeoutMs: 15, idleMs: 15 });
  await assert.rejects(h.signer.sign(target, {}), /STOPPED/); assert.equal(h.child.killed, true);
  const next = harness({ idleMs: 15 }); const request = next.signer.sign(target, {}); next.reply(0); await request;
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(next.child.killed, true);
});
