'use strict';

// Protocol reference: https://github.com/MakcRe/KuGouMusicApi (GPL-3.0).
const { kugouGatewayRequest, mapKugouPlaylistTrack, extractKugouAuth } = require('./kugou-api');
const commentResources = new Map();

function commentResponse(json) {
  if (!json || Number(json.err_code || json.error_code || 0)) throw new Error('KUGOU_COMMENTS_UNAVAILABLE');
  return json.data || json;
}

function mapKugouComment(raw, isHot) {
  const date = raw.addtime || raw.time || 0;
  const numeric = Number(date);
  const time = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : Date.parse(String(date).replace(' ', 'T') + '+08:00');
  return {
    id: String(raw.id || raw.comment_id || raw.tid || ''),
    replyCount: Math.max(0, Number(raw.reply_num || 0) || 0),
    replyResource: String(raw.special_child_id || ''),
    isHot,
    content: String(raw.content || ''),
    likedCount: Number(raw.like && typeof raw.like === 'object' ? raw.like.count : raw.like || raw.like_count || raw.likes || 0) || 0,
    time: Number.isFinite(time) ? time : 0,
    user: { id: String(raw.user_id || raw.userid || ''),
      nickname: String(raw.user_name || raw.nickname || raw.username || '酷狗用户'),
      avatar: String(raw.user_pic || raw.avatar || '') },
  };
}

async function handleKugouComments(id, cookie, limit = 30, offset = 0) {
  if (!/^\d+$/.test(String(id || ''))) throw new Error('Missing Kugou mixsongid');
  limit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 30)));
  offset = Math.max(0, Math.floor(Number(offset) || 0));
  const params = { ver: 6, mixsongid: String(id),
      p: Math.floor(offset / limit) + 1, pagesize: limit, need_show_image: 1,
      show_classify: 1, show_hotword_list: 1, extdata: '0',
      code: 'fc4be23b4e972707f36b8a828a93ba8a' };
  let resource = commentResources.get(String(id));
  if (!resource || Date.now() - resource.at > 60 * 60 * 1000) {
    const lookup = await kugouGatewayRequest('/mcomment/v1/cmtlist', {
      cookie, method: 'POST', params: { ...params, p: 1, pagesize: 1 },
    });
    const lookupData = commentResponse(lookup);
    const childrenid = lookupData.childrenid || (lookupData.list && lookupData.list[0] && lookupData.list[0].special_child_id);
    if (!/^\d+$/.test(String(childrenid || ''))) throw new Error('KUGOU_COMMENT_RESOURCE_MISSING');
    resource = { childrenid: String(childrenid), at: Date.now() };
    if (commentResources.size >= 100) commentResources.delete(commentResources.keys().next().value);
    commentResources.set(String(id), resource);
  }
  params.childrenid = resource.childrenid;
  const [json, hotJson] = await Promise.all([
    kugouGatewayRequest('/mcomment/r/v1/rank/newest', { cookie, method: 'POST', params }),
    !offset ? kugouGatewayRequest('/mcomment/r/v1/rank/topliked', {
      cookie, method: 'POST', params: { ...params, p: 1, pagesize: 10 },
    }) : Promise.resolve(null),
  ]);
  const data = commentResponse(json);
  const hotData = hotJson && commentResponse(hotJson);
  if (!Array.isArray(data.list) || (hotData && !Array.isArray(hotData.list))) throw new Error('KUGOU_COMMENTS_INVALID_RESPONSE');
  const normal = data.list;
  const hot = hotData ? hotData.list : [];
  const total = Number(data.count || data.total || 0) || 0;
  const nextOffset = offset + limit;
  const more = data.has_more == null ? data.hasMore : data.has_more;
  const hasMore = normal.length > 0 && (more == null
    ? (total > 0 ? nextOffset < total : normal.length >= limit)
    : more === true || more === 1 || more === '1');
  return { provider: 'kugou', id: String(id), total, nextOffset, hasMore,
    comments: hot.map(c => mapKugouComment(c, true)).concat(normal.map(c => mapKugouComment(c, false)))
      .filter(c => c.content) };
}

async function handleKugouDailyRecommendations(cookie) {
  if (!extractKugouAuth(cookie).playbackReady) return {
    provider: 'kugou', loggedIn: false, songs: [], error: 'KUGOU_AUTH_REQUIRED', message: '请先连接酷狗账号，再读取每日推荐。',
  };
  const json = await kugouGatewayRequest('/everyday_song_recommend', {
    cookie, method: 'POST', params: { platform: 'ios' }, router: 'everydayrec.service.kugou.com',
  });
  if (!json || Number(json.err_code || json.error_code || 0)) throw new Error('KUGOU_DAILY_UNAVAILABLE');
  const data = json.data || json;
  const list = Array.isArray(data) ? data : (data.song_list || data.songlist || data.list || data.songs);
  if (!Array.isArray(list)) throw new Error('KUGOU_DAILY_INVALID_RESPONSE');
  const seen = new Set();
  const songs = list.map(raw => mapKugouPlaylistTrack({ ...raw,
    name: raw.songname || raw.name || raw.filename,
    SingerName: raw.author_name || raw.SingerName,
    cover: raw.sizable_cover || raw.cover,
    duration: raw.time_length || raw.duration,
    HQFileHash: raw.hash_320 || raw.HQFileHash,
    SQFileHash: raw.hash_flac || raw.hash_ape || raw.SQFileHash,
  })).filter(song => {
    const key = song.hash || song.mixSongId;
    if (!song.name || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { provider: 'kugou', loggedIn: true, songs, mode: 'daily', updatedAt: Date.now() };
}

async function handleKugouReplies(id, parentId, resource, cookie, limit = 20, offset = 0) {
  if (![id, parentId, resource].every(value => /^\d+$/.test(String(value || '')))) throw new Error('Missing Kugou reply identifiers');
  limit = Math.max(1, Math.min(30, Number(limit) || 20));
  offset = Math.max(0, Number(offset) || 0);
  const json = await kugouGatewayRequest('/mcomment/v1/hot_replylist', {
    cookie, method: 'POST', params: { childrenid: String(resource), mixsongid: String(id),
      tid: String(parentId), p: Math.floor(offset / limit) + 1, pagesize: limit,
      need_show_image: 1, code: 'fc4be23b4e972707f36b8a828a93ba8a' },
  });
  const data = commentResponse(json);
  if (!Array.isArray(data.list)) throw new Error('KUGOU_REPLIES_INVALID_RESPONSE');
  const comments = data.list.map(c => mapKugouComment(c, false)).filter(c => c.content && c.id !== String(parentId));
  const total = Number(data.comments_num || data.count || data.total || 0) || 0;
  const nextOffset = offset + limit;
  return { comments, total, nextOffset, hasMore: data.list.length > 0 && (total ? nextOffset < total : data.list.length >= limit) };
}

module.exports = { handleKugouComments, handleKugouDailyRecommendations, handleKugouReplies };
