'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadFunctions } = require('./helpers/classic-functions');
const { handleQQReplies } = require('../comment-replies-api');

function renderer(provider) {
  const requests = [];
  const toggle = { setAttribute(name, value) { this[name] = value; } };
  const panel = {}, status = {}, more = {}, list = { innerHTML: '', insertAdjacentHTML(_where, html) { this.innerHTML += html; } };
  const selectors = { '.comment-replies-toggle': toggle, '.comment-replies-panel': panel,
    '.comment-replies-status': status, '[data-reply-action="load"]': more, '.comment-replies-list': list };
  const region = { querySelector: selector => selectors[selector] };
  panel.parentElement = region;
  const ctx = vm.createContext({ URL, AbortController, trackDetailSeq: 1,
    detailCommentsState: { seq: 1, config: { provider, readUrl: '/api/song/comments?id=123' }, threads: Object.create(null), threadIndex: 0 },
    document: { getElementById: () => panel },
    escHtml: text => String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    coverUrlWithSize: value => value, commentTimeLabel: () => '10月3日',
    apiJson: (url, opts) => new Promise((resolve, reject) => requests.push({ url, opts, resolve, reject })),
  });
  loadFunctions(ctx, 'public/js/modules/05-playback/06a-comment-replies.js',
    ['detailReplyControlsHtml', 'detailReplyRegion', 'updateDetailReplyControls', 'toggleDetailReplies', 'renderDetailReplyItems', 'loadMoreDetailReplies']);
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js',
    ['commentCountLabel', 'commentVipHtml', 'commentHeartSvg', 'commentLikeHtml', 'commentHeadHtml', 'neteaseEmojiId', 'commentContentHtml', 'cancelDetailCommentReads', 'detailCommentReadStore', 'invalidateDetailCommentReadCache', 'readDetailComments']);
  ctx.detailReplyControlsHtml({ id: 'parent', replyCount: 25, replyResource: '100', user: { nickname: '听众' } });
  return { ctx, requests, toggle, panel, status, more, list };
}
const reply = id => ({ id, content: '回复 ' + id, user: { nickname: '回复者' } });

test('reply pagination preserves content, retries, deduplicates and caches collapsed threads on every platform', async () => {
  for (const provider of ['netease', 'qq', 'kugou', 'qishui']) {
    const { ctx, requests, toggle, panel, list, more } = renderer(provider);
    const open = ctx.toggleDetailReplies('parent');
    await ctx.loadMoreDetailReplies('parent');
    assert.equal(requests.length, 1);
    assert.equal(toggle['aria-expanded'], 'true');
    await ctx.toggleDetailReplies('parent');
    requests[0].resolve({ comments: [reply('a')], hasMore: true, nextOffset: 20, nextCursor: 'next' });
    await open;
    assert.equal(panel.hidden, true, 'a late response cannot re-open a collapsed thread');
    await ctx.toggleDetailReplies('parent');
    assert.equal(requests.length, 1, 'reopening uses already loaded replies');
    const failed = ctx.loadMoreDetailReplies('parent');
    requests[1].reject(new Error('offline'));
    await failed;
    assert.equal(more.textContent, '重试');
    assert.match(list.innerHTML, /回复 a/);
    const retry = ctx.loadMoreDetailReplies('parent');
    assert.equal(requests[2].url, requests[1].url);
    requests[2].resolve({ comments: [reply('a'), reply('b'), reply('parent')], hasMore: false, nextOffset: 40, nextCursor: 'end' });
    await retry;
    assert.equal(ctx.detailCommentsState.threads.parent.count, 2);
    assert.equal(more.hidden, true);
    assert.equal((list.innerHTML.match(/回复 a/g) || []).length, 1);
  }
});

test('replies cannot leak into a new song and repeated cursors cannot keep pagination alive', async () => {
  const { ctx, requests, list } = renderer('qq');
  const first = ctx.toggleDetailReplies('parent');
  ctx.detailCommentsState = null; ctx.trackDetailSeq++;
  requests[0].resolve({ comments: [reply('old')], hasMore: true, nextCursor: 'next' });
  await first;
  assert.equal(list.innerHTML, '');
  const next = renderer('qishui');
  const open = next.ctx.toggleDetailReplies('parent');
  next.requests[0].resolve({ comments: [reply('a')], hasMore: true, nextCursor: 'same' });
  await open;
  const duplicate = next.ctx.loadMoreDetailReplies('parent');
  next.requests[1].resolve({ comments: [reply('b')], hasMore: true, nextCursor: 'same' });
  await duplicate;
  assert.equal(next.ctx.detailCommentsState.threads.parent.hasMore, false);
});

test('reply content is escaped and only positive known counts create expanders', () => {
  const { ctx } = renderer('netease');
  for (const count of [undefined, null, 0, -1, NaN, Infinity, 'invalid']) {
    assert.equal(ctx.detailReplyControlsHtml({ id: 'empty', replyCount: count }), '');
  }
  assert.match(ctx.detailReplyControlsHtml({ id: 'nonempty', replyCount: 128 }), /128 条回复 ›/);
  const html = ctx.renderDetailReplyItems([{ ...reply('a'), content: '<script>alert(1)</script>',
    replyTo: '<target>', user: { nickname: '<author>', avatar: 'https://example.test/" onerror="attack' } }]);
  assert(!html.includes('<script>'));
  assert.match(html, /&lt;author&gt;/);
  assert.match(html, /&lt;target&gt;/);
  assert.match(html, /&quot; onerror=&quot;/);
  // Author and time head the reply; the like count sits in the heart control after the text.
  const meta = ctx.renderDetailReplyItems([{ ...reply('b'), likedCount: 12, time: 100 }]);
  assert.match(meta, /<span class="comment-author">回复者<\/span><span class="comment-time">10月3日<\/span>/);
  assert.match(meta, /comment-reply-text">回复 b<\/div><div class="comment-actions">[\s\S]*class="comment-like"[\s\S]*comment-like-count">12</);
  assert(!meta.includes('<strong>'));
  // Badge images must be platform HTTPS URLs; anything else is dropped.
  assert.match(ctx.renderDetailReplyItems([{ ...reply('v'), vip: { icon: 'https://y.qq.com/svip8.png', level: 0 } }]), /<img src="https:\/\/y\.qq\.com\/svip8\.png"/);
  assert.doesNotMatch(ctx.renderDetailReplyItems([{ ...reply('w'), vip: { icon: 'javascript:alert(1)', level: 3 } }]), /javascript:/);
});

test('QQ reply requests preserve ranking and sequence cursors and reject unavailable responses', async () => {
  const calls = [];
  const request = async payload => {
    calls.push(payload.req.param);
    return { req: { code: 0, data: { SubCode: 0, CommentList: { Comments: [{ CmId: 'reply', Content: '内容', PubTime: 100,
      Nick: '用户', SeqNo: '12345', RankScore: '42', RepliedComments: [{ Nick: '被回复用户' }] }], HasMore: 1, Total: 30 } } } };
  };
  const first = await handleQQReplies('parent', 20, '', request);
  assert.equal(first.comments[0].replyTo, '被回复用户');
  assert.equal(first.comments[0].time, 100000);
  assert.equal(first.hasMore, true);
  const repeated = await handleQQReplies('parent', 20, first.nextCursor, request);
  assert.equal(calls[1].LastCommentSeqNo, '12345');
  assert.equal(calls[1].LastRankScore, '42');
  assert.equal(calls[1].PageNum, 1);
  assert.equal(repeated.hasMore, false);
  await assert.rejects(handleQQReplies('parent', 20, '', async () => ({ req: { code: 1000 } })), /UNAVAILABLE/);
});

test('Netease floor replies use the parent and time cursor instead of main-comment offsets', async () => {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'comment-replies-api.js'), 'utf8'), {
    module, require: () => ({ comment_floor: async options => {
      calls.push(options);
      return { body: { code: 200, data: { hasMore: true, totalCount: 100, time: '200',
        comments: [{ commentId: 2, content: '回复', time: 200, beReplied: [{ user: { nickname: '原作者' } }] }] } } };
    } }),
  });
  const result = await module.exports.handleNeteaseReplies('123', '1', '', 20, '100');
  assert.equal(calls[0].parentCommentId, '1');
  assert.equal(calls[0].time, '100');
  assert.equal(result.nextCursor, '200');
  assert.equal(result.comments[0].replyTo, '原作者');
});

test('Qishui nested reply records follow the explicit end flag despite a returned cursor', async () => {
  const ctx = vm.createContext({ normalizeQishuiCookieInput: String, qishuiCookieHasLogin: () => true,
    normalizeText: String, qishuiPcAppParams: value => value, QISHUI_WEB_PC_API_BASE: 'https://example.test',
    pickArray: (...arrays) => arrays.find(Array.isArray) || [], mapQishuiComment: value => value,
    qishuiWebRequestJson: async (url, params) => {
      assert.equal(url, '/luna/pc/comments/parent/replies');
      assert.equal(params.cursor, 'old');
      return { reply_infos: [{ reply: reply('a') }], cursor: 'new', has_more: false };
    },
  });
  loadFunctions(ctx, 'qishui-api.js', ['qishuiCommentHasMore', 'handleQishuiReplies']);
  const result = await ctx.handleQishuiReplies('parent', { cursor: 'old', limit: 20 }, 'fixture');
  assert.equal(result.comments[0].id, 'a');
  assert.equal(result.hasMore, false);
  ctx.qishuiWebRequestJson = async () => ({});
  await assert.rejects(ctx.handleQishuiReplies('parent', {}, 'fixture'), /INVALID_RESPONSE/);
});

test('reply errors tell logged-out Qishui users to sign in without claiming content was preserved', async () => {
  const { ctx, requests, status, more } = renderer('qishui');
  const open = ctx.toggleDetailReplies('parent');
  requests[0].resolve({ error: 'QISHUI_COOKIE_REQUIRED', comments: [], hasMore: false });
  await open;
  assert.equal(status.textContent, '请先登录汽水音乐后重试');
  assert.equal(more.textContent, '重试');
});

test('Qishui PC reply fields preserve counters, timestamps and the recipient', () => {
  const ctx = vm.createContext({ pickObject: (...values) => values.find(v => v && typeof v === 'object') || {},
    normalizeText: String, normalizeLyricBody: String, qishuiFirstImageUrl: () => '' });
  loadFunctions(ctx, 'qishui-api.js', ['mapQishuiComment']);
  const result = ctx.mapQishuiComment({ id: 'reply', content: '回复内容', count_digged: 12, count_reply: 0,
    time_created: 1700000000, user: { nickname: '作者' }, reply_to: { user_info: { nickname: '原作者' } } });
  assert.equal(result.likedCount, 12);
  assert.equal(result.replyCount, 0);
  assert.equal(result.time, 1700000000000);
  assert.equal(result.replyTo, '原作者');
});

test('duplicate-only reply pages retain advancing cursors, with a bounded empty-page guard', async () => {
  const f = renderer('qq');
  const first = f.ctx.toggleDetailReplies('parent');
  f.requests[0].resolve({ comments: [reply('a')], hasMore: true, nextCursor: 'c1' }); await first;
  const duplicate = f.ctx.loadMoreDetailReplies('parent');
  f.requests[1].resolve({ comments: [reply('a')], hasMore: true, nextCursor: 'c2' }); await duplicate;
  assert.equal(f.ctx.detailCommentsState.threads.parent.hasMore, true);
  const next = f.ctx.loadMoreDetailReplies('parent');
  f.requests[2].resolve({ comments: [reply('b')], hasMore: true, nextCursor: 'c3' }); await next;
  assert.equal(f.ctx.detailCommentsState.threads.parent.count, 2);
  for (let i = 0; i < 3; i++) {
    const pending = f.ctx.loadMoreDetailReplies('parent');
    f.requests[3 + i].resolve({ comments: [reply('a')], hasMore: true, nextCursor: 'c' + (4 + i) }); await pending;
  }
  assert.equal(f.ctx.detailCommentsState.threads.parent.hasMore, false);
});

test('reply GET uses an owner deadline and cancellation without rendering an error', async () => {
  const f = renderer('qq');
  const pending = f.ctx.toggleDetailReplies('parent');
  assert.equal(f.requests[0].opts.timeoutMs, 15000);
  f.ctx.cancelDetailCommentReads(f.ctx.detailCommentsState);
  assert.equal(f.requests[0].opts.signal.aborted, true);
  await pending;
  assert.equal(f.ctx.detailCommentsState.threads.parent.loading, false);
  assert.equal(f.ctx.detailCommentsState.threads.parent.error, false);
});
