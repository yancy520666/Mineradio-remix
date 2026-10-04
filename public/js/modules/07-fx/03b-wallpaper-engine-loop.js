// Optional recorded backgrounds. Original projects and native mode stay intact.
var WALLPAPER_ENGINE_MODE_KEY = 'mineradio-wallpaper-engine-playback-mode-v1';
var wallpaperEnginePlaybackMode = 'native';
try { if (localStorage.getItem(WALLPAPER_ENGINE_MODE_KEY) === 'loop') wallpaperEnginePlaybackMode = 'loop'; } catch (e) { }
var wallpaperLoopJob = null;
var wallpaperLoopMessage = '';
var wallpaperLoopActions = [];

function wallpaperLoopIsRecording() { return !!(wallpaperLoopJob && wallpaperLoopJob.recording); }
function wallpaperLoopIsCurrent(job) {
  return wallpaperLoopJob === job && !job.cancelled && wallpaperEnginePlaybackMode === 'loop'
    && wallpaperEngineSelection.active && wallpaperEngineSelection.id === job.item.id;
}
// The capture is the native surface at the player's size, so only a window
// that covers the screen yields a screen-resolution recording.
function wallpaperLoopLimits(result) {
  return { width: Number(result && result.width) || 1920, height: Number(result && result.height) || 1080 };
}
function wallpaperLoopCaptureArea(width, height, limits) {
  if (!(width > 0 && height > 0)) return 0;
  var ratio = Math.min(1, limits.width / width, limits.height / height);
  return width * ratio * height * ratio;
}
function wallpaperLoopSizeIsLow(width, height, limits) {
  var dpr = window.devicePixelRatio || 1, screenInfo = window.screen || {};
  var target = wallpaperLoopCaptureArea((screenInfo.width || 0) * dpr, (screenInfo.height || 0) * dpr, limits);
  return target > 0 && wallpaperLoopCaptureArea(width, height, limits) < target * 0.8;
}
function wallpaperLoopWindowIsSmall(limits) {
  var dpr = window.devicePixelRatio || 1;
  return wallpaperLoopSizeIsLow((window.innerWidth || 0) * dpr, (window.innerHeight || 0) * dpr, limits);
}
function wallpaperLoopDesktopState() {
  return typeof desktopRuntimeState === 'object' && desktopRuntimeState ? desktopRuntimeState : {};
}
function wallpaperLoopCanExpand(limits) {
  var api = wallpaperEngineDesktopApi(), state = wallpaperLoopDesktopState();
  return !!(api && typeof api.toggleFullscreen === 'function') && !state.fullscreen && !state.embedded
    && wallpaperLoopWindowIsSmall(limits);
}
function syncWallpaperEngineLoopModeUi() {
  ['native', 'loop'].forEach(function (mode) {
    var button = document.getElementById('wallpaper-engine-mode-' + mode);
    if (!button) return;
    button.classList.toggle('active', wallpaperEnginePlaybackMode === mode);
    button.setAttribute('aria-pressed', String(wallpaperEnginePlaybackMode === mode));
  });
  var status = document.getElementById('wallpaper-engine-mode-status');
  if (status) { status.textContent = wallpaperLoopMessage; status.hidden = !wallpaperLoopMessage; }
  var actions = document.getElementById('wallpaper-engine-mode-actions');
  if (actions) {
    actions.textContent = '';
    wallpaperLoopActions.forEach(function (action) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'fx-mini-btn ghost';
      button.textContent = action.label;
      button.addEventListener('click', action.run);
      actions.appendChild(button);
    });
    actions.hidden = !wallpaperLoopActions.length;
  }
}
function wallpaperLoopStatus(job, message, actions) {
  if (job && !wallpaperLoopIsCurrent(job)) return;
  wallpaperLoopMessage = message || '';
  wallpaperLoopActions = actions || [];
  syncWallpaperEngineLoopModeUi();
}
function wallpaperLoopRestoreWindow(job) {
  if (!job || !job.expanded || job.restored) return;
  job.restored = true;
  if (!wallpaperLoopDesktopState().fullscreen) return;
  var api = wallpaperEngineDesktopApi();
  try {
    if (api && typeof api.exitFullscreenWindowed === 'function') {
      var result = api.exitFullscreenWindowed();
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } else if (typeof toggleFullscreen === 'function') toggleFullscreen();
  } catch (e) { }
}
function cancelWallpaperEngineLoop() {
  var job = wallpaperLoopJob;
  wallpaperLoopJob = null;
  if (job) {
    job.cancelled = true;
    if (job.recorder && job.recorder.state !== 'inactive') job.recorder.stop();
    if (job.cancelRecording) job.cancelRecording();
    if (job.jobId) wallpaperEngineDesktopApi().wallpaperEngineLoopCache({ action: 'abort', jobId: job.jobId }).catch(function () {});
    if (job.recording) flushWallpaperEngineVisualSettings();
    wallpaperLoopRestoreWindow(job);
  }
  wallpaperLoopMessage = '';
  wallpaperLoopActions = [];
  syncWallpaperEngineLoopModeUi();
}
function setWallpaperEnginePlaybackMode(mode) {
  if (mode !== 'native' && mode !== 'loop') return;
  cancelWallpaperEngineLoop();
  wallpaperEnginePlaybackMode = mode;
  try { localStorage.setItem(WALLPAPER_ENGINE_MODE_KEY, mode); } catch (e) { }
  syncWallpaperEngineLoopModeUi();
  renderWallpaperEngineLibrary();
  var item = wallpaperEngineProjectById(wallpaperEngineSelection.id);
  if (item && wallpaperEngineSelection.active) {
    if (wallpaperEngineSelection.kind === 'loop') wallpaperEngineSelection.kind = 'engine';
    applyWallpaperEngineBackground(item, true);
  }
}
function syncWallpaperEngineLoopVisibility() {
  var visible = wallpaperEngineDesktopHostIsVisible();
  if (wallpaperLoopJob && wallpaperEngineSelection.kind !== 'loop' && !visible) {
    cancelWallpaperEngineLoop();
    wallpaperLoopStatus(null, '生成已暂停，恢复窗口后点击循环视频重试');
    return;
  }
  if (!wallpaperEngineSelection.active || wallpaperEngineSelection.kind !== 'loop') return;
  var video = document.getElementById('wallpaper-engine-video');
  if (!video || !video.getAttribute('src')) return;
  if (!visible) {
    cancelWallpaperEngineVideoRetry();
    video.pause();
  } else if (video.paused && video.readyState >= 2) {
    requestWallpaperEngineVideoPlayback(video, wallpaperEngineProjectById(wallpaperEngineSelection.id),
      'loop', wallpaperEngineLayerToken, false, 0);
  }
}
async function wallpaperLoopRequest(payload) {
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.wallpaperEngineLoopCache !== 'function') throw new Error('LOOP_API_UNAVAILABLE');
  var result = await api.wallpaperEngineLoopCache(payload);
  if (!result || result.ok === false) throw new Error(result && result.error || 'LOOP_CACHE_FAILED');
  return result;
}
async function waitWallpaperLoopSource(job, limits) {
  var until = Date.now() + 90000, stableSession = '', stableSince = 0;
  while (wallpaperLoopIsCurrent(job) && Date.now() < until) {
    if (!wallpaperEngineDesktopHostIsVisible()) throw new Error('LOOP_RECORD_INTERRUPTED');
    var video = document.getElementById('wallpaper-engine-glass-sampler-video');
    if (video && video.srcObject && video.readyState >= 2 && video.videoWidth
        && document.body.classList.contains('wallpaper-engine-glass-sampler-ready')
        && video.dataset.wallpaperEngineSession === wallpaperEngineNativeSessionId
        // After expanding, wait for the session rebuilt at full-screen size.
        && !(job.expanded && wallpaperLoopSizeIsLow(video.videoWidth, video.videoHeight, limits))) {
      var runtime = await wallpaperEngineDesktopApi().getWallpaperEngineRuntimeStatus();
      if (runtime && runtime.active && runtime.id === job.item.id && runtime.sessionId === wallpaperEngineNativeSessionId) {
        if (!job.expanded) return video;
        // A resize rebuild can land just after the first ready session.
        if (stableSession !== runtime.sessionId) { stableSession = runtime.sessionId; stableSince = Date.now(); }
        else if (Date.now() - stableSince >= 1000) return video;
      }
    }
    if (wallpaperEngineRuntimeError) throw new Error(wallpaperEngineRuntimeError);
    await new Promise(function (resolve) { setTimeout(resolve, 150); });
  }
  throw new Error('LOOP_SOURCE_UNAVAILABLE');
}
async function recordWallpaperLoop(job, source, settings) {
  var mime = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(function (type) {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
  });
  if (!mime) throw new Error('LOOP_RECORDER_UNAVAILABLE');
  var canvas = document.createElement('canvas');
  var ratio = Math.min(1, settings.width / source.videoWidth, settings.height / source.videoHeight);
  canvas.width = Math.max(2, Math.floor(source.videoWidth * ratio / 2) * 2);
  canvas.height = Math.max(2, Math.floor(source.videoHeight * ratio / 2) * 2);
  var context = canvas.getContext('2d', { alpha: false });
  if (!context || typeof canvas.captureStream !== 'function') throw new Error('LOOP_RECORDER_UNAVAILABLE');
  var stream = canvas.captureStream(settings.fps);
  var recorder = job.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
  var pending = Promise.resolve(), uploadError = null, timer, began = Date.now(), frames = 0;
  // A resize/maximize restarts the native session and drops the sampler
  // stream; drawing would then repeat the last frame into a "valid" cache.
  var sourceSession = String(source.dataset.wallpaperEngineSession || '');
  var sourceStream = source.srcObject;
  function sourceIsLive() {
    if (!sourceSession || source.srcObject !== sourceStream || !sourceStream
      || String(wallpaperEngineNativeSessionId || '') !== sourceSession
      || String(source.dataset.wallpaperEngineSession || '') !== sourceSession
      || !document.body.classList.contains('wallpaper-engine-glass-sampler-ready')) return false;
    var tracks = typeof sourceStream.getVideoTracks === 'function' ? sourceStream.getVideoTracks() : [];
    return tracks.some(function (track) { return track && track.readyState === 'live'; });
  }
  try {
    await new Promise(function (resolve, reject) {
      job.cancelRecording = function () { reject(new Error('LOOP_CANCELLED')); };
      recorder.ondataavailable = function (event) {
        if (!event.data.size || job.cancelled) return;
        pending = pending.then(async function () {
          if (!wallpaperLoopIsCurrent(job)) return;
          var buffer = await event.data.arrayBuffer();
          for (var offset = 0; offset < buffer.byteLength; offset += 1024 * 1024) {
            if (!wallpaperLoopIsCurrent(job)) return;
            await wallpaperLoopRequest({ action: 'append', jobId: job.jobId,
              chunk: buffer.slice(offset, offset + 1024 * 1024) });
          }
        }).catch(function (error) { uploadError = error; if (recorder.state !== 'inactive') recorder.stop(); });
      };
      recorder.onerror = function () { reject(new Error('LOOP_RECORD_FAILED')); };
      recorder.onstop = function () { resolve(); };
      function draw() {
        if (!wallpaperLoopIsCurrent(job) || !wallpaperEngineDesktopHostIsVisible() || !sourceIsLive()) {
          reject(new Error('LOOP_RECORD_INTERRUPTED')); return;
        }
        try { context.drawImage(source, 0, 0, canvas.width, canvas.height); frames++; }
        catch (error) { reject(error); return; }
        var elapsed = Date.now() - began;
        var second = Math.min(settings.duration, Math.floor(elapsed / 1000));
        if (job.reportedSecond !== second) {
          job.reportedSecond = second;
          wallpaperLoopStatus(job, '正在生成循环视频 · ' + second + '/' + settings.duration + ' 秒');
        }
        if (elapsed >= settings.duration * 1000) { recorder.stop(); return; }
        timer = setTimeout(draw, 1000 / settings.fps);
      }
      recorder.start(500);
      draw();
    });
    await pending;
    if (uploadError) throw uploadError;
    if (frames < settings.duration * settings.fps / 2) throw new Error('LOOP_RECORD_TOO_SLOW');
    if (!wallpaperLoopIsCurrent(job)) throw new Error('LOOP_CANCELLED');
    return { width: canvas.width, height: canvas.height };
  } finally {
    clearTimeout(timer);
    job.cancelRecording = null;
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach(function (track) { track.stop(); });
  }
}
async function playWallpaperLoop(job, cached, message, actions) {
  if (!wallpaperLoopIsCurrent(job)) return;
  // Await exact native teardown before exposing the cached video. WE itself and
  // the user's desktop wallpaper remain running; only our popout is closed.
  var stopped = await stopWallpaperEngineNativeSession();
  if (!wallpaperLoopIsCurrent(job)) return;
  if (stopped && stopped.ok === false) throw new Error('LOOP_NATIVE_STOP_FAILED');
  cancelWallpaperEngineSwitchTimer();
  var token = ++wallpaperEngineLayerToken;
  wallpaperEngineSelection.kind = 'loop';
  wallpaperEngineSelection.mediaType = 'video';
  saveWallpaperEngineSelection();
  restoreOriginalBackgroundAfterWallpaperEngine();
  clearWallpaperEngineLayerMedia(0);
  var video = document.getElementById('wallpaper-engine-video');
  video.crossOrigin = 'anonymous';
  video.muted = true; video.loop = true; video.playsInline = true;
  video.onloadeddata = function () {
    if (token !== wallpaperEngineLayerToken || !wallpaperLoopIsCurrent(job)) return;
    wallpaperEngineRuntimeError = '';
    requestWallpaperEngineVideoPlayback(video, job.item, 'loop', token, true, 0);
    wallpaperLoopStatus(job, message || '循环视频 · 后续直接播放缓存', actions);
  };
  video.onerror = function () {
    if (!wallpaperLoopIsCurrent(job) || token !== wallpaperEngineLayerToken) return;
    wallpaperLoopStatus(job, '视频播放失败，可切回原生模式');
    wallpaperEngineRuntimeError = '循环视频播放失败';
    restoreOriginalBackgroundAfterWallpaperEngine(); updateWallpaperEngineEntryUi();
  };
  video.src = cached.url;
  video.load();
  // The cached video now covers the background; return to the user's window.
  wallpaperLoopRestoreWindow(job);
}
async function waitWallpaperLoopExpanded(job, limits) {
  var until = Date.now() + 5000, lastSize = '', stableSince = 0;
  while (wallpaperLoopIsCurrent(job) && Date.now() < until) {
    if (wallpaperLoopDesktopState().fullscreen && !wallpaperLoopWindowIsSmall(limits)) {
      var size = window.innerWidth + 'x' + window.innerHeight;
      if (size !== lastSize) { lastSize = size; stableSince = Date.now(); }
      else if (Date.now() - stableSince >= 600) return;
    }
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
  }
  if (wallpaperLoopIsCurrent(job)) throw new Error('LOOP_EXPAND_FAILED');
}
function wallpaperLoopRecordActions(item, regenerate) {
  return [
    { label: '铺满屏幕录制', run: function () {
      startWallpaperEngineLoopBackground(item, { capture: 'expand', regenerate: regenerate });
    } },
    { label: '按当前窗口录制', run: function () {
      startWallpaperEngineLoopBackground(item, { capture: 'window', regenerate: regenerate });
    } }
  ];
}
function regenerateWallpaperEngineLoop(item, limits) {
  startWallpaperEngineLoopBackground(item, { capture: wallpaperLoopCanExpand(limits) ? 'expand' : 'window', regenerate: true });
}
function startWallpaperEngineLoopBackground(item, options) {
  options = options || {};
  cancelWallpaperEngineLoop();
  ++wallpaperEngineLayerToken;
  var job = wallpaperLoopJob = { item: item, cancelled: false, jobId: '', recording: false };
  wallpaperLoopStatus(job, '正在检查循环视频…');
  (async function () {
    try {
      var cached = await wallpaperLoopRequest({ action: 'lookup', id: item.id });
      if (!wallpaperLoopIsCurrent(job)) return;
      var limits = wallpaperLoopLimits(cached);
      if (cached.cached && !options.regenerate) {
        var low = cached.recordedWidth > 0 && cached.recordedHeight > 0
          && wallpaperLoopSizeIsLow(cached.recordedWidth, cached.recordedHeight, limits);
        await playWallpaperLoop(job, cached, low ? '循环视频 · 当前缓存 ' + cached.recordedWidth + '×' + cached.recordedHeight + '，可重新生成更清晰的版本' : '',
          low ? [{ label: wallpaperLoopCanExpand(limits) ? '铺满屏幕重新生成' : '重新生成',
            run: function () { regenerateWallpaperEngineLoop(item, limits); } }] : null);
        return;
      }
      var capture = options.capture || (wallpaperLoopCanExpand(limits) ? '' : 'window');
      if (!capture) {
        // Keep the native wallpaper visible while the user decides.
        if (wallpaperEngineSelection.kind !== 'engine' || !wallpaperEngineNativeSessionId) {
          wallpaperEngineSelection.kind = 'engine';
          applyWallpaperEngineBackground(item, true, true);
        }
        var status = document.getElementById('wallpaper-engine-mode-status');
        wallpaperLoopStatus(job, '窗口小于屏幕：铺满屏幕录制更清晰（约 20 秒，录完自动恢复窗口）',
          wallpaperLoopRecordActions(item, !!options.regenerate));
        if (!status || !status.offsetParent) showToast('循环视频待生成：请在界面设置的 WE 播放方式中选择录制方式');
        return;
      }
      if (capture === 'expand' && wallpaperLoopCanExpand(limits)) {
        job.expanded = true;
        wallpaperLoopStatus(job, '正在铺满屏幕，录完自动恢复窗口…');
        if (typeof toggleFullscreen === 'function') toggleFullscreen();
        else wallpaperEngineDesktopApi().toggleFullscreen();
        await waitWallpaperLoopExpanded(job, limits);
        if (!wallpaperLoopIsCurrent(job)) return;
      }
      wallpaperLoopStatus(job, '首次生成 · 正在准备原生壁纸…');
      wallpaperEngineSelection.kind = 'engine';
      applyWallpaperEngineBackground(item, true, true);
      var source = await waitWallpaperLoopSource(job, limits);
      if (!wallpaperLoopIsCurrent(job)) return;
      job.recording = true;
      flushWallpaperEngineVisualSettings();
      await new Promise(function (resolve) { setTimeout(resolve, 300); });
      if (!wallpaperLoopIsCurrent(job)) return;
      var begun = await wallpaperLoopRequest({ action: 'begin', id: item.id });
      job.jobId = begun.jobId;
      if (!wallpaperLoopIsCurrent(job)) { await wallpaperLoopRequest({ action: 'abort', jobId: job.jobId }); return; }
      var size = await recordWallpaperLoop(job, source, begun);
      cached = await wallpaperLoopRequest({ action: 'finish', jobId: job.jobId, size: size });
      job.jobId = ''; job.recording = false;
      await playWallpaperLoop(job, cached);
    } catch (error) {
      if (job.jobId) await wallpaperLoopRequest({ action: 'abort', jobId: job.jobId }).catch(function () {});
      if (!wallpaperLoopIsCurrent(job)) return;
      job.recording = false; flushWallpaperEngineVisualSettings();
      wallpaperLoopRestoreWindow(job);
      var unavailable = /RECORDER_UNAVAILABLE|API_UNAVAILABLE/.test(String(error.message));
      wallpaperLoopStatus(job, unavailable ? '当前环境无法录制，可使用原生模式' : '生成未完成，点击循环视频重试');
      showToast(unavailable ? '此环境暂不支持循环视频录制' : '循环视频生成未完成，原背景与项目文件保留');
    }
  })();
  return true;
}
function showWallpaperEngineModeHint(button) {
  var tip = document.getElementById('wallpaper-engine-mode-tooltip');
  if (!tip) return;
  tip.textContent = button.getAttribute('data-mode-hint');
  tip.hidden = false;
  var rect = button.getBoundingClientRect();
  var width = tip.getBoundingClientRect().width;
  tip.style.left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)) + 'px';
  var height = tip.getBoundingClientRect().height;
  tip.style.top = (rect.bottom + height + 16 < window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8)) + 'px';
}
function hideWallpaperEngineModeHint() {
  var tip = document.getElementById('wallpaper-engine-mode-tooltip');
  if (tip) tip.hidden = true;
}
window.addEventListener('pagehide', cancelWallpaperEngineLoop);
window.addEventListener('resize', hideWallpaperEngineModeHint);
syncWallpaperEngineLoopModeUi();
