'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const file='public/js/modules/05-playback/03a-home-dashboard.js';
function fixture() {
  const saved=new Map(), notices=[], calls=[];
  const context=vm.createContext({
    document:{hidden:false,body:{classList:{contains:c=>c==='empty-home-active'}}},emptyHomeActive:true,
    desktopRuntimeState:{desktop:true,minimized:true,visible:false},isDeepBackgroundMode:()=>true,
    HOME_DASHBOARD_VIDEO_MAX_BYTES:300*1024*1024,HOME_DASHBOARD_VIDEO_META_KEY:'meta',homeDashboardVideoEditToken:0,
    localStorage:{setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
    homeDashboardIsMp4File:()=>true,homeDashboardNotify:v=>notices.push(v),homeDashboardRenderVideoActions(){},
    homeDashboardReleaseVideoSource:()=>calls.push('release'),homeDashboardUpdateVideoPower(){},console,
  });
  loadFunctions(context,file,['homeDashboardVideoShouldPlay','handleHomeDashboardVideoFile','clearHomeDashboardVideo']);
  return {context,saved,notices,calls};
}
test('native deep-background policy suppresses hero playback even before document.hidden catches up',()=>{
  const f=fixture();assert.equal(f.context.homeDashboardVideoShouldPlay(),false);
  f.context.isDeepBackgroundMode=()=>false;assert.equal(f.context.homeDashboardVideoShouldPlay(),true);
  f.context.document.hidden=true;assert.equal(f.context.homeDashboardVideoShouldPlay(),false);
});
test('removing a pending saved MP4 prevents its stale continuation from restoring metadata or success',async()=>{
  const f=fixture();let finish;
  f.context.homeDashboardPutVideoBlob=()=>new Promise(r=>finish=r);f.context.homeDashboardDeleteVideoBlob=async()=>{};
  const save=f.context.handleHomeDashboardVideoFile({name:'old.mp4',type:'video/mp4',size:1});
  await f.context.clearHomeDashboardVideo();finish();await save;
  assert.equal(f.saved.has('meta'),false);assert.deepEqual(f.notices,['已恢复主页默认动画']);
});
test('a later file selection wins over an earlier save continuation',async()=>{
  const f=fixture(),resolvers=[];
  f.context.homeDashboardPutVideoBlob=()=>new Promise(r=>resolvers.push(r));
  const first=f.context.handleHomeDashboardVideoFile({name:'first.mp4',size:1});
  const second=f.context.handleHomeDashboardVideoFile({name:'second.mp4',size:2});
  resolvers[0]();await first;assert.equal(f.saved.has('meta'),false);
  resolvers[1]();await second;assert.equal(JSON.parse(f.saved.get('meta')).name,'second.mp4');assert.equal(f.notices.length,1);
});
