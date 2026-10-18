// Keep interactive 3D shelf motion at display cadence while reusing the last
// background frame. One native-resolution target, allocated only for visible UI.
var mainUiPreviousTime = performance.now();
var mainUiRenderCache = null;
var mainUiMotionUntil = 0;
var mainUiRenderStats = { frames: 0, backgroundFrames: 0, bytes: 0 };
window.__mineradioUiRender = mainUiRenderStats;
function mainUiLayerActive() {
  if (isMainSceneCoveredBySplash()) return false;
  if (typeof shelfPinnedOpen !== 'undefined' && shelfPinnedOpen) return true;
  if (typeof shelfHoverCue !== 'undefined' && shelfHoverCue && (shelfHoverCue.guide || shelfHoverCue.zoneActive || shelfHoverCue.target > 0)) return true;
  return scene.children.some(function (child) { return child.visible && child.userData && child.userData.mineradioUiLayer; });
}
function mainUiMotionActive(now) {
  if (isMainSceneCoveredBySplash()) return false;
  if (mainUiLayerActive()) {
    // Keep drawing the lyric return after the last shelf card slides away.
    mainUiMotionUntil = now + 500;
    return true;
  }
  return now < mainUiMotionUntil && typeof stageLyrics !== 'undefined' &&
    stageLyrics && stageLyrics.group && stageLyrics.group.visible;
}
function releaseMainUiRenderCache() {
  if (!mainUiRenderCache) return;
  mainUiRenderCache.target.dispose();
  mainUiRenderCache.quad.geometry.dispose();
  mainUiRenderCache.quad.material.dispose();
  mainUiRenderCache = null;
  mainUiRenderStats.bytes = 0;
}
function createMainUiRenderCache(width, height) {
  var target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: true, stencilBuffer: false
  });
  target.texture.generateMipmaps = false;
  target.texture.encoding = renderer.outputEncoding;
  target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  var material = new THREE.ShaderMaterial({
    uniforms: { colorFrame: { value: target.texture }, depthFrame: { value: target.depthTexture } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform sampler2D colorFrame; uniform sampler2D depthFrame; void main(){gl_FragColor=texture2D(colorFrame,vUv);gl_FragDepthEXT=texture2D(depthFrame,vUv).x;}',
    extensions: { fragDepth: true }, blending: THREE.NoBlending,
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, toneMapped: false
  });
  var quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), material);
  quad.frustumCulled = false;
  var copyScene = new THREE.Scene(); copyScene.add(quad);
  mainUiRenderStats.bytes = width * height * 8;
  return { target: target, quad: quad, scene: copyScene, camera: new THREE.Camera(), valid: false };
}
function mainUiFrameRoot(child) {
  // Lyrics can sit behind a passive shelf and in front of a pinned one. Keep
  // their original ordering in the UI pass; reuse their already-built textures
  // without rebuilding text or ticking lyric effects at the UI frame rate.
  return !!(child.userData && child.userData.mineradioUiLayer) ||
    (typeof stageLyrics !== 'undefined' && stageLyrics && child === stageLyrics.group);
}
function drawMainUiFrame(refreshBackground) {
  var visibleUi = scene.children.some(function (child) { return child.visible && child.userData && child.userData.mineradioUiLayer; });
  if ((!visibleUi && !mainUiMotionActive(performance.now())) || isMainSceneCoveredBySplash() || !renderPerfState.targetFps) {
    releaseMainUiRenderCache();
    return false;
  }
  // The cache only pays off when background frames are skipped. When every
  // display frame redraws the background anyway, draw the scene in one pass.
  var displayHz = Number(renderPerfState.displayHz) || 60;
  if (refreshBackground && renderPerfState.targetFps >= displayHz * 0.98) {
    if (mainUiRenderCache) mainUiRenderCache.valid = false;
    return false;
  }
  // Keep color and depth exactly as drawn, including transparent wallpaper
  // mode and shelf occlusion. WebGL 1 without depth support keeps the old path.
  if (!renderer.capabilities.isWebGL2 && (!renderer.extensions.has('WEBGL_depth_texture') || !renderer.extensions.has('EXT_frag_depth'))) return false;
  var size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (mainUiRenderCache && (mainUiRenderCache.target.width !== size.x || mainUiRenderCache.target.height !== size.y)) releaseMainUiRenderCache();
  if (!mainUiRenderCache) mainUiRenderCache = createMainUiRenderCache(size.x, size.y);
  var cache = mainUiRenderCache;
  var children = scene.children.slice();
  var visibility = children.map(function (child) { return child.visible; });
  var previousTarget = renderer.getRenderTarget(), autoClear = renderer.autoClear;
  var background = scene.background;
  try {
    if (refreshBackground || !cache.valid) {
      children.forEach(function (child, i) { child.visible = visibility[i] && !mainUiFrameRoot(child); });
      renderer.setRenderTarget(cache.target);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      cache.valid = true;
      mainUiRenderStats.backgroundFrames += 1;
    }
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = true;
    renderer.render(cache.scene, cache.camera);
    renderer.autoClear = false;
    scene.background = null;
    children.forEach(function (child, i) { child.visible = visibility[i] && mainUiFrameRoot(child); });
    renderer.render(scene, camera);
    mainUiRenderStats.frames += 1;
    return true;
  } finally {
    children.forEach(function (child, i) { child.visible = visibility[i]; });
    scene.background = background;
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = autoClear;
  }
}
