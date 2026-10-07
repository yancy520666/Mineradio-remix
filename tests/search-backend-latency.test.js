'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

function topLevelFunction(name) {
  const start = serverSource.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `missing ${name}()`);
  const end = serverSource.indexOf('\n}\n', start);
  return serverSource.slice(start, end + 2);
}

test('search cache shares in-flight work and never keeps empty results', async () => {
  const sandbox = { Date, Promise, Array, Map };
  vm.runInNewContext(`const SEARCH_RESULT_CACHE_TTL_MS = 120000;\n${topLevelFunction('createSearchResultCache')}\nthis.create = createSearchResultCache;`, sandbox);
  const cache = sandbox.create(4);
  let calls = 0;
  const load = () => { calls += 1; return Promise.resolve([{ name: '晴天' }]); };
  await Promise.all([cache.wrap('a', load), cache.wrap('a', load)]);
  await cache.wrap('a', load);
  assert.equal(calls, 1);

  let emptyCalls = 0;
  await cache.wrap('b', () => { emptyCalls += 1; return []; });
  await cache.wrap('b', () => { emptyCalls += 1; return []; });
  assert.equal(emptyCalls, 2, 'an empty answer may be a transient upstream failure');
});

test('QQ search only asks for song details when the search row is incomplete', () => {
  const sandbox = {};
  vm.runInNewContext(`${topLevelFunction('qqSearchTrackComplete')}\nthis.complete = qqSearchTrackComplete;`, sandbox);
  const full = {
    mid: '001', name: '晴天', interval: 269,
    file: { media_mid: '001m' },
    singer: [{ mid: 's1', name: '周杰伦' }],
    album: { mid: 'a1', name: '叶惠美' },
    pay: { pay_play: 0 },
  };
  assert.equal(sandbox.complete(full), true);
  assert.equal(sandbox.complete({ ...full, file: {} }), false, 'playback needs media_mid');
  assert.equal(sandbox.complete({ ...full, pay: undefined }), false, 'VIP marking needs pay info');
  assert.equal(sandbox.complete({ ...full, singer: [] }), false);
  assert.match(topLevelFunction('fetchQQSearch'), /_qqSearchComplete\) return item/);
});
