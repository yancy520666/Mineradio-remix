'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
function fixture() {
  let resolve; const calls=[];
  const state={key:'netease:old',token:1,playlist:{name:'old'},tracks:[{id:1}]};
  const context=vm.createContext({playlistPanelDetailState:state,
    normalizePlaylistProvider:p=>p, apiJson:()=>new Promise(r=>{resolve=r}),
    showToast:message=>calls.push(['toast',message]), cancelPlaylistPanelDetailRequest:()=>calls.push(['cancel']),
    refreshUserPlaylists:async()=>calls.push(['refresh']), renderPlaylistPanelDetailState:()=>calls.push(['render']),
  });
  loadFunctions(context,'public/js/modules/06-lyrics/02-playlist-detail.js',['togglePlaylistPanelCollection']);
  return {context,state,calls,finish:r=>resolve(r)};
}
test('a late collection result cannot clear or cancel the newly opened playlist',async()=>{
  const h=fixture();const pending=h.context.togglePlaylistPanelCollection(true);
  const next={key:'netease:new',token:2,playlist:{name:'new'},tracks:[{id:2}]};
  h.context.playlistPanelDetailState=next;h.finish({success:true});await pending;
  assert.equal(next.key,'netease:new');assert.equal(next.tracks.length,1);
  assert.equal(h.calls.some(c=>c[0]==='cancel'),false);assert.equal(h.calls.some(c=>c[0]==='refresh'),true);
});
test('closing and reopening the same playlist invalidates an earlier collection result',async()=>{
  const h=fixture();const pending=h.context.togglePlaylistPanelCollection(false);
  h.state.token++;h.state.key='netease:old';h.state.tracks=[{id:8}];h.finish({success:true});await pending;
  assert.equal(h.state.key,'netease:old');assert.equal(h.state.tracks[0].id,8);assert.equal(h.calls.some(c=>c[0]==='cancel'),false);
});
test('a current collection result still refreshes the catalog and closes its own detail',async()=>{
  const h=fixture();const pending=h.context.togglePlaylistPanelCollection(true);h.finish({success:true});await pending;
  assert.equal(h.state.key,'');assert.equal(h.state.tracks.length,0);assert.equal(h.calls.some(c=>c[0]==='cancel'),true);assert.equal(h.calls.some(c=>c[0]==='refresh'),true);
});
