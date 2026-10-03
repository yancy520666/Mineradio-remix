'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

const comment = id => ({ id, content: 'Comment ' + id, user: { nickname: 'Listener' } });
const batch = start => Array.from({ length: 30 }, (_, i) => comment(start + i));
function renderer() {
  const list = { innerHTML: '', insertAdjacentHTML(_where, html) { this.innerHTML += html; } };
  const button = {}, label = {}, requests = [];
  const target = { innerHTML: '', querySelector(selector) {
    return selector === '.detail-scroll' ? list : selector.includes('button') ? button : label;
  } };
  const ctx = vm.createContext({
    document: { getElementById: () => target }, trackDetailSeq: 1, detailCommentsState: null,
    songProviderKey: song => song.provider, escHtml: String, bindTrackDetailScrollers() {},
    apiJson: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    closeGsapModal(_modal, done) { done(); }, detailCommentSong: null, detailCommentSubmitBusy: false,
  });
  loadFunctions(ctx, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js',
    ['detailCommentsConfig', 'renderDetailComments', 'loadDetailComments', 'loadMoreDetailComments', 'updateDetailCommentsFooter', 'closeTrackDetailModal']);
  return { ctx, requests, list, button, label };
}

test('offset comments retain the first normal page, deduplicate, retry and ignore stale responses', async () => {
  for (const provider of ['netease', 'qq']) {
    const { ctx, requests, list, button } = renderer();
    const initial = ctx.loadDetailComments({ id: 'song-a', provider }, 1);
    await ctx.loadMoreDetailComments();
    assert.equal(requests.length, 1, 'duplicate clicks cannot request another page');
    assert.match(requests[0].url, /limit=30&offset=0$/);
    requests[0].resolve({ comments: [comment(500), ...batch(0), comment(500)], hasMore: true, nextOffset: 30 });
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

    const old = ctx.loadDetailComments({ id: 'song-a', provider }, 1);
    ctx.closeTrackDetailModal();
    assert.equal(ctx.detailCommentsState, null);
    const next = ctx.loadDetailComments({ id: 'song-b', provider }, ++ctx.trackDetailSeq);
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
  assert.equal(first.nextOffset, 30);
  assert.equal(first.hasMore, true);
  const next = await ctx.handleQQSongComments('123', '', 30, first.nextOffset);
  assert.equal(next.comments[0].id, 30);
  assert.equal(next.comments.length, 30);
  assert.equal(next.hasMore, false);
  assert.equal(queries[1].pagenum, '1');
  // Netease's explicit end marker wins even when its total has changed.
  assert.equal(ctx.songCommentPage([], batch(0), 30, 0, 3000, false).hasMore, false);
  assert.equal(ctx.songCommentPage([], [], 30, 30, 3000, true).hasMore, false);
});
