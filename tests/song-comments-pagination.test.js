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
    querySelector: selector => selectors[selector] };
  const ctx = vm.createContext({
    document: { getElementById: () => target }, trackDetailSeq: 1, detailCommentsState: null,
    songProviderKey: song => song.provider, escHtml: String, bindTrackDetailScrollers() {},
    apiJson: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    closeGsapModal(_modal, done) { done(); }, detailCommentSong: null, detailCommentSubmitBusy: false,
  });
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js',
    ['detailCommentsConfig', 'renderDetailComments', 'loadDetailComments', 'loadMoreDetailComments', 'updateDetailCommentsFooter', 'closeTrackDetailModal']);
  return { ctx, requests, list, button, label, hotList, normalList, hotSection, normalSection, empty };
}

test('offset comments retain the first normal page, deduplicate, retry and ignore stale responses', async () => {
  for (const provider of ['netease', 'qq', 'kugou']) {
    const { ctx, requests, list, button } = renderer();
    const initial = ctx.loadDetailComments({ id: 'song-a', mixSongId: '123', provider }, 1);
    await ctx.loadMoreDetailComments();
    assert.equal(requests.length, 1, 'duplicate clicks cannot request another page');
    assert.match(requests[0].url, /limit=30&offset=0$/);
    requests[0].resolve({ comments: [{ ...comment(500), isHot: true }, ...batch(0), comment(500)], hasMore: true, nextOffset: 30 });
    await initial;
    assert.equal(ctx.detailCommentsState.count, 31);
    assert.match(list.innerHTML, /Comment 0</);
    assert.match(list.innerHTML, /Comment 29</);

    const failed = ctx.loadMoreDetailComments();
    requests[1].reject(new Error('offline'));
    await failed;
    assert.equal(ctx.detailCommentsState.offset, 30);
    assert.equal(ctx.detailCommentsState.count, 31);
    assert.equal(button.disabled, false);
    assert.match(button.textContent, /重试/);
    const retry = ctx.loadMoreDetailComments();
    assert.equal(requests[2].url, requests[1].url);
    requests[2].resolve({ comments: [comment(29), ...batch(30)], hasMore: false, nextOffset: 60 });
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

test('Qishui advances encoded cursors and stops when the server repeats a cursor', async () => {
  const { ctx, requests, button } = renderer();
  const first = ctx.loadDetailComments({ id: 'song', provider: 'qishui' }, 1);
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

test('backend keeps hot and normal first pages while offsets count only the normal page', async () => {
  const queries = [];
  const ctx = vm.createContext({
    qqCookieUin: () => '0', mapQQComment: c => c,
    qqGetJSON: async (_url, params) => {
      queries.push(params);
      return { hot_comment: { commentlist: [comment(500)] },
        comment: { commentlist: batch(Number(params.pagenum) * 30), commenttotal: 60 } };
    },
  });
  loadFunctions(ctx, 'server.js', ['songCommentPage', 'handleQQSongComments']);
  const first = await ctx.handleQQSongComments('123', '', 30, 0);
  assert.equal(first.comments.length, 31);
  assert.equal(first.comments[1].id, 0);
  assert.equal(first.comments[0].isHot, true);
  assert.equal(first.comments[1].isHot, false);
  assert.equal(first.nextOffset, 30);
  assert.equal(first.hasMore, true);
  const next = await ctx.handleQQSongComments('123', '', 30, first.nextOffset);
  assert.equal(next.comments[0].id, 30);
  assert.equal(next.comments.length, 30);
  assert(next.comments.every(c => c.isHot === false));
  assert.equal(next.hasMore, false);
  assert.equal(queries[1].pagenum, '1');
  // Netease's explicit end marker wins even when its total has changed.
  assert.equal(ctx.songCommentPage([], batch(0), 30, 0, 3000, false).hasMore, false);
  assert.equal(ctx.songCommentPage([], [], 30, 30, 3000, true).hasMore, false);
});

test('QQ supports a saved MID and reports upstream failures instead of showing no comments', async () => {
  const { ctx } = renderer();
  assert.match(ctx.detailCommentsConfig({ provider: 'qq', qqMid: 'saved-mid' }).readUrl, /mid=saved-mid/);
  assert.match(ctx.detailCommentsConfig({ provider: 'qq', id: 123 }).readUrl, /id=123/);
  const backend = vm.createContext({ qqCookieUin: () => '0', qqGetJSON: async () => ({ code: 1000 }) });
  loadFunctions(backend, 'server.js', ['handleQQSongComments']);
  await assert.rejects(backend.handleQQSongComments('123', '', 30, 0), /QQ_COMMENTS_UNAVAILABLE/);
  assert.match(ctx.detailCommentsConfig({ provider: 'kugou', mixSongId: 'encrypted', albumAudioId: '123' }).readUrl, /id=123/);
  assert.equal(ctx.detailCommentsConfig({ provider: 'kugou', id: 'only-hash' }), null);
});

test('hot comments have their own section and later pages append only to more comments', async () => {
  const { ctx, requests, hotList, normalList, hotSection, normalSection } = renderer();
  const first = ctx.loadDetailComments({ id: 'song', provider: 'netease' }, 1);
  requests[0].resolve({ comments: [{ ...comment('hot'), isHot: true }, comment('hot'), comment('normal')],
    hasMore: true, nextOffset: 30 });
  await first;
  assert.equal(hotSection.hidden, false);
  assert.equal(normalSection.hidden, false);
  assert.equal(hotSection.heading.textContent, '热门评论 · 1');
  assert.equal(normalSection.heading.textContent, '更多评论 · 1');
  assert.match(hotList.innerHTML, /Comment hot</);
  assert.doesNotMatch(normalList.innerHTML, /Comment hot</);
  const savedHot = hotList.innerHTML;
  const next = ctx.loadMoreDetailComments();
  requests[1].resolve({ comments: [comment('later')], hasMore: false, nextOffset: 60 });
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

test('Netease switches to decreasing time cursors after 5000 comments', async () => {
  const { ctx, requests } = renderer();
  const initial = ctx.loadDetailComments({ id: 'song', provider: 'netease' }, 1);
  requests[0].resolve({ comments: batch(0), nextOffset: 30, nextBefore: 2000, hasMore: true });
  await initial;
  ctx.detailCommentsState.offset = 4980;
  const boundary = ctx.loadMoreDetailComments();
  assert.doesNotMatch(requests[1].url, /before=/);
  requests[1].resolve({ comments: batch(30), nextOffset: 5010, nextBefore: 1900, hasMore: true });
  await boundary;
  const deep = ctx.loadMoreDetailComments();
  assert.match(requests[2].url, /offset=5010&before=1900$/);
  requests[2].resolve({ comments: batch(60), nextOffset: 5040, nextBefore: 1800, hasMore: true });
  await deep;
  const repeated = ctx.loadMoreDetailComments();
  requests[3].resolve({ comments: batch(60), nextOffset: 5070, nextBefore: 1800, hasMore: true });
  await repeated;
  assert.equal(ctx.detailCommentsState.hasMore, false);
  assert.equal(ctx.detailCommentsState.count, 90);
});

test('Netease HTTP route forwards before with upstream offset zero and retains local progress', async () => {
  const calls = [], responses = [];
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf("  if (pn === '/api/song/comments') {");
  const end = source.indexOf("  if (pn === '/api/song/comments/like')", start);
  const ctx = vm.createContext({
    pn: '/api/song/comments', req: { method: 'GET' }, res: {}, userCookie: '',
    url: new URL('http://localhost/api/song/comments?id=song&limit=30&offset=5010&before=1900'),
    sendJSON: (_, payload) => responses.push(payload), console,
    comment_music: async options => {
      calls.push(options);
      return { body: { more: true, total: 9000, hotComments: [{ commentId: 'hot', content: 'hot' }],
        comments: [{ commentId: 'deep', content: 'deep', time: 1800 }] } };
    },
  });
  loadFunctions(ctx, 'server.js', ['songCommentPage']);
  loadFunctions(ctx, 'comment-replies-api.js', ['mapNeteaseComment']);
  await vm.runInContext('(async () => {' + source.slice(start, end) + '})()', ctx);
  assert.equal(calls[0].offset, 0);
  assert.equal(calls[0].before, 1900);
  assert.equal(responses[0].nextOffset, 5040);
  assert.equal(responses[0].nextBefore, 1800);
  assert.equal(responses[0].comments.length, 1);
  assert.equal(responses[0].comments[0].isHot, false);
});
