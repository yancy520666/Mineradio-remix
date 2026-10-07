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
    body: '打开后会出现视觉控制台、歌单面板和完整的播放控制。接下来带你看看视觉预设、背景和歌单架。'
  },
  {
    key: 'presets', selector: '#preset-grid', items: 4, compactItems: 2, console: 'home', place: 'left',
    kicker: 'Visual Presets',
    title: '一键换一套视觉',
    body: '“常用 › 视觉预设”里有星河、唱片、星球等整套场景，点一下，粒子、光效和背景氛围会一起换掉。',
    hint: '换完不满意，随时点回原来的预设'
  },
  {
    key: 'aero', selector: '#t-aeroWaterTheme', console: 'interface', place: 'left', demo: 'aero-water',
    kicker: 'Optional Theme',
    title: '可选主题：Aero 水光',
    body: '给按钮加上玻璃反光、弹性按压和水光效果。默认关闭，喜欢这种风格再开启；水光颜色里还能选择不同效果。',
    hint: '界面 › 玻璃与左栏里随时可以开关；不会自动改变已保存的选择'
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
    key: 'shelf', selector: '#shelf-seg', console: 'shelf', place: 'left', demo: 'shelf-modes',
    kicker: 'Playlist Shelf',
    title: '3D 歌单架：侧栏或舞台',
    body: '“歌单架”页可以选两种摆法：侧栏把歌单卡片收在画面右侧，不挡歌词；舞台让卡片在画面下方横向铺开，中间那张最醒目。'
  },
  {
    key: 'shelf-summon', center: true, demo: 'shelf-summon',
    kicker: 'Right Click',
    title: '右键空白处，呼出歌单架',
    body: '侧栏模式下，在播放画面的空白处点鼠标右键，歌单架会从右侧滑出；再点一次右键就收起。舞台模式保持横向展示，不使用这个右键开关。',
    hint: '歌单架被关掉时，右键也会把它切回侧栏'
  },
  {
    key: 'login', selector: '#login-node-graph', place: 'below', login: true, nextLabel: '去连线登录',
    kicker: 'Connect',
    title: '最后，连线登录音乐平台',
    body: '按住平台右边的小圆点，把线拖到中间的 MR 接口后松手，面板下方会展开官方二维码，用对应的手机 App 扫码确认即可。',
    hint: '右上角的“?”随时可以重看这份引导'
  }
];
function activeVisualGuideSteps() {
  return visualGuideSteps;
}
function visualGuideStepContent(step) {
  if (step.key === 'login' && typeof hasAnyPlatformLogin === 'function' && hasAnyPlatformLogin()) return {
    body: '已接入的平台会一直连着线。想再接一个平台，就把它右边的小圆点拖到中间的 MR 接口，再用手机 App 扫码确认。',
    hint: step.hint
  };
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
    // Panels that slide in can finish after the tracking window on a busy frame.
    document.addEventListener('transitionend', function (e) {
      if (visualGuideActive && !(e.target && e.target.closest && e.target.closest('#visual-guide'))) scheduleVisualGuidePositioning();
    }, true);
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
    var top = panel.scrollTop + rowRect.top - panelRect.top - inset - Math.max(0, (panel.clientHeight - inset - rowRect.height) / 2);
    panel.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'instant' });
    scheduleVisualGuidePositioning();
  });
}
function prepareVisualGuideStep(step) {
  var search = document.getElementById('search-area');
  var bottom = document.getElementById('bottom-bar');
  var playlistPanel = document.getElementById('playlist-panel');
  document.body.classList.toggle('visual-guide-bottom', !!(step && step.bottom));
  document.body.classList.toggle('visual-guide-titlebar', !!(step && step.key === 'diy'));
  if (typeof setShelfGuideCueActive === 'function') setShelfGuideCueActive(false);
  setVisualGuideConsole(step && step.console || '');
  setVisualGuideLogin(!!(step && step.login));
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
// Small looping illustrations inside the card, for things the guide cannot
// show on the real screen (the 3D shelf is empty until there are playlists).
var visualGuideDemos = {
  'aero-water': '<div class="vg-aero-choice"><button id="visual-guide-aero-toggle" type="button" onclick="toggleVisualGuideAeroTheme()" aria-pressed="false">开启水光</button><span>可选 · 也可以直接下一步</span></div>',
  'shelf-modes': '<div class="vg-demo vg-demo-modes" aria-hidden="true">' +
    '<div class="vg-mini is-side"><div class="vg-mini-screen"><i></i><i></i><i></i></div><span>侧栏</span></div>' +
    '<div class="vg-mini is-stage"><div class="vg-mini-screen"><i></i><i></i><i></i><i></i><i></i></div><span>舞台</span></div>' +
    '</div>',
  'shelf-summon': '<div class="vg-demo vg-demo-summon" aria-hidden="true">' +
    '<div class="vg-mini-screen"><span class="vg-mouse"><b></b></span><span class="vg-click"></span>' +
    '<span class="vg-shelf"><i></i><i></i><i></i></span></div>' +
    '</div>'
};
function renderVisualGuideDemo(name) {
  var slot = document.getElementById('visual-guide-demo');
  if (!slot) return;
  var html = name && visualGuideDemos[name] || '';
  if (slot.getAttribute('data-demo') === (name || '')) { updateVisualGuideAeroChoice(); return; }
  slot.setAttribute('data-demo', name || '');
  slot.innerHTML = html;
  slot.hidden = !html;
  updateVisualGuideAeroChoice();
  var card = document.getElementById('visual-guide-card');
  if (card) card.classList.remove('is-compact');
}
function updateVisualGuideAeroChoice() {
  var button = document.getElementById('visual-guide-aero-toggle');
  if (!button) return;
  var on = !!(typeof fx !== 'undefined' && fx && fx.aeroWaterTheme);
  button.textContent = on ? '关闭水光' : '开启水光';
  button.setAttribute('aria-pressed', String(on));
}
function toggleVisualGuideAeroTheme() {
  if (!visualGuideActive || activeVisualGuideSteps()[visualGuideStep].key !== 'aero') return;
  if (typeof toggleFx === 'function') toggleFx('aeroWaterTheme');
  updateVisualGuideAeroChoice();
  scheduleVisualGuidePositioning();
}
function visualGuideLoginProvider() {
  var order = typeof loginWorkflowProviderOrder === 'function' ? loginWorkflowProviderOrder() : ['netease', 'qq', 'kugou', 'qishui'];
  for (var i = 0; i < order.length; i++) {
    if (!(typeof providerHasLiveLogin === 'function' && providerHasLiveLogin(order[i]))) return order[i];
  }
  return order[0] || 'netease';
}
function visualGuideLoginParts() {
  var graph = document.getElementById('login-node-graph');
  var provider = (visualGuideState && visualGuideState.loginProvider) || 'netease';
  return {
    port: graph && graph.querySelector('[data-login-provider-output="' + provider + '"]'),
    mrPort: graph && graph.querySelector('[data-login-mr-target="mr"]')
  };
}
// The login step opens the real panel and plays a ghost drag from one
// platform's port to MR, in the same shape the panel draws while dragging.
function setVisualGuideLogin(on, keepOpen) {
  var modal = document.getElementById('login-modal');
  if (on) {
    if (!visualGuideState.loginOpened && !(modal && modal.classList.contains('show')) && typeof showLoginModal === 'function') {
      visualGuideState.loginProvider = visualGuideLoginProvider();
      showLoginModal({ provider: visualGuideState.loginProvider, guided: true, source: 'visual-guide' });
      visualGuideState.loginOpened = true;
    } else if (!visualGuideState.loginProvider) {
      visualGuideState.loginProvider = typeof loginProvider !== 'undefined' ? loginProvider : 'netease';
    }
    // Reaching this step counts as the login introduction.
    if (typeof markStartupGuideSeen === 'function') markStartupGuideSeen('login');
    startVisualGuideWire();
    return;
  }
  stopVisualGuideWire();
  resetVisualGuideLoginLift(!!keepOpen);
  if (visualGuideState.loginOpened && !keepOpen && typeof closeLoginModal === 'function') closeLoginModal();
  visualGuideState.loginOpened = false;
}
var visualGuideWireFrame = 0;
function startVisualGuideWire() {
  var svg = document.getElementById('visual-guide-wire');
  if (!svg || visualGuideWireFrame) return;
  var ns = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';
  var path = document.createElementNS(ns, 'path');
  var halo = document.createElementNS(ns, 'circle');
  var plug = document.createElementNS(ns, 'circle');
  path.setAttribute('class', 'vg-wire-path');
  halo.setAttribute('class', 'vg-wire-halo');
  halo.setAttribute('r', '13');
  plug.setAttribute('class', 'vg-wire-plug');
  plug.setAttribute('r', '4.5');
  svg.appendChild(path);
  svg.appendChild(halo);
  svg.appendChild(plug);
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var started = performance.now();
  var cycle = 3200;
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var center = function (el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  function frame(now) {
    visualGuideWireFrame = requestAnimationFrame(frame);
    var parts = visualGuideLoginParts();
    var modal = document.getElementById('login-modal');
    if (!parts.port || !parts.mrPort || !modal || !modal.classList.contains('show')) {
      svg.style.opacity = '0';
      return;
    }
    var a = center(parts.port), b = center(parts.mrPort);
    // 0-40% drag, 40-75% connected, 75-100% fade and rest.
    var t = reduce ? 0.6 : ((now - started) % cycle) / cycle;
    var drag = ease(Math.min(1, t / 0.4));
    var lift = Math.sin(Math.PI * drag) * Math.min(26, Math.abs(b.x - a.x) * 0.18);
    var end = { x: a.x + (b.x - a.x) * drag, y: a.y + (b.y - a.y) * drag - lift };
    var linked = t >= 0.4;
    var fade = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.17);
    var appear = Math.min(1, t / 0.06);
    svg.style.opacity = String(Math.min(appear, fade) * Math.min(1, Number(getComputedStyle(modal).opacity) || 0));
    path.setAttribute('d', typeof workflowBezierPath === 'function' ? workflowBezierPath(a, end)
      : 'M ' + a.x + ' ' + a.y + ' L ' + end.x + ' ' + end.y);
    path.classList.toggle('is-linked', linked);
    plug.setAttribute('cx', end.x.toFixed(1));
    plug.setAttribute('cy', end.y.toFixed(1));
    var pulse = linked ? Math.min(1, (t - 0.4) / 0.12) : 0;
    halo.setAttribute('cx', b.x.toFixed(1));
    halo.setAttribute('cy', b.y.toFixed(1));
    halo.setAttribute('r', (8 + pulse * 10).toFixed(1));
    halo.style.opacity = String(linked ? (1 - pulse) * 0.9 + 0.25 : 0);
  }
  visualGuideWireFrame = requestAnimationFrame(frame);
}
function stopVisualGuideWire() {
  if (visualGuideWireFrame) cancelAnimationFrame(visualGuideWireFrame);
  visualGuideWireFrame = 0;
  var svg = document.getElementById('visual-guide-wire');
  if (svg) {
    svg.innerHTML = '';
    svg.style.opacity = '0';
  }
}
var visualGuidePositionFrame = 0;
var visualGuidePositionUntil = 0;
function scheduleVisualGuidePositioning() {
  if (!visualGuideActive) return;
  // The login panel's open tween and lift run longer than a console slide.
  var step = activeVisualGuideSteps()[visualGuideStep];
  visualGuidePositionUntil = Math.max(visualGuidePositionUntil, performance.now() + (step && step.login ? 1300 : 900));
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
  if (next) next.textContent = isLast ? (step.nextLabel || '开始使用') : (visualGuideStep === 0 ? '开始' : '下一步');
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
    renderVisualGuideDemo(step.demo);
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
  if (step && step.items) {
    // Frame the first few entries of a long list instead of the whole panel.
    var list = document.querySelector(step.selector);
    var union = null;
    Array.prototype.slice.call(list ? list.children : [], 0, step.compactItems && innerHeight <= 620 ? step.compactItems : step.items).forEach(function (el) {
      var r = visibleGuideRect(el);
      if (!r) return;
      union = union ? { left: Math.min(union.left, r.left), top: Math.min(union.top, r.top), right: Math.max(union.right, r.right), bottom: Math.max(union.bottom, r.bottom) } : r;
    });
    if (union) {
      union.width = union.right - union.left;
      union.height = union.bottom - union.top;
      return union;
    }
  }
  var selectors = step ? [step.selector, step.fallback] : [];
  for (var i = 0; i < selectors.length; i++) {
    var target = selectors[i] ? document.querySelector(selectors[i]) : null;
    var found = target ? visibleGuideRect(target) : null;
    if (found) return found;
  }
  return null;
}
function visibleGuideRect(target) {
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
      // The console's sticky search and tabs cover the top of its scroll area.
      var toolbar = node.id === 'fx-panel' && node.querySelector('.fx-console-toolbar');
      if (toolbar) top = Math.max(top, toolbar.getBoundingClientRect().bottom);
    }
  }
  if (visible && right > left && bottom > top) return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
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
  var fits = !!spot;
  spot = spot || spots.below;
  return {
    left: Math.max(margin, Math.min(innerWidth - cardW - margin, spot.left)),
    top: Math.max(margin, Math.min(innerHeight - cardH - margin, spot.top)),
    fits: fits
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
  var ringRect = { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
  var spot = visualGuideCardPosition(ringRect, center ? { center: true } : step, cardW, cardH);
  // When the illustration makes the card too tall to sit beside its target
  // (small windows, full-width console), drop the illustration, not the target.
  var demo = document.getElementById('visual-guide-demo');
  if (demo && !demo.hidden && !center && !step.login) {
    var compact = card.classList.contains('is-compact');
    var demoH = compact ? (card._guideDemoH || 0) : demo.offsetHeight + (parseFloat(getComputedStyle(demo).marginTop) || 0);
    if (!compact) card._guideDemoH = demoH;
    var fullSpot = compact ? visualGuideCardPosition(ringRect, step, cardW, cardH + demoH) : spot;
    var wantCompact = !fullSpot.fits;
    if (wantCompact !== compact) {
      card.classList.toggle('is-compact', wantCompact);
      cardH = card.offsetHeight || cardH;
      spot = visualGuideCardPosition(ringRect, step, cardW, cardH);
    }
  } else if (card.classList.contains('is-compact')) {
    card.classList.remove('is-compact');
  }
  if (step && step.login && !center) {
    var below = liftVisualGuideLogin(top, top + height, cardH);
    if (below != null) spot.top = Math.max(16, Math.min(innerHeight - cardH - 16, below));
  }
  card.style.left = Math.round(spot.left) + 'px';
  card.style.top = Math.round(spot.top) + 'px';
}
// On short windows the login panel moves up so the card fits under the wires.
// The mask's padding is transitioned, so the panel glides there; the card goes
// straight to where the panel will settle, without first trying another side.
function liftVisualGuideLogin(ringTop, ringBottom, cardH) {
  var mask = document.getElementById('login-modal');
  if (!mask) return null;
  var lifted = parseFloat(mask.getAttribute('data-guide-lift'));
  if (isNaN(lifted)) {
    mask.setAttribute('data-guide-base', String(parseFloat(getComputedStyle(mask).paddingBottom) || 0));
    mask.setAttribute('data-guide-lift', '0');
    mask.style.transition = 'padding-bottom .6s cubic-bezier(.22, 1, .36, 1)';
    lifted = 0;
  }
  var base = parseFloat(mask.getAttribute('data-guide-base')) || 0;
  // A centered panel moves up by half of the extra bottom padding.
  var current = Math.max(0, (parseFloat(getComputedStyle(mask).paddingBottom) || 0) - base) / 2;
  var naturalTop = ringTop + current;
  var naturalBottom = ringBottom + current;
  var shift = Math.max(0, Math.min(naturalTop - 16, naturalBottom + 18 + cardH + 16 - innerHeight));
  if (Math.abs(shift - lifted) > 1) {
    mask.setAttribute('data-guide-lift', shift.toFixed(1));
    mask.style.paddingBottom = (base + shift * 2) + 'px';
    scheduleVisualGuidePositioning();
  }
  return naturalBottom - shift + 18;
}
function resetVisualGuideLoginLift(glide) {
  var mask = document.getElementById('login-modal');
  if (!mask || !mask.hasAttribute('data-guide-lift')) return;
  mask.removeAttribute('data-guide-lift');
  mask.removeAttribute('data-guide-base');
  if (!glide) mask.style.transition = '';
  mask.style.paddingBottom = '';
  if (glide) setTimeout(function () {
    if (!mask.hasAttribute('data-guide-lift')) mask.style.transition = '';
  }, 700);
}
function nextVisualGuideStep() {
  var steps = activeVisualGuideSteps();
  if (visualGuideStep >= steps.length - 1) {
    // Finishing on the login step leaves the panel open to connect for real.
    closeVisualGuide(true, { keepLogin: !!steps[visualGuideStep].login });
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
function closeVisualGuide(markSeen, opts) {
  opts = opts || {};
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
  renderVisualGuideDemo('');
  if (visualGuideState) setVisualGuideLogin(false, opts.keepLogin);
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
