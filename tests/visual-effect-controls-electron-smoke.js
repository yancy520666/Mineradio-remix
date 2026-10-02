'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { app, BrowserWindow } = require('electron');
const root = path.resolve(__dirname, '..');
const mutation = process.argv.find(value => value.startsWith('--mutant='))?.slice(9);
const mutants = {
  edge: ['04-preset-grid-uniforms.js', 'uniforms.uEdgeEnabled.value = fx.edge ? 1 : 0;', 'uniforms.uEdgeEnabled.value = 0;'],
  bloom: ['04-preset-grid-uniforms.js', 'uniforms.uBloomStrength.value = fx.bloom ? fx.bloomStrength : 0;', 'uniforms.uBloomStrength.value = 0;'],
  cinema: ['03-focus-cinema-camera.js', 'if (!fx.cinema) {', 'if (true) {'],
  lyrics: ['07-lyrics-palette-text-utils.js', 'if (editPreview || !fx || !fx.lyricGlowParticles) return 0;', 'return 0;']
};
if (mutation) assert(mutants[mutation], 'Unknown mutation');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-effect-controls-'));
app.setPath('userData', profile);
let server, win;

async function exercise() {
  // Stop only this isolated fixture's loop. Every capture uses the same time,
  // geometry and camera so ordinary animation cannot fake an effect change.
  scheduleNextMainLoopFrame = function () {};
  cancelAnimationFrame(mainLoopAnimationFrameId);
  clearTimeout(mainLoopBackgroundTimer);
  fxSliderEdit.active = false;
  fx.preset = 0;
  fx.cinema = false;
  fx.aiDepth = false;
  fx.coverBackdropAdapt = false;
  fx.bloomStrength = 1;
  scene.children.forEach(child => { child.visible = false; });
  particles.visible = true;
  camera.position.set(0, 0, 6.6);
  camera.lookAt(0, 0, 0);
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  uniforms.uTime.value = 5;
  uniforms.uAlpha.value = 1;
  uniforms.uParticleDim.value = 1;
  uniforms.uLoading.value = 0;
  const texture = color => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 16, 16);
    return canvas;
  };
  coverTex.image = texture('#808080'); coverTex.needsUpdate = true;
  coverEdgeTex.image = texture('rgb(128,255,128)'); coverEdgeTex.needsUpdate = true;
  uniforms.uHasCover.value = 1;
  uniforms.uColorMixT.value = 1;
  uniforms.uHasDepth.value = 1;
  const capture = () => {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const difference = (a, b) => {
    let changed = 0, sum = 0;
    for (let i = 0; i < a.length; i += 4) {
      const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      sum += delta; if (delta > 3) changed++;
    }
    return { changedPixels: changed, meanChannelDelta: sum / (a.length / 4 * 3) };
  };
  fx.bloom = false; fx.edge = false; syncFxUniforms();
  const plain = capture();
  document.getElementById('t-edge').click();
  const edge = difference(plain, capture());
  document.getElementById('t-edge').click();
  document.getElementById('t-bloom').click();
  const bloom = difference(plain, capture());
  fx.cinemaShake = 1;
  orbit.focus.active = false;
  freeCamera.active = false;
  if (audio) audio.pause();
  for (let i = 0; i < 180; i++) { updateCinema(1 / 60); updateCamera(); }
  cinemaT = 10;
  const beforeCamera = camera.position.toArray();
  const beforeCinema = capture();
  document.getElementById('t-cinema').click();
  for (let i = 0; i < 90; i++) { updateCinema(1 / 60); updateCamera(); }
  const cinema = { positionDistance: camera.position.distanceTo(new THREE.Vector3(...beforeCamera)),
    pixels: difference(beforeCinema, capture()) };
  fx.preset = 8;
  fx.edge = true; fx.bloom = true;
  updateVisualEffectScopeControls();
  document.getElementById('t-edge').click(); document.getElementById('t-bloom').click();
  const scope = { edgeDisabled: document.getElementById('t-edge').getAttribute('aria-disabled'),
    bloomDisabled: document.getElementById('t-bloom').getAttribute('aria-disabled'),
    bloomSliderDisabled: document.getElementById('fx-bloom').disabled,
    savedPreferenceRetained: fx.edge && fx.bloom };
  fx.preset = 0; updateVisualEffectScopeControls();
  scope.restored = document.getElementById('t-edge').classList.contains('on') && document.getElementById('t-bloom').classList.contains('on');
  scope.sliderRestored = !document.getElementById('fx-bloom').disabled;

  particles.visible = bloomParticles.visible = false;
  camera.position.set(0, 0, 6.6); camera.lookAt(0, 0, 0); camera.fov = BASE_FOV; camera.updateProjectionMatrix();
  clearStageLyrics();
  fx.particleLyrics = true; fx.lyricDisplayMode = 'single'; fx.lyricTranslationMode = 'off';
  fx.lyricGlow = false; fx.lyricGlowParticles = false;
  fx.lyricMotionStyle = 'smooth'; fx.lyricVerticalFloat = false;
  lyricsLines = [{ t: 0, text: 'LIGHT EFFECT FIXTURE', duration: 10, charCount: 20 }];
  lyricsTranslationLines = [];
  const build = beginCooperativeLyricMeshBuild(buildStageLyricDisplayPayload(0, { lightweightTrack: true }));
  let steps = 0;
  while (!stepCooperativeLyricMeshBuild(build, 1, 3)) { if (++steps > 2000) throw new Error('Fixture lyric build stalled'); }
  const mesh = finishCooperativeLyricMeshBuild(build);
  if (!mesh) throw new Error('No fixture lyric mesh');
  stageLyrics.current = mesh; stageLyrics.group.add(mesh); stageLyrics.group.visible = true;
  mesh.userData.age = 10;
  for (let i = 0; i < 90; i++) updateStageLyrics3D(1 / 60);
  // Measure only the mesh's light particles, not unrelated lyric motion.
  const data = mesh.userData.lyric;
  const drawParticles = () => {
    const isolated = new THREE.Scene(); isolated.background = new THREE.Color('#000000');
    const light = data.sparks.clone(); light.material = data.sparkMat; light.visible = data.sparks.visible;
    isolated.add(light); renderer.render(isolated, camera);
    const gl = renderer.getContext(); const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const dark = drawParticles();
  document.getElementById('t-lyricGlowParticles').click();
  for (let i = 0; i < 90; i++) updateStageLyrics3D(1 / 60);
  const lyrics = { opacityWithoutHalo: getLyricSparkOpacity(data), pixels: difference(dark, drawParticles()) };
  beginFxSliderEdit('lyricScale', 99, false);
  updateStageLyrics3D(1 / 60);
  lyrics.hiddenDuringPreview = !data.sparks.visible;
  endFxSliderEdit();
  for (let i = 0; i < 90; i++) updateStageLyrics3D(1 / 60);
  lyrics.restoredAfterPreview = data.sparks.visible && getLyricSparkOpacity(data) > 0.01;
  document.getElementById('t-lyricGlowParticles').click();
  for (let i = 0; i < 180; i++) updateStageLyrics3D(1 / 60);
  lyrics.offOpacity = getLyricSparkOpacity(data);
  return { edge, bloom, cinema, lyrics, scope };
}

app.whenReady().then(async () => {
  const publicRoot = path.join(root, 'public');
  server = http.createServer((req, res) => {
    const file = path.resolve(publicRoot, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream');
    // Mutate only the served test copy, never the repository or running app.
    if (mutation && path.basename(file) === mutants[mutation][0]) {
      const source = fs.readFileSync(file, 'utf8');
      assert(source.includes(mutants[mutation][1]), 'Mutation target missing');
      res.end(source.replace(mutants[mutation][1], mutants[mutation][2]));
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, width: 960, height: 540, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
  await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const until=Date.now()+20000; function wait(){if(typeof toggleFx==='function'&&typeof renderer!=='undefined'&&renderer)return resolve(); if(Date.now()>until)return reject(new Error('Renderer unavailable'));setTimeout(wait,40)}wait()})`);
  const result = await win.webContents.executeJavaScript('(' + exercise.toString() + ')()');
  console.log('VISUAL_EFFECTS:' + JSON.stringify(result));
  for (const [name, effect] of Object.entries({ edge: result.edge, bloom: result.bloom, cinema: result.cinema.pixels, lyrics: result.lyrics.pixels })) {
    assert(effect.changedPixels > 50, name + ' must change rendered pixels');
  }
  assert(result.cinema.positionDistance > 0.01);
  assert(result.lyrics.opacityWithoutHalo > 0.01); assert(result.lyrics.offOpacity < 0.001);
  assert(result.lyrics.hiddenDuringPreview && result.lyrics.restoredAfterPreview);
  assert.equal(result.scope.edgeDisabled, 'true'); assert.equal(result.scope.bloomDisabled, 'true');
  assert(result.scope.savedPreferenceRetained && result.scope.restored && result.scope.bloomSliderDisabled && result.scope.sliderRestored);
}).then(() => finish(0)).catch(error => { console.error(error.stack); finish(1); });

function finish(code) {
  if (win && !win.isDestroyed()) win.destroy();
  if (server) server.close();
  app.quit();
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir())) {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
  }
  app.exit(code);
}
