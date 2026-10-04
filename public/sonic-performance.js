(function (global) {
  'use strict';
  var policy = global.MineradioSonicPerformancePolicy;
  var key = 'mineradio-sonic-performance-v1';
  var preferences = { enabled: false, manualQuality: false, dismissed: false };
  try {
    var saved = JSON.parse(localStorage.getItem(key) || '{}');
    Object.keys(preferences).forEach(function (name) { preferences[name] = saved[name] === true; });
  } catch (_) {}
  var governor = policy.createGovernor(), meter = policy.createMeter();
  var active = 0, latest = null, recommendation = false, health = {}, gpu = {};
  var lastConfig = '', stageAttached = false, stageRestore = null;
  var noticeUntil = 0, noticeText = '';
  var healthClocks = {};
  function now() { return performance.now(); }
  function preset() { return global.fx && [7, 8].indexOf(Number(global.fx.preset)) >= 0 ? Number(global.fx.preset) : 0; }
  function save() { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch (_) {} }
  function eligible() {
    var state = global.desktopRuntimeState;
    return visible() && document.hasFocus() && !(state && state.focused === false) &&
      !document.body.classList.contains('splash-active');
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
    governor.reset(); meter.reset(now()); latest = null; recommendation = false; lastConfig = '';
    if (global.MineradioSonicWorkshop) global.MineradioSonicWorkshop.pushProperties(true);
    renderUi();
  }
  function setEnabled(value) {
    preferences.enabled = value === true;
    if (preferences.enabled) preferences.dismissed = false;
    save(); refresh();
  }
  function dismiss() { preferences.dismissed = true; recommendation = false; save(); renderUi(); }
  function qualityChanged() { preferences.manualQuality = true; save(); refresh(); }
  function sample(value) {
    if (!preset() || !eligible() || !value || !Number.isFinite(value.fps) ||
        !Number.isFinite(value.target) || value.target < 1 || value.duration < 12000) return;
    latest = value;
    var action = governor.sample(value, now(), global.fx.performanceQuality, preferences.enabled);
    if (action === 'recommend' && !preferences.dismissed) recommendation = true;
    if (action === 'lower' || action === 'restore') {
      noticeText = action === 'lower' ? '已降低壁纸细节，优先保持流畅。' : '运行稳定，已恢复一级壁纸细节。';
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
      (preferences.enabled ? '流畅优先已开启' : '流畅优先已关闭') + ' · ' +
      (p && p.tier < 4 ? ['最低', '低', '中', '高'][p.tier] + '细节' : '原始细节') +
      (latest ? ' · ' + Math.round(latest.fps) + ' / ' + Math.round(latest.target) + ' FPS' : '');
    setText(statusEl, detail);
    var banner = document.getElementById('sonic-performance-notice');
    if (!banner) return;
    banner.hidden = !which || !(error || recommendation || noticeUntil > now());
    var text = error ? (h.state === 'failed' ? '壁纸渲染未能恢复，可重试或查看诊断。' :
      '壁纸渲染中断，正在等待恢复…') :
      recommendation ? '检测到音域回响持续掉帧。开启流畅优先，可降低细节换取流畅度。' : noticeText;
    setText(document.getElementById('sonic-performance-message'), text);
    document.getElementById('sonic-performance-enable').hidden = !recommendation || !!error;
    document.getElementById('sonic-performance-keep').hidden = !recommendation || !!error;
    document.getElementById('sonic-performance-retry').hidden = !error;
    document.getElementById('sonic-performance-diagnostics-button').hidden = !error;
    var diagnostics = document.getElementById('sonic-performance-diagnostics');
    if (!error) diagnostics.hidden = true;
    // Rewriting unchanged text every tick would drop the user's selection.
    setText(diagnostics, '渲染器：' + (gpu[which] || '未能读取') + '；状态：' + (h ? h.state : 'unknown') +
      '。WebGL 初始化或恢复失败时，降低画质未必能解决；可检查显卡驱动及系统图形设置。');
  }
  function tick() {
    var next = preset();
    if (next !== active) { active = next; governor.reset(); meter.reset(now()); latest = null; recommendation = false; lastConfig = ''; }
    if (!active) { renderUi(); return; }
    attachStage();
    var c = config(), frame = document.querySelector('#sonic-workshop-layer iframe');
    if (active === 8 && frame && frame.contentWindow) {
      var signature = JSON.stringify(c);
      if (signature !== lastConfig) {
        lastConfig = signature;
        frame.contentWindow.postMessage({ type: 'mineradio-sonic-performance-config', config: c }, location.origin);
      }
      if (!health[8]) status(8, 'loading');
    }
    if (!c.eligible) meter.reset(now());
    var h = health[active];
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
    diagnostics: function () { document.getElementById('sonic-performance-diagnostics').hidden = false; },
    snapshot: function () { return { preferences: Object.assign({}, preferences), profile: currentProfile(),
      sample: latest, health: health, gpu: gpu, recommendation: recommendation }; }
  };
  setInterval(tick, 500);
})(window);
