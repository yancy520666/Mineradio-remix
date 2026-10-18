'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readBoundedRequestBody } = require('../server-security');

function request() {
  const req = new EventEmitter();
  req.destroy = () => { req.destroyed = true; req.emit('close'); };
  return req;
}
function clean(req) {
  for (const event of ['data', 'end', 'error', 'aborted', 'close']) assert.equal(req.listenerCount(event), 0, event);
}

test('JSON preserves multibyte text split across Buffer chunks and cleans listeners', async () => {
  const req = request(); const promise = readBoundedRequestBody(req);
  const input = Buffer.from('{"text":"歌词"}');
  for (const byte of input) req.emit('data', Buffer.from([byte]));
  req.emit('end'); assert.deepEqual(await promise, { text: '歌词' }); clean(req);
});
test('empty and form bodies retain successful contracts, prototype key remains ordinary data', async () => {
  for (const [raw, expected] of [['', {}], ['a=1&a=2&title=%E6%AD%8C', { a: '2', title: '歌' }]]) {
    const req = request(); const promise = readBoundedRequestBody(req);
    if (raw) req.emit('data', Buffer.from(raw)); req.emit('end');
    assert.deepEqual(await promise, expected); clean(req);
  }
  const req = request(); const promise = readBoundedRequestBody(req);
  req.emit('data', Buffer.from('__proto__=plain')); req.emit('end');
  const result = await promise;
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__').value, 'plain');
});
for (const [event, code] of [['error','REQUEST_BODY_READ_FAILED'], ['aborted','REQUEST_BODY_ABORTED'], ['close','REQUEST_BODY_PREMATURE_CLOSE']]) {
  test(`${event} rejects incomplete data instead of running mutation with empty body`, async () => {
    const req = request(); let mutated = false;
    const promise = readBoundedRequestBody(req).then(value => { mutated = true; return value; });
    req.emit('data', Buffer.from('{"partial":'));
    req.emit(event, new Error('synthetic transport failure'));
    await assert.rejects(promise, { code }); assert.equal(mutated, false); clean(req);
    req.emit('end'); clean(req);
  });
}
test('limits actual UTF8 bytes, closes oversized request and releases listeners', async () => {
  const req = request(); const promise = readBoundedRequestBody(req, { maxBytes: 4 });
  req.emit('data', Buffer.from('歌词')); // six bytes, only two JS characters
  await assert.rejects(promise, { code: 'REQUEST_BODY_TOO_LARGE', statusCode: 413 });
  assert.equal(req.destroyed, true); clean(req);
});
test('overall body deadline settles even without incoming events', async () => {
  const req = request(); const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(readBoundedRequestBody(req, { timeoutMs: 10 }), { code: 'REQUEST_BODY_TIMEOUT' });
    assert.equal(req.destroyed, true); clean(req);
  } finally { clearTimeout(keepAlive); }
});
test('already unavailable request rejects immediately without listeners', async () => {
  for (const key of ['destroyed', 'aborted', 'readableEnded']) {
    const req = request(); req[key] = true;
    await assert.rejects(readBoundedRequestBody(req), { code: 'REQUEST_BODY_UNAVAILABLE' }); clean(req);
  }
});
