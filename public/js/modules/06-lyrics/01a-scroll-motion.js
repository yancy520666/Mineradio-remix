// Scroll targets belong to the virtual catalog, not to rows replaced during motion.
var playlistReturnMotion = null;
function cancelPlaylistReturnMotion() {
  if (!playlistReturnMotion) return;
  var job = playlistReturnMotion;
  playlistReturnMotion = null;
  if (job.tween) job.tween.kill();
  if (job.raf) cancelAnimationFrame(job.raf);
  if (typeof job.panel.__syncSmoothWheelTarget === 'function') job.panel.__syncSmoothWheelTarget(job.panel.scrollTop);
}
function playlistPanelTopInset(panel) {
  var header = panel.querySelector('.playlist-panel-sticky');
  var toolbar = panel.querySelector('#pl-pane .queue-toolbar');
  var padding = parseFloat(getComputedStyle(panel).paddingTop) || 0;
  var headerBottom = header ? header.offsetHeight + padding + (parseFloat(getComputedStyle(header).top) || 0) : 0;
  panel.style.setProperty('--playlist-toolbar-top', Math.max(0, headerBottom + 8 - padding) + 'px');
  panel.style.setProperty('--playlist-detail-top', Math.max(0, headerBottom + (toolbar ? toolbar.offsetHeight : 0) + 16 - padding) + 'px');
  return headerBottom + (toolbar && toolbar.offsetHeight ? toolbar.offsetHeight + 8 : 0) + 8;
}
function syncPlaylistPanelContentClip(panel) {
  var list = panel.querySelector('#pl-list');
  var toolbar = panel.querySelector('#pl-pane .queue-toolbar');
  if (!list || !toolbar || !toolbar.offsetHeight) return;
  var header = panel.querySelector('.playlist-panel-sticky');
  var safeTop = Math.max(header ? header.getBoundingClientRect().bottom : 0, toolbar.getBoundingClientRect().bottom) + 8;
  var clipTop = Math.max(0, Math.ceil(safeTop - list.getBoundingClientRect().top));
  var clip = 'inset(' + clipTop + 'px 0px 0px)';
  if (list.style.clipPath !== clip) list.style.clipPath = clip;
}
function playlistCatalogScrollTarget(panel, key) {
  var list = document.getElementById('pl-list');
  var cache = playlistPanelBuildVirtualEntries();
  var index = cache.entries.findIndex(function (entry) {
    return entry.type === 'card' && playlistPanelKey(normalizePlaylistProvider(entry.pl.provider), entry.pl.id) === key;
  });
  if (!list || index < 0) return null;
  var contentTop = panel.scrollTop + list.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  var target = contentTop + cache.offsets[index] - playlistPanelTopInset(panel);
  target = Math.max(0, Math.min(target, Math.max(0, panel.scrollHeight - panel.clientHeight)));
  var originalTop = panel.scrollTop;
  // Mount the destination and measure before yielding a frame. Restore the
  // current viewport synchronously so the user only sees the eased movement.
  try {
    panel.scrollTop = target;
    renderUserPlaylistsList({ animate: false, preserveScroll: true });
    var anchor = Array.prototype.find.call(panel.querySelectorAll('.pl-card[data-playlist-id]'), function (card) {
      return playlistPanelKey(card.getAttribute('data-playlist-provider'), card.getAttribute('data-playlist-id')) === key;
    });
    if (anchor) {
      var header = panel.querySelector('.playlist-panel-sticky');
      var toolbar = panel.querySelector('#pl-pane .queue-toolbar');
      var bottom = Math.max(header ? header.getBoundingClientRect().bottom : 0, toolbar ? toolbar.getBoundingClientRect().bottom : 0);
      // Client rectangles include panel zoom/scale; scrollTop uses layout pixels.
      var scale = panel.getBoundingClientRect().height / panel.offsetHeight || 1;
      target = panel.scrollTop + (anchor.getBoundingClientRect().top - bottom - 8) / scale;
    }
  } finally {
    panel.scrollTop = originalTop;
    renderUserPlaylistsList({ animate: false, preserveScroll: true });
  }
  return Math.max(0, Math.min(target, Math.max(0, panel.scrollHeight - panel.clientHeight)));
}
function animatePlaylistCatalogToTop(key) {
  var panel = document.getElementById('playlist-panel');
  if (!panel) return;
  cancelPlaylistReturnMotion();
  var target = playlistCatalogScrollTarget(panel, key);
  if (target === null) return;
  if (typeof panel.__syncSmoothWheelTarget === 'function') panel.__syncSmoothWheelTarget(panel.scrollTop);
  var job = { panel: panel, key: key, tween: null, raf: 0 };
  playlistReturnMotion = job;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var duration = Math.max(0.3, Math.min(0.5, 0.3 + Math.abs(panel.scrollTop - target) / 10000));
  function complete() {
    if (playlistReturnMotion !== job) return;
    playlistPanelDetailState.scrollTop = 0;
    schedulePlaylistPanelVirtualRender();
    cancelPlaylistReturnMotion();
  }
  if (reduced) { panel.scrollTop = target; complete(); return; }
  if (window.gsap) {
    window.gsap.killTweensOf(panel);
    job.tween = window.gsap.to(panel, { scrollTop: target, duration: duration, ease: 'power3.out', overwrite: true, onComplete: complete });
  } else {
    var start = panel.scrollTop, started = performance.now();
    function frame(now) {
      if (playlistReturnMotion !== job) return;
      var t = Math.min(1, (now - started) / (duration * 1000));
      panel.scrollTop = start + (target - start) * (1 - Math.pow(1 - t, 4));
      if (t < 1) job.raf = requestAnimationFrame(frame);
      else complete();
    }
    job.raf = requestAnimationFrame(frame);
  }
}
document.addEventListener('DOMContentLoaded', function () {
  var panel = document.getElementById('playlist-panel');
  if (!panel) return;
  var clipFrame = 0;
  function scheduleClip() {
    if (clipFrame) return;
    clipFrame = requestAnimationFrame(function () { clipFrame = 0; syncPlaylistPanelContentClip(panel); });
  }
  panel.addEventListener('scroll', scheduleClip, { passive: true });
  ['wheel', 'touchstart', 'pointerdown'].forEach(function (event) {
    panel.addEventListener(event, cancelPlaylistReturnMotion, { passive: true });
  });
  panel.addEventListener('keydown', function (event) {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].indexOf(event.key) >= 0) cancelPlaylistReturnMotion();
  });
  if (window.ResizeObserver) {
    var observer = new ResizeObserver(function () { playlistPanelTopInset(panel); scheduleClip(); });
    var header = panel.querySelector('.playlist-panel-sticky');
    if (header) observer.observe(header);
    var toolbar = panel.querySelector('#pl-pane .queue-toolbar');
    if (toolbar) observer.observe(toolbar);
  }
  new MutationObserver(function () {
    if (panel.classList.contains('playlist-panel-closing') || !panel.classList.contains('show') && !panel.classList.contains('peek')) cancelPlaylistReturnMotion();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  playlistPanelTopInset(panel);
  scheduleClip();
});
