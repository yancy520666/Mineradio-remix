// First-run guide: one tour of the features people look for first. Steps that
// live in the visual console preview DIY mode without saving it; closing the
// guide puts the mode, console tab and panels back as they were.
var visualGuideSteps = [
  {
    key: 'welcome', center: true,
    kicker: 'Welcome',
    title: '欢迎来到 Mineradio Remix',
    body: '搜一首歌，封面、歌词和粒子会随着音乐一起律动。花一分钟认识几个最常用的地方。',
    hint: '← → 翻页 · Enter 继续 · Esc 跳过'
  },
  {
    key: 'search', selector: '#search-box', place: 'below',
    kicker: 'Search',
    title: '从搜索开始',
    body: '输入歌名、歌手或专辑就能播放。登录平台账号后，会员曲目和你的歌单也会出现在这里。'
  },
  {
    key: 'quality', selector: '#quality-control', fallback: '.control-track', place: 'above', bottom: true,
    kicker: 'Quality',
    title: '一键切换音质',
    body: '歌名旁的小标签是当前音质。点一下，在标准、极高、无损、Hi-Res 之间切换，可选档位以平台和账号权限为准。',
    hint: '本地歌曲会自动隐藏这个标签'
  },
  {
    key: 'comments', selector: '.control-track', place: 'above', bottom: true,
    kicker: 'Comments',
    title: '点歌名，看评论',
    body: '歌曲详情里能看全部评论：在“最新 / 热门”之间切换，展开楼中楼回复；登录网易云后还可以点赞。'
  },
  {
    key: 'diy', selector: '#diy-mode-btn', place: 'below',
    kicker: 'DIY Mode',
    title: 'DIY 玩家模式',
    body: '打开后会出现视觉控制台、歌单面板和完整的播放控制。接下来带你看两个最常用的设置。'
  },
  {
    key: 'background', selector: '#fx-panel .bg-media-row', console: 'interface', place: 'left',
    kicker: 'Background',
    title: '换上你的背景',
    body: '在“界面 › 背景媒体”里选择图片或 MP4 视频，也可以直接用当前歌曲的封面原图，并按需裁切。'
  },
  {
    key: 'wallpaper', selector: '#fx-panel .wallpaper-engine-row', console: 'interface', place: 'left',
    kicker: 'Wallpaper Engine',
    title: '导入 Wallpaper Engine',
    body: '点“识别 / 导入”读取本机 Wallpaper Engine 的壁纸，选中即可作为播放器背景，之后还能调透明度和位置。'
  },
  {
    key: 'finish', selector: '#visual-guide-btn', place: 'below',
    kicker: 'All set',
    title: '准备好了',
    body: '右上角的“?”随时可以重新打开这份引导。现在去搜一首喜欢的歌吧。'
  }
];
function activeVisualGuideSteps() {
  return visualGuideSteps;
}
function visualGuideStepContent(step) {
  if (!currentCoverSong()) {
    if (step.key === 'quality') return {
      body: '先搜索并播放一首在线歌曲，歌名旁就能查看和切换音质。可选档位取决于平台和账号权限。',
      hint: '这里先认识音质入口；本地歌曲会隐藏这个标签'
    };
    if (step.key === 'comments') return {
      body: '这里是歌名和歌手区域。播放或选择一首歌曲后，点歌名即可打开详情，查看最新、热门评论和楼中楼回复。',
      hint: '还没有歌曲也可以继续引导，无需先登录'
    };
    if (step.key === 'background') return {
      body: '在“界面 › 背景媒体”里选择图片或视频，并按需裁切。播放歌曲后，也可以把歌曲封面设为背景。'
    };
  }
  return step;
}
function visualGuideWasSeen() {
  return startupGuideWasSeen('visual');
}
function markVisualGuideSeen() {
  markStartupGuideSeen('visual');
}
var startupVisualGuideScheduled = false;
function maybeRunStartupVisualGuide(source) {
  if (visualGuideWasSeen() || visualGuideActive || startupVisualGuideScheduled || immersiveMode || playing) return false;
  if (typeof originalProfileImportPending !== 'undefined' && originalProfileImportPending) return false;
  startupVisualGuideScheduled = true;
  setTimeout(function () {
    startupVisualGuideScheduled = false;
    if (visualGuideWasSeen() || visualGuideActive || immersiveMode || playing || originalProfileImportPending) return;
    var loginModal = document.getElementById('login-modal');
    var profileModal = document.getElementById('original-profile-modal');
    if ((loginModal && loginModal.classList.contains('show')) || (profileModal && profileModal.classList.contains('show'))) return;
    startVisualGuide({ source: source || 'startup' });
  }, source === 'splash' ? 3600 : 1400);
  return true;
}
function startVisualGuide(opts) {
  opts = opts || {};
  if (visualGuideActive) return;
  if (document.body.classList.contains('splash-active')) {
    setTimeout(function () { startVisualGuide(opts); }, 700);
    return;
  }
  if (immersiveMode) setImmersiveMode(false);
  markVisualGuideSeen();
  closeMiniQueue();
  closeUploadTip(false);
  visualGuideActive = true;
  if (typeof setFocusZone === 'function') setFocusZone(null);
  document.body.classList.add('visual-guide-active');
  visualGuideStep = 0;
  var fxPanel = document.getElementById('fx-panel');
  visualGuideState = {
    bottomWasVisible: !!(document.getElementById('bottom-bar') && document.getElementById('bottom-bar').classList.contains('visible')),
    bottomWasHidden: !!(document.getElementById('bottom-bar') && document.getElementById('bottom-bar').classList.contains('soft-hidden')),
    searchWasPeek: !!(document.getElementById('search-area') && document.getElementById('search-area').classList.contains('peek')),
    fxWasPeek: !!(fxPanel && fxPanel.classList.contains('peek')),
    fxWasShow: !!(fxPanel && fxPanel.classList.contains('show')),
    fxScrollTop: fxPanel ? fxPanel.scrollTop : 0,
    consoleFolds: [],
    fxWasOpen: !!(fxPanel && (fxPanel.classList.contains('show') || fxPanel.classList.contains('peek'))),
    fxTab: typeof fxPanelTab !== 'undefined' ? fxPanelTab : '',
    plWasPeek: !!(document.getElementById('playlist-panel') && document.getElementById('playlist-panel').classList.contains('peek')),
    mode: diyPlayerMode ? 'diy' : 'simple',
    diyPreview: false,
    consoleOpened: false,
    manual: !!opts.manual
  };
  var guide = document.getElementById('visual-guide');
  if (guide) {
    guide.classList.add('show');
    guide.setAttribute('aria-hidden', 'false');
  }
  renderVisualGuideStepMarks();
  if (!visualGuideResizeBound) {
    visualGuideResizeBound = true;
    window.addEventListener('resize', scheduleVisualGuidePositioning);
    window.addEventListener('scroll', positionVisualGuideStep, true);
    document.addEventListener('keydown', handleVisualGuideKey, true);
  }
  showVisualGuideStep(0);
}
function renderVisualGuideStepMarks() {
  var marks = document.getElementById('visual-guide-steps');
  if (!marks) return;
  marks.innerHTML = activeVisualGuideSteps().map(function () { return '<i></i>'; }).join('');
}
// Steps 6-7 need the visual console; elsewhere it goes back to how it was.
function setVisualGuideConsole(tab) {
  var fxPanel = document.getElementById('fx-panel');
  if (tab) {
    if (!diyPlayerMode && typeof applyDiyMode === 'function') {
      applyDiyMode(true, { save: false });
      visualGuideState.diyPreview = true;
    }
    if (fxPanel) {
      // Use the real peek state without changing the user's pin preference.
      setPeek(fxPanel, true, 'fx');
      visualGuideState.consoleOpened = true;
    }
    if (typeof setFxPanelTab === 'function' && fxPanelTab !== tab) setFxPanelTab(tab, { scroll: false });
    return;
  }
  if (visualGuideState.consoleOpened && fxPanel) {
    if (peekTimers.fx) { clearTimeout(peekTimers.fx); peekTimers.fx = null; }
    fxPanel.classList.toggle('show', !!visualGuideState.fxWasShow);
    fxPanel.classList.toggle('peek', !!visualGuideState.fxWasPeek);
    var fab = document.getElementById('fx-fab');
    if (fab) fab.classList.toggle('active', !!visualGuideState.fxWasOpen);
    (visualGuideState.consoleFolds || []).forEach(function (fold) {
      fold.classList.remove('open');
      var head = fold.querySelector('.fx-console-group-head');
      if (head) head.setAttribute('aria-expanded', 'false');
    });
    visualGuideState.consoleFolds = [];
    visualGuideState.consoleOpened = false;
    if (typeof setFxPanelTab === 'function' && visualGuideState.fxTab && fxPanelTab !== visualGuideState.fxTab) setFxPanelTab(visualGuideState.fxTab, { scroll: false });
    var state = visualGuideState;
    requestAnimationFrame(function () {
      if (visualGuideState === state && !state.consoleOpened) fxPanel.scrollTop = state.fxScrollTop || 0;
    });
  }
  if (visualGuideState.diyPreview && typeof applyDiyMode === 'function') {
    applyDiyMode(visualGuideState.mode === 'diy', { save: false });
    visualGuideState.diyPreview = false;
  }
}
function visualGuideKeepsBottomControlsVisible() {
  return !!(visualGuideActive && activeVisualGuideSteps()[visualGuideStep].bottom);
}
function visualGuideKeepsPeekOpen(key) {
  if (!visualGuideActive) return false;
  var step = activeVisualGuideSteps()[visualGuideStep];
  return !!(step && ((key === 'fx' && step.console) || (key === 'search' && step.key === 'search')));
}
function scrollVisualGuideConsoleTarget(step) {
  var panel = document.getElementById('fx-panel');
  var row = step && step.console && document.querySelector(step.selector);
  if (!panel || !row) return;
  var fold = row.closest('.fx-console-group');
  if (fold && !fold.classList.contains('open')) {
    visualGuideState.consoleFolds.push(fold);
    fold.classList.add('open');
    var head = fold.querySelector('.fx-console-group-head');
    if (head) head.setAttribute('aria-expanded', 'true');
  }
  // Tab scroll restoration runs in a frame too. Scroll only this panel after it,
  // never scrollIntoView: that also scrolls the clipped desktop window shell.
  requestAnimationFrame(function () {
    if (!visualGuideActive || activeVisualGuideSteps()[visualGuideStep] !== step) return;
    var panelRect = panel.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    var toolbar = panel.querySelector('.fx-console-toolbar');
    var inset = toolbar ? toolbar.offsetHeight : 0;
    var top = panel.scrollTop + rowRect.top - panelRect.top - inset - (panel.clientHeight - inset - rowRect.height) / 2;
    panel.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'instant' });
    scheduleVisualGuidePositioning();
  });
}
function prepareVisualGuideStep(step) {
  var search = document.getElementById('search-area');
  var bottom = document.getElementById('bottom-bar');
  var playlistPanel = document.getElementById('playlist-panel');
  document.body.classList.toggle('visual-guide-bottom', !!(step && step.bottom));
  document.body.classList.toggle('visual-guide-titlebar', !!(step && (step.key === 'diy' || step.key === 'finish')));
  if (typeof setShelfGuideCueActive === 'function') setShelfGuideCueActive(false);
  setVisualGuideConsole(step && step.console || '');
  if (step && step.selector === '#search-box') setPeek(search, true, 'search');
  else if (search && !visualGuideState.searchWasPeek && document.activeElement !== $input) setPeek(search, false, 'search');
  if (playlistPanel && !visualGuideState.plWasPeek) setPeek(playlistPanel, false, 'pl');
  if (step && step.bottom) {
    if (bottom) bottom.classList.add('visible');
    setControlsHidden(false);
    scheduleControlsHide();
  } else if (bottom && visualGuideState.bottomWasVisible) {
    setControlsHidden(visualGuideState.bottomWasHidden);
    scheduleControlsHide();
  } else if (bottom && !playing) {
    bottom.classList.remove('visible', 'soft-hidden');
    updateControlsChromeState();
  }
  if (step && step.console) scrollVisualGuideConsoleTarget(step);
}
var visualGuidePositionFrame = 0;
var visualGuidePositionUntil = 0;
function scheduleVisualGuidePositioning() {
  if (!visualGuideActive) return;
  visualGuidePositionUntil = performance.now() + 900;
  if (visualGuidePositionFrame) return;
  function track() {
    visualGuidePositionFrame = 0;
    if (!visualGuideActive) return;
    positionVisualGuideStep();
    if (performance.now() < visualGuidePositionUntil) visualGuidePositionFrame = requestAnimationFrame(track);
  }
  visualGuidePositionFrame = requestAnimationFrame(track);
}
function showVisualGuideStep(index) {
  var steps = activeVisualGuideSteps();
  visualGuideStep = Math.max(0, Math.min(steps.length - 1, index));
  var step = steps[visualGuideStep];
  prepareVisualGuideStep(step);
  var guide = document.getElementById('visual-guide');
  var card = document.getElementById('visual-guide-card');
  var isLast = visualGuideStep === steps.length - 1;
  if (guide) guide.setAttribute('data-step', step.key);
  var marks = document.querySelectorAll('#visual-guide-steps i');
  Array.prototype.forEach.call(marks, function (mark, i) {
    mark.classList.toggle('done', i < visualGuideStep);
    mark.classList.toggle('current', i === visualGuideStep);
  });
  var progress = document.getElementById('visual-guide-progress');
  var next = document.getElementById('visual-guide-next');
  var prev = document.getElementById('visual-guide-prev');
  if (progress) progress.textContent = (visualGuideStep + 1) + ' / ' + steps.length;
  if (next) next.textContent = isLast ? '开始使用' : (visualGuideStep === 0 ? '开始' : '下一步');
  if (prev) prev.hidden = visualGuideStep === 0;
  // Content cross-fades: out, swap, back in, while the spotlight glides.
  var apply = function () {
    if (!visualGuideActive || activeVisualGuideSteps()[visualGuideStep] !== step) return;
    var setText = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text || ''; };
    setText('visual-guide-index', String(visualGuideStep + 1).padStart(2, '0'));
    setText('visual-guide-kicker', step.kicker);
    setText('visual-guide-title', step.title);
    var content = visualGuideStepContent(step);
    setText('visual-guide-body', content.body);
    var hint = document.getElementById('visual-guide-hint');
    if (hint) { hint.textContent = content.hint || ''; hint.hidden = !content.hint; }
    if (card) {
      card.classList.toggle('is-hero', !!step.center);
      card.classList.remove('is-swapping');
    }
    scheduleVisualGuidePositioning();
  };
  if (card && card.classList.contains('is-ready')) {
    card.classList.add('is-swapping');
    clearTimeout(card._guideSwapTimer);
    card._guideSwapTimer = setTimeout(apply, 150);
  } else {
    if (card) card.classList.add('is-ready');
    apply();
  }
}
function guideTargetRect(step) {
  if (step && step.center) {
    return { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, right: innerWidth / 2, bottom: innerHeight / 2 };
  }
  var selectors = step ? [step.selector, step.fallback] : [];
  for (var i = 0; i < selectors.length; i++) {
    var target = selectors[i] ? document.querySelector(selectors[i]) : null;
    if (!target) continue;
    var rect = target.getBoundingClientRect();
    var visible = rect.width > 0 && rect.height > 0;
    var left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    var right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
    for (var node = target; node && visible; node = node.parentElement) {
      var style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) visible = false;
      if (node !== target && /(auto|scroll|hidden|clip)/.test(style.overflowX + ' ' + style.overflowY)) {
        var clip = node.getBoundingClientRect();
        left = Math.max(left, clip.left); right = Math.min(right, clip.right);
        top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
      }
    }
    if (visible && right > left && bottom > top) return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }
  return null;
}
// Card goes on the preferred side if it fits, otherwise on whichever side has room.
function visualGuideCardPosition(rect, step, cardW, cardH) {
  var gap = 18, margin = 16;
  if (step && step.center) return { left: (innerWidth - cardW) / 2, top: (innerHeight - cardH) / 2 };
  var spots = {
    below: { left: rect.left + rect.width / 2 - cardW / 2, top: rect.bottom + gap, fits: rect.bottom + gap + cardH <= innerHeight - margin },
    above: { left: rect.left + rect.width / 2 - cardW / 2, top: rect.top - gap - cardH, fits: rect.top - gap - cardH >= margin },
    left: { left: rect.left - gap - cardW, top: rect.top + rect.height / 2 - cardH / 2, fits: rect.left - gap - cardW >= margin },
    right: { left: rect.right + gap, top: rect.top + rect.height / 2 - cardH / 2, fits: rect.right + gap + cardW <= innerWidth - margin }
  };
  var order = [step && step.place || 'below', 'below', 'above', 'left', 'right'];
  var spot = null;
  for (var i = 0; i < order.length && !spot; i++) if (spots[order[i]].fits) spot = spots[order[i]];
  spot = spot || spots.below;
  return {
    left: Math.max(margin, Math.min(innerWidth - cardW - margin, spot.left)),
    top: Math.max(margin, Math.min(innerHeight - cardH - margin, spot.top))
  };
}
function positionVisualGuideStep() {
  if (!visualGuideActive) return;
  var guide = document.getElementById('visual-guide');
  var ring = document.getElementById('visual-guide-ring');
  var card = document.getElementById('visual-guide-card');
  if (!guide || !ring || !card) return;
  var step = activeVisualGuideSteps()[visualGuideStep];
  var rect = guideTargetRect(step);
  var center = !rect || !!(step && step.center);
  rect = rect || { left: innerWidth / 2, top: innerHeight / 2, right: innerWidth / 2, bottom: innerHeight / 2 };
  var pad = center ? 0 : 6;
  var left = Math.max(4, rect.left - pad);
  var top = Math.max(4, rect.top - pad);
  var width = Math.max(0, Math.min(innerWidth - 4, rect.right + pad) - left);
  var height = Math.max(0, Math.min(innerHeight - 4, rect.bottom + pad) - top);
  ring.classList.toggle('is-hidden', center);
  ring.style.left = left + 'px';
  ring.style.top = top + 'px';
  ring.style.width = width + 'px';
  ring.style.height = height + 'px';
  ring.style.borderRadius = step && step.console ? '14px' : (height > 70 ? '22px' : '16px');
  var cardW = card.offsetWidth || 340;
  var cardH = card.offsetHeight || 190;
  var spot = visualGuideCardPosition({ left: left, top: top, width: width, height: height, right: left + width, bottom: top + height }, center ? { center: true } : step, cardW, cardH);
  card.style.left = Math.round(spot.left) + 'px';
  card.style.top = Math.round(spot.top) + 'px';
}
function nextVisualGuideStep() {
  var steps = activeVisualGuideSteps();
  if (visualGuideStep >= steps.length - 1) {
    closeVisualGuide(true);
    return;
  }
  showVisualGuideStep(visualGuideStep + 1);
}
function prevVisualGuideStep() {
  if (visualGuideStep > 0) showVisualGuideStep(visualGuideStep - 1);
}
function handleVisualGuideKey(e) {
  if (!visualGuideActive || !e) return;
  if (e.key === 'ArrowRight' || e.key === 'Enter') nextVisualGuideStep();
  else if (e.key === 'ArrowLeft') prevVisualGuideStep();
  else if (e.key === 'Escape') closeVisualGuide(true);
  else return;
  e.preventDefault();
  e.stopPropagation();
}
function closeVisualGuide(markSeen) {
  var wasAutomatic = visualGuideState && visualGuideState.manual !== true;
  var guide = document.getElementById('visual-guide');
  visualGuideActive = false;
  if (markSeen) markVisualGuideSeen();
  if (guide) {
    guide.classList.remove('show');
    guide.setAttribute('aria-hidden', 'true');
  }
  var card = document.getElementById('visual-guide-card');
  if (card) clearTimeout(card._guideSwapTimer);
  if (typeof visualGuidePositionFrame !== 'undefined' && visualGuidePositionFrame) {
    cancelAnimationFrame(visualGuidePositionFrame);
    visualGuidePositionFrame = 0;
  }
  if (card) card.classList.remove('is-ready', 'is-swapping', 'is-hero');
  document.body.classList.remove('visual-guide-active', 'visual-guide-bottom', 'visual-guide-titlebar');
  document.body.classList.remove('fullscreen-diy-peek');
  var search = document.getElementById('search-area');
  var bottom = document.getElementById('bottom-bar');
  var fxPanel = document.getElementById('fx-panel');
  var playlistPanel = document.getElementById('playlist-panel');
  if (typeof setShelfGuideCueActive === 'function') setShelfGuideCueActive(false);
  if (visualGuideState && (visualGuideState.diyPreview || visualGuideState.consoleOpened)) setVisualGuideConsole('');
  if (search && !visualGuideState.searchWasPeek && document.activeElement !== $input) setPeek(search, false, 'search');
  if (fxPanel && !visualGuideState.fxWasPeek) setPeek(fxPanel, false, 'fx');
  if (playlistPanel && !visualGuideState.plWasPeek) setPeek(playlistPanel, false, 'pl');
  if (bottom && !visualGuideState.bottomWasVisible && !playing) bottom.classList.remove('visible', 'soft-hidden');
  if (bottom && visualGuideState.bottomWasVisible) setControlsHidden(visualGuideState.bottomWasHidden);
  if (typeof updateControlsChromeState === 'function') updateControlsChromeState();
  if (typeof scheduleControlsHide === 'function') scheduleControlsHide();
  if (wasAutomatic && markSeen && typeof maybeRunStartupLoginGuide === 'function') maybeRunStartupLoginGuide('visual-guide');
}
function handleVisualGuideSurfaceClick(e) {
  if (!visualGuideActive) return;
  if (e && e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#visual-guide-card'))) return;
  if (e && e.preventDefault) e.preventDefault();
  nextVisualGuideStep();
}
(function bindVisualGuideSurfaceClick() {
  var guide = document.getElementById('visual-guide');
  if (guide) guide.addEventListener('click', handleVisualGuideSurfaceClick);
})();
