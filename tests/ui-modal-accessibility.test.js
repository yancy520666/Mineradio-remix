'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture() {
  const handlers={}, masks=[], calls=[];
  let context;
  function node(id, owner) {
    const attrs={}, classes=new Set();
    return {id,style:{},tabIndex:0,isConnected:true,owner,
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
      setAttribute:(k,v)=>{attrs[k]=v},getAttribute:k=>attrs[k],hasAttribute:k=>k in attrs,
      focus(){context.document.activeElement=this;calls.push(['focus',this.id])},
      closest:()=>null,getClientRects:()=>[{}],contains(other){return other===this || other&&other.owner===this},
      querySelector:()=>null,querySelectorAll(){return this.controls||[]},
    };
  }
  const opener=node('opener');
  const doc={activeElement:opener,
    querySelectorAll:()=>masks.filter(m=>m.classList.contains('show')),
    getElementById:id=>masks.find(m=>m.id===id)||null,
    addEventListener(type,fn){(handlers[type]||(handlers[type]=[])).push(fn)},
  };
  context=vm.createContext({document:doc,window:{},requestAnimationFrame:fn=>fn(),
    getComputedStyle:n=>({zIndex:n.z||50,visibility:'visible'}),
    closeAudioOutputWorkflowPanel:()=>calls.push(['closeAudio']),
    closeCustomLyricModal:()=>calls.push(['closeLyric']),
    closeBuiltInPlaylistPrompt:accepted=>calls.push(['prompt',accepted]),
    closeHotkeySettings:()=>calls.push(['closeHotkey']),
  });
  loadFunctions(context,'public/js/modules/08-account/01-login-modal-utils.js',[
    'activeModalMask','modalFocusableElements','focusActiveModal','activateModalAccessibility','deactivateModalAccessibility',
    'closeModalFromKeyboard','initModalAccessibility','openGsapModal','closeGsapModal',
  ]);
  function addMask(id,z=50){const mask=node(id);mask.tabIndex=-1;mask.z=z;mask.controls=[node(id+'-first',mask),node(id+'-last',mask)];masks.push(mask);return mask;}
  function key(key,shiftKey=false,options={}){const e={key,shiftKey,defaultPrevented:false,...options,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true}};handlers.keydown.forEach(f=>f(e));return e;}
  return {context,masks,calls,doc,opener,addMask,key};
}
test('opening, tab wrapping and closing a dialog keep focus with its workflow',()=>{
  const f=fixture(),m=f.addMask('login-modal');f.context.openGsapModal(m);
  assert.equal(f.doc.activeElement,m);assert.equal(m.getAttribute('role'),'dialog');
  assert.equal(m.getAttribute('aria-modal'),'true');assert.equal(m.getAttribute('aria-hidden'),'false');
  f.key('Tab');assert.equal(f.doc.activeElement,m.controls[0]);
  f.key('Tab',true);assert.equal(f.doc.activeElement,m.controls[1]);
  f.key('Tab');assert.equal(f.doc.activeElement,m.controls[0]);
  f.context.closeGsapModal(m);assert.equal(f.doc.activeElement,f.opener);assert.equal(m.getAttribute('aria-hidden'),'true');
});
test('higher-z-index nested dialogs own Escape and restore their caller',()=>{
  const f=fixture(),login=f.addMask('login-modal'),collect=f.addMask('collect-modal',80);
  f.context.openGsapModal(login);login.controls[1].focus();f.context.openGsapModal(collect);
  assert.equal(f.context.activeModalMask(),collect);
  f.context.closeGsapModal(collect);assert.equal(f.doc.activeElement,login.controls[1]);
});
test('Escape in a textarea closes its modal before page shortcuts can run',()=>{
  const f=fixture(),m=f.addMask('custom-lyric-modal');f.context.openGsapModal(m);
  const e=f.key('Escape');assert.deepEqual(f.calls.at(-1),['closeLyric']);assert.equal(e.defaultPrevented,true);assert.equal(e.stopped,true);
});
test('audio route Escape and playlist-name cancellation use their existing close functions',()=>{
  const f=fixture(),audio=f.addMask('audio-output-workflow-modal');f.context.openGsapModal(audio);f.key('Escape');
  assert.deepEqual(f.calls.at(-1),['closeAudio']);audio.classList.remove('show');
  const prompt=f.addMask('built-in-playlist-prompt');f.context.openGsapModal(prompt);f.key('Escape');
  assert.deepEqual(f.calls.at(-1),['prompt',false]);
});
test('IME-owned and already consumed Escape events remain owned by the control',()=>{
  const f=fixture(),m=f.addMask('custom-lyric-modal');f.context.openGsapModal(m);
  const before=f.calls.length;
  f.key('Escape',false,{isComposing:true});f.key('Escape',false,{defaultPrevented:true});
  assert.equal(f.calls.length,before);
});
test('hotkey capture keeps Escape and Tab ownership; ordinary Escape closes its dialog',()=>{
  const f=fixture(),m=f.addMask('hotkey-modal',1450);f.context.openGsapModal(m);f.context.hotkeyCaptureState={action:'togglePlay',scope:'local'};
  assert.equal(f.key('Escape').defaultPrevented,false);assert.equal(f.key('Tab').defaultPrevented,false);
  f.context.hotkeyCaptureState=null;assert.equal(f.key('Escape').defaultPrevented,true);assert.deepEqual(f.calls.at(-1),['closeHotkey']);
});
test('public hotkey open and close reuse modal focus without registering real system keys',()=>{
  const f=fixture(),m=f.addMask('hotkey-modal',1450);
  Object.assign(f.context,{ensureHotkeyModal:()=>m,renderHotkeySettings(){},registerGlobalHotkeys(){},hotkeyCaptureState:null});
  loadFunctions(f.context,'public/js/modules/07-fx/06-hotkeys.js',['openHotkeySettings','closeHotkeySettings']);
  f.context.openHotkeySettings();assert.equal(f.doc.activeElement,m);f.key('Tab');assert.equal(f.doc.activeElement,m.controls[0]);
  f.context.closeHotkeySettings();assert.equal(f.doc.activeElement,f.opener);assert.equal(m.getAttribute('aria-hidden'),'true');
});
