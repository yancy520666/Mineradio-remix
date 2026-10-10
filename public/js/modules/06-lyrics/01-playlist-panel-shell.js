// ============================================================
function animateListItems(container, selector, opts) {
  if (!container || !window.gsap) return;
  opts = opts || {};
  var items = opts.targets || Array.prototype.slice.call(container.querySelectorAll(selector));
  if (!items.length) return;
  var limit = opts.limit || 18;
  var targets = items.slice(0, limit);
  window.gsap.killTweensOf(targets);
  window.gsap.fromTo(targets, {
    autoAlpha: 0,
    y: opts.y == null ? 8 : opts.y,
    x: opts.x == null ? -6 : opts.x
  }, {
    autoAlpha: 1,
    y: 0,
    x: 0,
    duration: opts.duration || 0.22,
    stagger: opts.stagger || 0.012,
    ease: opts.ease || 'power2.out',
    force3D: true,
    overwrite: true
  });
}
function smoothScrollToItem(scroller, item, opts) {
  if (!scroller || !item) return;
  opts = opts || {};
  var target = item.offsetTop - Math.max(0, (scroller.clientHeight - item.offsetHeight) * (opts.align == null ? 0.42 : opts.align));
  target = Math.max(0, Math.min(target, Math.max(0, scroller.scrollHeight - scroller.clientHeight)));
  if (window.gsap) {
    if (typeof scroller.__syncSmoothWheelTarget === 'function') scroller.__syncSmoothWheelTarget(target);
    window.gsap.killTweensOf(scroller);
    window.gsap.to(scroller, { scrollTop: target, duration: opts.duration || 0.30, ease: opts.ease || 'power2.out', overwrite: true });
  } else if (scroller.scrollTo) {
    scroller.scrollTo({ top: target, behavior: 'smooth' });
  } else {
    scroller.scrollTop = target;
  }
}
function bindSmoothWheelScroll(scroller) {
  if (!scroller || scroller.__smoothWheelBound) return;
  scroller.__smoothWheelBound = true;
  var targetTop = scroller.scrollTop;
  var tween = null;
  scroller.__syncSmoothWheelTarget = function (top) {
    if (tween) {
      tween.kill();
      tween = null;
    }
    targetTop = isFinite(top) ? top : scroller.scrollTop;
  };
  scroller.addEventListener('wheel', function (e) {
    if (!window.gsap || e.ctrlKey) return;
    var max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (max <= 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 18;
    else if (e.deltaMode === 2) delta *= scroller.clientHeight;
    var current = tween ? targetTop : scroller.scrollTop;
    var next = Math.max(0, Math.min(max, current + delta));
    if (next === current && ((delta < 0 && scroller.scrollTop <= 0) || (delta > 0 && scroller.scrollTop >= max - 1))) {
      targetTop = scroller.scrollTop;
      return;
    }
    e.preventDefault();
    targetTop = next;
    if (tween) tween.kill();
    tween = window.gsap.to(scroller, {
      scrollTop: targetTop,
      duration: 0.24,
      ease: 'power2.out',
      overwrite: true,
      onComplete: function () {
        tween = null;
        targetTop = scroller.scrollTop;
      }
    });
  }, { passive: false });
  scroller.addEventListener('scroll', function () {
    if (!tween) targetTop = scroller.scrollTop;
  }, { passive: true });
}
function bindSmoothQueueScrolling() {
  if (smoothWheelScrollBound) return;
  smoothWheelScrollBound = true;
  [
    'mini-queue-list',
    'search-results',
    'fx-panel',
    'playlist-panel',
    'track-detail-body'
  ].forEach(function (id) {
    bindSmoothWheelScroll(document.getElementById(id));
  });
}
// Rows the user can actually see. The queue opens scrolled to the current song,
// so the first DOM rows are usually above the view; animating those left only
// the top two or three visible rows moving while the rest simply appeared.
function visiblePanelListItems(listEl, selector, scroller, limit) {
  var items = listEl.querySelectorAll(selector);
  var view = (scroller || listEl).getBoundingClientRect();
  var out = [];
  for (var i = 0; i < items.length && out.length < limit; i++) {
    var r = items[i].getBoundingClientRect();
    if (!r.height || r.bottom < view.top + 2) continue;
    if (r.top > view.bottom - 2) break;
    out.push(items[i]);
  }
  return out;
}
function animateVisiblePanelList(listEl, selector, scroller, activeSelector, opts) {
  if (!listEl) return;
  opts = opts || {};
  requestAnimationFrame(function () {
    var targets = visiblePanelListItems(listEl, selector, scroller, 14);
    // One continuous cascade: every visible row slides in from the panel's
    // edge, top to bottom, finishing together with the panel's own glide.
    if (targets.length) animateListItems(listEl, selector, { targets: targets, x: -22, y: 0, stagger: 0.026, duration: 0.42, ease: 'power3.out', limit: 14 });
    var active = activeSelector ? listEl.querySelector(activeSelector) : null;
    if (active && scroller && opts.scrollActive !== false) smoothScrollToItem(scroller, active, { duration: 0.32 });
  });
}
function miniQueueSkeleton() {
  return '<div class="mini-queue-skeleton"></div><div class="mini-queue-skeleton"></div><div class="mini-queue-skeleton"></div>';
}
function queueHydrationExpectedTotal() {
  var loaded = playQueue && playQueue.length || 0;
  if (!queueHydrationState || queueHydrationState.queueRef !== playQueue) return loaded;
  if (!queueHydrationState.active && !queueHydrationState.loading && !queueHydrationState.error) return loaded;
  return Math.max(loaded, Number(queueHydrationState.total) || 0);
}
function queueHydrationFooterHtml(compact) {
  if (!queueHydrationState || queueHydrationState.queueRef !== playQueue) return '';
  var loaded = playQueue.length;
  var total = queueHydrationExpectedTotal();
  if (!queueHydrationState.active && !queueHydrationState.error && (!total || loaded >= total)) return '';
  var label = queueHydrationState.error
    ? ('后续歌曲载入中断 · 已准备 ' + loaded + (total ? '/' + total : ''))
    : (queueHydrationState.loading
      ? ('正在载入下一批 · ' + loaded + (total ? '/' + total : ''))
      : ('已准备 ' + loaded + (total ? '/' + total : '') + ' · 播放或滚动到末尾时继续'));
  var retry = queueHydrationState.error
    ? '<button type="button" class="queue-hydration-retry" onclick="event.stopPropagation();retryPlaylistQueueHydration()">重试</button>'
    : (queueHydrationState.active && !queueHydrationState.loading
      ? '<button type="button" class="queue-hydration-retry" onclick="event.stopPropagation();requestPlaylistQueueHydrationForBrowse()">再载一批</button>'
      : '');
  return '<div class="queue-hydration-status' + (compact ? ' compact' : '') + '">' +
    '<span class="queue-hydration-spinner' + (queueHydrationState.loading ? ' spinning' : '') + '"></span>' +
    '<span>' + label + '</span>' + retry + '</div>';
}
function togglePlaylistPanel(force) {
  var el = document.getElementById('playlist-panel');
  if (force === false) el.classList.remove('show');
  else if (force === true) el.classList.add('show');
  else el.classList.toggle('show');
  if (el.classList.contains('show')) {
    markPlaylistPanelMotion(el, playlistPanelMotionMs('open'));
    var runPlaylistOpenAnimation = shouldAnimatePlaylistPanelOpen(el);
    scheduleUiWarmTask(function () {
      flushDeferredQueuePanel('playlist-panel-open');
      preparePlaylistPanelTabOnOpen(el);
      if (runPlaylistOpenAnimation) animatePlaylistPanelCurrentTab(el, { scrollActive: false });
    }, 180);
  }
}
function closePlaylistPanelSoft(reason) {
  var panel = document.getElementById('playlist-panel');
  if (!panel || playlistPanelPinned) return false;
  if (!panel.classList.contains('peek') && !panel.classList.contains('show')) return false;
  if (peekTimers.pl) { clearTimeout(peekTimers.pl); peekTimers.pl = null; }
  if (typeof resetSecondaryPlaylistEdgeGuard === 'function') resetSecondaryPlaylistEdgeGuard();
  panel.classList.add('playlist-panel-closing');
  panel.classList.remove('peek', 'show');
  markPlaylistPanelMotion(panel, playlistPanelMotionMs('close'));
  setTimeout(function () { panel.classList.remove('playlist-panel-closing'); }, playlistPanelMotionMs('close') + 80);
  return true;
}
function applyPlaylistPanelPinState(openPanel) {
  var panel = document.getElementById('playlist-panel');
  var btn = document.getElementById('playlist-pin-btn');
  if (panel) {
    panel.classList.toggle('pinned', !!playlistPanelPinned);
    if (playlistPanelPinned || openPanel) {
      panel.dataset.preserveTabOnOpen = '1';
      setPeek(panel, true, 'pl');
    }
  }
  if (btn) {
    btn.classList.toggle('active', !!playlistPanelPinned);
    btn.title = playlistPanelPinned ? '取消常开歌单' : '常开歌单';
  }
}
function setPlaylistPanelPinned(on, silent) {
  playlistPanelPinned = !!on;
  saveBooleanPreference(PLAYLIST_PANEL_PIN_STORE_KEY, playlistPanelPinned);
  applyPlaylistPanelPinState(playlistPanelPinned);
  if (!silent) showToast(playlistPanelPinned ? '左侧歌单已常开' : '左侧歌单已恢复自动隐藏');
}
function togglePlaylistPanelPinned() {
  setPlaylistPanelPinned(!playlistPanelPinned);
}
function scrollPlaylistPanelToCurrent(opts) {
  opts = opts || {};
  var panel = document.getElementById('playlist-panel');
  var list = document.getElementById('queue-list');
  if (!panel || !list || queueViewTab !== 'queue') return;
  var now = performance.now();
  if (panel.__lastCurrentScrollAt && now - panel.__lastCurrentScrollAt < 650) return;
  panel.__lastCurrentScrollAt = now;
  requestAnimationFrame(function () {
    renderQueuePanel({ animate: false, scrollCurrent: true });
    var current = list.querySelector('.queue-item.now');
    if (opts.instant && current) {
      // While the panel itself slides in, place the list directly: a fast
      // scroll from the top rebuilt every virtual row each frame and threw
      // away the rows' entrance animation.
      var target = current.offsetTop - Math.max(0, (panel.clientHeight - current.offsetHeight) * 0.34);
      target = Math.max(0, Math.min(target, panel.scrollHeight - panel.clientHeight));
      if (window.gsap) window.gsap.killTweensOf(panel);
      if (typeof panel.__syncSmoothWheelTarget === 'function') panel.__syncSmoothWheelTarget(target);
      panel.scrollTop = target;
      renderQueuePanel({ animate: false, scrollCurrent: false });
      return;
    }
    smoothScrollToItem(panel, current, { duration: 0.28, align: 0.34 });
  });
}
function animatePlaylistPanelCurrentTab(panel, opts) {
  opts = opts || {};
  panel = panel || document.getElementById('playlist-panel');
  if (queueViewTab === 'queue') {
    animateVisiblePanelList(document.getElementById('queue-list'), '.queue-item', panel, '.queue-item.now', { scrollActive: opts.scrollActive !== false });
  } else if (queueViewTab === 'playlists') {
    animateVisiblePanelList(document.getElementById('pl-list'), '.pl-card', panel);
  } else {
    animateVisiblePanelList(document.getElementById('podcast-list'), '.pl-card', panel);
  }
}
function preparePlaylistPanelTabOnOpen(panel) {
  var preserve = !!(panel && panel.dataset && panel.dataset.preserveTabOnOpen === '1');
  if (preserve && panel.dataset) {
    delete panel.dataset.preserveTabOnOpen;
  } else if (!playQueue.length && queueViewTab === 'queue') {
    switchPlaylistTab('playlists', { save: false, animate: false, refresh: false });
  }
  if (queueViewTab === 'queue') scrollPlaylistPanelToCurrent({ instant: true });
  else if (queueViewTab === 'playlists' || queueViewTab === 'podcasts') refreshUserPlaylists();
}
function switchPlaylistTab(tab, opts) {
  opts = opts || {};
  cancelPlaylistReturnMotion();
  tab = normalizePlaylistPanelTab(tab);
  queueViewTab = tab;
  if (opts.save !== false) savePlaylistPanelTabPreference(tab);
  var queueTab = document.getElementById('tab-queue');
  var playlistTab = document.getElementById('tab-pl');
  if (queueTab) queueTab.classList.toggle('active', tab === 'queue');
  if (playlistTab) playlistTab.classList.toggle('active', tab === 'playlists');
  var podcastTab = document.getElementById('tab-podcast');
  if (podcastTab) podcastTab.classList.toggle('active', tab === 'podcasts');
  var queuePane = document.getElementById('queue-pane');
  var playlistPane = document.getElementById('pl-pane');
  if (queuePane) queuePane.style.display = tab === 'queue' ? '' : 'none';
  if (playlistPane) playlistPane.style.display = tab === 'playlists' ? '' : 'none';
  var podcastPane = document.getElementById('podcast-pane');
  if (podcastPane) podcastPane.style.display = tab === 'podcasts' ? '' : 'none';
  if ((tab === 'playlists' || tab === 'podcasts') && opts.refresh !== false) refreshUserPlaylists();
  if (opts.animate !== false) animatePlaylistPanelCurrentTab(document.getElementById('playlist-panel'));
  updatePanelTabIndicator();
  var panel = document.getElementById('playlist-panel');
  if (panel && typeof playlistPanelTopInset === 'function') playlistPanelTopInset(panel);
  if (panel && typeof syncPlaylistPanelContentClip === 'function') syncPlaylistPanelContentClip(panel);
}
// A single pill slides under the active tab instead of each tab swapping
// its own background. Offsets are layout-relative, so panel transforms and
// scrolling do not affect them.
function updatePanelTabIndicator() {
  var tabs = document.querySelector('#playlist-panel .panel-tabs.has-indicator');
  var indicator = tabs && tabs.querySelector('.panel-tab-indicator');
  var active = tabs && tabs.querySelector('.panel-tab.active');
  if (!indicator || !active || !active.offsetWidth) return;
  indicator.style.width = active.offsetWidth + 'px';
  indicator.style.height = active.offsetHeight + 'px';
  indicator.style.transform = 'translate(' + active.offsetLeft + 'px, ' + active.offsetTop + 'px)';
  if (!tabs.classList.contains('indicator-ready')) {
    // Place without animating the first time the panel lays out.
    requestAnimationFrame(function () { tabs.classList.add('indicator-ready'); });
  }
}
(function bindPanelTabIndicator() {
  var tabs = document.querySelector('#playlist-panel .panel-tabs.has-indicator');
  if (!tabs) return;
  if (typeof ResizeObserver === 'function') new ResizeObserver(function () { updatePanelTabIndicator(); }).observe(tabs);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updatePanelTabIndicator).catch(function () { });
  updatePanelTabIndicator();
})();
function setMiniQueueOpen(open) {
  miniQueueOpen = !!open;
  var pop = document.getElementById('mini-queue-popover');
  var btn = document.getElementById('mini-queue-btn');
  if (pop) pop.classList.toggle('show', miniQueueOpen);
  if (btn) btn.classList.toggle('active', miniQueueOpen);
  if (miniQueueOpen) {
    var seq = ++miniQueueRenderSeq;
    requestAnimationFrame(function () {
      if (seq !== miniQueueRenderSeq || !miniQueueOpen) return;
      renderMiniQueuePanel({ animate: true, scrollCurrent: true });
    });
    revealBottomControls(1300);
  }
}
function toggleMiniQueue(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  setMiniQueueOpen(!miniQueueOpen);
}
function closeMiniQueue() {
  setMiniQueueOpen(false);
}
function openPlaylistPanelTab(tab, preserve) {
  tab = normalizePlaylistPanelTab(tab);
  var panel = document.getElementById('playlist-panel');
  if (panel && panel.dataset && preserve !== false) panel.dataset.preserveTabOnOpen = '1';
  switchPlaylistTab(tab);
  setPeek(panel, true, 'pl');
}
function renderMiniQueuePanel(opts) {
  opts = opts || {};
  var $list = document.getElementById('mini-queue-list');
  var $count = document.getElementById('mini-queue-count');
  if (!$list || !$count) return;
  var total = playQueue.length;
  var expectedTotal = queueHydrationExpectedTotal();
  $count.textContent = total ? ((expectedTotal > total ? (total + '/' + expectedTotal) : total) + ' 首' + (currentIdx >= 0 ? ' · 正在播放 ' + (currentIdx + 1) : '')) : '0 首';
  if (!miniQueueOpen && !opts.animate && !opts.scrollCurrent) return;
  if (!total) {
    $list.innerHTML = '<div class="mini-queue-empty">队列为空，先搜索或打开歌单</div>';
    return;
  }
  var windowInfo = queuePanelVirtualWindow($list, $list, total, true, opts.scrollCurrent ? currentIdx : -1);
  var visibleQueue = playQueue.slice(windowInfo.start, windowInfo.end);
  $list.innerHTML = queueVirtualSpacerHtml(windowInfo.top) + visibleQueue.map(function (song, localIndex) {
    var i = windowInfo.start + localIndex;
    var thumb = songCoverSrc(song, 60);
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div class="mini-queue-cover"></div>';
    return '<div class="mini-queue-item' + (i === currentIdx ? ' now' : '') + '" data-queue-index="' + i + '" onclick="if(window.__mineradioSuppressReorderClick)return;playQueueAt(' + i + ')">' +
      imgTag +
      '<div class="mini-queue-info"><button type="button" class="mini-queue-name queue-play-name" aria-label="播放 ' + escHtml(song.name) + '" onclick="event.stopPropagation();if(window.__mineradioSuppressReorderClick)return;playQueueAt(' + i + ')">' + escHtml(song.name) + '</button><div class="mini-queue-sub">' + escHtml(song.artist || '') + '</div></div>' +
      '<button class="mini-queue-remove mini-queue-next" onclick="event.stopPropagation();queueIndexNext(' + i + ')" title="下一首播放" aria-label="下一首播放">' + queueNextIconSvg() + '</button>' +
      '<button class="mini-queue-remove" onclick="event.stopPropagation();removeFromQueue(' + i + ')" title="移除" aria-label="移除">' + queueRemoveIconSvg() + '</button>' +
      '</div>';
  }).join('') + queueVirtualSpacerHtml(windowInfo.bottom) + queueHydrationFooterHtml(true);
  if (opts.animate || opts.scrollCurrent) {
    requestAnimationFrame(function () {
      if (opts.animate) animateListItems($list, '.mini-queue-item', { x: 0, y: 6, stagger: 0.01, duration: 0.20, limit: 16 });
      if (opts.scrollCurrent) smoothScrollToItem($list, $list.querySelector('.mini-queue-item.now'), { duration: 0.30, align: 0.42 });
    });
  }
}
var panelReorderState = { timer: 0, active: false, pointerId: null, suppressClickUntil: 0 };
var reorderLongPressMs = 520;
var reorderMoveCancelPx = 9;
function clearPanelReorderClasses() {
  document.body.classList.remove('panel-reordering');
  Array.prototype.forEach.call(document.querySelectorAll('.reorder-pressing,.is-reordering,.is-reordering-list'), function (node) {
    node.classList.remove('reorder-pressing', 'is-reordering', 'is-reordering-list');
  });
}
function markPanelReorderSuppressed(ms) {
  panelReorderState.suppressClickUntil = performance.now() + (ms || 420);
  window.__mineradioSuppressReorderClick = true;
  setTimeout(function () {
    if (performance.now() >= panelReorderState.suppressClickUntil) window.__mineradioSuppressReorderClick = false;
  }, ms || 420);
}
function panelReorderClickSuppressed() {
  return performance.now() < (panelReorderState.suppressClickUntil || 0);
}
function cancelPanelReorder(markSuppress) {
  if (panelReorderState.timer) clearTimeout(panelReorderState.timer);
  if (markSuppress && panelReorderState.active && panelReorderState.kind === 'queue' && typeof saveLastPlaybackSnapshot === 'function') {
    saveLastPlaybackSnapshot(true, 'queue-reorder-final');
  }
  if (markSuppress && panelReorderState.active) markPanelReorderSuppressed(520);
  clearPanelReorderClasses();
  panelReorderState.timer = 0;
  panelReorderState.active = false;
  panelReorderState.pointerId = null;
}
function panelReorderBlockedTarget(target) {
  return !!(target && target.closest && target.closest('button:not(.queue-play-name),a,input,textarea,select,[data-pl-load-more],[data-pl-detail-load-more],[data-pl-detail-top],[data-pl-detail-play],[data-pl-detail-artist],[data-pl-detail-row],.pl-inline-detail'));
}
function panelReorderHitFromTarget(target) {
  if (!target || !target.closest || panelReorderBlockedTarget(target)) return null;
  var queueItem = target.closest('.queue-item[data-queue-index],.mini-queue-item[data-queue-index]');
  if (queueItem) {
    var queueRoot = queueItem.closest('#queue-list,#mini-queue-list');
    if (!queueRoot) return null;
    var queueIndex = Number(queueItem.getAttribute('data-queue-index'));
    if (!isFinite(queueIndex)) return null;
    return { kind: 'queue', item: queueItem, rootId: queueRoot.id, index: queueIndex, provider: '' };
  }
  var card = target.closest('.pl-card[data-playlist-index]');
  if (card && card.closest('#pl-list')) {
    var playlistIndex = Number(card.getAttribute('data-playlist-index'));
    if (!isFinite(playlistIndex) || playlistIndex < 0) return null;
    return {
      kind: 'playlist',
      item: card,
      rootId: 'pl-list',
      index: playlistIndex,
      provider: card.getAttribute('data-playlist-provider') || ''
    };
  }
  return null;
}
function panelReorderHitAtPoint(x, y, state) {
  var el = document.elementFromPoint(x, y);
  var hit = panelReorderHitFromTarget(el);
  if (!hit || !state || hit.kind !== state.kind || hit.rootId !== state.rootId) return null;
  if (state.kind === 'playlist' && state.provider && hit.provider !== state.provider) return null;
  return hit;
}
function markPanelReorderItem(state) {
  if (!state || !state.rootId) return;
  requestAnimationFrame(function () {
    var root = document.getElementById(state.rootId);
    if (!root) return;
    root.classList.add('is-reordering-list');
    var attr = state.kind === 'playlist' ? 'data-playlist-index' : 'data-queue-index';
    var item = root.querySelector('[' + attr + '="' + state.currentIndex + '"]');
    if (item) item.classList.add('is-reordering');
  });
}
function bindLongPressPanelReorder() {
  if (document.__mineradioPanelReorderBound) return;
  document.__mineradioPanelReorderBound = true;
  document.addEventListener('click', function (e) {
    if (!panelReorderClickSuppressed()) return;
    if (!e.target || !e.target.closest || !e.target.closest('#queue-list,#mini-queue-list,#pl-list')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  document.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    var hit = panelReorderHitFromTarget(e.target);
    if (!hit) return;
    cancelPanelReorder(false);
    panelReorderState = {
      timer: 0,
      active: false,
      pointerId: e.pointerId,
      kind: hit.kind,
      rootId: hit.rootId,
      provider: hit.provider,
      startX: e.clientX,
      startY: e.clientY,
      currentIndex: hit.index,
      suppressClickUntil: panelReorderState.suppressClickUntil || 0
    };
    hit.item.classList.add('reorder-pressing');
    panelReorderState.timer = setTimeout(function () {
      if (panelReorderState.pointerId !== e.pointerId) return;
      panelReorderState.active = true;
      document.body.classList.add('panel-reordering');
      markPanelReorderItem(panelReorderState);
      if (typeof markRenderInteraction === 'function') markRenderInteraction('panel-reorder', 900);
    }, reorderLongPressMs);
  }, true);
  document.addEventListener('pointermove', function (e) {
    if (panelReorderState.pointerId == null || e.pointerId !== panelReorderState.pointerId) return;
    var dx = e.clientX - panelReorderState.startX;
    var dy = e.clientY - panelReorderState.startY;
    if (!panelReorderState.active) {
      if (Math.sqrt(dx * dx + dy * dy) > reorderMoveCancelPx) cancelPanelReorder(false);
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (typeof markRenderInteraction === 'function') markRenderInteraction('panel-reorder', 900);
    var hit = panelReorderHitAtPoint(e.clientX, e.clientY, panelReorderState);
    if (!hit || hit.index === panelReorderState.currentIndex) return;
    var moved = panelReorderState.kind === 'queue'
      ? (typeof moveQueueIndex === 'function' && moveQueueIndex(panelReorderState.currentIndex, hit.index, { rebuildShelf: true, renderPanel: true, persistSnapshot: false }))
      : (typeof moveUserPlaylistIndex === 'function' && moveUserPlaylistIndex(panelReorderState.currentIndex, hit.index, { rebuildShelf: true, renderPanel: true }));
    if (!moved) return;
    panelReorderState.currentIndex = hit.index;
    clearPanelReorderClasses();
    document.body.classList.add('panel-reordering');
    markPanelReorderItem(panelReorderState);
  }, { capture: true, passive: false });
  document.addEventListener('pointerup', function (e) {
    if (panelReorderState.pointerId == null || e.pointerId !== panelReorderState.pointerId) return;
    cancelPanelReorder(true);
  }, true);
  document.addEventListener('pointercancel', function (e) {
    if (panelReorderState.pointerId == null || e.pointerId !== panelReorderState.pointerId) return;
    cancelPanelReorder(false);
  }, true);
}
document.addEventListener('click', function (e) {
  if (miniQueueOpen && !(e.target && e.target.closest && e.target.closest('#bottom-bar'))) closeMiniQueue();
});
bindSmoothQueueScrolling();
bindPlaylistPanelLazyRender();
bindLongPressPanelReorder();
bindModalBackdropClose();
function renderQueuePanel(opts) {
  opts = opts || {};
  var $ql = document.getElementById('queue-list');
  var seq = ++queueRenderSeq;
  if (!playQueue.length) {
    $ql.innerHTML = '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">队列为空，搜索后点 + 设为下一首</div>';
    renderMiniQueuePanel();
    var panel = document.getElementById('playlist-panel');
    if (panel && (panel.classList.contains('show') || panel.classList.contains('peek')) && queueViewTab === 'queue') switchPlaylistTab('playlists', { save: false });
    if (panel && typeof syncPlaylistPanelContentClip === 'function') syncPlaylistPanelContentClip(panel);
    return;
  }
  var total = playQueue.length;
  var panelScroller = document.getElementById('playlist-panel');
  var windowInfo = queuePanelVirtualWindow($ql, panelScroller, total, false, opts.scrollCurrent ? currentIdx : -1);
  // Scrolling within the same virtual window needs no new rows; rebuilding
  // them anyway churned the DOM every frame and cancelled row animations.
  var windowKey = [windowInfo.start, windowInfo.end, currentIdx, total, queueHydrationFooterHtml(false)].join('|');
  if (opts.virtualOnly && $ql.__queueWindowKey === windowKey && $ql.__queueRef === playQueue) return;
  $ql.__queueWindowKey = windowKey;
  $ql.__queueRef = playQueue;
  var visibleQueue = playQueue.slice(windowInfo.start, windowInfo.end);
  $ql.innerHTML = queueVirtualSpacerHtml(windowInfo.top) + visibleQueue.map(function (song, localIndex) {
    var i = windowInfo.start + localIndex;
    var thumb = songCoverSrc(song, 60);
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:38px;height:38px;border-radius:6px;background:rgba(255,255,255,.06);flex-shrink:0"></div>';
    return '<div class="queue-item' + (i === currentIdx ? ' now' : '') + '" data-queue-index="' + i + '" onclick="if(window.__mineradioSuppressReorderClick)return;playQueueAt(' + i + ')">' +
      imgTag +
      '<div class="qi-info"><button type="button" class="qi-name queue-play-name" aria-label="播放 ' + escHtml(song.name) + '" onclick="event.stopPropagation();if(window.__mineradioSuppressReorderClick)return;playQueueAt(' + i + ')">' + (i === currentIdx ? '<span class="qi-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : '') + escHtml(song.name) + '</button><div class="qi-sub"><button class="queue-artist-link" type="button" onclick="event.stopPropagation();openQueueArtist(' + i + ')">' + escHtml(song.artist || '未知歌手') + '</button></div></div>' +
      '<div class="qi-act">' +
      '<button class="' + (isSongLiked(song) ? 'liked' : '') + '" onclick="event.stopPropagation();toggleLikeQueueIndex(' + i + ')" title="' + (isSongLiked(song) ? '取消红心' : '红心喜欢') + '">' + heartIconSvg() + '</button>' +
      '<button class="queue-next" onclick="event.stopPropagation();queueIndexNext(' + i + ')" title="下一首播放" aria-label="下一首播放">' + queueNextIconSvg() + '</button>' +
      '<button onclick="event.stopPropagation();collectQueueIndex(' + i + ')" title="收藏到歌单">' + playlistPlusIconSvg() + '</button>' +
      '<button onclick="event.stopPropagation();removeFromQueue(' + i + ')" title="移除" aria-label="移除">' + queueRemoveIconSvg() + '</button>' +
      '</div>' +
      '</div>';
  }).join('') + queueVirtualSpacerHtml(windowInfo.bottom) + queueHydrationFooterHtml(false);
  if (panelScroller && typeof syncPlaylistPanelContentClip === 'function') syncPlaylistPanelContentClip(panelScroller);
  if (opts.animate && seq === queueRenderSeq) animateVisiblePanelList($ql, '.queue-item', document.getElementById('playlist-panel'), '.queue-item.now');
  renderMiniQueuePanel({ scrollCurrent: opts.scrollCurrent !== false && miniQueueOpen });
}
function playlistCatalogProviderArray(provider) {
  if (provider === 'netease') return neteasePlaylists;
  if (provider === 'qq') return qqPlaylists;
  if (provider === 'kugou') return kugouPlaylists;
  if (provider === 'qishui') return qishuiPlaylists;
  return [];
}
function setPlaylistCatalogProviderArray(provider, rows) {
  rows = Array.isArray(rows) ? rows : [];
  if (provider === 'netease') neteasePlaylists = rows;
  else if (provider === 'qq') qqPlaylists = rows;
  else if (provider === 'kugou') kugouPlaylists = rows;
  else if (provider === 'qishui') qishuiPlaylists = rows;
}
function playlistCatalogProviderLoggedIn(provider) {
  if (provider === 'netease') return !!loginStatus.loggedIn;
  if (provider === 'qq') return !!qqLoginStatus.loggedIn;
  if (provider === 'kugou') return !!kugouLoginStatus.loggedIn;
  if (provider === 'qishui') return !!qishuiLoginStatus.loggedIn;
  return false;
}
function playlistCatalogAccountKey(provider) {
  var status = typeof platformStatus === 'function' ? platformStatus(provider) : null;
  if (!status && provider === 'netease' && typeof loginStatus !== 'undefined') status = loginStatus;
  if (!status && provider === 'qq' && typeof qqLoginStatus !== 'undefined') status = qqLoginStatus;
  if (!status && provider === 'kugou' && typeof kugouLoginStatus !== 'undefined') status = kugouLoginStatus;
  if (!status && provider === 'qishui' && typeof qishuiLoginStatus !== 'undefined') status = qishuiLoginStatus;
  status = status || {};
  var identity = String(status.userId || status.uid || status.uin || status.openId || status.id || '');
  if (!identity && typeof providerAuthEpoch === 'function') identity = 'session:' + providerAuthEpoch(provider);
  return JSON.stringify([playlistCatalogProviderLoggedIn(provider), identity]);
}
function playlistCatalogPageUrl(provider, offset, limit) {
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.max(1, Number(limit) || PLAYLIST_CATALOG_FIRST_PAGE_SIZE);
  if (provider === 'netease') return '/api/user/playlists?paged=1&limit=' + limit + '&offset=' + offset;
  if (provider === 'qq') return '/api/qq/user/playlists';
  if (provider === 'kugou') return '/api/kugou/user/playlists';
  if (provider === 'qishui') return '/api/qishui/user/playlists';
  return '';
}
function mergePlaylistCatalogRows(existing, incoming, provider) {
  var seen = Object.create(null);
  var out = [];
  (existing || []).concat(incoming || []).forEach(function (pl) {
    if (!pl) return;
    pl.provider = provider;
    pl.source = provider;
    var key = String(pl.id || '');
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(pl);
  });
  return out;
}
function rebuildUserPlaylistsFromCatalog(opts) {
  opts = opts || {};
  var providers = typeof contentProviderOrder === 'function' ? contentProviderOrder() : ['netease', 'qq', 'kugou', 'qishui'];
  userPlaylists = builtInPlaylists.slice();
  providers.forEach(function (provider) { userPlaylists = userPlaylists.concat(playlistCatalogProviderArray(provider)); });
  if (typeof applyUserPlaylistOrder === 'function') applyUserPlaylistOrder();
  playlistCatalogRevision += 1;
  renderUserPlaylistsList({ animate: !!opts.animate, reset: !!opts.reset, preserveScroll: opts.preserveScroll !== false });
  if (emptyHomeActive) renderHomeDiscover();
  scheduleShelfRebuild(opts.reason || 'playlist-catalog-page', true);
}
async function loadPlaylistCatalogProviderPage(provider, reason) {
  var root = playlistCatalogSyncState;
  var state = root.providers && root.providers[provider];
  if (!state || state.loading || !state.hasMore || !playlistCatalogProviderLoggedIn(provider)) return false;
  var token = root.token;
  var authEpoch = typeof providerAuthEpoch === 'function' ? providerAuthEpoch(provider) : null;
  var accountKey = playlistCatalogAccountKey(provider);
  // A queued background page belongs to the catalog that created its offset.
  // Do not relabel an old account's rows as the new session during refresh.
  if ((authEpoch !== null && state.authEpoch != null && state.authEpoch !== authEpoch)
    || (state.accountKey && state.accountKey !== accountKey)) return false;
  state.authEpoch = authEpoch;
  state.accountKey = accountKey;
  function catalogPageOwnerStillCurrent() {
    return playlistCatalogSyncState === root && root.token === token && root.providers[provider] === state
      && playlistCatalogProviderLoggedIn(provider)
      && playlistCatalogAccountKey(provider) === accountKey
      && (authEpoch === null || providerAuthEpoch(provider) === authEpoch);
  }
  var first = state.nextOffset === 0 && (!state.loaded || state.replaceOnFirstPage);
  var limit = first ? PLAYLIST_CATALOG_FIRST_PAGE_SIZE : PLAYLIST_CATALOG_BACKGROUND_PAGE_SIZE;
  var requestOffset = state.nextOffset;
  var url = playlistCatalogPageUrl(provider, requestOffset, limit);
  if (!url) return false;
  state.loading = true;
  try {
    var r = await apiJson(url, { timeoutMs: 15000 });
    if (!catalogPageOwnerStillCurrent()) return false;
    if (!r || !Array.isArray(r.playlists)) throw new Error('PLAYLIST_CATALOG_RESPONSE_INVALID');
    var incoming = (r && r.playlists || []).map(function (pl) { pl.provider = provider; pl.source = provider; return pl; });
    state.pageLimited = !!(r && r.pageLimited);
    state.retryable = r && typeof r.retryable === 'boolean' ? r.retryable : !state.pageLimited;
    state.reconnectRequired = !!(r && r.reconnectRequired);
    // Zero is a valid total only when the provider actually supplied it.
    var reportedTotal = r && r.total != null ? Number(r.total) : NaN;
    var hasReportedTotal = isFinite(reportedTotal) && reportedTotal >= 0 && r.totalKnown !== false;
    if (hasReportedTotal) {
      state.total = Math.max(Number(state.loaded) || 0, reportedTotal);
      state.totalKnown = true;
    } else if (r && r.totalKnown === false) {
      state.totalKnown = false;
    }
    if (r && r.error && !incoming.length) {
      state.error = r.error;
      state.hasMore = false;
      renderUserPlaylistsList({ preserveScroll: true });
      return false;
    }
    // A failed refresh must not erase the last good library. Replace a snapshot
    // only after a successful first page; partial whole-library reads are merged.
    var incomplete = !!(r && (r.error || r.libraryReady === false));
    if (first && state.replaceOnFirstPage) state.refreshRows = [];
    var current = first && !incomplete ? [] : playlistCatalogProviderArray(provider);
    var merged;
    if (state.refreshRows) {
      state.refreshRows = mergePlaylistCatalogRows(state.refreshRows, incoming, provider);
      // Keep the complete previous snapshot until every replacement page arrives.
      var complete = !incomplete && !r.hasMore;
      merged = complete ? state.refreshRows : mergePlaylistCatalogRows(playlistCatalogProviderArray(provider), incoming, provider);
      if (complete) state.refreshRows = null;
    } else {
      merged = mergePlaylistCatalogRows(current, incoming, provider);
    }
    setPlaylistCatalogProviderArray(provider, merged);
    state.loaded = merged.length;
    if (!incomplete && !r.hasMore && r.partial !== true && !hasReportedTotal) {
      state.total = merged.length;
      state.totalKnown = true;
    } else {
      state.total = Math.max(state.loaded, Number(state.total) || 0);
    }
    state.nextOffset = r && r.nextOffset != null ? Math.max(0, Number(r.nextOffset) || 0) : (requestOffset + incoming.length);
    var supportsPaging = provider === 'netease';
    state.hasMore = supportsPaging ? !!(r && r.hasMore) : false;
    var stalled = supportsPaging && !!(r && r.hasMore) && (!incoming.length || state.nextOffset <= requestOffset);
    if (!incoming.length || stalled) state.hasMore = false;
    // `partial` on a healthy intermediate page describes pagination, not failure.
    state.error = (r && r.error) || (stalled || (r && (r.libraryReady === false || (r.partial === true && !state.hasMore))) ? 'PLAYLIST_CATALOG_INCOMPLETE' : '');
    state.replaceOnFirstPage = false;
    rebuildUserPlaylistsFromCatalog({ animate: first && isPlaylistPanelVisibleForRender(), reset: first, preserveScroll: !first, reason: reason || 'playlist-catalog-page' });
    return incoming.length > 0;
  } catch (e) {
    if (!catalogPageOwnerStillCurrent()) return false;
    console.warn('[PlaylistCatalogPage]', provider, e);
    state.error = e && e.message || 'PLAYLIST_CATALOG_PAGE_FAILED';
    state.hasMore = false;
    playlistCatalogSyncState.error = state.error;
    renderUserPlaylistsList({ preserveScroll: true });
    return false;
  } finally {
    if (catalogPageOwnerStillCurrent()) state.loading = false;
  }
}
async function retryPlaylistCatalogProvider(provider) {
  var root = playlistCatalogSyncState;
  var state = root.providers && root.providers[provider];
  if (!state || state.loading || !state.error || state.retryable === false || !playlistCatalogProviderLoggedIn(provider)) return;
  // Keep the rows already shown while retrying; merge recovered pages by ID.
  if (provider !== 'netease') {
    state.nextOffset = 0;
    state.replaceOnFirstPage = true;
  }
  state.hasMore = true;
  root.loading = true;
  var pending = loadPlaylistCatalogProviderPage(provider, 'retry');
  renderUserPlaylistsList({ preserveScroll: true });
  await pending;
  if (playlistCatalogSyncState !== root) return;
  root.loading = playlistCatalogHasPendingPages();
  renderUserPlaylistsList({ preserveScroll: true });
  if (root.loading) requestNextPlaylistCatalogPage('after-retry');
}
function playlistCatalogHasPendingPages() {
  var providers = playlistCatalogSyncState.providers || {};
  return Object.keys(providers).some(function (key) { return key !== 'spotify' && providers[key] && (providers[key].loading || providers[key].hasMore); });
}
function requestNextPlaylistCatalogPage(reason) {
  var root = playlistCatalogSyncState;
  if (!root || !root.providers) return false;
  var order = ['netease', 'qq', 'kugou', 'qishui'];
  var provider = order.find(function (key) {
    var state = root.providers[key];
    return state && state.hasMore && !state.loading;
  });
  if (!provider) {
    root.loading = playlistCatalogHasPendingPages();
    return false;
  }
  loadPlaylistCatalogProviderPage(provider, reason || 'background').finally(function () {
    if (playlistCatalogSyncState !== root || !playlistCatalogHasPendingPages()) {
      root.loading = false;
      renderUserPlaylistsList({ preserveScroll: true });
      return;
    }
    if (root.timer) clearTimeout(root.timer);
    root.timer = setTimeout(function () {
      root.timer = 0;
      requestNextPlaylistCatalogPage('background');
    }, 180);
  });
  return true;
}
async function refreshUserPlaylists(force) {
  beginPlaylistCoverSession();
  if (typeof refreshBuiltInPlaylists === 'function') await refreshBuiltInPlaylists(!!force);
  // Keep old usable rows on a same-account network failure, but never merge
  // another account's private catalog into a partial replacement snapshot.
  ['netease', 'qq', 'kugou', 'qishui'].forEach(function (provider) {
    var state = playlistCatalogSyncState.providers && playlistCatalogSyncState.providers[provider];
    if (!state || !state.accountKey || state.accountKey === playlistCatalogAccountKey(provider)) return;
    setPlaylistCatalogProviderArray(provider, []);
    userPlaylists = userPlaylists.filter(function (playlist) { return normalizePlaylistProvider(playlist.provider) !== provider; });
    if (provider === 'netease') { myPodcastCollections = []; myPodcastItems = {}; }
    playlistCatalogRevision++;
  });
  if (!loginStatus.loggedIn && !qqLoginStatus.loggedIn && !kugouLoginStatus.loggedIn && !qishuiLoginStatus.loggedIn) {
    resetPlaylistPanelRenderLimit();
    userPlaylists = builtInPlaylists.slice();
    playlistCatalogRevision += 1;
    renderUserPlaylistsList({ animate: isPlaylistPanelVisibleForRender(), preserveScroll: true });
    var podcastListLoggedOut = document.getElementById('podcast-list');
    if (podcastListLoggedOut) podcastListLoggedOut.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">登录后显示我的播客</div>';
    return;
  }
  var catalogAuthorizationChanged = ['netease', 'qq', 'kugou', 'qishui'].some(function (provider) {
    var state = playlistCatalogSyncState.providers && playlistCatalogSyncState.providers[provider];
    return !!(state && typeof providerAuthEpoch === 'function' && state.authEpoch !== providerAuthEpoch(provider));
  });
  var catalogNeedsNewProvider = catalogAuthorizationChanged || playlistCatalogSyncState.loading && ['netease', 'qq', 'kugou', 'qishui'].some(function (provider) {
    var state = playlistCatalogSyncState.providers && playlistCatalogSyncState.providers[provider];
    return playlistCatalogProviderLoggedIn(provider) && (!state || !state.enabled);
  });
  if (playlistCatalogSyncState.loading && !catalogNeedsNewProvider && (!force || Date.now() - Number(playlistCatalogSyncState.startedAt || 0) < 1200)) {
    if (userPlaylists.length) renderUserPlaylistsList({ animate: isPlaylistPanelVisibleForRender(), preserveScroll: true });
    return;
  }
  if (!force && !catalogAuthorizationChanged && (userPlaylists.length || myPodcastCollections.length)) {
    var cachedAnimate = isPlaylistPanelVisibleForRender();
    renderUserPlaylistsList({ animate: cachedAnimate, preserveScroll: true });
    renderMyPodcastCollections({ animate: cachedAnimate });
    return;
  }
  var $pl = document.getElementById('pl-list');
  if ($pl) {
    if (!userPlaylists.length) $pl.innerHTML = miniQueueSkeleton();
    if (window.gsap) animateListItems($pl, '.mini-queue-skeleton', { x: 0, y: 6, stagger: 0.018, duration: 0.18, limit: 3 });
  }
  var $pod = document.getElementById('podcast-list');
  if ($pod) $pod.innerHTML = miniQueueSkeleton();
  if (playlistCatalogSyncState.timer) clearTimeout(playlistCatalogSyncState.timer);
  var token = playlistCatalogSyncState.token + 1;
  playlistCatalogSyncState = { token: token, loading: true, timer: 0, providers: {}, error: '', startedAt: Date.now() };
  ['netease', 'qq', 'kugou', 'qishui'].forEach(function (provider) {
    // Retain usable rows while refreshing, including when the network fails.
    playlistCatalogSyncState.providers[provider] = {
      enabled: playlistCatalogProviderLoggedIn(provider),
      authEpoch: typeof providerAuthEpoch === 'function' ? providerAuthEpoch(provider) : null,
      accountKey: playlistCatalogAccountKey(provider),
      loaded: playlistCatalogProviderArray(provider).length,
      total: playlistCatalogProviderArray(provider).length,
      totalKnown: false,
      nextOffset: 0,
      replaceOnFirstPage: true,
      hasMore: playlistCatalogProviderLoggedIn(provider),
      loading: false,
      error: ''
    };
  });
  if (force) playlistCatalogRevision += 1;
  var firstPageTasks = Object.keys(playlistCatalogSyncState.providers).filter(playlistCatalogProviderLoggedIn).map(function (provider) {
    return loadPlaylistCatalogProviderPage(provider, 'first-page');
  });
  var podcastAuthEpoch = typeof providerAuthEpoch === 'function' ? providerAuthEpoch('netease') : null;
  var podcastTask = loginStatus.loggedIn
    ? apiJson('/api/podcast/my', { timeoutMs: 12000 }).then(function (r) {
      if (playlistCatalogSyncState.token !== token || !loginStatus.loggedIn
        || (podcastAuthEpoch !== null && providerAuthEpoch('netease') !== podcastAuthEpoch)) return;
      myPodcastCollections = r && r.collections || [];
      renderMyPodcastCollections({ animate: isPlaylistPanelVisibleForRender() });
      scheduleUiWarmTask(prewarmPlaylistCatalogCovers, 500);
    }).catch(function (e) { console.warn('[PodcastCatalog]', e); })
    : Promise.resolve();
  await Promise.allSettled(firstPageTasks.concat([podcastTask]));
  scheduleUiWarmTask(prewarmPlaylistCatalogCovers, 500);
  if (playlistCatalogSyncState.token !== token) return;
  playlistCatalogSyncState.loading = playlistCatalogHasPendingPages();
  renderUserPlaylistsList({ animate: isPlaylistPanelVisibleForRender(), preserveScroll: true });
  if (playlistCatalogSyncState.loading) requestNextPlaylistCatalogPage('after-first-pages');
}
function queueNextIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/></svg>';
}
function queueRemoveIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
}
