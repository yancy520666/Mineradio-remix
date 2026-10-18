// Explorer can own wheel messages while the full player is embedded as a
// desktop child window. Offer a mouse-only fallback on existing panel blank
// space without taking song reordering or any control's pointer gesture.
var desktopDragScrollState = null;
var desktopDragScrollClick = null;
var DESKTOP_DRAG_SCROLL_PANELS = '#mini-queue-list,#search-results,#fx-panel,#playlist-panel,#track-detail-body';
var DESKTOP_DRAG_SCROLL_BLOCKED = 'button,a,input,textarea,select,option,label,[contenteditable],'
  + '[role="button"],[role="slider"],[role="switch"],[role="checkbox"],[role="radio"],'
  + '[role="textbox"],[role="combobox"],[role="tab"],[role="menuitem"],[role="listbox"],'
  + '[onclick],[onmousedown],[onpointerdown],[draggable="true"],'
  + '.queue-item[data-queue-index],.mini-queue-item[data-queue-index],.pl-card[data-playlist-index],'
  + '.audio-route-graph,#login-node-graph,.flow-port,[data-login-provider-sort],'
  + '#background-crop-stage,#cover-crop-stage,#color-lab-pop,#cover-color-pop,.color-lab-sv';

function desktopDragScrollEnabled() {
  var body = document.body;
  return !!(body && document.visibilityState !== 'hidden'
    && body.classList.contains('desktop-wallpaper-mode')
    && body.classList.contains('desktop-wallpaper-interactive')
    && !body.classList.contains('desktop-software-locked')
    && !document.pointerLockElement);
}

function desktopDragScrollStyle(element) {
  try { return window.getComputedStyle(element); } catch (_) { return null; }
}

function desktopDragScrollVisible(scroller) {
  var panel = scroller.closest(DESKTOP_DRAG_SCROLL_PANELS);
  if (!panel || !scroller.isConnected) return false;
  var rect = scroller.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.right <= 0 || rect.bottom <= 0
    || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;
  for (var element = scroller; element; element = element.parentElement) {
    var style = desktopDragScrollStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    if (element === panel) return true;
  }
  return false;
}

function desktopDragScrollContainer(target) {
  if (!target || !target.closest || target.closest(DESKTOP_DRAG_SCROLL_BLOCKED)) return null;
  var panel = target.closest(DESKTOP_DRAG_SCROLL_PANELS);
  if (!panel) return null;
  // A text-selectable diagnostic/description retains normal text selection.
  var targetStyle = desktopDragScrollStyle(target);
  if (!targetStyle || targetStyle.userSelect === 'text' || targetStyle.webkitUserSelect === 'text') return null;
  for (var element = target; element; element = element.parentElement) {
    var style = desktopDragScrollStyle(element);
    if (style && /^(auto|scroll)$/.test(style.overflowY)
      && element.scrollHeight > element.clientHeight + 1) return element;
    if (element === panel) break;
  }
  return null;
}

function desktopDragScrollGeometry(scroller, event) {
  var rect = scroller.getBoundingClientRect();
  var style = desktopDragScrollStyle(scroller);
  if (!style || !rect.width || !rect.height) return null;
  var scaleX = scroller.offsetWidth > 0 ? rect.width / scroller.offsetWidth : 1;
  var scaleY = scroller.offsetHeight > 0 ? rect.height / scroller.offsetHeight : 1;
  var verticalGutter = Math.max(0, scroller.offsetWidth - scroller.clientWidth
    - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0));
  var horizontalGutter = Math.max(0, scroller.offsetHeight - scroller.clientHeight
    - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0));
  // Chromium overlay/thin scrollbars may report no layout gutter. Keep their
  // narrow edge lane available for native thumb dragging as well.
  var edge = Math.max(8, verticalGutter) * scaleX;
  var onVerticalBar = style.direction === 'rtl'
    ? event.clientX < rect.left + edge
    : event.clientX >= rect.right - edge;
  if (onVerticalBar || horizontalGutter > 1 && event.clientY >= rect.bottom - horizontalGutter * scaleY) return null;
  return { scaleY: scaleY > 0 ? scaleY : 1 };
}

function cancelDesktopDragScroll(suppressClick) {
  var state = desktopDragScrollState;
  desktopDragScrollState = null;
  desktopDragScrollClick = suppressClick && state && state.active
    ? { scroller: state.scroller, until: performance.now() + 420 }
    : null;
  if (!state || !state.active) return;
  state.scroller.style.scrollBehavior = state.scrollBehavior;
  if (typeof state.scroller.__syncSmoothWheelTarget === 'function') state.scroller.__syncSmoothWheelTarget(state.scroller.scrollTop);
  try { state.scroller.releasePointerCapture(state.pointerId); } catch (_) { }
}

function bindDesktopDragScrolling() {
  document.addEventListener('pointerdown', function (event) {
    // A new gesture never inherits the previous drag's click guard.
    cancelDesktopDragScroll(false);
    if (!desktopDragScrollEnabled() || event.pointerType !== 'mouse' || event.button !== 0
      || event.isPrimary === false || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey
      || event.defaultPrevented) return;
    var scroller = desktopDragScrollContainer(event.target);
    if (!scroller || !desktopDragScrollVisible(scroller)) return;
    var geometry = desktopDragScrollGeometry(scroller, event);
    if (!geometry) return;
    desktopDragScrollState = {
      pointerId: event.pointerId, scroller: scroller, startX: event.clientX, startY: event.clientY,
      startTop: scroller.scrollTop, scaleY: geometry.scaleY, active: false, scrollBehavior: scroller.style.scrollBehavior
    };
  }, true);
  document.addEventListener('pointermove', function (event) {
    var state = desktopDragScrollState;
    if (!state || event.pointerId !== state.pointerId) return;
    if (!desktopDragScrollEnabled() || !desktopDragScrollVisible(state.scroller)
      || (event.buttons & 1) !== 1
      || state.active && Math.abs(state.scroller.scrollTop - state.lastTop) > 1) {
      cancelDesktopDragScroll(false);
      return;
    }
    var dx = event.clientX - state.startX;
    var dy = event.clientY - state.startY;
    var max = Math.max(0, state.scroller.scrollHeight - state.scroller.clientHeight);
    var baseline = state.active ? state.startTop : state.scroller.scrollTop;
    var top = Math.max(0, Math.min(max, baseline - dy / state.scaleY));
    if (!state.active) {
      if (Math.abs(dx) > 9 && Math.abs(dx) >= Math.abs(dy)) {
        cancelDesktopDragScroll(false);
        return;
      }
      if (Math.abs(dy) <= 9 || Math.abs(dy) <= Math.abs(dx) || Math.abs(top - baseline) < 0.5) return;
      // A still-running smooth wheel tween may have moved during the small
      // click-preserving threshold. Continue from its current position.
      state.startTop = baseline;
      state.active = true;
      if (typeof state.scroller.__syncSmoothWheelTarget === 'function') state.scroller.__syncSmoothWheelTarget(state.scroller.scrollTop);
      if (window.gsap && typeof window.gsap.killTweensOf === 'function') window.gsap.killTweensOf(state.scroller, 'scrollTop');
      state.scroller.style.scrollBehavior = 'auto';
      try { state.scroller.setPointerCapture(state.pointerId); } catch (_) { }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    state.scroller.scrollTop = top;
    state.lastTop = state.scroller.scrollTop;
    if (typeof markRenderInteraction === 'function') markRenderInteraction('desktop-panel-drag-scroll', 900);
  }, { capture: true, passive: false });
  document.addEventListener('pointerup', function (event) {
    var state = desktopDragScrollState;
    if (!state || event.pointerId !== state.pointerId) return;
    if (state.active) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    cancelDesktopDragScroll(true);
  }, true);
  ['pointercancel', 'lostpointercapture'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (desktopDragScrollState && event.pointerId === desktopDragScrollState.pointerId) cancelDesktopDragScroll(false);
    }, true);
  });
  document.addEventListener('click', function (event) {
    var guard = desktopDragScrollClick;
    if (!guard || event.detail === 0) return;
    desktopDragScrollClick = null;
    if (performance.now() > guard.until || !guard.scroller.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('wheel', function () {
    if (desktopDragScrollState) cancelDesktopDragScroll(false);
  }, { capture: true, passive: true });
  document.addEventListener('scroll', function (event) {
    var state = desktopDragScrollState;
    if (state && state.active && event.target === state.scroller
      && Math.abs(state.scroller.scrollTop - state.lastTop) > 1) cancelDesktopDragScroll(false);
  }, { capture: true, passive: true });
  ['blur', 'pagehide', 'resize'].forEach(function (type) {
    window.addEventListener(type, function () { cancelDesktopDragScroll(false); });
  });
  document.addEventListener('visibilitychange', function () {
    if (!desktopDragScrollEnabled()) cancelDesktopDragScroll(false);
  });
  if (typeof MutationObserver === 'function' && document.body) {
    new MutationObserver(function () {
      if (!desktopDragScrollEnabled()) cancelDesktopDragScroll(false);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}

bindDesktopDragScrolling();
