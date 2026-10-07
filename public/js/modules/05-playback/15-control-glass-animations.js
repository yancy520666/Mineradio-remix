var controlGlassState = {
  key: '',
  searchBoxKey: '',
  searchPillKey: '',
  accountPillKey: '',
  dwmGeometryKey: '',
  dwmGeometryLastAt: 0,
  dwmGeometryTimer: 0,
  dwmGeometryAnimationToken: 0
};
var CONTROL_GLASS_BASE_SHIFT_X = -90;
var CONTROL_GLASS_CHROMA_MAX_SPREAD = 22;
function normalizeControlGlassChromaticOffset(value) {
  var n = Number(value);
  if (!isFinite(n)) n = fxDefaults.controlGlassChromaticOffset;
  return clampRange(n, 30, 140);
}
function formatGlassFilterNumber(value) {
  var n = Math.round((Number(value) || 0) * 100) / 100;
  if (Math.abs(n) < 0.005) n = 0;
  return String(n);
}
function setControlGlassChannelOffset(filter, result, dx, dy) {
  var node = filter && filter.querySelector ? filter.querySelector('feOffset[result="' + result + '"]') : null;
  if (!node) return;
  node.setAttribute('dx', formatGlassFilterNumber(dx));
  node.setAttribute('dy', formatGlassFilterNumber(dy));
}
function applyControlGlassChromaticOffsetToFilter(filter, baseShiftX, maxSpread, verticalFactor) {
  if (!filter || !fx) return;
  var chroma = fx.controlGlassChromaticOffset / 140;
  var spread = maxSpread * chroma;
  var verticalSpread = spread * (verticalFactor == null ? 0.08 : verticalFactor);
  setControlGlassChannelOffset(filter, 'dispRedShifted', baseShiftX - spread, -verticalSpread);
  setControlGlassChannelOffset(filter, 'dispGreenShifted', baseShiftX, 0);
  setControlGlassChannelOffset(filter, 'dispBlueShifted', baseShiftX + spread, verticalSpread);
}
function applyControlGlassChromaticOffset() {
  if (!fx) return;
  fx.controlGlassChromaticOffset = normalizeControlGlassChromaticOffset(fx.controlGlassChromaticOffset);
  applyControlGlassChromaticOffsetToFilter(
    document.getElementById('mineradio-control-glass-filter'),
    CONTROL_GLASS_BASE_SHIFT_X,
    CONTROL_GLASS_CHROMA_MAX_SPREAD,
    0.08
  );
}
function supportsControlGlassSvgFilter() {
  try {
    var ua = navigator.userAgent || '';
    if ((/Safari/.test(ua) && !/Chrome/.test(ua)) || /Firefox/.test(ua)) return false;
    var div = document.createElement('div');
    div.style.backdropFilter = 'url(#mineradio-control-glass-filter)';
    return div.style.backdropFilter !== '';
  } catch (e) {
    return false;
  }
}
function generateControlGlassDisplacementMap(width, height, radius) {
  width = Math.max(240, Math.round(width || 400));
  height = Math.max(48, Math.round(height || 92));
  radius = Math.max(12, Math.round(radius || 50));
  var borderWidth = 0.07;
  var edge = Math.min(width, height) * (borderWidth * 0.5);
  var innerW = Math.max(1, width - edge * 2);
  var innerH = Math.max(1, height - edge * 2);
  var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="glass-red" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
    '<linearGradient id="glass-blue" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="black"/>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#glass-red)"/>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#glass-blue)" style="mix-blend-mode:difference"/>' +
    '<rect x="' + edge.toFixed(2) + '" y="' + edge.toFixed(2) + '" width="' + innerW.toFixed(2) + '" height="' + innerH.toFixed(2) + '" rx="' + radius + '" fill="hsl(0 0% 50% / 1)" style="filter:blur(11px)"/>' +
    '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function generateAccountPillGlassDisplacementMap(width, height, radius, minWidth, minHeight) {
  minWidth = Math.max(1, Math.round(minWidth || 180));
  minHeight = Math.max(1, Math.round(minHeight || 44));
  width = Math.max(minWidth, Math.round(width || 220));
  height = Math.max(minHeight, Math.round(height || 44));
  radius = Math.max(20, Math.round(radius || height / 2));
  var edge = Math.min(width, height) * 0.09;
  var innerW = Math.max(1, width - edge * 2);
  var innerH = Math.max(1, height - edge * 2);
  var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="account-x" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%" stop-color="rgb(112,128,128)"/>' +
    '<stop offset="13%" stop-color="rgb(150,128,128)"/>' +
    '<stop offset="42%" stop-color="rgb(128,128,128)"/>' +
    '<stop offset="72%" stop-color="rgb(120,128,128)"/>' +
    '<stop offset="100%" stop-color="rgb(144,128,128)"/>' +
    '</linearGradient>' +
    '<filter id="account-soft" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>' +
    '</defs>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="rgb(128,128,128)"/>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#account-x)" filter="url(#account-soft)" opacity=".82"/>' +
    '<rect x="' + edge.toFixed(2) + '" y="' + edge.toFixed(2) + '" width="' + innerW.toFixed(2) + '" height="' + innerH.toFixed(2) + '" rx="' + Math.max(1, radius - edge).toFixed(2) + '" fill="rgb(128,128,128)" opacity=".36"/>' +
    '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function generateSearchBoxGlassDisplacementMap(width, height, radius) {
  return generateControlGlassDisplacementMap(width, height, radius);
}
function generateSearchPillGlassDisplacementMap(width, height, radius) {
  return generateControlGlassDisplacementMap(width, height, radius);
}
function glassImageHasHref(img) {
  if (!img) return false;
  var href = img.getAttribute('href') || '';
  try { href = href || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''; } catch (e) { }
  return !!href;
}
function setSearchGlassReady(ready) {
  var on = !!ready;
  document.documentElement.classList.toggle('search-glass-ready', on);
  if (on) document.documentElement.classList.remove('search-glass-priming', 'search-glass-fallback');
  var area = document.getElementById('search-area');
  if (area) {
    area.classList.toggle('search-glass-ready', on);
    if (on) area.classList.remove('search-glass-priming', 'search-glass-fallback');
  }
}
function setSearchGlassPriming(priming) {
  var on = !!priming;
  document.documentElement.classList.toggle('search-glass-priming', on);
  var area = document.getElementById('search-area');
  if (area) area.classList.toggle('search-glass-priming', on);
}
function setSearchGlassFallback(fallback) {
  var on = !!fallback;
  document.documentElement.classList.toggle('search-glass-fallback', on);
  var area = document.getElementById('search-area');
  if (area) area.classList.toggle('search-glass-fallback', on);
}
function queueSearchGlassReadyAfterPaint(force) {
  if (!glassImageHasHref(document.getElementById('search-box-glass-map'))) {
    controlGlassState.searchReadyToken = (controlGlassState.searchReadyToken || 0) + 1;
    setSearchGlassReady(false);
    setSearchGlassPriming(false);
    return false;
  }
  if (!force && document.documentElement.classList.contains('search-glass-ready')) return true;
  if (document.documentElement.classList.contains('search-glass-priming')) return false;
  var token = (controlGlassState.searchReadyToken || 0) + 1;
  controlGlassState.searchReadyToken = token;
  setSearchGlassFallback(false);
  setSearchGlassReady(false);
  setSearchGlassPriming(true);
  var frames = 3;
  function waitFrame() {
    if (controlGlassState.searchReadyToken !== token) return;
    if (!glassImageHasHref(document.getElementById('search-box-glass-map'))) {
      setSearchGlassReady(false);
      setSearchGlassPriming(false);
      return;
    }
    frames -= 1;
    if (frames <= 0) {
      setSearchGlassReady(true);
      return;
    }
    requestAnimationFrame(waitFrame);
  }
  requestAnimationFrame(waitFrame);
  return false;
}
function syncSearchGlassReadyState(waitForPaint, forcePaint) {
  var ready = glassImageHasHref(document.getElementById('search-box-glass-map'));
  if (ready && waitForPaint) return queueSearchGlassReadyAfterPaint(forcePaint);
  if (!ready) setSearchGlassPriming(false);
  setSearchGlassReady(ready);
  return ready;
}
function updateGlassDisplacementMapForElement(el, img, stateKey, generator) {
  if (!el || !img) return false;
  var rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  var radius = parseFloat(getComputedStyle(el).borderRadius) || 24;
  var key = Math.round(rect.width) + 'x' + Math.round(rect.height) + ':' + Math.round(radius);
  if (key === controlGlassState[stateKey] && glassImageHasHref(img)) return true;
  controlGlassState[stateKey] = key;
  var href = (generator || generateControlGlassDisplacementMap)(rect.width, rect.height, radius);
  img.setAttribute('href', href);
  try { img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); } catch (e) { }
  return true;
}
function updateControlGlassDisplacementMap() {
  return updateGlassDisplacementMapForElement(
    document.getElementById('bottom-bar'),
    document.getElementById('control-glass-map'),
    'key'
  );
}

function syncWallpaperEngineGlassSamplerGeometry(rect, radius, visible, active) {
  var sampler = document.getElementById('wallpaper-engine-glass-sampler');
  if (!sampler || !rect) return false;
  var valid = active === true && rect.width >= 2 && rect.height >= 2;
  sampler.classList.toggle('bar-visible', valid && visible === true);
  if (!valid) return false;
  sampler.style.left = rect.left.toFixed(3) + 'px';
  sampler.style.top = rect.top.toFixed(3) + 'px';
  sampler.style.width = rect.width.toFixed(3) + 'px';
  sampler.style.height = rect.height.toFixed(3) + 'px';
  sampler.style.setProperty('--wallpaper-engine-glass-radius', Math.max(0, radius).toFixed(3) + 'px');
  var video = document.getElementById('wallpaper-engine-glass-sampler-video');
  if (video) {
    video.style.left = (-rect.left).toFixed(3) + 'px';
    video.style.top = (-rect.top).toFixed(3) + 'px';
    video.style.width = Math.max(2, window.innerWidth).toFixed(3) + 'px';
    video.style.height = Math.max(2, window.innerHeight).toFixed(3) + 'px';
  }
  return true;
}

function syncWallpaperEngineControlGlassSurface(force) {
  var api = window.desktopWindow;
  var bar = document.getElementById('bottom-bar');
  var sessionId = typeof wallpaperEngineNativeSessionId !== 'undefined'
    ? String(wallpaperEngineNativeSessionId || '') : '';
  if (!bar || !api || typeof api.updateWallpaperEngineGlassSurface !== 'function'
    || !/^[a-f0-9]{24}$/i.test(sessionId)) return false;
  var now = performance.now();
  if (!force && now - controlGlassState.dwmGeometryLastAt < 30) {
    if (!controlGlassState.dwmGeometryTimer) {
      controlGlassState.dwmGeometryTimer = setTimeout(function () {
        controlGlassState.dwmGeometryTimer = 0;
        syncWallpaperEngineControlGlassSurface(true);
      }, 32);
    }
    return false;
  }
  var rect = bar.getBoundingClientRect();
  var style = getComputedStyle(bar);
  var dwmMode = document.body.classList.contains('wallpaper-engine-dwm-active');
  var visible = dwmMode
    && bar.classList.contains('visible')
    && !bar.classList.contains('soft-hidden')
    && !document.body.classList.contains('home-controls-locked')
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || 0) > 0.01
    && rect.right > 0 && rect.bottom > 0
    && rect.left < window.innerWidth && rect.top < window.innerHeight;
  var radius = parseFloat(style.borderRadius) || Math.min(rect.height / 2, 50);
  var surfaceActive = dwmMode
    && style.display !== 'none'
    && rect.width >= 2 && rect.height >= 2
    && rect.right > 0 && rect.bottom > 0
    && rect.left < window.innerWidth && rect.top < window.innerHeight;
  syncWallpaperEngineGlassSamplerGeometry(rect, radius, visible, surfaceActive);
  var geometryKey = [
    sessionId,
    surfaceActive ? 1 : 0,
    Math.round(rect.left * 10),
    Math.round(rect.top * 10),
    Math.round(rect.width * 10),
    Math.round(rect.height * 10),
    Math.round(radius * 10),
    Math.round(window.innerWidth * 10),
    Math.round(window.innerHeight * 10)
  ].join(':');
  if (!force && geometryKey === controlGlassState.dwmGeometryKey) return true;
  controlGlassState.dwmGeometryKey = geometryKey;
  controlGlassState.dwmGeometryLastAt = now;
  api.updateWallpaperEngineGlassSurface({
    sessionId: sessionId,
    active: surfaceActive,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: radius,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
  return true;
}

function animateWallpaperEngineControlGlassSurface(duration) {
  var token = ++controlGlassState.dwmGeometryAnimationToken;
  var deadline = performance.now() + Math.max(0, Number(duration) || 0);
  function tick() {
    if (token !== controlGlassState.dwmGeometryAnimationToken) return;
    syncWallpaperEngineControlGlassSurface(false);
    if (performance.now() < deadline) requestAnimationFrame(tick);
    else syncWallpaperEngineControlGlassSurface(true);
  }
  requestAnimationFrame(tick);
}
function updateSearchBoxGlassDisplacementMap() {
  var img = document.getElementById('search-box-glass-map');
  var previousKey = controlGlassState.searchBoxKey;
  var hadHref = glassImageHasHref(img);
  var ready = updateGlassDisplacementMapForElement(
    document.getElementById('search-box'),
    img,
    'searchBoxKey',
    generateSearchBoxGlassDisplacementMap
  );
  var changed = ready && (controlGlassState.searchBoxKey !== previousKey || !hadHref);
  if (ready && document.documentElement.classList.contains('search-glass-priming')) return ready;
  syncSearchGlassReadyState(changed, changed);
  return ready;
}
function updateSearchPillGlassDisplacementMap() {
  var img = document.getElementById('search-pill-glass-map');
  if (!img) return false;
  var nodes = Array.prototype.slice.call(document.querySelectorAll('.search-mode-tabs button,.search-history-chip'));
  var maxW = 0, maxH = 0, maxRadius = 14;
  nodes.forEach(function (el) {
    if (!el) return;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    maxW = Math.max(maxW, rect.width);
    maxH = Math.max(maxH, rect.height);
    maxRadius = Math.max(maxRadius, parseFloat(getComputedStyle(el).borderRadius) || Math.round(rect.height / 2) || 14);
  });
  if (maxW < 2 || maxH < 2) {
    maxW = 96;
    maxH = 32;
    maxRadius = 14;
  }
  var width = Math.max(96, Math.round(maxW));
  var height = Math.max(32, Math.round(maxH));
  var radius = Math.max(12, Math.min(Math.round(maxRadius), Math.round(height / 2) + 10));
  var key = width + 'x' + height + ':' + radius;
  if (key === controlGlassState.searchPillKey && glassImageHasHref(img)) return true;
  controlGlassState.searchPillKey = key;
  var href = generateSearchPillGlassDisplacementMap(width, height, radius);
  img.setAttribute('href', href);
  try { img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); } catch (e) { }
  return true;
}
function updateAccountPillGlassDisplacementMap() {
  var img = document.getElementById('account-pill-glass-map');
  if (!img) return;
  var nodes = Array.prototype.slice.call(document.querySelectorAll('.top-account-pill'));
  if (!nodes.length) return;
  var maxW = 0, maxH = 0, maxRadius = 24;
  nodes.forEach(function (el) {
    if (!el || el.offsetParent === null) return;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    maxW = Math.max(maxW, rect.width);
    maxH = Math.max(maxH, rect.height);
    maxRadius = Math.max(maxRadius, parseFloat(getComputedStyle(el).borderRadius) || Math.round(rect.height / 2) || 24);
  });
  if (maxW < 2 || maxH < 2) return;
  var width = Math.max(180, Math.round(maxW));
  var height = Math.max(44, Math.round(maxH));
  var radius = Math.max(20, Math.min(Math.round(maxRadius), Math.round(height / 2) + 8));
  var key = width + 'x' + height + ':' + radius;
  if (key === controlGlassState.accountPillKey) return;
  controlGlassState.accountPillKey = key;
  var href = generateAccountPillGlassDisplacementMap(width, height, radius);
  img.setAttribute('href', href);
  try { img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); } catch (e) { }
}
function prepareSearchGlassBeforePeek() {
  if (!document.documentElement.classList.contains('control-glass-svg-ok')) return true;
  setSearchGlassFallback(false);
  var ready = updateSearchBoxGlassDisplacementMap();
  updateSearchPillGlassDisplacementMap();
  if (!ready || !glassImageHasHref(document.getElementById('search-box-glass-map'))) {
    setSearchGlassPriming(false);
    setSearchGlassFallback(true);
    return true;
  }
  if (document.documentElement.classList.contains('search-glass-ready')) return true;
  return syncSearchGlassReadyState(true, false);
}
function initControlGlassSurface() {
  if (supportsControlGlassSvgFilter()) document.documentElement.classList.add('control-glass-svg-ok');
  applyControlGlassChromaticOffset();
  updateControlGlassDisplacementMap();
  prepareSearchGlassBeforePeek();
  requestAnimationFrame(prepareSearchGlassBeforePeek);
  setTimeout(prepareSearchGlassBeforePeek, 140);
  updateAccountPillGlassDisplacementMap();
  var bar = document.getElementById('bottom-bar');
  var searchBox = document.getElementById('search-box');
  var searchTabs = document.getElementById('search-mode-tabs');
  var searchResults = document.getElementById('search-results');
  var userBtn = document.getElementById('user-btn');
  if (window.ResizeObserver && (bar || searchBox || searchTabs || searchResults || userBtn)) {
    var ro = new ResizeObserver(function () {
      requestAnimationFrame(updateControlGlassDisplacementMap);
      requestAnimationFrame(syncWallpaperEngineControlGlassSurface);
      requestAnimationFrame(updateSearchBoxGlassDisplacementMap);
      requestAnimationFrame(updateSearchPillGlassDisplacementMap);
      requestAnimationFrame(updateAccountPillGlassDisplacementMap);
    });
    if (bar) ro.observe(bar);
    if (searchBox) ro.observe(searchBox);
    if (searchTabs) ro.observe(searchTabs);
    if (searchResults) ro.observe(searchResults);
    if (userBtn) ro.observe(userBtn);
  }
  if (window.MutationObserver && bar) {
    var barObserver = new MutationObserver(function () {
      animateWallpaperEngineControlGlassSurface(520);
    });
    barObserver.observe(bar, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  if (window.MutationObserver && (searchTabs || searchResults || userBtn)) {
    var mo = new MutationObserver(function () {
      requestAnimationFrame(updateSearchPillGlassDisplacementMap);
      requestAnimationFrame(updateAccountPillGlassDisplacementMap);
    });
    if (searchTabs) mo.observe(searchTabs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    if (searchResults) mo.observe(searchResults, { childList: true, subtree: true });
    if (userBtn) mo.observe(userBtn, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('resize', function () {
    requestAnimationFrame(updateControlGlassDisplacementMap);
    animateWallpaperEngineControlGlassSurface(520);
    requestAnimationFrame(updateSearchBoxGlassDisplacementMap);
    requestAnimationFrame(updateSearchPillGlassDisplacementMap);
    requestAnimationFrame(updateAccountPillGlassDisplacementMap);
  });
  if (bar) {
    bar.addEventListener('transitionrun', function () {
      animateWallpaperEngineControlGlassSurface(520);
    });
    bar.addEventListener('transitionend', function () {
      syncWallpaperEngineControlGlassSurface(true);
    });
  }
}

function bindPlayerControlAnimations() {
  if (!window.gsap) return;
  document.querySelectorAll('#bottom-bar .ctrl-btn').forEach(function (btn) {
    if (!btn || btn.dataset.controlAnimBound === '1') return;
    btn.dataset.controlAnimBound = '1';
    var isPlay = btn.id === 'play-btn';
    var iconTarget = btn.querySelector('svg,.lyrics-word-icon,#quality-btn-label');
    function canAnimate() {
      return !btn.disabled && !btn.classList.contains('busy');
    }
    function hoverIn(e) {
      if (!canAnimate() || (e && e.pointerType === 'touch')) return;
      window.gsap.to(btn, { y: -2, scale: isPlay ? 1.07 : 1.08, duration: 0.20, ease: 'power2.out', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: isPlay ? 1.08 : 1.10, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
    }
    function hoverOut() {
      window.gsap.to(btn, { y: 0, scale: 1, rotate: 0, duration: 0.26, ease: 'power2.out', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: 1, rotate: 0, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
    }
    function pressDown(e) {
      if (!canAnimate()) return;
      if (!aeroWaterThemeOn()) {
        window.gsap.to(btn, { y: 0, scale: isPlay ? 0.91 : 0.90, duration: 0.10, ease: 'power2.out', overwrite: 'auto' });
        if (iconTarget) window.gsap.to(iconTarget, { scale: 0.88, duration: 0.10, ease: 'power2.out', overwrite: 'auto' });
        return;
      }
      // Aero water theme: jelly squash while held, then an elastic wobble on release.
      window.gsap.to(btn, { y: 1, scaleX: isPlay ? 1.06 : 1.08, scaleY: isPlay ? 0.86 : 0.84, duration: 0.09, ease: 'power2.out', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: 0.9, duration: 0.09, ease: 'power2.out', overwrite: 'auto' });
      var p = aeroWaterPointFor(btn, e);
      spawnAeroWaterSplash(p.x, p.y, isPlay ? 1 : 0.6, document.getElementById('bottom-bar'));
    }
    function release(e) {
      if (!canAnimate()) return;
      var hovered = e && e.pointerType !== 'touch' && btn.matches(':hover');
      var settle = hovered ? (isPlay ? 1.07 : 1.08) : 1;
      if (!aeroWaterThemeOn()) {
        window.gsap.to(btn, { y: hovered ? -2 : 0, scale: settle, duration: 0.24, ease: 'back.out(1.9)', overwrite: 'auto' });
        if (iconTarget) window.gsap.to(iconTarget, { scale: hovered ? 1.06 : 1, duration: 0.22, ease: 'back.out(1.8)', overwrite: 'auto' });
        return;
      }
      window.gsap.to(btn, { y: hovered ? -2 : 0, scaleX: settle, scaleY: settle, duration: 0.7, ease: 'elastic.out(1.15, 0.32)', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: hovered ? 1.06 : 1, duration: 0.6, ease: 'elastic.out(1.1, 0.38)', overwrite: 'auto' });
    }
    function clickPulse() {
      if (!canAnimate() || btn.id === 'play-mode-btn') return;
      var pulseSize = isPlay ? 18 : 10;
      var pulseColor = isPlay ? 'rgba(255,63,85,.34)' : 'rgba(255,255,255,.22)';
      window.gsap.killTweensOf(btn, 'boxShadow');
      window.gsap.fromTo(btn,
        { boxShadow: '0 0 0 0 ' + pulseColor },
        { boxShadow: '0 0 0 ' + pulseSize + 'px rgba(255,63,85,0)', duration: isPlay ? 0.58 : 0.42, ease: 'sine.out', overwrite: false, onComplete: function () { window.gsap.set(btn, { clearProps: 'boxShadow' }); } }
      );
      if (iconTarget) window.gsap.fromTo(iconTarget, { rotate: isPlay ? 0 : -5 }, { rotate: 0, duration: 0.34, ease: 'elastic.out(1,0.55)', overwrite: 'auto' });
    }
    btn.addEventListener('pointerenter', hoverIn);
    btn.addEventListener('pointerleave', hoverOut);
    btn.addEventListener('pointercancel', hoverOut);
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('pointerdown', pressDown);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('click', clickPulse);
    btn.addEventListener('focus', function () { hoverIn(); });
    btn.addEventListener('blur', hoverOut);
  });
}

function clearPlayerControlFocusState(reason) {
  try {
    document.querySelectorAll('#bottom-bar .ctrl-btn').forEach(function (btn) {
      if (!btn) return;
      if (document.activeElement === btn) btn.blur();
      btn.classList.remove('focus-visible');
      if (window.gsap) {
        window.gsap.killTweensOf(btn);
        window.gsap.set(btn, { y: 0, scale: 1, rotate: 0, clearProps: 'boxShadow' });
        var iconTarget = btn.querySelector('svg,.lyrics-word-icon,#quality-btn-label');
        if (iconTarget) {
          window.gsap.killTweensOf(iconTarget);
          window.gsap.set(iconTarget, { scale: 1, rotate: 0 });
        }
      } else {
        btn.style.transform = '';
        btn.style.boxShadow = '';
      }
    });
  } catch (e) {
    console.warn('[ControlFocusClear]', reason || 'unknown', e);
  }
}

// ---------- Aero water: tinted liquid glass and press effects ----------
// Three palettes, each with its own press effect:
//   clear (水色快门)  water sparks, the crackle of a camera flash pan in clear water light
//   cyan  (白昼流星)  green meteor streaks crossing the surface from top right to bottom left
//   blue  (夏末雨)  raindrops falling into water and spreading ripples
// Effects draw into canvases created ahead of time and placed with transform; each
// draws only while alive. The glass tint and water light are compositor animations.
var AERO_WATER_PALETTES = {
  clear: { label: '水色快门（透明）', head: '255,255,255', body: '238,244,255', glow: '214,228,255' },
  cyan: { label: '白昼流星（青）', head: '228,255,244', body: '130,255,205', glow: '46,232,162' },
  blue: { label: '夏末雨（蓝）', head: '236,246,255', body: '154,206,255', glow: '82,150,255' }
};
var AERO_WATER_KINDS = {
  burst: { w: 560, h: 520, pool: 4 },
  surface: { w: 1240, h: 280, pool: 3 }
};
var AERO_WATER_SURFACE_MARGIN = 40, AERO_WATER_BURST_UP = 340, AERO_WATER_MAX_PARTS = 90;
var aeroWater = { pools: { burst: [], surface: [] }, counts: { burst: 0, surface: 0 }, effects: [], raf: 0, last: 0, warmed: false };
function aeroWaterThemeOn() {
  return !!(typeof fx !== 'undefined' && fx && fx.aeroWaterTheme === true);
}
function aeroWaterPaletteKey() {
  var value = typeof fx !== 'undefined' && fx ? fx.aeroWaterPalette : '';
  return typeof normalizeAeroWaterPalette === 'function' ? normalizeAeroWaterPalette(value) : (AERO_WATER_PALETTES[value] ? value : 'clear');
}
function aeroWaterReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function aeroWaterEffectsEnabled() {
  if (!aeroWaterThemeOn() || aeroWaterReducedMotion()) return false;
  return !(typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode());
}
function aeroRgba(rgb, a) {
  return 'rgba(' + rgb + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
}
function aeroWaterTakeSlot(kind) {
  var spec = AERO_WATER_KINDS[kind], pool = aeroWater.pools[kind];
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (!pool.length && aeroWater.counts[kind] < spec.pool) {
    var c = document.createElement('canvas');
    c.className = 'aero-water-fx aero-water-' + kind;
    c.setAttribute('aria-hidden', 'true');
    // Decoration must never intercept player input, even before its CSS loads.
    c.style.pointerEvents = 'none';
    document.body.appendChild(c);
    aeroWater.counts[kind] += 1;
    pool.push({ kind: kind, canvas: c, ctx: c.getContext('2d'), dpr: 0 });
  }
  var slot = pool.pop();
  if (!slot) {
    // Every canvas of this kind is busy: recycle the oldest effect using one.
    for (var i = 0; i < aeroWater.effects.length; i++) {
      if (aeroWater.effects[i].slot.kind === kind) { slot = aeroWater.effects.splice(i, 1)[0].slot; break; }
    }
    if (!slot) return null;
  }
  if (slot.dpr !== dpr) {
    slot.dpr = dpr;
    slot.canvas.width = Math.round(spec.w * dpr);
    slot.canvas.height = Math.round(spec.h * dpr);
  }
  slot.ctx.setTransform(1, 0, 0, 1, 0, 0);
  slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
  return slot;
}
function aeroWaterPlaceSlot(slot, ox, oy) {
  slot.canvas.style.transform = 'translate3d(' + Math.round(ox) + 'px,' + Math.round(oy) + 'px,0)';
  slot.canvas.style.opacity = '1';
}
function aeroWaterBeginFrame(slot) {
  var spec = AERO_WATER_KINDS[slot.kind], ctx = slot.ctx;
  ctx.setTransform(slot.dpr, 0, 0, slot.dpr, 0, 0);
  if (!aeroWater.prewarming) ctx.clearRect(0, 0, spec.w, spec.h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  return ctx;
}
function aeroWaterClipToHost(ctx, h) {
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(h.x, h.y, h.w, h.h, h.r);
  else ctx.rect(h.x, h.y, h.w, h.h);
  ctx.clip();
}
// Only solid-colour strokes and fills: on Chromium's GPU canvas the first gradient or
// image draw costs a 25-40 ms stall that no prewarm reliably avoids, while solid
// draws are free. With additive blending, layered alphas read as smooth falloffs.
function drawAeroWaterGlow(ctx, x, y, size, pal, a) {
  var rings = [[1, 0.05, pal.glow], [0.58, 0.1, pal.glow], [0.3, 0.2, pal.head], [0.14, 0.32, pal.head]];
  for (var i = 0; i < rings.length; i++) {
    ctx.fillStyle = aeroRgba(rings[i][2], rings[i][1] * a);
    ctx.beginPath(); ctx.arc(x, y, size * rings[i][0], 0, Math.PI * 2); ctx.fill();
  }
}
var AERO_STREAK_STEPS = [0.1, 0.3, 0.55, 0.85];
function drawAeroWaterStreak(ctx, tx, ty, x, y, width, pal, a) {
  // Soft glow along the whole path, then a core that brightens towards the head.
  ctx.strokeStyle = aeroRgba(pal.glow, 0.2 * a);
  ctx.lineWidth = width * 3.4;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
  ctx.lineWidth = width;
  var n = AERO_STREAK_STEPS.length;
  for (var i = 0; i < n; i++) {
    var f0 = i / n, f1 = (i + 1) / n;
    ctx.strokeStyle = aeroRgba(i < n - 1 ? pal.body : pal.head, AERO_STREAK_STEPS[i] * a);
    ctx.beginPath();
    ctx.moveTo(tx + (x - tx) * f0, ty + (y - ty) * f0);
    ctx.lineTo(tx + (x - tx) * f1, ty + (y - ty) * f1);
    ctx.stroke();
  }
  ctx.fillStyle = aeroRgba(pal.head, a);
  ctx.beginPath(); ctx.arc(x, y, width * 0.75, 0, Math.PI * 2); ctx.fill();
}
function drawAeroWaterGlint(ctx, len, width, pal, a) {
  var layers = [[1, 0.22, pal.body], [0.55, 0.45, pal.head], [0.25, 0.8, pal.head]];
  ctx.lineWidth = width;
  for (var i = 0; i < layers.length; i++) {
    ctx.strokeStyle = aeroRgba(layers[i][2], layers[i][1] * a);
    ctx.beginPath(); ctx.moveTo(-len * layers[i][0], 0); ctx.lineTo(len * layers[i][0], 0); ctx.stroke();
  }
}

// --- 水色快门: water sparks ---
function makeAeroSparkEffect(slot, cx, cy, strength, pal) {
  var parts = [];
  function add(x, y, angle, speed, width, max, kind) {
    if (parts.length >= AERO_WATER_MAX_PARTS) return;
    parts.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, w: width, life: 0, max: max, kind: kind,
      phase: Math.random() * Math.PI * 2, twinkle: Math.random() < 0.6, split: kind === 'spark' && Math.random() < 0.34 });
  }
  var count = Math.round(12 + strength * 16);
  for (var i = 0; i < count; i++) {
    add(cx, cy, -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7, (260 + Math.random() * 460) * (0.7 + strength * 0.45),
      0.8 + Math.random() * 1.1, 0.26 + Math.random() * 0.34, 'spark');
  }
  // Fine spray that lingers and glints after the burst.
  for (var j = 0; j < Math.round(4 + strength * 5); j++) {
    add(cx, cy, -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4, 40 + Math.random() * 110, 0.5 + Math.random() * 0.6, 0.6 + Math.random() * 0.45, 'mist');
  }
  var flash = { life: 0, max: 0.22, size: 14 + strength * 20, spin: Math.random() * Math.PI };
  return { slot: slot, step: function (dt) {
    var ctx = aeroWaterBeginFrame(slot);
    if (flash) {
      flash.life += dt;
      var ft = flash.life / flash.max;
      if (ft >= 1) flash = null;
      else {
        drawAeroWaterGlow(ctx, cx, cy, flash.size, pal, 1 - ft);
        // A four-point glint, the "pop" of the flash pan.
        var len = flash.size * (0.9 + ft * 0.8);
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(flash.spin + ft * 0.5);
        for (var k = 0; k < 2; k++) {
          drawAeroWaterGlint(ctx, len, 1.4 * (1 - ft) + 0.3, pal, 1 - ft);
          ctx.rotate(Math.PI / 2); len *= 0.62;
        }
        ctx.restore();
      }
    }
    var born = [];
    parts = parts.filter(function (s) {
      s.life += dt;
      var t = s.life / s.max;
      if (t >= 1) return false;
      var drag = s.kind === 'mist' ? 1.4 : 3.6;
      s.vx *= Math.max(0, 1 - dt * drag);
      s.vy = s.vy * Math.max(0, 1 - dt * drag) + (s.kind === 'mist' ? 140 : 620) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.split && t > 0.42) {
        s.split = false;
        var heading = Math.atan2(s.vy, s.vx), speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        born.push([s.x, s.y, heading - 0.5 - Math.random() * 0.4, speed * 0.85, s.w * 0.7, s.max * 0.6]);
        born.push([s.x, s.y, heading + 0.5 + Math.random() * 0.4, speed * 0.85, s.w * 0.7, s.max * 0.6]);
      }
      var a = s.kind === 'mist' ? Math.sin(Math.PI * Math.min(1, t * 1.15)) : 1 - t * t;
      if (s.twinkle) a *= 0.6 + 0.4 * Math.sin(s.phase + s.life * 58);
      if (a > 0.01) {
        var tail = s.kind === 'mist' ? 0.012 : 0.034;
        drawAeroWaterStreak(ctx, s.x - s.vx * tail, s.y - s.vy * tail, s.x, s.y, s.w, pal, a);
      }
      return true;
    });
    born.forEach(function (b) { add(b[0], b[1], b[2], b[3], b[4], b[5], 'ember'); });
    return parts.length > 0 || !!flash;
  } };
}

// --- 白昼流星: meteors crossing the surface ---
function makeAeroMeteorEffect(slot, host, cx, cy, strength, pal) {
  var meteors = [];
  var count = Math.round(4 + strength * 4);
  for (var i = 0; i < count; i++) {
    // From the top-right part of the surface down-left across it.
    var angle = Math.PI - (0.2 + Math.random() * 0.14);
    var sin = Math.sin(angle), cos = Math.cos(angle);
    var x0 = host.x + host.w * (0.42 + Math.random() * 0.62);
    var y0 = host.y - 8;
    var path = (host.h + 24) / sin;
    var speed = 1050 + Math.random() * 450;
    meteors.push({ x0: x0, y0: y0, dx: cos, dy: sin, path: path + 140, speed: speed, delay: i === 0 ? 0 : i * 0.06 + Math.random() * 0.1,
      tail: 170 + Math.random() * 130, width: 1.2 + Math.random() * 0.9, life: 0 });
  }
  var flash = { life: 0, max: 0.2 };
  return { slot: slot, step: function (dt) {
    var ctx = aeroWaterBeginFrame(slot);
    if (flash) {
      flash.life += dt;
      if (flash.life >= flash.max) flash = null;
      else drawAeroWaterGlow(ctx, cx, cy, 12 + strength * 14, pal, 1 - flash.life / flash.max);
    }
    aeroWaterClipToHost(ctx, host);
    meteors = meteors.filter(function (m) {
      m.life += dt;
      var t = m.life - m.delay;
      if (t < 0) return true;
      var dist = t * m.speed;
      if (dist - m.tail > m.path) return false;
      var hx = m.x0 + m.dx * dist, hy = m.y0 + m.dy * dist;
      var back = Math.min(dist, m.tail);
      var a = Math.min(1, t * 14) * (1 - Math.max(0, (dist - m.path * 0.7) / (m.path * 0.3 + m.tail)));
      drawAeroWaterStreak(ctx, hx - m.dx * back, hy - m.dy * back, hx, hy, m.width, pal, Math.max(0, a));
      return true;
    });
    ctx.restore();
    return meteors.length > 0 || !!flash;
  } };
}

// --- 夏末雨: raindrops falling into water ---
function makeAeroRippleEffect(slot, host, cx, cy, strength, pal) {
  var drops = [];
  function addDrop(x, y, delay, size) {
    drops.push({ x: x, y: y, delay: delay, size: size, life: 0, fall: delay > 0 ? 0.12 : 0,
      crown: [], rings: [0, 0.1, 0.2].map(function (d) { return { delay: d }; }) });
  }
  addDrop(cx, cy, 0, 34 + strength * 30);
  var extra = Math.round(2 + strength * 3);
  for (var i = 0; i < extra; i++) {
    addDrop(host.x + host.w * (0.06 + Math.random() * 0.88), host.y + host.h * (0.3 + Math.random() * 0.5),
      0.12 + Math.random() * 0.62, 14 + Math.random() * 14);
  }
  drops.forEach(function (d) {
    var n = d.size > 30 ? 7 : 3;
    for (var k = 0; k < n; k++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      var sp = (d.size > 30 ? 120 : 70) + Math.random() * 90;
      d.crown.push({ x: 0, y: 0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.8 });
    }
  });
  var RING_LIFE = 0.95;
  return { slot: slot, step: function (dt) {
    var ctx = aeroWaterBeginFrame(slot);
    aeroWaterClipToHost(ctx, host);
    var alive = false;
    drops.forEach(function (d) {
      d.life += dt;
      var t = d.life - d.delay;
      if (t < 0) { alive = true; return; }
      if (t < d.fall) {
        // The falling drop: a short bright streak dropping onto the surface.
        var p = t / d.fall, fy = d.y - 46 * (1 - p);
        drawAeroWaterStreak(ctx, d.x, fy - 14, d.x, fy, 1.2, pal, 0.85);
        alive = true;
        return;
      }
      var after = t - d.fall;
      if (after < 0.18) drawAeroWaterGlow(ctx, d.x, d.y, d.size * 0.42, pal, 1 - after / 0.18);
      d.rings.forEach(function (ring) {
        var rt = (after - ring.delay) / RING_LIFE;
        if (rt < 0 || rt >= 1) { if (rt < 0) alive = true; return; }
        alive = true;
        var ease = 1 - Math.pow(1 - rt, 3);
        var rx = 2 + d.size * ease, ry = rx * 0.42;
        var a = Math.pow(1 - rt, 1.4);
        ctx.strokeStyle = aeroRgba(pal.glow, 0.22 * a);
        ctx.lineWidth = 3.2 * (1 - rt) + 0.6;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        // Light catching the near edge of each ring.
        ctx.strokeStyle = aeroRgba(pal.head, 0.75 * a);
        ctx.lineWidth = 1.1 * (1 - rt) + 0.35;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, rx, ry, 0, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke();
      });
      if (after < 0.42) {
        alive = true;
        d.crown.forEach(function (c) {
          c.vy += 760 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
          ctx.fillStyle = aeroRgba(pal.head, 0.9 * (1 - after / 0.42));
          ctx.beginPath(); ctx.arc(d.x + c.x, d.y + c.y, 1.1, 0, Math.PI * 2); ctx.fill();
        });
      }
    });
    ctx.restore();
    return alive;
  } };
}

function aeroWaterHostRect(host, slotOx, slotOy) {
  var r = host.getBoundingClientRect();
  var radius = parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0;
  return { x: r.left - slotOx, y: r.top - slotOy, w: r.width, h: r.height, r: Math.min(radius, r.height / 2, r.width / 2) };
}
function spawnAeroWaterSplash(x, y, strength, host) {
  if (!aeroWaterEffectsEnabled()) return;
  strength = Math.max(0.3, Math.min(1.2, Number(strength) || 0.6));
  var key = aeroWaterPaletteKey(), pal = AERO_WATER_PALETTES[key];
  var effect = null, slot;
  if (key !== 'clear' && host) {
    slot = aeroWaterTakeSlot('surface');
    if (!slot) return;
    var r = host.getBoundingClientRect();
    var ox = r.left - AERO_WATER_SURFACE_MARGIN, oy = r.top - AERO_WATER_SURFACE_MARGIN;
    aeroWaterPlaceSlot(slot, ox, oy);
    var rect = aeroWaterHostRect(host, ox, oy);
    effect = key === 'cyan'
      ? makeAeroMeteorEffect(slot, rect, x - ox, y - oy, strength, pal)
      : makeAeroRippleEffect(slot, rect, x - ox, y - oy, strength, pal);
  } else {
    slot = aeroWaterTakeSlot('burst');
    if (!slot) return;
    var bx = x - AERO_WATER_KINDS.burst.w / 2, by = y - AERO_WATER_BURST_UP;
    aeroWaterPlaceSlot(slot, bx, by);
    effect = makeAeroSparkEffect(slot, x - bx, y - by, strength, pal);
  }
  aeroWater.effects.push(effect);
  if (!aeroWater.raf) {
    aeroWater.last = performance.now();
    aeroWater.raf = requestAnimationFrame(aeroWaterFrame);
  }
}
// Hide with opacity, not visibility: the layer stays allocated, so showing it on
// the next press costs nothing on the compositor side.
function aeroWaterReleaseSlot(slot) {
  slot.canvas.style.opacity = '0';
  aeroWater.pools[slot.kind].push(slot);
}
function aeroWaterFrame(now) {
  var dt = Math.min(0.05, Math.max(0, (now - aeroWater.last) / 1000));
  aeroWater.last = now;
  aeroWater.effects = aeroWater.effects.filter(function (effect) {
    var alive = effect.step(dt);
    effect.slot.ctx.globalCompositeOperation = 'source-over';
    if (!alive) aeroWaterReleaseSlot(effect.slot);
    return alive;
  });
  aeroWater.raf = aeroWater.effects.length ? requestAnimationFrame(aeroWaterFrame) : 0;
}
// Create every canvas and draw one invisible frame of each effect on it, so the
// GPU initialises canvases and compiles gradient/blend shaders before any click.
function prewarmAeroWaterCanvases() {
  if (!aeroWaterThemeOn() || aeroWater.warmed) return;
  aeroWater.warmed = true;
  var slots = [];
  ['burst', 'surface'].forEach(function (kind) {
    for (var i = 0; i < AERO_WATER_KINDS[kind].pool; i++) {
      var slot = aeroWaterTakeSlot(kind);
      if (!slot) break;
      slots.push(slot);
    }
  });
  // Without per-step clears every draw operation reaches the GPU in one frame;
  // a full clear would let the canvas discard the earlier commands unrasterised.
  aeroWater.prewarming = true;
  slots.forEach(function (slot) {
    // Same compositing path as a real press (layer fully opaque), but the strokes
    // themselves are drawn at near-zero alpha so nothing is visible.
    slot.canvas.style.opacity = '1';
    slot.ctx.globalAlpha = 0.01;
    var host = { x: 40, y: 40, w: 600, h: 100, r: 40 };
    Object.keys(AERO_WATER_PALETTES).forEach(function (key) {
      var pal = AERO_WATER_PALETTES[key];
      var probes = slot.kind === 'burst'
        ? [makeAeroSparkEffect(slot, 280, 340, 0.4, pal)]
        : [makeAeroMeteorEffect(slot, host, 300, 90, 0.4, pal), makeAeroRippleEffect(slot, host, 300, 90, 0.4, pal)];
      probes.forEach(function (probe) { probe.step(0.03); });
    });
    slot.ctx.globalAlpha = 1;
  });
  aeroWater.prewarming = false;
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      slots.forEach(function (slot) {
        slot.ctx.globalCompositeOperation = 'source-over';
        slot.ctx.setTransform(1, 0, 0, 1, 0, 0);
        slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
        aeroWaterReleaseSlot(slot);
      });
    });
  });
}
function applyAeroWaterTheme() {
  var on = aeroWaterThemeOn();
  var root = document.documentElement;
  root.classList.toggle('aero-water-on', on);
  root.setAttribute('data-aero-palette', aeroWaterPaletteKey());
  var seg = document.getElementById('aero-water-palette-seg');
  if (seg) seg.hidden = !on;
  if (on && !aeroWater.warmed) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(prewarmAeroWaterCanvases, { timeout: 1500 });
    else setTimeout(prewarmAeroWaterCanvases, 300);
  }
  document.querySelectorAll('[data-aero-water-bound="1"]').forEach(function (el) {
    if (el.__aeroWaterDrift) el.__aeroWaterDrift();
  });
}
function setAeroWaterPalette(value) {
  var next = typeof normalizeAeroWaterPalette === 'function' ? normalizeAeroWaterPalette(value) : (AERO_WATER_PALETTES[value] ? value : 'clear');
  fx.aeroWaterPalette = next;
  if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'aeroWaterPalette' });
  applyAeroWaterTheme();
  document.querySelectorAll('#aero-water-palette-seg [data-aero-palette]').forEach(function (btn) {
    var active = btn.getAttribute('data-aero-palette') === next;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (typeof showToast === 'function') showToast('水光颜色：' + AERO_WATER_PALETTES[next].label);
}
function aeroWaterPointFor(el, e) {
  if (e && isFinite(e.clientX) && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
  var r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function bindAeroWaterSurface(el) {
  if (!el || el.dataset.aeroWaterBound === '1') return;
  el.dataset.aeroWaterBound = '1';
  var sheen = document.createElement('span');
  sheen.className = 'aero-sheen';
  sheen.setAttribute('aria-hidden', 'true');
  var tint = document.createElement('span');
  tint.className = 'aero-sheen-tint';
  var light = document.createElement('span');
  light.className = 'aero-sheen-light';
  sheen.appendChild(tint);
  sheen.appendChild(light);
  el.insertBefore(sheen, el.firstChild);
  var drift = null, lit = false, pending = null, frame = 0;
  function at(x, y) {
    return 'translate3d(' + Math.round(x - light.offsetWidth / 2) + 'px,' + Math.round(y - light.offsetHeight / 2) + 'px,0)';
  }
  // Slow drift along the surface while no pointer is on it (compositor-only).
  function startDrift() {
    if (drift) { drift.cancel(); drift = null; }
    if (!aeroWaterThemeOn() || lit) return;
    var w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    if (aeroWaterReducedMotion() || typeof light.animate !== 'function') {
      light.style.transform = at(w * 0.32, h * 0.18);
      return;
    }
    drift = light.animate([
      { transform: at(w * 0.14, h * 0.14), easing: 'ease-in-out' },
      { transform: at(w * 0.86, h * 0.34), easing: 'ease-in-out' },
      { transform: at(w * 0.14, h * 0.14) }
    ], { duration: 11000, iterations: Infinity });
  }
  el.__aeroWaterDrift = startDrift;
  if (typeof ResizeObserver === 'function') new ResizeObserver(function () { startDrift(); }).observe(el);
  el.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch' || !aeroWaterEffectsEnabled()) return;
    pending = e;
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      if (!pending) return;
      var r = el.getBoundingClientRect();
      if (!lit) {
        lit = true;
        if (drift) { drift.cancel(); drift = null; }
        el.classList.add('aero-lit');
      }
      light.style.transform = at(pending.clientX - r.left, pending.clientY - r.top);
    });
  }, { passive: true });
  el.addEventListener('pointerleave', function () {
    pending = null;
    if (!lit) return;
    lit = false;
    el.classList.remove('aero-lit');
    startDrift();
  });
  startDrift();
}
function initAeroWaterEffects() {
  bindAeroWaterSurface(document.getElementById('bottom-bar'));
  bindAeroWaterSurface(document.getElementById('search-box'));
  applyAeroWaterTheme();
  var searchBox = document.getElementById('search-box');
  if (searchBox) searchBox.addEventListener('pointerdown', function (e) {
    var p = aeroWaterPointFor(searchBox, e);
    spawnAeroWaterSplash(p.x, p.y, 0.45, searchBox);
  });
  document.querySelectorAll('.icon-btn').forEach(function (btn) {
    if (btn.dataset.aeroWaterPress === '1') return;
    btn.dataset.aeroWaterPress = '1';
    btn.addEventListener('pointerdown', function (e) {
      var p = aeroWaterPointFor(btn, e);
      spawnAeroWaterSplash(p.x, p.y, 0.6, btn);
    });
  });
}

// ============================================================
//  歌词
