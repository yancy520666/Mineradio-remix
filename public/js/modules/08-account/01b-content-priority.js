// Account ordering is also the default order for platform content.
function contentProviderOrder() {
  var ready = typeof ACCOUNT_PROVIDER_KEYS !== 'undefined' && Array.isArray(ACCOUNT_PROVIDER_KEYS);
  var order = ready && typeof accountProviderOrder === 'function' ? accountProviderOrder() : ['netease', 'qq', 'kugou', 'qishui'];
  return order.concat('spotify');
}
function preferredHomeRecommendationSource() {
  var order = contentProviderOrder().filter(function (provider) { return provider !== 'spotify'; });
  for (var i = 0; i < order.length; i++) {
    var provider = order[i];
    var status = platformStatus(provider);
    if (status && (status.loggedIn || (provider === 'qishui' && status.configured))) return provider;
  }
  return order[0] || 'netease';
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
