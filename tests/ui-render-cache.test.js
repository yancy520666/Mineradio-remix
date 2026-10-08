'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/js/modules/01-scene/05-ui-render-cache.js'),'utf8');
function fixture(){
 let currentTarget=null,passes=0,fail=false;const bg={visible:true,userData:{}},ui={visible:true,userData:{mineradioUiLayer:true}};
 const c={window:{},performance:{now:()=>100},scene:{children:[bg,ui],background:'original'},camera:{},renderPerfState:{targetFps:30},isMainSceneCoveredBySplash:()=>false,
 THREE:{Vector2:function(){}},renderer:{capabilities:{isWebGL2:true},getDrawingBufferSize:()=>({x:80,y:60}),getRenderTarget:()=>currentTarget,setRenderTarget:v=>{currentTarget=v;},autoClear:true,render:()=>{passes++;if(fail)throw new Error('lost-context');}}};
 vm.createContext(c);vm.runInContext(source,c);
 const cache={target:{width:80,height:60,dispose(){}},quad:{geometry:{dispose(){}},material:{dispose(){}}},scene:{},camera:{},valid:false};
 c.createMainUiRenderCache=()=>cache;
 return {c,bg,ui,passes:()=>passes,target:()=>currentTarget,fail:()=>{fail=true;}};
}
test('extra UI frames reuse the background and close releases the cached target',()=>{
 const s=fixture();assert.equal(s.c.drawMainUiFrame(true),true);assert.equal(s.passes(),3);
 assert.equal(s.c.drawMainUiFrame(false),true);assert.equal(s.passes(),5,'two UI passes, no background redraw');
 assert.equal(s.bg.visible,true);assert.equal(s.ui.visible,true);assert.equal(s.target(),null);
 assert.equal(s.c.renderer.autoClear,true);assert.equal(s.c.scene.background,'original');
 s.ui.visible=false;assert.equal(s.c.drawMainUiFrame(false),false);assert.equal(s.c.mainUiRenderCache,null);
});
test('a draw failure restores visibility, render target and clear behavior',()=>{
 const s=fixture();s.fail();assert.throws(()=>s.c.drawMainUiFrame(true),/lost-context/);
 assert.equal(s.bg.visible,true);assert.equal(s.ui.visible,true);assert.equal(s.target(),null);
 assert.equal(s.c.renderer.autoClear,true);assert.equal(s.c.scene.background,'original');
});
