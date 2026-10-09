function hasRestoredPlaybackCandidate() {
  if (!restoredLastPlaybackSnapshot) return false;
  if (currentLocalSong) return true;
  if (Array.isArray(playQueue) && currentIdx >= 0 && playQueue[currentIdx]) return true;
  return !!(restoredLastPlaybackSnapshot && pendingPlaybackResumeAt > 0 && restoredLastPlaybackSnapshot.current);
}

function hasPlaybackControlCandidate() {
  if (currentLocalSong) return true;
  if (Array.isArray(playQueue) && currentIdx >= 0 && playQueue[currentIdx]) return true;
  return hasRestoredPlaybackCandidate();
}

function hasActivePlaybackControls() {
  return !!(playing || (audio && !audio.paused) || hasPlaybackControlCandidate());
}

function desktopWallpaperKeepsPlayerConsoleVisible() {
  var body = document.body;
  if (!body
    || !body.classList.contains('desktop-wallpaper-mode')
    || !body.classList.contains('desktop-wallpaper-interactive')) return false;
  // Home and the 3D shelf are complete Mineradio surfaces of their own. In the
  // ordinary desktop stage, however, allowing the generic inactivity timer to
  // hide the only player console makes the renderer look as if it fell behind
  // the wallpaper/Explorer plane.
  if (body.classList.contains('empty-home-active')
    || body.classList.contains('home-controls-locked')) return false;
  try {
    return !isBottomControlsSuppressedForShelf();
  } catch (_) {
    return true;
  }
}

function shouldShowHomeForPausedStartupRestore() {
  return !!(startupRestoreHomePending
    && restoredLastPlaybackSnapshot
    && !playing
    && !(audio && !audio.paused)
    && !immersiveMode);
}

function bottomControlsMenuActive() {
  if (document.hidden) return false;
  var source = document.getElementById('control-source-switcher');
  var quality = document.getElementById('quality-control');
  return !!((source && source.classList.contains('show'))
    || (quality && quality.classList.contains('open')));
}

function setControlsHidden(hidden) {
  var bar = document.getElementById('bottom-bar');
  if (!bar) return;
  if (hidden && typeof visualGuideKeepsBottomControlsVisible === 'function' && visualGuideKeepsBottomControlsVisible()) hidden = false;
  if (hidden && desktopWallpaperKeepsPlayerConsoleVisible()) hidden = false;
  if (hidden && controlsRevealHoldUntil > performance.now()) hidden = false;
  if (hidden && (controlsHovering || miniQueueOpen || bottomControlsMenuActive())) hidden = false;
  bar.classList.toggle('soft-hidden', !!hidden && controlsAutoHide && bar.classList.contains('visible'));
  if (hidden && typeof closeLyricTimingPopover === 'function') closeLyricTimingPopover(true);
  bar.style.pointerEvents = '';
  updateControlsChromeState();
}

function isBottomControlsSuppressedForShelf() {
  var shelfContentOpen = false;
  try {
    shelfContentOpen = !!(typeof shelfManager !== 'undefined' && shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent());
  } catch (e) { }
  return !!(shelfPinnedOpen || shelfContentOpen || (controlsShelfSuppressUntil && performance.now() < controlsShelfSuppressUntil));
}

function suppressBottomControlsForShelf(duration) {
  controlsShelfSuppressUntil = performance.now() + (duration == null ? 900 : duration);
  controlsHovering = false;
  if (controlsHideTimer) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  }
  document.body.classList.remove('controls-handle-awake');
  if (miniQueueOpen) closeMiniQueue();
  var bar = document.getElementById('bottom-bar');
  if (bar) {
    bar.classList.remove('visible', 'soft-hidden');
    bar.style.pointerEvents = '';
  }
  updateControlsChromeState();
}

function restoreBottomControlsAfterShelfExit(reason) {
  controlsShelfSuppressUntil = 0;
  if (controlsHideTimer) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  }
  if (isBottomControlsSuppressedForShelf()) return;
  if (!hasActivePlaybackControls() && controlsAutoHide) return;
  try {
    setHomeControlsLocked(false);
    var bar = document.getElementById('bottom-bar');
    if (bar) {
      bar.classList.add('visible');
      bar.classList.remove('soft-hidden');
      bar.style.pointerEvents = '';
    }
    wakeBottomHandle(controlsAutoHide ? 1400 : 2600);
    setControlsHidden(false);
    updateControlsChromeState();
    if (controlsAutoHide) scheduleControlsHide(900);
  } catch (e) {
    console.warn('[ShelfControlsRestore]', reason || 'shelf-exit', e);
  }
}

function scheduleControlsHide(delay) {
  if (controlsHideTimer) clearTimeout(controlsHideTimer);
  controlsHideTimer = null;
  if (!controlsAutoHide) return;
  if (typeof visualGuideKeepsBottomControlsVisible === 'function' && visualGuideKeepsBottomControlsVisible()) {
    setControlsHidden(false);
    return;
  }
  if (desktopWallpaperKeepsPlayerConsoleVisible()) {
    controlsHideTimer = null;
    setControlsHidden(false);
    return;
  }
  var requestedDelay = delay == null ? 480 : Math.max(0, Number(delay) || 0);
  var revealHoldRemaining = controlsRevealHoldUntil - performance.now();
  if (revealHoldRemaining > 0) requestedDelay = Math.max(requestedDelay, Math.ceil(revealHoldRemaining) + 32);
  controlsHideTimer = setTimeout(function () {
    controlsHideTimer = null;
    var remaining = controlsRevealHoldUntil - performance.now();
    if (remaining > 0) {
      scheduleControlsHide(Math.ceil(remaining) + 32);
      return;
    }
    if (!controlsHovering) setControlsHidden(true);
  }, requestedDelay);
}

function revealBottomControls(delay) {
  if (document.body.classList.contains('home-controls-locked')) return;
  var bar = document.getElementById('bottom-bar');
  if (isBottomControlsSuppressedForShelf()) return;
  if (bar) bar.classList.add('visible');
  wakeBottomHandle();
  setControlsHidden(false);
  if (controlsAutoHide) scheduleControlsHide(delay == null ? 520 : delay);
}

function holdBottomControlsVisible(duration) {
  var holdDuration = Math.max(900, Number(duration) || 0);
  controlsRevealHoldUntil = Math.max(controlsRevealHoldUntil, performance.now() + holdDuration);
  revealBottomControls(holdDuration + 32);
}

function showRestoredPlaybackControls(reason) {
  if (!hasActivePlaybackControls()) return;
  try {
    homeForcedOpen = false;
    setHomeControlsLocked(false);
    var bar = document.getElementById('bottom-bar');
    if (bar) {
      bar.classList.add('visible');
      bar.classList.remove('soft-hidden');
      bar.style.pointerEvents = '';
    }
    wakeBottomHandle(reason === 'startup-autoplay' ? 2600 : 3600);
    setControlsHidden(false);
    updateControlsChromeState();
    if (controlsHideTimer) {
      clearTimeout(controlsHideTimer);
      controlsHideTimer = null;
    }
    if (controlsAutoHide) scheduleControlsHide(reason === 'startup-autoplay' ? 2200 : 3600);
  } catch (e) {
    console.warn('[RestoredPlaybackControls]', e);
  }
}

function updateControlsChromeState() {
  var bar = document.getElementById('bottom-bar');
  var handle = document.getElementById('bottom-handle');
  var active = !!(bar && bar.classList.contains('visible') && !bar.classList.contains('soft-hidden'));
  document.body.classList.toggle('controls-visible', active);
  if (handle) handle.classList.toggle('active', active);
}

function wakeBottomHandle(duration) {
  document.body.classList.add('controls-handle-awake');
  if (controlsHandleDimTimer) clearTimeout(controlsHandleDimTimer);
  controlsHandleDimTimer = setTimeout(function () {
    controlsHandleDimTimer = null;
    document.body.classList.remove('controls-handle-awake');
  }, duration == null ? 2000 : duration);
}

function forcePlaybackControlsInteractive() {
  if (!hasActivePlaybackControls()) return;
  try {
    document.body.classList.remove('home-controls-locked');
    var bar = document.getElementById('bottom-bar');
    if (bar) {
      bar.style.pointerEvents = '';
      if (!controlsAutoHide) {
        bar.classList.add('visible');
        bar.classList.remove('soft-hidden');
      }
    }
    ['play-btn', 'prev-btn', 'next-btn', 'mini-queue-btn', 'heart-btn', 'play-mode-btn', 'collect-btn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove('busy');
    });
    updateControlsChromeState();
    if (bar && bar.classList.contains('visible') && controlsAutoHide && !controlsHovering) scheduleControlsHide(220);
  } catch (e) {
    console.warn('[PlaybackControlsRestore]', e);
  }
}

function toggleBottomControlsFromHandle() {
  var bar = document.getElementById('bottom-bar');
  if (!bar || document.body.classList.contains('home-controls-locked')) return;
  if (isBottomControlsSuppressedForShelf()) return;
  revealBottomControls(900);
}

function updateControlsAutoHideFromPointer(x, y) {
  if (document.body.classList.contains('home-controls-locked')) return;
  if (isBottomControlsSuppressedForShelf()) return;
  var bar = document.getElementById('bottom-bar');
  if (!bar || !bar.classList.contains('visible')) return;
  var rect = bar.getBoundingClientRect();
  var handle = document.getElementById('bottom-handle');
  var hr = handle ? handle.getBoundingClientRect() : null;
  // Popovers (volume, quality, lyric timing) are bar descendants drawn above
  // its rectangle; the browser hover state covers them, the rect does not.
  // A held slider drag may wander outside the popover entirely.
  var overBarChild = !!(bar._controlsPointerHeld || (typeof bar.matches === 'function' && bar.matches(':hover')));
  controlsHovering = overBarChild
    || (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    || !!(hr && x >= hr.left && x <= hr.right && y >= hr.top && y <= hr.bottom);
  if (!controlsAutoHide) { setControlsHidden(false); return; }
  if (diyPlayerMode) {
    var fxPanel = document.getElementById('fx-panel');
    var fxFab = document.getElementById('fx-fab');
    var fr = fxPanel ? fxPanel.getBoundingClientRect() : null;
    var br = fxFab ? fxFab.getBoundingClientRect() : null;
    var overFxPanel = fxPanel && (fxPanel.classList.contains('peek') || fxPanel.classList.contains('show')) && fr && x >= fr.left - 18 && x <= fr.right + 18 && y >= fr.top - 18 && y <= fr.bottom + 18;
    var overFxFab = br && x >= br.left - 18 && x <= br.right + 18 && y >= br.top - 18 && y <= br.bottom + 18;
    if (overFxPanel || overFxFab) {
      scheduleControlsHide(80);
      return;
    }
  }
  controlsLastMoveAt = performance.now();
  var overHandle = hr && x >= hr.left - 18 && x <= hr.right + 18 && y >= hr.top - 12 && y <= hr.bottom + 14;
  var overBar = x >= rect.left - 18 && x <= rect.right + 18 && y >= rect.top - 18 && y <= rect.bottom + 14;
  var mini = document.getElementById('mini-queue-popover');
  var miniRect = mini ? mini.getBoundingClientRect() : null;
  var overMini = miniQueueOpen && miniRect && x >= miniRect.left - 16 && x <= miniRect.right + 16 && y >= miniRect.top - 16 && y <= miniRect.bottom + 16;
  if (overHandle) wakeBottomHandle();
  if (overBarChild || overBar || overMini || overHandle) revealBottomControls(overHandle ? 900 : 520);
  else scheduleControlsHide(70);
}

function toggleControlsAutoHide() {
  controlsAutoHide = !controlsAutoHide;
  saveBooleanPreference(CONTROLS_AUTO_HIDE_STORE_KEY, controlsAutoHide);
  updateControlsAutoHideButton();
  setControlsHidden(false);
  if (controlsAutoHide) {
    scheduleControlsHide(520);
    showToast('控制条自动隐藏已开启');
  } else {
    if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
    showToast('控制条保持显示');
  }
}

// Same pin as the playlist panel: upright and filled = always shown,
// leaning = auto-hide. The cursor is usually over the bar when this is
// clicked, so the bar itself cannot show the change; the pin has to.
function updateControlsAutoHideButton() {
  var btn = document.getElementById('controls-hide-btn');
  if (!btn) return;
  var pinned = !controlsAutoHide;
  btn.classList.toggle('pinned', pinned);
  btn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
  btn.setAttribute('aria-label', pinned ? '控制条常显' : '控制条自动隐藏');
  btn.title = pinned ? '控制条：常显（点击改为自动隐藏）' : '控制条：自动隐藏（点击改为常显）';
}

function applyControlsAutoHidePreference() {
  updateControlsAutoHideButton();
  if (!controlsAutoHide && controlsHideTimer) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  }
  setControlsHidden(false);
}

(function initControlsAutoHide() {
  var bar = document.getElementById('bottom-bar');
  var handle = document.getElementById('bottom-handle');
  if (!bar) return;
  function enterControls() {
    controlsHovering = true;
    wakeBottomHandle();
    setControlsHidden(false);
    if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
  }
  function leaveControls() {
    if (bar._controlsPointerHeld) return;
    controlsHovering = false;
    scheduleControlsHide(70);
    wakeBottomHandle(900);
  }
  function releaseControlsPointer() {
    if (!bar._controlsPointerHeld) return;
    bar._controlsPointerHeld = false;
    if (!(typeof bar.matches === 'function' && bar.matches(':hover'))) leaveControls();
  }
  bar.addEventListener('mouseenter', enterControls);
  bar.addEventListener('mouseleave', leaveControls);
  bar.addEventListener('pointerdown', function () { bar._controlsPointerHeld = true; enterControls(); });
  window.addEventListener('pointerup', releaseControlsPointer, true);
  window.addEventListener('pointercancel', releaseControlsPointer, true);
  document.addEventListener('mouseleave', leaveControls);
  window.addEventListener('blur', function () {
    bar._controlsPointerHeld = false;
    if (typeof closeControlSourceSwitcher === 'function') closeControlSourceSwitcher();
    var quality = document.getElementById('quality-control');
    if (quality) quality.classList.remove('open');
    leaveControls();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) leaveControls(); });
  if (handle) {
    handle.addEventListener('mouseenter', function () {
      controlsHovering = true;
      revealBottomControls(900);
    });
    handle.addEventListener('mouseleave', leaveControls);
    handle.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleBottomControlsFromHandle(); });
  }
  updateControlsChromeState();
})();

function isCursorAutoHideMode() {
  return !document.hidden;
}

function clearCursorAutoHideTimer() {
  if (cursorHideTimer) {
    clearTimeout(cursorHideTimer);
    cursorHideTimer = null;
  }
}

function setCursorHidden(hidden) {
  document.body.classList.toggle('cursor-hidden', !!hidden && isCursorAutoHideMode());
}

function scheduleCursorHide(delay) {
  clearCursorAutoHideTimer();
  if (!isCursorAutoHideMode()) {
    setCursorHidden(false);
    return;
  }
  cursorHideTimer = setTimeout(function () {
    cursorHideTimer = null;
    setCursorHidden(true);
  }, delay == null ? CURSOR_HIDE_DELAY : delay);
}

function revealCursorForActivity() {
  if (!isCursorAutoHideMode()) {
    clearCursorAutoHideTimer();
    setCursorHidden(false);
    return;
  }
  setCursorHidden(false);
  scheduleCursorHide(CURSOR_HIDE_DELAY);
}

function syncCursorAutoHideMode() {
  if (isCursorAutoHideMode()) revealCursorForActivity();
  else {
    clearCursorAutoHideTimer();
    setCursorHidden(false);
  }
}

['mousemove', 'pointermove', 'mousedown', 'wheel', 'touchstart'].forEach(function (type) {
  window.addEventListener(type, revealCursorForActivity, { passive: true, capture: true });
});
syncCursorAutoHideMode();

// ============================================================
//  指针 / 拖拽控制
//   v7.1: 用 userOrbit 替代 targetOrbit; 加 drag 距离判断
