function pauseCurrentAudioForTrackSwitch() {
  playToggleBusy = false;
  if (!audio) return;
  try {
    audioFadeSerial++;
    clearAudioFadeTimers();
    audio.onended = null;
    audio.pause();
  } catch (e) { }
  playing = false;
  setPlayIcon(false);
  syncPlaybackStateFromAudioEvent('track-switch');
}

// The window is shown and focused, so a resume needs no background recovery.
function playbackWindowInForeground() {
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode()) return false;
  if (typeof desktopRuntimeState !== 'undefined' && desktopRuntimeState
    && (desktopRuntimeState.minimized || desktopRuntimeState.visible === false || desktopRuntimeState.focused === false)) return false;
  return true;
}

function syncPlaybackStateFromAudioEvent(reason) {
  if (typeof updateSystemMediaSession === 'function') updateSystemMediaSession();
  if (typeof updatePlaybackResumePauseMarker === 'function') updatePlaybackResumePauseMarker(reason);
  var isPlaying = !!(audio && audio.src && !audio.paused && !audio.ended);
  playing = isPlaying;
  setPlayIcon(isPlaying);
  if (!isPlaying) hideLoading();
  // A player-initiated play request performs this resume itself.
  if ((reason === 'play' || reason === 'playing') && !(audio && audio.__mineradioPlayAttemptActive > 0)) {
    switchPlaybackVisualToEmily();
    if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume(reason);
  }
  forcePlaybackControlsInteractive();
}

function isPlaybackRecursionError(err) {
  var msg = String((err && err.message) || err || '');
  return err instanceof RangeError || /maximum call stack size exceeded/i.test(msg);
}

function safePlaybackStep(label, fn) {
  try {
    return fn();
  } catch (err) {
    console.warn('[PlaybackSetupStep]', label, err);
    return null;
  }
}

function playbackFailureNoticeFromError(err) {
  if (typeof playbackRestrictionNotice !== 'function') return null;
  var msg = String(err && err.message ? err.message : (err || '')).trim();
  if (!msg) return null;
  var lower = msg.toLowerCase();
  var category = '';
  if (/vip_required|paid_required|trial_only|need_vip|only_vip|member|vip|会员|付费|购买/.test(lower + msg)) category = 'vip_required';
  else if (/401|403|login_required|auth|cookie|credential|unauthorized|forbidden/.test(lower)) category = 'login_required';
  else if (/copyright|not playable|unavailable/.test(lower)) category = 'copyright_unavailable';
  else if (/url.*empty|no url|no supported source/.test(lower)) category = 'url_unavailable';
  if (!category) return null;
  var song = playQueue && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  return playbackRestrictionNotice(song, { reason: category, message: msg });
}

function playbackFailureToastText(err) {
  var contextualNotice = playbackFailureNoticeFromError(err);
  if (contextualNotice) return contextualNotice.title + '：' + contextualNotice.body;
  if (isPlaybackRecursionError(err)) return '播放准备异常，已保持播放器可操作';
  var msg = String(err && err.message ? err.message : (err || '')).trim();
  var lower = msg.toLowerCase();
  if (/notallowederror|play\(\) failed|user gesture|autoplay/.test(lower)) return '播放失败：浏览器拦截了自动播放，请点一次播放按钮';
  if (/notsupportederror|no supported source|decode|media_err_decode/.test(lower)) return '播放失败：音频格式或解码失败，建议换源或降低音质';
  if (/notfounderror|setSinkId|sink|output device|audio output/.test(lower)) return '播放失败：当前输出设备不可用，请切回系统默认输出';
  if (/aborterror|aborted|interrupted/.test(lower)) return '播放已被新的切歌操作中断';
  if (/network|failed to fetch|timeout|econnreset|etimedout|err_connection|http 5|502|503|504/.test(lower)) return '播放失败：音频网络请求超时或服务端不可用';
  if (/401|403|login_required|auth|cookie|credential|unauthorized|forbidden/.test(lower)) return '播放失败：平台登录态或播放授权失效，请重新登录对应接口';
  if (/vip_required|paid_required|trial_only|need_vip|only_vip|member/.test(lower)) return '播放失败：歌曲需要 VIP、购买或更高权限';
  if (/copyright|unavailable|not playable|url.*empty|no url/.test(lower)) return '播放失败：平台没有返回可播放地址，建议换源';
  return '播放失败：' + (msg || '未知原因，请尝试换源或重新登录');
}
function scheduleAudioResumePosition(media, seconds, token) {
  seconds = Math.max(0, Number(seconds) || 0);
  if (!media || seconds < 0.35) return;
  var applied = false;
  media.__mineradioPendingResumeAt = seconds;
  function applyResume() {
    if (applied || token !== trackSwitchToken || !media || media.__mineradioPendingResumeAt !== seconds) return;
    if (typeof media.readyState === 'number' && media.readyState < 1) return;
    var duration = Number(media.duration) || 0;
    var target = duration > 0 ? Math.min(seconds, Math.max(0, duration - 0.45)) : seconds;
    try {
      media.currentTime = target;
      applied = true;
      function finishResume() {
        if (token !== trackSwitchToken || media.__mineradioPendingResumeAt !== seconds) return;
        if (media.seeking || Math.abs(Number(media.currentTime) - target) > 0.5) return;
        media.__mineradioPendingResumeAt = 0;
        if (typeof media.removeEventListener === 'function') media.removeEventListener('seeked', finishResume);
        updatePlaybackProgressUi();
      }
      media.addEventListener('seeked', finishResume);
      finishResume();
      if (typeof syncBeatMapPlaybackCursor === 'function') syncBeatMapPlaybackCursor(target, true);
      if (typeof syncPodcastDjMapCursor === 'function') syncPodcastDjMapCursor(target, true);
      updatePlaybackProgressUi();
    } catch (e) { }
  }
  media.addEventListener('loadedmetadata', applyResume, { once: true });
  media.addEventListener('canplay', applyResume, { once: true });
  setTimeout(applyResume, 520);
  applyResume();
}

function playbackLoadIsNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err && Number(err.code) === 2 && !err.name) return true; // MediaError.MEDIA_ERR_NETWORK
  var text = String(err && err.name || '') + ' ' + String(err && err.message || err || '');
  if (/AbortError/i.test(text) && !/timeout|超时/i.test(text)) return false;
  return /network|failed to fetch|timeout|超时|连接失败|econnreset|etimedout|err_connection|http 5\d\d|upstream.*(error|unavailable)/i.test(text);
}
var pendingPlaybackSourceRequest = null;
function cancelPlaybackSourceRequest(token) {
  var owner = typeof pendingPlaybackSourceRequest !== 'undefined' ? pendingPlaybackSourceRequest : null;
  if (!owner || (token != null && owner.token !== token)) return false;
  pendingPlaybackSourceRequest = null;
  if (owner.controller) owner.controller.abort();
  return true;
}
async function requestPlaybackSourceUrl(url, options, token) {
  // A stale invocation must never cancel the newer track's controller.
  if (token !== trackSwitchToken) throw new DOMException('Track replaced', 'AbortError');
  cancelPlaybackSourceRequest();
  var owner = { token: token, controller: typeof AbortController === 'function' ? new AbortController() : null };
  pendingPlaybackSourceRequest = owner;
  var requestOptions = Object.assign({}, options || {});
  if (owner.controller) requestOptions.signal = owner.controller.signal;
  function stillCurrent() {
    return token === trackSwitchToken && pendingPlaybackSourceRequest === owner && !(owner.controller && owner.controller.signal.aborted);
  }
  try {
    for (var attempt = 0; attempt < 2; attempt++) {
      if (!stillCurrent()) throw new DOMException('Track replaced', 'AbortError');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('NETWORK_OFFLINE');
      try {
        var data = await apiJson(url, requestOptions);
        if (!stillCurrent()) throw new DOMException('Track replaced', 'AbortError');
        if (data && !data.url && ((Number(data.code) >= 500 && Number(data.code) <= 599) || playbackLoadIsNetworkError(data.error || data.reason || data.message))) {
          throw new Error('NETWORK_UPSTREAM_UNAVAILABLE');
        }
        return data;
      } catch (err) {
        if (!stillCurrent() || !playbackLoadIsNetworkError(err) || attempt > 0
          || (typeof navigator !== 'undefined' && navigator.onLine === false)) throw err;
        if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice('连接有点慢，正在重试', '保留当前歌曲和音质，再刷新一次播放地址。', { coalesceKey: 'playback-load', persist: true });
        await new Promise(function (resolve) { setTimeout(resolve, 350); });
        if (!stillCurrent()) throw new DOMException('Track replaced', 'AbortError');
      }
    }
  } finally {
    if (pendingPlaybackSourceRequest === owner) pendingPlaybackSourceRequest = null;
  }
}
function showPlaybackLoadFailure(song, idx, token, err, opts) {
  if (token !== trackSwitchToken || currentIdx !== idx || !song || !playQueue[idx]
    || queueItemKey(playQueue[idx]) !== queueItemKey(song)) return false;
  opts = opts || {};
  // A displayed recovery card owns the next attempt; stop startup's separate
  // retry/home-fallback loop without changing the user's autoplay preference.
  if (typeof clearStartupAutoplayRetryTimer === 'function') clearStartupAutoplayRetryTimer();
  if (typeof startupAutoplayJobId !== 'undefined') startupAutoplayJobId += 1;
  if (typeof startupAutoplayAttempted !== 'undefined') startupAutoplayAttempted = true;
  var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  var title = offline ? '网络已断开' : (playbackLoadIsNetworkError(err) ? '歌曲暂时加载失败' : '暂时无法播放');
  var body = offline ? '当前歌曲已保留。恢复联网后点“重试”，不用重新找歌。'
    : (playbackLoadIsNetworkError(err) ? '网络请求超时或服务暂时不可用。当前歌曲已保留，可以重试或切换下一首。' : playbackFailureToastText(err));
  var key = queueItemKey(song);
  var resumeAt = opts.resumeAt != null ? opts.resumeAt : (typeof pendingPlaybackResumeAt !== 'undefined' ? pendingPlaybackResumeAt : 0);
  if (resumeAt < 0.35 && audio && audio.__mineradioTrackSwitchToken === token) resumeAt = Number(audio.__mineradioPendingResumeAt) || Number(audio.currentTime) || 0;
  var retryOpts = { manual: true, skipShuffleOrder: true, resumeAt: Math.max(0, Number(resumeAt) || 0), qualityOverride: opts.qualityOverride, context: opts.context, preserveHomeState: true };
  function stillCurrent() { return token === trackSwitchToken && currentIdx === idx && playQueue[idx] && queueItemKey(playQueue[idx]) === key; }
  var actions = [{ label: '重试', onClick: function () { if (stillCurrent()) return playQueueAt(idx, retryOpts); } }];
  if (playQueue.length > 1) actions.push({ label: '下一首', onClick: function () { if (stillCurrent()) return playQueueAt((idx + 1) % playQueue.length, { manual: true, skipShuffleOrder: true }); } });
  if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice(title, body, { coalesceKey: 'playback-load', persist: true, actions: actions });
  return true;
}
