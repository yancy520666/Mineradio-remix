'use strict';
const { comment_floor } = require('NeteaseCloudMusicApi');

// Member badges are platform images; only their own hosts are passed on.
const VIP_ICON_HOST = /^(?:[a-z0-9-]+\.)*(?:music\.126\.net|126\.net|y\.qq\.com|gtimg\.cn)$/i;
function safeVipIcon(value) {
  let url;
  try { url = new URL(String(value || '')); } catch (_) { return ''; }
  if (!/^https?:$/.test(url.protocol) || !VIP_ICON_HOST.test(url.hostname)) return '';
  url.protocol = 'https:';
  return url.toString();
}

function neteaseVip(user) {
  const rights = user && user.vipRights;
  if (!rights) return null;
  const level = Math.max(0, Math.min(10, Number(rights.redVipLevel) || 0));
  const icon = safeVipIcon(rights.associator && rights.associator.rights && rights.associator.iconUrl)
    || safeVipIcon(rights.musicPackage && rights.musicPackage.rights && rights.musicPackage.iconUrl);
  return icon || level ? { icon, level } : null;
}

function mapNeteaseComment(raw) {
  const count = raw.replyCount ?? (raw.showFloorComment && raw.showFloorComment.replyCount);
  const quoted = Array.isArray(raw.beReplied) && raw.beReplied[0];
  return { id: String(raw.commentId || ''), content: raw.content || '',
    likedCount: Number(raw.likedCount) || 0, liked: raw.liked === true, time: Number(raw.time) || 0,
    replyCount: count == null ? null : Math.max(0, Number(count) || 0),
    replyTo: quoted && quoted.user ? String(quoted.user.nickname || '') : '',
    replyToId: quoted && quoted.beRepliedCommentId != null ? String(quoted.beRepliedCommentId) : '',
    vip: neteaseVip(raw.user),
    user: raw.user ? { id: raw.user.userId, nickname: raw.user.nickname || '', avatar: raw.user.avatarUrl || '' } : null };
}

async function handleNeteaseReplies(id, parentId, cookie, limit, cursor) {
  const result = await comment_floor({ type: 0, id, parentCommentId: parentId,
    limit, time: cursor || -1, cookie, timestamp: Date.now() });
  const body = result.body || result;
  if (Number(body.code) !== 200 || !body.data || !Array.isArray(body.data.comments)) throw new Error('NETEASE_REPLIES_UNAVAILABLE');
  const data = body.data;
  // Replies to the thread's own comment need no "回复 …" prefix; replies to another reply keep it.
  const comments = data.comments.map(mapNeteaseComment).filter(c => c.content && c.id !== String(parentId))
    .map(c => (c.replyToId === String(parentId) ? { ...c, replyTo: '' } : c));
  const nextCursor = String(data.time || (data.comments.length && data.comments[data.comments.length - 1].time) || '');
  return { comments, total: Number(data.totalCount) || 0, nextCursor,
    hasMore: data.hasMore === true && comments.length > 0 && !!nextCursor && nextCursor !== String(cursor || '') };
}

async function handleQQReplies(parentId, limit, cursor, request) {
  const previous = cursor ? JSON.parse(cursor) : { seq: '', rank: '', page: 0 };
  if (!/^[0-9]*$/.test(String(previous.seq)) || !/^[0-9.]*$/.test(String(previous.rank))
    || !Number.isSafeInteger(previous.page) || previous.page < 0) throw new Error('Invalid QQ reply cursor');
  const result = await request({ req: { module: 'music.globalComment.CommentRead', method: 'GetReplyCommentList',
    param: { RootCmId: parentId, LastCommentSeqNo: previous.seq, LastRankScore: previous.rank,
      PageSize: limit, PageNum: previous.page, RankType: 1, PicEnable: 1 } } }, { cookie: true });
  const response = result && result.req;
  const data = response && response.data;
  const list = data && data.CommentList;
  if (!response || Number(response.code) !== 0 || !data || Number(data.SubCode || 0) !== 0
    || !list || !Array.isArray(list.Comments)) throw new Error('QQ_REPLIES_UNAVAILABLE');
  const comments = list.Comments.map(raw => ({ id: String(raw.CmId || ''), content: raw.Content || '',
    time: (Number(raw.PubTime) || 0) * 1000, likedCount: Number(raw.PraiseNum) || 0, liked: Number(raw.IsPraised) === 1,
    vip: { icon: safeVipIcon(raw.VipIcon), level: 0 },
    replyTo: raw.RepliedComments && raw.RepliedComments[0] ? String(raw.RepliedComments[0].Nick || '') : '',
    user: { id: raw.EncryptUin || '', nickname: raw.Nick || '', avatar: raw.Avatar || '' },
  })).filter(c => c.content && c.id !== String(parentId));
  const last = list.Comments[list.Comments.length - 1];
  const nextCursor = last ? JSON.stringify({ seq: String(last.SeqNo || ''), rank: String(last.RankScore || ''), page: previous.page + 1 }) : '';
  return { comments, total: Number(list.Total) || 0, nextCursor,
    hasMore: Number(list.HasMore) === 1 && comments.length > 0 && !!last.SeqNo && String(last.SeqNo) !== previous.seq };
}

module.exports = { mapNeteaseComment, handleNeteaseReplies, handleQQReplies, safeVipIcon };
