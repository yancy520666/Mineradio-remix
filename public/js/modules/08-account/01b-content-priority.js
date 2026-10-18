// Account ordering is also the default order for platform content.
function contentProviderOrder() {
  var ready = typeof ACCOUNT_PROVIDER_KEYS !== 'undefined' && Array.isArray(ACCOUNT_PROVIDER_KEYS);
  var order = ready && typeof accountProviderOrder === 'function' ? accountProviderOrder() : ['netease', 'qq', 'kugou', 'qishui'];
  return order;
}
function homeRecommendationProviderConnected(provider) {
  var status = platformStatus(provider);
  return !!(status && (status.loggedIn || (provider === 'qishui' && status.configured)));
}
function preferredHomeRecommendationSource() {
  var order = contentProviderOrder();
  for (var i = 0; i < order.length; i++) {
    if (homeRecommendationProviderConnected(order[i])) return order[i];
  }
  return order[0] || 'netease';
}
// Other connected platforms, in priority order, that can supply a daily list.
function homeDailyFallbackSources(exclude) {
  return contentProviderOrder().filter(function (provider) {
    return provider !== exclude && homeRecommendationProviderConnected(provider)
      && (provider === 'netease' || !!homePlatformRecommendationFeedConfig(provider));
  });
}
var HOME_DAILY_AUTO_FALLBACK_STORE_KEY = 'mineradio-home-daily-auto-fallback-v1';
function homeDailyAutoFallbackEnabled() {
  try { return localStorage.getItem(HOME_DAILY_AUTO_FALLBACK_STORE_KEY) === '1'; } catch (e) { return false; }
}
var homeDailyFallbackResolve = null;
function closeHomeDailyFallback(choice) {
  var modal = document.getElementById('home-daily-fallback-modal');
  var remember = document.getElementById('home-daily-fallback-remember');
  var resolve = homeDailyFallbackResolve;
  homeDailyFallbackResolve = null;
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (choice && choice !== 'view' && remember && remember.checked) {
    try { localStorage.setItem(HOME_DAILY_AUTO_FALLBACK_STORE_KEY, '1'); } catch (e) { }
  }
  if (resolve) resolve(choice || null);
}
// Resolves with a platform key, 'view' (show why the preferred one is empty) or null.
function askHomeDailyFallback(source, alternatives) {
  var modal = document.getElementById('home-daily-fallback-modal');
  var text = document.getElementById('home-daily-fallback-text');
  var options = document.getElementById('home-daily-fallback-options');
  var remember = document.getElementById('home-daily-fallback-remember');
  if (!modal || !text || !options || homeDailyFallbackResolve) return Promise.resolve('view');
  var label = homePlatformRecommendationSourceLabel(source);
  text.textContent = label + '今天没有可播放的每日推荐。要改用其他已登录平台的推荐吗？';
  options.innerHTML = '';
  alternatives.forEach(function (provider, index) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'modal-btn' + (index === 0 ? ' primary' : '');
    button.textContent = '改用' + homePlatformRecommendationSourceLabel(provider);
    button.addEventListener('click', function () { closeHomeDailyFallback(provider); });
    options.appendChild(button);
  });
  if (remember) remember.checked = false;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  var first = options.querySelector('button');
  if (first) first.focus();
  return new Promise(function (resolve) { homeDailyFallbackResolve = resolve; });
}
function homePreferredDailySong() {
  var source = preferredHomeRecommendationSource();
  var songs = source === 'netease' ? homeDiscoverState.songs :
    (homePlatformRecommendationState.feeds[source] || {}).songs;
  return songs && songs[0] || null;
}
function syncHomeRecommendationTabOrder() {
  var tabs = document.getElementById('home-platform-recommend-tabs');
  if (tabs) contentProviderOrder().forEach(function (provider) {
    var tab = tabs.querySelector('[data-home-recommend-source="' + provider + '"]');
    if (tab) tabs.appendChild(tab);
  });
}
function syncContentProviderPriority() {
  syncHomeRecommendationTabOrder();
  if (typeof rebuildUserPlaylistsFromCatalog === 'function') {
    rebuildUserPlaylistsFromCatalog({ preserveScroll: true, reason: 'content-provider-priority' });
  }
  if (typeof renderHomeDashboardQuickCards === 'function') renderHomeDashboardQuickCards();
  if (homePlatformRecommendationState.open) {
    loadHomePlatformRecommendations(preferredHomeRecommendationSource(), false);
  }
}
