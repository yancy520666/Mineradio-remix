var commentAvatarPlaceholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#303236"/><circle cx="32" cy="24" r="10" fill="#676b73"/><path d="M12 56a20 20 0 0140 0" fill="#676b73"/></svg>');
function commentAvatarHtml(url, size, className) {
  var src = coverProxySrc(coverUrlWithSize(url, size));
  return '<img class="' + className + '" src="' + escHtml(commentAvatarPlaceholder) + '" data-comment-avatar="' + escHtml(src) + '" alt="" decoding="async">';
}
var commentAvatarLoader = (function () {
  var entries = new Map(), images = new Map(), queue = [], active = 0, bytes = 0, scanTimer = 0, scanning = false;
  var maxBytes = 4 * 1024 * 1024, observed = new Set();
  function unobserve(image) {
    if (observer) observer.unobserve(image);
    observed.delete(image); image.__commentAvatarObserved = false;
  }
  function visible(image) {
    var rect = image.getBoundingClientRect();
    var modal = document.getElementById('track-detail-modal');
    return image.isConnected && modal && modal.classList.contains('show') && rect.width > 0 && rect.height > 0;
  }
  function nearPriority(image) {
    if (!visible(image)) return -1;
    var rect = image.getBoundingClientRect();
    var root = image.closest('.detail-scroll') || document.getElementById('track-detail-body');
    var clip = root.getBoundingClientRect(), top = Math.max(0, clip.top), bottom = Math.min(innerHeight, clip.bottom);
    if (rect.bottom < top - 120 || rect.top > bottom + 120) return -1;
    return rect.bottom > top && rect.top < bottom ? 0 : 1;
  }
  function trim() {
    entries.forEach(function (rec, key) {
      if ((entries.size <= 80 && bytes <= maxBytes) || rec.loading || rec.waiters.size) return;
      entries.delete(key); bytes -= rec.bytes || 0; if (rec.image) rec.image.removeAttribute('src');
    });
  }
  function cancel(image) {
    var rec = images.get(image); images.delete(image);
    if (!rec) return;
    rec.waiters.delete(image);
    if (!rec.waiters.size && rec.retry) { clearTimeout(rec.retry); rec.retry = 0; }
    if (!rec.waiters.size && rec.cancel) rec.cancel();
    if (!rec.waiters.size && !rec.image && !rec.loading) entries.delete(rec.key);
  }
  function pump() {
    if (scanning) return;
    var limit = typeof upcomingCoverPrefetch !== 'undefined' && upcomingCoverPrefetch.image ? 1 : 2;
    queue.sort(function (a, b) { return a.priority - b.priority; });
    while (active < limit && queue.length) {
      let rec = queue.shift();
      if (!rec.waiters.size || entries.get(rec.key) !== rec || rec.loading) continue;
      let releaseSlot = typeof reserveBackgroundImageSlot === 'function' ? reserveBackgroundImageSlot() : null;
      if (typeof reserveBackgroundImageSlot === 'function' && !releaseSlot) { queue.unshift(rec); break; }
      let img = new Image(), settled = false, timer;
      rec.loading = true; active++; rec.attempts++;
      img.decoding = 'async';
      function finish(ok, cancelled) {
        if (settled) return; settled = true; clearTimeout(timer); active--;
        img.onload = img.onerror = null; rec.loading = false; rec.cancel = null;
        if (releaseSlot) releaseSlot();
        if (ok) {
          rec.image = img; rec.bytes = img.naturalWidth * img.naturalHeight * 4; bytes += rec.bytes;
          rec.waiters.forEach(function (image) { if (visible(image) && image.dataset.commentAvatar === rec.key) image.src = rec.key; images.delete(image); unobserve(image); });
          rec.waiters.clear(); trim();
        } else {
          img.removeAttribute('src');
          if (!cancelled && rec.attempts < 2 && rec.waiters.size && navigator.onLine !== false) {
            rec.retry = setTimeout(function () { rec.retry = 0; queue.push(rec); pump(); }, 800);
          } else {
            rec.failedAt = performance.now(); rec.waiters.clear();
          }
        }
        pump();
      }
      rec.cancel = function () { clearTimeout(rec.retry); finish(false, true); };
      img.onload = function () { img.decode().then(function () { finish(true); }, function () { finish(false); }); };
      img.onerror = function () { finish(false); };
      timer = setTimeout(function () { finish(false); }, 8000); img.src = rec.key;
    }
  }
  function request(image, priority) {
    if (!visible(image)) return;
    var key = image.dataset.commentAvatar; if (!key) return;
    var rec = entries.get(key);
    if (rec && rec.image) { image.src = key; entries.delete(key); entries.set(key, rec); unobserve(image); return; }
    if (rec && rec.failedAt && performance.now() - rec.failedAt < 30000) return;
    if (!rec || rec.failedAt) { rec = { key: key, waiters: new Set(), attempts: 0, priority: priority }; entries.set(key, rec); queue.push(rec); }
    rec.priority = Math.min(rec.priority, priority); rec.waiters.add(image); images.set(image, rec); pump();
  }
  var observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function () { schedule(); }, { rootMargin: '120px' }) : null;
  function scan() {
    scanTimer = 0; scanning = true;
    observed.forEach(function (image) { if (!image.isConnected) unobserve(image); });
    images.forEach(function (_, image) { if (nearPriority(image) < 0) { cancel(image); if (!image.isConnected) unobserve(image); } });
    var body = document.getElementById('track-detail-body');
    if (!body) { scanning = false; return; }
    body.querySelectorAll('img[data-comment-avatar]').forEach(function (image) {
      var priority = nearPriority(image);
      if (priority >= 0) request(image, priority);
      if (observer && image.src !== image.dataset.commentAvatar && !image.__commentAvatarObserved) { image.__commentAvatarObserved = true; observed.add(image); observer.observe(image); }
    });
    queue = queue.filter(function (rec) { return rec.waiters.size && entries.get(rec.key) === rec; }); trim();
    scanning = false; pump();
  }
  function schedule() { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 40); }
  var body = document.getElementById('track-detail-body'), modal = document.getElementById('track-detail-modal');
  if (body) body.addEventListener('scroll', schedule, true);
  if (body) new MutationObserver(schedule).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  if (modal) new MutationObserver(schedule).observe(modal, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('online', schedule);
  window.addEventListener('mineradio-background-image-slot', pump);
  window.addEventListener('pagehide', function () { images.forEach(function (_, image) { cancel(image); }); clearTimeout(scanTimer); if (observer) observer.disconnect(); observed.clear(); });
  return { snapshot: function () { return { active: active, queued: queue.length, entries: entries.size, bytes: bytes }; }, scan: scan };
})();
