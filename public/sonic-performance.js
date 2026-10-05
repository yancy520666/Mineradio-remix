(function (global) {
  'use strict';
  var policy = global.MineradioSonicPerformancePolicy;
  var key = 'mineradio-sonic-performance-v1';
  var preferences = { enabled: false, manualQuality: false, dismissed: false, hardwarePrompted: false };
  try {
    var saved = JSON.parse(localStorage.getItem(key) || '{}');
    Object.keys(preferences).forEach(function (name) { preferences[name] = saved[name] === true; });
  } catch (_) {}
  var governor = policy.createGovernor(), meter = policy.createMeter();
  var active = 0, latest = null, recommendation = '', health = {}, gpu = {};
  var lastConfig = '', stageAttached = false, stageRestore = null;
  var noticeUntil = 0, noticeText = '';
  var healthClocks = {};
  var hardwareClock = policy.createVisibleClock(), noticeVisible = false, noticeAnimation = null;
  function now() { return performance.now(); }
  function preset() { return global.fx && [7, 8].indexOf(Number(global.fx.preset)) >= 0 ? Number(global.fx.preset) : 0; }
  function save() { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch (_) {} }
  function eligible() {
    var state = global.desktopRuntimeState;
    return visible() && document.hasFocus() && !(state && state.focused === false) &&
      !document.body.classList.contains('splash-active') &&
      !document.body.classList.contains('visual-guide-active');
  }
  // The WE version follows an explicitly chosen quality tier; the topography
  // stage keeps its own quality caps unless performance-first is switched on.
  function currentProfile() {
    return policy.profile(global.fx && global.fx.performanceQuality,
      preferences.enabled || preferences.manualQuality, preferences.enabled ? governor.reduction() : 0);
  }
  function stageProfile() {
    return preferences.enabled ? currentProfile() : null;
  }
  function visible() {
    var state = global.desktopRuntimeState;
    return !document.hidden && !(state && (state.minimized || state.visible === false));
  }
  function config() {
    var p = preset() === 7 ? stageProfile() : currentProfile();
    var display = typeof global.estimatedDisplayRefreshHz === 'function' ? Math.round(global.estimatedDisplayRefreshHz()) : 60;
    // Whole-Hz fluctuations must not reset the measurement window every frame.
    display = [30, 60, 75, 90, 120, 144, 165, 240].reduce(function (best, hz) {
      return Math.abs(hz - display) < Math.abs(best - display) ? hz : best;
    }, 60);
    var mode = global.fx && global.fx.foregroundFpsMode;
    return { profile: p, target: policy.targetFps(mode, p, display), fpsLimit: policy.fpsLimit(mode, p, display),
      eligible: eligible(), paused: typeof global.isDeepBackgroundMode === 'function'
        ? global.isDeepBackgroundMode() : !!document.hidden };
  }
  function readGpu(gl) {
    try {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').slice(0, 240);
    } catch (_) { return ''; }
  }
  function refresh() {
    governor.reset(); meter.reset(now()); hardwareClock.reset(now());
    latest = null; recommendation = ''; lastConfig = ''; noticeUntil = 0;
    if (global.MineradioSonicWorkshop) global.MineradioSonicWorkshop.pushProperties(true);
    renderUi();
  }
  function setEnabled(value) {
    preferences.enabled = value === true;
    preferences.dismissed = !preferences.enabled;
    save(); refresh();
  }
  function dismiss() { preferences.dismissed = true; recommendation = ''; save(); renderUi(); }
  function qualityChanged() { preferences.manualQuality = true; save(); refresh(); }
  function sample(value) {
    if (!preset() || !eligible() || !policy.validSample(value)) return;
    var target = config().target;
    if (preset() === 7) target = Math.round(Math.min(target,
      global.renderPerfState && global.renderPerfState.targetFps || target));
    if (value.target !== target) return;
    latest = value;
    var action = governor.sample(value, now(), global.fx.performanceQuality, preferences.enabled);
    if (action === 'recommend' && !preferences.dismissed) recommendation = 'load';
    else if (recommendation === 'load') recommendation = '';
    if (action === 'lower' || action === 'restore') {
      noticeText = action === 'lower' ? '已降低一级背景细节。运行稳定后会逐步恢复。' : '画面运行稳定，已恢复一级背景细节。';
      noticeUntil = now() + 8000;
      meter.reset(now()); lastConfig = '';
      if (global.MineradioSonicWorkshop) global.MineradioSonicWorkshop.pushProperties(true);
    }
    renderUi();
  }
  function status(which, state, rendererName) {
    if (rendererName) gpu[which] = String(rendererName).slice(0, 240);
    health[which] = { state: state, since: now() };
    healthClocks[which] = policy.createVisibleClock();
    healthClocks[which].reset(now());
    if (state !== 'ready') { governor.clearEvidence(); hardwareClock.reset(now()); }
    if (state === 'ready') meter.reset(now());
    renderUi();
  }
  function attachStage() {
    if (stageAttached || !global.renderer) return;
    stageAttached = true;
    var canvas = global.renderer.domElement;
    var gl = global.renderer.getContext();
    gpu[7] = readGpu(gl);
    stageRestore = gl.getExtension('WEBGL_lose_context');
    canvas.addEventListener('webglcontextlost', function () { status(7, 'lost'); });
    canvas.addEventListener('webglcontextrestored', function () { status(7, 'recovering'); });
  }
  function stageFrame() {
    if (preset() !== 7) return;
    attachStage();
    if (global.renderer.getContext().isContextLost()) return;
    if (!health[7] || health[7].state !== 'ready') status(7, 'ready');
    healthClocks[7].reset(now());
    var c = config();
    // The main scene's own fixed cadence can be slower than the wallpaper target.
    var actualTarget = Math.min(c.target, global.renderPerfState && global.renderPerfState.targetFps || c.target);
    // Adaptive mode lowers its own cadence on purpose, so it is not a frame drop.
    var adaptive = global.fx && String(global.fx.foregroundFpsMode) === 'adaptive';
    var result = meter.frame(now(), Math.round(actualTarget), c.eligible && !adaptive);
    if (result) sample(result);
  }
  function retry() {
    var which = preset();
    if (which === 8 && global.MineradioSonicWorkshop) {
      status(8, 'loading');
      global.MineradioSonicWorkshop.clear();
      global.MineradioSonicWorkshop.onPresetChange(0, 8);
    } else if (which === 7 && global.renderer) {
      status(7, 'recovering');
      var gl = global.renderer.getContext();
      if (gl.isContextLost() && stageRestore) stageRestore.restoreContext();
      else { global.MineradioSonicTopography.clear(); meter.reset(now()); }
    }
    renderUi();
  }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function noticePlacement(banner) {
    var panel = document.getElementById('fx-panel');
    var open = panel && panel.classList && panel.classList.contains &&
      (panel.classList.contains('show') || panel.classList.contains('peek'));
    var controls = document.getElementById('sonic-performance-controls');
    var group = controls && controls.closest && controls.closest('.fx-fold');
    var inline = !!(open && panel.getAttribute('data-active-tab') === 'system' &&
      group && group.classList.contains('open'));
    var parent = inline ? controls : document.body;
    if (banner.parentElement !== parent && parent.appendChild) parent.appendChild(banner);
    banner.classList.toggle('sonic-performance-inline', inline);
    return !open || inline;
  }
  function setNoticeVisible(banner, value) {
    if (noticeVisible === value) return;
    noticeVisible = value;
    if (noticeAnimation) noticeAnimation.cancel();
    banner.setAttribute('aria-hidden', String(!value));
    banner.inert = !value;
    if (!value && banner.contains && banner.contains(document.activeElement)) {
      var toggle = document.getElementById('sonic-performance-toggle');
      if (toggle && banner.parentElement === document.getElementById('sonic-performance-controls'))
        toggle.focus({ preventScroll: true });
      else if (global.renderer) global.renderer.domElement.focus({ preventScroll: true });
    }
    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!banner.animate || reduced) { banner.hidden = !value; return; }
    banner.hidden = false;
    var frames = [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }];
    noticeAnimation = banner.animate(value ? frames : frames.slice().reverse(),
      { duration: value ? 240 : 160, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    noticeAnimation.finished.then(function () { if (!noticeVisible) banner.hidden = true; }).catch(function () {});
  }
  function renderUi() {
    var button = document.getElementById('sonic-performance-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(preferences.enabled));
      button.classList.toggle('on', preferences.enabled);
    }
    var which = preset(), h = health[which];
    var error = h && ['failed', 'lost', 'recovering'].indexOf(h.state) >= 0;
    var statusEl = document.getElementById('sonic-performance-status');
    var p = which === 7 ? stageProfile() : currentProfile();
    var detail = !which ? '适用于两款音域回响；导入的 Wallpaper Engine 壁纸独立运行。' :
      (preferences.enabled ? '自适应已开启' : '自适应已关闭') + ' · ' +
      (p && p.tier < 4 ? ['最低', '低', '中', '高'][p.tier] + '细节' : '原始细节') +
      (latest ? ' · ' + Math.round(latest.fps) + ' / ' + Math.round(latest.target) + ' FPS' : '');
    setText(statusEl, detail);
    var banner = document.getElementById('sonic-performance-notice');
    if (!banner) return;
    var placementVisible = noticePlacement(banner);
    var showNotice = !!which && visible() && placementVisible &&
      !document.body.classList.contains('splash-active') &&
      !document.body.classList.contains('visual-guide-active') && !!(error || recommendation || noticeUntil > now());
    setNoticeVisible(banner, showNotice);
    // Pending advice on another settings tab must not consume the one-time tip.
    if (showNotice && !error && (recommendation === 'gpu' || recommendation === 'software') &&
        !preferences.hardwarePrompted) {
      preferences.hardwarePrompted = true; save();
    }
    var title = error ? '背景渲染需要恢复' : recommendation ? '让画面更流畅' : '自适应画质';
    setText(document.getElementById('sonic-performance-title'), title);
    var text = error ? (h.state === 'failed' ? '壁纸渲染未能恢复，可重试或查看诊断。' :
      '壁纸渲染中断，正在等待恢复…') :
      recommendation === 'load' ? '音域回响持续掉帧。开启自适应后会按需降低细节，稳定后逐步恢复。' :
      recommendation === 'gpu' ? '当前背景使用核显渲染。可开启自适应，在需要时降低细节，稳定后逐步恢复。' :
      recommendation === 'software' ? '当前背景使用软件渲染。可尝试开启自适应降低负载；若仍卡顿，请检查图形加速设置。' : noticeText;
    setText(document.getElementById('sonic-performance-message'), text);
    document.getElementById('sonic-performance-enable').hidden = !recommendation || !!error;
    document.getElementById('sonic-performance-keep').hidden = !recommendation || !!error;
    document.getElementById('sonic-performance-retry').hidden = !error;
    document.getElementById('sonic-performance-diagnostics-button').hidden = !error;
    var close = document.getElementById('sonic-performance-close');
    if (close) close.hidden = !!error;
    var diagnostics = document.getElementById('sonic-performance-diagnostics');
    if (!error) diagnostics.hidden = true;
    // Rewriting unchanged text every tick would drop the user's selection.
    setText(diagnostics, '渲染器：' + (gpu[which] || '未能读取') + '；状态：' + (h ? h.state : 'unknown') +
      '。WebGL 初始化或恢复失败时，降低画质未必能解决；可检查显卡驱动及系统图形设置。');
  }
  function tick() {
    var next = preset();
    if (next !== active) {
      active = next; governor.reset(); meter.reset(now()); hardwareClock.reset(now());
      latest = null; recommendation = ''; lastConfig = ''; noticeUntil = 0;
    }
    if (!active) { renderUi(); return; }
    attachStage();
    var c = config(), frame = document.querySelector('#sonic-workshop-layer iframe');
    if (active === 8 && frame && frame.contentWindow) {
      var signature = JSON.stringify(c);
      if (signature !== lastConfig) {
        if (latest && latest.target !== c.target) {
          latest = null; if (recommendation === 'load') recommendation = ''; governor.clearEvidence();
        }
        lastConfig = signature;
        frame.contentWindow.postMessage({ type: 'mineradio-sonic-performance-config', config: c }, location.origin);
      }
      if (!health[8]) status(8, 'loading');
    }
    if (!c.eligible) { meter.reset(now()); governor.clearEvidence(); }
    var h = health[active];
    var hardwareElapsed = hardwareClock.advance(now(), c.eligible && h && h.state === 'ready');
    if (hardwareElapsed >= 5000 && !preferences.enabled && !preferences.dismissed &&
        !preferences.hardwarePrompted && !recommendation && typeof global.classifyRendererGpu === 'function') {
      var gpuClass = global.classifyRendererGpu(gpu[active]);
      if (gpuClass === 'integrated' || gpuClass === 'software') {
        recommendation = gpuClass === 'integrated' ? 'gpu' : 'software';
      }
    }
    // Successful draws reset this clock. Hidden time and suspended timer gaps
    // never count, including the first tick after a long background pause.
    if (h && h.state !== 'failed' && healthClocks[active]) {
      if (healthClocks[active].advance(now(), c.eligible && !c.paused) > 15000) h.state = 'failed';
    }
    renderUi();
  }
  global.addEventListener('message', function (event) {
    var frame = document.querySelector('#sonic-workshop-layer iframe');
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin || preset() !== 8) return;
    var data = event.data || {};
    if (data.type === 'mineradio-sonic-performance-draw') {
      if (!health[8] || health[8].state !== 'ready') status(8, 'ready');
      else healthClocks[8].reset(now());
    }
    if (data.type === 'mineradio-sonic-performance-sample') sample(data.sample);
    if (data.type === 'mineradio-sonic-performance-health' &&
        ['ready', 'lost', 'recovering', 'failed'].indexOf(data.state) >= 0) status(8, data.state, data.gpu);
  });
  global.MineradioSonicPerformance = {
    config: config, profile: currentProfile, stageProfile: stageProfile, stageFrame: stageFrame, retry: retry,
    beginWorkshop: function () { lastConfig = ''; latest = null; status(8, 'loading'); },
    toggle: function () { setEnabled(!preferences.enabled); }, setEnabled: setEnabled,
    dismiss: dismiss, qualityChanged: qualityChanged, refresh: refresh,
    closeNotice: function () {
      if (recommendation) dismiss();
      else { noticeUntil = 0; renderUi(); }
    },
    diagnostics: function () { document.getElementById('sonic-performance-diagnostics').hidden = false; },
    snapshot: function () { return { preferences: Object.assign({}, preferences), profile: currentProfile(),
      sample: latest, health: health, gpu: gpu, recommendation: !!recommendation, recommendationReason: recommendation }; }
  };
  setInterval(tick, 500);
})(window);
