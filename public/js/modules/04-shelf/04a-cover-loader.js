var playlistCoverQueue = [];
var playlistCoverActive = 0;
var playlistCoverSession = 0;
var playlistCoverMetrics = [];
var shelfCoverFrame = 0;
var playlistCoverOrder = 0;
var playlistCoverViewportUpdating = false;
var playlistCoverViewportVisible = new Set(), playlistCoverViewportNearby = new Set();
function trimPlaylistCoverCache() {
  var loaded = Object.keys(playlistCoverCache).map(function (url) { return { url: url, rec: playlistCoverCache[url] }; }).filter(function (entry) { return entry.rec.loaded && entry.rec.img; });
  var bytes = loaded.reduce(function (sum, entry) { return sum + (entry.rec.bytes || 0); }, 0), count = loaded.length;
  loaded.sort(function (a, b) { return (a.rec.usedAt || 0) - (b.rec.usedAt || 0); });
  loaded.forEach(function (entry) {
    if (count <= 160 && bytes <= 24 * 1024 * 1024) return;
    if (playlistCoverViewportVisible.has(entry.url) || playlistCoverViewportNearby.has(entry.url)) return;
    delete playlistCoverCache[entry.url]; bytes -= entry.rec.bytes || 0; count--;
    entry.rec.img.removeAttribute('src'); entry.rec.img = null;
  });
}
function requestShelfCoverFrame() {
  if (shelfCoverFrame || typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode()) return;
  shelfCoverFrame = requestAnimationFrame(function () {
    shelfCoverFrame = 0;
    if (typeof markRenderInteraction === 'function') markRenderInteraction('shelf-cover', 200);
    if (typeof requestMainLoopAnimationFrame === 'function') requestMainLoopAnimationFrame();
  });
}
function podcastDefaultCover(key) {
  var path = key === 'liked'
    ? '<path d="M32 46L15 30C5 19 22 9 32 22C42 9 59 19 49 30Z"/>'
    : key === 'created'
      ? '<rect x="25" y="10" width="14" height="29" rx="7"/><path d="M19 29v4a13 13 0 0026 0v-4M32 46v9M24 55h16"/>'
      : '<path d="M12 35v-5a20 20 0 0140 0v5M12 32h8v18h-8zM44 32h8v18h-8z"/>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#173135"/><g fill="none" stroke="#8cdbcf" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + path + '</g></svg>');
}
function podcastCollectionCover(collection) {
  return collection.cover || podcastDefaultCover(collection.key);
}
function drawPodcastFallback(card, item, ctx, x, y, size, redraw) {
  var url = podcastDefaultCover(item.podcastKey);
  var rec = playlistCoverCache[url];
  if (rec && rec.loaded) ctx.drawImage(rec.img, x, y, size, size);
  else if (!card.podcastFallbackWaiting) {
    card.podcastFallbackWaiting = true;
    requestPlaylistCover(url, redraw, { priority: 0 });
  }
}
function shelfCoverSource(url) {
  // Only NetEase's image CDN supports this resizing contract. Preserve signed URLs.
  if (/^https?:\/\/p\d+\.music\.126\.net\//i.test(url) && !/[?&]param=\d+y\d+/i.test(url)) return coverUrlWithSize(url, 360);
  return url;
}
function pumpPlaylistCovers() {
  if (playlistCoverViewportUpdating) return;
  while (playlistCoverActive < 4 && playlistCoverQueue.length) {
    playlistCoverQueue.sort(function (a, b) { return a.priority - b.priority || (a.priority === 0 ? b.order - a.order : a.order - b.order); });
    // Keep two network slots free for a newly visible cover.
    if (playlistCoverActive >= 2 && playlistCoverQueue[0].priority > 0) break;
    var task = playlistCoverQueue[0];
    if (playlistCoverCache[task.url] !== task.rec) { playlistCoverQueue.shift(); continue; }
    if (task.priority > 0 && typeof reserveBackgroundImageSlot === 'function') {
      task.releaseSlot = reserveBackgroundImageSlot(); if (!task.releaseSlot) break;
    }
    playlistCoverQueue.shift();
    startPlaylistCoverRequest(task);
  }
}
function startPlaylistCoverRequest(task) {
  var rec = task.rec, img = new Image();
  var started = performance.now(), settled = false, timer;
  playlistCoverActive++;
  rec.attempts++;
  if (!isInlineCoverSrc(task.url)) img.crossOrigin = 'anonymous';
  function finish(image, decodeMs, cancelled) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    img.onload = img.onerror = null;
    playlistCoverActive--;
    if (task.releaseSlot) { task.releaseSlot(); task.releaseSlot = null; }
    if (playlistCoverCache[task.url] !== rec) { pumpPlaylistCovers(); return; }
    rec.cancel = null;
    if (!image && !cancelled && rec.attempts < 2) {
      rec.retryTimer = setTimeout(function () {
        rec.retryTimer = 0;
        if (playlistCoverCache[task.url] !== rec) return;
        playlistCoverQueue.push(task); pumpPlaylistCovers();
      }, 800);
    } else {
      rec.loading = false; rec.loaded = !!image; rec.failed = !image; rec.img = image;
      rec.bytes = image ? image.naturalWidth * image.naturalHeight * 4 : 0; rec.usedAt = performance.now();
      rec.failedAt = image ? 0 : performance.now();
      var entries = performance.getEntriesByName ? performance.getEntriesByName(img.src) : [];
      var timing = entries[entries.length - 1];
      rec.metrics = { attempts: rec.attempts, queueMs: started - rec.requestedAt,
        requestMs: timing ? timing.responseStart - timing.startTime : null,
        downloadMs: timing ? timing.responseEnd - timing.responseStart : null,
        decodeMs: decodeMs || 0, totalMs: performance.now() - rec.requestedAt, success: !!image };
      playlistCoverMetrics.push(rec.metrics);
      if (playlistCoverMetrics.length > 32) playlistCoverMetrics.shift();
      rec.waiters.splice(0).forEach(function (callback) { setTimeout(function () { if (!callback.isCurrent || callback.isCurrent()) callback(image); }, 0); });
      trimPlaylistCoverCache();
    }
    pumpPlaylistCovers();
  }
  rec.cancel = function () {
    if (rec.retryTimer) clearTimeout(rec.retryTimer);
    if (playlistCoverCache[task.url] === rec) delete playlistCoverCache[task.url];
    finish(null, 0, true); img.removeAttribute('src');
  };
  img.onload = function () {
    var decodeStart = performance.now();
    if (typeof img.decode === 'function') img.decode().then(function () { finish(img, performance.now() - decodeStart); }, function () { finish(img, performance.now() - decodeStart); });
    else finish(img, 0);
  };
  img.onerror = function () { finish(null, 0); };
  timer = setTimeout(function () { finish(null, 0); img.removeAttribute('src'); }, 12000);
  var src = coverProxySrc(shelfCoverSource(task.url));
  if (src) img.src = src;
  else finish(null, 0);
}
function requestPlaylistCover(url, callback, options) {
  if (!url) { if (callback) callback(null); return; }
  if (callback && options && options.isCurrent) callback.isCurrent = options.isCurrent;
  var rec = playlistCoverCache[url];
  if (rec) rec.usedAt = performance.now();
  if (rec && rec.loaded) { if (callback) setTimeout(function () { callback(rec.img); }, 0); return; }
  if (rec && rec.failed && !playlistCoverCanRetry(rec)) { if (callback) setTimeout(function () { callback(null); }, 0); return; }
  if (rec && rec.loading) {
    if (callback && rec.waiters.indexOf(callback) < 0) rec.waiters.push(callback);
    if (options && options.priority === 0) {
      playlistCoverQueue.forEach(function (task) { if (task.rec === rec) { task.priority = 0; task.order = ++playlistCoverOrder; } });
      pumpPlaylistCovers();
    }
    return;
  }
  rec = playlistCoverCache[url] = { loaded: false, loading: true, failed: false, img: null,
    attempts: 0, session: playlistCoverSession, requestedAt: performance.now(), waiters: callback ? [callback] : [] };
  var task = { url: url, rec: rec, priority: options && options.priority === 0 ? 0 : 1, order: ++playlistCoverOrder, scope: options && options.scope || '' };
  rec.task = task; playlistCoverQueue.push(task);
  pumpPlaylistCovers();
}
function beginPlaylistCoverSession() {
  playlistCoverSession++;
}
function prewarmPlaylistCovers(items, center) {
  [0, -1, 1, -2, 2].forEach(function (offset) {
    var item = items[center + offset];
    if (item && item.cover) requestPlaylistCover(item.cover, null, { priority: Math.abs(offset) <= 1 ? 0 : 1 });
  });
}
function prewarmPlaylistCatalogCovers() {
  var items = (userPlaylists || []).slice(0, 4).concat((myPodcastCollections || []).slice(0, 2));
  items.forEach(function (item) { if (item.cover) requestPlaylistCover(item.cover); });
}
window.addEventListener('online', function () {
  beginPlaylistCoverSession();
  Object.keys(playlistCoverCache).forEach(function (url) {
    if (playlistCoverCache[url].failed && (playlistCoverViewportVisible.has(url) || playlistCoverViewportNearby.has(url))) requestPlaylistCover(url);
  });
});

function playlistCoverCanRetry(rec) {
  return !!(rec && rec.failed && (rec.session !== playlistCoverSession || performance.now() - rec.failedAt >= 30000));
}
function updatePlaylistCoverViewport(visible, nearby) {
  playlistCoverViewportUpdating = true;
  var visibleSet = new Set(visible), nearbySet = new Set(nearby);
  playlistCoverViewportVisible = visibleSet; playlistCoverViewportNearby = nearbySet;
  Object.keys(playlistCoverCache).forEach(function (url) {
    var rec = playlistCoverCache[url];
    if (!rec.task || rec.task.scope !== 'content') return;
    rec.waiters = rec.waiters.filter(function (callback) { return !callback.isCurrent || callback.isCurrent(); });
    if (!visibleSet.has(url) && !nearbySet.has(url) && !rec.waiters.length && rec.loading) {
      if (rec.retryTimer) clearTimeout(rec.retryTimer);
      if (rec.cancel) rec.cancel();
      else { delete playlistCoverCache[url]; rec.loading = false; }
    }
  });
  playlistCoverQueue = playlistCoverQueue.filter(function (task) {
    if (task.scope !== 'content') return true;
    task.priority = visibleSet.has(task.url) ? 0 : (nearbySet.has(task.url) ? 1 : 2);
    if (task.priority < 2 || task.rec.waiters.length) return true;
    // Stale prefetches without a visible subscriber must not delay this window.
    if (playlistCoverCache[task.url] === task.rec) delete playlistCoverCache[task.url];
    task.rec.loading = false;
    return false;
  });
  playlistCoverViewportUpdating = false;
  pumpPlaylistCovers(); trimPlaylistCoverCache();
}

function shelfSongCoverSrc(song) {
  // A 54 px row cover needs enough texels for the existing high/ultra canvas.
  var profile = typeof shelfTextureQualityProfile === 'function' ? shelfTextureQualityProfile() : { maxScale: 1 };
  return songCoverSrc(song, Math.round(80 * profile.maxScale));
}

window.addEventListener('mineradio-background-image-slot', pumpPlaylistCovers);
window.addEventListener('pagehide', function () {
  playlistCoverViewportUpdating = true; playlistCoverQueue = [];
  Object.keys(playlistCoverCache).forEach(function (url) {
    var rec = playlistCoverCache[url]; clearTimeout(rec.retryTimer);
    if (rec.cancel) rec.cancel();
  });
});
