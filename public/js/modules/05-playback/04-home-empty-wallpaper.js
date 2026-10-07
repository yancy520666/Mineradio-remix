var emptyHomeStartEl = document.getElementById('empty-home');
if (emptyHomeStartEl) {
  emptyHomeStartEl.addEventListener('click', function (e) {
    var start = e.target && e.target.closest ? e.target.closest('[data-home-radio-start]') : null;
    if (!start || !emptyHomeStartEl.contains(start)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof openHomeDashboardRadio === 'function') openHomeDashboardRadio();
  }, true);
}
function shouldShowEmptyHomeCore(ignoreSplash) {
  if (!ignoreSplash && document.body.classList.contains('splash-active')) return false;
  if (immersiveMode) return false;
  if (homeForcedOpen) return true;
  if (homeSuppressed) return false;
  if (shelfPinnedOpen) return false;
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return false;
  if (shouldShowHomeForPausedStartupRestore()) return true;
  if (hasRestoredPlaybackCandidate()) return false;
  if (playQueue && playQueue.length) return false;
  if (currentIdx >= 0 && playQueue[currentIdx]) return false;
  if (playing) return false;
  return true;
}
function shouldShowEmptyHome() {
  return shouldShowEmptyHomeCore(false);
}
function shouldShowEmptyHomeAfterSplash() {
  return shouldShowEmptyHomeCore(true);
}
function shouldForceEmptyHomeAfterSplash() {
  if (immersiveMode) return false;
  if (shelfPinnedOpen) return false;
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return false;
  if (shouldShowHomeForPausedStartupRestore()) return true;
  if (hasRestoredPlaybackCandidate()) return false;
  if (playQueue && playQueue.length) return false;
  if (currentIdx >= 0 && playQueue[currentIdx]) return false;
  if (playing) return false;
  return true;
}
function shouldUseIdleWallpaperPreview(ignoreSplash) {
  if (!ignoreSplash && document.body.classList.contains('splash-active')) return false;
  if (immersiveMode || playing || (audio && !audio.paused)) return false;
  if (hasRestoredPlaybackCandidate() && !shouldShowHomeForPausedStartupRestore()) return false;
  if (shelfPinnedOpen) return false;
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return false;
  return true;
}
function setHomeControlsLocked(locked) {
  document.body.classList.toggle('home-controls-locked', !!locked);
  var bottom = document.getElementById('bottom-bar');
  if (bottom && locked && !hasActivePlaybackControls()) bottom.classList.add('soft-hidden');
  if (bottom && !locked) bottom.classList.remove('soft-hidden');
  if (locked) closeMiniQueue();
}
function openHomePlayerConsole() {
  setHomeControlsLocked(false);
  var bar = document.getElementById('bottom-bar');
  if (bar) {
    bar.classList.add('visible');
    bar.classList.remove('soft-hidden');
    bar.style.pointerEvents = '';
  }
  wakeBottomHandle(2800);
  setControlsHidden(false);
  forcePlaybackControlsInteractive();
  updateControlsChromeState();
  if (controlsAutoHide) scheduleControlsHide(1800);
  showToast('播放器控制台已展开');
}
function ensureHomeWallpaperParticles(opts) {
  opts = opts || {};
  if (uniforms && uniforms.uAlpha && opts.instant) {
    uniforms.uAlpha.value = 0.96;
  } else if (uniforms && uniforms.uAlpha && uniforms.uAlpha.value < 0.88) {
    tweenParticleAlpha(uniforms.uAlpha.value || 0, 0.96, 920);
  }
  if (uniforms && uniforms.uFloatAlpha) uniforms.uFloatAlpha.value = 0;
  if (floatGroup) destroyFloatLayer();
}
function activateHomeWallpaperPreview(opts) {
  opts = opts || {};
  document.body.classList.add('home-wallpaper-preview');
  ensureHomeWallpaperParticles(opts);
}
var homeWallpaperPrewarmStarted = false;
function prewarmHomeWallpaperPreview() {
  if (homeWallpaperPrewarmStarted) return;
  homeWallpaperPrewarmStarted = true;
  if (!shouldUseIdleWallpaperPreview(true)) return;
  scheduleVisualApply(function () {
    if (!shouldUseIdleWallpaperPreview(true)) return;
    activateHomeWallpaperPreview({ skipTransition: true, instant: true });
  }, 900, 2600);
}
function deactivateHomeWallpaperPreview(playback) {
  document.body.classList.remove('home-wallpaper-preview');
  if (!homeVisualPresetActive) return;
  homeVisualPresetActive = false;
  var nextPreset = typeof homeVisualPrevPreset === 'number' ? homeVisualPrevPreset : (fx && typeof fx.preset === 'number' ? fx.preset : 0);
  if (typeof setPreset === 'function' && fx.preset !== nextPreset) {
    setPreset(nextPreset, { silent: true, preserveCamera: false, skipTransition: false, noSave: true });
  }
}
function switchPlaybackVisualToEmily(opts) {
  opts = opts || {};
  var visualChanged = false;
  if (homeVisualPresetActive) {
    deactivateHomeWallpaperPreview(true);
    visualChanged = true;
  }
  document.body.classList.remove('home-wallpaper-preview');
  var targetPreset = typeof playbackVisualPreset === 'number' ? playbackVisualPreset : fxDefaults.preset;
  startupVisualPreviewActive = false;
  if (typeof setPreset === 'function' && fx.preset !== targetPreset) {
    setPreset(targetPreset, { silent: true, preserveCamera: false, noSave: true });
    visualChanged = true;
  } else if (typeof syncFxUniforms === 'function') {
    syncFxUniforms();
  }
  if (typeof updateRenderPowerClasses === 'function') updateRenderPowerClasses();
  // In the foreground with an unchanged scene (resume or track switch) the
  // background recovery is not needed: it would rebuild the old lyric line and
  // add a 1.1 s interaction frame-rate boost right when the new song starts.
  var sceneKept = !visualChanged
    && typeof playbackWindowInForeground === 'function' && playbackWindowInForeground();
  if (!sceneKept && typeof recoverVisualsAfterBackground === 'function' && !isDeepBackgroundMode()) recoverVisualsAfterBackground('playback-visual');
}
function updateEmptyHomeVisibility(opts) {
  opts = opts || {};
  var show = shouldShowEmptyHome();
  emptyHomeActive = show;
  document.body.classList.toggle('empty-home-active', show);
  if (!show) setHomeControlsLocked(false);
  if (show) activateHomeWallpaperPreview();
  else deactivateHomeWallpaperPreview(false);
  if (show) {
    setPeek(document.getElementById('search-area'), true, 'search');
    renderHomeDiscover();
    if (!hasAnyPlatformLogin()) {
      homeDiscoverState.loading = false;
      homeDiscoverState.loaded = true;
      homeDiscoverState.loggedIn = false;
      homeDiscoverState.mode = 'starter';
      homeDiscoverState.songs = [];
      homeDiscoverState.playlists = [];
      homeDiscoverState.podcasts = [];
      renderHomeDiscover();
    } else {
      renderHomeDiscover();
      scheduleVisualApply(function () { loadHomeDiscover(!!opts.forceLoad); }, 220, 1200);
    }
  }
  return show;
}
function runHomeSearch(query, mode) {
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  updateEmptyHomeVisibility();
  if (mode) setSearchMode(mode);
  else if (searchMode === 'podcast') setSearchMode('song');
  var q = String(query || '').trim();
  var area = document.getElementById('search-area');
  if (area) setPeek(area, true, 'search');
  if ($input) {
    $input.value = q;
    $input.focus();
  }
  if (q) doSearch(q);
  else if (searchMode === 'podcast') loadPodcastHot();
  else renderSearchHistory();
}
function skipLoginAndFocusSearch() {
  closeLoginModal();
  setTimeout(function () { runHomeSearch(''); }, 180);
}
function openHomeLocalImport() {
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  updateEmptyHomeVisibility();
  if (typeof loadPersistedLocalLibraryIntoQueue === 'function' && loadPersistedLocalLibraryIntoQueue()) return;
  openUploadPanel();
}
function openHomeProductGuide() {
  closeLoginModal();
  setTimeout(function () { startVisualGuide({ manual: true, source: 'home' }); }, 160);
}
async function waitForHomeDiscoverIdle(timeout) {
  var started = Date.now();
  while (homeDiscoverState.loading && Date.now() - started < (timeout || 2200)) {
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
  }
}
// Plays one platform's real daily list: 'played', 'empty', or 'stale' when the
// login or platform priority changed while it was loading.
async function playHomeDailyFromSource(source, isCurrent) {
  if (source !== 'netease') {
    if (homePlatformRecommendationFeedConfig(source)) await loadHomePlatformFeedRecommendations(source, false);
    if (!isCurrent()) return 'stale';
    var feed = homePlatformRecommendationState.feeds[source];
    if (!feed || !feed.songs.length) return 'empty';
    playHomePlatformFeedSong(source, 0);
    return 'played';
  }
  await waitForHomeDiscoverIdle();
  if (!homeDiscoverState.loaded || (!homeDiscoverState.songs.length && !homeDiscoverState.loading)) {
    await loadHomeDiscover(true);
  }
  if (!isCurrent()) return 'stale';
  if (!homeDiscoverState.songs.length) return 'empty';
  playQueue = homeDiscoverState.songs.map(cloneSong);
  currentIdx = 0;
  safeRenderQueuePanel('home-daily');
  safeShelfRebuild('home-daily', true);
  forcePlaybackControlsInteractive();
  playQueueAt(0).catch(function (e) { console.warn('[HomeDailyPlay]', e); });
  return 'played';
}
async function playHomeDaily() {
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  if (!hasAnyPlatformLogin() && !homeDiscoverState.loggedIn) {
    showLoginModal({ source: 'home-daily' });
    return;
  }
  var preferred = function () {
    return typeof preferredHomeRecommendationSource === 'function' ? preferredHomeRecommendationSource() : 'netease';
  };
  var preferredSource = preferred();
  var isCurrent = function () { return hasAnyPlatformLogin() && preferred() === preferredSource; };
  if (await playHomeDailyFromSource(preferredSource, isCurrent) !== 'empty') return;
  // The preferred platform has nothing playable today. Never substitute a
  // search; offer the user's other connected platforms instead.
  var alternatives = typeof homeDailyFallbackSources === 'function' ? homeDailyFallbackSources(preferredSource) : [];
  var choice = !alternatives.length ? 'view'
    : (homeDailyAutoFallbackEnabled() ? alternatives[0] : await askHomeDailyFallback(preferredSource, alternatives));
  if (!choice || !isCurrent()) return;
  if (choice === 'view') {
    openHomePlatformRecommendations(preferredSource);
    return;
  }
  var fallbackIsCurrent = function () { return isCurrent() && homeRecommendationProviderConnected(choice); };
  if (!fallbackIsCurrent()) return;
  if (await playHomeDailyFromSource(choice, fallbackIsCurrent) === 'empty') openHomePlatformRecommendations(choice);
}
async function playHomePrivateRadio() {
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  if (!hasAnyPlatformLogin() && !homeDiscoverState.loggedIn) {
    showLoginModal({ source: 'home-private' });
    return;
  }
  await waitForHomeDiscoverIdle();
  if (!homeDiscoverState.loaded || ((!homeDiscoverState.playlists.length && !homeDiscoverState.songs.length) && !homeDiscoverState.loading)) {
    await loadHomeDiscover(true);
  }
  if (homeDiscoverState.songs.length) {
    playQueue = homeDiscoverState.songs.map(cloneSong);
    currentIdx = 0;
    safeRenderQueuePanel('home-private-radio');
    safeShelfRebuild('home-private-radio', true);
    forcePlaybackControlsInteractive();
    playQueueAt(0).catch(function (e) { console.warn('[HomePrivatePlay]', e); });
    return;
  }
  var item = homeDiscoverState.playlists[0];
  if (item && item.id) {
    await loadPlaylistIntoQueueById(item.id, true, item.name || '私人雷达');
    return;
  }
  openHomeLibrary();
}
function playHomeSong(index) {
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  var song = homeDiscoverState.songs[index];
  if (!song) {
    if (index > 0) playHomePrivateRadio();
    else playHomeDaily();
    return;
  }
  playQueue = homeDiscoverState.songs.map(cloneSong);
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, index));
  safeRenderQueuePanel('home-song-card');
  safeShelfRebuild('home-song-card', true);
  forcePlaybackControlsInteractive();
  playQueueAt(currentIdx).catch(function (e) { console.warn('[HomeSongPlay]', e); });
}
function openHomePlaylist(index) {
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  if (!hasAnyPlatformLogin() && !homeDiscoverState.loggedIn) {
    runHomeSearch('');
    return;
  }
  openPlaylistPanelTab('playlists', true);
  var item = homeDiscoverState.playlists[index];
  if (!item || !item.id) {
    openHomeLibrary();
    return;
  }
  loadPlaylistIntoQueueById(item.id, true, item.name || '');
}
function openHomePodcast(index) {
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  openPlaylistPanelTab('podcasts', true);
  var item = homeDiscoverState.podcasts[index];
  if (!item || !item.id) {
    setSearchMode('podcast');
    loadPodcastHot();
    return;
  }
  loadPodcastRadioIntoQueue(item.id, true, item.name || '');
}
function openHomeThirdCard() {
  if (!hasAnyPlatformLogin() && !homeDiscoverState.loggedIn) {
    openHomeLocalImport();
    return;
  }
  openHomePodcast(0);
}
function openHomeLibrary() {
  if (!hasAnyPlatformLogin() && !homeDiscoverState.loggedIn) {
    openHomeProductGuide();
    return;
  }
  homeSuppressed = false;
  setHomeControlsLocked(false);
  openPlaylistPanelTab('playlists', true);
  refreshUserPlaylists(true);
}
function goHome() {
  if (homeForcedOpen || emptyHomeActive) {
    dismissHomePage({ toast: true });
    showToast('已关闭 Home');
    return;
  }
  homeSuppressed = false;
  homeForcedOpen = true;
  setHomeControlsLocked(true);
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) safeShelfCloseContent('open-empty-home');
  if (typeof setShelfPinnedOpen === 'function') setShelfPinnedOpen(false, true);
  togglePlaylistPanel(false);
  setPeek(document.getElementById('playlist-panel'), false, 'pl');
  setPeek(document.getElementById('fx-panel'), false, 'fx');
  setPeek(document.getElementById('search-area'), true, 'search');
  if (typeof setFocusZone === 'function') setFocusZone(null, true);
  if (orbit && orbit.focus) orbit.focus.active = false;
  updateEmptyHomeVisibility({ forceLoad: true });
  showToast('已回到 Home');
}
function dismissHomePage(opts) {
  opts = opts || {};
  homeForcedOpen = false;
  homeSuppressed = true;
  setHomeControlsLocked(false);
  updateEmptyHomeVisibility({ forceLoad: false });
  setPeek(document.getElementById('search-area'), false, 'search');
  if (typeof setFocusZone === 'function') setFocusZone(null, true);
}
function isPointInsideRectWithPad(x, y, rect, pad) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  pad = Number(pad) || 0;
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
}
function isPointNearHomeContent(x, y) {
  var selectors = [
    '.home-card',
    '.home-tile',
    '.home-chip'
  ];
  for (var i = 0; i < selectors.length; i++) {
    var nodes = document.querySelectorAll(selectors[i]);
    for (var j = 0; j < nodes.length; j++) {
      if (isPointInsideRectWithPad(x, y, nodes[j].getBoundingClientRect(), 12)) return true;
    }
  }
  return false;
}
function isHomeBlankDismissClick(e) {
  if (!emptyHomeActive || !e || e.defaultPrevented) return false;
  if (e.button != null && e.button !== 0) return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  var target = e.target;
  if (!target || !target.closest) return false;
  var blockedSelector = [
    'button',
    'a',
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '#desktop-titlebar',
    '#search-area',
    '#top-right',
    '#bottom-bar',
    '#bottom-handle',
    '#fx-fab',
    '#fx-fab-hide-btn',
    '#fx-panel',
    '#playlist-panel',
    '#mini-queue-popover',
    '#visual-guide',
    '#upload-tip',
    '#toast',
    '#trial-banner',
    '#source-fallback-notice',
    '.modal-mask',
    '.modal',
    '.track-detail-modal',
    '.cover-color-pop',
    '.color-lab-pop'
  ].join(',');
  if (target.closest(blockedSelector)) return false;
  var x = e.clientX;
  var y = e.clientY;
  var home = document.getElementById('empty-home');
  if (!home) return false;
  var homeRect = home.getBoundingClientRect();
  if (!isPointInsideRectWithPad(x, y, homeRect, 0)) return false;
  if (isPointNearHomeContent(x, y)) return false;
  return true;
}
document.addEventListener('click', function (e) {
  if (!isHomeBlankDismissClick(e)) return;
  e.preventDefault();
  e.stopPropagation();
  dismissHomePage({ reason: 'blank-click' });
}, true);
