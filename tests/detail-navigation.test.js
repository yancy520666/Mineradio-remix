'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
  const body = { scrollTop: 0, childNodes: [], querySelector: () => null, addEventListener() {},
    replaceChildren(...nodes) { this.childNodes = nodes; }, __syncSmoothWheelTarget(top) { this.scrollTop = top; } };
  const label = { textContent: '' };
  const back = { hidden: true, querySelector: () => label, focus() {} };
  const panel = { inert: false, scrollTop: 220, classList: { toggle() {} } };
  const heading = { textContent: '歌曲详情' };
  const elements = { 'track-detail-body': body, 'track-detail-heading': heading, 'track-detail-back': back, 'playlist-panel': panel };
  const c = { Map, Set, console, clearTimeout, document: { activeElement: null, getElementById: id => elements[id] },
    trackDetailSeq: 1, playlistPanelPinned: false, detailArtistSongs: [], detailAlbumSongs: [], detailAlbumContext: null,
    detailAlbumGaplessEnabled: true, detailAlbumGaplessUserTouched: false, detailArtistSongState: null,
    detailArtistAlbums: [], detailArtistAlbumQuery: '', detailArtistAlbumState: null, detailCommentsState: null, detailCommentSort: 'latest',
    cloneSong: song => ({...song}), songProviderKey: song => song.provider || 'netease',
    currentArtistId: song => song.provider === 'qq' ? '' : song.artistId,
    currentQQArtistMid: song => song.artistMid, currentAlbumKey: song => song.albumId || song.albumMid,
    albumDetailUrlForSong: song => song.albumId || song.albumMid ? '/album' : '',
    escHtml: s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    accountActionAuthSnapshot: () => ({ epoch: 1 }), accountActionAuthCurrent: auth => auth.epoch === 1,
    cancelDetailCommentReads() {}, bindTrackDetailScrollers() {}, showToast() {},
    renderArtistSongPage() {}, renderArtistAlbumSection() {}, syncAlbumCollectionState() {}, syncAlbumGaplessButton() {},
    loadArtistAlbumSection() {}, closeTrackDetailModal() { c.clearTrackDetailNavigation(); },
    openTrackDetailModal(type, song, options) { c.beginTrackDetailNavigation(type, song, options); c.trackDetailSeq++; },
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('public/js/modules/05-playback/06d-detail-navigation.js','utf8'), c);
  return {c,body,back,label,panel,heading};
}
const song = { id: 1, name: 'Song', artist: 'Artist', artistId: 11, album: 'Album', albumId: 21 };

test('entity links are escaped, deduplicated and preserve each selected artist identity', () => {
  const {c}=fixture();
  assert.match(c.detailNavigationLink('<Song>', 'song', song), /&lt;Song>/);
  c.detailNavigationLink('<Song>', 'song', song);
  assert.equal(c.trackDetailNavigation.links.length, 1, 're-rendering does not grow the registry');
  c.detailArtistLinks({...song, artists:[{id:11,name:'First'},{id:12,name:'Second'}]});
  const second=c.trackDetailNavigation.links[2].song;
  assert.equal(second.artistId, 12);
  assert.equal(second.artist, 'Second');
  c.detailArtistLinks({provider:'qq', artistMid:'wrong', artists:[{mid:'correct',name:'QQ Artist'}]});
  assert.equal(c.trackDetailNavigation.links[3].song.artistMid,'correct');
  const before=c.trackDetailNavigation.links.length;
  assert.equal(c.detailNavigationLink('Unknown album','album',{provider:'kugou'}),'Unknown album');
  assert.equal(c.trackDetailNavigation.links.length,before);
});

test('Back restores loaded artist pages and scroll without sharing the old request owner', async () => {
  const {c,body}=fixture();
  c.beginTrackDetailNavigation('artist', song);
  const tracks=Array.from({length:72},(_,i)=>({...song,id:i+1}));
  c.detailArtistSongs=tracks;
  c.detailArtistSongState={songs:tracks,offset:72,hasMore:true,loading:true,seq:1};
  const oldOwner=c.detailArtistSongState;
  body.scrollTop=700;
  body.childNodes=[{name:'artist page'}];
  await c.navigateTrackDetail('album',song);
  assert.equal(c.trackDetailNavigation.history.length,1);
  c.detailArtistSongs=[]; c.detailArtistSongState=null; body.scrollTop=0;
  c.backTrackDetail();
  assert.equal(c.trackDetailNavigation.current.type,'artist');
  assert.equal(c.detailArtistSongs.length,72);
  assert.equal(c.detailArtistSongState.offset,72);
  assert.equal(c.detailArtistSongState.loading,false);
  assert.notEqual(c.detailArtistSongState,oldOwner);
  assert.equal(c.detailArtistSongState.seq,c.trackDetailSeq);
  assert.equal(body.scrollTop,700);
  assert.equal(body.childNodes[0].name,'artist page');
});

test('stale artist resolution cannot reopen a closed detail', async () => {
  const {c}=fixture(); let finish;
  c.resolveArtistSongForDetail=()=>new Promise(resolve=>{finish=resolve;});
  const opening=c.navigateTrackDetail('artist',{...song,artistId:''});
  c.clearTrackDetailNavigation();
  finish(song); await opening;
  assert.equal(c.trackDetailNavigation.current,null);
});

test('playlist origin stays suspended through child navigation and is restored on final Back', async () => {
  const {c,panel,label}=fixture();
  c.beginTrackDetailNavigation('song',song,{origin:true});
  assert.equal(panel.inert,true);
  assert.equal(c.playlistPanelPinned,true);
  assert.equal(label.textContent,'返回歌单');
  await c.navigateTrackDetail('artist',song);
  c.backTrackDetail();
  assert.equal(panel.inert,true);
  c.backTrackDetail();
  assert.equal(panel.inert,false);
  assert.equal(c.playlistPanelPinned,false);
  assert.equal(panel.scrollTop,220);
  assert.equal(c.trackDetailNavigation.history.length,0);
});

test('history is bounded; new external entry resets it and same-entity links do not push', async () => {
  const {c}=fixture();
  c.beginTrackDetailNavigation('song',song);
  await c.navigateTrackDetail('song',song);
  assert.equal(c.trackDetailNavigation.history.length,0);
  for(let i=2;i<30;i++)await c.navigateTrackDetail('song',{...song,id:i});
  assert.equal(c.trackDetailNavigation.history.length,20);
  c.beginTrackDetailNavigation('album',song);
  assert.equal(c.trackDetailNavigation.history.length,0);
});
