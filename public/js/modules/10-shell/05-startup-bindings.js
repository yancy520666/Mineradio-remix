applyDiyMode(diyPlayerMode, { save: false });
bindFxPanel();
applySavedLyricPaletteState();
bindQualityControl();
bindAudioOutputControls();
bindVolumeControls();
initControlGlassSurface();
bindPlayerControlAnimations();
initAeroWaterEffects();
scheduleUiWarmTask(function () {
  updateControlGlassDisplacementMap();
  updateSearchBoxGlassDisplacementMap();
  updateSearchPillGlassDisplacementMap();
  try {
    if (renderer && renderer.compile && scene && camera) renderer.compile(scene, camera);
  } catch (e) { }
}, 900);
applyUserCapsuleAutoHideState();
applyFxFabAutoHideState();
initializeDesktopCloseBehavior();
applyStartupAutoplayUi();
applyControlsAutoHidePreference();
applyDesktopLyricsState(false);
applyWallpaperModeState(false);
setShelfMode(fx.shelf);
if (fx.shelf === 'side') setShelfPinnedOpen(!!fx.shelfPinnedOpen, true, false);
var restoredPlaybackAtStartup = restoreLastPlaybackSnapshot();
var persistedLocalLibraryRestorePromise = Promise.resolve(restorePersistedLocalLibrary()).then(function (restored) {
  if (restored) restoredPlaybackAtStartup = true;
  else if (!restoredLastPlaybackSnapshot) restoredPlaybackAtStartup = false;
  return restored;
}, function () { return false; });
var builtInPlaylistRestorePromise = typeof refreshBuiltInPlaylists === 'function'
  ? Promise.resolve(refreshBuiltInPlaylists(false))
  : Promise.resolve(false);
switchPlaylistTab(queueViewTab, { save: false, animate: false, refresh: false });
applyPlaylistPanelPinState(false);
if (fx.floatLayer) createFloatLayer();
if (fx.particleLyrics) createLyricsParticles();
if (fx.backCover) createBackCoverLayer();
initIdleGuideCanvas();
var startupLoginStatusPromise = Promise.all([refreshLoginStatus(), refreshQQLoginStatus({ forceVip: true, reason: 'startup' }), refreshKugouLoginStatus(), refreshQishuiLoginStatus(), persistedLocalLibraryRestorePromise, builtInPlaylistRestorePromise]);
startQQLoginStatusAutoRefresh();
startKugouLoginStatusAutoRefresh();
startQishuiLoginStatusAutoRefresh();
if (typeof startLoginPresenceWatch === 'function') startLoginPresenceWatch();
if (typeof setupFullscreenDiyLayoutTracking === 'function') setupFullscreenDiyLayoutTracking();
if (startupLoginStatusPromise && startupLoginStatusPromise.then) {
  startupLoginStatusPromise.then(function () {
    if (hasAnyPlatformLogin()) {
      refreshUserPlaylists(true);
      loadHomeDiscover(true);
    }
    if (restoredPlaybackAtStartup) queueStartupAutoplayAfterHomeReveal('login-status');
    // Resolve after login so the warmed URL carries the account's quality.
    scheduleStartupPlaybackWarmup();
    if (document.body.classList.contains('splash-active')) return;
    var homeShown = updateEmptyHomeVisibility({ forceLoad: hasAnyPlatformLogin() });
    if (!hasAnyPlatformLogin()) maybeRunStartupLoginGuide('status');
    else if (!homeShown) maybeRunStartupLoginGuide('status');
  }, function () {
    if (restoredPlaybackAtStartup) queueStartupAutoplayAfterHomeReveal('login-status');
  });
} else if (restoredPlaybackAtStartup) {
  queueStartupAutoplayAfterHomeReveal('startup');
}
var collectNameInput = document.getElementById('collect-new-name');
if (collectNameInput) {
  collectNameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      createPlaylistFromCollect();
    }
  });
}
var customLyricInput = document.getElementById('custom-lyric-input');
if (customLyricInput) {
  customLyricInput.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveCustomLyricForCurrent();
    }
  });
}
safeRenderQueuePanel('startup');
if (!restoredPlaybackAtStartup) {
  restoredPlaybackAtStartup = restoreLastPlaybackSnapshot();
  if (restoredPlaybackAtStartup) queueStartupAutoplayAfterHomeReveal('startup-restore');
}
safeRenderQueuePanel('startup-restore');
updateCustomCoverButton();
updateCustomLyricControls();
updateLikeButtons();
initUpdatePreview();
initOriginalProfileImport();
window.addEventListener('beforeunload', function () {
  saveLastPlaybackSnapshot(true, 'beforeunload');
});

// Startup playback warm-up. Once the splash and Home have settled, prepare the
// restored track so the first press of Play does not hitch: compile the lyric
// shaders (two ~40 ms first-use compiles), cache its lyrics, and resolve its
// playback URL. Each step runs in its own idle slot, never during the splash
// or Home's entrance, and stops as soon as playback starts on its own.
var startupPlaybackWarmup = { started: false, songKey: '', data: null, at: 0 };
var STARTUP_WARM_URL_MAX_AGE_MS = 4 * 60 * 1000;
function startupWarmupIdle(timeout) {
  return new Promise(function (resolve) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(function () { resolve(); }, { timeout: timeout || 1200 });
    else setTimeout(resolve, 60);
  });
}
function startupWarmupFrame() {
  return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
}
function startupWarmupStillUseful(songKey) {
  if (audio && audio.src) return false;
  var song = Array.isArray(playQueue) && currentIdx >= 0 ? playQueue[currentIdx] : null;
  return !!(song && queueItemKey(song) === songKey);
}
async function warmStartupLyricShaders() {
  if (typeof beginCooperativeLyricMeshBuild !== 'function' || typeof renderer === 'undefined' || !renderer || !renderer.compile) return;
  var build = beginCooperativeLyricMeshBuild('Mineradio');
  while (!stepCooperativeLyricMeshBuild(build, 1, 6)) await startupWarmupIdle(600);
  var mesh = finishCooperativeLyricMeshBuild(build);
  if (!mesh) return;
  var objects = [];
  mesh.traverse(function (object) { if (object.material) objects.push(object); });
  var seen = {};
  for (var i = 0; i < objects.length; i++) {
    var material = objects[i].material;
    var key = (material.type || '') + '|' + String(material.fragmentShader || '').length + '|' + String(material.vertexShader || '').length;
    if (seen[key]) continue;
    seen[key] = true;
    await startupWarmupFrame();
    try { renderer.compile(objects[i], camera); } catch (e) { break; }
  }
  disposeLyricMesh(mesh);
}
async function warmStartupLyrics(song) {
  if (typeof lyricQueuePrefetchCandidate !== 'function' || !lyricQueuePrefetchCandidate(song)) return;
  var cacheRead = {};
  var cached = await readPersistentLyricCache(song, cacheRead);
  if (cached) return;
  var response = await apiJson(lyricEndpointForSong(song), { timeoutMs: 6500 });
  var merged = mergeInlineLyricResponseForSong(song, response || {});
  var state = parseLyricResponseToOriginalState(song, merged);
  if (state && state.usableLyric) writePersistentLyricCache(song, merged, cacheRead);
}
async function runStartupPlaybackWarmup() {
  var song = Array.isArray(playQueue) && currentIdx >= 0 ? playQueue[currentIdx] : null;
  if (!song || (audio && audio.src)) return;
  var songKey = queueItemKey(song);
  var steps = [
    function () { return warmStartupLyricShaders(); },
    function () { return warmStartupLyrics(song); },
    async function () {
      if (typeof resolveAlbumGaplessPlaybackData !== 'function') return;
      var data = await resolveAlbumGaplessPlaybackData(song, { isCurrent: function () { return startupWarmupStillUseful(songKey); } });
      if (data && data.url && startupWarmupStillUseful(songKey)) {
        startupPlaybackWarmup.songKey = songKey;
        startupPlaybackWarmup.data = data;
        startupPlaybackWarmup.at = Date.now();
      }
    }
  ];
  for (var i = 0; i < steps.length; i++) {
    if (!startupWarmupStillUseful(songKey)) return;
    await startupWarmupIdle(1500);
    try { await steps[i](); } catch (e) { console.warn('[StartupWarmup]', e && e.message || e); }
  }
}
// The pre-resolved URL is used once, for the restored track, while it is fresh.
function takeStartupWarmPlaybackData(song) {
  var warm = startupPlaybackWarmup;
  var data = warm.data;
  warm.data = null;
  if (!data || !song || queueItemKey(song) !== warm.songKey || Date.now() - warm.at > STARTUP_WARM_URL_MAX_AGE_MS) return null;
  return data;
}
function scheduleStartupPlaybackWarmup() {
  if (startupPlaybackWarmup.started || !restoredPlaybackAtStartup) return;
  startupPlaybackWarmup.started = true;
  var settledSince = 0;
  (function waitForCalmHome() {
    var busy = document.body.classList.contains('splash-active')
      || document.documentElement.classList.contains('startup-fast-skip-preload')
      || (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive());
    if (busy) settledSince = 0;
    else if (!settledSince) settledSince = performance.now();
    if (!settledSince || performance.now() - settledSince < 1800) { setTimeout(waitForCalmHome, 300); return; }
    runStartupPlaybackWarmup();
  })();
}

// ============================================================
//  主循环
