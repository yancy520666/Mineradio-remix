'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const kugou = require('../kugou-api');

function withRequests(handler, task) {
  const original = https.request;
  const calls = [];
  kugou.clearKugouSessionCaches();
  https.request = (target, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    let written = '';
    request.write = chunk => { written += String(chunk || ''); };
    request.destroy = error => process.nextTick(() => request.emit('error', error));
    request.end = () => {
      const call = { url: new URL(target), options, body: written };
      calls.push(call);
      Promise.resolve().then(() => handler(call)).then(result => {
        const response = new EventEmitter();
        response.statusCode = result.statusCode || 200;
        response.headers = {};
        callback(response);
        process.nextTick(() => {
          response.emit('data', Buffer.from(typeof result.body === 'string' ? result.body : JSON.stringify(result.body)));
          response.emit('end');
        });
      }).catch(error => request.emit('error', error));
    };
    return request;
  };
  return Promise.resolve().then(() => task(calls)).finally(() => {
    https.request = original;
    kugou.clearKugouSessionCaches();
  });
}

const memberCookie = 'userid=123; token=fixture-token; kg_mid=fixture-mid; kg_dfid=fixture-dfid';
function membershipResponse() {
  return { body: { role: 13, rawVipEndTime: '2099-12-31 23:59:59' } };
}
function songResponse(extra) {
  return { body: { status: 1, err_code: 0, data: { play_url: 'https://audio.kugou.test/full.mp3', bitrate: 128, is_free_part: 0, ...extra } } };
}

test('current official songinfo route includes the H5 signature and stable web UUID', async () => {
  await withRequests(({ url }) => {
    assert.equal(url.hostname, 'wwwapi.kugou.com');
    assert.equal(url.pathname, '/play/songinfo');
    const params = Object.fromEntries(url.searchParams);
    const signature = params.signature;
    delete params.signature;
    const salt = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
    const expected = crypto.createHash('md5').update(salt + Object.keys(params).sort().map(key => key + '=' + params[key]).join('') + salt).digest('hex');
    assert.equal(signature, expected);
    assert.equal(params.uuid, params.mid);
    assert.equal(params.album_audio_id, '42');
    assert.equal(params.platid, '4');
    return songResponse();
  }, async calls => {
    const result = await kugou.handleKugouSongUrl({ hash: 'free-song', albumAudioId: '42' }, '');
    assert.equal(result.playable, true);
    assert.equal(result.trial, false);
    assert.equal(result.playbackSource, 'web');
    assert.equal(calls.length, 1);
  });
});

test('transport and non-JSON failures reach the official retry host instead of breaking fallback', async () => {
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.hostname === 'wwwapi.kugou.com') return { body: '<html>temporarily unavailable</html>' };
    if (url.hostname === 'wwwapiretry.kugou.com') return songResponse();
    throw new Error('ECONNRESET');
  }, async calls => {
    const result = await kugou.handleKugouSongUrl({ hash: 'member-fallback-song', fee: 1 }, memberCookie);
    assert.equal(result.playable, true);
    assert.equal(result.trial, false);
    assert(calls.some(call => call.url.hostname === 'wwwapiretry.kugou.com'));
    assert(calls.every(call => call.url.protocol === 'https:'), 'session credentials must use HTTPS');
  });
});

test('official previews stay marked as previews in both fresh and cached responses', async () => {
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.pathname === '/play/songinfo') return songResponse({ is_free_part: 1 });
    return { body: { status: 0, error_code: 20018 } };
  }, async calls => {
    const params = { hash: 'preview-song', fee: 1 };
    const first = await kugou.handleKugouSongUrl(params, memberCookie);
    const count = calls.length;
    const cached = await kugou.handleKugouSongUrl(params, memberCookie);
    assert.equal(first.playable, true);
    assert.equal(first.trial, true);
    assert.equal(cached.trial, true);
    assert.equal(calls.length, count);
  });
});

test('a full authorized fallback can replace a preview without relabeling preview audio', async () => {
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.pathname === '/play/songinfo') return songResponse({ is_free_part: 1 });
    if (url.pathname === '/app/i/getSongInfo.php') return { body: { status: 1, url: 'https://audio.kugou.test/full-mobile.mp3', is_free_part: 0 } };
    return { body: { status: 0 } };
  }, async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'full-fallback-song', fee: 1 }, memberCookie);
    assert.equal(result.url, 'https://audio.kugou.test/full-mobile.mp3');
    assert.equal(result.trial, false);
  });
});

test('URL arrays select one valid address and failed gateway payloads cannot authorize audio', async () => {
  assert.equal(kugou._test.pickKugouPlayUrl({ data: { url: ['', 'javascript:bad', 'https://audio.kugou.test/a.mp3', 'https://audio.kugou.test/b.mp3'] } }), 'https://audio.kugou.test/a.mp3');
  assert.equal(kugou._test.pickKugouPlayUrl({ data: { url: [], play_backup_url: ['https://audio.kugou.test/backup.mp3'] } }), 'https://audio.kugou.test/backup.mp3');
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.pathname === '/play/songinfo') return { body: { status: 0, err_code: 30022 } };
    return { body: { status: 0, url: ['https://audio.kugou.test/denied.mp3'] } };
  }, async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'client-only-song', fee: 1 }, memberCookie);
    assert.equal(result.url, '');
    assert.equal(result.playable, false);
    assert.equal(result.reason, 'client_only');
  });
});

test('upstream errors are distinct from non-membership and official security challenges are preserved', async () => {
  await withRequests(() => ({ body: { status: 0, error_code: 20018 } }), async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'unavailable-song' }, '');
    assert.equal(result.reason, 'url_unavailable');
  });
  await withRequests(({ url }) => ({ body: { status: 0, err_code: url.pathname === '/play/songinfo' ? 30020 : 0 } }), async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'challenge-song' }, '');
    assert.equal(result.reason, 'verification_required');
  });
});

test('an official challenge stops all endpoint and quality fallbacks and retains its URL and upstream code', async () => {
  const verificationUrl = 'https://verify.kugou.com/security/challenge?ticket=fixture-ticket';
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    assert.equal(url.pathname, '/v5/url', 'no alternative playback route may follow the challenge');
    return { body: { status: 0, err_code: 30020, data: { verify_url: verificationUrl } } };
  }, async calls => {
    const params = { hash: 'challenge-stop', sqHash: 'challenge-stop-sq', quality: 'lossless', fee: 1 };
    const first = await kugou.handleKugouSongUrl(params, memberCookie);
    assert.equal(first.playable, false);
    assert.equal(first.url, '');
    assert.equal(first.reason, 'verification_required');
    assert.equal(first.verificationUrl, verificationUrl);
    assert.equal(first.upstreamCode, 30020);
    assert.equal(first.restriction.verificationUrl, verificationUrl);
    assert.equal(first.restriction.upstreamCode, 30020);
    assert.equal(calls.filter(call => call.url.pathname !== '/recharge/roleinfo').length, 1);
    await kugou.handleKugouSongUrl(params, memberCookie);
    assert.equal(calls.filter(call => call.url.pathname !== '/recharge/roleinfo').length, 2, 'challenges are not cached; a completed official verification can be retried');
  });
});

test('a security challenge wins over an earlier official preview and JSON HTTP failures preserve challenges', async () => {
  for (const statusCode of [200, 403]) {
    const verificationUrl = 'https://www.kugou.com/verify?ticket=fixture';
    await withRequests(({ url }) => {
      if (url.pathname === '/recharge/roleinfo') return membershipResponse();
      if (url.pathname === '/v5/url') return songResponse({ is_free_part: 1 });
      assert.equal(url.hostname, 'wwwapi.kugou.com');
      return { statusCode, body: { status: 0, data: { error_code: 30020, challenge: { url: verificationUrl } } } };
    }, async calls => {
      const result = await kugou.handleKugouSongUrl({ hash: 'preview-then-challenge', fee: 1 }, memberCookie);
      assert.equal(result.playable, false);
      assert.equal(result.url, '');
      assert.equal(result.reason, 'verification_required');
      assert.equal(result.verificationUrl, verificationUrl);
      assert.equal(result.upstreamCode, 30020);
      assert.equal(calls.filter(call => call.url.pathname !== '/recharge/roleinfo').length, 2);
    });
  }
});

test('clear upstream verification messages and structured challenge links cannot be mistaken for audio URLs', async () => {
  const verificationUrl = 'https://captcha.kugou.com/security?ticket=fixture';
  for (const body of [
    { status: 1, data: { error_code: 41001, msg: '请先完成安全验证', url: verificationUrl } },
    { status: 1, data: { challenge: { url: verificationUrl } } },
    { status: 1, data: { verification_required: true, redirect_url: verificationUrl } },
  ]) {
    await withRequests(() => ({ body }), async calls => {
      const result = await kugou.handleKugouSongUrl({ hash: 'structured-challenge' }, '');
      assert.equal(result.playable, false);
      assert.equal(result.reason, 'verification_required');
      assert.equal(result.verificationUrl, verificationUrl);
      assert.equal(calls.length, 1);
    });
  }
  const ordinary = kugou._test.kugouPlaybackRestriction({ status: 0, data: { url: verificationUrl, msg: '登录凭证过期' } }, {});
  assert.equal(ordinary.category, 'login_required', 'an ordinary URL or login message alone is not a security challenge');
  assert.equal(ordinary.verificationUrl, undefined);
});

test('missing and unsafe challenge URLs retain verification state without inventing a destination', async () => {
  for (const verificationUrl of [
    undefined, '', 'http://verify.kugou.com/challenge', '//verify.kugou.com/challenge',
    'https://kugou.com.attacker.test/challenge', 'https://fakekugou.com/challenge',
    'https://verify.kugou.com@attacker.test/challenge', 'https://user:secret@verify.kugou.com/challenge',
    'https://verify.kugou.com:8443/challenge', 'javascript:alert(1)',
  ]) {
    await withRequests(() => ({ body: { status: 0, err_code: 30020, data: { verificationUrl } } }), async calls => {
      const result = await kugou.handleKugouSongUrl({ hash: 'invalid-challenge' }, '');
      assert.equal(result.reason, 'verification_required');
      assert.equal(result.verificationUrl, '');
      assert.equal(result.restriction.verificationUrl, '');
      assert.equal(result.upstreamCode, 30020);
      assert.equal(calls.length, 1);
    });
  }
  const ambiguous = kugou._test.kugouPlaybackRestriction({
    err_code: 30020, verify_url: 'https://attacker.test/challenge', data: { url: 'https://www.kugou.com/audio.mp3' },
  }, {});
  assert.equal(ambiguous.verificationUrl, '', 'an unsafe explicit challenge must not be replaced by an unrelated generic URL');
  const nested = kugou._test.kugouPlaybackRestriction({ error_data: { error_code: 30020, verification: { redirect_url: 'https://kugou.com/verify' } } }, {});
  assert.equal(nested.verificationUrl, 'https://kugou.com/verify');
});

test('unknown or stale membership waits for verification without claiming non-membership or requesting paid audio', async () => {
  for (const stale of [false, true]) {
    await withRequests(() => ({ body: { status: 1, data: {} } }), async calls => {
      if (stale) {
        const auth = kugou.extractKugouAuth(memberCookie);
        kugou._test.stabilizeKugouVipProbe(kugou._test.kugouVipCacheKey(auth), {
          data: { userid: auth.userid, is_vip: true, vip_end_time: Math.floor(Date.now() / 1000) + 3600 },
        }, auth);
      }
      const result = await kugou.handleKugouSongUrl({ hash: 'pending-member-song', fee: 1 }, memberCookie);
      assert.equal(result.reason, 'membership_unknown');
      assert.equal(result.playable, false);
      assert.equal(result.url, '');
      assert.equal(result.membershipStale, stale);
      assert(!calls.some(call => ['/v5/url', '/play/songinfo', '/app/i/getSongInfo.php'].includes(call.url.pathname)));
    });
  }
});

test('login profile challenges preserve identity, deny playback readiness and stop membership probing', async () => {
  const verificationUrl = 'https://verify.kugou.com/profile?ticket=fixture';
  for (const responseKind of ['gateway-object', 'http-string', 'error-code', 'success-envelope']) {
    let challenged = true;
    await withRequests(({ url }) => {
      if (!challenged) {
        if (url.pathname === '/recharge/roleinfo') return membershipResponse();
        return { body: { status: 1, data: { info: [] } } };
      }
      assert.equal(url.pathname, '/v7/get_all_list');
      if (responseKind === 'error-code') {
        const error = new Error('Official security challenge');
        error.upstreamCode = 30020;
        throw error;
      }
      return {
        statusCode: responseKind === 'http-string' ? 403 : 200,
        body: { status: responseKind === 'success-envelope' ? 1 : 0, error_code: 30020, data: { verify_url: verificationUrl } },
      };
    }, async calls => {
      const status = await kugou.getKugouLoginInfo(memberCookie);
      assert.equal(status.loggedIn, true);
      assert.equal(status.userId, '123');
      assert.equal(status.hasToken, true);
      assert.equal(status.playbackReady, false);
      assert.equal(status.playbackKeyReady, false);
      assert.equal(status.verificationRequired, true);
      assert.equal(status.error, 'KUGOU_VERIFICATION_REQUIRED');
      assert.equal(status.upstreamCode, 30020);
      assert.equal(status.restriction.category, 'verification_required');
      assert.equal(status.verificationUrl, responseKind === 'error-code' ? '' : verificationUrl);
      assert.equal(status.membershipKnown, false);
      assert.equal(status.membershipRights.canPlayVipTracks, false);
      assert.equal(calls.length, 1);
      challenged = false;
      const recovered = await kugou.getKugouLoginInfo(memberCookie);
      assert.equal(recovered.verificationRequired, undefined);
      assert.equal(recovered.playbackReady, true);
      assert.equal(recovered.isVip, true);
      assert.equal(calls.length, 3, 'profile challenges must not be cached as a successful empty profile');
    });
  }
});

test('web, primary and fallback VIP challenges survive login and stop subsequent probes without caching', async () => {
  const cookie = memberCookie + '; nickname=fixture user; avatar=https://www.kugou.com/fixture-avatar.jpg';
  const verificationUrl = 'https://captcha.kugou.com/member?ticket=fixture';
  for (const stage of ['web', 'primary', 'fallback']) {
    let challenged = true;
    await withRequests(({ url }) => {
      if (!challenged) return membershipResponse();
      const target = stage === 'web' ? '/recharge/roleinfo' : stage === 'primary' ? '/v1/get_union_vip' : '/v1/vipuser_sub';
      if (url.pathname === target) return { body: { status: 0, err_code: 30020, data: { challenge_url: verificationUrl } } };
      if (url.pathname === '/recharge/roleinfo') return { body: { status: 1, data: {} } };
      assert.equal(url.pathname, '/v1/get_union_vip');
      return { body: { status: 1, data: { userid: '123', is_vip: false, vip_type: 0 } } };
    }, async calls => {
      const status = await kugou.getKugouLoginInfo(cookie);
      assert.equal(status.loggedIn, true);
      assert.equal(status.playbackReady, false);
      assert.equal(status.verificationRequired, true);
      assert.equal(status.verificationUrl, verificationUrl);
      assert.equal(status.upstreamCode, 30020);
      assert.equal(status.membershipKnown, false, 'the earlier ordinary response cannot replace a verification challenge');
      assert.equal(calls.length, stage === 'web' ? 1 : stage === 'primary' ? 2 : 3);
      const count = calls.length;
      challenged = false;
      const recovered = await kugou.getKugouLoginInfo(cookie);
      assert.equal(recovered.verificationRequired, undefined);
      assert.equal(recovered.playbackReady, true);
      assert.equal(recovered.isVip, true);
      assert.equal(calls.length, count + 1, 'an explicit retry rechecks roleinfo instead of reusing challenge/unknown cache');
    });
  }
});

test('VIP probes are sequential and transport failures never become security verification', async () => {
  const cookie = memberCookie + '; nickname=fixture; avatar=https://www.kugou.com/avatar.jpg';
  let active = 0;
  let maximumActive = 0;
  await withRequests(async ({ url }) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      if (url.pathname === '/recharge/roleinfo') throw new Error('ECONNRESET');
      if (url.pathname === '/v1/get_union_vip') throw new Error('Request timeout');
      if (url.pathname === '/v1/vipuser_sub') return { body: { status: 1, data: { userid: '123', is_vip: true, vip_end_time: 4102444800 } } };
      throw new Error('unexpected probe');
    } finally { active -= 1; }
  }, async calls => {
    const status = await kugou.getKugouLoginInfo(cookie);
    assert.equal(status.loggedIn, true);
    assert.equal(status.verificationRequired, undefined);
    assert.equal(status.isVip, true);
    assert.equal(maximumActive, 1);
    assert.deepEqual(calls.map(call => call.url.pathname), ['/recharge/roleinfo', '/v1/get_union_vip', '/v1/vipuser_sub']);
  });
});

test('membership security challenges also terminate playback before any audio request', async () => {
  await withRequests(({ url }) => {
    assert.equal(url.pathname, '/recharge/roleinfo');
    return { statusCode: 403, body: { err_code: 30020, verify_url: 'https://verify.kugou.com/rights?ticket=fixture' } };
  }, async calls => {
    const result = await kugou.handleKugouSongUrl({ hash: 'member-probe-challenge', fee: 1 }, memberCookie);
    assert.equal(result.playable, false);
    assert.equal(result.reason, 'verification_required');
    assert.equal(result.verificationRequired, true);
    assert.equal(result.verificationUrl, 'https://verify.kugou.com/rights?ticket=fixture');
    assert.equal(result.upstreamCode, 30020);
    assert.equal(result.playbackReady, false);
    assert.equal(calls.length, 1);
  });
});

test('search failures are rejected and not cached as an empty successful search', async () => {
  await withRequests(() => ({ body: { status: 0, error_code: 500 } }), async calls => {
    await assert.rejects(kugou.handleKugouSearch('fixture search', 3, '', 0), { code: 'KUGOU_SEARCH_UNAVAILABLE' });
    await assert.rejects(kugou.handleKugouSearch('fixture search', 3, '', 0), { code: 'KUGOU_SEARCH_UNAVAILABLE' });
    assert.equal(calls.length, 2);
  });
});

test('search offsets cross page boundaries without returning preceding tracks', async () => {
  await withRequests(({ url }) => {
    const page = Number(url.searchParams.get('page'));
    const size = Number(url.searchParams.get('pagesize'));
    return { body: { status: 1, data: { lists: Array.from({ length: size }, (_, index) => ({ FileHash: 'hash-' + ((page - 1) * size + index), SongName: 'song-' + ((page - 1) * size + index) })) } } };
  }, async calls => {
    const result = await kugou.handleKugouSearch('page test', 3, '', 2);
    assert.deepEqual(result.map(song => song.hash), ['hash-2', 'hash-3', 'hash-4']);
    assert.deepEqual(calls.map(call => call.url.searchParams.get('page')), ['1', '2']);
  });
});

test('Cookie object helpers preserve login identity and lyrics decode official base64 content', async () => {
  const cookie = { userid: '123', token: 'fixture-token' };
  assert.equal(kugou.kugouCookieUserId(cookie), '123');
  assert.equal(kugou.kugouCookieHasLogin(cookie), true);
  assert.equal(kugou.kugouCookieHasPlayback(cookie), true);
  await withRequests(({ url }) => url.pathname === '/search'
    ? { body: { candidates: [{ id: 'lyric-id', accesskey: 'fixture-access' }] } }
    : { body: { content: Buffer.from('[00:01.00]测试歌词').toString('base64') } }, async () => {
    const result = await kugou.handleKugouLyric('lyric-hash', '42', 180);
    assert.equal(result.lyric, '[00:01.00]测试歌词');
  });
});

test('personal-library failures retain an explicit upstream code and are retried instead of cached as empty', async () => {
  let count = 0;
  await withRequests(({ options }) => {
    assert.equal(options.headers['Content-Type'], 'application/json');
    return ++count === 1
      ? { body: { status: 0, error_code: 20017 } }
      : { body: { status: 1, data: { info: { self: [{ listid: '5', name: 'fixture list' }] } } } };
  }, async calls => {
    const failed = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(failed.libraryReady, false);
    assert.equal(failed.upstreamCode, 20017);
    assert.equal(failed.error, 'KUGOU_GATEWAY_FAILED');
    const recovered = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(recovered.libraryReady, true);
    assert.equal(recovered.playlists.length, 1);
    assert.equal(calls.length, 2);
  });
});

test('malformed personal-library and track payloads cannot become successful cached empty libraries', async () => {
  await withRequests(() => ({ body: { status: 1, data: {} } }), async calls => {
    const library = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(library.libraryReady, false);
    assert.equal(library.error, 'KUGOU_PLAYLIST_RESPONSE_INVALID');
    for (let attempt = 0; attempt < 2; attempt++) {
      const tracks = await kugou.handleKugouPlaylistTracks('5', memberCookie);
      assert.equal(tracks.error, 'KUGOU_PLAYLIST_TRACKS_RESPONSE_INVALID');
    }
    assert.equal(calls.length, 3);
  });
});

test('personal library reads every page, not just the first 50 playlists', async () => {
  // A library of 120 lists (created + collected) arrives 50 per page.
  await withRequests(call => {
    const page = JSON.parse(call.body || '{}').page || 1;
    const start = (page - 1) * 50;
    const info = Array.from({ length: Math.max(0, Math.min(50, 120 - start)) }, (_, i) => ({ listid: String(start + i + 1), name: 'list ' + (start + i + 1), type: i % 2 }));
    return { body: { status: 1, data: { info, list_count: 120 } } };
  }, async calls => {
    const library = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(library.libraryReady, true);
    assert.equal(library.playlists.length, 120);
    assert.equal(new Set(library.playlists.map(pl => pl.id)).size, 120);
    assert.equal(library.partial, false);
    assert.deepEqual(calls.map(call => JSON.parse(call.body).page).sort(), [1, 2, 3]);
  });
});

test('failed later pages retain loaded playlists and retry to a complete library', async () => {
  let fail = true;
  await withRequests(call => {
    const page = JSON.parse(call.body).page;
    if (page === 2 && fail) throw new Error('fixture page failure');
    const start = (page - 1) * 50;
    return { body: { status: 1, data: { list_count: 120, info: Array.from({ length: Math.min(50, 120 - start) }, (_, i) => ({ listid: String(start + i + 1), name: 'list ' + i })) } } };
  }, async () => {
    const partial = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(partial.playlists.length, 70);
    assert.equal(partial.total, 120);
    assert.equal(partial.libraryReady, false);
    assert.equal(partial.partial, true);
    assert.equal(partial.pageLimited, false);
    assert.equal(partial.error, 'KUGOU_PLAYLIST_PAGE_FAILED');
    fail = false;
    const recovered = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(recovered.playlists.length, 120);
    assert.equal(recovered.libraryReady, true);
    assert.equal(recovered.partial, false);
    assert.equal(recovered.error, '');
  });
});

test('page limit is explicit with or without totals, but a known complete final page succeeds', async () => {
  for (const total of [2050, 0, 2000]) {
    await withRequests(call => {
      const start = (JSON.parse(call.body).page - 1) * 50;
      return { body: { status: 1, data: { list_count: total, info: Array.from({ length: 50 }, (_, i) => ({ listid: String(start + i + 1), name: 'list ' + i })) } } };
    }, async calls => {
      const library = await kugou.handleKugouUserPlaylists(memberCookie);
      const limited = total !== 2000;
      assert.equal(calls.length, 40);
      assert.equal(library.playlists.length, 2000);
      assert.equal(library.libraryReady, !limited);
      assert.equal(library.partial, limited);
      assert.equal(library.pageLimited, limited);
      assert.equal(library.error, limited ? 'KUGOU_PLAYLIST_PAGE_LIMIT' : '');
    });
  }
});

test('cloudlist connection rejection stays a failure with an explicit recovery action', async () => {
  await withRequests(() => ({ body: { status: 0, error_code: 20017 } }), async () => {
    const r = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(r.libraryReady, false);
    assert.equal(r.reconnectRequired, true);
    assert.equal(r.upstreamCode, 20017);
    assert.equal(r.loggedIn, true);
    assert.equal(r.error, 'KUGOU_GATEWAY_FAILED');
  });
});


test('cloudlist library and created-list tracks use the Android contract, retaining failure codes', async () => {
  await withRequests(call => {
    const params = Object.fromEntries(call.url.searchParams);
    const signature = params.signature;
    delete params.signature;
    assert.equal(params.appid, '1005');
    assert.equal(params.uuid, '-');
    assert.equal(params.clienttime.length, 10, 'cloudlist uses seconds, not H5 milliseconds');
    assert.equal(call.options.headers['x-router'], 'cloudlist.service.kugou.com');
    const salt = 'OIlwieks28dk2k092lksi2UIkp';
    const expected = crypto.createHash('md5').update(salt + Object.keys(params).sort().map(key => key + '=' + params[key]).join('') + call.body + salt).digest('hex');
    assert.equal(signature, expected, 'Android signing includes the exact JSON request body');
    if (call.url.pathname === '/v7/get_all_list') {
      return { body: { status: 1, data: { list_count: 2, info: { self: [{ listid: 11, name: 'created' }], collect: [{ listid: 12, name: 'collected' }] } } } };
    }
    return { body: { status: 0, error_code: 20017 } };
  }, async calls => {
    const library = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(library.libraryReady, true);
    assert.deepEqual(library.playlists.map(p => p.name).sort(), ['collected', 'created']);
    const tracks = await kugou.handleKugouPlaylistTracks('11', memberCookie);
    assert.equal(tracks.upstreamCode, 20017);
    assert.equal(calls.length, 2);
  });
});

test('Android tracker signs all parameters and does not request an unnecessary preview', async () => {
  await withRequests(({ url }) => {
    const params = Object.fromEntries(url.searchParams);
    const signature = params.signature; delete params.signature;
    const expected = kugou._test.signatureAndroidParams(params, '');
    assert.equal(signature, expected);
    assert.equal(params.clientver, '11430'); assert.equal(params.IsFreePart, '0');
    assert.equal(params.page_id, '151369488');
    return songResponse();
  }, async () => {
    const response = await kugou._test.kugouPlayViaGateway('signed', '1', '2', memberCookie, 'standard', { isVip: false }, 1000);
    assert.equal(response.trial, false);
  });
});
