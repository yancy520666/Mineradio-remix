'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');
function fixture(angle){
 const c=vm.createContext({particles:{rotation:{x:angle,y:angle}},bloomParticles:{rotation:{x:angle,y:angle}},
  orbit:{rotating:false,centerLocked:false},gestureRotation:{x:angle,y:angle},particleSpin:{vx:1,vy:1},
  performance:{now:()=>500},panelViewRecenter:{active:false},PANEL_VIEW_RECENTER_MIN_ANGLE:.035,
  clampRange:(v,a,b)=>Math.min(b,Math.max(a,v)),clamp01:v=>Math.max(0,Math.min(1,v)),markRenderInteraction(){} });
 loadFunctions(c,'public/js/modules/01-scene/03-focus-cinema-camera.js',['wrapViewAngle','rebaseViewRotationAxis','panelViewRotationAngle','startPanelViewRecenter','applyPanelViewRecenter']);return c;
}
test('near a complete turn the panel opens immediately without spinning a whole turn backwards',()=>{
 for(const angle of [2*Math.PI-.01,-4*Math.PI+.01]){
  const c=fixture(angle);assert.equal(c.startPanelViewRecenter('test'),0);
  assert(Math.abs(c.particles.rotation.y)<.035,'physical rotation must already use the nearest full turn');
  assert(Math.abs(c.bloomParticles.rotation.y)<.035);assert.equal(c.gestureRotation.y,0);
 }
});
test('a large angle recenters along the shortest path and ends precisely at zero',()=>{
 const c=fixture(3*Math.PI),wait=c.startPanelViewRecenter('test');
 assert(wait>0);assert(Math.abs(c.panelViewRecenter.fromY)<=Math.PI);
 c.applyPanelViewRecenter(500+c.panelViewRecenter.duration);
 assert(Math.abs(c.particles.rotation.y)<1e-12);assert.equal(c.panelViewRecenter.active,false);
});
