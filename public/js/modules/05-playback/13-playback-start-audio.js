function albumGaplessSongKey(song) {
  if (!song) return '';
  if (song.__albumGaplessKey) return String(song.__albumGaplessKey);
  var provider = normalizePlaybackProvider(songProviderKey(song));
  if (provider === 'qq') {
    var albumMid = song.albumMid || song.albummid || song.album_mid || '';
    return albumMid ? 'qq:' + albumMid : '';
  }
  if (provider === 'spotify') return '';
  if (provider === 'netease') {
    var albumId = song.albumId || song.album_id || '';
    return albumId ? 'netease:' + albumId : '';
  }
  if (provider === 'kugou') {
    var kugouAlbumId = song.albumId || song.album_id || '';
    return kugouAlbumId ? 'kugou:' + kugouAlbumId : '';
  }
  return '';
}

function albumGaplessCoverKey(song) {
  if (!song) return '';
  return String(song.customCover || song.cover || song.picUrl || song.albumCover || song.coverUrl || '').trim();
}

function albumGaplessSameAlbumCover(prevSong, nextSong) {
  var prevAlbum = albumGaplessSongKey(prevSong);
  var nextAlbum = albumGaplessSongKey(nextSong);
  if (!prevAlbum || prevAlbum !== nextAlbum) return false;
  var prevCover = albumGaplessCoverKey(prevSong);
  var nextCover = albumGaplessCoverKey(nextSong);
  return !!(prevCover && nextCover && prevCover === nextCover);
}

var ALBUM_GAPLESS_PREROLL_SECONDS = 8.5;
var ALBUM_GAPLESS_MIX_SECONDS = 0.72;
var ALBUM_GAPLESS_NEXT_ENTRY_FLOOR = 0.90;
var ALBUM_GAPLESS_NEXT_ATTACK_MS = 56;
var ALBUM_GAPLESS_ADOPT_SLEW_MS = 180;
var ALBUM_GAPLESS_GAIN_STEP_MS = 8;
var ALBUM_GAPLESS_BOUNDARY_RELEASE_SECONDS = ALBUM_GAPLESS_MIX_SECONDS;
var ALBUM_GAPLESS_MUTED_PREROLL_SECONDS = 1.05;
var ALBUM_GAPLESS_MIN_MIX_MS = 360;
var ALBUM_GAPLESS_BIND_AFTER_MIX_MS = 40;
var ALBUM_GAPLESS_SILENCE_HOLD_MS = 180;
var ALBUM_GAPLESS_FAST_SILENCE_HOLD_MS = 48;
var ALBUM_GAPLESS_LONG_SILENCE_SECONDS = 1.05;
var ALBUM_GAPLESS_SILENCE_LEVEL = 0.018;
var ALBUM_GAPLESS_DIRECT_SILENCE_RMS = 0.0065;
var ALBUM_GAPLESS_DEEP_SILENCE_RMS = 0.0032;
var ALBUM_GAPLESS_DIRECT_SILENCE_PEAK = 0.030;
var ALBUM_GAPLESS_DEEP_SILENCE_PEAK = 0.017;
var ALBUM_GAPLESS_RESIDUAL_FREQ_AVG = 0.010;
var ALBUM_GAPLESS_RESIDUAL_FREQ_PEAK = 0.075;
var ALBUM_GAPLESS_DIRECT_SILENCE_HOLD_MS = 112;
var ALBUM_GAPLESS_DEEP_SILENCE_HOLD_MS = 56;
var albumGaplessTailTimeData = null;
var albumGaplessTailFreqData = null;

function syncActiveAudioRepeatMode(media) {
  media = media || audio;
  if (!media) return false;
  var shouldLoop = playMode === 'single';
  try { media.loop = shouldLoop; } catch (e) { }
  return shouldLoop;
}

function restartSingleRepeatMedia(media, token, index, reason) {
  if (
    playMode !== 'single'
    || !media
    || token !== trackSwitchToken
    || index !== currentIdx
    || audio !== media
  ) return false;
  try { media.loop = true; } catch (e) { }
  setTimeout(function () {
    if (
      playMode !== 'single'
      || token !== trackSwitchToken
      || index !== currentIdx
      || audio !== media
    ) return;
    try { media.currentTime = 0; } catch (e) { }
    try {
      var playPromise = media.play && media.play();
      playing = true;
      if (typeof setPlayIcon === 'function') setPlayIcon(true);
      if (typeof updatePlaybackProgressUi === 'function') updatePlaybackProgressUi();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {
          if (playMode !== 'single' || token !== trackSwitchToken || index !== currentIdx || audio !== media) return;
          playQueueAt(index, {
            autoRepeat: true,
            preserveHomeState: true,
            suppressPlayFailureNotice: true,
          });
        });
      }
    } catch (e) {
      if (playMode !== 'single' || token !== trackSwitchToken || index !== currentIdx || audio !== media) return;
      playQueueAt(index, {
        autoRepeat: true,
        preserveHomeState: true,
        suppressPlayFailureNotice: true,
      });
    }
  }, 0);
  return true;
}

function disposeAlbumGaplessPreload(preload) {
  if (!preload) return;
  if (preload) {
    if (preload.handoffTimer) clearTimeout(preload.handoffTimer);
    if (preload.cleanupTimer) clearTimeout(preload.cleanupTimer);
    if (preload.fadeFrame) cancelAnimationFrame(preload.fadeFrame);
    if (preload.fadeWatchdogTimer) clearInterval(preload.fadeWatchdogTimer);
    preload.fadeFrame = 0;
    preload.fadeWatchdogTimer = 0;
    preload.mixPending = false;
    preload.mixStarted = false;
    if (preload.fadeResolve) {
      var resolveFade = preload.fadeResolve;
      preload.fadeResolve = null;
      resolveFade(false);
    }
  }
  if (preload.previousAudio && preload.previousAudio === audio && preload.previousAudioOnEnded) {
    preload.previousAudio.onended = preload.previousAudioOnEnded;
  }
  if (preload && preload.media) {
    try {
      preload.media.pause();
      preload.media.removeAttribute('src');
      preload.media.load();
    } catch (e) { }
  }
}

function clearAlbumGaplessPreload(reason) {
  if (!albumGaplessState) return;
  albumGaplessState.serial++;
  var pending = albumGaplessState.pendingRequest;
  albumGaplessState.pendingRequest = null;
  if (pending && pending.controller) pending.controller.abort();
  if (albumGaplessState.monitorTimer) {
    clearInterval(albumGaplessState.monitorTimer);
    albumGaplessState.monitorTimer = 0;
  }
  var preload = albumGaplessState.preload;
  albumGaplessState.preload = null;
  disposeAlbumGaplessPreload(preload);
}

function restoreAlbumGaplessOutgoingIfCurrent(preload, durationMs) {
  if (
    !preload
    || preload.transitionToken !== trackSwitchToken
    || preload.transitionIndex !== currentIdx
    || !preload.previousAudio
    || preload.previousAudio !== audio
    || preload.previousAudio.paused
    || preload.previousAudio.ended
  ) return false;
  if (typeof rampAudioOutputGain === 'function') rampAudioOutputGain(targetVolume, Math.max(80, Number(durationMs) || 120));
  return true;
}

function albumGaplessDefaultEnabledForContext(context) {
  var albumKey = context && context.albumKey ? String(context.albumKey) : '';
  if (albumGaplessState && albumGaplessState.enabled && albumKey && albumGaplessState.albumKey === albumKey) return true;
  if (albumGaplessState && albumKey && albumGaplessState.disabledAlbumKey === albumKey) return false;
  return !albumGaplessState || albumGaplessState.defaultEnabled !== false;
}

function albumGaplessTailLevel() {
  return Math.max(
    Math.abs(Number(audioEnergy) || 0),
    Math.abs(Number(smoothEnergy) || 0),
    Math.abs(Number(bass) || 0) * 0.55,
    Math.abs(Number(mid) || 0) * 0.42,
    Math.abs(Number(treble) || 0) * 0.32
  );
}

function albumGaplessDirectTailSample() {
  if (!analyser || !audio || audio.paused) return null;
  try {
    var size = Math.max(32, Number(analyser.fftSize) || FFT_SIZE || 2048);
    if (!albumGaplessTailTimeData || albumGaplessTailTimeData.length !== size) {
      albumGaplessTailTimeData = new Uint8Array(size);
    }
    var freqSize = Math.max(16, Number(analyser.frequencyBinCount) || Math.floor(size / 2));
    if (!albumGaplessTailFreqData || albumGaplessTailFreqData.length !== freqSize) {
      albumGaplessTailFreqData = new Uint8Array(freqSize);
    }
    analyser.getByteTimeDomainData(albumGaplessTailTimeData);
    analyser.getByteFrequencyData(albumGaplessTailFreqData);
    var stride = Math.max(1, Math.floor(albumGaplessTailTimeData.length / 384));
    var sum = 0;
    var peak = 0;
    var count = 0;
    for (var i = 0; i < albumGaplessTailTimeData.length; i += stride) {
      var v = Math.abs((albumGaplessTailTimeData[i] - 128) / 128);
      sum += v * v;
      if (v > peak) peak = v;
      count++;
    }
    var freqStride = Math.max(1, Math.floor(albumGaplessTailFreqData.length / 256));
    var freqSum = 0;
    var freqPeak = 0;
    var freqCount = 0;
    for (var j = 0; j < albumGaplessTailFreqData.length; j += freqStride) {
      var f = albumGaplessTailFreqData[j] / 255;
      freqSum += f;
      if (f > freqPeak) freqPeak = f;
      freqCount++;
    }
    return {
      rms: Math.sqrt(sum / Math.max(1, count)),
      peak: peak,
      freqAvg: freqSum / Math.max(1, freqCount),
      freqPeak: freqPeak
    };
  } catch (e) {
    return null;
  }
}

function albumGaplessTailSilenceProbe(remaining) {
  if (!isFinite(remaining) || remaining > ALBUM_GAPLESS_PREROLL_SECONDS) {
    return { quiet: false, smoothedQuiet: false, directQuiet: false, deepQuiet: false, level: 1, rms: 1, peak: 1 };
  }
  var level = albumGaplessTailLevel();
  var sample = albumGaplessDirectTailSample();
  var rms = sample ? sample.rms : 1;
  var peak = sample ? sample.peak : 1;
  var freqAvg = sample ? sample.freqAvg : 1;
  var freqPeak = sample ? sample.freqPeak : 1;
  var deepQuiet = !!(sample && rms <= ALBUM_GAPLESS_DEEP_SILENCE_RMS && peak <= ALBUM_GAPLESS_DEEP_SILENCE_PEAK);
  var residualTail = !!(sample && !deepQuiet && (freqAvg > ALBUM_GAPLESS_RESIDUAL_FREQ_AVG || freqPeak > ALBUM_GAPLESS_RESIDUAL_FREQ_PEAK));
  var directQuiet = !!(sample && !residualTail && rms <= ALBUM_GAPLESS_DIRECT_SILENCE_RMS && peak <= ALBUM_GAPLESS_DIRECT_SILENCE_PEAK);
  var smoothedQuiet = level <= ALBUM_GAPLESS_SILENCE_LEVEL;
  return {
    quiet: smoothedQuiet || directQuiet,
    smoothedQuiet: smoothedQuiet,
    directQuiet: directQuiet,
    deepQuiet: deepQuiet,
    residualTail: residualTail,
    level: level,
    rms: rms,
    peak: peak,
    freqAvg: freqAvg,
    freqPeak: freqPeak
  };
}

function albumGaplessCurrentTailQuiet(remaining) {
  return albumGaplessTailSilenceProbe(remaining).quiet;
}

function startAlbumGaplessPreroll(preload) {
  if (!preload || !preload.media || preload.prerollStarted || preload.prerollPending || preload.prerollFailed) return false;
  preload.prerollPending = true;
  preload.prerollStarted = true;
  preload.prerollStartedAt = performance.now();
  preload.prerollStartTime = isFinite(preload.media.currentTime) ? preload.media.currentTime : 0;
  try {
    preload.media.muted = true;
    preload.media.volume = 0;
    preload.media.play().then(function () {
      preload.prerollPending = false;
      preload.prerollPlaying = true;
      preload.prerollLiveAt = performance.now();
    }).catch(function (err) {
      preload.prerollPending = false;
      preload.prerollFailed = true;
      console.warn('[AlbumGapless] preroll play failed:', err);
    });
    return true;
  } catch (err) {
    preload.prerollPending = false;
    preload.prerollFailed = true;
    console.warn('[AlbumGapless] preroll start failed:', err);
    return false;
  }
}

function albumGaplessDirectVolumeTarget() {
  return clampRange(Number(targetVolume) || 0, 0, 1);
}

function albumGaplessEqualPowerGains(progress, outgoingStart, incomingTarget) {
  var t = clampRange(Number(progress) || 0, 0, 1);
  var theta = t * Math.PI * 0.5;
  return {
    outgoing: clampRange((Number(outgoingStart) || 0) * Math.cos(theta), 0, 1),
    incoming: clampRange((Number(incomingTarget) || 0) * Math.sin(theta), 0, 1)
  };
}

function albumGaplessEqualPowerEntryProgress(elapsedMs, durationMs) {
  durationMs = Math.max(1, Number(durationMs) || 1);
  elapsedMs = clampRange(Number(elapsedMs) || 0, 0, durationMs);
  var whole = clampRange(elapsedMs / durationMs, 0, 1);
  if (whole >= 1) return 1;
  var attackMs = Math.min(ALBUM_GAPLESS_NEXT_ATTACK_MS, Math.max(1, durationMs - 1));
  var floorAngleProgress = Math.asin(ALBUM_GAPLESS_NEXT_ENTRY_FLOOR) / (Math.PI * 0.5);
  if (elapsedMs <= attackMs) {
    var attackT = clampRange(elapsedMs / attackMs, 0, 1);
    var attackEased = attackT * attackT * (3 - 2 * attackT);
    return floorAngleProgress * attackEased;
  }
  var releaseT = clampRange((elapsedMs - attackMs) / Math.max(1, durationMs - attackMs), 0, 1);
  var releaseEased = releaseT * releaseT * (3 - 2 * releaseT);
  return floorAngleProgress + (1 - floorAngleProgress) * releaseEased;
}

function runAlbumGaplessBalancedCrossfade(preload, durationMs) {
  if (!preload || !preload.media) return Promise.resolve(false);
  if (preload.fadeFrame) cancelAnimationFrame(preload.fadeFrame);
  var media = preload.media;
  var serial = ++audioFadeSerial;
  clearAudioFadeTimers();
  var startCurrent = currentAudioOutputGain();
  var initialTarget = Math.max(0.0001, albumGaplessDirectVolumeTarget());
  var outgoingRatio = clampRange(startCurrent / initialTarget, 0, 1);
  try {
    media.muted = false;
    media.volume = 0;
  } catch (e0) { }
  var started = performance.now();
  durationMs = Math.max(1, Number(durationMs) || 1);
  preload.fadeCompleted = false;
  return new Promise(function (resolve) {
    var settled = false;
    preload.fadeResolve = resolve;
    function finish(ok) {
      if (settled) return;
      settled = true;
      if (preload.fadeResolve === resolve) preload.fadeResolve = null;
      if (preload.fadeFrame) cancelAnimationFrame(preload.fadeFrame);
      if (preload.fadeWatchdogTimer) clearInterval(preload.fadeWatchdogTimer);
      preload.fadeFrame = 0;
      preload.fadeWatchdogTimer = 0;
      preload.fadeCompleted = !!ok;
      resolve(!!ok);
    }
    function applyStep(nowMs) {
      if (settled) return;
      if (serial !== audioFadeSerial || !preload.mixStarted || albumGaplessState.preload !== preload) {
        finish(false);
        return;
      }
      var elapsedMs = clampRange(nowMs - started, 0, durationMs);
      var t = clampRange(elapsedMs / durationMs, 0, 1);
      var curveProgress = albumGaplessEqualPowerEntryProgress(elapsedMs, durationMs);
      var liveTarget = albumGaplessDirectVolumeTarget();
      var gains = albumGaplessEqualPowerGains(curveProgress, liveTarget * outgoingRatio, liveTarget);
      writeAudioOutputGain(gains.outgoing);
      try {
        media.muted = false;
        media.volume = gains.incoming;
      } catch (e) { }
      if (t >= 1) {
        writeAudioOutputGain(0);
        try { media.volume = liveTarget; } catch (e2) { }
        finish(true);
      }
    }
    function tick(nowMs) {
      applyStep(nowMs);
      if (!settled) preload.fadeFrame = requestAnimationFrame(tick);
    }
    preload.fadeWatchdogTimer = setInterval(function () {
      applyStep(performance.now());
    }, ALBUM_GAPLESS_GAIN_STEP_MS);
    preload.fadeFrame = requestAnimationFrame(tick);
  });
}

function startAlbumGaplessMix(preload, reason, remaining) {
  if (!preload || !preload.media || preload.mixStarted || preload.mixPending || albumGaplessState.handoff) return false;
  if (!albumGaplessQueueCanAdvance(currentIdx)) return false;
  if (typeof cuefieldAutoMixExecuting !== 'undefined' && cuefieldAutoMixExecuting) return false;
  var outgoingMedia = audio;
  var outgoingToken = trackSwitchToken;
  var outgoingIndex = currentIdx;
  preload.mixPending = true;
  preload.releaseReason = reason || 'crossmix';
  if ((reason === 'boundary-crossmix-reset' || reason === 'tail-silence-fast-crossmix' || reason === 'tail-direct-silence-crossmix') && preload.prerollStarted) {
    try {
      preload.media.pause();
      preload.media.currentTime = 0;
    } catch (e) { }
    preload.prerollPlaying = false;
  }
  try {
    preload.media.muted = false;
    preload.media.volume = 0;
    var playResult = preload.media.play();
  } catch (err) {
    preload.mixPending = false;
    preload.prerollFailed = true;
    console.warn('[AlbumGapless] crossmix start failed:', err);
    return false;
  }
  Promise.resolve(playResult).then(function () {
    var stillCurrent = albumGaplessState.preload === preload
      && outgoingToken === trackSwitchToken
      && outgoingIndex === currentIdx
      && outgoingMedia === audio
      && albumGaplessQueueCanAdvance(currentIdx)
      && queueItemKey(playQueue[preload.index]) === preload.key;
    if (!stillCurrent) {
      if (albumGaplessState.preload === preload) clearAlbumGaplessPreload('album-gapless-mix-stale');
      else disposeAlbumGaplessPreload(preload);
      return false;
    }
    preload.mixPending = false;
    preload.mixStarted = true;
    preload.mixStartedAt = performance.now();
    preload.transitionToken = outgoingToken;
    preload.transitionIndex = outgoingIndex;
    preload.previousAudio = outgoingMedia || null;
    preload.previousAudioOnEnded = preload.previousAudio ? preload.previousAudio.onended : null;
    if (preload.previousAudio) preload.previousAudio.onended = null;
    var mixMs = Math.round(ALBUM_GAPLESS_MIX_SECONDS * 1000);
    if (isFinite(remaining) && remaining > 0) {
      mixMs = Math.min(mixMs, Math.max(ALBUM_GAPLESS_MIN_MIX_MS, Math.round(remaining * 1000 + 80)));
    }
    preload.mixDurationMs = mixMs;
    return runAlbumGaplessBalancedCrossfade(preload, mixMs);
  }).then(function (completed) {
    if (!completed) {
      if (albumGaplessState.preload === preload) restoreAlbumGaplessOutgoingIfCurrent(preload, 120);
      if (albumGaplessState.preload === preload) clearAlbumGaplessPreload('album-gapless-mix-cancelled');
      else disposeAlbumGaplessPreload(preload);
      return;
    }
    if (albumGaplessState.preload !== preload || !preload.fadeCompleted) return;
    preload.handoffTimer = setTimeout(function () {
      preload.handoffTimer = 0;
      if (albumGaplessState.preload === preload && preload.fadeCompleted) {
        startAlbumGaplessHandoff(preload, preload.releaseReason || reason || 'crossmix');
      }
    }, Math.max(24, ALBUM_GAPLESS_BIND_AFTER_MIX_MS));
  }).catch(function (err) {
    preload.mixPending = false;
    preload.mixStarted = false;
    preload.prerollFailed = true;
    console.warn('[AlbumGapless] crossmix play failed:', err);
    if (albumGaplessState.preload === preload) restoreAlbumGaplessOutgoingIfCurrent(preload, 120);
    if (albumGaplessState.preload === preload) clearAlbumGaplessPreload('album-gapless-mix-play-failed');
    else disposeAlbumGaplessPreload(preload);
  });
  return true;
}

function setAlbumGaplessPlaybackContext(enabled, context, opts) {
  opts = opts || {};
  var albumKey = context ? String(context.albumKey || '') : '';
  if (opts.userToggle && albumKey) {
    albumGaplessState.disabledAlbumKey = enabled ? '' : albumKey;
  }
  albumGaplessState.enabled = !!enabled;
  albumGaplessState.context = context || null;
  albumGaplessState.albumKey = enabled && context ? albumKey : '';
  if (!albumGaplessState.enabled || !albumGaplessState.albumKey) {
    albumGaplessState.enabled = false;
    if (albumGaplessState.preload && albumGaplessState.preload.mixStarted) {
      restoreAlbumGaplessOutgoingIfCurrent(albumGaplessState.preload, 120);
    }
    clearAlbumGaplessPreload('album-gapless-disabled');
    return false;
  }
  scheduleAlbumGaplessPreloadForCurrent(trackSwitchToken, 'context-enabled');
  return true;
}

function albumGaplessQueueCanAdvance(idx) {
  if (!albumGaplessState || !albumGaplessState.enabled || !albumGaplessState.albumKey) return false;
  if (playMode === 'single') return false;
  if (idx < 0 || idx + 1 >= playQueue.length) return false;
  var currentKey = albumGaplessSongKey(playQueue[idx]);
  var nextKey = albumGaplessSongKey(playQueue[idx + 1]);
  return currentKey === albumGaplessState.albumKey && nextKey === albumGaplessState.albumKey;
}

function qqPlaybackEvidenceQuery(song) {
  song = song || {};
  var vipRequired = !!(song.vipRequired || song.needVip || song.need_vip || song.onlyVipPlayable || song.only_vip_playable);
  if (!vipRequired && typeof songRequiresVip === 'function') {
    try { vipRequired = songRequiresVip(song); } catch (e) { vipRequired = false; }
  }
  return '&vipRequired=' + encodeURIComponent(vipRequired ? '1' : '') +
    '&needVip=' + encodeURIComponent(song.needVip || song.need_vip ? '1' : '') +
    '&onlyVipPlayable=' + encodeURIComponent(song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
    '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
    '&fee=' + encodeURIComponent(song.fee || song.Fee || '');
}

function neteasePlaybackMatchQuery(song, opts) {
  song = song || {};
  opts = opts || {};
  var excludeIds = Array.isArray(opts.excludeIds)
    ? opts.excludeIds.join(',')
    : String(opts.excludeIds || '');
  var artistId = song.artistId || song.artist_id || '';
  if (!artistId && Array.isArray(song.artists) && song.artists[0]) artistId = song.artists[0].id || '';
  if (!artistId && Array.isArray(song.ar) && song.ar[0]) artistId = song.ar[0].id || '';
  var artistRecords = Array.isArray(song.artists) && song.artists.length ? song.artists : (Array.isArray(song.ar) ? song.ar : []);
  var artistIds = artistRecords.map(function (artist) { return artist && artist.id || ''; }).filter(Boolean);
  var artistNames = artistRecords.map(function (artist) { return artist && artist.name || ''; }).filter(Boolean);
  if (!artistIds.length && artistId) artistIds = [artistId];
  if (!artistNames.length && (song.artist || song.artistName)) artistNames = [song.artist || song.artistName];
  var albumName = song.album || song.albumName || '';
  if (albumName && typeof albumName === 'object') albumName = albumName.name || '';
  return '&name=' + encodeURIComponent(song.name || song.title || '') +
    '&artist=' + encodeURIComponent(song.artist || song.artistName || '') +
    '&artistId=' + encodeURIComponent(artistId) +
    '&artistIds=' + encodeURIComponent(artistIds.join(',')) +
    '&artistNames=' + encodeURIComponent(artistNames.join('\u001f')) +
    '&album=' + encodeURIComponent(albumName) +
    '&duration=' + encodeURIComponent(song.durationMs || song.dt || song.duration || 0) +
    '&excludeIds=' + encodeURIComponent(excludeIds) +
    '&skipDirect=' + (opts.skipDirect ? '1' : '');
}

function clearNeteaseSourceMatchMetadata(song) {
  if (!song) return song;
  song.neteaseSourceMatched = false;
  song.resolvedNeteaseId = '';
  song.neteaseSourceMatchKind = '';
  song.neteaseSourceMatchScore = 0;
  song.neteaseSourceMatchAlbum = '';
  song.neteaseSourceMatchNotified = false;
  return song;
}

function applyNeteaseSourceMatchMetadata(song, data) {
  if (!song || !data || !data.sourceMatch) return song;
  song.neteaseSourceMatched = true;
  song.resolvedNeteaseId = data.resolvedNeteaseId || data.resolvedSongId || song.resolvedNeteaseId || '';
  song.neteaseSourceMatchKind = data.matchKind || 'netease_same_track_metadata';
  song.neteaseSourceMatchScore = Number(data.matchScore || 0) || 0;
  song.neteaseSourceMatchAlbum = data.matchedSong && data.matchedSong.album || '';
  song.playbackSource = data.source || 'netease-same-track';
  return song;
}

function neteaseSourceMatchTriedIds(data) {
  var tried = Array.isArray(data && data.sourceMatchTriedIds) ? data.sourceMatchTriedIds.slice() : [];
  var resolved = data && (data.resolvedNeteaseId || data.resolvedSongId);
  if (resolved && tried.map(String).indexOf(String(resolved)) < 0) tried.push(String(resolved));
  return tried.filter(Boolean).slice(0, 4);
}

async function retryNeteaseSourceMatchPlayback(song, data, idx, token, opts, requestedQuality) {
  if (!song || !data || !data.sourceMatch) return null;
  opts = opts || {};
  var sourceRecovery = typeof sourceFallbackRecoveryFromOptions === 'function'
    ? sourceFallbackRecoveryFromOptions(opts)
    : null;
  if (sourceRecovery && !sourceFallbackRecoveryCanContinue(sourceRecovery)) return null;
  var retryDepth = Math.max(0, Number(opts.neteaseSourceMatchRetryDepth) || 0);
  var triedIds = neteaseSourceMatchTriedIds(data);
  if (retryDepth >= 3 || triedIds.length >= 4) return null;
  var nextData = null;
  try {
    var nextDataPromise = apiJson(
      '/api/song/url?id=' + encodeURIComponent(song.id || '') +
      neteasePlaybackMatchQuery(song, { excludeIds: triedIds, skipDirect: true }) +
      '&quality=' + encodeURIComponent(requestedQuality),
      { timeoutMs: 10000 }
    );
    nextData = sourceRecovery
      ? await awaitSourceFallbackBudget(nextDataPromise, sourceRecovery)
      : await nextDataPromise;
  } catch (err) {
    console.warn('[NeteaseSourceMatch] next candidate lookup failed:', err);
    return token === trackSwitchToken ? null : false;
  }
  if (token !== trackSwitchToken) return false;
  if (sourceRecovery && (nextData === sourceFallbackBudgetTimeoutResult || !sourceFallbackRecoveryCanContinue(sourceRecovery))) return null;
  if (!nextData || !nextData.url || !nextData.sourceMatch) return null;
  var retryOpts = Object.assign({}, opts, {
    albumGaplessHandoff: false,
    albumGaplessMixed: false,
    preloadedAudio: null,
    preloadedData: null,
    preloadedProxyAudioUrl: '',
    preResolvedPlaybackData: nextData,
    neteaseSourceMatchRetryDepth: retryDepth + 1,
    qualityOverride: requestedQuality,
    suppressPlayFailureNotice: true,
  });
  var retryPromise = playQueueAt(idx, retryOpts);
  var retryToken = trackSwitchToken;
  var retryStarted = await retryPromise;
  if (retryToken !== trackSwitchToken) return false;
  return retryStarted === true;
}

async function resolveAlbumGaplessPlaybackData(song, requestOptions) {
  requestOptions = requestOptions || {};
  function requestIsCurrent() { return !(requestOptions.signal && requestOptions.signal.aborted) && (!requestOptions.isCurrent || requestOptions.isCurrent()); }
  if (!requestIsCurrent()) return null;
  async function requestUrl(url, timeoutMs) {
    if (!requestIsCurrent()) return null;
    var result = await apiJson(url, { timeoutMs: timeoutMs, signal: requestOptions.signal });
    return requestIsCurrent() ? result : null;
  }
  if (!song || song.type === 'local' || song.source === 'local' || song.localUrl) return null;
  if (song.providerRemoved || songProviderKey(song) === 'spotify') return null;
  var playbackProvider = normalizePlaybackProvider(songProviderKey(song));
  var requestedQuality = normalizePlaybackQualityForProvider(getProviderPlaybackQuality(playbackProvider), playbackProvider);
  if (playbackProvider === 'netease' && requestedQuality === 'jymaster' && !hasProviderSvip('netease', loginStatus)) requestedQuality = 'hires';
  var runtimeQualityCap = playbackQualityCapValue(song, playbackProvider);
  if (playbackQualityAboveCap(requestedQuality, playbackProvider, runtimeQualityCap)) requestedQuality = runtimeQualityCap;
  var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
  if (playbackProvider === 'qq') {
    return requestUrl('/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qqPlaybackEvidenceQuery(song) + qualityParam, 15000);
  }
  if (playbackProvider === 'kugou') {
    return requestUrl('/api/kugou/song/url?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
      '&albumId=' + encodeURIComponent(song.albumId || song.album_id || '') +
      '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
      '&mixSongId=' + encodeURIComponent(song.mixSongId || '') +
      '&hqHash=' + encodeURIComponent(song.hqHash || song.hq_hash || '') +
      '&sqHash=' + encodeURIComponent(song.sqHash || song.sq_hash || '') +
      '&resHash=' + encodeURIComponent(song.resHash || song.res_hash || '') +
      '&vipRequired=' + encodeURIComponent(song.vipRequired || song.needVip || song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
      '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
      '&fee=' + encodeURIComponent(song.fee || song.Fee || '') +
      qualityParam, 20000);
  }
  if (playbackProvider === 'qishui') {
    return requestUrl('/api/qishui/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || '') + qqPlaybackEvidenceQuery(song) + qualityParam, 15000);
  }
  return requestUrl('/api/song/url?id=' + encodeURIComponent(song.id || '') + neteasePlaybackMatchQuery(song) + qualityParam, 14000);
}

function consumeAlbumGaplessPreload(preload) {
  if (albumGaplessState.monitorTimer) {
    clearInterval(albumGaplessState.monitorTimer);
    albumGaplessState.monitorTimer = 0;
  }
  if (albumGaplessState.preload === preload) albumGaplessState.preload = null;
}

function startAlbumGaplessHandoff(preload, reason) {
  if (!preload || albumGaplessState.handoff) return false;
  if (
    !albumGaplessQueueCanAdvance(currentIdx)
    || preload.index !== currentIdx + 1
    || preload.token !== trackSwitchToken
    || queueItemKey(playQueue[preload.index]) !== preload.key
  ) {
    if (albumGaplessState.preload === preload) {
      restoreAlbumGaplessOutgoingIfCurrent(preload, 120);
      clearAlbumGaplessPreload('album-gapless-handoff-invalid');
    } else {
      disposeAlbumGaplessPreload(preload);
    }
    return false;
  }
  preload.releaseReason = reason || 'boundary';
  albumGaplessState.handoff = true;
  consumeAlbumGaplessPreload(preload);
  var handoffSourceToken = trackSwitchToken;
  var handoffPreviousAudio = preload.previousAudio || audio;
  function scheduleAlbumGaplessNormalFallback() {
    var expectedFailedToken = handoffSourceToken + 1;
    if (
      trackSwitchToken !== expectedFailedToken
      || currentIdx !== preload.index
      || (audio !== preload.media && audio !== handoffPreviousAudio)
    ) return false;
    var fallbackOwnerMedia = audio;
    if (fallbackOwnerMedia === preload.media) {
      try {
        preload.media.pause();
        preload.media.removeAttribute('src');
        preload.media.load();
      } catch (e) { }
      if (handoffPreviousAudio && handoffPreviousAudio !== fallbackOwnerMedia) {
        try {
          handoffPreviousAudio.pause();
          handoffPreviousAudio.removeAttribute('src');
          handoffPreviousAudio.load();
        } catch (e2) { }
      }
    } else {
      disposeAlbumGaplessPreload(preload);
    }
    setTimeout(function () {
      if (
        trackSwitchToken === expectedFailedToken
        && currentIdx === preload.index
        && audio === fallbackOwnerMedia
      ) {
        playQueueAt(preload.index, { skipShuffleOrder: true, suppressPlayFailureNotice: true, preserveHomeState: true });
      }
    }, 0);
    return true;
  }
  if (preload.song) {
    preload.song.__albumGaplessKey = albumGaplessState.albumKey;
    playQueue[preload.index] = hydrateCustomCover(preload.song);
  }
  Promise.resolve(playQueueAt(preload.index, {
    skipShuffleOrder: true,
    suppressPlayFailureNotice: true,
    preserveHomeState: true,
    albumGaplessHandoff: true,
    albumGaplessMixed: !!preload.mixStarted,
    albumGaplessReleaseReason: preload.releaseReason || reason || '',
    preloadedAudio: preload.media,
    preloadedData: preload.data,
    preloadedProxyAudioUrl: preload.proxyAudioUrl,
  })).then(function (success) {
    var adopted = success === true
      && audio === preload.media
      && currentIdx === preload.index
      && preload.media.src
      && !preload.media.paused
      && !preload.media.ended;
    if (adopted) return true;
    if (!scheduleAlbumGaplessNormalFallback() && audio !== preload.media) disposeAlbumGaplessPreload(preload);
    return false;
  }).catch(function (err) {
    console.warn('[AlbumGapless] handoff failed:', err);
    if (!scheduleAlbumGaplessNormalFallback() && audio !== preload.media) disposeAlbumGaplessPreload(preload);
  }).finally(function () {
    albumGaplessState.handoff = false;
  });
  return true;
}

function armAlbumGaplessMonitor(token) {
  if (albumGaplessState.monitorTimer) clearInterval(albumGaplessState.monitorTimer);
  albumGaplessState.monitorTimer = setInterval(function () {
    var preload = albumGaplessState.preload;
    if (
      !preload
      || token !== trackSwitchToken
      || preload.token !== token
      || preload.index !== currentIdx + 1
      || queueItemKey(playQueue[preload.index]) !== preload.key
      || !albumGaplessQueueCanAdvance(currentIdx)
    ) {
      restoreAlbumGaplessOutgoingIfCurrent(preload, 120);
      clearAlbumGaplessPreload('album-gapless-monitor-invalid');
      return;
    }
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0 || !isFinite(audio.currentTime)) return;
    var remaining = audio.duration - audio.currentTime;
    if (remaining <= ALBUM_GAPLESS_MUTED_PREROLL_SECONDS) startAlbumGaplessPreroll(preload);
    if (!preload.media || preload.media.readyState < 2) return;
    var nowMs = performance.now();
    var tailProbe = albumGaplessTailSilenceProbe(remaining);
    var longTailSilence = remaining > ALBUM_GAPLESS_LONG_SILENCE_SECONDS;
    if (tailProbe.smoothedQuiet && (!longTailSilence || !tailProbe.residualTail)) {
      if (!preload.quietSince) preload.quietSince = nowMs;
    } else {
      preload.quietSince = 0;
    }
    if (tailProbe.directQuiet) {
      if (!preload.directQuietSince) preload.directQuietSince = nowMs;
    } else {
      preload.directQuietSince = 0;
    }
    var silenceHoldMs = longTailSilence ? ALBUM_GAPLESS_FAST_SILENCE_HOLD_MS : ALBUM_GAPLESS_SILENCE_HOLD_MS;
    var smoothedSilenceReady = !!(preload.quietSince && nowMs - preload.quietSince >= silenceHoldMs);
    var directHoldMs = tailProbe.deepQuiet ? ALBUM_GAPLESS_DEEP_SILENCE_HOLD_MS : ALBUM_GAPLESS_DIRECT_SILENCE_HOLD_MS;
    var directSilenceReady = !!(longTailSilence && preload.directQuietSince && nowMs - preload.directQuietSince >= directHoldMs);
    var silenceReady = smoothedSilenceReady || directSilenceReady;
    var boundaryReady = remaining <= ALBUM_GAPLESS_BOUNDARY_RELEASE_SECONDS;
    if (!silenceReady && !boundaryReady) return;
    startAlbumGaplessMix(preload, silenceReady ? (directSilenceReady ? 'tail-direct-silence-crossmix' : (longTailSilence ? 'tail-silence-fast-crossmix' : 'tail-silence-preroll-mix')) : 'boundary-crossmix-reset', remaining);
  }, 70);
}

async function scheduleAlbumGaplessPreloadForCurrent(token, reason) {
  // A late scheduler call must not clear a newer preload.
  if (token !== trackSwitchToken) return false;
  if (!albumGaplessQueueCanAdvance(currentIdx)) {
    if (!albumGaplessState.handoff) clearAlbumGaplessPreload(reason || 'album-gapless-not-eligible');
    return false;
  }
  var sourceIdx = currentIdx;
  var nextIdx = sourceIdx + 1;
  var nextSong = playQueue[nextIdx];
  var nextKey = queueItemKey(nextSong);
  if (albumGaplessState.preload && albumGaplessState.preload.index === nextIdx && albumGaplessState.preload.key === nextKey) return true;
  var pending = albumGaplessState.pendingRequest;
  if (pending && pending.token === token && pending.index === nextIdx && pending.key === nextKey) return pending.promise;
  clearAlbumGaplessPreload(reason || 'album-gapless-new-preload');
  var serial = ++albumGaplessState.serial;
  var owner = { token: token, index: nextIdx, key: nextKey, controller: typeof AbortController === 'function' ? new AbortController() : null };
  albumGaplessState.pendingRequest = owner;
  function stillCurrent() {
    return albumGaplessState.pendingRequest === owner && serial === albumGaplessState.serial && token === trackSwitchToken
      && sourceIdx === currentIdx && queueItemKey(playQueue[nextIdx]) === nextKey && albumGaplessQueueCanAdvance(currentIdx)
      && !(owner.controller && owner.controller.signal.aborted);
  }
  var requestOptions = { signal: owner.controller && owner.controller.signal, isCurrent: stillCurrent };
  async function prepare() {
    var media = null;
    try {
      if (!stillCurrent()) return false;
      var resolvedSong = nextSong;
      var data = await resolveAlbumGaplessPlaybackData(nextSong, requestOptions);
      if (!stillCurrent()) return false;
      if ((!data || !data.url) && typeof searchAlternatePlatformSong === 'function') {
        var alternate = await searchAlternatePlatformSong(nextSong, null, null, requestOptions);
        if (!stillCurrent()) return false;
        if (alternate) {
          alternate.__albumGaplessKey = albumGaplessState.albumKey;
          alternate.__albumTrackIndex = nextSong && nextSong.__albumTrackIndex;
          var alternateData = await resolveAlbumGaplessPlaybackData(alternate, requestOptions);
          if (!stillCurrent()) return false;
          if (alternateData && alternateData.url) {
            resolvedSong = alternate;
            data = alternateData;
          }
        }
      }
      if (!stillCurrent() || !data || !data.url) return false;
      var proxyAudioUrl = '/api/audio?url=' + encodeURIComponent(data.url);
      media = new Audio();
      media.crossOrigin = 'anonymous';
      media.preload = 'auto';
      media.volume = 0;
      // Do not start the audio download until the output-device await is current.
      await applyAudioOutputDevice(media);
      if (!stillCurrent()) { disposeAlbumGaplessPreload({ media: media }); return false; }
      media.src = proxyAudioUrl;
      media.load();
      albumGaplessState.preload = {
        index: nextIdx, key: nextKey, token: token, serial: serial, media: media,
        data: data, song: resolvedSong, proxyAudioUrl: proxyAudioUrl
      };
      armAlbumGaplessMonitor(token);
      return true;
    } catch (err) {
      if (media && (!albumGaplessState.preload || albumGaplessState.preload.media !== media)) disposeAlbumGaplessPreload({ media: media });
      if (stillCurrent() && !(err && err.name === 'AbortError')) console.warn('[AlbumGapless] preload failed:', err);
      return false;
    } finally {
      // The old task may settle after a newer track registered its owner.
      if (albumGaplessState.pendingRequest === owner) albumGaplessState.pendingRequest = null;
    }
  }
  owner.promise = prepare();
  return owner.promise;
}

function playAlbumGaplessNextOnEnded(token) {
  if (!albumGaplessQueueCanAdvance(currentIdx)) return false;
  var nextIdx = currentIdx + 1;
  setTimeout(function () {
    if (token !== trackSwitchToken) return;
    playQueueAt(nextIdx, { skipShuffleOrder: true, suppressPlayFailureNotice: true, preserveHomeState: true });
  }, 0);
  return true;
}

function applyLocalTrackLyricOnDemand(song, token) {
  if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
  if (song && song.lyric) {
    applyFetchedLyricResponse(song, token, { lyric: song.lyric }, { persist: false });
    return;
  }
  setOriginalLyricsState(withLyricFallback([]), false, 'fallback');
  applyPreferredLyricsForCurrent(true);
  if (
    !song
    || !song.hasLyric
    || !song.localFileId
    || !window.desktopWindow
    || typeof window.desktopWindow.readLocalMusicLyric !== 'function'
  ) return;
  window.desktopWindow.readLocalMusicLyric(song.localFileId).then(function (result) {
    if (
      token !== trackSwitchToken
      || !currentLocalSong
      || queueItemKey(currentLocalSong) !== queueItemKey(song)
      || !result
      || result.ok !== true
      || !result.lyric
    ) return;
    song.lyric = result.lyric;
    song.lyricSource = result.lyricSource || song.lyricSource || '';
    applyFetchedLyricResponse(song, token, { lyric: result.lyric }, { persist: false });
  }).catch(function () { });
}

function skipUnavailableLocalQueueSong(song, idx, token, reason, opts, knownOffline) {
  if (token !== trackSwitchToken) return false;
  var failed = (Number(opts.localMissingChecked) || 0) + (knownOffline ? 0 : 1);
  var offline = (Number(opts.localOfflineChecked) || 0) + (knownOffline ? 1 : 0);
  var skipped = failed + offline;
  var noticeKey = opts.localSkipNoticeKey || 'local-skip-' + token;
  var limit = Math.min(playQueue.length, 12);
  var exhausted = skipped >= playQueue.length || failed >= limit;
  showSourceFallbackNotice(exhausted ? '本地播放已停止' : '已跳过本地歌曲' + (skipped > 1 ? '（连续 ' + skipped + ' 首）' : ''),
    '《' + (song && (song.name || song.title) || '本地音乐') + '》：' + reason + (exhausted ? '。请连接磁盘、重新导入文件或选择其他歌曲。' : '，正在播放下一首。'), { coalesceKey: noticeKey });
  if (exhausted) return settleSourceFallbackTerminal(idx, token, '', { silent: true });
  return playQueueAt((idx + 1) % playQueue.length, Object.assign({}, opts, { localMissingChecked: failed, localOfflineChecked: offline, localSkipNoticeKey: noticeKey, skipShuffleOrder: true, manual: false, resumeAt: 0 }));
}

function handleLocalPlaybackReadFailure(media) {
  var song = playQueue[currentIdx];
  if (!media || media !== audio || !media.error || !song || song.type !== 'local') return false;
  if (media.__mineradioLocalPlaybackStarted !== trackSwitchToken) return false;
  media.__mineradioLocalPlaybackStarted = 0;
  var reason = Number(media.error.code) === 2 ? '播放过程中无法继续读取文件，磁盘可能已断开' : '播放过程中遇到音频解码错误';
  Promise.resolve(skipUnavailableLocalQueueSong(song, currentIdx, trackSwitchToken, reason, media.__mineradioLocalSkipOptions || {})).catch(function (error) {
    console.warn('[LocalPlaybackRecovery]', error && error.message);
    showSourceFallbackNotice('本地播放失败', reason + '。请连接磁盘或选择其他歌曲。');
  });
  return true;
}

function schedulePlaybackEndedAdvance(media, token) {
  var endedQueue = playQueue;
  var endedSong = playQueue[currentIdx];
  setTimeout(function () {
    if (token !== trackSwitchToken || audio !== media || playQueue !== endedQueue || playQueue[currentIdx] !== endedSong) return;
    if (playMode === 'single') playQueueAt(currentIdx, { autoRepeat: true, suppressPlayFailureNotice: true });
    else nextTrack();
  }, 0);
}

async function playLocalQueueSong(song, idx, token, firstVisualPlay, opts, resumeAt) {
  opts = opts || {};
  if (!song) return false;
  var localQueue = playQueue;
  function localQueueInvocationStillCurrent() {
    if (token !== trackSwitchToken || playQueue !== localQueue || playQueue[currentIdx] !== song) return false;
    idx = currentIdx;
    return true;
  }
  if (!localQueueInvocationStillCurrent()) return false;
  if (song.localFileId && window.desktopWindow && typeof window.desktopWindow.resolveLocalMusicTrack === 'function') {
    var resolved = await window.desktopWindow.resolveLocalMusicTrack(song.localFileId);
    if (!localQueueInvocationStillCurrent()) return false;
    if (!resolved || resolved.localMissing) {
      song.localMissing = true;
      return skipUnavailableLocalQueueSong(song, idx, token, '文件暂时离线或已移动', opts, true);
    }
    Object.assign(song, resolved);
  }
  if (!song.localUrl) {
    return skipUnavailableLocalQueueSong(song, idx, token, '本地播放地址已失效', opts, true);
  }
  currentLocalSong = song;
  playQueue[idx] = song;
  updateCustomCoverButton();
  document.getElementById('trial-banner').classList.remove('show');
  if (!audio) { audio = new Audio(); audio.crossOrigin = 'anonymous'; }
  else {
    audioFadeSerial++;
    clearAudioFadeTimers();
    audio.pause();
  }
  resetPlaybackAudioGraphForSourceSwitch('local-track-switch');
  audio.autoplay = true;
  audio.preload = 'auto';
  syncActiveAudioRepeatMode(audio);
  bindPlaybackProgressEvents(audio);
  applyVolumeToAudio();
  var localMedia = audio;
  await applyAudioOutputDevice(localMedia);
  if (!localQueueInvocationStillCurrent() || audio !== localMedia) return false;
  audio.src = song.localUrl;
  audio.__mineradioQueueItemKey = queueItemKey(song);
  audio.__mineradioTrackSwitchToken = token;
  audio.__mineradioLocalPlaybackStarted = 0;
  audio.__mineradioLocalSkipOptions = opts;
  updatePlaybackProgressUi();
  lyricSunEnergy = 0; lyricSunTarget = 0; lyricSunHold = 0; lyricSunAvg = 0; lyricSunPeak = 0.55;
  audio.onended = function () {
    if (token !== trackSwitchToken) return;
    if (this && this.__mineradioCuefieldEndedRecoveryToken === token) return;
    if (typeof cuefieldAutoMixExecuting !== 'undefined' && cuefieldAutoMixExecuting) {
      if (typeof noteCuefieldAutoMixOutgoingEnded === 'function') noteCuefieldAutoMixOutgoingEnded(this, token, currentIdx);
      return;
    }
    if (restartSingleRepeatMedia(this, token, currentIdx, 'local-ended')) return;
    finalizeListenSession(true);
    if (playAlbumGaplessNextOnEnded(token)) return;
    schedulePlaybackEndedAdvance(this, token);
  };
  audio.onloadedmetadata = function () {
    if (token !== trackSwitchToken || !currentLocalSong || currentLocalSong.localKey !== song.localKey) return;
    var duration = audio && isFinite(audio.duration) ? audio.duration : 0;
    currentLocalSong.duration = duration;
    if (lyricSourceMode === 'custom') applyCustomLyricState(currentLocalSong, true);
    safeRenderQueuePanel('local-metadata', { scrollCurrent: miniQueueOpen });
  };
  scheduleAudioResumePosition(audio, opts.resumeAt != null ? opts.resumeAt : resumeAt, token);
  if (resumeAt > 0) pendingPlaybackResumeAt = 0;
  audio.load();
  currentBeatMap = null;
  beatMapNextIdx = 0;
  resetAudioVisualState();
  resetBeatCameraSync(0);
  cancelBeatAnalysisTimer();
  cancelDjBeatAnalysisTimer();
  beatMapToken++;
  djBeatMapToken++;
  resetDjBeatMapState();
  setDjModeActive(false);
  var playbackStarted = await playAudio({ manual: !!opts.manual, silent: !!opts.startupAutoplay || !opts.manual, startupAutoplay: !!opts.startupAutoplay, trackSwitch: true, resumeRecovery: !!opts.resumeRecovery, expectedMedia: localMedia, expectedToken: token });
  if (!localQueueInvocationStillCurrent() || audio !== localMedia) return false;
  if (!playbackStarted) {
    if (token !== trackSwitchToken) return false;
    if (audio && audio.error && Number(audio.error.code) >= 2) {
      return skipUnavailableLocalQueueSong(song, idx, token, Number(audio.error.code) === 2 ? '文件读取失败' : '音频损坏或格式不受支持', opts);
    }
    forcePlaybackControlsInteractive();
    if (opts.startupAutoplay) {
      return false;
    }
    if (!opts.suppressPlayFailureNotice) {
      if (opts.manual) showToast('播放启动失败，请重新选择本地音乐');
      else showSourceFallbackNotice('本地音乐已载入', '点击播放器中间的播放按钮继续播放。');
    }
    return false;
  }
  forcePlaybackControlsInteractive();
  audio.__mineradioLocalPlaybackStarted = token;
  beginListenSession(song, null);
  applyLocalTrackLyricOnDemand(song, token);
  safeRenderQueuePanel('play-local-queue', { scrollCurrent: miniQueueOpen });
  scheduleShelfRebuild('play-local-queue', true);
  scheduleAlbumGaplessPreloadForCurrent(token, 'local-started');
  setTimeout(function () {
    if (token === trackSwitchToken && currentLocalSong && currentLocalSong.localKey === song.localKey) {
      prepareLocalBeatAnalysis(currentLocalSong, song.localUrl);
    }
  }, firstVisualPlay ? 680 : 520);
  return true;
}

var pendingQueuePlaybackToken = 0;
function schedulePlaybackBeatCacheRestore(options) {
  var media = options.media;
  var mediaSrc = media && media.src;
  var startSeconds = media && isFinite(media.currentTime) ? media.currentTime : 0;
  var startingMap = currentBeatMap;
  var cache = beatMapCache;
  var queue = playQueue;
  var songKey = queueItemKey(options.song);
  var provider = songProviderKey(options.song);
  var authorizationKey = typeof playbackQualityAuthorizationKey === 'function'
    ? playbackQualityAuthorizationKey(provider) : '';
  function stillCurrent() {
    return !!media && media === audio && media.src === mediaSrc && options.trackToken === trackSwitchToken
      && options.beatToken === beatMapToken && cache === beatMapCache
      && queue === playQueue && currentIdx === options.index
      && playQueue[currentIdx] && queueItemKey(playQueue[currentIdx]) === songKey
      && (typeof playbackQualityAuthorizationKey !== 'function'
        || playbackQualityAuthorizationKey(provider) === authorizationKey);
  }
  var readOptions = { isCurrent: stillCurrent };
  function scheduleAnalysis() {
    if (stillCurrent() && !readOptions.cancelled && !currentBeatMap) scheduleBeatAnalysis(options.key || options.song.id, options.proxyUrl, options.beatToken, options.song);
  }
  // Catch synchronous readers as well as rejected reads. Stale work may neither
  // publish into the cache nor attach a map/analysis to a newer playback owner.
  return Promise.resolve().then(function () {
    if (!stillCurrent()) return null;
    return options.key ? readBeatDiskCache(options.key, readOptions) : null;
  }).then(function (map) {
    if (!stillCurrent() || readOptions.cancelled || (currentBeatMap && currentBeatMap !== startingMap)) return false;
    if (!map) { scheduleAnalysis(); return false; }
    currentBeatMap = map;
    applyCinemaProfileFromBeatMap(map);
    var seconds = isFinite(media.currentTime) ? media.currentTime : 0;
    // Once playback has advanced, align the map without snapping the live camera.
    syncBeatMapPlaybackCursor(seconds, options.preserveMomentum || !media.paused || seconds !== startSeconds);
    notifyDesktopLyricsBeatMapReady();
    scheduleQueueBeatPrefetch(options.index, 2600);
    return true;
  }).catch(function (error) {
    if (!stillCurrent()) return false;
    console.warn('[PlaybackBeatCacheRestore]', error);
    scheduleAnalysis();
    return false;
  });
}

async function playQueueAt(idx, opts) {
  opts = opts || {};
  if (typeof beginSourceFallbackPlaybackInvocation === 'function' && !beginSourceFallbackPlaybackInvocation(opts)) return false;
  if (idx < 0 || idx >= playQueue.length || !playQueue[idx]) return false;
  // Keep archived records intact, but never resolve removed providers through another service.
  if (playQueue[idx].providerRemoved || songProviderKey(playQueue[idx]) === 'spotify') {
    showToast('Spotify 支持已移除；历史记录已保留，请选择其他音源的歌曲');
    return false;
  }
  if (typeof lyricWorkScheduler !== 'undefined') lyricWorkScheduler.hold(180);
  if (typeof ensurePlaylistQueueHydratedAhead === 'function') ensurePlaylistQueueHydratedAhead(idx);
  var albumGaplessHandoff = !!(opts.albumGaplessHandoff && opts.preloadedAudio && opts.preloadedData);
  var albumGaplessMixed = !!(albumGaplessHandoff && opts.albumGaplessMixed);
  var albumGaplessPreviousAudio = albumGaplessHandoff ? audio : null;
  var albumGaplessAdoptedGain = 0;
  var playbackMedia = null;
  var previousSongForTransition = currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  if (
    playMode === 'shuffle'
    && !opts.skipShuffleOrder
    && !opts.autoRepeat
    && !opts.qualitySwitch
    && !opts.resumeRecovery
    && !opts.fallbackDepth
    && typeof reorderQueueForShufflePlaybackOrder === 'function'
  ) {
    idx = reorderQueueForShufflePlaybackOrder(idx, { reason: 'shuffle-play-queue-at', renderPanel: false, rebuildShelf: false, persistSnapshot: false });
  }
  var qualitySwitch = !!opts.qualitySwitch;
  startupRestoreHomePending = false;
  markRenderInteraction(qualitySwitch ? 'quality-switch' : 'track-switch', qualitySwitch ? 520 : 1500);
  var playPhase = 'start';
  function markPlayPhase(name) { playPhase = name; }
  try {
    markPlayPhase('session-finalize');
    safePlaybackStep('session-finalize', function () { finalizeListenSession(false); });
    homeForcedOpen = false;
    if (!opts.preserveHomeState) homeSuppressed = false;
    currentIdx = idx;
    trackSwitchToken++;
    if (typeof cancelPlaybackSourceRequest === 'function') cancelPlaybackSourceRequest();
    markPlayPhase('cancel-previous-track');
    cancelBeatAnalysisTimer();
    cancelBeatPrefetchTimer();
    if (typeof resetCuefieldAutoMix === 'function') {
      resetCuefieldAutoMix(opts.cuefieldAutoMix ? 'cuefield-handoff' : 'track-switch', {
        preservePreparedAudio: !!opts.cuefieldAutoMix,
        preserveExecution: !!opts.cuefieldAutoMix
      });
    }
    if (!albumGaplessHandoff) clearAlbumGaplessPreload('track-switch');
    if (localBeatAnalysis.active) cancelLocalBeatAnalysis();
    if (typeof closeLocalBeatModal === 'function') closeLocalBeatModal();
    else closeGsapModal(document.getElementById('local-beat-modal'));
    beatMapToken++;
    var token = trackSwitchToken;
    var invocationQueue = playQueue;
    pendingQueuePlaybackToken = token;
    if (typeof dismissSourceFallbackNotice === 'function') dismissSourceFallbackNotice('playback-load');
    // A fresh user-level playback replaces any pending Qishui lookup card;
    // nested source-upgrade attempts keep it so they can report the result.
    if (!opts.fallbackDepth && !opts.qishuiTrialUpgradeTried && typeof endQishuiPlaybackProgress === 'function') endQishuiPlaybackProgress(null);
    function playbackInvocationStillCurrent(media) {
      return !!(media && playbackInvocationQueueStillCurrent() && audio === media);
    }
    function playbackInvocationQueueStillCurrent() {
      if (token !== trackSwitchToken || playQueue !== invocationQueue || playQueue[currentIdx] !== song) return false;
      // Dragging/reordering moves a live entry without replacing the selection.
      // Follow that entry, rather than writing back into its obsolete index.
      idx = currentIdx;
      return true;
    }
    function disposeStalePlaybackInvocationMedia(media) {
      if (!media || media === audio) return;
      try {
        media.pause();
        media.removeAttribute('src');
        media.load();
      } catch (e) { }
    }
    var firstVisualPlay = !firstPlayDone;
    markPlayPhase('track-setup');
    var song = safePlaybackStep('hydrate-song', function () { return hydrateCustomCover(playQueue[idx]); }) || playQueue[idx];
    playQueue[idx] = song;
    var sameAlbumCoverSwitch = albumGaplessSameAlbumCover(previousSongForTransition, song);
    var earlyLyricFetchStarted = false;
    function startTrackLyricFetch() {
      if (earlyLyricFetchStarted) return false;
      if (!song || song.type === 'podcast' || song.type === 'local' || song.source === 'local' || song.localUrl) return false;
      if (typeof fetchLyric !== 'function') return false;
      earlyLyricFetchStarted = true;
      setTimeout(function () {
        if (token === trackSwitchToken) fetchLyric(song, token);
      }, 0);
      return true;
    }
    var restoreResumeAt = 0;
    if (
      opts.resumeAt == null
      && pendingPlaybackResumeAt > 0
      && restoredLastPlaybackSnapshot
      && restoredLastPlaybackSnapshot.current
      && queueItemKey(song) === queueItemKey(restoredLastPlaybackSnapshot.current)
      && !opts.autoRepeat
      && !opts.qualitySwitch
    ) {
      restoreResumeAt = pendingPlaybackResumeAt;
    }
    // Retire the old lyric state before a scene recovery can redraw it.
    if (!qualitySwitch && typeof resetLyricsForTrackSwitch === 'function') resetLyricsForTrackSwitch(song, token);
    var initialResumeAt = opts.resumeAt != null ? Number(opts.resumeAt) || 0 : restoreResumeAt;
    if (!qualitySwitch && typeof beginStageLyricIntro === 'function') beginStageLyricIntro(song, token, initialResumeAt);
    else if (qualitySwitch && typeof stageLyricIntro !== 'undefined' && stageLyricIntro && stageLyricIntro.token === token - 1) {
      stageLyricIntro.token = token;
      if (stageLyrics.current) stageLyrics.currentTrackToken = token;
    }
    if (typeof scheduleAdjacentTrackPreparation === 'function') scheduleAdjacentTrackPreparation(token);
    if (!qualitySwitch && initialResumeAt > 0 && typeof requestStageLyricRestoreWarmup === 'function') {
      requestStageLyricRestoreWarmup(initialResumeAt, token, 'startup-restore');
    }
    var playbackContext = opts.context || (song && song.radioContext) || null;
    activeRadioContext = playbackContext || null;
    safeRenderQueuePanel('play-queue-at-switch', { scrollCurrent: miniQueueOpen });
    safePlaybackStep('shelf-preview-suppress', suppressShelfPreviewForPlaybackSwitch);
    if (!albumGaplessHandoff) pauseCurrentAudioForTrackSwitch();
    else {
      playToggleBusy = false;
      forcePlaybackControlsInteractive();
    }
    var bmKey = safePlaybackStep('beatmap-key', function () { return beatMapSongKey(song); }) || '';
    var podcastDjMode = !!safePlaybackStep('podcast-mode', function () { return isPodcastSong(song); });
    safePlaybackStep('dj-mode', function () { setDjModeActive(podcastDjMode, song); });
    safePlaybackStep('visual-switch', switchPlaybackVisualToEmily);
    currentLocalSong = null;
    safePlaybackStep('cover-button', updateCustomCoverButton);
    safePlaybackStep('like-buttons', function () { updateLikeButtons(song); });
    safePlaybackStep('like-status', function () { syncLikeStatusForSong(song); });
    safePlaybackStep('cinema-track-profile', function () { if (!qualitySwitch) resetCinemaTrackProfile(song); });
    safePlaybackStep('empty-home', function () { if (!opts.preserveHomeState) updateEmptyHomeVisibility(); });
    safePlaybackStep('track-ui', function () {
      document.getElementById('hint').classList.add('hidden');
      document.getElementById('thumb-title').textContent = song.name;
      document.getElementById('thumb-artist').textContent = song.artist;
      updateControlTrackInfo(song);
      document.getElementById('thumb-wrap').classList.add('visible');
    });
    markPlayPhase('lyric-prep');
    safePlaybackStep('lyric-prep', function () {
      if (qualitySwitch) {
        if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
        if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume('quality-switch-preserve-lyrics');
        applyPreferredLyricsForCurrent(true);
      } else {
        if (typeof resetLyricsForTrackSwitch !== 'function') {
          var initialLyricLines = withLyricFallback([]);
          setOriginalLyricsState(initialLyricLines, false, 'fallback');
          applyPreferredLyricsForCurrent(true);
        }
        startTrackLyricFetch();
        if (typeof scheduleTrackSwitchFallbackLyrics === 'function') scheduleTrackSwitchFallbackLyrics(song, token, 320);
      }
    });

    markPlayPhase('cover-load');
    safePlaybackStep('cover-load', function () {
      if (qualitySwitch) return;
      var customCover = getCustomCoverForSong(song);
      var coverOpts = {
        trackToken: token,
        deferHeavy: true,
        delay: firstVisualPlay ? 320 : (sameAlbumCoverSwitch ? 80 : 520),
        timeout: firstVisualPlay ? 1300 : 1700,
        seamlessTrackSwitch: !firstVisualPlay,
        noCoverTransition: sameAlbumCoverSwitch,
        colorMixDuration: sameAlbumCoverSwitch ? 1 : undefined
      };
      if (customCover) applyCoverDataUrl(customCover, coverOpts);
      else loadCoverFromUrl(song.cover ? coverUrlWithSize(song.cover, 400) : '', coverOpts);
    });
    safePlaybackStep('trial-banner-reset', function () { document.getElementById('trial-banner').classList.remove('show'); });
    // Queue deletion may select a successor while respecting an intentional pause.
    if (opts.selectOnly) {
      if (audio) {
        audio.__mineradioPlaybackExpected = false;
        audio.__mineradioQueueItemKey = '';
        audio.__mineradioPendingResumeAt = 0;
        audio.removeAttribute('src');
        audio.load();
      }
      currentBeatMap = null;
      beatMapNextIdx = 0;
      cancelDjBeatAnalysisTimer();
      djBeatMapToken++;
      resetDjBeatMapState();
      resetAudioVisualState();
      updatePlaybackProgressUi();
      syncPlaybackStateFromAudioEvent('queue-remove-paused');
      saveLastPlaybackSnapshot(true, 'remove-queue-item');
      return true;
    }
    if (song.type === 'local' || song.source === 'local' || song.localUrl) {
      markPlayPhase('local-audio');
      var localStarted = await playLocalQueueSong(song, idx, token, firstVisualPlay, opts, restoreResumeAt);
      if (token !== trackSwitchToken) return localStarted === true;
      if (localStarted === true && typeof completeSourceFallbackRecovery === 'function') {
        completeSourceFallbackRecovery(sourceFallbackRecoveryFromOptions(opts));
      }
      return localStarted === true;
    }
    safePlaybackStep('show-loading', function () { showLoading({ trackSwitch: true, seamlessCover: true }); });
    if (!qualitySwitch) lyricSunEnergy = 0; lyricSunTarget = 0; lyricSunHold = 0; lyricSunAvg = 0; lyricSunPeak = 0.55;

    // 首次播放: 粒子从暗处浮出 (Apple 风格)
    if (firstVisualPlay) {
      safePlaybackStep('first-visual-alpha', function () {
        firstPlayDone = true;
        tweenParticleAlpha(uniforms.uAlpha.value || 0, 1.0, 220);
      });
    }

    try {
      markPlayPhase('source-url');
      var playbackProvider = normalizePlaybackProvider(songProviderKey(song));
      var isQQPlayback = playbackProvider === 'qq';
      var isKugouPlayback = playbackProvider === 'kugou';
      var isQishuiPlayback = playbackProvider === 'qishui';
      var requestedQuality = normalizePlaybackQualityForProvider(opts.qualityOverride || getProviderPlaybackQuality(playbackProvider), playbackProvider);
      if (playbackProvider === 'netease' && requestedQuality === 'jymaster' && !hasProviderSvip('netease', loginStatus)) requestedQuality = 'hires';
      var qualityAuthorizationKey = typeof playbackQualityAuthorizationKey === 'function' ? playbackQualityAuthorizationKey(playbackProvider) : '';
      var qualityProbeUsed = typeof consumePlaybackQualityRuntimeProbe === 'function' && consumePlaybackQualityRuntimeProbe(song, playbackProvider, requestedQuality);
      var runtimeQualityCap = qualityProbeUsed ? '' : playbackQualityCapValue(song, playbackProvider);
      if (playbackQualityAboveCap(requestedQuality, playbackProvider, runtimeQualityCap)) {
        requestedQuality = runtimeQualityCap;
      }
      var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
      var data;
      if (albumGaplessHandoff) {
        data = opts.preloadedData;
      } else if (opts.preResolvedPlaybackData && opts.preResolvedPlaybackData.url) {
        data = opts.preResolvedPlaybackData;
      } else if (isQQPlayback) {
        data = await requestPlaybackSourceUrl('/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qqPlaybackEvidenceQuery(song) + qualityParam, { timeoutMs: 15000 }, token);
      } else if (isKugouPlayback) {
        data = await requestPlaybackSourceUrl('/api/kugou/song/url?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
          '&albumId=' + encodeURIComponent(song.albumId || song.album_id || '') +
          '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
          '&mixSongId=' + encodeURIComponent(song.mixSongId || '') +
          '&hqHash=' + encodeURIComponent(song.hqHash || song.hq_hash || '') +
          '&sqHash=' + encodeURIComponent(song.sqHash || song.sq_hash || '') +
          '&resHash=' + encodeURIComponent(song.resHash || song.res_hash || '') +
          '&vipRequired=' + encodeURIComponent(song.vipRequired || song.needVip || song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
          '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
          '&fee=' + encodeURIComponent(song.fee || song.Fee || '') +
          qualityParam, { timeoutMs: 20000 }, token);
      } else if (isQishuiPlayback) {
        if (typeof beginQishuiPlaybackProgress === 'function') beginQishuiPlaybackProgress(song, token, opts);
        var qishuiRemembered = !opts.fallbackDepth && !opts.qishuiTrialUpgradeTried && typeof qishuiRememberedFullSource === 'function'
          ? qishuiRememberedFullSource(song)
          : null;
        if (qishuiRemembered) {
          var rememberedOpts = Object.assign({}, opts, { resumeAt: opts.resumeAt != null ? opts.resumeAt : restoreResumeAt });
          var rememberedResult = await tryQishuiTrialFullSourceUpgrade(song, { trial: true, remembered: true, fullDuration: qishuiRemembered.expectedSec }, idx, token, rememberedOpts);
          if (rememberedResult !== null) return rememberedResult === true;
          if (token !== trackSwitchToken) return;
        }
        if (typeof startQishuiFullSourcePrefetch === 'function') startQishuiFullSourcePrefetch(song, opts);
        data = await requestPlaybackSourceUrl('/api/qishui/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || '') + qqPlaybackEvidenceQuery(song) + qualityParam, { timeoutMs: 15000 }, token);
      } else {
        data = await requestPlaybackSourceUrl('/api/song/url?id=' + encodeURIComponent(song.id || '') + neteasePlaybackMatchQuery(song) + qualityParam, { timeoutMs: 14000 }, token);
      }
      if (!playbackInvocationQueueStillCurrent()) return false;
      if (
        typeof sourceFallbackRecoveryFromOptions === 'function'
        && sourceFallbackRecoveryFromOptions(opts)
        && !sourceFallbackRecoveryCanContinue(sourceFallbackRecoveryFromOptions(opts))
      ) {
        return settleExpiredSourceFallbackPlayback(idx, token, opts);
      }
      if (data) {
        song.resolvedPlaybackProvider = playbackProvider;
        song.playbackLevel = data.level || song.playbackLevel || '';
        if (!data.sourceMatch) song.playbackSource = data.source || data.provider || song.playbackSource || '';
        if (playbackProvider === 'netease' && !data.sourceMatch) clearNeteaseSourceMatchMetadata(song);
        song.trial = !!(song.trial || data.trial);
        song.vipRequired = !!(
          song.vipRequired ||
          data.trial ||
          data.needVip ||
          data.need_vip ||
          data.vipRequired ||
          data.onlyVipPlayable ||
          data.only_vip_playable ||
          (data.restriction && /vip_required|paid_required|trial_only|need_vip|only_vip/i.test(String(data.restriction.category || data.restriction.reason || data.restriction.message || ''))) ||
          /vip_required|paid_required|trial_only|need_vip|only_vip/i.test(String(data.category || data.reason || data.error || data.message || '')) ||
          (typeof songRequiresVip === 'function' && songRequiresVip(Object.assign({}, song, data)))
        );
        if (typeof updateControlTrackInfo === 'function') updateControlTrackInfo(song);
        if (isKugouPlayback && typeof applyKugouPlaybackStatusEvidence === 'function') applyKugouPlaybackStatusEvidence(data);
        if (isQQPlayback && typeof applyQQPlaybackStatusEvidence === 'function') applyQQPlaybackStatusEvidence(data, song);
      }
      var retryPlaybackOpts = Object.assign({}, opts, { resumeAt: opts.resumeAt != null ? opts.resumeAt : restoreResumeAt });
      if (!data || !data.url) {
        if (isKugouPlayback && playbackRestrictionRawCategory(song, data) === 'verification_required') {
          hideLoading();
          forcePlaybackControlsInteractive();
          markQueueItemPlaybackFailed(idx);
          showToast('酷狗需要安全验证，请在官方窗口操作后重试播放');
          if (typeof openKugouSecurityVerification === 'function') openKugouSecurityVerification(data);
          return false;
        }
        if (isQishuiPlayback && typeof endQishuiPlaybackProgress === 'function') endQishuiPlaybackProgress(token);
        var fallbackResult = await tryAutoPlaybackFallback(song, data, idx, token, retryPlaybackOpts);
        if (token !== trackSwitchToken) return fallbackResult === true;
        if (fallbackResult !== null) return fallbackResult === true;
        if (opts.startupAutoplay) {
          markQueueItemPlaybackFailed(idx);
          if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, new Error(data && (data.message || data.reason) || '平台没有返回可播放地址'), retryPlaybackOpts);
          return false;
        }
        handlePlaybackUnavailable(song, data, { skipCard: true });
        if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, new Error(data && (data.message || data.reason) || '平台没有返回可播放地址'), retryPlaybackOpts);
        return false;
      }
      if (data.trial && isQishuiPlayback && !albumGaplessHandoff && typeof tryQishuiTrialFullSourceUpgrade === 'function') {
        var trialUpgrade = await tryQishuiTrialFullSourceUpgrade(song, data, idx, token, retryPlaybackOpts);
        if (trialUpgrade !== null) return trialUpgrade === true;
        if (token !== trackSwitchToken) return;
      }
      if (isQishuiPlayback && typeof endQishuiPlaybackProgress === 'function') endQishuiPlaybackProgress(token);
      var resolvedQualityText = playbackResolvedQualityText(data, playbackProvider);
      // Qishui's top tier means "best stream available", so whatever it resolves to is not a downgrade.
      var qualityDowngraded = !!(data && data.level && !(isQishuiPlayback && requestedQuality === 'hires') && playbackQualityWasDowngraded(requestedQuality, data.level, playbackProvider));
      var sameQualityAuthorization = !qualityAuthorizationKey || qualityAuthorizationKey === playbackQualityAuthorizationKey(playbackProvider);
      if (qualityDowngraded && sameQualityAuthorization) markPlaybackQualityRuntimeCap(song, playbackProvider, data.level, playbackRestrictionRawCategory(song, data) || 'resolved-lower', qualityProbeUsed);
      else if (qualityProbeUsed && sameQualityAuthorization) delete playbackQualityRuntimeCaps[playbackQualityTrackKey(song, playbackProvider)];
      if (!opts.startupAutoplay && !isQQPlayback && qualityDowngraded) {
        showSourceFallbackNotice((isKugouPlayback ? '酷狗' : (isQishuiPlayback ? '汽水' : '网易云')) + '音质自动降级', '请求 ' + playbackQualityLabel(requestedQuality, playbackProvider) + '，实际播放 ' + resolvedQualityText + '。');
      } else if (!opts.startupAutoplay && opts.qualitySwitch) {
        showSourceFallbackNotice('音质已切换', '实际播放: ' + resolvedQualityText + '。');
      }
      if (data.trial) {
        var txt;
        if (isQishuiPlayback && data.source === 'qishui-seo') txt = data.message || '汽水公开音源仅提供试听片段';
        else if (data.loggedIn && data.vipLevel === 'svip') txt = '此歌曲需要单曲、专辑购买或更高权限';
        else if (data.loggedIn && data.vipLevel === 'vip') txt = '此歌曲需要 SVIP 或购买 · 当前仅播放试听片段';
        else if (data.loggedIn) txt = '此歌曲需 VIP · 当前仅播放试听片段';
        else txt = '当前未登录 · 仅播放试听片段';
        document.getElementById('trial-text').textContent = txt;
        var trialLoginBtn = document.getElementById('trial-login-btn');
        if (trialLoginBtn) {
          trialLoginBtn.style.display = data.loggedIn ? 'none' : '';
          trialLoginBtn.onclick = function () { openProviderLogin(playbackProvider); };
        }
        document.getElementById('trial-banner').classList.add('show');
      }
      markPlayPhase('audio-element');
      var proxyAudioUrl = opts.preloadedProxyAudioUrl || '/api/audio?url=' + encodeURIComponent(data.url);
      if (albumGaplessHandoff) {
        audioFadeSerial++;
        clearAudioFadeTimers();
        if (albumGaplessPreviousAudio) albumGaplessPreviousAudio.onended = null;
        audio = opts.preloadedAudio;
        if (opts.cuefieldAutoMix && typeof claimCuefieldPreparedAudioForPlayback === 'function') {
          claimCuefieldPreparedAudioForPlayback(audio);
        }
        var preparedGraphGain = opts.cuefieldAutoMix && audio.__mineradioPreparedAudioGraph && audio.__mineradioPreparedAudioGraph.gainNode
          ? Number(audio.__mineradioPreparedAudioGraph.gainNode.gain.value)
          : NaN;
        albumGaplessAdoptedGain = albumGaplessMixed
          ? clampRange(isFinite(preparedGraphGain) ? preparedGraphGain : (Number(audio.volume) || 0), 0, 1)
          : audioSilentFloor();
        audio.crossOrigin = 'anonymous';
        audio.autoplay = true;
        audio.preload = 'auto';
        if (!audio.src) audio.src = proxyAudioUrl;
        if (!albumGaplessMixed) audio.volume = 0;
        else audio.muted = false;
      } else if (!audio) {
        audio = new Audio();
        audio.crossOrigin = 'anonymous';
      } else {
        audioFadeSerial++;
        clearAudioFadeTimers();
        audio.pause();
      }
      resetPlaybackAudioGraphForSourceSwitch(albumGaplessHandoff ? 'album-gapless-handoff' : 'track-switch');
      audio.autoplay = true;
      audio.preload = 'auto';
      syncActiveAudioRepeatMode(audio);
      // resetPlaybackAudioGraphForSourceSwitch may deliberately replace a
      // capture-backed element before a new src is assigned. Capture the
      // expected media only after that lifetime reset so playAudio never holds
      // a stale, already-paused element reference.
      playbackMedia = audio;
      bindPlaybackProgressEvents(audio);
      if (albumGaplessHandoff) setAudioOutputGainImmediate(albumGaplessMixed ? albumGaplessAdoptedGain : audioSilentFloor());
      else applyVolumeToAudio();
      await applyAudioOutputDevice(playbackMedia);
      if (!playbackInvocationStillCurrent(playbackMedia)) {
        disposeStalePlaybackInvocationMedia(playbackMedia);
        return false;
      }
      if (
        typeof sourceFallbackRecoveryFromOptions === 'function'
        && sourceFallbackRecoveryFromOptions(opts)
        && !sourceFallbackRecoveryCanContinue(sourceFallbackRecoveryFromOptions(opts))
      ) {
        return settleExpiredSourceFallbackPlayback(idx, token, opts);
      }
      if (!albumGaplessHandoff) audio.src = proxyAudioUrl;
      audio.__mineradioQueueItemKey = queueItemKey(song);
      audio.__mineradioTrackSwitchToken = token;
      updatePlaybackProgressUi();
      audio.onended = function () {
        if (token !== trackSwitchToken) return;
        if (this && this.__mineradioCuefieldEndedRecoveryToken === token) return;
        if (typeof cuefieldAutoMixExecuting !== 'undefined' && cuefieldAutoMixExecuting) {
          if (typeof noteCuefieldAutoMixOutgoingEnded === 'function') noteCuefieldAutoMixOutgoingEnded(this, token, currentIdx);
          return;
        }
        if (restartSingleRepeatMedia(this, token, currentIdx, 'online-ended')) return;
        finalizeListenSession(true);
        if (playAlbumGaplessNextOnEnded(token)) return;
        schedulePlaybackEndedAdvance(this, token);
      };
      scheduleAudioResumePosition(audio, opts.resumeAt != null ? opts.resumeAt : restoreResumeAt, token);
      if (restoreResumeAt > 0) pendingPlaybackResumeAt = 0;
      if (!albumGaplessHandoff) audio.load();
      markPlayPhase(qualitySwitch ? 'visual-prep-skip' : 'visual-prep');
      if (qualitySwitch) {
        if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume('quality-switch-audio-ready');
      } else try {
        // 重置 beatmap 状态
        currentBeatMap = null;
        beatMapNextIdx = 0;
        resetAudioVisualState({ preserveEnvelope: albumGaplessMixed });
        resetBeatCameraSync(audio && isFinite(audio.currentTime) ? audio.currentTime : 0, { preserveMomentum: albumGaplessMixed });
        cancelBeatAnalysisTimer();
        beatMapToken++;
        var bmTok = beatMapToken;
        if (podcastDjMode) {
          // 播客走独立 DJ 离线锁拍系统, 不写入普通歌曲 beatMap.
          djBeatMapToken++;
          cancelDjBeatAnalysisTimer();
          resetDjBeatMapState();
          currentBeatMap = null;
          beatMapNextIdx = 0;
          var djTok = djBeatMapToken;
          var djKey = djSongKey(song);
          if (djBeatMapCache[djKey]) {
            currentDjBeatMap = djBeatMapCache[djKey];
            applyPodcastDjProfileFromMap(currentDjBeatMap);
            syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
            hideBeatChip();
            notifyDesktopLyricsBeatMapReady();
            console.log('podcast DJ beatmap 缓存命中:', currentDjBeatMap.cameraBeats.length, '个主拍');
          } else {
            showBeatChip('DJ 离线锁拍准备中…');
            var djDurationSec = Math.max(0, Number(song.duration) || 0);
            if (djDurationSec > 10000) djDurationSec /= 1000;
            schedulePodcastDjAnalysis(djKey, data.url, djTok, djDurationSec);
          }
          maybeAnnounceDjMode();
        } else if (bmKey && beatMapCache[bmKey]) {
          // 如果缓存有, 直接用
          currentBeatMap = beatMapCache[bmKey];
          applyCinemaProfileFromBeatMap(currentBeatMap);
          syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0, albumGaplessMixed);
          notifyDesktopLyricsBeatMapReady();
          console.log('beatmap 缓存命中:', currentBeatMap.kicks.length, '个鼓点');
          scheduleQueueBeatPrefetch(idx, 2600);
        } else {
          // Disk-cache status/read must not gate the controlled audio start.
          schedulePlaybackBeatCacheRestore({ key: bmKey, song: song, index: idx,
            media: playbackMedia, trackToken: token, beatToken: bmTok,
            proxyUrl: proxyAudioUrl, preserveMomentum: albumGaplessMixed });
        }
      } catch (visualErr) {
        console.warn('[PlaybackVisualPrep]', song && song.name, visualErr);
        currentBeatMap = null;
        beatMapNextIdx = 0;
        safePlaybackStep('visual-prep-hide-chip', hideBeatChip);
      }
      markPlayPhase('audio-start');
      if (!playbackInvocationStillCurrent(playbackMedia)) return false;
      var playbackStarted = await playAudio({ manual: !!opts.manual, silent: isQQPlayback || !!opts.startupAutoplay || !opts.manual, startupAutoplay: !!opts.startupAutoplay, trackSwitch: true, resumeRecovery: !!opts.resumeRecovery, fade: albumGaplessHandoff ? false : opts.fade, preserveGain: albumGaplessMixed, expectedMedia: playbackMedia, expectedToken: token });
      if (!playbackInvocationStillCurrent(playbackMedia)) return false;
      if (
        typeof sourceFallbackRecoveryFromOptions === 'function'
        && sourceFallbackRecoveryFromOptions(opts)
        && !sourceFallbackRecoveryCanContinue(sourceFallbackRecoveryFromOptions(opts))
      ) {
        return settleExpiredSourceFallbackPlayback(idx, token, opts);
      }
      if (!playbackStarted) {
        var startFailure = playbackMedia && (playbackMedia.error || playbackMedia.__mineradioLastPlayError);
        if (playbackLoadIsNetworkError(startFailure)) {
          if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, startFailure, retryPlaybackOpts);
          return false;
        }
        if (playbackProvider === 'netease' && data && data.sourceMatch) {
          var sameSourceRetry = await retryNeteaseSourceMatchPlayback(song, data, idx, token, retryPlaybackOpts, requestedQuality);
          if (token !== trackSwitchToken) return sameSourceRetry === true;
          if (sameSourceRetry !== null) return sameSourceRetry === true;
          var matchedPlaybackFallback = await tryAutoPlaybackFallback(song, Object.assign({}, data, { url: null, reason: 'media_start_failed' }), idx, token, retryPlaybackOpts);
          if (token !== trackSwitchToken) return matchedPlaybackFallback === true;
          if (matchedPlaybackFallback !== null) return matchedPlaybackFallback === true;
        }
        if (isQQPlayback) {
          var qqRetryStarted = await retryQQPlaybackWithCompatibleQuality(song, idx, token, retryPlaybackOpts, data, requestedQuality);
          if (token !== trackSwitchToken) return qqRetryStarted === true;
          if (qqRetryStarted) return true;
        }
        var mediaFailureRecovery = typeof sourceFallbackRecoveryFromOptions === 'function'
          ? sourceFallbackRecoveryFromOptions(retryPlaybackOpts)
          : null;
        if (!opts.manual && (!opts.startupAutoplay || mediaFailureRecovery)) {
          var mediaFailureFallback = await tryAutoPlaybackFallback(
            song,
            Object.assign({}, data || {}, { url: null, reason: 'media_start_failed' }),
            idx,
            token,
            retryPlaybackOpts
          );
          if (token !== trackSwitchToken) return mediaFailureFallback === true;
          if (mediaFailureFallback !== null) return mediaFailureFallback === true;
          if (mediaFailureRecovery) {
            return await skipFailedQueueItem(
              idx,
              token,
              '当前歌曲无法启动播放，正在尝试队列里的下一首。',
              sourceFallbackRecoveryFailureOptions(retryPlaybackOpts)
            );
          }
        }
        forcePlaybackControlsInteractive();
        if (opts.startupAutoplay && !mediaFailureRecovery) {
          if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, startFailure || new Error('播放启动失败，请点重试'), retryPlaybackOpts);
          return false;
        }
        if (!opts.suppressPlayFailureNotice) {
          if (opts.manual) {
            showPlaybackLoadFailure(song, idx, token, startFailure || new Error('播放启动失败，请点重试'), retryPlaybackOpts);
          } else {
            showSourceFallbackNotice('歌曲已载入', '点击播放器中间的播放按钮继续播放。');
          }
        }
        return false;
      }
      forcePlaybackControlsInteractive();
      if (playbackProvider === 'netease' && data && data.sourceMatch) {
        applyNeteaseSourceMatchMetadata(song, data);
        if (typeof updateControlTrackInfo === 'function') updateControlTrackInfo(song);
      }
      if (!opts.startupAutoplay && !opts.qualitySwitch && data && data.sourceMatch && !song.neteaseSourceMatchNotified && typeof showSourceFallbackNotice === 'function') {
        song.neteaseSourceMatchNotified = true;
        showSourceFallbackNotice('网易云已匹配可播音源', '已在网易云内切换到同一首歌的可播版本；歌词、封面、专辑和队列仍保持原曲。');
      }
      if (albumGaplessHandoff && albumGaplessMixed && typeof rampAudioOutputGain === 'function') {
        rampAudioOutputGain(targetVolume, ALBUM_GAPLESS_ADOPT_SLEW_MS);
      }
      if (albumGaplessHandoff && albumGaplessPreviousAudio && albumGaplessPreviousAudio !== audio) {
        setTimeout(function () {
          try {
            albumGaplessPreviousAudio.pause();
            albumGaplessPreviousAudio.removeAttribute('src');
            albumGaplessPreviousAudio.load();
          } catch (e) { }
        }, 220);
      }
      if (typeof dismissSourceFallbackNotice === 'function') dismissSourceFallbackNotice('playback-load');
      markPlayPhase('session-begin');
      safePlaybackStep('listen-session-begin', function () { beginListenSession(song, playbackContext); });
      markPlayPhase('lyrics-fetch');
      if (song.type === 'podcast') {
        if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
        safePlaybackStep('podcast-lyrics', function () {
          var podcastLyricLines = withLyricFallback([]);
          setOriginalLyricsState(podcastLyricLines, false, 'fallback');
          applyPreferredLyricsForCurrent(true);
        });
      } else if (!qualitySwitch) {
        if (!earlyLyricFetchStarted) fetchLyric(song, token);
      } else {
        if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
        if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume('quality-switch-lyrics-kept');
      }
      if (!qualitySwitch) {
        safeRenderQueuePanel('play-queue-at');
        scheduleShelfRebuild('play-queue-at', true);
        if (typeof scheduleQueueLyricPrefetch === 'function') scheduleQueueLyricPrefetch(idx, 2400);
      }
      if (!qualitySwitch && typeof scheduleCuefieldAutoMixPrepare === 'function') {
        var cuefieldPrepareDelay = typeof cuefieldAutoMixPostSwitchDelay === 'function'
          ? cuefieldAutoMixPostSwitchDelay(!!opts.cuefieldAutoMix)
          : 4200;
        scheduleCuefieldAutoMixPrepare(token, idx, cuefieldPrepareDelay);
      }
      scheduleAlbumGaplessPreloadForCurrent(token, albumGaplessHandoff ? 'album-gapless-handoff-started' : 'track-started');
      safePlaybackStep('shelf-preview-suppress-end', suppressShelfPreviewForPlaybackSwitch);
      if (typeof completeSourceFallbackRecovery === 'function') {
        completeSourceFallbackRecovery(sourceFallbackRecoveryFromOptions(opts));
      }
      return true;
    } catch (err) {
      if (!playbackInvocationQueueStillCurrent()) return false;
      console.error('Play failed:', { phase: playPhase, error: err }, err);
      hideLoading();
      forcePlaybackControlsInteractive();
      if (playbackLoadIsNetworkError(err)) {
        if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, err, Object.assign({}, opts, { resumeAt: opts.resumeAt != null ? opts.resumeAt : restoreResumeAt }));
        return false;
      }
      var catchRecovery = typeof sourceFallbackRecoveryFromOptions === 'function'
        ? sourceFallbackRecoveryFromOptions(opts)
        : null;
      if (opts.startupAutoplay && !catchRecovery) {
        if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, err, Object.assign({}, opts, { resumeAt: opts.resumeAt != null ? opts.resumeAt : restoreResumeAt }));
        return false;
      }
      if (catchRecovery && opts.fallbackDepth > 0) return false;
      if (!isPlaybackRecursionError(err) && token === trackSwitchToken && !opts.manual && (catchRecovery || playQueue.length > 1)) {
        return await skipFailedQueueItem(
          idx,
          token,
          '当前歌曲加载失败，正在尝试队列里的下一首。',
          catchRecovery ? sourceFallbackRecoveryFailureOptions(opts) : { playbackOpts: opts }
        );
      }
      if (opts.suppressPlayFailureNotice) return false;
      var failText = playbackFailureToastText(err);
      showToast(failText);
      showPlaybackLoadFailure(song, idx, token, err, Object.assign({}, opts, { resumeAt: opts.resumeAt != null ? opts.resumeAt : restoreResumeAt }));
      return false;
    }
  } catch (setupErr) {
    if (typeof token === 'undefined' || token !== trackSwitchToken) return false;
    console.error('Play setup failed:', { phase: playPhase, error: setupErr }, setupErr);
    hideLoading();
    forcePlaybackControlsInteractive();
    if (playbackLoadIsNetworkError(setupErr)) {
      if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, setupErr, opts);
      return false;
    }
    var setupRecovery = typeof sourceFallbackRecoveryFromOptions === 'function'
      ? sourceFallbackRecoveryFromOptions(opts)
      : null;
    if (opts.startupAutoplay && !setupRecovery) {
      if (!opts.suppressPlayFailureNotice) showPlaybackLoadFailure(song, idx, token, setupErr, opts);
      return false;
    }
    if (setupRecovery && opts.fallbackDepth > 0) return false;
      if (!isPlaybackRecursionError(setupErr) && typeof token !== 'undefined' && token === trackSwitchToken && !opts.manual && (setupRecovery || playQueue.length > 1)) {
        return await skipFailedQueueItem(
          idx,
          token,
          '当前歌曲切换失败，正在尝试队列里的下一首。',
          setupRecovery ? sourceFallbackRecoveryFailureOptions(opts) : { playbackOpts: opts }
        );
    }
    if (opts.suppressPlayFailureNotice) return false;
    var setupFailText = playbackFailureToastText(setupErr);
    showToast(setupFailText);
    showPlaybackLoadFailure(song, idx, token, setupErr, opts);
    return false;
  } finally {
    if (pendingQueuePlaybackToken === token) pendingQueuePlaybackToken = 0;
    if (typeof scheduleLocalAudioObjectUrlSweep === 'function') scheduleLocalAudioObjectUrlSweep();
  }
}
