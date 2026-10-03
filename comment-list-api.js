'use strict';
// Song comment lists from the platforms' current comment services. The older
// list endpoints (Netease comment_music, QQ fcg_global_comment_h5) never report
// reply counts, so the reply threads under a comment could not be offered.
const { comment_new } = require('NeteaseCloudMusicApi');
const { mapNeteaseComment, safeVipIcon } = require('./comment-replies-api');

const HOT_PAGE_SIZE = 10;

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

async function handleNeteaseCommentPage(id, cookie, limit, cursorText) {
  if (!/^\d+$/.test(String(id || ''))) throw new Error('Missing Netease song id');
  const cursor = readCursor(cursorText, /^\d{1,20}$/);
  const pageNo = cursor ? cursor.p : 1;
  const request = (sortType, pageSize, extra) => comment_new({ type: 0, id, sortType, pageNo, pageSize, ...extra,
    cookie, timestamp: Date.now() }).then(result => {
    const body = result.body || result;
    if (Number(body.code) !== 200 || !body.data || !Array.isArray(body.data.comments)) throw new Error('NETEASE_COMMENTS_UNAVAILABLE');
    return body.data;
  });
  // Hot comments once, on the first page; everything after is newest-first by cursor.
  const [hot, latest] = await Promise.all([
    cursor ? null : request(2, HOT_PAGE_SIZE, {}),
    request(3, limit, cursor ? { cursor: cursor.c } : {}),
  ]);
  const comments = (hot ? hot.comments.map(c => ({ ...mapNeteaseComment(c), isHot: true })) : [])
    .concat(latest.comments.map(c => ({ ...mapNeteaseComment(c), isHot: false })))
    .filter(c => c.content);
  const next = /^\d{1,20}$/.test(String(latest.cursor || '')) ? String(latest.cursor) : '';
  const hasMore = latest.hasMore === true && latest.comments.length > 0 && !!next && (!cursor || next !== String(cursor.c));
  return { provider: 'netease', id: String(id), total: Number(latest.totalCount) || 0, comments,
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
    vip: qqVip(raw),
    user: { id: String(raw.EncryptUin || ''), nickname: String(raw.Nick || ''), avatar: String(raw.Avatar || '') },
  };
}

async function handleQQCommentPage(songId, limit, cursorText, request) {
  if (!/^\d+$/.test(String(songId || ''))) throw new Error('Missing QQ song id');
  const cursor = readCursor(cursorText, /^\d{0,24}$/);
  const pageNum = cursor ? cursor.p : 0;
  // The service rejects pages larger than 25 (code 10000).
  const pageSize = Math.max(1, Math.min(25, Number(limit) || 20));
  const base = { BizType: 1, BizId: String(songId), PicEnable: 1 };
  const payload = { comm: { ct: 24, cv: 0 },
    latest: { module: 'music.globalComment.CommentRead', method: 'GetNewCommentList',
      param: { ...base, LastCommentSeqNo: cursor ? String(cursor.c) : '', PageNum: pageNum, PageSize: pageSize, FromCommentId: '', WithHot: 0 } } };
  if (!cursor) {
    payload.hot = { module: 'music.globalComment.CommentRead', method: 'GetHotCommentList',
      param: { ...base, LastCommentSeqNo: '', PageNum: 0, PageSize: HOT_PAGE_SIZE, HotType: 1, WithAirborne: 0 } };
  }
  const result = await request(payload, { cookie: true });
  const list = key => {
    const response = result && result[key];
    const data = response && response.data && response.data.CommentList;
    if (!response || Number(response.code) !== 0 || !data || !Array.isArray(data.Comments)) throw new Error('QQ_COMMENTS_UNAVAILABLE');
    return data;
  };
  const latest = list('latest');
  const hot = cursor ? null : list('hot');
  const comments = (hot ? hot.Comments.map(c => mapQQListComment(c, true)) : [])
    .concat(latest.Comments.map(c => mapQQListComment(c, false)))
    .filter(c => c.id && c.content);
  const last = latest.Comments[latest.Comments.length - 1];
  const next = last && /^\d{1,24}$/.test(String(last.SeqNo || '')) ? String(last.SeqNo) : '';
  const hasMore = Number(latest.HasMore) === 1 && latest.Comments.length > 0 && !!next && (!cursor || next !== String(cursor.c));
  return { provider: 'qq', id: String(songId), total: Number(latest.Total) || 0, comments,
    nextCursor: hasMore ? JSON.stringify({ p: pageNum + 1, c: next }) : '', hasMore };
}

module.exports = { handleNeteaseCommentPage, handleQQCommentPage };
