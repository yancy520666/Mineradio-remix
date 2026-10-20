'use strict';
// Song comment lists from the platforms' current comment services. The older
// list endpoints (Netease comment_music, QQ fcg_global_comment_h5) never report
// reply counts, so the reply threads under a comment could not be offered.
const { comment_new } = require('NeteaseCloudMusicApi');
const { mapNeteaseComment, safeVipIcon } = require('./comment-replies-api');

// Cursors are opaque to the renderer: {p: next page number, c: platform cursor}.
function readCursor(text, platformCursor) {
  if (!text) return null;
  let value;
  try { value = JSON.parse(text); } catch (_) { throw new Error('Invalid comment cursor'); }
  if (!value || !Number.isSafeInteger(value.p) || value.p < 1 || value.p > 100000 || !platformCursor.test(String(value.c))) {
    throw new Error('Invalid comment cursor');
  }
  return value;
}

// Each category uses exactly one upstream order. Recommendation is Netease's
// default (sortType 1 is translated to 99 by the installed API client).
async function handleNeteaseCommentPage(id, cookie, limit, cursorText, sort = 'recommend') {
  if (!/^\d+$/.test(String(id || ''))) throw new Error('Missing Netease song id');
  const byHot = sort === 'hot';
  const cursorShape = byHot ? /^normalHot#\d{1,7}$/ : /^\d{1,20}$/;
  const cursor = readCursor(cursorText, cursorShape);
  const pageNo = cursor ? cursor.p : 1;
  const sortType = byHot ? 2 : (sort === 'latest' ? 3 : 1);
  const result = await comment_new({ type: 0, id, sortType, pageNo, pageSize: limit,
    ...(cursor ? { cursor: cursor.c } : {}), cookie, timestamp: Date.now() });
  const body = result.body || result;
  if (Number(body.code) !== 200 || !body.data || !Array.isArray(body.data.comments)) throw new Error('NETEASE_COMMENTS_UNAVAILABLE');
  const data = body.data;
  const comments = data.comments.map(c => ({ ...mapNeteaseComment(c), isHot: false })).filter(c => c.content);
  // Recommendation pages are offset-based in comment_new. Its response time
  // cursor may repeat when the service includes the same recommended entries.
  const next = sortType === 1 ? String(pageNo * limit)
    : (cursorShape.test(String(data.cursor || '')) ? String(data.cursor) : '');
  const hasMore = data.hasMore === true && data.comments.length > 0 && !!next && (!cursor || next !== String(cursor.c));
  return { provider: 'netease', id: String(id), total: Number(data.totalCount) || 0, comments,
    nextCursor: hasMore ? JSON.stringify({ p: pageNo + 1, c: next }) : '', hasMore };
}

function qqVip(raw) {
  return { icon: safeVipIcon(raw.VipIcon), level: 0 };
}

function mapQQListComment(raw, isHot) {
  return {
    id: String(raw.CmId || ''),
    content: String(raw.Content || ''),
    likedCount: Math.max(0, Number(raw.PraiseNum) || 0),
    liked: Number(raw.IsPraised) === 1,
    replyCount: Math.max(0, Number(raw.ReplyCnt) || 0),
    time: (Number(raw.PubTime) || 0) * 1000,
    isHot,
    // QQ may boost editorial/pinned entries above the popularity ranking.
    // Keep those visible in their own section, without changing the rank cursor.
    isFeatured: isHot && (Number(raw.State) === 4 || Number(raw.HotScore) > Math.max(0, Number(raw.PraiseNum) || 0)),
    vip: qqVip(raw),
    user: { id: String(raw.EncryptUin || ''), nickname: String(raw.Nick || ''), avatar: String(raw.Avatar || '') },
  };
}

async function handleQQCommentPage(songId, limit, cursorText, request, sort) {
  if (!/^\d+$/.test(String(songId || ''))) throw new Error('Missing QQ song id');
  const cursor = readCursor(cursorText, /^\d{0,24}$/);
  const pageNum = cursor ? cursor.p : 0;
  // The service rejects pages larger than 25 (code 10000).
  const pageSize = Math.max(1, Math.min(25, Number(limit) || 20));
  const base = { BizType: 1, BizId: String(songId), PicEnable: 1 };
  const byHot = sort === 'hot';
  const payload = { comm: { ct: 24, cv: 0 },
    latest: byHot
      ? { module: 'music.globalComment.CommentRead', method: 'GetHotCommentList',
        param: { ...base, LastCommentSeqNo: cursor ? String(cursor.c) : '', PageNum: pageNum, PageSize: pageSize, HotType: 1, WithAirborne: 0 } }
      : { module: 'music.globalComment.CommentRead', method: 'GetNewCommentList',
        param: { ...base, LastCommentSeqNo: cursor ? String(cursor.c) : '', PageNum: pageNum, PageSize: pageSize, FromCommentId: '', WithHot: 0 } } };
  const result = await request(payload, { cookie: true });
  const list = key => {
    const response = result && result[key];
    const data = response && response.data && response.data.CommentList;
    if (!response || Number(response.code) !== 0 || !data || !Array.isArray(data.Comments)) throw new Error('QQ_COMMENTS_UNAVAILABLE');
    return data;
  };
  const latest = list('latest');
  const comments = latest.Comments.map(c => mapQQListComment(c, byHot))
    .filter(c => c.id && c.content);
  const last = latest.Comments[latest.Comments.length - 1];
  const next = last && /^\d{1,24}$/.test(String(last.SeqNo || '')) ? String(last.SeqNo) : '';
  const hasMore = Number(latest.HasMore) === 1 && latest.Comments.length > 0 && !!next && (!cursor || next !== String(cursor.c));
  return { provider: 'qq', id: String(songId), total: Number(latest.Total) || 0, comments,
    nextCursor: hasMore ? JSON.stringify({ p: pageNum + 1, c: next }) : '', hasMore };
}

module.exports = { handleNeteaseCommentPage, handleQQCommentPage };
