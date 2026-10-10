'use strict';

const crypto = require('crypto');
// Application limit, matching the existing comment composer. Platform maxima
// are not documented by the reviewed protocol implementations.
const MAX_REPLY_LENGTH = 280;
const WRITE_TIMEOUT_MS = 9000;
const COMMENT_REPLY_CAPABILITIES = Object.freeze({ netease: true, qq: true, kugou: true, qishui: false });
const UNKNOWN_MESSAGE = '发送结果尚未确认，请先刷新评论查看，避免重复发送。';
const NUMERIC_ID = /^[1-9]\d{0,29}$/;
const QQ_COMMENT_ID = /^[A-Za-z0-9!.*_-]{1,256}$/;
const QQ_MID = /^(?=.*[A-Za-z])[A-Za-z0-9]{10,32}$/;

function replyError(error, message, status = 400, code) {
  return Object.assign(new Error(message), { replyError: error, replyMessage: message, replyStatus: status,
    ...(Number.isSafeInteger(code) ? { upstreamCode: code } : {}) });
}
function identifier(value) {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : '';
}
function validateCommentReply(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw replyError('INVALID_REPLY_REQUEST', '回复参数不完整。');
  const provider = body.provider;
  if (typeof provider !== 'string' || !Object.hasOwn(COMMENT_REPLY_CAPABILITIES, provider)) throw replyError('INVALID_REPLY_PROVIDER', '评论平台无效。');
  if (!COMMENT_REPLY_CAPABILITIES[provider]) throw replyError('COMMENT_REPLY_UNSUPPORTED', '当前平台暂不支持发送回复。', 501);
  const input = { provider, id: identifier(body.id), parentId: identifier(body.parentId),
    commentId: identifier(body.commentId), resource: identifier(body.resource), content: '' };
  const commentShape = provider === 'qq' ? QQ_COMMENT_ID : NUMERIC_ID;
  if (!(provider === 'qq' ? NUMERIC_ID.test(input.id) || QQ_MID.test(input.id) : NUMERIC_ID.test(input.id))
      || !commentShape.test(input.parentId) || !commentShape.test(input.commentId)
      || provider === 'kugou' && !NUMERIC_ID.test(input.resource)) {
    throw replyError('INVALID_REPLY_IDENTIFIERS', '回复目标已失效，请刷新评论后重新选择。');
  }
  if (typeof body.content !== 'string') throw replyError('INVALID_REPLY_CONTENT', '请输入回复内容。');
  input.content = body.content.trim();
  if (!input.content || input.content.length > MAX_REPLY_LENGTH
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.content)
      || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input.content)) {
    throw replyError('INVALID_REPLY_CONTENT', '回复需为 1–280 个字符。');
  }
  return input;
}
function parseCookie(cookie) {
  const result = Object.create(null);
  String(cookie || '').split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  });
  return result;
}
function qqAuth(cookie) {
  const values = parseCookie(cookie);
  const rawId = values.wxopenid || Number(values.login_type) === 2
    ? values.wxuin || values.uin || values.qqmusic_uin : values.qqmusic_uin || values.uin || values.wxuin;
  const uin = String(rawId || '').replace(/^o0*/, '').replace(/^0+/, '');
  const key = values.qm_keyst || values.qqmusic_key || values.music_key || values.wxskey || '';
  return { uin, key };
}
function requireReplyAuth(input, cookie, dependencies) {
  const values = parseCookie(cookie);
  const ready = input.provider === 'netease' ? !!values.MUSIC_U
    : input.provider === 'qq' ? NUMERIC_ID.test(qqAuth(cookie).uin) && !!qqAuth(cookie).key
      : dependencies.extractKugouAuth(cookie).playbackReady === true;
  if (!ready) throw replyError('LOGIN_REQUIRED', '请先登录当前音乐平台，再发送回复。', 401);
}
function ackId(value) {
  const text = identifier(value);
  return /^[A-Za-z0-9!.*_-]{1,256}$/.test(text) ? text : '';
}

async function postNeteaseReply(input, cookie, dependencies) {
  // Installed MIT module provides the resource/reply mapping; use our bounded
  // one-shot transport instead of the package transport's unbounded timeout.
  const comment = require('NeteaseCloudMusicApi/module/comment');
  const result = await comment({ t: 2, type: 0, id: input.id, commentId: input.commentId,
    content: input.content, cookie: parseCookie(cookie) }, async (path, data, options) => {
    if (path !== '/api/resource/comments/reply' || options.crypto !== 'weapi') throw new Error('Unsupported reply protocol');
    const weapi = dependencies.weapi || require('NeteaseCloudMusicApi/util/crypto').weapi;
    const encrypted = weapi({ ...data, csrf_token: parseCookie(cookie).__csrf || '', e_r: false });
    const body = new URLSearchParams(encrypted).toString();
    return dependencies.requestJson('https://music.163.com/weapi/resource/comments/reply', {
      method: 'POST', timeoutMs: WRITE_TIMEOUT_MS,
      headers: { Cookie: cookie, Referer: 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body) },
    }, body);
  });
  if (!result || !Number.isSafeInteger(Number(result.code))) throw new Error('Invalid reply acknowledgement');
  const code = Number(result.code);
  if (code !== 200) throw replyError('COMMENT_REPLY_REJECTED', '网易云未接受这条回复，请检查登录状态和内容。', 422, code);
  return { replyId: ackId(result.comment && result.comment.commentId || result.commentId) };
}

async function postQQReply(input, cookie, dependencies) {
  // GPL-3.0 protocol reference: L-1124/QQMusicApi, modules/comment.py.
  // RepliedCmId is the clicked target, not RootCmId (used only for reading).
  const auth = qqAuth(cookie);
  let hash = 5381;
  for (let index = 0; index < auth.key.length; index++) hash += (hash << 5) + auth.key.charCodeAt(index);
  hash &= 0x7fffffff;
  const result = await dependencies.qqRequest({
    comm: { ct: 24, cv: 4747474, platform: 'yqq.json', uin: auth.uin,
      g_tk: hash, g_tk_new_20200303: hash, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8' },
    req: { module: 'music.globalComment.CommentWriteServer', method: 'AddComment',
      param: { Content: input.content, BizType: 1, BizId: input.id, RepliedCmId: input.commentId } },
  }, { cookie, timeoutMs: WRITE_TIMEOUT_MS });
  const reply = result && result.req;
  if (result && Number.isSafeInteger(result.code) && result.code !== 0
      || reply && Number.isSafeInteger(reply.code) && reply.code !== 0) {
    throw replyError('COMMENT_REPLY_REJECTED', 'QQ 音乐未接受这条回复，请检查登录状态和内容。', 422,
      reply && reply.code || result.code);
  }
  const data = reply && reply.data;
  if (!reply || reply.code !== 0 || !data || !Number.isSafeInteger(data.SubCode)) throw new Error('Invalid reply acknowledgement');
  if (data.SubCode !== 0) throw replyError(data.VerifyUrl ? 'COMMENT_REPLY_VERIFICATION_REQUIRED' : 'COMMENT_REPLY_REJECTED',
    data.VerifyUrl ? 'QQ 音乐要求安全验证，请先在官方客户端完成验证。' : 'QQ 音乐未接受这条回复，请检查登录状态和内容。', 422, data.SubCode);
  const replyId = ackId(data.AddedCmId);
  if (!replyId) throw new Error('Missing reply acknowledgement');
  return { replyId };
}

async function postKugouReply(input, cookie, dependencies) {
  // Minimal mapping independently written from MakcRe/KuGouMusicApi:
  // module/_comment.js: buildCommentReplyConfig; util/helper.js: signParamsKey.
  // The current reference LICENSE is MIT (Copyright (c) 2023 MakcRe).
  const auth = dependencies.extractKugouAuth(cookie);
  const clienttime = Math.floor((dependencies.now || Date.now)() / 1000);
  const top = input.parentId === input.commentId;
  const key = crypto.createHash('md5').update(`1005OIlwieks28dk2k092lksi2UIkp20489${clienttime}${auth.mid}`).digest('hex');
  const url = new URL('https://gateway.kugou.com/index.php');
  const params = { r: 'commentsv2/reply', code: 'fc4be23b4e972707f36b8a828a93ba8a', childrenid: input.resource,
    kugouid: auth.userid, clienttoken: auth.token, ver: 6, appid: 1005, clientver: 20489,
    mid: auth.mid, clienttime, key, uuid: '-', dfid: auth.dfid || '-', content: input.content,
    tid: input.parentId, pid: top ? '0' : input.commentId, is_t: top ? 1 : 0 };
  if (input.resourceName) params.childrenname = input.resourceName;
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  const result = await dependencies.requestJson(url.toString(), { method: 'POST', timeoutMs: WRITE_TIMEOUT_MS,
    headers: { Cookie: cookie, Referer: 'https://www.kugou.com/',
      'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi',
      'x-router': 'm.comment.service.kugou.com', dfid: auth.dfid || '-', mid: auth.mid, clienttime: String(clienttime),
      'kg-rc': '1', 'kg-thash': '5d816a0', 'kg-rec': '1', 'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F' },
  });
  if (!result || ![0, 1].includes(Number(result.status))) throw new Error('Invalid reply acknowledgement');
  const codeValue = result.error_code ?? result.err_code ?? result.errcode;
  const code = codeValue == null ? 0 : Number(codeValue);
  if (!Number.isSafeInteger(code)) throw new Error('Invalid reply acknowledgement');
  if (Number(result.status) === 0 || code !== 0) throw replyError(code === 20028 ? 'COMMENT_REPLY_VERIFICATION_REQUIRED' : 'COMMENT_REPLY_REJECTED',
    code === 20028 ? '酷狗要求安全验证，请先在官方客户端完成验证。' : '酷狗未接受这条回复，请检查登录状态和内容。', 422, code);
  return { replyId: ackId(result.data && (result.data.id || result.data.comment_id || result.data.cid) || result.id || result.cid) };
}

function replyFailure(input, error, writeStarted) {
  const known = !!(error && error.replyError);
  const outcome = writeStarted && !known ? 'unknown' : 'rejected';
  return { status: known ? error.replyStatus : (writeStarted ? 502 : 400), payload: {
    provider: input && input.provider || '', created: false, success: false, outcome,
    error: known ? error.replyError : (writeStarted ? 'COMMENT_REPLY_RESULT_UNKNOWN' : 'INVALID_REPLY_REQUEST'),
    message: known ? error.replyMessage : (writeStarted ? UNKNOWN_MESSAGE : '回复暂时无法发送，请刷新评论后重试。'),
    ...(known && Number.isSafeInteger(error.upstreamCode) ? { code: error.upstreamCode } : {}),
  } };
}

async function handleCommentReply(body, session, dependencies) {
  let input;
  let writeStarted = false;
  try {
    input = validateCommentReply(body);
    if (!dependencies.isCurrent(session)) throw replyError('ACCOUNT_SESSION_CHANGED', '账号已切换，请重新选择回复目标。', 409);
    requireReplyAuth(input, session.cookie, dependencies);
    if (input.provider === 'qq' && !NUMERIC_ID.test(input.id)) {
      try { input.id = identifier(await dependencies.resolveQQSongId(input.id)); }
      catch (_) { throw replyError('COMMENT_SONG_UNAVAILABLE', '无法确认歌曲，请刷新评论后重试。', 422); }
      if (!NUMERIC_ID.test(input.id)) throw replyError('COMMENT_SONG_UNAVAILABLE', '无法确认歌曲，请刷新评论后重试。', 422);
    }
    if (input.provider === 'kugou' && dependencies.resolveKugouResourceName) {
      try { input.resourceName = await dependencies.resolveKugouResourceName(input, session.cookie); }
      catch (_) { throw replyError('COMMENT_RESOURCE_UNAVAILABLE', '无法确认评论楼层，请刷新评论后重试。', 422); }
    }
    if (!dependencies.isCurrent(session)) throw replyError('ACCOUNT_SESSION_CHANGED', '账号已切换，请重新选择回复目标。', 409);
    writeStarted = true;
    // Each branch sends exactly one write. Network failures, moderation and
    // verification never cause refresh/re-login, alternative endpoints or retries.
    const result = input.provider === 'netease' ? await postNeteaseReply(input, session.cookie, dependencies)
      : input.provider === 'qq' ? await postQQReply(input, session.cookie, dependencies)
        : await postKugouReply(input, session.cookie, dependencies);
    if (!dependencies.isCurrent(session)) return { status: 409, payload: { provider: input.provider,
      created: false, success: false, outcome: 'unknown', error: 'ACCOUNT_SESSION_CHANGED', message: UNKNOWN_MESSAGE } };
    return { status: 200, payload: { provider: input.provider, id: input.id, parentId: input.parentId,
      commentId: input.commentId, created: true, success: true, outcome: 'created', ...result } };
  } catch (error) { return replyFailure(input, error, writeStarted); }
}

module.exports = { COMMENT_REPLY_CAPABILITIES, MAX_REPLY_LENGTH, validateCommentReply, replyFailure,
  postNeteaseReply, postQQReply, postKugouReply, handleCommentReply };
