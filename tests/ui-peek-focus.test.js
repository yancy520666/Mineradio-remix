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
  loadFunctions(context,'public/js/modules/10-shell/02-peek-panels-upload.js',['setPeek']);
  return {context,panel,control,classes,handlers,flush:()=>timers.splice(0).forEach(fn=>fn())};
}
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
