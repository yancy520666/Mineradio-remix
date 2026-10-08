'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

test('a delayed lyric response keeps the current track title even after payload invalidation', () => {
  const group = {}, mesh = { parent: group, userData: { state: 'in', stageLyricText: 'Song - Artist', age: 0.8 } };
  const ctx = vm.createContext({ stageLyrics: { group, current: mesh, currentText: 'Song - Artist', currentPayload: null, currentTrackToken: 2 }, trackSwitchToken: 2 });
  loadFunctions(ctx, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['stageLyricCanKeepIntroTitle']);
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), true);
  assert.equal(ctx.stageLyrics.current, mesh);
  assert.equal(mesh.userData.age, 0.8);
  ctx.trackSwitchToken = 3;
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), false);
  ctx.trackSwitchToken = 2;
  mesh.parent = null;
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), false);
  mesh.parent = group; mesh.userData.state = 'out';
  assert.equal(ctx.stageLyricCanKeepIntroTitle('Song - Artist'), false);
});

function introContext(firstTime) {
  let now = 1, shows = 0;
  const group = {}, ctx = vm.createContext({ stageLyricIntro: null, trackSwitchToken: 7, playing: true,
    audio: { src: 'fixture', paused: false, __mineradioTrackSwitchToken: 7, currentTime: 0 }, fx: {lyricPauseHold:true},stageLyricProgressPreviewActive:()=>false,
    stageLyrics: { group, current: null, outgoing: [] }, lyricsLines: firstTime == null ? [] : [{ t: firstTime, text: 'Real lyric' }],
    lyricFallbackTextForSong: song => song.name, stageLyricNowMs: () => now, isNoLyricText: () => false,
    stageLyricPlaybackSeconds: () => ctx.audio.currentTime, getAdjustedLyricPlaybackTime: t => t,
    findStageLyricIndexAtTime: () => 0, scheduleStageLyricPrewarmForIndex() {}, updateLyricMeshProgress() {},
    showStageLine: text => { shows++; ctx.stageLyrics.current = { position: { y: .2 }, userData: {}, text }; return true; },
    retireCurrentStageLyricForIdle: () => { ctx.stageLyrics.current = null; },
  });
  loadFunctions(ctx, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js', ['beginStageLyricIntro','stageLyricIntroActive','tickStageLyricIntro']);
  return { ctx, advance(ms) { now += ms; return ctx.tickStageLyricIntro(); }, shows: () => shows };
}
test('a zero-second lyric waits for the sole title to finish its upward exit', () => {
  const {ctx,advance,shows} = introContext(0);
  ctx.beginStageLyricIntro({name:'Title'},7,0); advance(0);
  const title = ctx.stageLyrics.current;
  for(let i=0;i<4;i++) advance(100);
  assert.equal(ctx.stageLyrics.current,title); assert.equal(shows(),1);
  advance(50); assert.equal(ctx.stageLyricIntro.phase,'title-exit');
  assert.equal(ctx.stageLyrics.current,null); assert.equal(title.userData.exitDirection,1);
  assert.equal(advance(100),true,'incoming lyric must still wait for the outgoing title');
  ctx.stageLyrics.outgoing=[];
  assert.equal(advance(100),false); assert.equal(ctx.stageLyricIntroActive(),false); assert.equal(shows(),1);
});
test('a long intro, pause and delayed lyric preserve one title, while progress restoration skips it', () => {
  const {ctx,advance,shows} = introContext(null);
  ctx.beginStageLyricIntro({name:'Title'},7,0); advance(0);
  for(let i=0;i<8;i++) advance(100);
  const title=ctx.stageLyrics.current; assert.equal(ctx.stageLyricIntro.phase,'title');
  ctx.audio.paused=true;advance(100);ctx.audio.paused=false;advance(100);
  ctx.lyricsLines=[{t:8,text:'Real lyric'}];ctx.audio.currentTime=2;
  advance(100);assert.equal(ctx.stageLyrics.current,title);assert.equal(shows(),1);
  ctx.audio.currentTime=7.8;advance(100);assert.equal(ctx.stageLyricIntro.phase,'title-exit');
  ctx.beginStageLyricIntro({name:'Restored'},7,60);assert.equal(ctx.stageLyricIntroActive(),false);
});

test('a seek during title introduction bypasses its timer and remains visible during the internal pause',()=>{
 const {ctx,advance}=introContext(0);ctx.beginStageLyricIntro({name:'Title'},7,0);advance(0);
 const title=ctx.stageLyrics.current;ctx.stageLyricProgressPreviewActive=()=>true;ctx.audio.paused=true;ctx.fx.lyricPauseHold=false;
 assert.equal(advance(30),false);assert.equal(ctx.stageLyricIntro.phase,'lyrics');
 assert.equal(ctx.stageLyrics.current,title);assert.equal(ctx.stageLyrics.group.visible,true);
});
