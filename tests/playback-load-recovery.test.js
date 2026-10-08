'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');
function context(overrides={}) {
 const notices=[],plays=[];const song={id:'fixture'},next={id:'next'};
 const c=vm.createContext({DOMException,Promise,navigator:{onLine:true},trackSwitchToken:4,currentIdx:0,playQueue:[song,next],audio:{currentTime:0},pendingPlaybackResumeAt:0,
  queueItemKey:s=>s.id,showSourceFallbackNotice:(...args)=>notices.push(args),playQueueAt:(...args)=>plays.push(args),setTimeout:fn=>{fn();return 1;},updatePlaybackProgressUi(){},startupAutoplayJobId:8,startupAutoplayAttempted:false,clearStartupAutoplayRetryTimer(){},...overrides});
 loadFunctions(c,'public/js/modules/05-playback/12-playback-switch-core.js',['playbackLoadIsNetworkError','requestPlaybackSourceUrl','playbackFailureToastText','playbackFailureNoticeFromError','isPlaybackRecursionError','showPlaybackLoadFailure','scheduleAudioResumePosition']);
 return {c,notices,plays,song};
}
test('temporary URL errors get one retry at the same quality; offline makes no request',async()=>{
 let attempts=0;const {c,notices}=context({apiJson:async(url,opts)=>{assert.equal(url,'/song?quality=hires');assert.equal(opts.timeoutMs,14000);attempts++;if(attempts===1)throw Error('HTTP 503');return {url:'ok'};}});
 assert.equal((await c.requestPlaybackSourceUrl('/song?quality=hires',{timeoutMs:14000},4)).url,'ok');assert.equal(attempts,2);assert.equal(notices.length,1);
 c.navigator.onLine=false;await assert.rejects(c.requestPlaybackSourceUrl('/song?quality=hires',{},4),/OFFLINE/);assert.equal(attempts,2);
});
test('permanent failures and intentional aborts are not retried; exhausted network errors stop after two',async()=>{
 for(const error of [Error('VIP_REQUIRED'),new DOMException('Cancelled','AbortError'),Error('Failed to fetch')]) {
  let attempts=0;const {c}=context({apiJson:async()=>{attempts++;throw error;}});await assert.rejects(c.requestPlaybackSourceUrl('/song',{},4));assert.equal(attempts,error.message==='Failed to fetch'?2:1);
 }
});
test('replaced tracks reject both late successful responses and pending automatic retries',async()=>{
 const {c}=context();c.apiJson=async()=>{c.trackSwitchToken++;return {url:'old'};};await assert.rejects(c.requestPlaybackSourceUrl('/song',{},4),e=>e.name==='AbortError');
 c.trackSwitchToken=4;let attempts=0;c.apiJson=async()=>{attempts++;throw Error('Failed to fetch');};c.setTimeout=fn=>{c.trackSwitchToken++;fn();};await assert.rejects(c.requestPlaybackSourceUrl('/song',{},4),e=>e.name==='AbortError');assert.equal(attempts,1);
});
test('a recovery card retains resume and quality, stops startup retries and ignores stale actions',()=>{
 const {c,notices,plays,song}=context();assert.equal(c.showPlaybackLoadFailure(song,0,4,Error('Failed to fetch'),{resumeAt:37.25,qualityOverride:'hires'}),true);assert.equal(c.startupAutoplayJobId,9);
 const actions=notices[0][2].actions;actions[0].onClick();assert.equal(plays[0][0],0);assert.equal(plays[0][1].resumeAt,37.25);assert.equal(plays[0][1].qualityOverride,'hires');assert.equal(plays[0][1].skipShuffleOrder,true);
 c.trackSwitchToken=5;actions[0].onClick();actions[1].onClick();assert.equal(plays.length,1);assert.equal(c.showPlaybackLoadFailure(song,0,4,Error('timeout')),false);
});
test('saved resume stays pending through asynchronous seek and late seeked cannot modify a new track',()=>{
 const {c}=context();let seeking=false,time=0;const handlers={};const media={readyState:1,duration:100,get currentTime(){return time;},set currentTime(v){time=v;seeking=true;},get seeking(){return seeking;},addEventListener(n,fn){handlers[n]=fn;},removeEventListener(n){delete handlers[n];}};
 c.scheduleAudioResumePosition(media,37.25,4);assert.equal(media.__mineradioPendingResumeAt,37.25);seeking=false;handlers.seeked();assert.equal(media.__mineradioPendingResumeAt,0);
 c.scheduleAudioResumePosition(media,50,4);c.trackSwitchToken=5;seeking=false;handlers.seeked();assert.equal(media.__mineradioPendingResumeAt,50);
});
test('restore warmup prefers saved line over bootstrap and ignores the old media clock',()=>{
 const c=vm.createContext({stageLyricRestoreWarmup:{time:60,token:4,until:18000,snapPending:true},trackSwitchToken:4,stageLyricNowMs:()=>1000,audio:{currentTime:200,__mineradioTrackSwitchToken:3},lyricsLines:[{t:0},{t:30},{t:60}],stageLyricTrackSwitchBootstrapUntil:4800,stageLyrics:{currentIdx:-1},findStageLyricIndexAtTime:t=>t>=60?2:t>=30?1:0});
 loadFunctions(c,'public/js/modules/02-visual/14-stage-lyrics-rendering.js',['clearStageLyricRestoreWarmup','stageLyricRestoreWarmupSeconds','stageLyricIndexForSeconds','chooseStageLyricPrewarmIndex']);
 assert.equal(c.chooseStageLyricPrewarmIndex(),2);c.audio={currentTime:61,__mineradioTrackSwitchToken:4};c.stageLyricRestoreWarmup.snapPending=false;assert.equal(c.stageLyricRestoreWarmupSeconds(),61);assert.equal(c.stageLyricRestoreWarmupSeconds(),null);
});
test('placeholder title is complete without altering real timed lyric progress',()=>{
 const c=vm.createContext({audio:{duration:248},lyricLineHasNativeKaraoke:()=>false});loadFunctions(c,'public/js/modules/02-visual/14-stage-lyrics-rendering.js',['getLyricLineProgress']);
 assert.equal(c.getLyricLineProgress({t:0,duration:9999,fallback:true},null,.5),1);const real=c.getLyricLineProgress({t:0,duration:4},null,.5);assert.ok(real>0&&real<.1);
});
