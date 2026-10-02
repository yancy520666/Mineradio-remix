'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const qishui = require('../qishui-api');

const cookie = 'sessionid=seo-test-session; sid_tt=seo-test-session';
const audioUrl = 'https://media.example/public.m4a';

function mockRequests(t, handler) {
  const original = https.request;
  https.request = (target, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.write = () => {};
    request.destroy = error => request.emit('error', error);
    request.end = () => Promise.resolve().then(() => handler(new URL(target), options)).then(result => {
      const response = new EventEmitter();
      response.statusCode = result.statusCode || 200;
      response.headers = {};
      callback(response);
      response.emit('data', Buffer.from(typeof result.body === 'string' ? result.body : JSON.stringify(result.body)));
      response.emit('end');
    }).catch(error => request.emit('error', error));
    return request;
  };
  t.after(() => { https.request = original; });
}

function fixtures(url, options, settings = {}) {
  if (url.pathname === '/luna/pc/track_v2') return { body: '' };
  if (url.pathname === '/luna/pc/me') return { body: settings.expired
    ? { status_code: 1000016, status_info: { status_msg: '登录状态已失效，请重新登录' } }
    : { data: { my_info: { id: 'fixture-user' }, is_vip: !!settings.vip } } };
  if (url.pathname === '/luna/h5/seo_track') {
    assert.equal(options.headers.Cookie, undefined, 'public catalog must not receive account credentials');
    return { body: {
      seo_track: { track: { id: settings.wrongId || 'fixture', duration: settings.fullDuration ?? 240000, preview: { duration: 30000 } } },
      track_player: { url_player_info: settings.playerUrl || 'https://vod-luna.douyin.com/player-info' },
    } };
  }
  if (url.pathname === '/player-info') {
    assert.equal(url.hostname, 'vod-luna.douyin.com');
    assert.equal(options.headers.Cookie, undefined, 'public VOD must not receive account credentials');
    return { body: { Result: { Data: { PlayInfoList: [{
      MainPlayUrl: audioUrl, Duration: settings.duration ?? 239.8,
      Format: 'm4a', Bitrate: settings.bitrate || 128000,
    }] } } } };
  }
  throw new Error('Unexpected endpoint: ' + url.pathname);
}

test.beforeEach(() => qishui._test.clearQishuiRuntimeCaches());

test('empty PC responses recover full public audio despite misleading preview metadata', async t => {
  mockRequests(t, (url, options) => fixtures(url, options));
  const result = await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie);
  assert.equal(result.playable, true);
  assert.equal(result.url, audioUrl);
  assert.equal(result.source, 'qishui-seo');
  assert.equal(result.loggedIn, true);
  assert.equal(result.trial, false);
  assert.equal(result.duration, 240);
});

test('public 60-second audio remains a trial for both free and VIP accounts', async t => {
  for (const vip of [false, true]) {
    await t.test(vip ? 'VIP account' : 'free account', async child => {
      qishui._test.clearQishuiRuntimeCaches();
      mockRequests(child, (url, options) => fixtures(url, options, { vip, duration: 60.001 }));
      const result = await qishui.handleQishuiSongUrl({ id: 'fixture', fee: 1 }, cookie);
      assert.equal(result.playable, true);
      assert.equal(result.trial, true);
      assert.equal(result.duration, 60);
      assert.equal(result.fullDuration, 240);
      assert.equal(result.isVip, vip);
      assert.equal(result.membershipKnown, true);
      assert.match(result.message, /60 秒试听/);
      // Exercise the actual renderer banner with a VIP response.
      const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/13-playback-start-audio.js'), 'utf8');
      const start = source.indexOf('      if (data.trial) {');
      const end = source.indexOf("      markPlayPhase('audio-element');", start);
      const elements = {
        'trial-text': {}, 'trial-login-btn': { style: {} },
        'trial-banner': { classList: { add(value) { this.added = value; } } },
      };
      vm.runInNewContext(source.slice(start, end), {
        data: result, isQishuiPlayback: true, playbackProvider: 'qishui',
        document: { getElementById: id => elements[id] },
      });
      assert.equal(elements['trial-text'].textContent, result.message);
      assert.doesNotMatch(elements['trial-text'].textContent, /SVIP|购买/);
      assert.equal(elements['trial-banner'].classList.added, 'show');
    });
  }
});

test('short full songs are not trials, while 30-second excerpts and the duration tolerance are respected', async t => {
  for (const [fullDuration, duration, trial] of [[29000, 28.5, false], [240000, 30, true], [32000, 30, false], [33000, 30, true]]) {
    await t.test(`${fullDuration}/${duration}`, async child => {
      qishui._test.clearQishuiRuntimeCaches();
      mockRequests(child, (url, options) => fixtures(url, options, { fullDuration, duration }));
      const result = await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie);
      assert.equal(result.playable, true); assert.equal(result.trial, trial);
    });
  }
});

test('failed public requests retry and successful public audio is reused', async t => {
  let seoCalls = 0, vodCalls = 0;
  mockRequests(t, (url, options) => {
    if (url.pathname === '/luna/h5/seo_track' && ++seoCalls === 1) return { statusCode: 503, body: {} };
    if (url.pathname === '/player-info') vodCalls++;
    return fixtures(url, options, { vip: true });
  });
  const failed = await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie);
  assert.equal(failed.playable, false);
  assert.equal(failed.reason, 'source_unavailable');
  assert.equal(failed.loggedIn, true);
  assert.equal(failed.isVip, true, 'playback failure must not erase verified membership');
  assert.equal((await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie)).playable, true);
  assert.equal((await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie)).playable, true);
  assert.equal(seoCalls, 2);
  assert.equal(vodCalls, 1);
});

test('expired login stops before public playback fallback', async t => {
  mockRequests(t, (url, options) => {
    assert.doesNotMatch(url.pathname, /seo_track|player-info/);
    return fixtures(url, options, { expired: true });
  });
  const result = await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie);
  assert.equal(result.reason, 'login_required');
  assert.equal(result.reauthRequired, true);
});

test('mismatched songs, unsafe VOD targets, unknown durations and disallowed quality fail closed', async t => {
  for (const settings of [
    { wrongId: 'other-song' }, { playerUrl: 'http://127.0.0.1/private' },
    { duration: 0 }, { bitrate: 999000 },
  ]) {
    await t.test(JSON.stringify(settings), async child => {
      qishui._test.clearQishuiRuntimeCaches();
      mockRequests(child, (url, options) => fixtures(url, options, settings));
      const result = await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie);
      assert.equal(result.playable, false);
      assert.equal(result.url, '');
      assert.equal(result.reason, 'source_unavailable');
    });
  }
});

test('successful PC playback keeps its existing source and never calls public fallback', async t => {
  mockRequests(t, (url, options) => {
    assert.doesNotMatch(url.pathname, /seo_track|player-info/);
    if (url.pathname === '/luna/pc/track_v2') return { body: { data: { track: {
      id: 'fixture', duration: 240000,
      audio_info: { play_info_list: [{ MainPlayUrl: audioUrl, Duration: 240, Format: 'm4a', Bitrate: 128000 }] },
    } } } };
    return fixtures(url, options);
  });
  const result = await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie);
  assert.equal(result.playable, true);
  assert.equal(result.source, 'qishui-pc-track-v2');
  assert.equal(result.trial, false);
});

test('unsafe public player origins are rejected before requesting an otherwise valid audio response', async t => {
  const targets = [
    'https://attacker.invalid/player-info',
    'https://vod-luna.douyin.com.attacker.invalid/player-info',
    'http://vod-luna.douyin.com/player-info',
    'https://fixture:secret@vod-luna.douyin.com/player-info',
    'https://vod-luna.douyin.com:444/player-info',
    'https://127.0.0.1/player-info',
  ];
  for (const playerUrl of targets) {
    await t.test(playerUrl, async child => {
      qishui._test.clearQishuiRuntimeCaches();
      let playerRequests = 0;
      mockRequests(child, (url, options) => {
        if (url.pathname === '/player-info') {
          playerRequests++;
          // The hostile endpoint would return usable audio. The mock itself
          // must not enforce the production URL boundary or mask its removal.
          return { body: { Result: { Data: { PlayInfoList: [{
            MainPlayUrl: audioUrl, Duration: 239.8, Format: 'm4a', Bitrate: 128000,
          }] } } } };
        }
        return fixtures(url, options, { playerUrl });
      });
      const result = await qishui.handleQishuiSongUrl({ id: 'fixture' }, cookie);
      assert.equal(result.playable, false);
      assert.equal(result.url, '');
      assert.equal(playerRequests, 0, 'unsafe VOD URL must be rejected before any request');
    });
  }
});
