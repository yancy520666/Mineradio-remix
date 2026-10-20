'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {loadFunctions}=require('./helpers/classic-functions');
function fixture() {
  const timers=[],classes=new Set(['peek']),handlers={};
  const panel={classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},contains:n=>n===control,addEventListener:(name,fn)=>{handlers[name]=fn}};
  const control={};
  const context=vm.createContext({document:{activeElement:null},immersiveMode:false,diyPlayerMode:true,emptyHomeActive:false,playlistPanelPinned:false,peekTimers:{search:null},
    setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},cancelPendingSearchPeekReveal(){},playlistPeekHideDelay:()=>170});
  loadFunctions(context,'public/js/modules/10-shell/02-peek-panels-upload.js',['shouldPreservePeekFocus','setPeek']);
  return {context,panel,control,classes,handlers,flush:()=>timers.splice(0).forEach(fn=>fn())};
}

test('search trigger follows the final bar position through hiding, animation and UI scaling', () => {
  for (const [top, scale] of [[34, 1], [32, 1], [24, 1], [58, 1], [34, 1.25]]) {
    const area = { offsetWidth: 620, getBoundingClientRect: () => ({ left: 170, right: 170 + 620 * scale, width: 620 * scale, top: -92 }) };
    const ctx = vm.createContext({ document: { getElementById: () => ({ getBoundingClientRect: () => ({ height: 58 * scale }) }) },
      getComputedStyle: () => ({ getPropertyValue: () => top + 'px' }) });
    loadFunctions(ctx, 'public/js/modules/10-shell/02-peek-panels-upload.js', ['searchPeekTargetRect']);
    const result = ctx.searchPeekTargetRect(area);
    assert.equal(result.top, top * scale);
    assert.equal(result.bottom, (top + 58) * scale);
    assert.equal(result.left, 170);
    area.getBoundingClientRect = () => ({ left: 170, right: 170 + 620 * scale, width: 620 * scale, top: 5 });
    assert.equal(ctx.searchPeekTargetRect(area).top, top * scale, 'animation must not move the activation area');
  }
});

test('window controls, fullscreen DIY and account controls cannot own the search hover trigger', () => {
  const ctx = vm.createContext({});
  loadFunctions(ctx, 'public/js/modules/10-shell/02-peek-panels-upload.js', ['isSearchPeekChromeTarget']);
  for (const owner of ['.desktop-window-controls', '#fullscreen-diy-zone', '#top-right']) {
    assert.equal(ctx.isSearchPeekChromeTarget({ closest: selectors => selectors.split(', ').includes(owner) ? {} : null }), true);
  }
  assert.equal(ctx.isSearchPeekChromeTarget({ closest: () => null }), false);
  assert.equal(ctx.isSearchPeekChromeTarget(null), false);
});
test('pointer-auto-hide does not remove a panel when focus enters before its timer fires',()=>{
  const f=fixture();f.context.setPeek(f.panel,false,'search',true);f.context.document.activeElement=f.control;f.flush();assert(f.classes.has('peek'));
});
test('unfocused automatic hide and explicit dismissal retain their current behavior',()=>{
  const f=fixture();f.context.setPeek(f.panel,false,'search',true);f.flush();assert(!f.classes.has('peek'));
  f.classes.add('peek');f.context.document.activeElement=f.control;f.context.setPeek(f.panel,false,'search');f.flush();assert(!f.classes.has('peek'));
});
test('all pointer-auto-hide callsites opt into focus preservation',()=>{
  const s=fs.readFileSync('public/js/modules/10-shell/02-peek-panels-upload.js','utf8');
  const pointer=s.slice(s.indexOf("window.addEventListener('mousemove'"));
  const calls=pointer.match(/setPeek\([^;]+false[^;]+\)/g)||[];assert.equal(calls.length,4);calls.forEach(call=>assert.match(call,/, true\)$/));
});
test('leaving focus resumes the pending pointer hide after its original delay',()=>{
  const f=fixture();f.context.document.activeElement=f.control;f.context.setPeek(f.panel,false,'search',true);f.flush();assert(f.classes.has('peek'));
  f.context.document.activeElement=null;f.handlers.focusout();f.flush();assert(f.classes.has('peek'));f.flush();assert(!f.classes.has('peek'));
});
test('nested focus and a pointer return do not restart an obsolete hide',()=>{
  const f=fixture();f.context.document.activeElement=f.control;f.context.setPeek(f.panel,false,'search',true);f.flush();f.handlers.focusout();f.flush();assert(f.classes.has('peek'));
  f.context.setPeek(f.panel,true,'search');f.context.document.activeElement=null;f.handlers.focusout();f.flush();f.flush();assert(f.classes.has('peek'));
});

function playlistFixture() {
  const timers=new Map(),classes=new Set(['peek','show']),handlers={};
  let serial=0;
  const control={tagName:'BUTTON',matches:()=>false,blur(){context.document.activeElement=null;}};
  const panel={classList:{contains:c=>classes.has(c)},contains:n=>n===control,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const context=vm.createContext({document:{activeElement:null},immersiveMode:false,diyPlayerMode:true,emptyHomeActive:false,playlistPanelPinned:false,peekTimers:{pl:null},
    setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    resetSecondaryPlaylistEdgeGuard(){},playlistPeekHideDelay:()=>72,isTypingTarget:n=>n.tagName==='INPUT',
    closePlaylistPanelSoft(){classes.delete('peek');classes.delete('show');}});
  loadFunctions(context,'public/js/modules/10-shell/02-peek-panels-upload.js',['shouldPreservePeekFocus','setPeek']);
  return {context,panel,control,classes,handlers,timers,flush(){const batch=[...timers.values()];timers.clear();batch.forEach(fn=>fn());}};
}

test('playlist outside movement keeps one deadline and closes both hover and button-open states',()=>{
  const f=playlistFixture();
  f.context.setPeek(f.panel,false,'pl',true);const deadline=f.context.peekTimers.pl;
  for(let i=0;i<10;i++) f.context.setPeek(f.panel,false,'pl',true);
  assert.equal(f.context.peekTimers.pl,deadline);assert.equal(f.timers.size,1);
  f.flush();assert(!f.classes.has('peek'));assert(!f.classes.has('show'));
});

test('playlist mouse-focused buttons do not hold auto-hide, keyboard focus and typing do',()=>{
  for(const kind of ['mouse','keyboard','input']) {
    const f=playlistFixture();
    f.control.matches=()=>kind==='keyboard';f.control.tagName=kind==='input'?'INPUT':'BUTTON';
    f.context.document.activeElement=f.control;f.context.setPeek(f.panel,false,'pl',true);f.flush();
    assert.equal(f.classes.has('peek'),kind!=='mouse',kind);
    if(kind==='mouse') assert.equal(f.context.document.activeElement,null);
    else {f.context.document.activeElement=null;f.handlers.focusout();f.flush();f.flush();assert(!f.classes.has('peek'));}
  }
});

test('pinned playlist ignores pointer-close requests',()=>{
  const f=playlistFixture();f.context.playlistPanelPinned=true;
  f.context.setPeek(f.panel,false,'pl',true);f.flush();assert(f.classes.has('peek'));assert(f.classes.has('show'));
});

test('leaving above or below the playlist closes even during its opening motion',()=>{
  const panel={};
  const context=vm.createContext({document:{getElementById:()=>panel},
    playlistPanelTargetRect:()=>({top:80,bottom:600,right:372}),
    isPlaylistPanelBottomControlsConflict:()=>false,isPlaylistPanelOpeningMotion:()=>true,
    playlistPanelFocusPadding:()=>42,isSecondaryLeftDisplaySeamGuardActive:()=>false,
    playlistPanelExitPadding:()=>46});
  loadFunctions(context,'public/js/modules/10-shell/02-peek-panels-upload.js',['shouldClosePlaylistPanelFromPointer']);
  assert.equal(context.shouldClosePlaylistPanelFromPointer(true,200,{},10,820),true);
  assert.equal(context.shouldClosePlaylistPanelFromPointer(true,200,{},700,820),true);
  assert.equal(context.shouldClosePlaylistPanelFromPointer(true,200,{},300,820),false);
});
