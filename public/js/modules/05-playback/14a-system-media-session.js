// Connect Chromium's Windows media controls to the actual playback owner.
// Audio objects are not DOM nodes; no selector polling or global key capture.
var systemMediaSessionAudio = null;
var systemMediaSessionListeners = [];
var systemMediaMetadataKey = '';
var systemMediaPositionAt = 0;
var SYSTEM_MEDIA_ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'];

function getSystemMediaSession() {
  return typeof navigator !== 'undefined' && navigator.mediaSession || null;
}
function updateSystemMediaPosition(force) {
  var session = getSystemMediaSession();
  if (!session || typeof session.setPositionState !== 'function') return;
  var now = Date.now();
  if (!force && now - systemMediaPositionAt < 1000) return;
  systemMediaPositionAt = now;
  var duration = Number(audio && audio.duration);
  try {
    if (!isFinite(duration) || duration <= 0) { session.setPositionState(); return; }
    session.setPositionState({
      duration: duration,
      position: Math.max(0, Math.min(duration, Number(audio.currentTime) || 0)),
      playbackRate: Math.max(0.01, Number(audio.playbackRate) || 1)
    });
  } catch (_) { }
}
function updateSystemMediaSession(song) {
  var session = getSystemMediaSession();
  if (!session) return;
  song = song || (playQueue && playQueue[currentIdx]) || currentLocalSong;
  var title = String(song && (song.name || song.title) || '');
  var artist = String(song && song.artist || '');
  var album = String(song && song.album || '');
  var cover = song && typeof songCoverSrc === 'function' ? songCoverSrc(song, 512) : song && song.cover || '';
  var key = JSON.stringify([title, artist, album, cover]);
  if (key !== systemMediaMetadataKey) {
    systemMediaMetadataKey = key;
    try {
      session.metadata = song && typeof MediaMetadata === 'function' ? new MediaMetadata({
        title: title, artist: artist, album: album,
        artwork: cover ? [{ src: cover }] : []
      }) : null;
    } catch (_) {
      try { session.metadata = new MediaMetadata({ title: title, artist: artist, album: album }); } catch (_) { }
    }
  }
  try { session.playbackState = !audio || !audio.src || audio.ended ? 'none' : audio.paused ? 'paused' : 'playing'; } catch (_) { }
  updateSystemMediaPosition(true);
}
function bindSystemMediaAudio(media) {
  if (media === systemMediaSessionAudio) return;
  systemMediaSessionListeners.forEach(function (entry) { entry.media.removeEventListener(entry.name, entry.handler); });
  systemMediaSessionListeners = [];
  systemMediaSessionAudio = media;
  if (!media || !getSystemMediaSession()) return;
  ['play', 'playing', 'pause', 'ended', 'emptied', 'error', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange', 'timeupdate'].forEach(function (name) {
    var handler = function () {
      if (media !== audio) return;
      if (name === 'timeupdate') updateSystemMediaPosition(false);
      else updateSystemMediaSession();
    };
    media.addEventListener(name, handler);
    systemMediaSessionListeners.push({ media: media, name: name, handler: handler });
  });
  updateSystemMediaSession();
}
function seekFromSystemMediaSession(seconds) {
  if (!audio || !isFinite(seconds) || !(audio.duration > 0) || progressDragState.active) return;
  if (typeof resetCuefieldAutoMix === 'function') resetCuefieldAutoMix('manual-seek');
  if (typeof clearAlbumGaplessPreload === 'function') clearAlbumGaplessPreload('manual-seek');
  progressDragState.media = audio;
  progressDragState.mediaSrc = audio.currentSrc || audio.src || '';
  progressDragState.previewDuration = audio.duration;
  commitProgressSeek(Math.max(0, Math.min(audio.duration, seconds)), !audio.paused);
  updateSystemMediaPosition(true);
}
function handleSystemMediaAction(action, details) {
  if (action === 'play') {
    if (!audio || !audio.src || audio.paused || audio.ended) return togglePlay();
  } else if (action === 'pause') {
    if (audio && !audio.paused && !audio.ended) return togglePlay();
  } else if (action === 'previoustrack') return prevTrack(true);
  else if (action === 'nexttrack') return nextTrack(true);
  else if (action === 'seekto') seekFromSystemMediaSession(Number(details && details.seekTime));
  else if (action === 'seekbackward' || action === 'seekforward') {
    var offset = Number(details && details.seekOffset);
    if (!isFinite(offset) || offset <= 0) offset = 10;
    seekFromSystemMediaSession(Number(audio && audio.currentTime) + offset * (action === 'seekforward' ? 1 : -1));
  }
}
function clearSystemMediaSession() {
  bindSystemMediaAudio(null);
  var session = getSystemMediaSession();
  if (!session) return;
  SYSTEM_MEDIA_ACTIONS.forEach(function (action) { try { session.setActionHandler(action, null); } catch (_) { } });
  try { session.metadata = null; session.playbackState = 'none'; session.setPositionState(); } catch (_) { }
}
function initializeSystemMediaSession() {
  var session = getSystemMediaSession();
  if (!session) return;
  SYSTEM_MEDIA_ACTIONS.forEach(function (action) {
    try {
      session.setActionHandler(action, function (details) {
        Promise.resolve(handleSystemMediaAction(action, details)).catch(function (error) { console.warn('[MediaSession]', error && error.message); });
      });
    } catch (_) { }
  });
  window.addEventListener('pagehide', clearSystemMediaSession, { once: true });
}
initializeSystemMediaSession();
