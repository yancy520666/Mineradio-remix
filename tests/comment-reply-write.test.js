'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const { isTrustedLocalApiRequest } = require('../server-security');
const { handleCommentReply, postNeteaseReply, postQQReply, postKugouReply,
  validateCommentReply, replyFailure, COMMENT_REPLY_CAPABILITIES, MAX_REPLY_LENGTH } = require('../comment-reply-write-api');

const body = (provider, extra = {}) => ({ provider, id: '123', parentId: '90071992547409931234',
  commentId: '90071992547409931235', resource: '77', content: '  回复内容 🙂  ', ...extra });
const session = cookie => ({ cookie, generation: 2 });
const auth = { userid: '45', token: 'fake-token', mid: 'fake-mid', dfid: '-', playbackReady: true };

test('reply validation preserves exact IDs and bounded text; unsupported platforms fail before transport', async () => {
  const value = validateCommentReply(body('netease'));
  assert.equal(value.commentId, '90071992547409931235');
  assert.equal(value.parentId, '90071992547409931234');
  assert.equal(value.content, '回复内容 🙂');
  assert.equal(COMMENT_REPLY_CAPABILITIES.qishui, false);
  for (const extra of [{ provider: ['kugou'], resource: '' }, { provider: { toString: () => 'kugou' } },
    { content: '' }, { content: 'x'.repeat(MAX_REPLY_LENGTH + 1) }, { content: 42 },
    { content: 'x\u0000' }, { commentId: '' }, { parentId: 'https://evil.test' },
    { id: '123abc' }, { commentId: 9007199254740994 }, { resource: 'invalid' }]) {
    let calls = 0;
    const result = await handleCommentReply(body('kugou', extra), session('fake'), {
      isCurrent: () => true, extractKugouAuth: () => auth, requestJson: () => { calls++; },
    });
    assert.equal(result.payload.outcome, 'rejected'); assert.equal(calls, 0);
  }
  const unsupported = await handleCommentReply(body('qishui'), session('fake'), { isCurrent: () => true });
  assert.equal(unsupported.status, 501); assert.equal(unsupported.payload.error, 'COMMENT_REPLY_UNSUPPORTED');
});

test('Netease replies target the exact clicked comment and use installed weapi crypto with matching CSRF', async () => {
  let calls = 0;
  const result = await postNeteaseReply(validateCommentReply(body('netease')), 'MUSIC_U=fake; __csrf=fake-csrf', {
    weapi: data => {
      assert.equal(data.threadId, 'R_SO_4_123'); assert.equal(data.commentId, '90071992547409931235');
      assert.equal(data.csrf_token, 'fake-csrf'); return { params: 'fake-encrypted', encSecKey: 'fake-key' };
    },
    requestJson: async (url, options, data) => {
      calls++; assert.equal(url, 'https://music.163.com/weapi/resource/comments/reply');
      assert.equal(options.method, 'POST'); assert.equal(options.timeoutMs, 9000);
      assert.equal(options.headers.Cookie, 'MUSIC_U=fake; __csrf=fake-csrf');
      assert.match(data, /params=fake-encrypted/); return { code: 200, comment: { commentId: '9223372036854775807' } };
    },
  });
  assert.equal(calls, 1); assert.equal(result.replyId, '9223372036854775807');
});

test('QQ uses RepliedCmId for exact nested target, cookie-derived CSRF and frozen account cookie', async () => {
  const cookie = 'qqmusic_uin=45; qm_keyst=fake-key';
  let calls = 0;
  const result = await postQQReply(validateCommentReply(body('qq')), cookie, { qqRequest: async (payload, options) => {
    calls++; assert.equal(options.cookie, cookie); assert.equal(options.timeoutMs, 9000);
    assert.equal(payload.req.module, 'music.globalComment.CommentWriteServer'); assert.equal(payload.req.method, 'AddComment');
    assert.equal(payload.req.param.BizId, '123'); assert.equal(payload.req.param.BizType, 1);
    assert.equal(payload.req.param.RepliedCmId, '90071992547409931235');
    assert.equal(payload.comm.uin, '45'); assert.notEqual(payload.comm.g_tk, 5381);
    assert.equal(payload.comm.g_tk_new_20200303, payload.comm.g_tk);
    assert.equal(payload.req.param.RootCmId, undefined);
    return { code: 0, req: { code: 0, data: { SubCode: 0, AddedCmId: '9223372036854775807' } } };
  } });
  assert.equal(calls, 1); assert.equal(result.replyId, '9223372036854775807');
});

test('Kugou floor writes keep root and exact target separate with the reference-only key contract', async () => {
  for (const top of [false, true]) {
    const input = validateCommentReply(body('kugou', top ? { commentId: '90071992547409931234' } : {}));
    let calls = 0;
    const result = await postKugouReply(input, 'fake-cookie', { now: () => 1700000000000, extractKugouAuth: () => auth,
      requestJson: async (urlText, options, data) => {
        calls++; const url = new URL(urlText);
        assert.equal(url.origin, 'https://gateway.kugou.com'); assert.equal(url.pathname, '/index.php');
        assert.equal(url.searchParams.get('r'), 'commentsv2/reply'); assert.equal(url.searchParams.get('childrenid'), '77');
        assert.equal(url.searchParams.get('tid'), '90071992547409931234');
        assert.equal(url.searchParams.get('pid'), top ? '0' : '90071992547409931235');
        assert.equal(url.searchParams.get('is_t'), top ? '1' : '0');
        assert.equal(url.searchParams.get('clienttoken'), 'fake-token'); assert.equal(url.searchParams.get('kugouid'), '45');
        assert.equal(url.searchParams.get('signature'), null); assert.equal(url.searchParams.get('token'), null);
        const expected = crypto.createHash('md5').update('1005OIlwieks28dk2k092lksi2UIkp204891700000000fake-mid').digest('hex');
        assert.equal(url.searchParams.get('key'), expected);
        assert.equal(options.headers['x-router'], 'm.comment.service.kugou.com');
        assert.equal(options.method, 'POST'); assert.equal(options.timeoutMs, 9000); assert.equal(data, undefined);
        return { status: 1, error_code: 0, data: { id: '9223372036854775807' } };
      } });
    assert.equal(calls, 1); assert.equal(result.replyId, '9223372036854775807');
  }
});

test('missing login, session changes, malformed provider success and timeouts never trigger retries or false success', async () => {
  let calls = 0;
  const dependencies = { isCurrent: () => true, qqRequest: async () => { calls++; throw new Error('fake-key secret-cookie timeout'); } };
  const loggedOut = await handleCommentReply(body('qq'), session(''), dependencies);
  assert.equal(loggedOut.status, 401); assert.equal(calls, 0);
  const stale = await handleCommentReply(body('qq'), session('uin=45; qm_keyst=fake-key'), { ...dependencies, isCurrent: () => false });
  assert.equal(stale.payload.outcome, 'rejected'); assert.equal(calls, 0);
  const timeout = await handleCommentReply(body('qq'), session('uin=45; qm_keyst=fake-key'), dependencies);
  assert.equal(timeout.payload.outcome, 'unknown'); assert.equal(calls, 1);
  assert(!JSON.stringify(timeout).includes('fake-key')); assert(!JSON.stringify(timeout).includes('secret-cookie'));
  const invalid = await handleCommentReply(body('qq'), session('uin=45; qm_keyst=fake-key'), {
    isCurrent: () => true, qqRequest: async () => ({ req: { code: 0, data: {} } }),
  });
  assert.equal(invalid.payload.outcome, 'unknown');
  let currentChecks = 0;
  const changed = await handleCommentReply(body('qq'), session('uin=45; qm_keyst=fake-key'), {
    isCurrent: () => ++currentChecks < 3, qqRequest: async () => ({ req: { code: 0, data: { SubCode: 0, AddedCmId: '777' } } }),
  });
  assert.equal(changed.payload.outcome, 'unknown'); assert.equal(changed.payload.error, 'ACCOUNT_SESSION_CHANGED');
});

test('provider business rejections are sanitized and the draft can safely be edited', async () => {
  const qq = await handleCommentReply(body('qq'), session('uin=45; qm_keyst=fake-key'), {
    isCurrent: () => true, qqRequest: async () => ({ req: { code: 0, data: { SubCode: 123, Msg: 'fake-key', VerifyUrl: 'https://evil.test/?token=fake' } } }),
  });
  assert.equal(qq.payload.outcome, 'rejected'); assert.equal(qq.payload.code, 123);
  assert(!JSON.stringify(qq).includes('fake-key')); assert(!JSON.stringify(qq).includes('evil.test'));
  const kg = await handleCommentReply(body('kugou'), session('fake-cookie'), {
    isCurrent: () => true, extractKugouAuth: () => auth, requestJson: async () => ({ status: 0, error_code: 20028, error: 'fake-token' }),
  });
  assert.equal(kg.payload.outcome, 'rejected'); assert.equal(kg.payload.error, 'COMMENT_REPLY_VERIFICATION_REQUIRED');
});

test('QQ MID resolution stays read-only, uses complete MID and checks session again before writing', async () => {
  let resolveCalls = 0, writes = 0;
  const deps = { isCurrent: () => true, resolveQQSongId: async mid => { resolveCalls++; assert.equal(mid, '0039MnYb0qxYhV'); return '456'; },
    qqRequest: async payload => { writes++; assert.equal(payload.req.param.BizId, '456'); return { req: { code: 0, data: { SubCode: 0, AddedCmId: '777' } } }; } };
  const result = await handleCommentReply(body('qq', { id: '0039MnYb0qxYhV' }), session('uin=45; qm_keyst=fake-key'), deps);
  assert.equal(result.payload.created, true); assert.equal(resolveCalls, 1); assert.equal(writes, 1);
  const failed = await handleCommentReply(body('qq', { id: '0039MnYb0qxYhV' }), session('uin=45; qm_keyst=fake-key'), {
    ...deps, resolveQQSongId: async () => { throw new Error('read timeout fake-key'); },
  });
  assert.equal(failed.payload.outcome, 'rejected'); assert.equal(writes, 1);
});

test('unsafe numeric acknowledgement IDs cannot be mistaken for the precise submitted reply', async () => {
  const result = await handleCommentReply(body('qq'), session('uin=45; qm_keyst=fake-key'), {
    isCurrent: () => true, qqRequest: async () => ({ req: { code: 0, data: { SubCode: 0, AddedCmId: 9223372036854775807 } } }),
  });
  assert.equal(result.payload.outcome, 'unknown'); assert.equal(result.payload.created, false);
});

test('existing QQ native transport sends one request with captured auth and cannot retry a failed write', async () => {
  let calls = 0;
  const ctx = vm.createContext({ QQ_HEADERS: {}, QQ_MUSICU_URL: 'https://u.y.qq.com/cgi-bin/musicu.fcg', Buffer,
    qqCookie: 'replacement-cookie', parseCookieString: cookie => ({ cookie }),
    nativeCommForCookie: value => value.cookie === 'frozen-cookie' ? { ct: 11, authst: 'fake-native-key', qq: '45' } : null,
    qqNativeUserAgent: () => 'fake-app-user-agent', parseJSONText: JSON.parse,
    requestText: async (_url, options, text) => { calls++;
      assert.equal(options.headers.Cookie, 'frozen-cookie'); assert.equal(options.timeoutMs, 9000);
      assert.equal(JSON.parse(text).comm.authst, 'fake-native-key'); throw new Error('mock timeout');
    },
  });
  loadFunctions(ctx, 'server.js', ['qqMusicRequest']);
  await assert.rejects(ctx.qqMusicRequest({ comm: { ct: 24 }, req: {} }, { cookie: 'frozen-cookie', timeoutMs: 9000 }), /mock timeout/);
  assert.equal(calls, 1);
});

test('reply HTTP route uses bounded JSON, captures accounts before body reads and sanitizes body failure', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf("  if (pn === '/api/song/comment/reply') {");
  const end = source.indexOf("  if (pn === '/api/song/comment/replies') {", start);
  const route = source.slice(start, end);
  assert(source.indexOf('if (!isTrustedLocalApiRequest(req))') < start);
  let captured = 0, entered = 0;
  const sent = [];
  const context = vm.createContext({ pn: '/api/song/comment/reply', req: { method: 'POST', headers: { 'content-type': 'application/json' } }, res: {},
    captureProviderAccountSession: provider => { captured++; return { provider, cookie: 'fake-' + provider, generation: 4 }; },
    readBoundedRequestBody: async (_req, options) => {
      assert.equal(captured, 3); assert.equal(options.maxBytes, 8192); assert.equal(options.timeoutMs, 10000); return body('qq');
    },
    handleCommentReply: async (input, account, deps) => {
      entered++; assert.equal(input.provider, 'qq'); assert.equal(account.cookie, 'fake-qq'); assert(deps.isCurrent(account));
      return { status: 200, payload: { created: true } };
    },
    checkProviderAccountSession: () => true, extractKugouAuth: () => auth, requestJson: () => {}, qqMusicRequest: () => {},
    sendJSON: (_res, payload, status) => sent.push({ payload, status }), replyFailure,
  });
  await vm.runInContext('(async function () {' + route + '})()', context);
  assert.equal(entered, 1); assert.equal(sent.at(-1).status, 200);
  context.req.method = 'GET'; await vm.runInContext('(async function () {' + route + '})()', context);
  assert.equal(entered, 1); assert.equal(sent.at(-1).status, 405);
  context.req.method = 'POST'; context.req.headers['content-type'] = 'text/plain';
  await vm.runInContext('(async function () {' + route + '})()', context);
  assert.equal(entered, 1); assert.equal(sent.at(-1).status, 415);
  context.req.headers['content-type'] = 'application/json';
  context.readBoundedRequestBody = async () => { throw new Error('fake-private-cookie'); };
  await vm.runInContext('(async function () {' + route + '})()', context);
  assert.equal(entered, 1); assert.equal(sent.at(-1).payload.outcome, 'rejected'); assert(!JSON.stringify(sent).includes('fake-private-cookie'));
  for (const origin of ['https://evil.test', 'null', 'http://127.0.0.1:9999']) {
    assert.equal(isTrustedLocalApiRequest({ headers: { host: '127.0.0.1:3000', origin },
      socket: { remoteAddress: '127.0.0.1', localPort: 3000 } }), false);
  }
});
