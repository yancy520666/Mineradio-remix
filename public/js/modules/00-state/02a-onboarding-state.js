var startupOnboardingState = {};
try {
  var onboardingBridge = window.desktopWindow;
  if (onboardingBridge && typeof onboardingBridge.readOnboardingStateSync === 'function') {
    var onboardingResult = onboardingBridge.readOnboardingStateSync();
    if (onboardingResult && onboardingResult.ok) startupOnboardingState = onboardingResult.payload || {};
  }
} catch (_) { }
function startupGuideStoreKey(kind) {
  return kind === 'visual' ? VISUAL_GUIDE_SEEN_STORE_KEY : 'mineradio-login-guide-seen-v1';
}
function markStartupGuideSeen(kind) {
  startupOnboardingState[kind] = true;
  try { localStorage.setItem(startupGuideStoreKey(kind), '1'); } catch (_) { }
  try {
    var bridge = window.desktopWindow;
    if (bridge && typeof bridge.markOnboardingSeenSync === 'function') bridge.markOnboardingSeenSync(kind);
  } catch (_) { }
}
function startupGuideWasSeen(kind) {
  if (startupOnboardingState[kind] === true) return true;
  try {
    if (localStorage.getItem(startupGuideStoreKey(kind)) === '1') {
      markStartupGuideSeen(kind);
      return true;
    }
  } catch (_) { return true; }
  return false;
}
