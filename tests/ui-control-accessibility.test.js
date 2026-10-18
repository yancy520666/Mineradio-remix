'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture() {
  const classes=new Set(),attrs={},handlers={},observers=[];
  const toggle={tagName:'DIV',classList:{contains:c=>classes.has(c)},tabIndex:-1,
    setAttribute:(k,v)=>{attrs[k]=v},getAttribute:k=>attrs[k],click(){this.clicks=(this.clicks||0)+1;classes.add('on');observers.forEach(fn=>fn())}};
  const input={id:'fx-intensity'},label={htmlFor:'',contains:()=>false};
  const row={querySelector:selector=>selector==='label'?label:input};
  const panel={querySelectorAll:selector=>selector==='.fx-slider'?[row]:[toggle],contains:n=>n===toggle,
    addEventListener:(type,fn)=>{handlers[type]=fn}};
  const context=vm.createContext({MutationObserver:class{constructor(fn){observers.push(fn)}observe(){} }});
  loadFunctions(context,'public/js/modules/07-fx/09-console-workspace.js',['initializeFxControlAccessibility']);
  context.initializeFxControlAccessibility(panel);
  function key(value,repeat=false){const e={target:{closest:()=>toggle},key:value,repeat,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}};handlers.keydown(e);return e;}
  return {context,toggle,input,label,panel,key,attrs};
}
test('visual settings expose their sibling labels and button state without replacing markup',()=>{
  const f=fixture();assert.equal(f.label.htmlFor,f.input.id);assert.equal(f.toggle.tabIndex,0);
  assert.equal(f.attrs.role,'button');assert.equal(f.attrs['aria-pressed'],'false');
  const e=f.key(' ');assert.equal(f.toggle.clicks,1);assert.equal(e.prevented,true);assert.equal(e.stopped,true);assert.equal(f.attrs['aria-pressed'],'true');
});
test('repeat suppression and idempotent initialization keep a toggle to one activation',()=>{
  const f=fixture();f.context.initializeFxControlAccessibility(f.panel);f.key('Enter');f.key('Enter',true);assert.equal(f.toggle.clicks,1);
});
test('ordinary toast notifications have a polite, atomic status announcement',()=>{
  const html=fs.readFileSync('public/index.html','utf8');assert.match(html,/<div id="toast" role="status" aria-live="polite" aria-atomic="true">/);
});
