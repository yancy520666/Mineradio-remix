'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadFunctions } = require('./helpers/classic-functions');

const comment = id => ({ id, content: 'Comment ' + id, user: { nickname: 'Listener' } });
const batch = start => Array.from({ length: 30 }, (_, i) => comment(start + i));
function renderer() {
  const makeList = () => ({ innerHTML: '', insertAdjacentHTML(_where, html) { this.innerHTML += html; } });
  const hotList = makeList(), normalList = makeList(), empty = {};
  const section = () => ({ heading: {}, querySelector() { return this.heading; }, setAttribute() {} });
  const hotSection = section(), normalSection = section();
  const list = { get innerHTML() { return hotList.innerHTML + normalList.innerHTML; },
    querySelector() { return empty; } };
  const button = {}, label = {}, requests = [];
  const selectors = { '.detail-scroll': list, '.detail-comments-hot': hotSection,
    '.detail-comments-more': normalSection, '.detail-comments-hot-list': hotList,
    '.detail-comments-more-list': normalList, '.detail-comments-footer button': button,
    '.detail-comments-count': label };
  const target = { set innerHTML(value) { hotList.innerHTML = ''; normalList.innerHTML = ''; },
    dataset: {}, addEventListener() {}, querySelector: selector => selectors[selector] };
  const ctx = vm.createContext({
    AbortController, document: { getElementById: () => target }, trackDetailSeq: 1, detailCommentsState: null, detailCommentSort: 'latest',
    songProviderKey: song => song.provider, escHtml: String, bindTrackDetailScrollers() {},
    apiJson: (url, opts) => new Promise((resolve, reject) => requests.push({ url, opts, resolve, reject })),
    closeGsapModal(_modal, done) { done(); }, detailCommentSong: null, detailCommentSubmitBusy: false,
  });
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js',
    ['detailCommentsConfig', 'renderDetailComments', 'loadDetailComments', 'loadMoreDetailComments', 'updateDetailCommentsFooter', 'closeTrackDetailModal',
      'commentCountLabel', 'commentVipHtml', 'commentHeartSvg', 'commentLikeHtml', 'commentHeadHtml', 'neteaseEmojiId', 'commentContentHtml', 'bindDetailCommentLikes',
      'detailCommentsSortable', 'cancelDetailCommentReads', 'detailCommentReadStore', 'invalidateDetailCommentReadCache', 'readDetailComments']);
  return { ctx, requests, list, button, label, hotList, normalList, hotSection, normalSection, empty };
}

test('comment pages retain the first normal page, deduplicate, retry and ignore stale responses', async () => {
  for (const provider of ['netease', 'qq', 'kugou']) {
    const byOffset = provider === 'kugou';
    const { ctx, requests, list, button } = renderer();
    const initial = ctx.loadDetailComments({ id: 'song-a', mixSongId: '123', provider }, 1);
    await ctx.loadMoreDetailComments();
    assert.equal(requests.length, 1, 'duplicate clicks cannot request another page');
    assert.match(requests[0].url, byOffset ? /limit=30&offset=0$/ : /limit=30&cursor=$/);
    requests[0].resolve({ comments: [{ ...comment(500), isHot: true }, ...batch(0), comment(500)], hasMore: true, nextOffset: 30, nextCursor: 'c1' });
    await initial;
    assert.equal(ctx.detailCommentsState.count, 31);
    assert.match(list.innerHTML, /Comment 0</);
    assert.match(list.innerHTML, /Comment 29</);

    const failed = ctx.loadMoreDetailComments();
    requests[1].reject(new Error('offline'));
    await failed;
    if (byOffset) assert.equal(ctx.detailCommentsState.offset, 30);
    else assert.equal(ctx.detailCommentsState.cursor, 'c1');
    assert.equal(ctx.detailCommentsState.count, 31);
    assert.equal(button.disabled, false);
    assert.match(button.textContent, /重试/);
    const retry = ctx.loadMoreDetailComments();
    assert.equal(requests[2].url, requests[1].url);
    requests[2].resolve({ comments: [comment(29), ...batch(30)], hasMore: false, nextOffset: 60, nextCursor: '' });
    await retry;
    assert.equal(ctx.detailCommentsState.count, 61);
    assert.equal(button.hidden, true);

    const old = ctx.loadDetailComments({ id: 'song-a', mixSongId: '123', provider }, 1);
    ctx.closeTrackDetailModal();
    assert.equal(ctx.detailCommentsState, null);
    const next = ctx.loadDetailComments({ id: 'song-b', mixSongId: '124', provider }, ++ctx.trackDetailSeq);
    requests[3].resolve({ comments: [comment('stale')], hasMore: false, nextOffset: 30 });
    await old;
    assert.equal(ctx.detailCommentsState.loading, true);
    assert.equal(ctx.detailCommentsState.count, 0);
    requests[4].resolve({ comments: [], hasMore: false, nextOffset: 30 });
    await next;
    assert.equal(ctx.detailCommentsState.count, 0);
    assert.equal(button.hidden, true);
  }
});

test('cursor platforms advance encoded cursors and stop when the server repeats a cursor', async () => {
  for (const provider of ['netease', 'qq', 'qishui']) {
  const { ctx, requests, button } = renderer();
  const first = ctx.loadDetailComments({ id: '123', qqId: '123', provider }, 1);
  requests[0].resolve({ comments: batch(0), nextCursor: 'next/+?', hasMore: true });
  await first;
  const next = ctx.loadMoreDetailComments();
  assert.match(requests[1].url, /cursor=next%2F%2B%3F$/);
  requests[1].resolve({ comments: [comment(30)], nextCursor: 'next/+?', hasMore: true });
  await next;
  assert.equal(ctx.detailCommentsState.count, 31);
  assert.equal(button.hidden, true);
  await ctx.loadMoreDetailComments();
  assert.equal(requests.length, 2);
  }
});

test('a completed comment submission cannot reset another song\'s loaded comments or draft', async () => {
  const { ctx, requests } = renderer();
  const input = { value: 'Comment for song A' }, button = {}, notices = [];
  ctx.document.getElementById = id => id === 'detail-comment-input' ? input : button;
  ctx.ensureLoggedInForAction = () => true;
  ctx.showToast = message => notices.push(message);
  ctx.detailCommentSong = { id: 'a', provider: 'netease' };
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js', ['submitDetailComment']);
  const submit = ctx.submitDetailComment();
  ctx.trackDetailSeq++;
  ctx.detailCommentSong = { id: 'b', provider: 'netease' };
  ctx.detailCommentSubmitBusy = true;
  input.value = 'Draft for song B';
  requests[0].resolve({ created: true });
  await submit;
  assert.equal(input.value, 'Draft for song B');
  assert.equal(ctx.detailCommentSubmitBusy, true);
  assert.equal(requests.length, 1, 'old submission must not trigger a new-song refresh');
  assert.equal(notices.length, 0);
});

function listBackend(extra) {
  const ctx = vm.createContext({ HOT_PAGE_SIZE: 10, ...extra });
  loadFunctions(ctx, 'comment-list-api.js', ['readCursor', 'handleNeteaseCommentPage', 'qqVip', 'mapQQListComment', 'handleQQCommentPage']);
  return ctx;
}
const neteaseRaw = id => ({ commentId: id, content: 'Comment ' + id, likedCount: 5, replyCount: 3 });

test('Netease lists hot comments once, then pages newest comments by cursor with reply counts', async () => {
  const calls = [];
  const ctx = listBackend({
    mapNeteaseComment: c => ({ id: String(c.commentId), content: c.content, replyCount: c.replyCount, likedCount: c.likedCount }),
    comment_new: async options => {
      calls.push(options);
      const hot = options.sortType === 2;
      return { body: { code: 200, data: { comments: hot ? [neteaseRaw('h')] : [neteaseRaw('n' + options.pageNo)],
        hasMore: true, cursor: hot ? 'normalHot#1' : String(1000 - options.pageNo), totalCount: 99 } } };
    },
  });
  const first = await ctx.handleNeteaseCommentPage('186016', '', 30, '');
  assert.deepEqual(calls.map(c => [c.sortType, c.pageNo]), [[2, 1], [3, 1]]);
  assert.deepEqual(JSON.parse(JSON.stringify(first.comments.map(c => [c.id, c.isHot, c.replyCount]))), [['h', true, 3], ['n1', false, 3]]);
  assert.equal(first.nextCursor, JSON.stringify({ p: 2, c: '999' }));
  const next = await ctx.handleNeteaseCommentPage('186016', '', 30, first.nextCursor);
  assert.deepEqual(calls.slice(2).map(c => [c.sortType, c.pageNo, c.cursor]), [[3, 2, '999']]);
  assert(next.comments.every(c => c.isHot === false));
  for (const bad of ['{"p":2,"c":"9;1"}', 'nope', '{"p":0,"c":"1"}']) {
    await assert.rejects(ctx.handleNeteaseCommentPage('186016', '', 30, bad), /Invalid comment cursor/);
  }
});

test('QQ lists hot and newest comments with reply counts, badges and a sequence cursor', async () => {
  const payloads = [];
  const raw = (id, seq) => ({ CmId: id, Content: 'Comment ' + id, PraiseNum: 7, IsPraised: 1, ReplyCnt: 165, PubTime: 10, SeqNo: seq,
    VipIcon: 'http://y.qq.com/mediastyle/lv-icon/v10/vip/1x/svip8.png', Nick: 'L', EncryptUin: 'u' });
  const ctx = listBackend({ safeVipIcon: value => String(value).replace('http:', 'https:') });
  const request = async payload => {
    payloads.push(payload);
    const page = payload.latest.param.PageNum;
    const result = { latest: { code: 0, data: { CommentList: { Comments: [raw('n' + page, '50' + page)], HasMore: 1, Total: 9 } } } };
    if (payload.hot) result.hot = { code: 0, data: { CommentList: { Comments: [raw('h', '1')], HasMore: 1 } } };
    return result;
  };
  const first = await ctx.handleQQCommentPage('97773', 30, '', request);
  assert.equal(payloads[0].latest.param.PageSize, 25, 'the service rejects pages above 25');
  assert.deepEqual(JSON.parse(JSON.stringify(first.comments.map(c => [c.id, c.isHot, c.replyCount, c.liked]))),
    [['h', true, 165, true], ['n0', false, 165, true]]);
  assert.match(first.comments[0].vip.icon, /^https:/);
  const next = await ctx.handleQQCommentPage('97773', 30, first.nextCursor, request);
  assert.equal(payloads[1].hot, undefined);
  assert.equal(payloads[1].latest.param.LastCommentSeqNo, '500');
  assert.equal(payloads[1].latest.param.PageNum, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(next.comments.map(c => c.id))), ['n1']);
  await assert.rejects(ctx.handleQQCommentPage('97773', 30, '', async () => ({ latest: { code: 10000 } })), /QQ_COMMENTS_UNAVAILABLE/);
});

test('QQ supports a saved MID and reports upstream failures instead of showing no comments', async () => {
  const { ctx } = renderer();
  assert.match(ctx.detailCommentsConfig({ provider: 'qq', qqMid: 'saved-mid' }).readUrl, /mid=saved-mid/);
  assert.match(ctx.detailCommentsConfig({ provider: 'qq', id: 123 }).readUrl, /id=123/);
  const backend = vm.createContext({ qqMusicRequest: async () => ({}),
    handleQQCommentPage: async () => { throw new Error('QQ_COMMENTS_UNAVAILABLE'); } });
  loadFunctions(backend, 'server.js', ['handleQQSongComments']);
  await assert.rejects(backend.handleQQSongComments('123', '', 30, ''), /QQ_COMMENTS_UNAVAILABLE/);
  assert.match(ctx.detailCommentsConfig({ provider: 'kugou', mixSongId: 'encrypted', albumAudioId: '123' }).readUrl, /id=123/);
  assert.equal(ctx.detailCommentsConfig({ provider: 'kugou', id: 'only-hash' }), null);
});

test('hot comments have their own section and later pages append only to more comments', async () => {
  const { ctx, requests, hotList, normalList, hotSection, normalSection } = renderer();
  const first = ctx.loadDetailComments({ id: 'song', provider: 'netease' }, 1);
  requests[0].resolve({ comments: [{ ...comment('hot'), isHot: true }, comment('hot'), comment('normal')],
    hasMore: true, nextCursor: 'c1' });
  await first;
  assert.equal(hotSection.hidden, false);
  assert.equal(normalSection.hidden, false);
  assert.equal(hotSection.heading.textContent, '热门评论 · 1');
  assert.equal(normalSection.heading.textContent, '更多评论 · 1');
  assert.match(hotList.innerHTML, /Comment hot</);
  assert.doesNotMatch(normalList.innerHTML, /Comment hot</);
  const savedHot = hotList.innerHTML;
  const next = ctx.loadMoreDetailComments();
  requests[1].resolve({ comments: [comment('later')], hasMore: false, nextCursor: '' });
  await next;
  assert.equal(hotList.innerHTML, savedHot);
  assert.match(normalList.innerHTML, /Comment later</);
  assert.equal(normalSection.heading.textContent, '更多评论 · 2');
});

test('Qishui respects explicit end flags and stops empty or non-advancing pages', () => {
  const ctx = vm.createContext({});
  loadFunctions(ctx, 'qishui-api.js', ['qishuiCommentHasMore']);
  for (const value of [false, 0, '0', 'false']) {
    assert.equal(ctx.qishuiCommentHasMore({ has_more: value }, {}, 'a', 'b', 30), false);
  }
  assert.equal(ctx.qishuiCommentHasMore({ hasMore: false }, { has_more: true }, 'a', 'b', 30), false);
  assert.equal(ctx.qishuiCommentHasMore({}, { has_more: false }, 'a', 'b', 30), false);
  assert.equal(ctx.qishuiCommentHasMore({}, {}, 'a', 'b', 30), true);
  assert.equal(ctx.qishuiCommentHasMore({ has_more: true }, {}, 'a', 'b', 0), false);
  assert.equal(ctx.qishuiCommentHasMore({ has_more: true }, {}, 'a', 'a', 30), false);
  assert.equal(ctx.qishuiCommentHasMore({ has_more: true }, {}, 'a', '', 30), false);
});

test('Netease HTTP route forwards the cursor and rejects oversized ones', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf("  if (pn === '/api/song/comments') {");
  const end = source.indexOf("  if (pn === '/api/song/comments/like')", start);
  for (const [cursor, expectCall, sort] of [['{"p":2,"c":"999"}', true, ''], ['{"p":2,"c":"normalHot#30"}', true, 'hot'], ['x'.repeat(300), false, '']]) {
    const calls = [], responses = [];
    const ctx = vm.createContext({
      pn: '/api/song/comments', req: { method: 'GET' }, res: {}, userCookie: 'c', console,
      url: new URL('http://localhost/api/song/comments?id=song&limit=30&cursor=' + encodeURIComponent(cursor) + (sort ? '&sort=' + sort : '')),
      sendJSON: (_, payload, status) => responses.push({ payload, status }),
      handleNeteaseCommentPage: async (...args) => { calls.push(args); return { comments: [] }; },
    });
    await vm.runInContext('(async () => {' + source.slice(start, end) + '})()', ctx);
    assert.equal(calls.length, expectCall ? 1 : 0);
    if (expectCall) assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['song', 'c', 30, cursor, sort || 'latest']);
    else assert.equal(responses[0].status, 400);
  }
});

test('the 最新 / 热门 switch reloads by popularity as one section and drops the previous order\'s responses', async () => {
  const { ctx, requests, hotSection, normalSection, normalList } = renderer();
  const buttons = ['latest', 'hot'].map(sort => ({ sort, classList: { toggle(name, on) { this[name] = on; } },
    getAttribute: () => sort, setAttribute(name, value) { this[name] = value; } }));
  ctx.document.querySelectorAll = () => buttons;
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js', ['setDetailCommentSort', 'renderDetailCommentSort']);
  const song = { id: '186016', provider: 'netease' };
  ctx.detailCommentSong = song;
  const latest = ctx.loadDetailComments(song, 1);
  assert.doesNotMatch(requests[0].url, /sort=/, 'newest is the default order');
  const hot = ctx.setDetailCommentSort('hot');
  assert.match(requests[1].url, /cursor=&sort=hot$/);
  requests[0].resolve({ comments: [{ ...comment('old-hot'), isHot: true }, comment('old')], hasMore: true, nextCursor: 'old' });
  requests[1].resolve({ comments: [comment('popular')], hasMore: true, nextCursor: '{"p":2,"c":"normalHot#30"}' });
  await Promise.all([latest, hot]);
  assert.match(normalList.innerHTML, /Comment popular</);
  assert.doesNotMatch(normalList.innerHTML, /Comment old</, 'responses for the previous order are discarded');
  assert.equal(hotSection.hidden, true);
  assert.equal(normalSection.heading.textContent, '热门评论 · 1');
  assert.equal(buttons[1].classList.active, true);
  assert.equal(buttons[1]['aria-pressed'], 'true');
  const next = ctx.loadMoreDetailComments();
  assert.match(requests[2].url, /sort=hot$/, 'later pages keep the order');
  requests[2].resolve({ comments: [], hasMore: false, nextCursor: '' });
  await next;
  // Qishui has a single order: no switch, and requests never ask for one.
  assert.equal(ctx.renderDetailCommentSort({ provider: 'qishui' }), '');
  assert.match(ctx.renderDetailCommentSort({ provider: 'kugou' }), /data-comment-sort="hot"/);
  const qishui = ctx.loadDetailComments({ id: 'q', provider: 'qishui' }, 1);
  assert.doesNotMatch(requests[3].url, /sort=/);
  requests[3].resolve({ comments: [], hasMore: false });
  await qishui;
});

test('a comment without replies keeps its heart on the text row; one with replies gets the reply row', () => {
  const { ctx } = renderer();
  ctx.detailCommentsState = { seq: 1, config: { provider: 'qq' }, threads: Object.create(null), threadIndex: 0 };
  ctx.detailReplyControlsHtml = (c, like) => c.replyCount > 0 ? '<div class="comment-replies"><div class="comment-actions">toggle' + like + '</div></div>' : '';
  const html = ctx.renderDetailComments([{ ...comment('quiet'), replyCount: 0 }, { ...comment('busy'), replyCount: 4 }]);
  const [quiet, busy] = html.split('<div class="comment-item').slice(1);
  assert.match(quiet, /^ is-compact"/);
  assert.match(busy, /^">/);
  assert.match(busy, /toggle/);
});

test('Netease emoticon codes become their CDN images; 多多 stickers become chips; other text stays', () => {
  const { ctx } = renderer();
  ctx.escHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  ctx.detailCommentsState = { config: { provider: 'netease' } };
  const html = ctx.commentContentHtml('朋友[爱心][强] [多多调皮] [Live] <img src=x onerror=alert(1)>[色]');
  const cdn = 'https://s1.music.126.net/style/web2/emt/emoji_';
  assert(html.startsWith('朋友<img class="comment-emoji" src="' + cdn + '33.png" alt="[爱心]"'));
  assert(html.includes(cdn + '13.png'));
  assert(html.includes('<span class="comment-emoji-text">多多调皮</span>'));
  assert(html.includes(' [Live] '), 'ordinary bracketed text is left alone');
  assert(html.includes('&lt;img src=x onerror=alert(1)&gt;<img class="comment-emoji" src="' + cdn + '95.png"'));
  assert(!html.includes('<img src=x'));
  ctx.detailCommentsState = { config: { provider: 'qq' } };
  assert.equal(ctx.commentContentHtml('朋友[爱心]'), '朋友[爱心]', 'other platforms keep their own text');
});

test('sort reload and close cancel only GET owners, while POST remains independent', async () => {
  const f = renderer();
  const song = { id: 'song', provider: 'netease' };
  const first = f.ctx.loadDetailComments(song, 1);
  const second = f.ctx.loadDetailComments(song, 1);
  assert.equal(f.requests[0].opts.timeoutMs, 15000);
  assert.equal(f.requests[0].opts.signal.aborted, true);
  assert.equal(f.requests[1].opts.signal.aborted, false);
  await first;
  f.ctx.closeTrackDetailModal(); await second;
  assert.equal(f.requests[1].opts.signal.aborted, true);
  const input = { value: 'posted' };
  f.ctx.document.getElementById = id => id === 'detail-comment-input' ? input : {};
  f.ctx.detailCommentSong = song; f.ctx.ensureLoggedInForAction = () => true; f.ctx.showToast = () => {};
  loadFunctions(f.ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js', ['submitDetailComment']);
  const post = f.ctx.submitDetailComment();
  f.ctx.closeTrackDetailModal();
  assert.equal(f.requests[2].opts.method, 'POST');
  assert.equal(f.requests[2].opts.signal, undefined);
  f.requests[2].resolve({ created: true }); await post;
  assert.equal(f.requests.length, 3);
});

test('first-page GET cache merges subscribers, isolates authorization epochs/sorts and skips failed results', async () => {
  const f = renderer(); let epoch = 1;
  f.ctx.providerAuthEpoch = () => epoch;
  const owner = () => ({ config: { provider: 'netease' } });
  const a = owner(), b = owner();
  const first = f.ctx.readDetailComments(a, '/comments?sort=latest', true);
  const second = f.ctx.readDetailComments(b, '/comments?sort=latest', true);
  assert.equal(f.requests.length, 1);
  f.ctx.cancelDetailCommentReads(a); await assert.rejects(first, { name: 'AbortError' });
  assert.equal(f.requests[0].opts.signal.aborted, false, 'another subscriber still needs the GET');
  f.requests[0].resolve({ comments: [comment('a')], hasMore: true, nextCursor: 'cursor' });
  await second;
  const warm = await f.ctx.readDetailComments(owner(), '/comments?sort=latest', true);
  assert.equal(warm.nextCursor, 'cursor'); assert.equal(f.requests.length, 1);
  const hot = f.ctx.readDetailComments(owner(), '/comments?sort=hot', true);
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve({ error: 'offline', comments: [] }); await hot;
  const retry = f.ctx.readDetailComments(owner(), '/comments?sort=hot', true);
  assert.equal(f.requests.length, 3); f.requests[2].resolve({ comments: [] }); await retry;
  epoch++;
  const otherAccount = f.ctx.readDetailComments(owner(), '/comments?sort=latest', true);
  assert.equal(f.requests.length, 4);
  f.requests[3].resolve({ comments: [comment('account-b')] }); await otherAccount;
  f.ctx.invalidateDetailCommentReadCache('netease');
  const invalidated = f.ctx.readDetailComments(owner(), '/comments?sort=latest', true);
  assert.equal(f.requests.length, 5); f.requests[4].resolve({ comments: [] }); await invalidated;
});

test('isolated cold/hot comment first-page timings avoid repeat upstream work', async t => {
  const f = renderer(), { performance } = require('node:perf_hooks'); let calls = 0;
  f.ctx.providerAuthEpoch = () => 1;
  f.ctx.apiJson = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 35)); return { comments: batch(0), nextCursor: 'next', hasMore: true }; };
  const owner = () => ({ config: { provider: 'netease' } });
  const start = performance.now(); await f.ctx.readDetailComments(owner(), '/timed', true); const cold = performance.now() - start;
  const warmStart = performance.now(); await f.ctx.readDetailComments(owner(), '/timed', true); const hot = performance.now() - warmStart;
  assert.equal(calls, 1);
  t.diagnostic(`local fake upstream delay 35ms: comment cold=${cold.toFixed(2)}ms, hot=${hot.toFixed(2)}ms; not a platform/client benchmark`);
});

test('expired cache and an auth change between cache lookup and render cannot reuse old-account data', async () => {
  const f = renderer(); let epoch = 1, clock = 0;
  f.ctx.providerAuthEpoch = () => epoch; f.ctx.Date = { now: () => clock };
  const owner = () => ({ config: { provider: 'netease' } });
  const first = f.ctx.readDetailComments(owner(), '/auth', true);
  f.requests[0].resolve({ comments: [comment('old-account')] }); await first;
  const cachedRace = f.ctx.readDetailComments(owner(), '/auth', true); epoch++;
  await assert.rejects(cachedRace, /AUTH_CHANGED/);
  const next = f.ctx.readDetailComments(owner(), '/auth', true);
  f.requests[1].resolve({ comments: [comment('new-account')] }); await next;
  clock = 15001;
  const expired = f.ctx.readDetailComments(owner(), '/auth', true);
  assert.equal(f.requests.length, 3); f.requests[2].resolve({ comments: [] }); await expired;
  const old = f.ctx.readDetailComments(owner(), '/late', true); epoch++;
  f.requests[3].resolve({ comments: [comment('late-old')] }); await assert.rejects(old, /AUTH_CHANGED/);
  const fresh = f.ctx.readDetailComments(owner(), '/late', true);
  assert.equal(f.requests.length, 5); f.requests[4].resolve({ comments: [comment('fresh')] }); await fresh;
});

test('late cancelled comment GET cannot cache stale data or delete a replacement task', async () => {
  const f = renderer(); f.ctx.providerAuthEpoch = () => 1;
  const a = { config: { provider: 'netease' } }, b = { config: { provider: 'netease' } };
  const old = f.ctx.readDetailComments(a, '/replaced', true); f.ctx.cancelDetailCommentReads(a);
  await assert.rejects(old, /CANCELLED/);
  const replacement = f.ctx.readDetailComments(b, '/replaced', true);
  f.requests[0].resolve({ comments: [comment('old')] }); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.ctx.detailCommentReadStore().pending.size, 1);
  f.requests[1].resolve({ comments: [comment('new')] }); await replacement;
  const cached = await f.ctx.readDetailComments({ config: { provider: 'netease' } }, '/replaced', true);
  assert.equal(cached.comments[0].id, 'new'); assert.equal(f.requests.length, 2);
});

// Exercise the installed provider's real request builder, with only its transport
// replaced. Unlike comment_music's offset/before API, comment_new uses a time
// cursor from page two onward, including pages on either side of 5,000 comments.
function deepNeteaseBackend(total) {
  const provider = require('NeteaseCloudMusicApi/module/comment_new');
  const newest = Array.from({ length: total }, (_, i) => ({ ...neteaseRaw(String(i)), time: 1800000000000 - i }));
  const calls = [];
  const ctx = listBackend({
    mapNeteaseComment: raw => ({ id: String(raw.commentId), content: raw.content, time: raw.time, replyCount: raw.replyCount }),
    comment_new: options => provider({ ...options }, async (route, data) => {
      assert.equal(route, '/api/v2/resource/comments');
      assert.equal(data.threadId, 'R_SO_4_186016');
      assert.equal(data.offset, undefined);
      assert.equal(data.beforeTime, undefined);
      calls.push({ ...data });
      if (data.sortType === 2) {
        // A hot comment can overlap the newest list. Its old time/cursor must
        // never be used for traversing the separate newest list.
        return { body: { code: 200, data: { comments: [newest[0], { ...neteaseRaw('hot-only'), time: 100 }],
          cursor: 'normalHot#10', hasMore: true, totalCount: total } } };
      }
      assert.equal(data.sortType, 3);
      const start = data.cursor === '0' ? 0 : newest.findIndex(raw => raw.time < Number(data.cursor));
      assert(start >= 0, 'every later page must use the preceding newest time');
      assert.equal(start, (data.pageNo - 1) * data.pageSize);
      const comments = newest.slice(start, start + data.pageSize);
      return { body: { code: 200, data: { comments, cursor: String(comments[comments.length - 1].time),
        hasMore: start + comments.length < total, totalCount: total } } };
    }),
  });
  return { ctx, calls, newest };
}

test('Netease time pagination traverses fewer than, exactly and more than 5,000 newest comments', async () => {
  for (const total of [4999, 5000, 5001]) {
    const { ctx, calls, newest } = deepNeteaseBackend(total);
    const ids = [];
    let cursor = '', page = 0;
    do {
      const result = await ctx.handleNeteaseCommentPage('186016', '', 25, cursor);
      page++;
      const normal = result.comments.filter(raw => !raw.isHot);
      ids.push(...normal.map(raw => raw.id));
      assert.equal(result.total, total);
      assert.equal(result.comments.filter(raw => raw.isHot).length, page === 1 ? 2 : 0);
      assert(normal.every(raw => raw.replyCount === 3));
      if (result.hasMore) {
        const next = JSON.parse(result.nextCursor);
        assert.equal(next.p, page + 1);
        assert.equal(next.c, String(normal[normal.length - 1].time));
      } else {
        assert.equal(result.nextCursor, '');
      }
      cursor = result.nextCursor;
    } while (cursor);
    assert.deepEqual(ids, newest.map(raw => String(raw.commentId)), 'newest order and every comment survive the boundary');
    assert.equal(page, Math.ceil(total / 25));
    assert.equal(calls.filter(call => call.sortType === 2).length, 1);
    const latest = calls.filter(call => call.sortType === 3);
    assert.equal(latest[199].cursor, String(newest[4974].time), 'the page ending at 5,000 is time-based');
    if (total > 5000) assert.equal(latest[200].cursor, String(newest[4999].time), 'the first page beyond 5,000 keeps the same time protocol');
  }
});

test('the renderer forwards deep newest cursors, keeps hot comments separate and deduplicates repeated IDs', async () => {
  const backend = deepNeteaseBackend(5040);
  const f = renderer();
  loadFunctions(f.ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js', ['commentTimeLabel']);
  f.ctx.apiJson = async (url, opts) => {
    assert.equal(opts.timeoutMs, 15000);
    const parsed = new URL(url, 'http://localhost');
    assert.equal(parsed.searchParams.has('offset'), false);
    assert.equal(parsed.searchParams.has('before'), false);
    const cursor = parsed.searchParams.get('cursor');
    const result = await backend.ctx.handleNeteaseCommentPage(parsed.searchParams.get('id'), '', Number(parsed.searchParams.get('limit')), cursor);
    // A live list can repeat an already seen item, even after the 5,000 boundary.
    if (cursor && JSON.parse(cursor).p === 168) result.comments.unshift({ ...comment('4980'), time: 1800000000000 - 4980 });
    return result;
  };
  await f.ctx.loadDetailComments({ id: '186016', provider: 'netease' }, 1);
  const savedHot = f.hotList.innerHTML;
  while (f.ctx.detailCommentsState.hasMore) await f.ctx.loadMoreDetailComments();
  assert.equal(f.ctx.detailCommentsState.count, 5041);
  assert.equal(f.ctx.detailCommentsState.hotCount, 2);
  assert.equal(f.ctx.detailCommentsState.normalCount, 5039);
  assert.equal(f.hotList.innerHTML, savedHot);
  assert.equal(f.normalList.innerHTML.match(/Comment 4980</g).length, 1);
  assert(f.normalList.innerHTML.indexOf('Comment 4999<') < f.normalList.innerHTML.indexOf('Comment 5000<'));
  assert.match(f.normalList.innerHTML, /Comment 5039</);
  assert.equal(f.button.hidden, true);
  assert.match(f.label.textContent, /已到底/);
});

test('Netease newest cursors follow the service, independently of duplicate timestamps, filtered content and hot order', async () => {
  const calls = [];
  const ctx = listBackend({
    mapNeteaseComment: raw => ({ id: raw.commentId, content: raw.content, time: raw.time }),
    comment_new: async options => {
      calls.push(options);
      if (options.sortType === 2) return { body: { code: 200, data: { comments: [{ ...neteaseRaw('hot'), time: 1 }],
        cursor: 'normalHot#10', hasMore: true } } };
      return { body: { code: 200, data: { comments: [
        { ...neteaseRaw('a'), time: 1700000000500 }, { ...neteaseRaw('b'), time: 1700000000500 },
        { ...neteaseRaw('filtered'), time: 1700000000400, content: '' },
      ], cursor: '1700000000399', hasMore: true } } };
    },
  });
  const first = await ctx.handleNeteaseCommentPage('186016', '', 30, '');
  assert.deepEqual(Array.from(first.comments, raw => raw.id), ['hot', 'a', 'b']);
  assert.equal(JSON.parse(first.nextCursor).c, '1700000000399');
  const repeated = await ctx.handleNeteaseCommentPage('186016', '', 30, first.nextCursor);
  assert.equal(calls[2].sortType, 3);
  assert.equal(calls[2].cursor, '1700000000399');
  assert.equal(repeated.hasMore, false);
  assert.equal(repeated.nextCursor, '');
  await assert.rejects(ctx.handleNeteaseCommentPage('186016', '', 30, '{"p":168,"c":"normalHot#5010"}'), /Invalid comment cursor/);
  await assert.rejects(ctx.handleNeteaseCommentPage('186016', '', 30, '{"p":168,"c":"1700000000399"}', 'hot'), /Invalid comment cursor/);
});

test('a deep pending page cannot update a replacement song after close, including a queued success', async () => {
  const f = renderer();
  const initial = f.ctx.loadDetailComments({ id: '186016', provider: 'netease' }, 1);
  f.requests[0].resolve({ comments: batch(0), nextCursor: '{"p":168,"c":"1700000000000"}', hasMore: true });
  await initial;
  const oldState = f.ctx.detailCommentsState;
  const deep = f.ctx.loadMoreDetailComments();
  assert.match(f.requests[1].url, /cursor=%7B%22p%22%3A168%2C%22c%22%3A%221700000000000%22%7D$/);
  // The success is already queued when the old owner closes.
  f.requests[1].resolve({ comments: [comment('old-deep')], nextCursor: '{"p":169,"c":"1699999999000"}', hasMore: true });
  f.ctx.closeTrackDetailModal();
  const replacement = f.ctx.loadDetailComments({ id: 'new-song', provider: 'netease' }, f.ctx.trackDetailSeq);
  assert.equal(f.requests[1].opts.signal.aborted, true);
  await deep;
  assert.equal(oldState.count, 30);
  assert.equal(f.ctx.detailCommentsState.count, 0);
  f.requests[2].resolve({ comments: [comment('new-song')], nextCursor: '', hasMore: false });
  await replacement;
  assert.equal(f.ctx.detailCommentsState.count, 1);
  assert.doesNotMatch(f.list.innerHTML, /old-deep/);
  assert.match(f.list.innerHTML, /Comment new-song</);
});

test('deep hot-order pages retain popularity cursors in the installed provider request', async () => {
  const provider = require('NeteaseCloudMusicApi/module/comment_new');
  const calls = [];
  const ctx = listBackend({
    mapNeteaseComment: raw => ({ id: raw.commentId, content: raw.content, time: raw.time }),
    comment_new: options => provider({ ...options }, async (_route, data) => {
      calls.push({ ...data });
      return { body: { code: 200, data: { comments: [{ ...neteaseRaw('popular'), time: 123 }],
        cursor: 'normalHot#5040', hasMore: true } } };
    }),
  });
  const result = await ctx.handleNeteaseCommentPage('186016', '', 30, '{"p":168,"c":"normalHot#5010"}', 'hot');
  assert.equal(calls.length, 1, 'a later hot-order page must not prepend a separate hot list');
  assert.equal(calls[0].sortType, 2);
  assert.equal(calls[0].pageNo, 168);
  assert.equal(calls[0].cursor, 'normalHot#5010');
  assert.equal(result.comments[0].isHot, false);
  assert.equal(result.nextCursor, '{"p":169,"c":"normalHot#5040"}');
});

test('an auth epoch change cannot render a deep old-account page or poison the first-page cache', async () => {
  const f = renderer(); let epoch = 1;
  f.ctx.providerAuthEpoch = () => epoch;
  const first = f.ctx.loadDetailComments({ id: '186016', provider: 'netease' }, 1);
  f.requests[0].resolve({ comments: batch(0), nextCursor: '{"p":168,"c":"1700000000000"}', hasMore: true });
  await first;
  const deep = f.ctx.loadMoreDetailComments();
  epoch++;
  f.requests[1].resolve({ comments: [comment('old-account-deep')], nextCursor: '{"p":169,"c":"1699999999000"}', hasMore: true });
  await deep;
  assert.equal(f.ctx.detailCommentsState.count, 30);
  assert.equal(f.ctx.detailCommentsState.cursor, '{"p":168,"c":"1700000000000"}');
  assert.doesNotMatch(f.list.innerHTML, /old-account-deep/);
  assert.equal(f.ctx.detailCommentReadStore().cache.size, 1, 'only the original first page is cached, under its original epoch');
  const replacement = f.ctx.loadDetailComments({ id: '186016', provider: 'netease' }, 1);
  assert.equal(f.requests.length, 3, 'the new epoch must fetch its own first page');
  f.requests[2].resolve({ comments: [comment('new-account')], nextCursor: '', hasMore: false });
  await replacement;
  assert.equal(f.ctx.detailCommentsState.count, 1);
  assert.match(f.list.innerHTML, /new-account/);
});
