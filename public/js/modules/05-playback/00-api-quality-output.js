// ============================================================
async function apiJson(url, opts) {
  opts = opts || {};
  var timeoutMs = Number(opts.timeoutMs) || 0;
  var fetchOpts = Object.assign({}, opts);
  delete fetchOpts.timeoutMs;
  var timer = null;
  var timedOut = false;
  var externalSignal = null;
  var forwardAbort = null;
  if (timeoutMs && window.AbortController) {
    // A caller's cancel signal and the timeout both abort the same request.
    var controller = new AbortController();
    externalSignal = fetchOpts.signal || null;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else {
        forwardAbort = function () { controller.abort(); };
        externalSignal.addEventListener('abort', forwardAbort);
      }
    }
    fetchOpts.signal = controller.signal;
    timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
  }
  try {
    var res = await fetch(url, fetchOpts);
    if (res.status >= 500) throw new Error('HTTP ' + res.status + ' 服务暂时不可用');
    return await res.json();
  } catch (err) {
    if (timedOut && !(externalSignal && externalSignal.aborted)) {
      var timeoutError = new Error('网络请求超时：' + (err && err.message || 'Timeout'));
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (externalSignal && forwardAbort) externalSignal.removeEventListener('abort', forwardAbort);
  }
}
function escHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function normalizePlaybackQuality(value) {
  value = String(value || '').toLowerCase();
  if (value === 'jymaster' || value === 'master' || value === 'svip') return 'jymaster';
  if (value === 'hires' || value === 'hi-res' || value === 'highres' || value === 'highest') return 'hires';
  if (value === 'lossless' || value === 'flac' || value === 'sq') return 'lossless';
  if (value === 'exhigh' || value === 'high' || value === '320k' || value === 'hq') return 'exhigh';
  if (value === 'standard' || value === 'normal' || value === 'std') return 'standard';
  return 'hires';
}
function normalizePlaybackProvider(provider) {
  if (provider === 'qq') return 'qq';
  if (provider === 'kugou') return 'kugou';
  if (provider === 'qishui') return 'qishui';
  if (provider === 'spotify') return 'spotify';
  return 'netease';
}
function normalizePlaybackQualityForProvider(value, provider) {
  provider = normalizePlaybackProvider(provider);
  var q = normalizePlaybackQuality(value);
  if ((provider === 'qq' || provider === 'qishui') && q === 'jymaster') return 'hires';
  return q;
}
function playbackQualityOptions(provider) {
  provider = normalizePlaybackProvider(provider);
  if (provider === 'spotify') return [];
  return PLAYBACK_QUALITY_OPTIONS[provider] || PLAYBACK_QUALITY_OPTIONS.netease;
}
// Local files have no provider quality to pick; songProviderKey would
// otherwise report them as netease and show a misleading NetEase quality.
function isLocalQualitySong(song) {
  return !!(song && (song.type === 'local' || song.source === 'local' || song.provider === 'local' || song.localKey || song.localFileId || song.localUrl));
}
function currentPlaybackQualityProvider() {
  var song = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  return normalizePlaybackProvider(songProviderKey(song));
}
function getProviderPlaybackQuality(provider) {
  provider = normalizePlaybackProvider(provider);
  var prefs = playbackQualityPrefs || {};
  return normalizePlaybackQualityForProvider(prefs[provider] || PLAYBACK_QUALITY_DEFAULTS[provider], provider);
}
function setProviderPlaybackQuality(provider, value) {
  provider = normalizePlaybackProvider(provider);
  if (!playbackQualityPrefs || typeof playbackQualityPrefs !== 'object') playbackQualityPrefs = {};
  playbackQualityPrefs[provider] = normalizePlaybackQualityForProvider(value, provider);
  playbackQuality = playbackQualityPrefs[provider];
  savePlaybackQualityPreference();
}
function getPlaybackQualityForSong(song) {
  var provider = normalizePlaybackProvider(songProviderKey(song));
  return getProviderPlaybackQuality(provider);
}
function playbackQualityLabel(value, provider) {
  provider = normalizePlaybackProvider(provider || currentPlaybackQualityProvider());
  value = normalizePlaybackQualityForProvider(value, provider);
  if (provider === 'spotify') return '平台已移除';
  if (provider === 'qishui') {
    if (value === 'lossless') return '汽水无损';
    if (value === 'exhigh') return '汽水 320k';
    if (value === 'standard') return '汽水 128k';
    return '汽水最高';
  }
  if (provider === 'qq') {
    if (value === 'hires') return 'Hi-Res FLAC';
    if (value === 'lossless') return '无损 FLAC';
    if (value === 'exhigh') return '320k MP3';
    if (value === 'standard') return '128k MP3';
    return '无损 FLAC';
  }
  if (provider === 'kugou') {
    if (value === 'hires') return '酷狗 Hi-Res';
    if (value === 'lossless') return '酷狗无损';
    if (value === 'exhigh') return '酷狗 320k';
    if (value === 'standard') return '酷狗 128k';
    return '酷狗无损';
  }
  if (value === 'jymaster') return '超清母带';
  if (value === 'hires') return '高清臻音';
  if (value === 'lossless') return '无损';
  if (value === 'exhigh') return '极高';
  if (value === 'standard') return '标准';
  return '高清臻音';
}
function playbackQualityShortLabel(value, provider) {
  provider = normalizePlaybackProvider(provider || currentPlaybackQualityProvider());
  value = normalizePlaybackQualityForProvider(value, provider);
  if (provider === 'spotify') return '已移除';
  if (provider === 'qishui') {
    if (value === 'lossless') return 'QS SQ';
    if (value === 'exhigh') return 'QS 320';
    if (value === 'standard') return 'QS 128';
    return 'QS Hi';
  }
  if (provider === 'qq') {
    if (value === 'hires') return 'QQ Hires';
    if (value === 'lossless') return 'QQ SQ';
    if (value === 'exhigh') return 'QQ 320';
    if (value === 'standard') return 'QQ 128';
    return 'QQ SQ';
  }
  if (provider === 'kugou') {
    if (value === 'hires') return 'KG Hires';
    if (value === 'lossless') return 'KG SQ';
    if (value === 'exhigh') return 'KG 320';
    if (value === 'standard') return 'KG 128';
    return 'KG SQ';
  }
  if (value === 'jymaster') return '母带';
  if (value === 'hires') return '臻音';
  if (value === 'lossless') return 'SQ';
  if (value === 'exhigh') return 'HQ';
  if (value === 'standard') return 'STD';
  return '臻音';
}
function playbackQualityRank(value, provider) {
  value = normalizePlaybackQualityForProvider(value, provider);
  if (value === 'jymaster') return 5;
  if (value === 'hires') return 4;
  if (value === 'lossless') return 3;
  if (value === 'exhigh') return 2;
  if (value === 'standard') return 1;
  return 4;
}
function playbackQualityWasDowngraded(requested, resolved, provider) {
  return playbackQualityRank(resolved, provider) < playbackQualityRank(requested, provider);
}
function playbackQualityTrackKey(song, provider) {
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  song = song || {};
  var id = song.id || song.mid || song.songmid || song.hash || song.fileHash || song.audioHash || song.providerSongId || '';
  var media = song.mediaMid || song.media_mid || song.albumAudioId || song.album_audio_id || song.mixSongId || '';
  if (!id) id = [song.name || song.title || '', song.artist || '', song.album || ''].join('|');
  return provider + ':' + String(id || '').trim() + ':' + String(media || '').trim();
}
// Runtime ceilings belong to an authorization session, never to saved preferences.
var playbackQualitySessionEpochs = {};
function playbackQualityAuthorizationKey(provider) {
  provider = normalizePlaybackProvider(provider);
  var status = typeof platformStatus === 'function' ? platformStatus(provider) : null;
  if (!status) {
    if (provider === 'qq' && typeof qqLoginStatus !== 'undefined') status = qqLoginStatus;
    else if (provider === 'kugou' && typeof kugouLoginStatus !== 'undefined') status = kugouLoginStatus;
    else if (provider === 'qishui' && typeof qishuiLoginStatus !== 'undefined') status = qishuiLoginStatus;
    else if (typeof loginStatus !== 'undefined') status = loginStatus[provider] || (provider === 'netease' ? loginStatus : null);
  }
  status = status || {};
  // Public identity/entitlement fields only; no cookie or playback credential.
  var epoch = typeof playbackQualitySessionEpochs !== 'undefined' ? playbackQualitySessionEpochs[provider] || 0 : 0;
  return JSON.stringify([epoch, typeof providerAuthEpoch === 'function' ? providerAuthEpoch(provider) : 0, !!status.loggedIn, String(status.userId || status.uid || status.uin || status.openId || status.id || ''),
    status.vipLevel || '', Number(status.vipType || 0), Number(status.svipType || 0), !!status.isVip, !!status.isSvip,
    !!status.playbackKeyReady, !!status.authorizationIncomplete, !!status.membershipStale, !!status.sessionRejected]);
}
function invalidatePlaybackQualityRuntimeCaps(provider) {
  if (typeof playbackQualitySessionEpochs === 'undefined') playbackQualitySessionEpochs = {};
  var providers = provider ? [normalizePlaybackProvider(provider)] : ['netease', 'qq', 'kugou', 'qishui'];
  providers.forEach(function (key) { playbackQualitySessionEpochs[key] = (playbackQualitySessionEpochs[key] || 0) + 1; });
  Object.keys(playbackQualityRuntimeCaps || {}).forEach(function (key) {
    if (providers.indexOf(playbackQualityRuntimeCaps[key].provider) >= 0) delete playbackQualityRuntimeCaps[key];
  });
  if (typeof clearAlbumGaplessPreload === 'function') clearAlbumGaplessPreload('authorization-session-changed');
  if (typeof updatePlaybackQualityUi === 'function') updatePlaybackQualityUi();
}
function playbackQualityRuntimeCapForSong(song, provider) {
  if (!song) return null;
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  var key = playbackQualityTrackKey(song, provider);
  var cap = key && playbackQualityRuntimeCaps ? playbackQualityRuntimeCaps[key] || null : null;
  if (cap && (cap.session !== playbackQualityAuthorizationKey(provider) || Date.now() >= cap.expiresAt || Date.now() < cap.at)) {
    delete playbackQualityRuntimeCaps[key];
    return null;
  }
  return cap;
}
function playbackQualityCapValue(song, provider) {
  var cap = playbackQualityRuntimeCapForSong(song, provider);
  return cap && cap.ceiling ? normalizePlaybackQualityForProvider(cap.ceiling, provider) : '';
}
function playbackQualityAboveCap(value, provider, capValue) {
  if (!capValue) return false;
  capValue = normalizePlaybackQualityForProvider(capValue, provider);
  return playbackQualityRank(value, provider) > playbackQualityRank(capValue, provider);
}
function effectivePlaybackQualityForSong(song, provider, requested) {
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  var q = normalizePlaybackQualityForProvider(requested || getProviderPlaybackQuality(provider), provider);
  var cap = playbackQualityCapValue(song, provider);
  return playbackQualityAboveCap(q, provider, cap) ? cap : q;
}
function requestPlaybackQualityRuntimeProbe(song, provider, quality) {
  var cap = playbackQualityRuntimeCapForSong(song, provider);
  if (!cap || !playbackQualityAboveCap(quality, provider, cap.ceiling)) return true;
  // One explicit reprobe per minute; ordinary/repeated playback keeps its ceiling.
  if (cap.probeAt != null && Date.now() - cap.probeAt < 60000 && Date.now() >= cap.probeAt) return false;
  cap.probeAt = Date.now();
  cap.probePending = normalizePlaybackQualityForProvider(quality, provider);
  return true;
}
function consumePlaybackQualityRuntimeProbe(song, provider, quality) {
  var cap = playbackQualityRuntimeCapForSong(song, provider);
  if (!cap || cap.probePending !== normalizePlaybackQualityForProvider(quality, provider)) return false;
  cap.probePending = '';
  return true;
}
function prunePlaybackQualityRuntimeCaps() {
  var now = Date.now();
  Object.keys(playbackQualityRuntimeCaps || {}).forEach(function (key) {
    var cap = playbackQualityRuntimeCaps[key];
    if (!cap || now >= cap.expiresAt || now < cap.at || cap.session !== playbackQualityAuthorizationKey(cap.provider)) delete playbackQualityRuntimeCaps[key];
  });
  var keys = Object.keys(playbackQualityRuntimeCaps || {});
  if (keys.length >= 256) {
    keys.sort(function (a, b) { return playbackQualityRuntimeCaps[a].at - playbackQualityRuntimeCaps[b].at; });
    keys.slice(0, keys.length - 255).forEach(function (key) { delete playbackQualityRuntimeCaps[key]; });
  }
}
function markPlaybackQualityRuntimeCap(song, provider, ceiling, reason, allowRaise) {
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  if (!song || !ceiling) return false;
  ceiling = normalizePlaybackQualityForProvider(ceiling, provider);
  var key = playbackQualityTrackKey(song, provider);
  if (!key) return false;
  var prev = playbackQualityRuntimeCapForSong(song, provider);
  if (prev && !allowRaise && playbackQualityRank(prev.ceiling, provider) <= playbackQualityRank(ceiling, provider)) return false;
  prunePlaybackQualityRuntimeCaps();
  var why = String(reason || 'resolved-lower');
  // Missing URLs and network failures are short-lived evidence, not membership verdicts.
  var ttl = /network|timeout|url[-_]unavailable/i.test(why) ? 60000
    : (/copyright|vip_required|paid_required|login_required/i.test(why) ? 30 * 60000 : 5 * 60000);
  playbackQualityRuntimeCaps[key] = {
    provider: provider, ceiling: ceiling, reason: why, at: Date.now(), expiresAt: Date.now() + ttl,
    session: playbackQualityAuthorizationKey(provider), probeAt: prev && prev.probeAt != null ? prev.probeAt : null,
    probePending: ''
  };
  updatePlaybackQualityUi();
  return true;
}
function playbackBitrateLabel(br) {
  br = Number(br) || 0;
  if (!br) return '';
  if (br >= 1000000) return (br / 1000000).toFixed(br >= 2000000 ? 1 : 2).replace(/\.0+$/, '') + ' Mbps';
  return Math.round(br / 1000) + ' kbps';
}
function playbackResolvedQualityText(data, provider) {
  data = data || {};
  provider = normalizePlaybackProvider(provider || data.provider || currentPlaybackQualityProvider());
  var label = provider === 'qq' && data.quality
    ? String(data.quality)
    : playbackQualityLabel(data.level || getProviderPlaybackQuality(provider), provider);
  var br = playbackBitrateLabel(data.br);
  return br ? (label + ' · ' + br) : label;
}
function readPlaybackQualityPreference() {
  var fallback = {
    netease: PLAYBACK_QUALITY_DEFAULTS.netease,
    qq: PLAYBACK_QUALITY_DEFAULTS.qq,
    kugou: PLAYBACK_QUALITY_DEFAULTS.kugou,
    qishui: PLAYBACK_QUALITY_DEFAULTS.qishui,
  };
  try {
    var raw = localStorage.getItem(PLAYBACK_QUALITY_STORE_KEY) || '';
    if (!raw) return fallback;
    if (raw.trim().charAt(0) !== '{') {
      var legacy = normalizePlaybackQuality(raw);
      return {
        netease: normalizePlaybackQualityForProvider(legacy, 'netease'),
        qq: normalizePlaybackQualityForProvider(legacy, 'qq'),
        kugou: normalizePlaybackQualityForProvider(legacy, 'kugou'),
        qishui: normalizePlaybackQualityForProvider(fallback.qishui, 'qishui'),
      };
    }
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      netease: normalizePlaybackQualityForProvider(parsed.netease || fallback.netease, 'netease'),
      qq: normalizePlaybackQualityForProvider(parsed.qq || fallback.qq, 'qq'),
      kugou: normalizePlaybackQualityForProvider(parsed.kugou || fallback.kugou || 'lossless', 'kugou'),
      qishui: normalizePlaybackQualityForProvider(parsed.qishuiTiers ? (parsed.qishui || fallback.qishui) : fallback.qishui, 'qishui'),
    };
  } catch (e) {
    return fallback;
  }
}
function savePlaybackQualityPreference() {
  // qishuiTiers marks a Qishui value chosen after it gained real tiers.
  try { localStorage.setItem(PLAYBACK_QUALITY_STORE_KEY, JSON.stringify(Object.assign({}, playbackQualityPrefs || {}, { qishuiTiers: 1 }))); } catch (e) { }
}
function updatePlaybackQualityUi() {
  var provider = currentPlaybackQualityProvider();
  var currentSong = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : (typeof currentLocalSong !== 'undefined' ? currentLocalSong : null);
  var currentQuality = getProviderPlaybackQuality(provider);
  var runtimeCapQuality = playbackQualityCapValue(currentSong, provider);
  var effectiveQuality = effectivePlaybackQualityForSong(currentSong, provider, currentQuality);
  playbackQuality = currentQuality;
  var label = document.getElementById('quality-btn-label');
  var btn = document.getElementById('quality-btn');
  var list = document.getElementById('quality-option-list');
  var wrap = document.getElementById('quality-control');
  var localTrack = isLocalQualitySong(currentSong) || provider === 'spotify' || !!(currentSong && currentSong.providerRemoved);
  if (wrap) {
    wrap.classList.toggle('quality-control-local', localTrack);
    if (localTrack) wrap.classList.remove('open');
  }
  var canUseSvip = provider === 'netease' && hasProviderSvip('netease', loginStatus);
  var displayQuality = provider === 'netease' && effectiveQuality === 'jymaster' && !canUseSvip ? 'hires' : effectiveQuality;
  if (label) label.textContent = playbackQualityShortLabel(displayQuality, provider);
  var qualityProviderTitle = provider === 'spotify' ? '平台已移除: ' : (provider === 'qishui' ? '汽水音质: ' : (provider === 'qq' ? 'QQ 音质: ' : (provider === 'kugou' ? '酷狗音质: ' : '网易云音质: ')));
  if (btn) btn.title = qualityProviderTitle + playbackQualityLabel(displayQuality, provider) +
    (provider === 'netease' && currentQuality === 'jymaster' && !canUseSvip ? ' · 超清母带需网易云 SVIP' : '');
  if (btn && runtimeCapQuality) btn.title += ' | 当前歌曲最高: ' + playbackQualityLabel(runtimeCapQuality, provider);
  if (list) {
    list.innerHTML = playbackQualityOptions(provider).map(function (item) {
      var capLocked = playbackQualityAboveCap(item.key, provider, runtimeCapQuality);
      var locked = !!(item.svip && !canUseSvip);
      return '<button class="quality-option' + (item.svip ? ' svip-only' : '') + (capLocked ? ' cap-locked' : '') + (locked ? ' locked' : '') + '" data-quality="' + item.key + '" data-svip="' + (item.svip ? '1' : '0') + '" ' + (locked ? 'disabled ' : '') + 'onclick="setPlaybackQuality(\'' + item.key + '\')"><span>' + escHtml(item.title) + '</span><small>' + escHtml(capLocked ? ('点选重试 · 当前 ' + playbackQualityLabel(runtimeCapQuality, provider)) : item.sub) + '</small></button>';
    }).join('');
  }
  document.querySelectorAll('.quality-option').forEach(function (option) {
    var q = normalizePlaybackQualityForProvider(option.dataset.quality, provider);
    var capLocked = playbackQualityAboveCap(q, provider, runtimeCapQuality);
    var locked = option.dataset.svip === '1' && !canUseSvip;
    option.classList.toggle('active', q === displayQuality);
    option.classList.toggle('locked', locked);
    option.classList.toggle('cap-locked', capLocked);
    option.disabled = locked;
    option.title = locked ? '需要网易云 SVIP 账号' : playbackQualityLabel(q, provider);
  });
  if (runtimeCapQuality) {
    document.querySelectorAll('.quality-option.cap-locked').forEach(function (option) {
      option.title = '点选重新探测（每分钟一次） · 当前最高: ' + playbackQualityLabel(runtimeCapQuality, provider);
    });
  }
  if (typeof syncQualityPresetUi === 'function') syncQualityPresetUi();
}
function setPlaybackQuality(value) {
  var provider = currentPlaybackQualityProvider();
  var currentSong = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  var next = normalizePlaybackQualityForProvider(value, provider);
  var cap = playbackQualityCapValue(currentSong, provider);
  if (provider === 'netease' && next === 'jymaster' && !hasProviderSvip('netease', loginStatus)) {
    showToast(hasPlatformLogin('netease') ? '超清母带需要网易云 SVIP' : '登录网易云 SVIP 后可用超清母带');
    if (!hasPlatformLogin('netease')) openProviderLogin('netease');
    return;
  }
  if (playbackQualityAboveCap(next, provider, cap) && !requestPlaybackQualityRuntimeProbe(currentSong, provider, next)) {
    showSourceFallbackNotice('音质重新探测稍后可用', '当前可播 ' + playbackQualityLabel(cap, provider) + '。高音质每分钟可重试一次，请稍后再选。');
    updatePlaybackQualityUi();
    return;
  }
  setProviderPlaybackQuality(provider, next);
  updatePlaybackQualityUi();
  var wrap = document.getElementById('quality-control');
  if (wrap) wrap.classList.remove('open');
  applyPlaybackQualityToCurrentTrack(next, provider);
}
function canReloadCurrentTrackForQuality() {
  if (currentIdx < 0 || currentIdx >= playQueue.length) return false;
  if (!audio || !audio.src || audio.paused || audio.ended) return false;
  var song = playQueue[currentIdx];
  if (!song || song.type === 'local' || song.source === 'local') return false;
  return songProviderKey(song) === 'netease' || songProviderKey(song) === 'qq' || songProviderKey(song) === 'kugou' || songProviderKey(song) === 'qishui';
}
function applyPlaybackQualityToCurrentTrack(nextQuality, provider) {
  var song = currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  var label = playbackQualityLabel(nextQuality || getProviderPlaybackQuality(provider), provider);
  if (!canReloadCurrentTrackForQuality()) {
    showToast('音质偏好: ' + label + ' · 下次播放生效');
    return;
  }
  var resumeAt = audio && isFinite(audio.currentTime) ? audio.currentTime : 0;
  showToast('正在切换音质: ' + label);
  Promise.resolve(playQueueAt(currentIdx, {
    qualityOverride: nextQuality || getProviderPlaybackQuality(provider),
    qualitySwitch: true,
    resumeAt: resumeAt,
    preserveHomeState: true,
  })).catch(function (e) {
    console.warn('[QualitySwitch]', e);
    showToast('音质切换失败，已保留偏好');
  }).finally(forcePlaybackControlsInteractive);
}
// The quality button stops click propagation, so the source menu's outside-click close never fires.
function closeSourceSwitcherForQuality() {
  if (typeof controlSourceSwitcherState !== 'undefined' && controlSourceSwitcherState.open && typeof closeControlSourceSwitcher === 'function') {
    closeControlSourceSwitcher();
  }
}
function toggleQualityPanel(e) {
  if (e) e.stopPropagation();
  closeSourceSwitcherForQuality();
  var wrap = document.getElementById('quality-control');
  if (wrap) {
    wrap.classList.toggle('open');
    if (wrap.classList.contains('open')) revealBottomControls(520);
    else scheduleControlsHide(520);
  }
}
function bindQualityControl() {
  var wrap = document.getElementById('quality-control');
  if (wrap) {
    wrap.addEventListener('mouseenter', function () { closeSourceSwitcherForQuality(); wrap.classList.add('open'); revealBottomControls(520); });
    wrap.addEventListener('mouseleave', function () { setTimeout(function () {
      if (!wrap.matches(':hover')) { wrap.classList.remove('open'); scheduleControlsHide(520); }
    }, 260); });
  }
  document.addEventListener('click', function (e) {
    if (wrap && !wrap.contains(e.target) && wrap.classList.contains('open')) {
      wrap.classList.remove('open'); scheduleControlsHide(520);
    }
  });
  if (typeof bindQualityPresetControls === 'function') bindQualityPresetControls();
  updatePlaybackQualityUi();
}
// Settings-side defaults for every tiered platform at once.
var QUALITY_PRESET_PROVIDERS = [
  { key: 'netease', title: '网易云' },
  { key: 'qq', title: 'QQ 音乐' },
  { key: 'kugou', title: '酷狗' },
  { key: 'qishui', title: '汽水' }
];
var QUALITY_PRESET_SHORT = {
  netease: { jymaster: '母带', hires: '臻音', lossless: '无损', exhigh: '极高', standard: '标准' },
  qq: { hires: 'Hi-Res', lossless: '无损', exhigh: '320k', standard: '128k' },
  kugou: { hires: 'Hi-Res', lossless: '无损', exhigh: '320k', standard: '128k' },
  qishui: { hires: '最高', lossless: '无损', exhigh: '320k', standard: '128k' }
};
var QUALITY_PRESET_NAMES = { saver: '省流', balanced: '均衡', lossless: '无损', best: '最高' };
function qualityPresetTarget(preset, provider) {
  if (preset === 'saver') return 'standard';
  if (preset === 'balanced') return 'exhigh';
  if (preset === 'lossless') return 'lossless';
  if (provider === 'netease' && hasProviderSvip('netease', loginStatus)) return 'jymaster';
  return 'hires';
}
function activeQualityPreset() {
  var names = Object.keys(QUALITY_PRESET_NAMES);
  for (var i = 0; i < names.length; i += 1) {
    var preset = names[i];
    var matches = QUALITY_PRESET_PROVIDERS.every(function (item) {
      var current = getProviderPlaybackQuality(item.key);
      // Without SVIP the top NetEase tier plays as Hi-Res, so either counts as 最高.
      if (preset === 'best' && item.key === 'netease') return current === 'jymaster' || current === 'hires';
      return current === qualityPresetTarget(preset, item.key);
    });
    if (matches) return preset;
  }
  return '';
}
function syncQualityPresetUi() {
  var panel = document.getElementById('playback-quality-preset-panel');
  if (!panel) return;
  var canUseSvip = hasProviderSvip('netease', loginStatus);
  var rows = document.getElementById('quality-preset-providers');
  if (rows) {
    rows.innerHTML = QUALITY_PRESET_PROVIDERS.map(function (item) {
      var current = getProviderPlaybackQuality(item.key);
      var buttons = playbackQualityOptions(item.key).map(function (option) {
        var locked = !!(option.svip && !canUseSvip);
        var short = (QUALITY_PRESET_SHORT[item.key] || {})[option.key] || option.title;
        return '<button type="button" data-quality-provider="' + item.key + '" data-quality="' + option.key + '"' +
          (option.key === current ? ' class="active" aria-pressed="true"' : ' aria-pressed="false"') +
          (locked ? ' disabled' : '') + ' title="' + escHtml(locked ? '需要网易云 SVIP 账号' : (option.title + ' · ' + option.sub)) + '">' + escHtml(short) + '</button>';
      }).join('');
      return '<div class="quality-preset-provider"><span class="quality-preset-provider-name">' + escHtml(item.title) + '</span>' +
        '<div class="fx-seg quality-preset-provider-seg" role="group" aria-label="' + escHtml(item.title) + ' 默认音质">' + buttons + '</div></div>';
    }).join('');
  }
  var active = activeQualityPreset();
  panel.querySelectorAll('[data-quality-preset]').forEach(function (btn) {
    var on = btn.getAttribute('data-quality-preset') === active;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  var summary = document.getElementById('quality-preset-summary');
  if (summary) summary.textContent = active ? QUALITY_PRESET_NAMES[active] : '自定义';
}
// Applies new defaults; only the playing song's platform reloads, the rest take effect on next play.
function applyQualityPresetChanges(changes, label) {
  var provider = currentPlaybackQualityProvider();
  var changedCurrent = '';
  var song = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  changes.forEach(function (change) {
    var samePreference = getProviderPlaybackQuality(change.provider) === normalizePlaybackQualityForProvider(change.value, change.provider);
    var capRetry = change.provider === provider && typeof playbackQualityCapValue === 'function' && playbackQualityAboveCap(change.value, provider, playbackQualityCapValue(song, provider));
    if (samePreference && !capRetry) return;
    if (capRetry && !requestPlaybackQualityRuntimeProbe(song, provider, change.value)) {
      showToast('高音质每分钟可重试一次，请稍后再选');
      return;
    }
    setProviderPlaybackQuality(change.provider, change.value);
    if (change.provider === provider) changedCurrent = getProviderPlaybackQuality(provider);
  });
  updatePlaybackQualityUi();
  if (changedCurrent && canReloadCurrentTrackForQuality()) {
    applyPlaybackQualityToCurrentTrack(changedCurrent, provider);
  } else {
    showToast(label + ' · 下次播放生效');
  }
}
function setQualityPreset(preset) {
  if (!QUALITY_PRESET_NAMES[preset]) return;
  applyQualityPresetChanges(QUALITY_PRESET_PROVIDERS.map(function (item) {
    return { provider: item.key, value: qualityPresetTarget(preset, item.key) };
  }), '音质预设：' + QUALITY_PRESET_NAMES[preset]);
}
function setProviderQualityPreset(provider, value) {
  provider = normalizePlaybackProvider(provider);
  if (provider === 'netease' && normalizePlaybackQuality(value) === 'jymaster' && !hasProviderSvip('netease', loginStatus)) {
    showToast('超清母带需要网易云 SVIP');
    return;
  }
  var title = (QUALITY_PRESET_PROVIDERS.filter(function (item) { return item.key === provider; })[0] || {}).title || '';
  applyQualityPresetChanges([{ provider: provider, value: value }], title + ' 默认音质：' + playbackQualityLabel(value, provider));
}
function bindQualityPresetControls() {
  var panel = document.getElementById('playback-quality-preset-panel');
  if (!panel || panel._bound) return;
  panel._bound = true;
  panel.addEventListener('click', function (e) {
    var target = e.target && e.target.closest ? e.target : null;
    if (!target) return;
    var preset = target.closest('[data-quality-preset]');
    if (preset) { setQualityPreset(preset.getAttribute('data-quality-preset')); return; }
    var option = target.closest('[data-quality-provider]');
    if (option && !option.disabled) setProviderQualityPreset(option.getAttribute('data-quality-provider'), option.getAttribute('data-quality'));
  });
}
var audioRouteWorkflowDrag = null;
function audioRoutePointForPort(port, root) {
  if (!port || !root) return null;
  var portRect = port.getBoundingClientRect();
  var rootRect = root.getBoundingClientRect();
  return {
    x: (portRect.left + portRect.width / 2 - rootRect.left) * root.clientWidth / Math.max(1, rootRect.width),
    y: (portRect.top + portRect.height / 2 - rootRect.top) * root.clientHeight / Math.max(1, rootRect.height)
  };
}
function audioRoutePointFromEvent(e, root) {
  if (!e || !root) return null;
  var rootRect = root.getBoundingClientRect();
  return { x: (e.clientX - rootRect.left) * root.clientWidth / Math.max(1, rootRect.width),
    y: (e.clientY - rootRect.top) * root.clientHeight / Math.max(1, rootRect.height) };
}
function audioRouteBezierPath(a, b) {
  var gap = b.x - a.x;
  // Keep forward control points ordered even for very close ports. The former
  // 42px minimum overshot short links and reversed their middle tangent.
  var span = Math.abs(gap);
  var bend = Math.min(1, Math.abs(b.y - a.y) / Math.max(1, span));
  var dx = gap >= 0 ? span * (0.38 + 0.12 * bend) : Math.max(24, span * 0.42);
  return 'M ' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
    ' C ' + (a.x + dx).toFixed(1) + ' ' + a.y.toFixed(1) +
    ', ' + (b.x - dx).toFixed(1) + ' ' + b.y.toFixed(1) +
    ', ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
}
function appendAudioRoutePath(svg, from, to, className) {
  if (!svg || !from || !to) return;
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', audioRouteBezierPath(from, to));
  path.setAttribute('class', className || 'workflow-link');
  svg.appendChild(path);
}
function audioRoutePortByAttr(root, attr, value) {
  var ports = root ? root.querySelectorAll('.flow-port.in[' + attr + ']') : [];
  value = String(value || '');
  for (var i = 0; i < ports.length; i += 1) {
    if (String(ports[i].getAttribute(attr) || '') === value) return ports[i];
  }
  return null;
}
function renderAudioRouteWorkflowEdgesForRoot(root, tempPoint) {
  if (!root) return;
  var svg = root.querySelector('#audio-route-workflow-svg');
  if (!svg) return;
  svg.setAttribute('viewBox', '0 0 ' + Math.max(1, root.clientWidth || 1) + ' ' + Math.max(1, root.clientHeight || 1));
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var sourceOut = root.querySelector('[data-audio-route-source="player"]');
  var sourcePoint = audioRoutePointForPort(sourceOut, root);
  var primaryPort = audioRoutePortByAttr(root, 'data-output-primary-target', audioOutputDeviceId || '');
  appendAudioRoutePath(svg, sourcePoint, audioRoutePointForPort(primaryPort, root), 'workflow-link active primary');
  audioRouteVisibleIds().forEach(function (id) {
    if (!id || id === (audioOutputDeviceId || '')) return;
    appendAudioRoutePath(svg, sourcePoint, audioRoutePointForPort(audioRoutePortByAttr(root, 'data-output-mirror-target', id), root), audioOutputMirrorRouteClass(id));
  });
  if (audioRouteWorkflowDrag && audioRouteWorkflowDrag.root === root && tempPoint) {
    appendAudioRoutePath(svg, audioRoutePointForPort(audioRouteWorkflowDrag.port, root), tempPoint, 'workflow-link temp');
  }
}
function renderAudioRouteWorkflowEdges(tempPoint) {
  var roots = document.querySelectorAll('.audio-route-graph');
  Array.prototype.forEach.call(roots, function (root) {
    renderAudioRouteWorkflowEdgesForRoot(root, tempPoint);
  });
}
function audioRouteDropPort(e, root) {
  if (!root || !root.isConnected) return null;
  var rect = root.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
  var hit = document.elementFromPoint(e.clientX, e.clientY);
  if (!hit || !root.contains(hit) || hit.closest('input,select,textarea,output,[data-route-mute]')) return null;
  var button = hit.closest('[data-output-primary],[data-output-mirror]');
  if (button) return button.disabled ? null : button.querySelector('.flow-port.in');
  var best = null, distance = 28;
  root.querySelectorAll('.flow-port.in').forEach(function (port) {
    if (port.closest('button:disabled')) return;
    var portRect = port.getBoundingClientRect();
    var x = portRect.left + portRect.width / 2, y = portRect.top + portRect.height / 2;
    var viewport = port.closest('.route-node-grid');
    if (viewport) {
      var clip = viewport.getBoundingClientRect();
      if (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom) return;
    }
    var next = Math.hypot(e.clientX - x, e.clientY - y);
    if (next <= distance) { best = port; distance = next; }
  });
  return best;
}
function cancelAudioRouteWorkflowDrag() {
  var drag = audioRouteWorkflowDrag;
  if (!drag) return;
  audioRouteWorkflowDrag = null;
  if (drag.frame) cancelAnimationFrame(drag.frame);
  if (drag.target) drag.target.closest('.workflow-node').classList.remove('drop-ready');
  drag.root.classList.remove('dragging-line');
  try { drag.owner.releasePointerCapture(drag.pointerId); } catch (_) { }
  renderAudioRouteWorkflowEdges();
}
function updateAudioRouteWorkflowDrag(e) {
  var drag = audioRouteWorkflowDrag;
  if (!drag) return;
  if (!drag.root.isConnected) { cancelAudioRouteWorkflowDrag(); return; }
  drag.event = { clientX: e.clientX, clientY: e.clientY };
  if (drag.frame) return;
  drag.frame = requestAnimationFrame(function () {
    drag.frame = 0;
    if (audioRouteWorkflowDrag !== drag) return;
    if (drag.target) drag.target.closest('.workflow-node').classList.remove('drop-ready');
    drag.target = audioRouteDropPort(drag.event, drag.root);
    if (drag.target) drag.target.closest('.workflow-node').classList.add('drop-ready');
    renderAudioRouteWorkflowEdges(drag.target ? audioRoutePointForPort(drag.target, drag.root) : audioRoutePointFromEvent(drag.event, drag.root));
  });
}
function finishAudioRouteWorkflowDrag(e) {
  var drag = audioRouteWorkflowDrag;
  if (!drag || e.pointerId !== drag.pointerId || e.currentTarget !== drag.owner) return;
  var port = audioRouteDropPort(e, drag.root);
  drag.owner._routeSuppressClickUntil = Date.now() + 250;
  // Setting an output re-renders this graph. Release capture and clear hover
  // before invoking it, so a detached graph cannot retain a drag session.
  cancelAudioRouteWorkflowDrag();
  if (port) {
    if (port.hasAttribute('data-output-primary-target')) {
      setAudioOutputDevice(port.getAttribute('data-output-primary-target') || '', true);
    } else if (port.hasAttribute('data-output-mirror-target')) {
      var routeId = port.getAttribute('data-output-mirror-target') || '';
      if (audioRouteSelectedIds().indexOf(routeId) < 0) toggleAudioOutputMirrorDevice(routeId);

    }
  }
  requestAnimationFrame(renderAudioRouteWorkflowEdges);
}
function bindAudioRouteWorkflowPointerEvents(outputList) {
  if (!outputList || outputList._routeWorkflowBound) return;
  outputList._routeWorkflowBound = true;
  outputList.addEventListener('click', function (e) {
    if (Date.now() < (outputList._routeSuppressClickUntil || 0)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  outputList.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.isPrimary === false || audioRouteWorkflowDrag) return;
    var port = e.target && e.target.closest ? e.target.closest('.flow-port.out[data-audio-route-source]') : null;
    if (!port || !outputList.contains(port)) return;
    var root = port.closest('.audio-route-graph');
    audioRouteWorkflowDrag = { root: root, port: port, owner: outputList, pointerId: e.pointerId };
    if (root) root.classList.add('dragging-line');
    try { outputList.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
    e.stopPropagation();
    updateAudioRouteWorkflowDrag(e);
  });
  outputList.addEventListener('pointermove', function (e) {
    if (!audioRouteWorkflowDrag || audioRouteWorkflowDrag.owner !== outputList || audioRouteWorkflowDrag.pointerId !== e.pointerId) return;
    e.preventDefault();
    updateAudioRouteWorkflowDrag(e);
  });
  outputList.addEventListener('pointerup', finishAudioRouteWorkflowDrag);
  outputList.addEventListener('scroll', function () {
    if (audioRouteWorkflowDrag && audioRouteWorkflowDrag.event) updateAudioRouteWorkflowDrag(audioRouteWorkflowDrag.event);
    else requestAnimationFrame(renderAudioRouteWorkflowEdges);
  }, true);
  function cancelOwnedDrag(e) {
    if (audioRouteWorkflowDrag && audioRouteWorkflowDrag.owner === outputList && audioRouteWorkflowDrag.pointerId === e.pointerId) cancelAudioRouteWorkflowDrag();
  }
  outputList.addEventListener('pointercancel', cancelOwnedDrag);
  outputList.addEventListener('lostpointercapture', cancelOwnedDrag);
  if (!bindAudioRouteWorkflowPointerEvents._resizeBound) {
    bindAudioRouteWorkflowPointerEvents._resizeBound = true;
    function refreshGeometry() {
      if (audioRouteWorkflowDrag && audioRouteWorkflowDrag.event) updateAudioRouteWorkflowDrag(audioRouteWorkflowDrag.event);
      else requestAnimationFrame(renderAudioRouteWorkflowEdges);
    }
    window.addEventListener('resize', refreshGeometry);
    window.addEventListener('orientationchange', refreshGeometry);
    window.addEventListener('blur', cancelAudioRouteWorkflowDrag);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') cancelAudioRouteWorkflowDrag(); });
  }
}
function bindAudioRouteSelectionEvents(container) {
  if (container && !container._audioRouteSelectBound) {
    container._audioRouteSelectBound = true;
    container.addEventListener('input', function (e) {
      var input = e.target.closest('[data-route-setting]');
      if (!input) return;
      var row = input.closest('[data-route-id]');
      setAudioRouteSetting(row.getAttribute('data-route-id'), input.getAttribute('data-route-setting'), Number(input.value));
      var output = input.parentNode.querySelector('output');
      if (output) output.textContent = audioRouteSetting(row.getAttribute('data-route-id')).volume + '%';
    });

    container.addEventListener('click', function (e) {
      var mute = e.target.closest('[data-route-mute]');
      if (mute) {
        var id = mute.closest('[data-route-id]').getAttribute('data-route-id');
        var muted = !audioRouteSetting(id).muted;
        setAudioRouteSetting(id, 'muted', muted);
        mute.setAttribute('aria-pressed', String(muted));
        mute.setAttribute('aria-label', muted ? '取消静音' : '静音');
        mute.title = muted ? '取消静音' : '静音';
        mute.innerHTML = audioRouteMuteIcon(muted);
        return;
      }
      var btn = e.target && e.target.closest ? e.target.closest('[data-output-primary],[data-output-mirror]') : null;
      if (!btn || !container.contains(btn)) return;
      if (btn.hasAttribute('data-output-primary')) {
        setAudioOutputDevice(btn.getAttribute('data-output-primary') || '', true);
        return;
      }
      if (btn.hasAttribute('data-output-mirror')) {
        toggleAudioOutputMirrorDevice(btn.getAttribute('data-output-mirror') || '');
        return;
      }
    });
  }
}
function bindAudioOutputControls() {
  var outputList = document.getElementById('audio-output-list');
  var workflowBody = document.getElementById('audio-output-workflow-body');
  bindAudioRouteSelectionEvents(outputList);
  bindAudioRouteSelectionEvents(workflowBody);
  bindAudioRouteWorkflowPointerEvents(outputList);
  bindAudioRouteWorkflowPointerEvents(workflowBody);
  renderAudioOutputDeviceUi();
  refreshAudioOutputDevices(false);
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener && !bindAudioOutputControls._deviceChangeBound) {
    bindAudioOutputControls._deviceChangeBound = true;
    navigator.mediaDevices.addEventListener('devicechange', function () { refreshAudioOutputDevices(false); });
  }
}
function readAudioOutputDevicePreference() {
  try { return localStorage.getItem(AUDIO_OUTPUT_DEVICE_STORE_KEY) || ''; } catch (e) { return ''; }
}
function saveAudioOutputDevicePreference() {
  try { localStorage.setItem(AUDIO_OUTPUT_DEVICE_STORE_KEY, audioOutputDeviceId || ''); } catch (e) { }
}
function normalizeAudioOutputIdList(list) {
  var seen = Object.create(null);
  return (Array.isArray(list) ? list : []).map(function (id) { return String(id || '').trim(); }).filter(function (id) {
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  }).slice(0, 16);
}
function readAudioOutputMirrorPreference() {
  try {
    return normalizeAudioOutputIdList(JSON.parse(localStorage.getItem(AUDIO_OUTPUT_MIRROR_STORE_KEY) || '[]'));
  } catch (e) { return []; }
}
function saveAudioOutputMirrorPreference() {
  audioRouteSelectedIds().forEach(function (id) {
    var device = audioOutputDeviceById(id);
    if (device) setAudioRouteSetting(id, 'name', device.label || '输出设备');
  });
  try { localStorage.setItem(AUDIO_OUTPUT_MIRROR_STORE_KEY, JSON.stringify(normalizeAudioOutputIdList(audioOutputMirrorDeviceIds))); } catch (e) { }
}
function audioOutputMirrorSinkSupported() {
  return typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype && typeof HTMLMediaElement.prototype.setSinkId === 'function';
}
function audioOutputMirrorReadableError(e) {
  var name = e && e.name ? String(e.name) : '';
  if (name === 'NotAllowedError') return '没有输出权限';
  if (name === 'NotFoundError') return '设备不可用';
  if (name === 'AbortError') return '切换失败';
  if (name === 'NotSupportedError') return '内核不支持';
  return '播放失败';
}
function markAudioOutputMirrorRuntime(id, state, message) {
  id = String(id || '');
  if (!id) return;
  if (!audioOutputMirrorRuntime) audioOutputMirrorRuntime = {};
  var prev = audioOutputMirrorRuntime[id] || {};
  message = String(message || '');
  if (prev.state === state && prev.message === message) return;
  audioOutputMirrorRuntime[id] = { state: state, message: message, at: Date.now() };
  if (state === 'playing' && typeof audioOutputMirrorStall !== 'undefined') delete audioOutputMirrorStall[id];
  if (markAudioOutputMirrorRuntime.renderPending) return;
  markAudioOutputMirrorRuntime.renderPending = true;
  var schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); };
  schedule(function () {
    markAudioOutputMirrorRuntime.renderPending = false;
    renderAudioOutputDeviceUi();
    renderAudioRouteWorkflowEdges();
  });
}
function audioOutputMirrorRuntimeFor(id) {
  id = String(id || '');
  return audioOutputMirrorRuntime && audioOutputMirrorRuntime[id] || null;
}
function audioOutputMirrorConfirmedCount(ids) {
  return normalizeAudioOutputIdList(ids).filter(function (id) {
    if (typeof microphoneMixerOutputRunning === 'function' && microphoneMixerOutputRunning(id)) return true;
    var rt = audioOutputMirrorRuntimeFor(id);
    return rt && rt.state === 'playing';
  }).length;
}
function audioOutputMirrorRouteClass(id) {
  if (typeof microphoneMixerOutputRunning === 'function' && microphoneMixerOutputRunning(id)) return 'workflow-link active mirror';
  var rt = audioOutputMirrorRuntimeFor(id);
  if (rt && rt.state === 'playing' && !audioRouteSetting(id).muted) return 'workflow-link active mirror';
  return 'workflow-link pending mirror';
}
function audioOutputMirrorStatusText(id, active, disabled) {
  if (disabled) return '当前主监听';
  if (typeof microphoneMixerOwnsOutput === 'function' && microphoneMixerOwnsOutput(id)) return microphoneMixerOutputRunning(id) ? '人声 + 音乐混音输出' : '混音正在开启';
  if (!active) return '点击连接';
  var rt = audioOutputMirrorRuntimeFor(id);
  if (!rt) return '播放时自动连接';
  if (rt.state === 'playing') return audioRouteSetting(id).muted ? '已静音' : '正在输出';
  if (rt.state === 'paused') return '随播放器暂停';
  return rt.message || '正在连接';
}

function readAudioInputBridgePreference() {
  try {
    var parsed = JSON.parse(localStorage.getItem(AUDIO_INPUT_BRIDGE_STORE_KEY) || '{}');
    return { enabled: !!parsed.enabled, deviceId: String(parsed.deviceId || '') };
  } catch (e) {
    return { enabled: false, deviceId: '' };
  }
}
function saveAudioInputBridgePreference() {
  try { localStorage.setItem(AUDIO_INPUT_BRIDGE_STORE_KEY, JSON.stringify(audioInputBridgeState || { enabled: false, deviceId: '' })); } catch (e) { }
}
function audioOutputDeviceById(deviceId) {
  deviceId = String(deviceId || '');
  return (audioOutputDevices || []).filter(function (device) { return device && device.deviceId === deviceId; })[0] || null;
}
function isVirtualMicOutputDevice(device) {
  var label = String(device && device.label || '').toLowerCase();
  return /cable input|vb-audio|voicemeeter|virtual|loopback|blackhole|sonar|stereo mix|立体声混音|虚拟|线缆/.test(label);
}


function audioOutputDeviceStatusText() {
  var primary = audioOutputDeviceById(audioOutputDeviceId);
  if (audioOutputPrimaryRuntime && audioOutputPrimaryRuntime.deviceId === audioOutputDeviceId && audioOutputPrimaryRuntime.state === 'error') return '主监听切换失败，请重试连接';
  var systemDefault = audioOutputDeviceById(audioOutputDefaultDeviceId);
  return audioOutputDeviceId ? (primary ? '主监听：' + audioOutputDeviceLabel(primary, 0) : '主监听离线，临时使用系统默认')
    : '主监听：系统默认' + (systemDefault && systemDefault.label ? '（' + systemDefault.label + '）' : '');
}
// Music sent to a virtual cable as the main output goes straight into the
// virtual microphone and is inaudible locally; that cable cannot be a mix target.
function audioRoutePrimaryVirtualAlert() {
  var primary = audioOutputDeviceById(effectiveAudioPrimaryId());
  if (!primary || !isVirtualMicOutputDevice(primary)) return '';
  var name = String(primary.label || '虚拟设备').replace(/\s*\(.*$/, '');
  return '主监听是虚拟声卡「' + name + '」：音乐直接进入虚拟麦克风，你自己听不到，也不能再作为混音目标。请把主监听切到耳机或音箱'
    + (audioOutputDeviceId ? '。' : '（Windows 默认播放设备当前就是它）。');
}

function audioOutputDeviceLabel(device, index) {
  if (!device || !device.deviceId) return '系统默认';
  return device.label || ('输出设备 ' + (index + 1));
}
function audioRouteMuteIcon(muted) {
  // Match the speaker glyph used by the player's volume control.
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
    (muted ? '<line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/>' : '<path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/>') + '</svg>';
}
function renderAudioOutputDeviceUi() {
  var list = document.getElementById('audio-output-list');
  if (!list) return;
  var ids = audioRouteVisibleIds();
  var count = ids.filter(function (id) { return id !== effectiveAudioPrimaryId(); }).length;
  var summary = audioOutputDeviceStatusText();
  list.innerHTML = '<button class="audio-output-summary-card" type="button" onclick="openAudioOutputWorkflowPanel()"><span class="route-node-icon">MR</span><span class="audio-output-summary-copy"><b>' + escHtml(summary) + '</b><small>附加输出 ' + count + ' 路 · 正在输出 ' + audioOutputMirrorConfirmedCount(ids) + ' 路</small></span><span class="audio-output-summary-action">路由</span></button>';
  var body = document.getElementById('audio-output-workflow-body');
  var modal = document.getElementById('audio-output-workflow-modal');
  // Rebuild from live state on open; hidden routing controls need no DOM churn.
  if (!body || !modal || !modal.classList.contains('show')) return;
  var outputs = (audioOutputDevices || []).slice();
  ids.concat([audioOutputDeviceId]).forEach(function (id) {
    if (id && !outputs.some(function (d) { return d.deviceId === id; })) outputs.push({ deviceId: id, label: audioRouteSetting(id).name || '已保存的离线设备', offline: true });
  });
  var primary = [{ deviceId: '', label: '系统默认' }].concat(outputs).map(function (device, index) {
    var id = device.deviceId, active = id === audioOutputDeviceId;
    var systemDefault = !id && typeof audioOutputDeviceById === 'function' && audioOutputDeviceById(audioOutputDefaultDeviceId);
    var hint = (device.offline ? '离线，等待恢复' : active ? '当前主监听' : '点击切换主监听') + (systemDefault && systemDefault.label ? ' · ' + systemDefault.label : '');
    return '<button type="button" class="audio-route-node output workflow-node' + (active ? ' active connected' : '') + '" data-output-primary="' + escHtml(id) + '" aria-pressed="' + active + '">' +
      '<span class="flow-port in" data-output-primary-target="' + escHtml(id) + '"></span><span class="route-node-text"><b>' + escHtml(audioOutputDeviceLabel(device, index)) + '</b><small>' + escHtml(hint) + '</small></span></button>';
  }).join('');
  function routeRow(device, index) {
    var id = device.deviceId, disabled = id === effectiveAudioPrimaryId(), active = ids.indexOf(id) >= 0 && !disabled;
    var value = audioRouteSetting(id), rt = audioOutputMirrorRuntimeFor(id);
    var warning = active && (device.offline || rt && /error|unsupported|stalled/.test(rt.state));
    return '<div class="audio-route-row' + (active ? ' connected' : '') + (warning ? ' warning' : '') + '">' +
      '<button type="button" class="audio-route-node mirror workflow-node' + (active ? ' active connected' : '') + '" data-output-mirror="' + escHtml(id) + '" aria-pressed="' + active + '"' + (disabled ? ' disabled' : '') + '>' +
      '<span class="flow-port in" data-output-mirror-target="' + escHtml(id) + '"></span><span class="route-node-text"><b>' + escHtml(audioOutputDeviceLabel(device, index)) + '</b><small>' + escHtml(audioOutputMirrorStatusText(id, active, disabled)) + '</small></span><span class="audio-route-toggle">' + (active ? '断开' : disabled ? '主监听' : '连接') + '</span></button>' +
      (active ? '<div class="audio-route-controls" data-route-id="' + escHtml(id) + '"><label>' + (typeof microphoneMixerOwnsOutput === 'function' && microphoneMixerOwnsOutput(id) ? '混音总音量' : '音乐音量') + ' <input type="range" min="0" max="100" value="' + value.volume + '" data-route-setting="volume" aria-label="' + escHtml(device.label + (typeof microphoneMixerOwnsOutput === 'function' && microphoneMixerOwnsOutput(id) ? ' 混音总音量' : ' 音乐音量')) + '"><output>' + value.volume + '%</output></label>' +
      '<label>延迟 <input type="number" inputmode="numeric" min="0" max="1000" step="10" value="' + value.delay + '" data-route-setting="delay" aria-label="' + escHtml(device.label + ' 延迟毫秒') + '"> ms</label>' +
      '<button type="button" data-route-mute aria-pressed="' + value.muted + '" aria-label="' + (value.muted ? '取消静音' : '静音') + '" title="' + (value.muted ? '取消静音' : '静音') + '">' + audioRouteMuteIcon(value.muted) + '</button></div>' : '') + '</div>';
  }
  var virtual = outputs.filter(isVirtualMicOutputDevice);
  var speakers = outputs.filter(function (d) { return !isVirtualMicOutputDevice(d); });
  var routeAlert = typeof audioRoutePrimaryVirtualAlert === 'function' ? audioRoutePrimaryVirtualAlert() : '';
  var focused = document.activeElement;
  if (body && body.contains(focused) && focused.matches('input,select,textarea,[data-route-mute],#audio-microphone-mixer button,#virtual-audio-setup-card button')) {
    if (!renderAudioOutputDeviceUi.focusRefreshBound) {
      renderAudioOutputDeviceUi.focusRefreshBound = true;
      body.addEventListener('focusout', function () { requestAnimationFrame(renderAudioOutputDeviceUi); });
    }
    // Keep the focused control, but never leave a row showing a stale state
    // (a drag-connect keeps focus on the previous slider or mixer button).
    if (typeof body.querySelectorAll === 'function') body.querySelectorAll('[data-output-mirror]').forEach(function (btn) {
      var id = btn.getAttribute('data-output-mirror') || '', small = btn.querySelector('.route-node-text small');
      var disabled = id === effectiveAudioPrimaryId(), active = ids.indexOf(id) >= 0 && !disabled;
      if (small) small.textContent = audioOutputMirrorStatusText(id, active, disabled);
    });
    if (typeof syncVirtualAudioSetupCard === 'function') syncVirtualAudioSetupCard({ routeOpen: true, enumerationComplete: audioOutputDeviceSnapshotKnown && audioOutputDeviceSnapshotObserved, outputs: audioOutputDevices });
    return;
  }
  if (body && audioRouteWorkflowDrag && body.contains(audioRouteWorkflowDrag.root)) cancelAudioRouteWorkflowDrag();
  if (body) body.innerHTML = '<div class="audio-route-graph"><svg id="audio-route-workflow-svg" class="workflow-link-layer audio-link-layer" aria-hidden="true"></svg>' +
    '<div class="audio-flow-source workflow-node"><span class="route-node-text"><b>Mineradio 音乐输出</b><small>同一音频流 · 跟随暂停、切歌和音效</small></span><span class="flow-port out" data-audio-route-source="player" title="拖到设备连接输出"></span></div>' +
    '<div class="audio-route-status"><b>已选择 ' + count + ' 路</b><small>点击设备即可连接或断开，也可从音源拖线连接。</small>' +
    (routeAlert ? '<p class="audio-route-alert" role="note">' + escHtml(routeAlert) + '</p>' : '') + '</div>' +
    '<div class="audio-route-board"><section class="route-lane primary"><div class="route-lane-head"><b>主监听</b><small>选择自己听音乐的设备</small></div><div class="route-node-grid">' + primary + '</div></section>' +
    '<section class="route-lane mirror"><div class="route-lane-head"><b>附加输出</b><small>可同时连接多个耳机、音箱或声卡</small></div><div class="route-node-grid">' + (speakers.map(routeRow).join('') || '<div class="audio-route-empty">暂无其他输出设备</div>') + '</div></section>' +
    '<section class="route-lane bridge"><div class="route-lane-head"><b>虚拟音频输出</b><small>把音乐送进语音、游戏软件</small></div><div class="route-node-grid">' + (virtual.map(routeRow).join('') || '<div class="audio-route-empty">没有找到虚拟声卡。安装 VB-CABLE 并重启电脑后再打开这里。</div>') + '</div><ol class="audio-route-steps"><li>点上面的 <b>CABLE Input</b> 连接。</li><li>在语音或游戏软件的麦克风设置里选 <b>CABLE Output</b>。</li></ol><p class="audio-route-note">这样对方只听得到音乐。想边说话边放歌，打开下方的「麦克风混音」。延迟一般不用改，只在这一路声音比你听到的早时调大。</p></section></div></div>';
  if (body && typeof mountMicrophoneMixerPanel === 'function') mountMicrophoneMixerPanel(body);
  if (typeof syncVirtualAudioSetupCard === 'function') syncVirtualAudioSetupCard({ routeOpen: true, enumerationComplete: audioOutputDeviceSnapshotKnown && audioOutputDeviceSnapshotObserved, outputs: audioOutputDevices });
  var subtitle = document.getElementById('audio-output-workflow-subtitle');
  if (subtitle) subtitle.textContent = summary;
  requestAnimationFrame(renderAudioRouteWorkflowEdges);
}

function openAudioOutputWorkflowPanel() {
  var modal = document.getElementById('audio-output-workflow-modal');
  if (!modal) return;
  openGsapModal(modal);
  if (typeof beginVirtualAudioSetupRoute === 'function') beginVirtualAudioSetupRoute();
  bindAudioOutputControls();
  renderAudioOutputDeviceUi();
  requestAnimationFrame(function () {
    renderAudioRouteWorkflowEdges();
    setTimeout(renderAudioRouteWorkflowEdges, 80);
  });
  refreshAudioOutputDevices(false);
}
function closeAudioOutputWorkflowPanel() {
  if (typeof hideVirtualAudioSetupCard === 'function') hideVirtualAudioSetupCard();
  cancelAudioRouteWorkflowDrag();
  closeGsapModal(document.getElementById('audio-output-workflow-modal'));
}
function updateAudioOutputDeviceSnapshot(devices, authorized) {
  var outputs = (devices || []).filter(function (device) { return device && device.kind === 'audiooutput'; });
  var identified = outputs.some(function (device) { return device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications' && String(device.label || '').trim(); });
  var hiddenOutput = outputs.some(function (device) { return device.deviceId !== 'default' && device.deviceId !== 'communications' && (!device.deviceId || !String(device.label || '').trim()); });
  var hiddenInput = (devices || []).some(function (device) { return device && device.kind === 'audioinput' && !String(device.label || '').trim(); });
  audioOutputDeviceSnapshotKnown = (identified && !hiddenOutput) || (!outputs.length && (!!authorized || !hiddenInput));
  audioOutputDeviceSnapshotObserved = true;
  outputs.forEach(function (device) { if (device.deviceId && device.label) audioOutputDeviceLabels[device.deviceId] = device.label; });
  audioOutputDevices = outputs.filter(function (device) { return device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications'; }).map(function (device) {
    return { kind: device.kind, deviceId: device.deviceId, groupId: device.groupId,
      label: device.label || audioOutputDeviceLabels[device.deviceId] || '' };
  });
  var defaultDevice = outputs.find(function (device) { return device.deviceId === 'default'; });
  var defaultPhysical = defaultDevice && defaultDevice.groupId && audioOutputDevices.find(function (device) { return device.groupId === defaultDevice.groupId; });
  audioOutputDefaultDeviceId = defaultPhysical ? defaultPhysical.deviceId : '';
}
async function refreshAudioOutputDevices(showNotice) {
  // A microphone-label refresh owns the shared device snapshot until it ends.
  // Ordinary output refreshes must neither revoke it nor overwrite it late.
  if (typeof microphoneMixerDiscovering !== 'undefined' && microphoneMixerDiscovering) return;
  invalidateAudioOutputSinkApplications();
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    audioOutputDevices = [];
    audioInputDevices = [];
    renderAudioOutputDeviceUi();
    if (showNotice) showToast('当前环境不支持输出接口选择');
    return;
  }
  var refreshToken = (refreshAudioOutputDevices.token || 0) + 1;
  refreshAudioOutputDevices.token = refreshToken;
  try {
    var devices = await navigator.mediaDevices.enumerateDevices();
    if (refreshToken !== refreshAudioOutputDevices.token) return;
    if (typeof updateAudioOutputDeviceSnapshot === 'function') updateAudioOutputDeviceSnapshot(devices, false);
    else {
      audioOutputDevices = devices.filter(function (device) { return device && device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== 'communications'; });
      var defaultDevice = devices.find(function (device) { return device.kind === 'audiooutput' && device.deviceId === 'default'; });
      var defaultPhysical = defaultDevice && defaultDevice.groupId && audioOutputDevices.find(function (device) { return device.groupId === defaultDevice.groupId; });
      audioOutputDefaultDeviceId = defaultPhysical ? defaultPhysical.deviceId : '';
    }
    if (typeof updateMicrophoneMixerInputSnapshot === 'function') updateMicrophoneMixerInputSnapshot(devices, false);
    else audioInputDevices = devices.filter(function (device) { return device && device.kind === 'audioinput' && device.deviceId !== 'default'; });
    if (typeof checkMicrophoneMixerDevices === 'function') checkMicrophoneMixerDevices();
    if (typeof audioOutputDeviceSnapshotKnown === 'undefined' || audioOutputDeviceSnapshotKnown) await applyAudioOutputDevice(audio);
    renderAudioOutputDeviceUi();
    if (showNotice) showToast('输出接口已刷新，麦克风可单独刷新');
  } catch (e) {
    if (refreshToken !== refreshAudioOutputDevices.token) return;
    renderAudioOutputDeviceUi();
    if (showNotice) showToast('输出接口读取失败');
  }
}
function bindAudioOutputMirrorEvents(media) {
  if (!media || media._mineradioAudioMirrorBound) return;
  media._mineradioAudioMirrorBound = true;
  ['play', 'playing', 'pause', 'ended', 'seeking', 'seeked', 'ratechange', 'volumechange', 'emptied'].forEach(function (name) {
    media.addEventListener(name, function () { syncAudioOutputMirrors(name); });
  });
}
function releaseAudioOutputMirrorResources(mirror, route) {
  if (mirror) { try { mirror.pause(); mirror.srcObject = null; } catch (_) { } }
  route = route || (mirror && mirror._route);
  if (!route || route.released) return;
  route.released = true;
  // Do not disconnect every branch on the shared player tap.
  try { if (route.tap && route.delay) route.tap.disconnect(route.delay); } catch (_) { }
  [route.delay, route.gain, route.destination].forEach(function (node) { try { if (node) node.disconnect(); } catch (_) { } });
  try {
    if (route.destination && route.destination.stream) route.destination.stream.getTracks().forEach(function (track) {
      try { track.stop(); } catch (_) { }
    });
  } catch (_) { }
}
function removeAudioOutputMirror(id) {
  var mirror = audioOutputMirrorElements[id];
  if (mirror) {
    delete audioOutputMirrorElements[id]; // Invalidate pending sink/play completions first.
    releaseAudioOutputMirrorResources(mirror);
  }
  delete audioOutputMirrorRuntime[id];
}

function clearAudioOutputMirrors() {
  Object.keys(audioOutputMirrorElements || {}).forEach(removeAudioOutputMirror);
  audioOutputMirrorRuntime = {};
  if (audioOutputMirrorSyncTimer) {
    clearInterval(audioOutputMirrorSyncTimer);
    audioOutputMirrorSyncTimer = 0;
  }
}
async function applyAudioOutputMirrorSink(mirror, sinkId) {
  try {
    markAudioOutputMirrorRuntime(sinkId, 'sink-pending', '正在连接设备');
    await mirror.setSinkId(sinkId);
    if (audioOutputMirrorElements[sinkId] !== mirror) return false;
    markAudioOutputMirrorRuntime(sinkId, 'sink-ready', '设备已连接');
    return true;
  } catch (e) {
    if (audioOutputMirrorElements[sinkId] === mirror) markAudioOutputMirrorRuntime(sinkId, 'sink-error', audioOutputMirrorReadableError(e));
    return false;
  }
}

function syncAudioOutputMirrors(reason) {
  var unknownOutputs = typeof audioOutputDeviceSnapshotKnown !== 'undefined' && !audioOutputDeviceSnapshotKnown;
  var ids = audioRouteSelectedIds().filter(function (id) { return id !== effectiveAudioPrimaryId() && !(typeof microphoneMixerOwnsOutput === 'function' && microphoneMixerOwnsOutput(id)); });
  Object.keys(audioOutputMirrorElements).forEach(function (id) {
    if (ids.indexOf(id) < 0) removeAudioOutputMirror(id);
  });
  if (!ids.length) { clearAudioOutputMirrors(); return; }
  var tap = audio && audioReady && audioCtx && audioCtx.state !== 'closed' && (gainNode || analyser);
  ids.forEach(function (id) {
    var mirror = audioOutputMirrorElements[id];
    if (mirror && (!tap || mirror._route.tap !== tap || (!unknownOutputs && !audioOutputDeviceById(id)) || (!unknownOutputs && !mirror._mineradioSinkReady && !mirror._mineradioSinkBusy && reason === 'apply-device'))) {
      removeAudioOutputMirror(id);
      mirror = null;
    }
    if (unknownOutputs && (!mirror || !mirror._mineradioSinkReady || typeof mirror.sinkId !== 'string' || mirror.sinkId !== id)) {
      if (mirror && mirror._mineradioSinkReady && mirror.sinkId !== id) mirror.pause();
      markAudioOutputMirrorRuntime(id, 'waiting', '设备列表未完整读取，刷新接口后重连'); return;
    }
    if (!unknownOutputs && !audioOutputDeviceById(id)) { markAudioOutputMirrorRuntime(id, 'disconnected', '设备离线，重连后自动恢复'); return; }
    if (!audioOutputMirrorSinkSupported()) { markAudioOutputMirrorRuntime(id, 'unsupported', '当前内核不支持输出选择'); return; }
    if (!tap) { markAudioOutputMirrorRuntime(id, 'waiting', '播放时自动连接'); return; }
    if (!mirror) {
      var construction = { tap: tap, delay: null, gain: null, destination: null, released: false };
      try {
        var delay = construction.delay = audioCtx.createDelay(1);
        var level = construction.gain = audioCtx.createGain();
        var destination = construction.destination = audioCtx.createMediaStreamDestination();
        mirror = new Audio();
        mirror._route = construction;
        audioOutputMirrorElements[id] = mirror;
        tap.connect(delay); delay.connect(level); level.connect(destination);
        mirror.srcObject = destination.stream;
        mirror._mineradioSinkBusy = true;
        applyAudioOutputMirrorSink(mirror, id).then(function (ok) {
          if (audioOutputMirrorElements[id] !== mirror) return;
          mirror._mineradioSinkBusy = false;
          mirror._mineradioSinkReady = ok;
          if (ok) syncAudioOutputMirrors('sink-ready');
        });
      } catch (e) {
        if (audioOutputMirrorElements[id] === mirror) delete audioOutputMirrorElements[id];
        releaseAudioOutputMirrorResources(mirror, construction);
        markAudioOutputMirrorRuntime(id, 'unsupported', '音频分发初始化失败，请重新播放');
        return;
      }
    }
    applyAudioRouteSettings(id);
    if (!mirror._mineradioSinkReady) return;
    if (audio.paused || audio.ended) {
      mirror.pause();
      markAudioOutputMirrorRuntime(id, 'paused', '随播放器暂停');
    } else if (mirror.paused && !mirror._routePlayPending && (reason !== 'clock' || !audioOutputMirrorRuntimeFor(id) || audioOutputMirrorRuntimeFor(id).state !== 'play-error')) {
      mirror._routePlayPending = true;
      markAudioOutputMirrorRuntime(id, 'play-pending', '正在启用');
      Promise.resolve().then(function () {
        if (audioOutputMirrorElements[id] !== mirror || audio.paused || audio.ended) return;
        return mirror.play();
      }).then(function () {
        if (audioOutputMirrorElements[id] !== mirror) return;
        mirror._routePlayPending = false;
        if (audio.paused || audio.ended) { mirror.pause(); markAudioOutputMirrorRuntime(id, 'paused', '随播放器暂停'); }
        else markAudioOutputMirrorRuntime(id, 'playing', '正在输出');
      }).catch(function (e) {
        if (audioOutputMirrorElements[id] !== mirror) return;
        mirror._routePlayPending = false;
        markAudioOutputMirrorRuntime(id, e && e.name === 'AbortError' ? 'waiting' : 'play-error', audioOutputMirrorReadableError(e));
      });
    }
  });
  if (reason === 'clock' && audio && !audio.paused && !audio.ended && typeof checkStalledAudioOutputMirrors === 'function') checkStalledAudioOutputMirrors(ids);
  if (!audioOutputMirrorSyncTimer) audioOutputMirrorSyncTimer = setInterval(function () { syncAudioOutputMirrors('clock'); }, 2200);
}
// A route still "connecting" while music plays gets one silent rebuild, then a
// plain message instead of an endless pending state.
var audioOutputMirrorStall = Object.create(null);
function checkStalledAudioOutputMirrors(ids) {
  ids.forEach(function (id) {
    var rt = audioOutputMirrorRuntimeFor(id);
    if (!rt || !/^(sink-pending|sink-ready|play-pending|waiting)$/.test(rt.state) || Date.now() - rt.at < 6000) return;
    var stall = audioOutputMirrorStall[id] || (audioOutputMirrorStall[id] = { retried: false, notified: false });
    if (!stall.retried) {
      stall.retried = true;
      removeAudioOutputMirror(id);
      markAudioOutputMirrorRuntime(id, 'sink-pending', '正在重新连接');
      syncAudioOutputMirrors('stall-retry');
      return;
    }
    var name = String((audioOutputDeviceById(id) || {}).label || '这个设备').replace(/\s*\(.*$/, '');
    markAudioOutputMirrorRuntime(id, 'stalled', '连不上，可断开后重连，或用下方「麦克风混音」输出');
    if (!stall.notified && typeof showToast === 'function') {
      stall.notified = true;
      showToast(name + ' 连接超时：断开后重新连接；仍不行请用「麦克风混音」输出到它');
    }
  });
}
function audioRouteVisibleIds() {
  var ids = audioRouteSelectedIds();
  var mixed = typeof microphoneMixerVisibleTarget === 'function' && microphoneMixerVisibleTarget();
  if (mixed && ids.indexOf(mixed) < 0) ids.push(mixed);
  return ids;
}
function audioRouteSelectedIds() {
  var ids = normalizeAudioOutputIdList(audioOutputMirrorDeviceIds);
  // Keep the old single bridge preference working until the user changes it.
  if (audioInputBridgeState && audioInputBridgeState.enabled) ids.push(audioInputBridgeState.deviceId);
  return normalizeAudioOutputIdList(ids);
}
function readAudioRouteSettings() {
  try { return JSON.parse(localStorage.getItem('mineradio-audio-route-settings-v1') || '{}') || {}; } catch (_) { return {}; }
}
var audioRouteSettings = readAudioRouteSettings();
if (typeof audioRouteSettings !== 'object' || Array.isArray(audioRouteSettings)) audioRouteSettings = {};
var audioOutputDefaultDeviceId = '';
var audioOutputDeviceSnapshotKnown = true, audioOutputDeviceSnapshotObserved = false, audioOutputDeviceLabels = Object.create(null);
var audioOutputPrimaryRuntime = null;
function effectiveAudioPrimaryId() {
  return audioOutputDeviceById(audioOutputDeviceId) ? audioOutputDeviceId : audioOutputDefaultDeviceId;
}
function audioRouteSetting(id) {
  var value = Object.prototype.hasOwnProperty.call(audioRouteSettings, id) && audioRouteSettings[id] || {};
  return { name: String(value.name || ''), volume: Math.max(0, Math.min(100, isFinite(value.volume) ? Number(value.volume) : 100)), muted: !!value.muted,
    delay: Math.max(0, Math.min(1000, Number(value.delay) || 0)) };
}
function applyAudioRouteSettings(id) {
  var mirror = audioOutputMirrorElements[id];
  if (!mirror || !mirror._route) return;
  var value = audioRouteSetting(id);
  var now = audioCtx.currentTime;
  mirror._route.gain.gain.setTargetAtTime(value.muted ? 0 : value.volume / 100, now, 0.015);
  mirror._route.delay.delayTime.setTargetAtTime(value.delay / 1000, now, 0.015);
  mirror.muted = !!audio.muted;
}
function setAudioRouteSetting(id, key, value) {
  if (['volume', 'muted', 'delay', 'name'].indexOf(key) < 0) return;
  var setting = audioRouteSetting(id);
  setting[key] = key === 'muted' ? !!value : key === 'name' ? String(value || '') : Math.max(0, Math.min(key === 'volume' ? 100 : 1000, Number(value) || 0));
  Object.defineProperty(audioRouteSettings, id, { value: setting, writable: true, enumerable: true, configurable: true });
  try { localStorage.setItem('mineradio-audio-route-settings-v1', JSON.stringify(audioRouteSettings)); } catch (_) { }
  applyAudioRouteSettings(id);
  if (typeof microphoneMixerOwnsOutput === 'function' && microphoneMixerOwnsOutput(id)) applyMicrophoneMixerLevels();
}
function retryAudioRoutes() {
  invalidateAudioOutputSinkApplications();
  clearAudioOutputMirrors();
  applyAudioOutputDevice(audio);
}
function disconnectAdditionalAudioRoutes() {
  invalidateAudioOutputSinkApplications();
  audioOutputMirrorDeviceIds = [];
  audioInputBridgeState = { enabled: false, deviceId: '' };
  if (typeof stopMicrophoneMixer === 'function') stopMicrophoneMixer();
  saveAudioOutputMirrorPreference(); saveAudioInputBridgePreference();
  clearAudioOutputMirrors(); renderAudioOutputDeviceUi();
}

// A MediaElementSource takes over the element's output: Chromium rejects its
// setSinkId (AbortError) and the audible route is the AudioContext sink.
function audioMediaRoutedThroughWebAudio(media) {
  if (!media || typeof source === 'undefined' || typeof audioSourceMedia === 'undefined' || typeof audioReady === 'undefined') return false;
  return !!(audioReady && source && audioSourceMedia === media && !source.__mineradioUsesCapture);
}
var audioOutputApplyQueue = Promise.resolve();
var audioOutputSinkApplications = new WeakMap();
var audioOutputSinkEpoch = 0;
function invalidateAudioOutputSinkApplications() {
  audioOutputSinkEpoch++;
  audioOutputSinkApplications = new WeakMap();
}
function applyAudioOutputDevice(media) {
  var requestedId = audioOutputDeviceId;
  audioOutputApplyQueue = audioOutputApplyQueue.catch(function () {}).then(function () { return applyAudioOutputDeviceNow(media, requestedId); });
  return audioOutputApplyQueue;
}
async function applyAudioOutputDeviceNow(media, requestedId) {
  if (requestedId == null) requestedId = audioOutputDeviceId;
  // A privacy-limited list is not evidence that the chosen sink disappeared.
  // Keep its actual binding; never redirect it to the system default on a guess.
  if (typeof audioOutputDeviceSnapshotKnown !== 'undefined' && !audioOutputDeviceSnapshotKnown && requestedId && !audioOutputDeviceById(requestedId)) return null;
  var sinkId = requestedId && audioOutputDeviceById(requestedId) ? requestedId : '';
  var sinkEpoch = audioOutputSinkEpoch;
  var hasTarget = !!(media || audioCtx || uiSfxCtx);
  var mediaResult = null;
  var contextResult = null;
  var sfxResult = null;
  var errors = [];
  async function applySink(target, label) {
    if (!target) return null;
    if (typeof target.setSinkId !== 'function') return false;
    try {
      var applied = audioOutputSinkApplications.get(target);
      // An identity cache alone cannot detect an externally changed/default
      // route. Skip only a successful application verified on the actual target.
      if (applied && applied.epoch === sinkEpoch && applied.sinkId === sinkId
        && typeof target.sinkId === 'string' && target.sinkId === sinkId
        && target.state !== 'closed') return true;
      await target.setSinkId(sinkId);
      if (sinkEpoch === audioOutputSinkEpoch) audioOutputSinkApplications.set(target, { sinkId: sinkId, epoch: sinkEpoch });
      return true;
    } catch (e) {
      audioOutputSinkApplications.delete(target);
      errors.push({ label: label, error: e });
      return false;
    }
  }
  bindAudioOutputMirrorEvents(media);
  if (!(typeof audioMediaRoutedThroughWebAudio === 'function' && audioMediaRoutedThroughWebAudio(media))) mediaResult = await applySink(media, 'audio');
  contextResult = await applySink(audioCtx, 'audio-context');
  sfxResult = await applySink(uiSfxCtx, 'ui-sfx');
  if (typeof checkMicrophoneMixerDevices === 'function') checkMicrophoneMixerDevices();
  var webAudioRouteActive = !!(audioReady && audioCtx && gainNode);
  var ok = webAudioRouteActive ? contextResult === true : (mediaResult === true || contextResult === true);
  if (sfxResult === true && !webAudioRouteActive && !media) ok = true;
  audioOutputPrimaryRuntime = { deviceId: requestedId, state: ok ? 'ready' : hasTarget ? 'error' : 'waiting' };
  syncAudioOutputMirrors('apply-device');
  if (ok) {
    renderAudioOutputDeviceUi();
    return true;
  }
  if (!hasTarget) {
    renderAudioOutputDeviceUi();
    return null;
  }
  if (errors.length) {
    console.warn('[AudioOutput]', errors);
  }
  renderAudioOutputDeviceUi();
  return false;
}
function setAudioOutputDevice(deviceId, showNotice) {
  audioOutputDeviceId = String(deviceId || '');
  if (typeof checkMicrophoneMixerDevices === 'function') checkMicrophoneMixerDevices();
  var requestedDeviceId = audioOutputDeviceId;
  saveAudioOutputMirrorPreference();
  saveAudioOutputDevicePreference();
  renderAudioOutputDeviceUi();
  Promise.resolve(applyAudioOutputDevice(audio)).then(function (ok) {
    if (!showNotice || requestedDeviceId !== audioOutputDeviceId) return;
    if (!requestedDeviceId) showToast('已切回系统默认输出');
    else if (ok === true) showToast('输出接口已切换');
    else if (ok === null) showToast('输出接口已保存，播放时自动启用');
    else if (audioReady && audioCtx && typeof audioCtx.setSinkId !== 'function') showToast('当前内核不支持频谱输出实时切换，已保存选择');
    else showToast('当前输出接口暂不可用，已保存选择');
  });
}
function toggleAudioOutputMirrorDevice(deviceId) {
  deviceId = String(deviceId || '');
  if (!deviceId) return;
  if (!audioOutputMirrorSinkSupported()) {
    markAudioOutputMirrorRuntime(deviceId, 'unsupported', '内核不支持');
    showToast('当前内核不支持多路输出');
    return;
  }
  if (deviceId === effectiveAudioPrimaryId()) {
    showToast('这个接口已经是主输出');
    return;
  }
  var ids = audioRouteSelectedIds();
  var pos = ids.indexOf(deviceId);
  if (typeof audioOutputMirrorStall !== 'undefined') delete audioOutputMirrorStall[deviceId];
  if (typeof microphoneMixerOwnsOutput === 'function' && microphoneMixerOwnsOutput(deviceId)) {
    stopMicrophoneMixer('');
    if (pos < 0) { renderAudioOutputDeviceUi(); return; }
  }
  if (pos >= 0) {
    ids.splice(pos, 1);
    removeAudioOutputMirror(deviceId);
    showToast('已断开此路输出');
  } else {
    if (ids.length >= 16) { showToast('最多同时连接 16 路输出'); return; }
    ids.push(deviceId);
    markAudioOutputMirrorRuntime(deviceId, audio && (audio.currentSrc || audio.src || '') ? 'sink-pending' : 'waiting', audio && (audio.currentSrc || audio.src || '') ? '正在尝试' : '待播放时尝试');
    showToast(audio && (audio.currentSrc || audio.src || '') ? '正在尝试多路输出' : '已保存多路输出，播放时尝试启用');
  }
  audioInputBridgeState = { enabled: false, deviceId: '' };
  saveAudioInputBridgePreference();
  audioOutputMirrorDeviceIds = normalizeAudioOutputIdList(ids);
  saveAudioOutputMirrorPreference();
  renderAudioOutputDeviceUi();
  syncAudioOutputMirrors('mirror-toggle');
}
