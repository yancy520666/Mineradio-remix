// Account images share bounded recovery, including dynamically rendered pills.
var providerAvatarRetryDelays = [1000, 3000, 10000];
var providerAvatarRecovery = new WeakMap();
var providerAvatarRetryTimers = new Map();

function providerAvatarHtml(provider, status) {
  var src = providerAvatarSrc(provider, status);
  return '<img data-avatar-provider="' + escHtml(provider) + '" data-avatar-src="' + escHtml(src) + '" src="' + escHtml(src) + '" alt="">';
}
function cancelProviderAvatarRetry(image) {
  clearTimeout(providerAvatarRetryTimers.get(image));
  providerAvatarRetryTimers.delete(image);
}
function setProviderAvatar(image, provider, status) {
  var src = providerAvatarSrc(provider, status);
  if (image.getAttribute('data-avatar-provider') === provider && image.getAttribute('data-avatar-src') === src) return;
  cancelProviderAvatarRetry(image);
  providerAvatarRecovery.delete(image);
  image.setAttribute('data-avatar-provider', provider);
  image.setAttribute('data-avatar-src', src);
  image.src = src;
}
function retryProviderAvatar(image, state) {
  cancelProviderAvatarRetry(image);
  if (!image.isConnected || providerAvatarRecovery.get(image) !== state || navigator.onLine === false) return;
  state.attempts += 1;
  var url = new URL(state.source, location.href);
  url.searchParams.set('v', Date.now() + '-' + state.attempts);
  image.src = url.pathname + url.search;
}
document.addEventListener('error', function (event) {
  var image = event.target;
  if (!image || image.tagName !== 'IMG') return;
  var provider = image.getAttribute('data-avatar-provider');
  var source = image.getAttribute('data-avatar-src') || '';
  if (!provider || !/^\/api\/cover\?/.test(source)) return;
  var state = providerAvatarRecovery.get(image);
  if (!state) {
    state = { source: source, fallback: providerAvatarSrc(provider, {}), attempts: 0, failed: true };
    providerAvatarRecovery.set(image, state);
  }
  if (image.getAttribute('src') === state.fallback) return;
  state.failed = true;
  cancelProviderAvatarRetry(image);
  image.src = state.fallback;
  if (state.attempts >= providerAvatarRetryDelays.length || navigator.onLine === false) return;
  providerAvatarRetryTimers.set(image, setTimeout(function () {
    retryProviderAvatar(image, state);
  }, providerAvatarRetryDelays[state.attempts]));
}, true);
document.addEventListener('load', function (event) {
  var image = event.target;
  var state = image && providerAvatarRecovery.get(image);
  if (!state || image.getAttribute('src') === state.fallback) return;
  state.failed = false;
  state.attempts = 0;
  cancelProviderAvatarRetry(image);
}, true);
window.addEventListener('online', function () {
  document.querySelectorAll('img[data-avatar-provider]').forEach(function (image) {
    var state = providerAvatarRecovery.get(image);
    if (!state || !state.failed) return;
    state.attempts = 0;
    retryProviderAvatar(image, state);
  });
});
window.addEventListener('pagehide', function () {
  providerAvatarRetryTimers.forEach(function (timer) { clearTimeout(timer); });
  providerAvatarRetryTimers.clear();
});
