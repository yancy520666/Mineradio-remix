/* Small maintained adapter around the vendored renderer; no external WE process. */
(function () {
  'use strict';
  var policy = window.MineradioSonicPerformancePolicy;
  var config = { profile: null, target: 60, eligible: false, paused: false };
  try {
    if (parent.MineradioSonicPerformance) config = parent.MineradioSonicPerformance.config();
  } catch (_) {}
  var root = null, state = 'loading', rendererName = '', meter = policy.createMeter(), signature = '';
  function send(type, data) { parent.postMessage(Object.assign({ type: type }, data), location.origin); }
  function health(next) {
    state = next;
    send('mineradio-sonic-performance-health', { state: next, gpu: rendererName });
  }
  function resize() {
    if (root) root.setDpr(window.__mineradioWorkshopDpr());
  }
  window.__mineradioWorkshopDpr = function () {
    return policy.pixelRatio(config.profile, innerWidth, innerHeight, devicePixelRatio);
  };
  function apply(next) {
    if (!next || !Number.isFinite(next.target) || next.target < 1 || next.target > 240) return;
    var key = JSON.stringify(next);
    if (key === signature) return;
    signature = key; config = next;
    meter.reset(performance.now()); resize();
    if (window.wallpaperPropertyListener) window.wallpaperPropertyListener.applyGeneralProperties({ fps: config.target });
  }
  window.__mineradioWorkshopCreated = function (value) {
    root = value;
    var renderer = root.gl, gl = renderer.getContext(), canvas = renderer.domElement;
    try {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      rendererName = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').slice(0, 240);
    } catch (_) {}
    canvas.addEventListener('webglcontextlost', function () { meter.reset(performance.now()); health('lost'); });
    canvas.addEventListener('webglcontextrestored', function () { meter.reset(performance.now()); health('recovering'); });
    var render = renderer.render;
    renderer.render = function () {
      var result = render.apply(this, arguments);
      if (!gl.isContextLost()) {
        if (state !== 'ready') health('ready');
        var sample = meter.frame(performance.now(), config.target, config.eligible && !document.hidden);
        if (sample) send('mineradio-sonic-performance-sample', { sample: sample });
      }
      return result;
    };
    resize();
    apply(config);
  };
  // R3F remains in demand mode. The timer limits actual invalidations, including
  // fixed caps on high-refresh screens, and stops drawing while minimized.
  window.__mineradioWorkshopSchedule = function (invalidate, fps) {
    var raf = 0, due = 0, stopped = false;
    function frame(now) {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      if (config.paused) { due = 0; return; }
      var interval = fps > 0 ? 1000 / fps : 0;
      if (!due || now + 0.5 >= due) {
        invalidate();
        due = interval ? Math.max(due + interval, now) : 0;
      }
    }
    raf = requestAnimationFrame(frame);
    return function () { stopped = true; cancelAnimationFrame(raf); };
  };
  window.__mineradioWorkshopPerformance = {
    initialGrid: config.profile ? config.profile.gridSize : 320,
    // Diagnostics expose the renderer only inside this local trusted iframe.
    snapshot: function () { return { config: config, state: state, gpu: rendererName,
      width: root && root.gl.domElement.width, height: root && root.gl.domElement.height,
      triangles: root && root.gl.info.render.triangles, calls: root && root.gl.info.render.calls }; }
  };
  window.addEventListener('message', function (event) {
    if (event.source === parent && event.origin === location.origin && event.data &&
        event.data.type === 'mineradio-sonic-performance-config') apply(event.data.config);
  });
  window.addEventListener('resize', resize);
  window.addEventListener('error', function () { health('failed'); });
  window.addEventListener('unhandledrejection', function () { health('failed'); });
  document.addEventListener('webglcontextcreationerror', function () { health('failed'); }, true);
})();
