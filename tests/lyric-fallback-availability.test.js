'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const first = source.indexOf('  // ---------- 歌词 ----------');
const last = source.indexOf('  // ---------- 歌曲评论 ----------', first);
assert(first > 0 && last > first);

function route(primary, fallback) {
  const sent = [];
  const c = vm.createContext({ console: { warn() {}, error() {} }, userCookie: 'fixture',
    lyric_new: async () => { if (primary instanceof Error) throw primary; return { body: primary }; },
    lyric: async () => { if (fallback instanceof Error) throw fallback; return { body: fallback }; },
    sendJSON: (_res, payload, status = 200) => sent.push({ payload, status }),
  });
  vm.runInContext('async function route(req, res, url) { const pn = "/api/lyric";\n' + source.slice(first, last) + '\n}', c);
  return c.route({}, {}, new URL('http://127.0.0.1/api/lyric?id=1')).then(() => sent[0]);
}
test('a failed optional legacy translation cannot discard valid lyric_new original lyrics', async () => {
  const result = await route({ lrc: { lyric: '[00:01.00]valid original' } }, new Error('ECONNRESET'));
  assert.equal(result.status, 200);
  assert.equal(result.payload.lyric, '[00:01.00]valid original');
  assert.equal(result.payload.tlyric, '');
});
test('valid karaoke survives optional translation failure; required primary failure remains an error', async () => {
  const result = await route({ yrc: { lyric: '[1000,1000](1000,1000,0)valid' } }, new Error('offline'));
  assert.equal(result.status, 200);
  assert.match(result.payload.yrc, /valid/);
  assert.equal((await route({}, new Error('offline'))).status, 500);
});
test('successful fallback fills missing translation and remains usable if primary failed', async () => {
  const result = await route({ lrc: { lyric: 'original' } }, { lrc: { lyric: 'old' }, tlyric: { lyric: 'translation' } });
  assert.equal(result.payload.lyric, 'original');
  assert.equal(result.payload.tlyric, 'translation');
  assert.equal((await route(new Error('offline'), { lrc: { lyric: 'legacy' } })).payload.lyric, 'legacy');
});
