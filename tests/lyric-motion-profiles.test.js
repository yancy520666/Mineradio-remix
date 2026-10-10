'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture() {
  const c = vm.createContext({ fx: { lyricMotionStyle: 'float', lyricMotionSoftness: .72 },
    fxDefaults: { lyricMotionSoftness: .72, lyricGlitchIntensity: 1, lyricGlitchSlice: .7,
      lyricGlitchChroma: .8, lyricGlitchRate: 1, lyricGlitchJitter: 1 },
    lyricsHasNativeKaraoke: false, clampRange: (v,a,b) => Math.max(a, Math.min(b,v)) });
  vm.runInContext(fs.readFileSync('public/js/modules/02-visual/08-lyrics-display-modes.js','utf8'),c);
  return c;
}
test('saved default float keeps existing easing and spatial amplitudes; softness controls adjacent-line timing', () => {
  const c = fixture();
  const defaults = c.lyricMotionProfile();
  for (const base of [.135, .19, .135 * 1.16, .22 * 1.16]) {
    assert.equal(c.lyricMotionSlideEase(defaults,base),base);
  }
  assert.equal(defaults.verticalAmp,1); assert.equal(defaults.depthAmp,1); assert.equal(defaults.glass,0);
  c.fx.lyricMotionSoftness=.15; const fast=c.lyricMotionSlideEase(c.lyricMotionProfile(),.1566);
  c.fx.lyricMotionSoftness=1.2; const soft=c.lyricMotionSlideEase(c.lyricMotionProfile(),.1566);
  assert.ok(fast>soft, 'the saved softness value must also affect persistent scrolling');
});
test('ordinary line advances have distinct stable modes with the same duration at 30 and 60 Hz', () => {
  const c = fixture(), samples = new Map();
  for (const style of ['float','smooth','glass','quick','shine','glitch']) {
    c.fx.lyricMotionStyle=style;
    const p=c.lyricMotionProfile(), ease=c.lyricMotionSlideEase(p,.1566);
    const follow = fps => { let offset=0; for(let i=0;i<fps/2;i++) offset+=(1-offset)*(1-Math.pow(1-ease,60/fps)); return offset; };
    assert.ok(Math.abs(follow(30)-follow(60))<1e-12, style+' should not slow on low frame rates');
    samples.set(style,{p,ease});
  }
  assert.ok(samples.get('smooth').ease<samples.get('float').ease);
  assert.ok(samples.get('quick').ease>samples.get('glass').ease);
  assert.ok(samples.get('shine').ease>samples.get('float').ease);
  assert.equal(samples.get('glass').p.glass,1);
  assert.ok(samples.get('glass').p.depthAmp<samples.get('float').p.depthAmp/4);
  assert.equal(samples.get('quick').p.verticalAmp,0);
});
test('glass uses its own glyph material while other styles retain zero glass reflection', () => {
  const c=fixture();
  c.THREE={ ShaderMaterial: class { constructor(options){ Object.assign(this,options); } }, DoubleSide:2 };
  c.uniforms={uTime:{value:0}};
  c.lyricThreeColor=()=>({}); c.lyricStageGlowThreeColor=()=>({}); c.lyricBeatGlowThreeColor=()=>({});
  loadFunctions(c,'public/js/modules/02-visual/11-lyrics-shaders.js',['makeLyricShaderMaterial']);
  for(const style of ['glass','float','smooth','shine','quick','glitch']) {
    c.fx.lyricMotionStyle=style;
    const material=c.makeLyricShaderMaterial({texture:{},textMin:.1,textMax:.9},{primary:'#fff'},c.lyricMotionProfile());
    assert.equal(material.uniforms.uGlass.value, style==='glass'?1:0);
    assert.equal(material.transparent,true); assert.equal(material.depthWrite,false);
  }
});
