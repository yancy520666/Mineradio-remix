// One inline draft belongs to one rendered comment and one account session.
// Writes never share the comment GET cancellation/retry lifecycle.
var detailReplyDraft = null;
var detailReplyWritePending = null;
// Keep only attempt identity/status, never draft text, across Close or sorting.
// Unconfirmed records are not evicted to make room for another possible write.
var detailReplyWriteLedger = new Map();
var detailReplyWriteLedgerLimit = 32;

function detailReplyWriteIdentity(config, target, auth) {
  return JSON.stringify([config.provider, auth.epoch, auth.userId, String(config.id || ''), target.parentId, target.commentId]);
}

function detailReplyTarget(comment, thread) {
  var owner = detailCommentsState;
  if (!owner || !owner.config.canReply || owner.seq !== trackDetailSeq || !comment || comment.id == null || String(comment.id) === '') return null;
  var parentId = thread ? thread.parentId : String(comment.id);
  var resource = thread ? thread.resource : comment.replyResource || '';
  if (!parentId || (owner.config.provider === 'kugou' && !resource)) return null;
  if (!owner.replyTargets) { owner.replyTargets = Object.create(null); owner.replyTargetIndex = 0; }
  var key = 'reply-' + owner.seq + '-' + owner.replyTargetIndex++;
  var target = { key: key, parentId: String(parentId), commentId: String(comment.id), resource: String(resource),
    threadKey: encodeURIComponent(String(parentId)),
    nickname: Array.from(String(comment.user && comment.user.nickname || '音乐用户')).slice(0, 64).join(''),
    quote: Array.from(String(comment.content || '').replace(/\s+/g, ' ').trim()).slice(0, 100).join('') };
  owner.replyTargets[key] = target;
  return target;
}

function detailReplyButtonHtml(key) {
  return '<button type="button" class="comment-reply-open" data-comment-compose="open" data-compose-key="' + key + '" aria-label="回复这条评论">回复</button>';
}

function detailReplyComposerHtml(target) {
  return '<div class="detail-reply-compose" role="group" aria-label="回复评论">' +
    '<div class="detail-reply-target">回复 <span>' + escHtml(target.nickname) + '</span></div>' +
    '<div class="detail-reply-quote">' + escHtml(target.quote) + '</div>' +
    '<textarea class="detail-reply-input" rows="2" maxlength="280" autocomplete="off" aria-label="回复内容" placeholder="写下你的回复"></textarea>' +
    '<p class="detail-reply-feedback" role="status" aria-live="polite" hidden></p>' +
    '<div class="detail-reply-compose-actions"><span class="detail-reply-length">0 / 280</span>' +
    '<button type="button" data-comment-compose="refresh" hidden>刷新查看</button>' +
    '<button type="button" data-comment-compose="confirm-unsent" hidden>确认未发送，重新编辑</button>' +
    '<button type="button" data-comment-compose="cancel">取消</button>' +
    '<button type="button" class="detail-reply-send" data-comment-compose="send" disabled>发送回复</button></div></div>';
}

function detailReplyComposerCurrent(draft) {
  return !!(draft && draft === detailReplyDraft && draft.owner === detailCommentsState && draft.owner.seq === trackDetailSeq &&
    draft.song === detailCommentSong && draft.card.isConnected && accountActionAuthCurrent(draft.auth));
}

function resetDetailReplyComposer(restoreFocus) {
  var draft = detailReplyDraft;
  detailReplyDraft = null;
  if (!draft) return;
  draft.card.remove();
  draft.row.classList.remove('is-reply-selected');
  if (restoreFocus && draft.trigger && draft.trigger.isConnected) draft.trigger.focus({ preventScroll: true });
}

function updateDetailReplyComposer() {
  var draft = detailReplyDraft;
  if (!draft) return;
  if (!detailReplyComposerCurrent(draft)) { resetDetailReplyComposer(); return; }
  var attempt = detailReplyWriteLedger.get(draft.identity);
  if (attempt && attempt.outcome === 'unknown' && !draft.unknown) {
    draft.unknown = true;
    draft.message = detailReplyUnknownMessage();
  }
  var input = draft.card.querySelector('.detail-reply-input');
  draft.content = input.value;
  draft.card.querySelector('.detail-reply-length').textContent = draft.content.length + ' / 280';
  input.disabled = draft.sending;
  var send = draft.card.querySelector('[data-comment-compose="send"]');
  send.disabled = draft.sending || !!detailReplyWritePending || draft.unknown || !draft.content.trim() || draft.content.length > 280;
  send.textContent = draft.sending ? '发送中…' : '发送回复';
  draft.card.querySelector('[data-comment-compose="cancel"]').disabled = draft.sending;
  var refresh = draft.card.querySelector('[data-comment-compose="refresh"]');
  refresh.hidden = !draft.unknown;
  refresh.disabled = draft.checking;
  refresh.textContent = draft.checking ? '刷新中…' : '刷新查看';
  var confirm = draft.card.querySelector('[data-comment-compose="confirm-unsent"]');
  var thread = draft.owner.threads[draft.target.threadKey];
  confirm.hidden = !draft.unknown || !draft.checked || !!detailReplyWritePending || !!(thread && thread.loading);
  confirm.disabled = draft.checking || !!detailReplyWritePending;
  var feedback = draft.card.querySelector('.detail-reply-feedback');
  feedback.textContent = draft.message || '';
  feedback.hidden = !draft.message;
}

function openDetailReplyComposer(key, row) {
  var owner = detailCommentsState;
  var target = owner && owner.replyTargets && owner.replyTargets[key];
  if (!target || !owner.config.canReply || owner.seq !== trackDetailSeq || !row || !row.isConnected) return;
  if (detailReplyDraft && !detailReplyComposerCurrent(detailReplyDraft)) resetDetailReplyComposer();
  var existing = detailReplyDraft;
  if (existing && existing.owner === owner && existing.target.key === key) {
    existing.card.querySelector('.detail-reply-input').focus({ preventScroll: true });
    return;
  }
  if (existing && (existing.sending || existing.unknown || existing.card.querySelector('.detail-reply-input').value.trim())) {
    if (!existing.unknown) existing.message = '当前正在回复 ' + existing.target.nickname + '。先发送或取消这条草稿，再回复其他评论。';
    updateDetailReplyComposer();
    existing.card.querySelector('.detail-reply-input').focus({ preventScroll: true });
    return;
  }
  if (!isSongAccountLoggedIn(owner.config.provider)) {
    showToast('登录' + owner.config.title.replace(/评论$/, '') + '后可以回复评论');
    showLoginModal({ provider: owner.config.provider });
    return;
  }
  resetDetailReplyComposer();
  var copy = row.querySelector(row.classList.contains('comment-reply-item') ? '.comment-reply-copy' : '.comment-main');
  if (!copy) return;
  copy.insertAdjacentHTML('beforeend', detailReplyComposerHtml(target));
  var card = copy.querySelector('.detail-reply-compose');
  var auth = accountActionAuthSnapshot(owner.config.provider);
  var identity = detailReplyWriteIdentity(owner.config, target, auth);
  var attempt = detailReplyWriteLedger.get(identity);
  detailReplyDraft = { owner: owner, song: detailCommentSong, target: target, row: row, card: card,
    trigger: row.querySelector('[data-comment-compose="open"]'), auth: auth, identity: identity,
    content: '', sending: false, checking: false, checked: false, unknown: !!(attempt && attempt.outcome === 'unknown'),
    message: attempt && attempt.outcome === 'unknown' ? detailReplyUnknownMessage() : '' };
  row.classList.add('is-reply-selected');
  updateDetailReplyComposer();
  card.querySelector('.detail-reply-input').focus({ preventScroll: true });
}

function detailReplyUnknownMessage() {
  return '发送结果尚未确认，内容可能已发出。请先刷新查看，避免重复发送。';
}

function detailReplyRejectedMessage(result) {
  var error = String(result && result.error || '');
  if (error === 'COMMENT_REPLY_VERIFICATION_REQUIRED') return '请先在该平台官方客户端完成安全验证，再发送回复。草稿已保留。';
  if (/LOGIN|COOKIE_REQUIRED|SESSION_REQUIRED/.test(error)) return '登录状态已失效，请重新登录后再回复。草稿已保留。';
  if (/TOO_LONG|CONTENT_LIMIT/.test(error)) return '回复不能超过 280 字。草稿已保留。';
  if (/UNSUPPORTED/.test(error)) return '当前平台暂不支持回复评论。草稿已保留。';
  if (/INVALID|TARGET|MISSING/.test(error)) return '这条评论暂时无法回复，请刷新评论后再试。草稿已保留。';
  return '回复没有发送成功，草稿已保留，请稍后再试。';
}

async function submitDetailReply() {
  var draft = detailReplyDraft;
  if (!draft || draft.sending || draft.unknown || detailReplyWritePending) return;
  if (!detailReplyComposerCurrent(draft)) { if (draft === detailReplyDraft) resetDetailReplyComposer(); return; }
  if (detailReplyWriteLedger.has(draft.identity)) { updateDetailReplyComposer(); return; }
  var config = draft.owner.config;
  if (!config.canReply || !isSongAccountLoggedIn(config.provider)) {
    draft.message = '请先登录对应平台后再回复。'; updateDetailReplyComposer(); return;
  }
  var content = draft.card.querySelector('.detail-reply-input').value.trim();
  if (!content || content.length > 280) {
    draft.message = content ? '回复不能超过 280 字。' : '先写下回复内容。'; updateDetailReplyComposer(); return;
  }
  if (detailReplyWriteLedger.size >= detailReplyWriteLedgerLimit) {
    draft.message = '有多条回复的发送结果尚未确认，请先刷新查看已发送的内容。'; updateDetailReplyComposer(); return;
  }
  var attempt = { auth: draft.auth, outcome: 'pending' };
  detailReplyWriteLedger.set(draft.identity, attempt);
  draft.sending = true;
  draft.message = '';
  detailReplyWritePending = draft;
  updateDetailReplyComposer();
  try {
    var result = await apiJson('/api/song/comment/reply', { method: 'POST', timeoutMs: 20000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: config.provider, id: config.id, parentId: draft.target.parentId,
        commentId: draft.target.commentId, resource: draft.target.resource, content: content }) });
    var created = result && result.created === true && result.success === true && result.outcome === 'created';
    var rejected = result && result.created === false && result.success === false && result.outcome === 'rejected';
    if (detailReplyWriteLedger.get(draft.identity) === attempt) {
      if (created || rejected) detailReplyWriteLedger.delete(draft.identity);
      else attempt.outcome = 'unknown';
    }
    // A stale success invalidates reads for this account but never replaces UI.
    if (created && accountActionAuthCurrent(draft.auth)) invalidateDetailCommentReadCache(config.provider, true);
    if (!detailReplyComposerCurrent(draft)) return;
    if (created) {
      resetDetailReplyComposer();
      showToast('回复已发送');
      await loadDetailComments(draft.song, draft.owner.seq);
    } else if (rejected) {
      draft.message = detailReplyRejectedMessage(result);
    } else {
      draft.unknown = true;
      draft.message = detailReplyUnknownMessage();
    }
  } catch (error) {
    if (detailReplyWriteLedger.get(draft.identity) === attempt) attempt.outcome = 'unknown';
    if (!detailReplyComposerCurrent(draft)) return;
    // A lost response cannot establish whether the platform already created it.
    draft.unknown = true;
    draft.message = detailReplyUnknownMessage();
  } finally {
    draft.sending = false;
    if (detailReplyWritePending === draft) detailReplyWritePending = null;
    updateDetailReplyComposer();
  }
}

async function refreshDetailReplyComposer() {
  var draft = detailReplyDraft;
  if (!detailReplyComposerCurrent(draft) || !draft.unknown || draft.checking) return;
  draft.checked = false;
  var thread = draft.owner.threads[draft.target.threadKey];
  if (!thread || thread.loading) { updateDetailReplyComposer(); return; }
  draft.checking = true;
  updateDetailReplyComposer();
  try {
    invalidateDetailCommentReadCache(draft.owner.config.provider);
    // Reload the first reply page without replacing selected rows or their draft.
    thread.cursor = ''; thread.offset = 0; thread.hasMore = true; thread.open = true;
    var refreshed = await loadMoreDetailReplies(draft.target.threadKey);
    if (detailReplyComposerCurrent(draft)) draft.checked = refreshed === true && !thread.error;
  } catch (error) {
    if (detailReplyComposerCurrent(draft)) thread.error = true;
  } finally {
    if (detailReplyComposerCurrent(draft)) {
      draft.checking = false;
      draft.message = !draft.checked ? '刷新未完成，草稿已保留。请稍后刷新查看，避免重复发送。' : '已刷新回复，请核对是否已发出。草稿已保留，确认未发送后可重新编辑。';
      updateDetailReplyComposer();
    }
  }
}

function confirmDetailReplyUnsent() {
  var draft = detailReplyDraft;
  if (!detailReplyComposerCurrent(draft) || !draft.unknown || !draft.checked || draft.checking || detailReplyWritePending) return;
  var attempt = detailReplyWriteLedger.get(draft.identity);
  if (!attempt || attempt.outcome !== 'unknown') return;
  var thread = draft.owner.threads[draft.target.threadKey];
  if (!thread || thread.loading) return;
  detailReplyWriteLedger.delete(draft.identity);
  draft.unknown = false;
  draft.checked = false;
  draft.message = '可以继续编辑，确认内容后再发送。';
  updateDetailReplyComposer();
  draft.card.querySelector('.detail-reply-input').focus({ preventScroll: true });
}

function bindDetailReplyComposer(target) {
  if (target.dataset.composeBound) return;
  target.dataset.composeBound = '1';
  target.addEventListener('click', function (event) {
    if (event.defaultPrevented || (event.button != null && event.button !== 0) || !event.target || typeof event.target.closest !== 'function') return;
    var action = event.target.closest('[data-comment-compose]');
    if (action && target.contains(action)) {
      if (action.disabled) return;
      var kind = action.getAttribute('data-comment-compose');
      if (kind === 'send') submitDetailReply();
      else if (kind === 'cancel') resetDetailReplyComposer(true);
      else if (kind === 'refresh') refreshDetailReplyComposer();
      else if (kind === 'confirm-unsent') confirmDetailReplyUnsent();
      else if (kind === 'open') openDetailReplyComposer(action.getAttribute('data-compose-key'), action.closest('[data-comment-reply-target]'));
      return;
    }
    if (event.target.closest('button, a, input, textarea, select, label, [contenteditable], [role="button"], .comment-like, .detail-reply-compose')) return;
    if (typeof window.getSelection === 'function' && String(window.getSelection()).trim()) return;
    var row = event.target.closest('[data-comment-reply-target]');
    if (row && !row.classList.contains('comment-reply-item') && event.target.closest('.comment-replies-panel')) return;
    if (row && target.contains(row)) openDetailReplyComposer(row.getAttribute('data-comment-reply-target'), row);
  });
  target.addEventListener('input', function (event) {
    if (detailReplyDraft && event.target === detailReplyDraft.card.querySelector('.detail-reply-input')) {
      if (!detailReplyDraft.unknown) detailReplyDraft.message = '';
      updateDetailReplyComposer();
    }
  });
  target.addEventListener('compositionstart', function (event) {
    if (detailReplyDraft && detailReplyDraft.card.contains(event.target)) detailReplyDraft.composing = true;
  });
  target.addEventListener('compositionend', function (event) {
    if (detailReplyDraft && detailReplyDraft.card.contains(event.target)) detailReplyDraft.composing = false;
  });
  target.addEventListener('keydown', function (event) {
    var draft = detailReplyDraft;
    if (!draft || !draft.card.contains(event.target) || event.defaultPrevented || event.isComposing || event.keyCode === 229 || draft.composing) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!draft.sending) resetDetailReplyComposer(true);
    } else if (event.target === draft.card.querySelector('.detail-reply-input') && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); event.stopPropagation(); submitDetailReply();
    }
  });
}

if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('provider-auth-session-changed', function (event) {
  var provider = event.detail && event.detail.provider;
  if (detailReplyDraft && detailReplyDraft.owner.config.provider === provider) resetDetailReplyComposer();
  detailReplyWriteLedger.forEach(function (attempt, identity) {
    if (attempt.auth.provider === provider) detailReplyWriteLedger.delete(identity);
  });
});
