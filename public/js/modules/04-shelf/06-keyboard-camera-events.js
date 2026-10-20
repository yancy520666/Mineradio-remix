function isFreeCameraControlCode(code) {
  return /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(code);
}
function consumeFreeCameraKeyEvent(e, isDown) {
  if (e.defaultPrevented || e.isComposing || isKeyboardUiTarget(e.target)) return false;
  if (hotkeyCaptureState) return false;
  if (isDown && handleConfiguredLocalHotkey(e)) {
    e.stopImmediatePropagation();
    return true;
  }
  if (!freeCamera || !freeCamera.active) return false;
  if (!isFreeCameraControlCode(e.code)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  freeCamera.keys = freeCamera.keys || {};
  freeCamera.keys[e.code] = !!isDown;
  markRenderInteraction('free-camera-key', 900);
  return true;
}
function isPlaybackSpaceKey(e) {
  return !!(
    e &&
    e.code === 'Space' &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey &&
    !e.metaKey &&
    !(freeCamera && freeCamera.active) &&
    !isKeyboardUiTarget(e.target)
  );
}
document.addEventListener('keydown', function (e) {
  consumeFreeCameraKeyEvent(e, true);
}, true);
document.addEventListener('keyup', function (e) {
  consumeFreeCameraKeyEvent(e, false);
}, true);
document.addEventListener('keydown', function (e) {
  if (e.defaultPrevented || isKeyboardUiTarget(e.target)) return;
  if (isPlaybackSpaceKey(e)) return;
  markRenderInteraction('keyboard', 700);
});
document.addEventListener('keyup', function (e) {
  if (!freeCamera || !freeCamera.keys) return;
  if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)) {
    freeCamera.keys[e.code] = false;
  }
});
window.addEventListener('blur', function () {
  if (freeCamera && freeCamera.keys) freeCamera.keys = {};
});

// ============================================================
//  API 助手
