'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const report = { provider: 'netease', song: { id: 1 }, sessionId: 'fixture-session', listenMs: 60000, durationMs: 180000 };
function fixture(waitAt) {
  const writes = [], journal = [], sent = []; let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const c = vm.createContext({ console: { error() {} }, userCookie: 'n-A', qqCookie: 'qq-A', kugouCookie: 'kg-A', qishuiCookie: 'qs-A',
    loginSessionGeneration: { netease: 0, qq: 0, kugou: 0, qishui: 0 },
    getLoginInfo: async () => { if (waitAt === 'login') await gate; return { loggedIn: true, userId: 111 }; },
    scrobble: async params => { writes.push(params); if (waitAt === 'upstream') await gate; return { body: { code: 200 } }; },
    listenSyncJournal: { entries: {} }, listenSyncJournalKey: (...args) => args.join('|'),
    rememberListenSyncSubmission: (key, result) => journal.push({ key, result }),
    normalizeApiCode: r => r.body.code, normalizeApiMessage: () => '',
    qishuiCookieHasLogin: () => true,
    readRequestBody: async () => { if (waitAt === 'body') await gate; return report; },
    sendJSON: (_res, payload, status = 200) => sent.push({ payload, status }),
  });
  loadFunctions(c, 'server.js', ['normalizeListenReportProvider', 'listenReportSongId', 'validateListenReport', 'handlePlatformListenReport']);
  for (const name of ['captureProviderAccountSession', 'checkProviderAccountSession']) if (source.includes('function ' + name + '(')) loadFunctions(c, 'server.js', [name]);
  const first = source.indexOf("  if (pn === '/api/listen/report') {");
  const last = source.indexOf("  if (pn === '", first + 1);
  vm.runInContext('async function route(req, res) { const pn = "/api/listen/report";\n' + source.slice(first, last) + '\n}', c);
  return { c, writes, journal, sent, resume };
}
for (const waitAt of ['body', 'login', 'upstream']) test('listen report remains bound to A through ' + waitAt, async () => {
  const f = fixture(waitAt), pending = f.c.route({ method: 'POST' }, {});
  await new Promise(setImmediate);
  f.c.userCookie = 'n-B'; f.c.loginSessionGeneration.netease += 1;
  f.resume(); await pending;
  if (waitAt === 'upstream') {
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].cookie, 'n-A');
    assert(f.journal.every(entry => entry.key.includes('|n-A|')), 'idempotency is scoped to the submitting session');
  } else assert.equal(f.writes.length, 0, JSON.stringify(f.writes));
  assert.equal(f.sent[0].status, 409);
});
