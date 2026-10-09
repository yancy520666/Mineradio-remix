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
  if (provider === 'spotify') return 'Spotify 匹配源';
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
  if (provider === 'spotify') return 'SP';
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
function playbackQualityRuntimeCapForSong(song, provider) {
  if (!song) return null;
  var key = playbackQualityTrackKey(song, provider);
  return key && playbackQualityRuntimeCaps ? playbackQualityRuntimeCaps[key] || null : null;
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
function markPlaybackQualityRuntimeCap(song, provider, ceiling, reason) {
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  if (!song || !ceiling) return false;
  ceiling = normalizePlaybackQualityForProvider(ceiling, provider);
  var key = playbackQualityTrackKey(song, provider);
  if (!key) return false;
  var prev = playbackQualityRuntimeCaps && playbackQualityRuntimeCaps[key];
  if (prev && playbackQualityRank(prev.ceiling, provider) <= playbackQualityRank(ceiling, provider)) return false;
  playbackQualityRuntimeCaps[key] = {
    provider: provider,
    ceiling: ceiling,
    reason: reason || '',
    at: Date.now()
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
    spotify: PLAYBACK_QUALITY_DEFAULTS.spotify
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
        spotify: normalizePlaybackQualityForProvider(fallback.spotify, 'spotify')
      };
    }
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      netease: normalizePlaybackQualityForProvider(parsed.netease || fallback.netease, 'netease'),
      qq: normalizePlaybackQualityForProvider(parsed.qq || fallback.qq, 'qq'),
      kugou: normalizePlaybackQualityForProvider(parsed.kugou || fallback.kugou || 'lossless', 'kugou'),
      qishui: normalizePlaybackQualityForProvider(parsed.qishuiTiers ? (parsed.qishui || fallback.qishui) : fallback.qishui, 'qishui'),
      spotify: normalizePlaybackQualityForProvider(parsed.spotify || fallback.spotify || 'standard', 'spotify')
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
  var localTrack = isLocalQualitySong(currentSong);
  if (wrap) {
    wrap.classList.toggle('quality-control-local', localTrack);
    if (localTrack) wrap.classList.remove('open');
  }
  var canUseSvip = provider === 'netease' && hasProviderSvip('netease', loginStatus);
  var displayQuality = provider === 'netease' && effectiveQuality === 'jymaster' && !canUseSvip ? 'hires' : effectiveQuality;
  if (label) label.textContent = playbackQualityShortLabel(displayQuality, provider);
  var qualityProviderTitle = provider === 'spotify' ? 'Spotify 匹配源: ' : (provider === 'qishui' ? '汽水音质: ' : (provider === 'qq' ? 'QQ 音质: ' : (provider === 'kugou' ? '酷狗音质: ' : '网易云音质: ')));
  if (btn) btn.title = qualityProviderTitle + playbackQualityLabel(displayQuality, provider) +
    (provider === 'netease' && currentQuality === 'jymaster' && !canUseSvip ? ' · 超清母带需网易云 SVIP' : '');
  if (btn && runtimeCapQuality) btn.title += ' | 当前歌曲最高: ' + playbackQualityLabel(runtimeCapQuality, provider);
  if (list) {
    list.innerHTML = playbackQualityOptions(provider).map(function (item) {
      var capLocked = playbackQualityAboveCap(item.key, provider, runtimeCapQuality);
      var locked = !!(item.svip && !canUseSvip) || capLocked;
      return '<button class="quality-option' + (item.svip ? ' svip-only' : '') + (capLocked ? ' cap-locked' : '') + (locked ? ' locked' : '') + '" data-quality="' + item.key + '" data-svip="' + (item.svip ? '1' : '0') + '" ' + (locked ? 'disabled ' : '') + 'onclick="setPlaybackQuality(\'' + item.key + '\')"><span>' + escHtml(item.title) + '</span><small>' + escHtml(capLocked ? ('当前最高 ' + playbackQualityLabel(runtimeCapQuality, provider)) : item.sub) + '</small></button>';
    }).join('');
  }
  document.querySelectorAll('.quality-option').forEach(function (option) {
    var q = normalizePlaybackQualityForProvider(option.dataset.quality, provider);
    var capLocked = playbackQualityAboveCap(q, provider, runtimeCapQuality);
    var locked = (option.dataset.svip === '1' && !canUseSvip) || capLocked;
    option.classList.toggle('active', q === displayQuality);
    option.classList.toggle('locked', locked);
    option.classList.toggle('cap-locked', capLocked);
    option.disabled = locked;
    if (capLocked) option.title = '当前歌曲最高: ' + playbackQualityLabel(runtimeCapQuality, provider);
    option.title = locked ? '需要网易云 SVIP 账号' : playbackQualityLabel(q, provider);
  });
  if (runtimeCapQuality) {
    document.querySelectorAll('.quality-option.cap-locked').forEach(function (option) {
      option.title = '当前歌曲最高: ' + playbackQualityLabel(runtimeCapQuality, provider);
    });
  }
  if (typeof syncQualityPresetUi === 'function') syncQualityPresetUi();
}
function setPlaybackQuality(value) {
  var provider = currentPlaybackQualityProvider();
  var currentSong = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  var next = normalizePlaybackQualityForProvider(value, provider);
  var cap = playbackQualityCapValue(currentSong, provider);
  if (playbackQualityAboveCap(next, provider, cap)) {
    showSourceFallbackNotice('音质已锁定上限', '当前歌曲最高可播 ' + playbackQualityLabel(cap, provider) + '，更高档位已禁用。');
    updatePlaybackQualityUi();
    return;
  }
  if (provider === 'netease' && next === 'jymaster' && !hasProviderSvip('netease', loginStatus)) {
    showToast(hasPlatformLogin('netease') ? '超清母带需要网易云 SVIP' : '登录网易云 SVIP 后可用超清母带');
    if (!hasPlatformLogin('netease')) openProviderLogin('netease');
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
  changes.forEach(function (change) {
    if (getProviderPlaybackQuality(change.provider) === normalizePlaybackQualityForProvider(change.value, change.provider)) return;
    setProviderPlaybackQuality(change.provider, change.value);
    if (change.provider === provider) changedCurrent = getProviderPlaybackQuality(provider);
  });
  updatePlaybackQualityUi();
  var song = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  if (changedCurrent && canReloadCurrentTrackForQuality()) {
    applyPlaybackQualityToCurrentTrack(effectivePlaybackQualityForSong(song, provider, changedCurrent), provider);
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
    x: portRect.left + portRect.width / 2 - rootRect.left,
    y: portRect.top + portRect.height / 2 - rootRect.top
  };
}
function audioRoutePointFromEvent(e, root) {
  if (!e || !root) return null;
  var rootRect = root.getBoundingClientRect();
  return { x: e.clientX - rootRect.left, y: e.clientY - rootRect.top };
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
  audioRouteSelectedIds().forEach(function (id) {
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
function finishAudioRouteWorkflowDrag(e) {
  if (!audioRouteWorkflowDrag) return;
  var root = audioRouteWorkflowDrag.root;
  var target = document.elementFromPoint(e.clientX, e.clientY);
  var port = target && target.closest ? target.closest('.flow-port.in') : null;
  if (root && port && root.contains(port)) {
    if (port.hasAttribute('data-output-primary-target')) {
      setAudioOutputDevice(port.getAttribute('data-output-primary-target') || '', true);
    } else if (port.hasAttribute('data-output-mirror-target')) {
      var routeId = port.getAttribute('data-output-mirror-target') || '';
      if (audioRouteSelectedIds().indexOf(routeId) < 0) toggleAudioOutputMirrorDevice(routeId);

    }
  }
  if (root) root.classList.remove('dragging-line');
  audioRouteWorkflowDrag = null;
  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { }
  requestAnimationFrame(renderAudioRouteWorkflowEdges);
}
function bindAudioRouteWorkflowPointerEvents(outputList) {
  if (!outputList || outputList._routeWorkflowBound) return;
  outputList._routeWorkflowBound = true;
  outputList.addEventListener('pointerdown', function (e) {
    var port = e.target && e.target.closest ? e.target.closest('.flow-port.out[data-audio-route-source]') : null;
    if (!port || !outputList.contains(port)) return;
    var root = port.closest('.audio-route-graph');
    audioRouteWorkflowDrag = { root: root, port: port };
    if (root) root.classList.add('dragging-line');
    try { outputList.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
    e.stopPropagation();
    renderAudioRouteWorkflowEdges(root ? audioRoutePointFromEvent(e, root) : null);
  });
  outputList.addEventListener('pointermove', function (e) {
    if (!audioRouteWorkflowDrag || !audioRouteWorkflowDrag.root) return;
    e.preventDefault();
    renderAudioRouteWorkflowEdges(audioRoutePointFromEvent(e, audioRouteWorkflowDrag.root));
  });
  outputList.addEventListener('pointerup', finishAudioRouteWorkflowDrag);
  outputList.addEventListener('scroll', function () { requestAnimationFrame(renderAudioRouteWorkflowEdges); }, true);
  outputList.addEventListener('pointercancel', function (e) {
    if (audioRouteWorkflowDrag && audioRouteWorkflowDrag.root) audioRouteWorkflowDrag.root.classList.remove('dragging-line');
    audioRouteWorkflowDrag = null;
    try { outputList.releasePointerCapture(e.pointerId); } catch (_) { }
    renderAudioRouteWorkflowEdges();
  });
  if (!bindAudioRouteWorkflowPointerEvents._resizeBound) {
    bindAudioRouteWorkflowPointerEvents._resizeBound = true;
    window.addEventListener('resize', function () { requestAnimationFrame(renderAudioRouteWorkflowEdges); });
    window.addEventListener('orientationchange', function () { requestAnimationFrame(renderAudioRouteWorkflowEdges); });
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
    var rt = audioOutputMirrorRuntimeFor(id);
    return rt && rt.state === 'playing';
  }).length;
}
function audioOutputMirrorRouteClass(id) {
  var rt = audioOutputMirrorRuntimeFor(id);
  if (rt && rt.state === 'playing' && !audioRouteSetting(id).muted) return 'workflow-link active mirror';
  return 'workflow-link pending mirror';
}
function audioOutputMirrorStatusText(id, active, disabled) {
  if (disabled) return '当前主监听';
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
  return audioOutputDeviceId ? (primary ? '主监听：' + audioOutputDeviceLabel(primary, 0) : '主监听离线，临时使用系统默认') : '主监听：系统默认';
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
  var ids = audioRouteSelectedIds();
  var outputs = (audioOutputDevices || []).slice();
  ids.concat([audioOutputDeviceId]).forEach(function (id) {
    if (id && !outputs.some(function (d) { return d.deviceId === id; })) outputs.push({ deviceId: id, label: audioRouteSetting(id).name || '已保存的离线设备', offline: true });
  });
  var primary = [{ deviceId: '', label: '系统默认' }].concat(outputs).map(function (device, index) {
    var id = device.deviceId, active = id === audioOutputDeviceId;
    return '<button type="button" class="audio-route-node output workflow-node' + (active ? ' active connected' : '') + '" data-output-primary="' + escHtml(id) + '" aria-pressed="' + active + '">' +
      '<span class="flow-port in" data-output-primary-target="' + escHtml(id) + '"></span><span class="route-node-text"><b>' + escHtml(audioOutputDeviceLabel(device, index)) + '</b><small>' + (device.offline ? '离线，等待恢复' : active ? '当前主监听' : '点击切换主监听') + '</small></span></button>';
  }).join('');
  function routeRow(device, index) {
    var id = device.deviceId, disabled = id === effectiveAudioPrimaryId(), active = ids.indexOf(id) >= 0 && !disabled;
    var value = audioRouteSetting(id), rt = audioOutputMirrorRuntimeFor(id);
    var warning = active && (device.offline || rt && /error|unsupported/.test(rt.state));
    return '<div class="audio-route-row' + (active ? ' connected' : '') + (warning ? ' warning' : '') + '">' +
      '<button type="button" class="audio-route-node mirror workflow-node' + (active ? ' active connected' : '') + '" data-output-mirror="' + escHtml(id) + '" aria-pressed="' + active + '"' + (disabled ? ' disabled' : '') + '>' +
      '<span class="flow-port in" data-output-mirror-target="' + escHtml(id) + '"></span><span class="route-node-text"><b>' + escHtml(audioOutputDeviceLabel(device, index)) + '</b><small>' + escHtml(audioOutputMirrorStatusText(id, active, disabled)) + '</small></span><span class="audio-route-toggle">' + (active ? '断开' : disabled ? '主监听' : '连接') + '</span></button>' +
      (active ? '<div class="audio-route-controls" data-route-id="' + escHtml(id) + '"><label>音量 <input type="range" min="0" max="100" value="' + value.volume + '" data-route-setting="volume" aria-label="' + escHtml(device.label + ' 音量') + '"><output>' + value.volume + '%</output></label>' +
      '<label>延迟 <input type="number" inputmode="numeric" min="0" max="1000" step="10" value="' + value.delay + '" data-route-setting="delay" aria-label="' + escHtml(device.label + ' 延迟毫秒') + '"> ms</label>' +
      '<button type="button" data-route-mute aria-pressed="' + value.muted + '" aria-label="' + (value.muted ? '取消静音' : '静音') + '" title="' + (value.muted ? '取消静音' : '静音') + '">' + audioRouteMuteIcon(value.muted) + '</button></div>' : '') + '</div>';
  }
  var virtual = outputs.filter(isVirtualMicOutputDevice);
  var speakers = outputs.filter(function (d) { return !isVirtualMicOutputDevice(d); });
  var count = ids.filter(function (id) { return id !== effectiveAudioPrimaryId(); }).length;
  var summary = audioOutputDeviceStatusText();
  list.innerHTML = '<button class="audio-output-summary-card" type="button" onclick="openAudioOutputWorkflowPanel()"><span class="route-node-icon">MR</span><span class="audio-output-summary-copy"><b>' + escHtml(summary) + '</b><small>附加输出 ' + count + ' 路 · 正在输出 ' + audioOutputMirrorConfirmedCount(ids) + ' 路</small></span><span class="audio-output-summary-action">路由</span></button>';
  var body = document.getElementById('audio-output-workflow-body');
  var focused = document.activeElement;
  if (body && body.contains(focused) && focused.matches('input,[data-route-mute]')) {
    if (!renderAudioOutputDeviceUi.focusRefreshBound) {
      renderAudioOutputDeviceUi.focusRefreshBound = true;
      body.addEventListener('focusout', function () { requestAnimationFrame(renderAudioOutputDeviceUi); });
    }
    return;
  }
  if (body) body.innerHTML = '<div class="audio-route-graph"><svg id="audio-route-workflow-svg" class="workflow-link-layer audio-link-layer" aria-hidden="true"></svg>' +
    '<div class="audio-flow-source workflow-node"><span class="route-node-text"><b>Mineradio 播放音频</b><small>同一音频流 · 跟随暂停、切歌和音效</small></span><span class="flow-port out" data-audio-route-source="player" title="拖到设备连接输出"></span></div>' +
    '<div class="audio-route-status"><b>已选择 ' + count + ' 路</b><small>点击设备即可连接或断开，也可从音源拖线连接。</small></div>' +
    '<div class="audio-route-board"><section class="route-lane primary"><div class="route-lane-head"><b>主监听</b><small>选择自己听音乐的设备</small></div><div class="route-node-grid">' + primary + '</div></section>' +
    '<section class="route-lane mirror"><div class="route-lane-head"><b>附加输出</b><small>可同时连接多个耳机、音箱或声卡</small></div><div class="route-node-grid">' + (speakers.map(routeRow).join('') || '<div class="audio-route-empty">暂无其他输出设备</div>') + '</div></section>' +
    '<section class="route-lane bridge"><div class="route-lane-head"><b>虚拟麦克风</b><small>支持同时连接多条虚拟声卡</small></div><div class="route-node-grid">' + (virtual.map(routeRow).join('') || '<div class="audio-route-empty">未检测到虚拟声卡，请安装 VB-Cable 或 Voicemeeter 后刷新。</div>') + '</div><p class="audio-route-note">选择虚拟声卡的播放端（如 CABLE Input），再在语音软件里选择对应录音端（CABLE Output）。普通实体麦克风无法直接接收播放音频。延迟补偿只增加所选输出的延迟，硬件延迟需按听感校准。</p></section></div></div>';
  var subtitle = document.getElementById('audio-output-workflow-subtitle');
  if (subtitle) subtitle.textContent = summary;
  requestAnimationFrame(renderAudioRouteWorkflowEdges);
}

function openAudioOutputWorkflowPanel() {
  var modal = document.getElementById('audio-output-workflow-modal');
  if (!modal) return;
  openGsapModal(modal);
  bindAudioOutputControls();
  renderAudioOutputDeviceUi();
  requestAnimationFrame(function () {
    renderAudioRouteWorkflowEdges();
    setTimeout(renderAudioRouteWorkflowEdges, 80);
  });
  refreshAudioOutputDevices(false);
}
function closeAudioOutputWorkflowPanel() {
  closeGsapModal(document.getElementById('audio-output-workflow-modal'));
}
async function refreshAudioOutputDevices(showNotice) {
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
    audioOutputDevices = devices.filter(function (device) { return device && device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== 'communications'; });
    var defaultDevice = devices.find(function (device) { return device.kind === 'audiooutput' && device.deviceId === 'default'; });
    var defaultPhysical = defaultDevice && defaultDevice.groupId && audioOutputDevices.find(function (device) { return device.groupId === defaultDevice.groupId; });
    audioOutputDefaultDeviceId = defaultPhysical ? defaultPhysical.deviceId : '';
    audioInputDevices = devices.filter(function (device) { return device && device.kind === 'audioinput' && device.deviceId !== 'default'; });
    await applyAudioOutputDevice(audio);
    renderAudioOutputDeviceUi();
    if (showNotice) showToast('输出接口已刷新');
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
function removeAudioOutputMirror(id) {
  var mirror = audioOutputMirrorElements[id];
  if (mirror) {
    delete audioOutputMirrorElements[id]; // Invalidate pending sink/play completions first.
    try { mirror.pause(); mirror.srcObject = null; } catch (_) { }
    var route = mirror._route;
    if (route) {
      try { route.tap.disconnect(route.delay); } catch (_) { }
      [route.delay, route.gain, route.destination].forEach(function (node) { try { node.disconnect(); } catch (_) { } });
      route.destination.stream.getTracks().forEach(function (track) { track.stop(); });
    }
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
  var ids = audioRouteSelectedIds().filter(function (id) { return id !== effectiveAudioPrimaryId(); });
  Object.keys(audioOutputMirrorElements).forEach(function (id) {
    if (ids.indexOf(id) < 0) removeAudioOutputMirror(id);
  });
  if (!ids.length) { clearAudioOutputMirrors(); return; }
  var tap = audio && audioReady && audioCtx && audioCtx.state !== 'closed' && (gainNode || analyser);
  ids.forEach(function (id) {
    var mirror = audioOutputMirrorElements[id];
    if (mirror && (!tap || mirror._route.tap !== tap || !audioOutputDeviceById(id) || (!mirror._mineradioSinkReady && !mirror._mineradioSinkBusy && reason === 'apply-device'))) {
      removeAudioOutputMirror(id);
      mirror = null;
    }
    if (!audioOutputDeviceById(id)) { markAudioOutputMirrorRuntime(id, 'disconnected', '设备离线，重连后自动恢复'); return; }
    if (!audioOutputMirrorSinkSupported()) { markAudioOutputMirrorRuntime(id, 'unsupported', '当前内核不支持输出选择'); return; }
    if (!tap) { markAudioOutputMirrorRuntime(id, 'waiting', '播放时自动连接'); return; }
    if (!mirror) {
      try {
        var delay = audioCtx.createDelay(1);
        var level = audioCtx.createGain();
        var destination = audioCtx.createMediaStreamDestination();
        mirror = new Audio();
        mirror._route = { tap: tap, delay: delay, gain: level, destination: destination };
        tap.connect(delay); delay.connect(level); level.connect(destination);
        mirror.srcObject = destination.stream;
        audioOutputMirrorElements[id] = mirror;
        mirror._mineradioSinkBusy = true;
        applyAudioOutputMirrorSink(mirror, id).then(function (ok) {
          if (audioOutputMirrorElements[id] !== mirror) return;
          mirror._mineradioSinkBusy = false;
          mirror._mineradioSinkReady = ok;
          if (ok) syncAudioOutputMirrors('sink-ready');
        });
      } catch (e) {
        if (mirror) removeAudioOutputMirror(id);
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
  if (!audioOutputMirrorSyncTimer) audioOutputMirrorSyncTimer = setInterval(function () { syncAudioOutputMirrors('clock'); }, 2200);
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
}
function retryAudioRoutes() {
  clearAudioOutputMirrors();
  applyAudioOutputDevice(audio);
}
function disconnectAdditionalAudioRoutes() {
  audioOutputMirrorDeviceIds = [];
  audioInputBridgeState = { enabled: false, deviceId: '' };
  saveAudioOutputMirrorPreference(); saveAudioInputBridgePreference();
  clearAudioOutputMirrors(); renderAudioOutputDeviceUi();
}

var audioOutputApplyQueue = Promise.resolve();
function applyAudioOutputDevice(media) {
  audioOutputApplyQueue = audioOutputApplyQueue.catch(function () {}).then(function () { return applyAudioOutputDeviceNow(media); });
  return audioOutputApplyQueue;
}
async function applyAudioOutputDeviceNow(media) {
  var sinkId = audioOutputDeviceId && audioOutputDeviceById(audioOutputDeviceId) ? audioOutputDeviceId : '';
  var requestedId = audioOutputDeviceId;
  var hasTarget = !!(media || audioCtx || uiSfxCtx);
  var mediaResult = null;
  var contextResult = null;
  var sfxResult = null;
  var errors = [];
  async function applySink(target, label) {
    if (!target) return null;
    if (typeof target.setSinkId !== 'function') return false;
    try {
      await target.setSinkId(sinkId);
      return true;
    } catch (e) {
      errors.push({ label: label, error: e });
      return false;
    }
  }
  bindAudioOutputMirrorEvents(media);
  mediaResult = await applySink(media, 'audio');
  contextResult = await applySink(audioCtx, 'audio-context');
  sfxResult = await applySink(uiSfxCtx, 'ui-sfx');
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
