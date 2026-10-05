// First launch keeps original detail on every machine. GPU classification is
// advice only, using the active renderer; saved settings remain authoritative.
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
var firstRunQualityDecision = null;
function applyFirstRunPerformanceQuality() {
  // A stored autosave means this is not a first launch; respect whatever it holds.
  if (typeof readCurrentFxAutosaveStorageRaw !== 'function' || readCurrentFxAutosaveStorageRaw()) return null;
  firstRunQualityDecision = { quality: 'ultra' };
  if (fx) fx.performanceQuality = 'ultra';
  return firstRunQualityDecision;
}
try { applyFirstRunPerformanceQuality(); } catch (e) { }
