'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { handleKugouComments, handleKugouDailyRecommendations, handleKugouReplies } = require('../kugou-community-api');
const { kugouGatewayRequest } = require('../kugou-api');
const cookie = 'userid=123; token=fixture-token; kg_mid=fixture-mid';

async function withRequests(handler, task) {
  const original = https.request;
  const calls = [];
  https.request = (url, options, callback) => {
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.write = () => {};
    req.destroy = error => process.nextTick(() => req.emit('error', error));
    req.end = () => {
      const call = { url: new URL(url), options };
      calls.push(call);
      Promise.resolve().then(() => handler(call)).then(json => {
        const res = new EventEmitter(); res.statusCode = 200;
        callback(res);
        process.nextTick(() => { res.emit('data', Buffer.from(JSON.stringify(json))); res.emit('end'); });
      }).catch(error => req.emit('error', error));
    };
    return req;
  };
  try { await task(calls); } finally { https.request = original; }
}

const raw = id => ({ id, content: '内容 ' + id, addtime: '2026-10-02 15:49:11',
  like: { count: 42 }, user_id: 7, user_name: '听众', user_pic: 'https://example.test/avatar.jpg' });
test('Kugou resolves the public comment resource, separates hot/newest and paginates only newest', async () => {
  await withRequests(({ url, options }) => {
    assert.equal(options.method, 'POST');
    assert(url.searchParams.has('signature'));
    if (url.pathname.endsWith('/cmtlist')) return { status: 1, childrenid: '100', count: 35, list: [raw(1)] };
    assert.equal(url.searchParams.get('childrenid'), '100');
    if (url.pathname.endsWith('/topliked')) return { status: 1, list: [raw(1)] };
    const start = url.searchParams.get('p') === '1' ? 0 : 30;
    return { status: 1, count: 35, list: Array.from({ length: start ? 5 : 30 }, (_, i) => raw(start + i)) };
  }, async calls => {
    const first = await handleKugouComments('300', '', 30, 0);
    assert.equal(first.comments.length, 31);
    assert.equal(first.comments[0].isHot, true);
    assert.equal(first.comments[1].isHot, false);
    assert.equal(first.comments[0].likedCount, 42);
    assert.equal(first.comments[0].time, Date.parse('2026-10-02T15:49:11+08:00'));
    assert.equal(first.hasMore, true);
    const last = await handleKugouComments('300', '', 30, 30);
    assert.equal(last.comments.length, 5);
    assert(last.comments.every(c => !c.isHot));
    assert.equal(last.hasMore, false);
    assert.equal(calls.filter(c => c.url.pathname.endsWith('/cmtlist')).length, 1);
    assert.equal(calls.filter(c => c.url.pathname.endsWith('/topliked')).length, 1);
    assert.equal(calls.at(-1).url.searchParams.get('p'), '2');
  });
});

test('Kugou daily preserves the full real-schema list, metadata and quality hashes', async () => {
  await withRequests(({ url, options }) => {
    assert.equal(url.pathname, '/everyday_song_recommend');
    assert.equal(url.searchParams.get('platform'), 'ios');
    assert.equal(options.headers['x-router'], 'everydayrec.service.kugou.com');
    const list = Array.from({ length: 30 }, (_, i) => ({ songname: '歌曲 ' + i,
      author_name: '歌手', hash: 'hash-' + i, mixsongid: String(100 + i),
      sizable_cover: 'https://example.test/{size}/cover.jpg', time_length: 122,
      hash_320: 'hq', hash_flac: 'sq', privilege: 10, album_name: '专辑' }));
    return { status: 1, error_code: 0, data: { song_list: [...list, list[0]] } };
  }, async () => {
    const result = await handleKugouDailyRecommendations(cookie);
    assert.equal(result.songs.length, 30);
    assert.equal(result.songs[0].name, '歌曲 0');
    assert.equal(result.songs[0].artist, '歌手');
    assert.equal(result.songs[0].duration, 122000);
    assert.equal(result.songs[0].cover, 'https://example.test/240/cover.jpg');
    assert.equal(result.songs[0].mixSongId, '100');
    assert.equal(result.songs[0].hqHash, 'hq');
    assert.equal(result.songs[0].sqHash, 'sq');
    assert.equal(result.songs[0].fee, 1);
    assert.equal(result.mode, 'daily');
  });
});

test('daily requires login while anonymous access stays limited to public comment routes', async () => {
  await withRequests(() => { throw new Error('Must not contact upstream'); }, async calls => {
    assert.equal((await handleKugouDailyRecommendations('')).error, 'KUGOU_AUTH_REQUIRED');
    await assert.rejects(kugouGatewayRequest('/v1/modify_list', {}), /KUGOU_AUTH_REQUIRED/);
    await assert.rejects(handleKugouComments('hash-only', ''), /mixsongid/);
    assert.equal(calls.length, 0);
  });
});

test('daily failures remain errors and never masquerade as an empty daily list', async () => {
  await withRequests(() => ({ status: 1, error_code: 20028 }), async () => {
    await assert.rejects(handleKugouDailyRecommendations(cookie), /KUGOU_DAILY_UNAVAILABLE/);
  });
  await withRequests(() => ({ status: 1, data: {} }), async () => {
    await assert.rejects(handleKugouDailyRecommendations(cookie), /INVALID_RESPONSE/);
  });
});

test('Kugou floor replies use the original resource and stop at comments_num', async () => {
  await withRequests(({ url }) => {
    assert.equal(url.pathname, '/mcomment/v1/hot_replylist');
    assert.equal(url.searchParams.get('childrenid'), '100');
    assert.equal(url.searchParams.get('tid'), '200');
    assert.equal(url.searchParams.get('p'), '2');
    return { status: 1, comments_num: 21, list: [raw(300)] };
  }, async () => {
    const result = await handleKugouReplies('300', '200', '100', '', 20, 20);
    assert.equal(result.comments[0].id, '300');
    assert.equal(result.total, 21);
    assert.equal(result.hasMore, false);
  });
});
