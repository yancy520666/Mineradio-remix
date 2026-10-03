// The reply toggle shares the comment's bottom row with its like control.
function detailReplyControlsHtml(comment, likeHtml) {
  var owner = detailCommentsState;
  var count = Number(comment.replyCount);
  if (!owner || comment.id == null || String(comment.id) === '' || !Number.isFinite(count) || count <= 0) return '';
  var key = encodeURIComponent(String(comment.id));
  var id = 'detail-replies-' + owner.seq + '-' + owner.threadIndex++;
  owner.threads[key] = { id: id, parentId: String(comment.id), resource: comment.replyResource || '',
    total: count, loaded: false, open: false, loading: false, hasMore: true, error: false, errorMessage: '',
    count: 0, offset: 0, cursor: '', seen: Object.create(null) };
  var label = commentCountLabel(count) + ' 条回复 ›';
  return '<div class="comment-replies" data-reply-key="' + escHtml(key) + '"><div class="comment-actions">' +
    '<button type="button" class="comment-replies-toggle" data-reply-action="toggle" aria-expanded="false" aria-controls="' + id + '">' + label + '</button>' +
    (likeHtml || '') + '</div>' +
    '<div id="' + id + '" class="comment-replies-panel" hidden role="region" aria-label="' + escHtml((comment.user && comment.user.nickname || '这条评论') + '的回复') + '">' +
    '<div class="comment-replies-list"></div><div class="comment-replies-footer">' +
    '<span class="comment-replies-status" role="status" aria-live="polite"></span>' +
    '<button type="button" data-reply-action="load">加载更多回复</button></div></div></div>';
}

function bindDetailReplyControls(target) {
  if (target.dataset.replyBound) return;
  target.dataset.replyBound = '1';
  target.addEventListener('click', function (event) {
    var button = event.target.closest('[data-reply-action]');
    if (!button || !target.contains(button)) return;
    var region = button.closest('[data-reply-key]');
    if (!region) return;
    var key = region.getAttribute('data-reply-key');
    if (button.getAttribute('data-reply-action') === 'toggle') toggleDetailReplies(key);
    else loadMoreDetailReplies(key);
  });
}

function detailReplyRegion(thread) {
  var panel = document.getElementById(thread.id);
  return panel && panel.parentElement;
}

function updateDetailReplyControls(thread, region) {
  if (!region) return;
  var toggle = region.querySelector('.comment-replies-toggle');
  toggle.textContent = thread.open ? '收起回复' : commentCountLabel(thread.total) + ' 条回复 ›';
  toggle.setAttribute('aria-expanded', thread.open ? 'true' : 'false');
  region.querySelector('.comment-replies-panel').hidden = !thread.open;
  var status = region.querySelector('.comment-replies-status');
  status.textContent = thread.loading ? '正在加载回复…' : thread.error ? thread.errorMessage + (thread.count ? '，已有内容已保留' : '')
    : thread.count ? '已显示 ' + thread.count + ' 条回复' + (thread.hasMore ? '' : ' · 已到底') : thread.loaded ? '暂无回复' : '';
  var more = region.querySelector('[data-reply-action="load"]');
  more.hidden = !thread.hasMore;
  more.disabled = thread.loading;
  more.textContent = thread.loading ? '正在加载…' : thread.error ? '重试' : '加载更多回复';
}

function toggleDetailReplies(key) {
  var owner = detailCommentsState;
  var thread = owner && owner.threads[key];
  if (!thread || owner.seq !== trackDetailSeq) return Promise.resolve();
  thread.open = !thread.open;
  updateDetailReplyControls(thread, detailReplyRegion(thread));
  return thread.open && !thread.loaded ? loadMoreDetailReplies(key) : Promise.resolve();
}

function renderDetailReplyItems(comments) {
  return comments.map(function (comment) {
    var user = comment.user || {};
    var avatar = user.avatar ? escHtml(coverUrlWithSize(user.avatar, 48)) : '';
    return '<div class="comment-reply-item">' + (avatar
      ? '<img class="comment-reply-avatar" src="' + avatar + '" alt="" loading="lazy">'
      : '<span class="comment-reply-avatar" aria-hidden="true"></span>') +
      '<div class="comment-reply-copy">' + commentHeadHtml(comment) +
      '<div class="comment-reply-text">' + (comment.replyTo ? '<span class="comment-reply-to">回复 ' + escHtml(comment.replyTo) + '：</span>' : '') +
      escHtml(comment.content || '') + '</div>' +
      '<div class="comment-actions"><span></span>' + commentLikeHtml(comment) + '</div></div></div>';
  }).join('');
}

function loadMoreDetailReplies(key) {
  var owner = detailCommentsState;
  var thread = owner && owner.threads[key];
  if (!thread || owner.seq !== trackDetailSeq || thread.loading || !thread.hasMore) return Promise.resolve();
  var region = detailReplyRegion(thread);
  if (!region) return Promise.resolve();
  thread.loading = true;
  thread.error = false;
  updateDetailReplyControls(thread, region);
  var songId = new URL(owner.config.readUrl, 'http://127.0.0.1').searchParams.get('id') || '';
  var url = '/api/song/comment/replies?provider=' + encodeURIComponent(owner.config.provider) +
    '&id=' + encodeURIComponent(songId) + '&parentId=' + encodeURIComponent(thread.parentId) +
    '&resource=' + encodeURIComponent(thread.resource) + '&limit=20&offset=' + thread.offset + '&cursor=' + encodeURIComponent(thread.cursor);
  return apiJson(url).then(function (result) {
    if (owner !== detailCommentsState || owner.seq !== trackDetailSeq) return;
    if (!result || result.error || !Array.isArray(result.comments)) throw new Error(result && result.error || 'REPLIES_UNAVAILABLE');
    var fresh = result.comments.filter(function (comment) {
      if (!comment || !comment.content || String(comment.id) === thread.parentId) return false;
      var replyKey = comment.id ? 'id:' + comment.id : JSON.stringify([comment.user && comment.user.id, comment.time, comment.content]);
      if (thread.seen[replyKey]) return false;
      thread.seen[replyKey] = true;
      return true;
    });
    if (fresh.length) region.querySelector('.comment-replies-list').insertAdjacentHTML('beforeend', renderDetailReplyItems(fresh));
    thread.count += fresh.length;
    thread.total = Math.max(thread.total, Number(result.total) || 0, thread.count);
    thread.loaded = true;
    thread.hasMore = result.hasMore === true && fresh.length > 0;
    if (owner.config.provider === 'kugou') {
      var offset = Number(result.nextOffset);
      thread.hasMore = thread.hasMore && Number.isFinite(offset) && offset > thread.offset;
      thread.offset = offset;
    } else {
      var cursor = result.nextCursor == null ? '' : String(result.nextCursor);
      thread.hasMore = thread.hasMore && !!cursor && cursor !== thread.cursor;
      thread.cursor = cursor;
    }
  }).catch(function (error) {
    if (owner === detailCommentsState && owner.seq === trackDetailSeq) {
      thread.error = true;
      thread.errorMessage = error.message === 'QISHUI_COOKIE_REQUIRED' ? '请先登录汽水音乐后重试' : '回复加载失败';
    }
  }).finally(function () {
    if (owner !== detailCommentsState || owner.seq !== trackDetailSeq) return;
    thread.loading = false;
    updateDetailReplyControls(thread, region);
  });
}
