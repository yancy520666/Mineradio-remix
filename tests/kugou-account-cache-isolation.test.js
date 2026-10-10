'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const sourcePath = path.join(__dirname, '..', 'kugou-api.js');
const requireRoot = createRequire(sourcePath);
const source = fs.readFileSync(sourcePath, 'utf8');
const hash = 'abcdef123456';
function fixture() {
  const calls = [];
  let gate = null;
  const fakeHttps = { request(target, options, callback) {
    const req = new EventEmitter(); let body = '';
    req.setTimeout = () => req;
    req.write = data => { body += data; };
    req.destroy = error => { if (error) queueMicrotask(() => req.emit('error', error)); };
    req.end = () => {
      const url = new URL(target), sent = body ? JSON.parse(body) : {};
      calls.push({ path: url.pathname, body: sent });
      Promise.resolve().then(async () => {
        if (url.pathname === '/v4/get_list_all_file' && gate) { const waiting = gate; gate = null; await waiting; }
        const userId = Number(sent.userid) || 0;
        const payload = url.pathname === '/v7/get_all_list'
          ? { status: 1, data: { list_count: 1, info: [{ listid: userId + 100, name: '我喜欢' }] } }
          : url.pathname === '/v4/get_list_all_file'
            ? { status: 1, data: { count: 1, info: [{ hash, name: 'fixture-song', fileid: userId + 10000 }] } }
            : { status: 1, data: {} };
        const response = new EventEmitter(); response.statusCode = 200; response.headers = {}; response.complete = true;
        response.destroy = () => {};
        callback(response);
        queueMicrotask(() => { response.emit('data', Buffer.from(JSON.stringify(payload))); response.emit('end'); });
      }).catch(error => req.emit('error', error));
    };
    return req;
  } };
  const c = vm.createContext({ require: name => name === 'https' ? fakeHttps : requireRoot(name),
    module: { exports: {} }, console: { log() {}, warn() {} }, URL, Buffer, setTimeout, clearTimeout });
  vm.runInContext(source, c, { filename: sourcePath });
  return { api: c.module.exports, calls, context: c, pause: promise => { gate = promise; } };
}
const cookie = userId => 'userid=' + userId + '; token=fixture-' + userId + '; kg_mid=fixture-mid';

test('unliking under B never sends A account fileId, even after session reset', async () => {
  const f = fixture();
  await f.api.handleKugouLikeCheck({ hash }, cookie(111));
  f.api.clearKugouSessionCaches();
  await f.api.handleKugouLikeToggle({ hash, name: 'fixture-song' }, false, cookie(222));
  const deletion = f.calls.find(call => call.path === '/v4/delete_songs').body;
  assert.equal(deletion.userid, 222);
  assert.equal(deletion.listid, 322);
  assert.equal(deletion.data[0].fileid, 10222, JSON.stringify(deletion));
  assert(f.calls.some(call => call.path === '/v4/get_list_all_file' && call.body.userid === 222));
});
test('late reads from a cleared session cannot refill favorite-list or fileId caches', async () => {
  const f = fixture(); let release;
  f.pause(new Promise(resolve => { release = resolve; }));
  const old = f.api.handleKugouLikeCheck({ hash }, cookie(111));
  while (!f.calls.some(call => call.path === '/v4/get_list_all_file')) await new Promise(setImmediate);
  f.api.clearKugouSessionCaches(); release(); await old;
  assert.equal(vm.runInContext('kugouLikeFileIdByHash.size', f.context), 0);
  assert.equal(vm.runInContext('kugouFavoriteListCache.listId', f.context), '');
});
