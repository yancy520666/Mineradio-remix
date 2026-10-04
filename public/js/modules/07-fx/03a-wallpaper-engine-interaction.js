var wallpaperEngineHeldButtons = 0;

function wallpaperEngineBackgroundInputTarget(event) {
  var target = event && event.target;
  if (!target || !target.closest || document.pointerLockElement) return false;
  if (target.closest((typeof UI_HIT_SELECTOR === 'string' ? UI_HIT_SELECTOR + ',' : '') +
    'button, a, input, select, textarea, [role="button"], [contenteditable], [onclick], '
    + '#desktop-titlebar, #desktop-mode-control-dock, '
    + '[role="dialog"], [role="menu"], [role="slider"], .desktop-drag-region'
  )) return false;
  // 3D music cards share the background canvas, so DOM selectors alone cannot
  // protect their clicks. Prefer the player's existing hit test.
  if (typeof shelfManager !== 'undefined' && shelfManager) {
    if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return false;
    if (shelfManager.canInteract && shelfManager.canInteract()
      && typeof pointerCardHit === 'function' && typeof raycasterFromPointerEvent === 'function'
      && pointerCardHit(raycasterFromPointerEvent(event), event)) return false;
  }
  return true;
}

function sendWallpaperEngineInput(kind, event) {
  if (kind === 'reset') wallpaperEngineHeldButtons = 0;
  if (!wallpaperEnginePointerActivityReady() || wallpaperEngineCaptureMode !== 'dwm-thumbnail') return;
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.reportWallpaperEnginePointerActivity !== 'function') return;
  rememberWallpaperEnginePointerPosition(event);
  // Deliver the last move before a button transition; coalescing may only drop
  // moves, never reorder a down/up pair.
  if (wallpaperEnginePointerActivityTimer) {
    clearTimeout(wallpaperEnginePointerActivityTimer);
    flushWallpaperEnginePointerActivity();
  }
  var button = event && Number(event.button);
  var bit = button === 0 ? 1 : button === 1 ? 4 : button === 2 ? 2 : 0;
  if (kind === 'down') wallpaperEngineHeldButtons |= bit;
  if (kind === 'up') wallpaperEngineHeldButtons &= ~bit;
  if (kind === 'reset') wallpaperEngineHeldButtons = 0;
  api.reportWallpaperEnginePointerActivity({
    sessionId: String(wallpaperEngineNativeSessionId || ''), kind: kind,
    xUnit: wallpaperEnginePointerActivityLatestX, yUnit: wallpaperEnginePointerActivityLatestY,
    buttons: wallpaperEngineHeldButtons, button: bit ? button : 0,
    delta: kind === 'wheel' ? Math.round(Math.max(-1200, Math.min(1200, -Number(event.deltaY) || 0))) : 0
  });
}

function bindWallpaperEngineInteraction() {
  document.addEventListener('pointerdown', function (event) {
    if (event.button < 0 || event.button > 2 || !wallpaperEngineBackgroundInputTarget(event)) return;
    sendWallpaperEngineInput('down', event);
    if (wallpaperEngineHeldButtons && event.target.setPointerCapture) {
      try { event.target.setPointerCapture(event.pointerId); } catch (e) { }
    }
  }, true);
  document.addEventListener('pointerup', function (event) {
    if (!wallpaperEngineHeldButtons) return;
    sendWallpaperEngineInput('up', event);
  }, true);
  document.addEventListener('pointercancel', function () { sendWallpaperEngineInput('reset'); }, true);
  document.addEventListener('pointermove', function (event) {
    if (event.buttons === 0 && wallpaperEngineHeldButtons) sendWallpaperEngineInput('reset');
  }, { passive: true, capture: true });
  window.addEventListener('blur', function () { sendWallpaperEngineInput('reset'); });
  document.addEventListener('wheel', function (event) {
    if (!wallpaperEngineBackgroundInputTarget(event) || !wallpaperEnginePointerActivityReady()) return;
    sendWallpaperEngineInput('wheel', event);
  }, { passive: true, capture: true });
}
