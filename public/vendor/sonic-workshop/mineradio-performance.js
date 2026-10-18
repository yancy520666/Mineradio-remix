/* Small maintained adapter around the vendored renderer; no external WE process. */
(function () {
  'use strict';
  var policy = window.MineradioSonicPerformancePolicy;
  var config = { profile: null, target: 60, fpsLimit: 0, eligible: false, paused: false };
  try {
    if (parent.MineradioSonicPerformance) config = parent.MineradioSonicPerformance.config(8);
  } catch (_) {}
  var root = null, state = 'loading', rendererName = '', meter = policy.createMeter(), signature = '';
  var lastDrawReport = 0, firstFrameSent = false;
  var generation = Number((String(location.search || '').match(/[?&]generation=(\d+)/) || [0, 0])[1]);
  function frameSignal(type) { send(type, { generation: generation }); }
  function send(type, data) { parent.postMessage(Object.assign({ type: type }, data), location.origin); }
  function health(next) {
    if (state === next) return;
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
    if (window.wallpaperPropertyListener) window.wallpaperPropertyListener.applyGeneralProperties({ fps: config.fpsLimit || 0 });
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
      var result;
      try { result = render.apply(this, arguments); }
      catch (error) {
        if (state !== 'failed' && state !== 'lost') health('failed');
        if (!firstFrameSent) frameSignal('mineradio-sonic-workshop-frame-failed');
        throw error;
      }
      if (!gl.isContextLost()) {
        // Signal only after the real renderer submitted a nonempty scene, never on iframe load.
        var scene = arguments[0];
        if (!firstFrameSent && window.__mineradioWorkshopPropertiesReady && scene && scene.children && scene.children.length) {
          firstFrameSent = true;
          frameSignal('mineradio-sonic-workshop-first-frame');
        }
        var time = performance.now();
        if (state !== 'ready') { health('ready'); lastDrawReport = time; }
        else if (time - lastDrawReport >= 1000) {
          send('mineradio-sonic-performance-draw', {}); lastDrawReport = time;
        }
        var sample = meter.frame(time, config.target, config.eligible && !document.hidden, config.lossTarget);
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
      if (config.paused) due = 0;
      else {
        var interval = fps > 0 ? 1000 / fps : 0;
        if (!due || now + 0.5 >= due) {
          invalidate();
          due = interval ? Math.max(due + interval, now) : 0;
        }
      }
      // Let R3F queue its draw before our next tick; the reverse order makes
      // demand mode clear the invalidation and draw only every other refresh.
      raf = requestAnimationFrame(frame);
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
  // Script errors only mean failure before the first draw; afterwards drawing
  // itself (and WebGL context events) report health, so stray errors don't flash.
  function initFailed() {
    if (state !== 'ready') health('failed');
    if (!firstFrameSent) frameSignal('mineradio-sonic-workshop-frame-failed');
  }
  window.addEventListener('error', initFailed);
  window.addEventListener('unhandledrejection', initFailed);
  document.addEventListener('webglcontextcreationerror', function () { health('failed'); }, true);
})();
