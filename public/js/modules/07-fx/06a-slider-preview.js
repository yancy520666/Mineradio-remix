// Keep input events cheap: apply the latest values at most once per frame.
var fxSliderPreviewKeys = new Set();
var fxSliderPreviewFrame = 0;
var fxSliderCoverTimer = 0;
var fxSliderDesktopDirty = false;
var fxSliderWallpaperDirty = false;
var fxSliderBackgroundDirty = false;
function queueFxSliderPreview(key) {
  fxSliderPreviewKeys.add(key);
  if (!fxSliderPreviewFrame) fxSliderPreviewFrame = requestAnimationFrame(flushFxSliderPreview);
}
function flushFxSliderPreview() {
  if (fxSliderPreviewFrame) cancelAnimationFrame(fxSliderPreviewFrame);
  fxSliderPreviewFrame = 0;
  var keys = Array.from(fxSliderPreviewKeys);
  fxSliderPreviewKeys.clear();
  if (!keys.length) return;
  syncFxUniforms();
  if (keys.some(function (key) { return /^background|^windowBackground/.test(key); })) {
    fxSliderBackgroundDirty = true;
    applyCustomBackground();
  }
  if (keys.indexOf('controlGlassChromaticOffset') >= 0) applyControlGlassChromaticOffset();
  if (keys.some(function (key) { return /^playlistPanel/.test(key); })) applyPlaylistPanelFxSettings();
  if (keys.some(function (key) { return /^shelf/.test(key); }) && shelfManager && shelfManager.refreshTheme) shelfManager.refreshTheme();
  if (keys.some(function (key) { return /^sonicAudio/.test(key); }) && typeof refreshSonicAudioMonitorUi === 'function') refreshSonicAudioMonitorUi();
  if (keys.some(function (key) { return /^sonicWorkshop/.test(key); }) && window.MineradioSonicWorkshop && typeof MineradioSonicWorkshop.pushProperties === 'function') MineradioSonicWorkshop.pushProperties(true);
  keys.forEach(function (key) { syncLyricRealtimeFxChange(key, { deferred: true, skipDesktop: true }); });
  if (keys.some(function (key) { return isDesktopLyricRealtimeFxKey(key) || /^desktopLyrics/.test(key); })) {
    fxSliderDesktopDirty = true;
    pushDesktopLyricsState(false);
  }
  if (keys.indexOf('wallpaperOpacity') >= 0) { fxSliderWallpaperDirty = true; pushWallpaperState(false); }
  if (keys.indexOf('coverResolution') >= 0) {
    if (fxSliderCoverTimer) clearTimeout(fxSliderCoverTimer);
    fxSliderCoverTimer = setTimeout(function () {
      fxSliderCoverTimer = 0;
      applyCoverParticleResolution(fx.coverResolution, { reload: true });
    }, 180);
  }
}
function commitFxSliderPreview() {
  flushFxSliderPreview();
  if (fxSliderCoverTimer) {
    clearTimeout(fxSliderCoverTimer);
    fxSliderCoverTimer = 0;
    applyCoverParticleResolution(fx.coverResolution, { reload: true });
  }
  if (lyricRealtimeRefreshTimer) flushStageLyricRealtimeRefresh();
  if (fxSliderBackgroundDirty) updateCustomBackgroundControls();
  if (fxSliderDesktopDirty) pushDesktopLyricsState(true);
  if (fxSliderWallpaperDirty) pushWallpaperState(true);
  fxSliderBackgroundDirty = fxSliderDesktopDirty = fxSliderWallpaperDirty = false;
  flushLyricLayoutSave('slider-commit');
}
