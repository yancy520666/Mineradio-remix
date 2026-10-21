'use strict';
// Exercise production text rasters and shaders in a throwaway player profile.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');

async function exerciseLyricClarity() {
  closeLoginModal();
  if (typeof closeVisualGuide === 'function') closeVisualGuide();
  scheduleNextMainLoopFrame = function () {};
  cancelAnimationFrame(mainLoopAnimationFrameId); clearTimeout(mainLoopBackgroundTimer);
  renderer.setPixelRatio(1);
  const width = 640, height = 240;
  renderer.setSize(width, height, false);
  const view = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 10);
  view.position.z = 5;
  const isolated = new THREE.Scene(); isolated.background = new THREE.Color('#000');
  const snapshots = [], results = [];
  for (const role of ['original', 'translation']) for (const text of ['爱 / Aa', '保持热爱，奔赴山海']) {
    const mask = makeLyricMask(text, { fontSize: 128, lineHeight: 138 });
    compactLyricLineMaskTexture(mask);
    const mat = role === 'translation' ? makeLyricBackfaceReadableMaterial({ map: mask.texture, color: '#fff', opacity: 1 })
      : makeLyricShaderMaterial(mask, { primary: '#ffffff', highlight: '#ffffff' }, {});
    if (role === 'original') {
      mat.uniforms.uBaseColor.value.set('#fff'); mat.uniforms.uHiColor.value.set('#fff');
      mat.uniforms.uOpacity.value = 1; mat.uniforms.uActiveMix.value = 0;
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mask.logicalWidth, mask.logicalHeight), mat);
    mesh.scale.setScalar(text === '爱 / Aa' ? 1 : 0.5); mesh.rotation.z = 0.025; mesh.position.set(0.35, 0.2, 0);
    isolated.add(mesh);
    const row = { mat };
    function capture(scale, texture) {
      renderer.setSize(width * scale, height * scale, false);
      setLyricRowTextureMap(row, texture);
      renderer.render(isolated, view);
      const gl = renderer.getContext();
      const rgba = new Uint8Array(width * height * scale * scale * 4);
      gl.readPixels(0, 0, width * scale, height * scale, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw Error('Invalid WebGL text render');
      return rgba;
    }
    function boundsOf(pixels) {
      const bounds = [width, 0, height, 0];
      for (let i = 0; i < width * height; i++) if (pixels[i * 4] > 120) {
        const x = i % width, y = Math.floor(i / width);
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.max(bounds[1], x);
        bounds[2] = Math.min(bounds[2], y); bounds[3] = Math.max(bounds[3], y);
      }
      return bounds;
    }
    const baseBounds = boundsOf(capture(1, mask.texture));
    if (role === 'translation') {
      // The same material also draws glow/readability maps, which retain their
      // full frame. Preserve its original sampling, color, opacity and faces.
      const fullFrame = capture(1, mask.texture);
      const legacy = mat.clone();
      legacy.fragmentShader = [
        'precision highp float;', 'uniform sampler2D uMap;', 'uniform vec3 uColor;',
        'uniform float uOpacity;', 'varying vec2 vUv;', 'void main(){',
        'vec2 uv=gl_FrontFacing?vUv:vec2(1.0-vUv.x,vUv.y);',
        'gl_FragColor=vec4(uColor,texture2D(uMap,uv).a*uOpacity);', '}'
      ].join('\n');
      mesh.material = legacy;
      const previous = capture(1, mask.texture);
      mesh.material = mat; legacy.dispose();
      if (fullFrame.some((value, i) => value !== previous[i])) throw Error('Full-frame glow/readability sampling changed');
    }
    const baseGeometry = JSON.stringify({ position: mesh.position.toArray(), scale: mesh.scale.toArray(), geometry: mesh.geometry.parameters });
    renderer.setSize(width * 4, height * 4, false);
    const referenceTexture = makeLyricQualityTexture(mask, 4);
    const referencePixels = capture(4, referenceTexture.texture);
    const reference = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
        sum += referencePixels[((y * 4 + yy) * width * 4 + x * 4 + xx) * 4];
      }
      reference[y * width + x] = sum / 16;
    }
    referenceTexture.texture.dispose();
    for (let tier = 1; tier <= 4; tier++) {
      renderer.setSize(width, height, false);
      const built = makeLyricQualityTexture(mask, tier);
      const pixels = capture(1, built.texture);
      let error = 0, count = 0, lit = 0;
      let left = width, right = 0, top = height, bottom = 0;
      for (let i = 0; i < reference.length; i++) {
        if (reference[i] > 2 || pixels[i * 4] > 2) { error += Math.abs(reference[i] - pixels[i * 4]); count++; }
        if (pixels[i * 4] > 120) {
          const x = i % width, y = Math.floor(i / width); lit++;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      if (JSON.stringify({ position: mesh.position.toArray(), scale: mesh.scale.toArray(), geometry: mesh.geometry.parameters }) !== baseGeometry) throw Error('Clarity changed mesh geometry');
      results.push({ role, text, tier, width: built.width, height: built.height, bytes: built.bytes,
        error: +(error / Math.max(1, count)).toFixed(3), lit, baseBounds, bounds: [left, right, top, bottom] });
      if (role === 'translation' && text === '爱 / Aa') snapshots.push(pixels);
      built.texture.dispose();
    }
    setLyricRowTextureMap(row, mask.texture);
    if (mat.uniforms.uMapUvRect && mat.uniforms.uMapUvRect.value.toArray().join(',') !== '0,0,1,1') throw Error('Crop survived base-map restoration');
    isolated.remove(mesh); mesh.geometry.dispose(); mat.dispose(); mask.texture.dispose();
  }
  const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  snapshots.forEach((pixels, index) => {
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
    const x = index % 2 * width, y = Math.floor(index / 2) * height;
    ctx.putImageData(image, x, y); ctx.font = '16px sans-serif'; ctx.fillStyle = '#aaa';
    ctx.fillText(['省资源', '均衡', '高清', '极致'][index], x + 24, y + 30);
  });
  document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#000;display:flex;align-items:center;justify-content:center';
  canvas.style.cssText = 'max-width:100vw;max-height:100vh;object-fit:contain'; document.body.appendChild(canvas);
  return { results, shaderErrors: renderer.info.programs.filter(program => program.diagnostics && program.diagnostics.runnable === false).length };
}

const probe = path.join(os.tmpdir(), 'mineradio-clarity-' + process.pid + '.js');
fs.writeFileSync(probe, '(' + exerciseLyricClarity.toString() + ')()');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const args = [path.resolve(__dirname, '../scripts/qa/isolated-electron.js'), '--page', probe];
const shotIndex = process.argv.indexOf('--shot');
if (shotIndex >= 0) args.push('--visible', '--shot', path.resolve(process.argv[shotIndex + 1]));
const run = spawnSync(require('electron'), args, { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
const line = run.stdout.split(/\r?\n/).find(value => value.startsWith('QA_RESULT '));
assert.equal(run.status, 0, run.stderr || run.error && run.error.message);
assert(line, run.stdout || run.stderr);
const result = JSON.parse(line.slice(10)); assert(!result.error, result.error);
assert.equal(result.shaderErrors, 0);
for (const role of ['original', 'translation']) for (const text of ['爱 / Aa', '保持热爱，奔赴山海']) {
  const samples = result.results.filter(item => item.role === role && item.text === text);
  assert(samples.every(item => item.lit > 100), 'all four tiers must draw real glyphs');
  assert(samples[3].error < samples[0].error, 'high tier must more closely match the 4x screen reference');
  for (const item of samples) {
    assert(item.bytes < 32 * 1024 * 1024);
    assert(item.bounds.every((edge, i) => Math.abs(edge - item.baseBounds[i]) <= 2),
      role + ' must preserve base glyph size and position: ' + JSON.stringify(item));
    assert(item.bounds.every((edge, i) => Math.abs(edge - samples[3].bounds[i]) <= 1), 'crop must preserve text layout');
  }
}
console.log('LYRIC_CLARITY ' + JSON.stringify(result));
