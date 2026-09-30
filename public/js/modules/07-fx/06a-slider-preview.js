// Keep input events cheap: apply the latest values at most once per frame.
var fxSliderPreviewKeys = new Set();
var fxSliderPreviewFrame = 0;
var fxSliderCoverTimer = 0;
var fxSliderDesktopDirty = false;
var fxSliderWallpaperDirty = false;
var fxSliderBackgroundDirty = false;
var fxSliderCommitPending = false;
var fxSliderEdit = { active: false, lyric: false, pointer: null, keyboard: false, timer: 0, rebuild: false, trackToken: null };
function isLyricFxEditPreviewActive() { return fxSliderEdit.active && fxSliderEdit.lyric; }
function beginFxSliderEdit(key, pointer, keyboard) {
  fxSliderEdit.active = true;
  if (pointer != null) fxSliderEdit.pointer = pointer;
  if (keyboard) fxSliderEdit.keyboard = true;
  if (/^lyric/.test(key) && !fxSliderEdit.lyric) {
    fxSliderEdit.lyric = true;
    fxSliderEdit.trackToken = trackSwitchToken;
    suspendLyricFxEditWork();
  }
  if (fxSliderEdit.timer) clearTimeout(fxSliderEdit.timer);
  fxSliderEdit.timer = 0;
  if (fxSliderEdit.pointer == null && !fxSliderEdit.keyboard) {
    fxSliderEdit.timer = setTimeout(endFxSliderEdit, 360);
  }
}
function endFxSliderEdit() {
  if (!fxSliderEdit.active) return;
  if (fxSliderEdit.timer) clearTimeout(fxSliderEdit.timer);
  fxSliderEdit.timer = 0;
  // Flush while the cheap render path still owns the gesture.
  flushFxSliderPreview();
  var lyric = fxSliderEdit.lyric;
  var rebuild = fxSliderEdit.rebuild;
  var sameTrack = fxSliderEdit.trackToken === trackSwitchToken;
  fxSliderEdit.active = fxSliderEdit.lyric = fxSliderEdit.keyboard = false;
  fxSliderEdit.pointer = null;
  fxSliderEdit.rebuild = false;
  if (lyric && sameTrack) finishLyricFxEditWork(rebuild);
  commitFxSliderPreview();
}
function bindFxSliderEdit(el, key) {
  el.addEventListener('pointerdown', function (event) { beginFxSliderEdit(key, event.pointerId, false); });
  el.addEventListener('keydown', function (event) {
    if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key)) beginFxSliderEdit(key, null, true);
  });
  el.addEventListener('keyup', function (event) {
    if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key)) endFxSliderEdit();
  });
  el.addEventListener('blur', endFxSliderEdit);
}
window.addEventListener('pointerup', function (event) { if (fxSliderEdit.pointer === event.pointerId) endFxSliderEdit(); });
window.addEventListener('pointercancel', function (event) { if (fxSliderEdit.pointer === event.pointerId) endFxSliderEdit(); });
window.addEventListener('blur', endFxSliderEdit);
document.addEventListener('visibilitychange', function () { if (document.hidden) endFxSliderEdit(); });
function queueFxSliderPreview(key) {
  beginFxSliderEdit(key, null, false);
  fxSliderCommitPending = true;
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
    fxSliderCoverTimer = setTimeout(function applyCoverWhenReleased() {
      if (fxSliderEdit.active) { fxSliderCoverTimer = setTimeout(applyCoverWhenReleased, 180); return; }
      fxSliderCoverTimer = 0;
      applyCoverParticleResolution(fx.coverResolution, { reload: true });
    }, 180);
  }
}
function commitFxSliderPreview() {
  if (fxSliderEdit.active) {
    if (fxSliderEdit.pointer != null || fxSliderEdit.keyboard) return;
    endFxSliderEdit();
    return;
  }
  if (!fxSliderCommitPending) return;
  fxSliderCommitPending = false;
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
