// ============================================================
var AUDIO_UPLOAD_EXT_RE = /\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i;
var IMAGE_UPLOAD_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;
function isAudioUploadFile(file) {
  if (!file) return false;
  return /^audio\//i.test(file.type || '') || AUDIO_UPLOAD_EXT_RE.test(file.name || '');
}
function isImageUploadFile(file) {
  if (!file) return false;
  return /^image\//i.test(file.type || '') || IMAGE_UPLOAD_EXT_RE.test(file.name || '');
}
function uploadFileSortKey(file) {
  return String((file && (file.webkitRelativePath || file.name)) || '').toLowerCase();
}
function sortedAudioUploadFiles(files) {
  return Array.prototype.slice.call(files || [])
    .filter(isAudioUploadFile)
    .sort(function (a, b) {
      return uploadFileSortKey(a).localeCompare(uploadFileSortKey(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
    });
}
function firstImageUploadFile(files) {
  var list = Array.prototype.slice.call(files || []);
  for (var i = 0; i < list.length; i++) if (isImageUploadFile(list[i])) return list[i];
  return null;
}
// Only URLs created by this importer belong to this registry. Desktop library
// protocol URLs and URLs owned by other features must never be revoked here.
function localAudioObjectUrlRegistry() {
  if (!localAudioObjectUrlRegistry.entries) localAudioObjectUrlRegistry.entries = Object.create(null);
  return localAudioObjectUrlRegistry.entries;
}
function retainLocalAudioObjectUrl(url) {
  var entry = localAudioObjectUrlRegistry()[url];
  if (!entry) return function () {};
  entry.readers++;
  var released = false;
  return function () {
    if (released) return;
    released = true;
    entry.readers--;
    scheduleLocalAudioObjectUrlSweep();
  };
}
function pinSavedLocalAudioObjectUrl(url) {
  var entry = localAudioObjectUrlRegistry()[url];
  // Built-in playlist summaries do not expose all saved tracks. Keep saved
  // session-only audio alive until this page exits, even when its panel closes.
  if (entry) entry.saved = true;
}
function collectLocalAudioObjectUrlReferences() {
  var keep = Object.create(null);
  function mark(url) { if (typeof url === 'string' && url) keep[url] = true; }
  function song(value) { if (value) mark(value.localUrl); }
  function songs(values) { if (Array.isArray(values)) values.forEach(song); }
  function catalogs(values) {
    if (Array.isArray(values)) values.forEach(function (value) { if (value) { songs(value.songs); songs(value.tracks); } });
  }
  function media(value) { if (value) { mark(value.src); mark(value.currentSrc); } }
  try {
    if (typeof playQueue !== 'undefined') songs(playQueue);
    if (typeof playlist !== 'undefined') songs(playlist);
    if (typeof persistentLocalLibraryTracks !== 'undefined') songs(persistentLocalLibraryTracks);
    if (typeof currentLocalSong !== 'undefined') song(currentLocalSong);
    if (typeof collectTargetSong !== 'undefined') song(collectTargetSong);
    if (typeof detailCommentSong !== 'undefined') song(detailCommentSong);
    if (typeof detailArtistSongs !== 'undefined') songs(detailArtistSongs);
    if (typeof detailAlbumSongs !== 'undefined') songs(detailAlbumSongs);
    if (typeof userPlaylists !== 'undefined') catalogs(userPlaylists);
    if (typeof builtInPlaylists !== 'undefined') catalogs(builtInPlaylists);
    if (typeof playlistPanelDetailState !== 'undefined' && playlistPanelDetailState) songs(playlistPanelDetailState.tracks);
    if (typeof localBeatAnalysis !== 'undefined' && localBeatAnalysis) {
      song(localBeatAnalysis.song); mark(localBeatAnalysis.audioUrl);
    }
    if (typeof audio !== 'undefined') media(audio);
    if (typeof audioSourceMedia !== 'undefined') media(audioSourceMedia);
    if (typeof audioOutputMirrorElements !== 'undefined' && audioOutputMirrorElements) Object.keys(audioOutputMirrorElements).forEach(function (key) { media(audioOutputMirrorElements[key]); });
    if (typeof albumGaplessState !== 'undefined' && albumGaplessState && albumGaplessState.preload) {
      song(albumGaplessState.preload.song); media(albumGaplessState.preload.media); media(albumGaplessState.preload.outgoingMedia); media(albumGaplessState.preload.previousAudio);
    }
    if (typeof cuefieldAutoMixPreparedAudio !== 'undefined') media(cuefieldAutoMixPreparedAudio);
    if (typeof cuefieldActiveTransitionContext !== 'undefined' && cuefieldActiveTransitionContext) media(cuefieldActiveTransitionContext.outgoingMedia);
    if (typeof shelfManager !== 'undefined' && shelfManager && shelfManager.getCards) {
      shelfManager.getCards().forEach(function (card) { if (card) song(card.item); });
    }
  } catch (e) {
    // An incomplete scan is not evidence that an audio resource is unused.
    return null;
  }
  return keep;
}
function sweepLocalAudioObjectUrls(exiting) {
  var entries = localAudioObjectUrlRegistry();
  var keep = exiting ? Object.create(null) : collectLocalAudioObjectUrlReferences();
  if (!keep) return;
  Object.keys(entries).forEach(function (url) {
    var entry = entries[url];
    if (!exiting && (entry.readers || entry.saved || keep[url])) return;
    try { URL.revokeObjectURL(url); delete entries[url]; } catch (e) { }
  });
}
function scheduleLocalAudioObjectUrlSweep() {
  if (scheduleLocalAudioObjectUrlSweep.timer) clearTimeout(scheduleLocalAudioObjectUrlSweep.timer);
  scheduleLocalAudioObjectUrlSweep.timer = setTimeout(function tick() {
    scheduleLocalAudioObjectUrlSweep.timer = null;
    sweepLocalAudioObjectUrls(false);
    // Details/collection panels and delayed media disposal may release the last
    // reference without changing the queue. One timer covers all owned URLs.
    if (Object.keys(localAudioObjectUrlRegistry()).length) scheduleLocalAudioObjectUrlSweep.timer = setTimeout(tick, 30000);
  }, 0);
}
function releaseLocalAudioObjectUrlsOnPageHide(event) {
  if (event && event.persisted) return; // BFCache pages can resume playback.
  if (scheduleLocalAudioObjectUrlSweep.timer) clearTimeout(scheduleLocalAudioObjectUrlSweep.timer);
  scheduleLocalAudioObjectUrlSweep.timer = null;
  sweepLocalAudioObjectUrls(true);
}
function localSongFromAudioFile(file) {
  var rel = String(file.webkitRelativePath || file.name || '');
  var filename = String(file.name || rel || '本地音乐');
  var title = filename.replace(/\.[^.]+$/, '');
  var localUrl = URL.createObjectURL(file);
  localAudioObjectUrlRegistry()[localUrl] = { readers: 0, saved: false };
  scheduleLocalAudioObjectUrlSweep();
  try { return hydrateCustomCover({
    type: 'local',
    source: 'local',
    provider: 'local',
    name: title || '本地音乐',
    artist: '本地文件',
    album: rel && rel !== filename ? rel.split(/[\\/]/).slice(0, -1).join(' / ') : '',
    localKey: [rel || filename, file.size || 0, file.lastModified || 0].join(':'),
    localUrl: localUrl,
    localPath: rel,
    duration: 0
  }); } catch (error) {
    URL.revokeObjectURL(localUrl);
    delete localAudioObjectUrlRegistry()[localUrl];
    throw error;
  }
}
function canUsePersistentLocalMusicLibrary() {
  return !!(
    window.desktopWindow &&
    typeof window.desktopWindow.importLocalMusicFiles === 'function'
  );
}
async function importPersistentLocalAudioFiles(files) {
  if (!canUsePersistentLocalMusicLibrary()) return null;
  var selectedFiles = Array.prototype.slice.call(files || []);
  if (!selectedFiles.length) return null;
  var result = await window.desktopWindow.importLocalMusicFiles(selectedFiles);
  if (!result || result.ok !== true || !Array.isArray(result.tracks) || !result.tracks.length) {
    throw new Error(result && result.error || 'LOCAL_LIBRARY_IMPORT_FAILED');
  }
  return result;
}
function isLocalPlaybackSnapshot(snapshot) {
  var song = snapshot && snapshot.current;
  return !!(song && (song.type === 'local' || song.source === 'local' || song.localKey || song.localFileId));
}
function restoredLocalTrackIndex(tracks, snapshot) {
  var current = snapshot && snapshot.current || {};
  var localId = String(current.localFileId || current.localKey || '').replace(/^local:/, '');
  if (localId) {
    for (var i = 0; i < tracks.length; i++) {
      var songId = String(tracks[i].localFileId || tracks[i].localKey || '').replace(/^local:/, '');
      if (songId === localId) return i;
    }
    return -1;
  }
  var fallback = Number(snapshot && snapshot.currentIdx);
  return isFinite(fallback) && fallback >= 0 && fallback < tracks.length ? Math.round(fallback) : 0;
}
async function restorePersistedLocalLibrary() {
  if (!window.desktopWindow || typeof window.desktopWindow.listLocalMusicLibrary !== 'function') return false;
  var snapshotAtRequest = restoredLastPlaybackSnapshot;
  var queueAtRequest = playQueue;
  var indexAtRequest = currentIdx;
  var localSongAtRequest = currentLocalSong;
  var trackTokenAtRequest = trackSwitchToken;
  var result;
  try { result = await window.desktopWindow.listLocalMusicLibrary(); } catch (e) { return false; }
  if (!result || result.ok !== true || !Array.isArray(result.tracks)) return false;
  if (result.missing > 0 && typeof showToast === 'function') showToast('本地曲库有 ' + result.missing + ' 首文件暂时离线，已保留记录');
  var tracks = result.tracks.map(function (song) {
    var copy = hydrateCustomCover(Object.assign({}, song));
    copy.localMissing = false;
    return copy;
  }).filter(function (song) { return song && song.localUrl && song.localKey; });
  persistentLocalLibraryTracks = tracks.map(cloneSong);
  var snapshot = snapshotAtRequest;
  if (
    restoredLastPlaybackSnapshot !== snapshotAtRequest
    || playQueue !== queueAtRequest
    || currentIdx !== indexAtRequest
    || currentLocalSong !== localSongAtRequest
    || trackSwitchToken !== trackTokenAtRequest
  ) return false;
  if (snapshot) {
    // The library is an index of every imported file, not the user's saved
    // queue. Hydrate only those saved entries, retaining mixed sources/order.
    var byId = Object.create(null);
    tracks.forEach(function (song) { byId[String(song.localFileId || song.localKey || '').replace(/^local:/, '')] = song; });
    var savedQueue = queueAtRequest.length ? queueAtRequest : [snapshot.current];
    var restoredQueue = [];
    for (var qi = 0; qi < savedQueue.length; qi++) {
      var saved = savedQueue[qi];
      if (!isLocalPlaybackSnapshot({ current: saved })) { restoredQueue.push(saved); continue; }
      var localId = String(saved.localFileId || saved.localKey || '').replace(/^local:/, '');
      var resolved = byId[localId];
      if (!resolved && localId && typeof window.desktopWindow.resolveLocalMusicTrack === 'function') {
        try { resolved = await window.desktopWindow.resolveLocalMusicTrack(localId); } catch (e) { resolved = null; }
      }
      if (restoredLastPlaybackSnapshot !== snapshotAtRequest || playQueue !== queueAtRequest || currentIdx !== indexAtRequest
        || currentLocalSong !== localSongAtRequest || trackSwitchToken !== trackTokenAtRequest) return false;
      // An absent record was removed from the library. An existing offline
      // record keeps its identity and the resolver's content checks.
      if (!resolved) continue;
      restoredQueue.push(hydrateCustomCover(Object.assign({}, saved, resolved)));
    }
    var currentKey = queueItemKey(snapshot.current);
    var restoredIndex = restoredQueue.findIndex(function (song) { return queueItemKey(song) === currentKey; });
    if (restoredIndex < 0 && restoredQueue.length) {
      restoredIndex = Math.min(restoredQueue.length - 1, Math.max(0, indexAtRequest));
      pendingPlaybackResumeAt = 0;
      snapshot.current = playbackRestoreSongSnapshot(restoredQueue[restoredIndex]);
      snapshot.currentTime = 0;
      snapshot.duration = playbackDurationFromSong(restoredQueue[restoredIndex]);
    }
    if (restoredIndex < 0 || !restoredQueue[restoredIndex]) {
      playQueue = restoredQueue;
      currentIdx = -1;
      currentLocalSong = null;
      pendingPlaybackResumeAt = 0;
      restoredLastPlaybackSnapshot = null;
      startupRestoreHomePending = false;
      try { localStorage.removeItem(LAST_PLAYBACK_STORE_KEY); } catch (e) { }
      applyRestoredPlaybackProgressUi({ currentTime: 0, duration: 0, current: null });
      if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'local-library-removed');
      safeRenderQueuePanel('local-library-missing');
      updateEmptyHomeVisibility({ forceLoad: false });
      return false;
    }
    tracks = restoredQueue;
    currentIdx = restoredIndex;
  } else {
    currentIdx = -1;
  }
  playQueue = tracks;
  if (snapshot && typeof syncQueueLogicalOrder === 'function') syncQueueLogicalOrder(true);
  currentLocalSong = snapshot && isLocalPlaybackSnapshot({ current: tracks[currentIdx] }) ? tracks[currentIdx] : null;
  if (!snapshot) {
    safeRenderQueuePanel('local-library-restore');
    updateEmptyHomeVisibility({ forceLoad: false });
    return false;
  }
  var current = playQueue[currentIdx];
  if (!current) return false;
  snapshot.current = playbackRestoreSongSnapshot(current);
  snapshot.current.localMissing = !!current.localMissing;
  snapshot.currentIdx = currentIdx;
  snapshot.queue = playQueue.map(playbackRestoreSongSnapshot);
  updateControlTrackInfo(current);
  var titleEl = document.getElementById('thumb-title');
  var artistEl = document.getElementById('thumb-artist');
  if (titleEl) titleEl.textContent = current.name || current.title || '本地音乐';
  if (artistEl) artistEl.textContent = current.artist || (isLocalPlaybackSnapshot(snapshot) ? '本地文件' : '');
  var thumbWrap = document.getElementById('thumb-wrap');
  if (thumbWrap) thumbWrap.classList.add('visible');
  if (current.cover) {
    setTimeout(function () {
      if (!audio && currentIdx >= 0 && playQueue[currentIdx] && queueItemKey(playQueue[currentIdx]) === queueItemKey(current)) {
        loadCoverFromUrl(songCoverSrc(current, 400), { deferHeavy: true, delay: 120, timeout: 700 });
      }
    }, 180);
  }
  safeRenderQueuePanel('local-library-restore', { scrollCurrent: miniQueueOpen });
  updateEmptyHomeVisibility({ forceLoad: false });
  if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'local-library-restored');
  return true;
}
function loadPersistedLocalLibraryIntoQueue() {
  if (!Array.isArray(persistentLocalLibraryTracks) || !persistentLocalLibraryTracks.length) return false;
  return importLocalAudioSongs(persistentLocalLibraryTracks.map(cloneSong), { mode: 'persistent-library' });
}
var uploadFilePickerActiveUntil = 0;
var uploadFilePickerFocusArmed = false;
var uploadFilePickerFocusTimer = null;
function uploadImportNow() {
  return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now();
}
function isUploadPanelOpen() {
  var panel = document.getElementById('upload-panel');
  return !!(panel && panel.classList.contains('show'));
}
function pinUploadSearchArea() {
  var area = document.getElementById('search-area');
  if (area && typeof setPeek === 'function') setPeek(area, true, 'search');
}
function keepUploadImportActive(ms) {
  uploadFilePickerActiveUntil = Math.max(uploadFilePickerActiveUntil, uploadImportNow() + (ms || 12000));
  pinUploadSearchArea();
}
function isUploadImportActive() {
  return isUploadPanelOpen() || uploadImportNow() < uploadFilePickerActiveUntil;
}
function clearUploadFilePickerFocusTimer() {
  if (uploadFilePickerFocusTimer) {
    clearTimeout(uploadFilePickerFocusTimer);
    uploadFilePickerFocusTimer = null;
  }
}
function disarmUploadFilePickerFocus() {
  if (!uploadFilePickerFocusArmed) return;
  uploadFilePickerFocusArmed = false;
  window.removeEventListener('focus', handleUploadFilePickerFocus);
}
function handleUploadFilePickerFocus() {
  disarmUploadFilePickerFocus();
  keepUploadImportActive(900);
  clearUploadFilePickerFocusTimer();
  uploadFilePickerFocusTimer = setTimeout(function () {
    uploadFilePickerFocusTimer = null;
    uploadFilePickerActiveUntil = 0;
    if (isUploadPanelOpen()) closeUploadPanel();
  }, 900);
}
function armUploadFilePickerFocus() {
  disarmUploadFilePickerFocus();
  uploadFilePickerFocusArmed = true;
  window.addEventListener('focus', handleUploadFilePickerFocus);
}
function finishUploadFilePicker(closePanel) {
  uploadFilePickerActiveUntil = 0;
  clearUploadFilePickerFocusTimer();
  disarmUploadFilePickerFocus();
  if (closePanel) closeUploadPanel({ keepPicker: true });
}
function openUploadPanel() {
  closeUploadTip(false);
  var actions = document.getElementById('upload-actions');
  var panel = document.getElementById('upload-panel');
  if (!panel) return;
  var hidden = !actions;
  if (!hidden) {
    try {
      var style = getComputedStyle(actions);
      hidden = style.display === 'none' || style.visibility === 'hidden' || actions.getClientRects().length === 0;
    } catch (e) { }
  }
  if (hidden) {
    triggerUploadInput('audio');
    return;
  }
  panel.classList.add('show');
  pinUploadSearchArea();
}
function closeUploadPanel(opts) {
  opts = opts || {};
  if (!opts.keepPicker) uploadFilePickerActiveUntil = 0;
  var panel = document.getElementById('upload-panel');
  if (panel) panel.classList.remove('show');
}
function toggleUploadPanel(event) {
  if (event) event.stopPropagation();
  var panel = document.getElementById('upload-panel');
  if (!panel) return;
  if (panel.classList.contains('show')) closeUploadPanel();
  else openUploadPanel();
}
function triggerUploadInput(kind) {
  var id = kind === 'cover' ? 'cover-input' : (kind === 'folder' ? 'folder-input' : 'file-input');
  var input = document.getElementById(id);
  if (!input) {
    closeUploadPanel();
    return;
  }
  keepUploadImportActive(kind === 'folder' ? 120000 : 45000);
  armUploadFilePickerFocus();
  try {
    input.click();
  } catch (e) {
    console.warn('[LocalImport] failed to open file picker', e);
    finishUploadFilePicker(false);
  }
}
function importLocalAudioSongs(songs, opts) {
  opts = opts || {};
  songs = Array.isArray(songs) ? songs.filter(Boolean) : [];
  if (!songs.length) return false;
  if (typeof cancelPlaylistQueueHydration === 'function') cancelPlaylistQueueHydration('local-import');
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  playQueue = songs.map(cloneSong);
  currentIdx = 0;
  currentLocalSong = null;
  activeRadioContext = null;
  safeRenderQueuePanel('local-import', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('local-import', true);
  forcePlaybackControlsInteractive();
  updateEmptyHomeVisibility({ forceLoad: false });
  showToast(songs.length > 1 ? ('已导入 ' + songs.length + ' 首本地音乐') : '正在播放本地音乐');
  var importedQueue = playQueue;
  var importedSong = playQueue[0];
  var importPlayback = playQueueAt(0, { manual: true });
  var importToken = trackSwitchToken;
  Promise.resolve(importPlayback).then(function () {
    if (opts.coverFile && trackSwitchToken === importToken && playQueue === importedQueue && currentIdx === 0 && playQueue[0] === importedSong) {
      loadCoverFromFile(opts.coverFile, { trackToken: trackSwitchToken, deferHeavy: false, delay: 0, timeout: 260 });
    }
  }).catch(function (e) { console.warn('[LocalImport]', e); }).finally(function () { if (typeof scheduleLocalAudioObjectUrlSweep === 'function') scheduleLocalAudioObjectUrlSweep(); });
  if (typeof scheduleLocalAudioObjectUrlSweep === 'function') scheduleLocalAudioObjectUrlSweep();
  return true;
}
function handleCoverFiles(files) {
  finishUploadFilePicker(true);
  var imgFile = firstImageUploadFile(files);
  if (!imgFile) {
    showToast('没有找到可用的封面图片');
    return;
  }
  loadCoverFromFile(imgFile, null);
  updateCustomCoverButton();
}
async function handleFiles(files, opts) {
  finishUploadFilePicker(true);
  opts = opts || {};
  var audioFiles = sortedAudioUploadFiles(files);
  var imgFile = firstImageUploadFile(files);
  if (audioFiles.length) {
    var importOwner = typeof beginQueueLoadRequest === 'function'
      ? beginQueueLoadRequest('local-import-request')
      : { queue: playQueue, index: currentIdx, trackToken: trackSwitchToken };
    function localImportRequestStillCurrent() {
      if (typeof queueLoadRequestStillCurrent === 'function' && importOwner.serial != null) return queueLoadRequestStillCurrent(importOwner);
      return importOwner.queue === playQueue && importOwner.index === currentIdx && importOwner.trackToken === trackSwitchToken;
    }
    var songs;
    var persistenceFailed = false;
    if (canUsePersistentLocalMusicLibrary()) {
      showToast('正在读取 ' + audioFiles.length + ' 首本地音乐的标签与歌词…');
      try {
        var persisted = await importPersistentLocalAudioFiles(audioFiles);
        if (!localImportRequestStillCurrent()) return false;
        songs = persisted && persisted.tracks;
        if (!songs || !songs.length) throw new Error('LOCAL_LIBRARY_IMPORT_EMPTY');
        persistentLocalLibraryTracks = songs.map(cloneSong);
        if (persisted && Array.isArray(persisted.failures) && persisted.failures.length) {
          setTimeout(function () { showToast('有 ' + persisted.failures.length + ' 个文件无法读取，其余歌曲已保存'); }, 900);
        }
      } catch (e) {
        if (!localImportRequestStillCurrent()) return false;
        persistenceFailed = true;
        console.warn('[LocalImport] persistent library unavailable, using this session only', e);
      }
    }
    if (!localImportRequestStillCurrent()) return false;
    if (!songs || !songs.length) songs = audioFiles.map(localSongFromAudioFile);
    importLocalAudioSongs(songs, { coverFile: songs.length === 1 ? imgFile : null, mode: opts.mode || '' });
    if (persistenceFailed) {
      setTimeout(function () { showToast('本地曲库保存失败：这些歌曲仅本次可用，重启后不会保留'); }, 260);
    }
    return;
  }
  if (imgFile) {
    handleCoverFiles([imgFile]);
    return;
  }
  showToast('没有找到可导入的音乐或封面文件');
}
var fileInput = document.getElementById('file-input');
if (fileInput) fileInput.addEventListener('change', function (e) { handleFiles(e.target.files, { mode: 'audio' }); e.target.value = ''; });
var coverInput = document.getElementById('cover-input');
if (coverInput) coverInput.addEventListener('change', function (e) { handleCoverFiles(e.target.files); e.target.value = ''; });
var folderInput = document.getElementById('folder-input');
if (folderInput) folderInput.addEventListener('change', function (e) { handleFiles(e.target.files, { mode: 'folder' }); e.target.value = ''; });
var lyricFontInput = document.getElementById('lyric-font-input');
if (lyricFontInput) lyricFontInput.addEventListener('change', function (e) { handleLyricFontFiles(e.target.files); e.target.value = ''; });
document.addEventListener('click', function (e) {
  var panel = document.getElementById('upload-panel');
  if (!panel || !panel.classList.contains('show')) return;
  if (e.target && e.target.closest && e.target.closest('#upload-actions')) return;
  closeUploadPanel();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeUploadPanel();
});
var dropOv = document.getElementById('drop-overlay'), dragCount = 0;
document.addEventListener('dragenter', function (e) { e.preventDefault(); dragCount++; dropOv.classList.add('show'); });
document.addEventListener('dragleave', function (e) { e.preventDefault(); dragCount--; if (dragCount <= 0) { dragCount = 0; dropOv.classList.remove('show'); } });
document.addEventListener('dragover', function (e) { e.preventDefault(); });
document.addEventListener('drop', function (e) {
  e.preventDefault(); dragCount = 0; dropOv.classList.remove('show');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

// ============================================================
//  控制台 — 预设卡片 + 主滑块 + 开关 + 三态

if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', releaseLocalAudioObjectUrlsOnPageHide);
