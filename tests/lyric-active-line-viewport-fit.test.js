const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rowLayersPath = path.join(__dirname, '..', 'public', 'js', 'modules', '02-visual', '12-lyrics-row-layers.js');
const source = fs.readFileSync(rowLayersPath, 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} is missing`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} is incomplete`);
}

const sandbox = {
  clampRange(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};
vm.createContext(sandbox);
vm.runInContext(extractFunction('lyricViewportSafeMarginPx'), sandbox);
vm.runInContext(extractFunction('lyricViewportFitRatio'), sandbox);

assert.strictEqual(sandbox.lyricViewportSafeMarginPx(1000), 45, 'normal windows use a proportional safe margin');
assert.strictEqual(sandbox.lyricViewportSafeMarginPx(300), 42, 'small windows retain a usable minimum edge gap');
assert.strictEqual(sandbox.lyricViewportSafeMarginPx(4096), 92, 'wide screens do not waste excessive side space');

const margin = sandbox.lyricViewportSafeMarginPx(1920);
assert(Math.abs(margin - 86.4) < 1e-9, 'a 1920px viewport keeps a modest 4.5% edge gap');
assert.strictEqual(
  sandbox.lyricViewportFitRatio(1920, 960, 1200, 1, margin),
  1,
  'a lyric that already fits keeps its authored size'
);
assert(Math.abs(
  sandbox.lyricViewportFitRatio(1920, 960, 2400, 1, margin) - 0.728
) < 1e-9, 'a centred long lyric may use all real space between both safe edges');
assert(Math.abs(
  sandbox.lyricViewportFitRatio(1920, 700, 2000, 1, margin) - 0.6136
) < 1e-9, 'an offset lyric is limited by the genuinely shorter free side');
assert(Math.abs(
  sandbox.lyricViewportFitRatio(1920, 960, 2400, 0.8, margin) - 0.91
) < 1e-9, 'the fit calculation respects the row scale authored by the lyric motion');
assert.strictEqual(
  sandbox.lyricViewportFitRatio(1920, 960, 10000, 1, margin),
  0.22,
  'extreme lines retain the existing readable minimum scale'
);

assert(/function lyricRowLiveViewportScale/.test(source), 'visible lyric rows must measure their live screen projection');
assert(/row\.mesh\.localToWorld\(lyricViewportFitLeft\)/.test(source), 'the measurement includes the current 3D lyric transform');
assert(/lyricViewportFitLeft\.project\(camera\)/.test(source), 'the measurement projects the real lyric edge through the active camera');
assert(/Math\.min\(leftSpace, rightSpace\) \* 2/.test(source), 'the shorter live side determines the usable centred width');
assert(/if \(\(row\.isPrimary \|\| row\.isTranslation\) && renderWindowActive && \(!fx \|\| fx\.lyricLiveViewportFit !== false\)\)/.test(source), 'visible original and translated rows share the live measurement path when live fitting is enabled');
assert(/baseScale \*= lyricRowLiveViewportScale\(row, baseScale\)/.test(source), 'the live fit ratio participates in the existing scale target');
assert(!/lyricLongLineDefaultScale|longLineScale|1380\s*\//.test(source), 'the old fixed-width hard compression must not return');
assert(/var editLayoutEase = editPreview \? 1 : ease;/.test(source)
  && /var nextLineScale = row\.mesh\.scale\.x \+ \(scaleTarget - row\.mesh\.scale\.x\) \* editLayoutEase;/.test(source) && /row\.mesh\.scale\.setScalar\(nextLineScale\)/.test(source),
  'slider previews follow input directly while normal playback retains original scale easing');
assert(/var nextReadabilityScale = row\.readability\.scale\.x \+ \(scaleTarget - row\.readability\.scale\.x\) \* ease;/.test(source) && /row\.readability\.scale\.setScalar\(nextReadabilityScale\)/.test(source), 'readability continues to follow the original easing');
assert(/var nextGlowScale = row\.glow\.scale\.x \+ \(glowTargetScale - row\.glow\.scale\.x\) \* glowEase;/.test(source) && /row\.glow\.scale\.setScalar\(nextGlowScale\)/.test(source), 'glow continues to follow the fitted lyric scale');

console.log('[OK] Original and translated lyrics share live left/right fitting while short lines retain their original size.');

// A long original and short translation must keep their hierarchy beside the shelf.
sandbox.lyricMaskInkBounds = mask => mask.ink;
vm.runInContext(extractFunction('lyricShelfTranslationScale'), sandbox);
const original = { lineMask: {ink:{top:-.2,bottom:.2}}, mesh:{scale:{x:.5}}, viewportFitScale:.5 };
const translated = {isTranslation:true,tightParent:original,lineMask:{ink:{top:-.3,bottom:.3}}};
const shared = sandbox.lyricShelfTranslationScale(translated, 1.2, 1);
assert(shared * .6 <= .4 * .5 * .78 + 1e-9, 'translation ink remains subordinate after the original shrinks');
assert.strictEqual(sandbox.lyricShelfTranslationScale(translated,1.2,0),1.2,'closing restores the authored translation size');
assert(sandbox.lyricShelfTranslationScale(translated,1.2,.5)>shared,'hierarchy blends in rather than snapping');

assert.strictEqual(sandbox.lyricShelfTranslationScale(translated,.2,1),.2,'an already-small translation is not reduced by the primary viewport fit twice');

// Execute the actual scale expressions and write guard, not just their spelling.
const layoutEaseCode = source.match(/var editLayoutEase = editPreview \? 1 : ease;/)[0];
const scaleCode = source.match(/var nextLineScale =[^\n]+\n[^\n]+/)[0];
for (const editPreview of [false, true]) {
  let writes = 0;
  const context = vm.createContext({ editPreview, ease: .16, scaleTarget: 1,
    row: { mesh: { visible: true, scale: { x: .5, y: .5, z: .5, setScalar(v) { this.x=this.y=this.z=v; writes++; } } } } });
  vm.runInContext(layoutEaseCode + '\n' + scaleCode, context);
  assert.strictEqual(context.row.mesh.scale.x, editPreview ? 1 : .58, 'preview snaps while ordinary playback retains the authored easing');
  assert.strictEqual(writes, 1);
  context.row.mesh.visible = false; context.scaleTarget = context.row.mesh.scale.x;
  vm.runInContext(layoutEaseCode + '\n' + scaleCode, context);
  assert.strictEqual(writes, 1, 'only a fully unchanged hidden scale omits the setter');
  context.scaleTarget = 2;
  vm.runInContext(layoutEaseCode + '\n' + scaleCode, context);
  assert.strictEqual(writes, 2, 'hidden motion continues to update its exact state');
  // A manual layout edit while hidden must not be masked by cached scale state.
  Object.assign(context.row.mesh.scale, { x: .25, y: .4, z: .6 });
  context.row.mesh.visible = true; context.scaleTarget = 1;
  vm.runInContext(layoutEaseCode + '\n' + scaleCode, context);
  const restoredScale = editPreview ? 1 : .37;
  assert.strictEqual(context.row.mesh.scale.x, restoredScale, 'reentry obeys the current edit mode and manually changed scale');
  assert.strictEqual(context.row.mesh.scale.y, restoredScale);
  assert.strictEqual(context.row.mesh.scale.z, restoredScale);
  assert.strictEqual(writes, 3);
}
