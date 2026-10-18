'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');
function fixture(){const h=vm.createContext({shelfPinnedOpen:false,shelfVisibility:1,shelfAlwaysVisible:()=>false});loadFunctions(h,'public/js/modules/04-shelf/00-layout-hover.js',['shouldBindSideShelfToCover']);return h;}
test('opened shelf and details stay fixed while the background rotates',()=>{const h=fixture();h.shelfPinnedOpen=true;assert.equal(h.shouldBindSideShelfToCover(false,false),false);assert.equal(h.shouldBindSideShelfToCover(false,true),false);h.shelfPinnedOpen=false;assert.equal(h.shouldBindSideShelfToCover(false,true),false);});
test('closing restores the existing cover-bound passive preview',()=>{const h=fixture();h.shelfPinnedOpen=true;assert.equal(h.shouldBindSideShelfToCover(false,false),false);h.shelfPinnedOpen=false;assert.equal(h.shouldBindSideShelfToCover(false,false),true);h.shelfVisibility=0;assert.equal(h.shouldBindSideShelfToCover(false,false),false);h.shelfAlwaysVisible=()=>true;assert.equal(h.shouldBindSideShelfToCover(false,false),true);});
