'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture() {
  class Vector {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    clone() { return new Vector(this.x, this.y, this.z); }
    copy(p) { Object.assign(this, p); return this; }
    project() { return this; }
  }
  const row = (lineIndex, visible = true) => ({ lineIndex, isPrimary: true, renderLineUploaded: true,
    mesh: { visible, parent: {}, position: new Vector(), scale: new Vector(1,1,1), updateWorldMatrix() {},
      getWorldPosition(p) { return p.copy(this.screen || this.position); } },
    mat: { opacity: 1, uniforms: { uProgress: { value: .7 } } }, glow: {}, readability: {},
    glowMat: { opacity: .8 }, readabilityMat: { opacity: .5 }, qualityTexture: {} });
  const old = row(0), next = row(100, false);
  const data = { trackPersistent: true, rowLayers: [old, next], activeRowMesh: old.mesh, trackTargetLineIndex: 100 };
  const c = vm.createContext({ stageLyrics: { current: { userData: { lyric: data } } }, trackSwitchToken: 2,
    THREE: { Vector3: Vector }, camera: {}, clampRange: (v,a,b) => Math.max(a,Math.min(b,v)),
    getLyricTextureMaterialOpacity: m => m ? m.opacity : 0,
    setLyricTextureMaterialOpacity: (m,v) => { if(m) m.opacity=v; }, alignStageLyricResidentEffectToRow() {} });
  loadFunctions(c, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['clearStageLyricSeekHold','beginStageLyricSeekHold','applyStageLyricSeekHold']);
  c.beginStageLyricSeekHold();
  return { c, data, old, next };
}
test('a cold seek retains the existing visible text, glow and texture until the new line is on screen', () => {
  const { c, data, old, next } = fixture(), originalTexture = old.qualityTexture;
  old.mesh.visible = false; old.mesh.position.y = 300; old.mat.opacity = 0;
  c.applyStageLyricSeekHold(data,100,2);
  assert.equal(old.mesh.visible,true); assert.equal(old.mesh.position.y,0);
  assert.equal(old.mat.opacity,1); assert.equal(old.glowMat.opacity,.8);
  assert.equal(old.mat.uniforms.uProgress.value,.7); assert.equal(old.qualityTexture,originalTexture);
  next.mesh.visible = true; next.mesh.screen = { x: 0, y: 3, z: 0 };
  c.applyStageLyricSeekHold(data,200,2); assert.equal(data.trackSeekHold.releaseAt,0);
  next.mesh.screen.y = 0; c.applyStageLyricSeekHold(data,300,2);
  c.applyStageLyricSeekHold(data,390,2); assert.equal(old.mat.opacity,.5);
  c.applyStageLyricSeekHold(data,480,2); assert.equal(data.trackSeekHold,null);
});
test('rapid retarget, cancellation and a new track cannot release or reuse an obsolete bridge', () => {
  const { c, data, old, next } = fixture();
  const firstHold = data.trackSeekHold; c.beginStageLyricSeekHold(); const hold = data.trackSeekHold; assert.notEqual(hold,firstHold);
  hold.activated = true; next.mesh.visible = true; c.applyStageLyricSeekHold(data,80,2); assert.equal(hold.releaseAt,80);
  data.trackPendingPayload = { trackIndex: 200 };
  c.applyStageLyricSeekHold(data,100,2); assert.equal(hold.releaseAt,0);
  data.trackPendingPayload = { trackIndex: 0 }; c.applyStageLyricSeekHold(data,116,2); assert.equal(data.trackSeekHold,null);
  data.trackPendingPayload = null; c.beginStageLyricSeekHold(); c.trackSwitchToken++;
  old.mesh.visible = false; c.applyStageLyricSeekHold(data,150,2);
  assert.equal(data.trackSeekHold,null); assert.equal(old.mesh.visible,false);
});

test('a repeated click keeps the original scroll pose and opacity instead of pinning the old row', () => {
  const { c, data, old } = fixture();
  c.progressLyricSeekGlideActive = () => true;
  old.mesh.position.y = 40; old.mat.opacity = .2;
  c.applyStageLyricSeekHold(data,100,2);
  assert.equal(data.trackSeekHold,null);
  assert.equal(old.mesh.position.y,40); assert.equal(old.mat.opacity,.2);
});
test('visible runway rows keep their normal motion; only a real cold gap activates the fallback', () => {
  const { c, data, old, next } = fixture();
  old.mesh.position.y = .4; old.mat.opacity = .8;
  c.applyStageLyricSeekHold(data,100,2);
  assert.equal(old.mesh.position.y,.4); assert.equal(old.mat.opacity,.8);
  assert.equal(data.trackSeekHold.activated,undefined);
  old.mesh.visible = false; c.applyStageLyricSeekHold(data,116,2);
  assert.equal(data.trackSeekHold.activated,true); assert.equal(old.mesh.visible,true);
  c.clearStageLyricSeekHold(); assert.equal(data.trackSeekHold,null);
  c.beginStageLyricSeekHold(); next.mesh.visible = true; old.mesh.visible = true;
  c.applyStageLyricSeekHold(data,200,2); assert.equal(data.trackSeekHold,null);
});
