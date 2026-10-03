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
    document: { getElementById: () => target }, trackDetailSeq: 1, detailCommentsState: null, detailCommentSort: 'latest',
    songProviderKey: song => song.provider, escHtml: String, bindTrackDetailScrollers() {},
    apiJson: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    closeGsapModal(_modal, done) { done(); }, detailCommentSong: null, detailCommentSubmitBusy: false,
  });
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js',
    ['detailCommentsConfig', 'renderDetailComments', 'loadDetailComments', 'loadMoreDetailComments', 'updateDetailCommentsFooter', 'closeTrackDetailModal',
      'commentCountLabel', 'commentVipHtml', 'commentHeartSvg', 'commentLikeHtml', 'commentHeadHtml', 'bindDetailCommentLikes',
      'detailCommentsSortable']);
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
