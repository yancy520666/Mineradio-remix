'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');
const context=vm.createContext({});
loadFunctions(context,'scripts/quick-check.js',['sameSelectorProperty']);
const rules=values=>values.map(value=>['',value]);
test('same-selector QA guard reads inherited declarations and final explicit overrides',()=>{
 assert.equal(context.sameSelectorProperty(rules(['position:sticky;top:12px','background:black']),'position'),'sticky');
 assert.equal(context.sameSelectorProperty(rules(['position:sticky;','position:relative;']),'position'),'relative');
 assert.equal(context.sameSelectorProperty(rules(['position:sticky!important;','position:relative;']),'position'),'sticky');
 assert.equal(context.sameSelectorProperty(rules(['top:12px!important;','top:auto!important;']),'top'),'auto');
});
