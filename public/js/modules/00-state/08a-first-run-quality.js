// First launch starts at the original (ultra) detail. Only weak hardware steps
// down: software rendering or a low-core / low-memory machine gets eco, an
// integrated GPU gets balanced. Saved settings, including an explicit ultra,
// are never touched.
function classifyRendererGpu(renderer) {
  var name = String(renderer || '');
  if (!name) return 'unknown';
  if (/SwiftShader|Basic Render|llvmpipe|softpipe|Software/i.test(name)) return 'software';
  // Intel Arc A/B-series cards are discrete; "Arc(TM) Graphics" and "Arc 140V" are on-die.
  if (/\bIntel\b/i.test(name)) return /\bArc(?:\(TM\))?\s+[AB]\d{3}\b/i.test(name) ? 'discrete' : 'integrated';
  if (/Radeon(?:\(TM\))?\s+(?:Graphics\b|Vega\b|R[2-7]\s+Graphics|\d{3,4}M\b)/i.test(name)) return 'integrated';
  if (/Adreno|Qualcomm|Mali\b|PowerVR/i.test(name)) return 'integrated';
  return 'discrete';
}
function firstRunPerformanceQuality(profile, gpuClass) {
  profile = profile || {};
  if (gpuClass === 'software' || profile.lowCore || profile.lowMemory) return 'eco';
  if (gpuClass === 'integrated') return profile.veryLargeSurface ? 'eco' : 'balanced';
  return 'ultra';
}
function readWebglRendererName() {
  var gl = null;
  try {
    var canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl', { powerPreference: 'high-performance' }) || canvas.getContext('experimental-webgl');
    if (!gl) return 'software';
    var ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').slice(0, 240);
  } catch (e) {
    return '';
  } finally {
    try {
      var lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e2) { }
  }
}
var firstRunQualityDecision = null;
function applyFirstRunPerformanceQuality() {
  // A stored autosave means this is not a first launch; respect whatever it holds.
  if (typeof readCurrentFxAutosaveStorageRaw !== 'function' || readCurrentFxAutosaveStorageRaw()) return null;
  var renderer = readWebglRendererName();
  var gpuClass = classifyRendererGpu(renderer);
  var quality = firstRunPerformanceQuality(runtimeHardwareProfile, gpuClass);
  firstRunQualityDecision = { renderer: renderer, gpuClass: gpuClass, quality: quality };
  if (fx && fx.performanceQuality !== quality) fx.performanceQuality = quality;
  return firstRunQualityDecision;
}
try { applyFirstRunPerformanceQuality(); } catch (e) { }
