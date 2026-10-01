'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/14-player-controls.js'), 'utf8');
function extract(name) {
  const start = source.indexOf('function ' + name + '('), end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start, name);
  return (source.slice(Math.max(0, start - 6), start) === 'async ' ? 'async ' : '') + source.slice(start, end + 3);
}
function fixture() {
  const timers = new Map(), retries = [], notices = []; let nextId = 0, now = 10000;
  const song = {id:1,provider:'netease',name:'Stall QA'};
  const media = {src:'test.mp3',currentSrc:'test.mp3',paused:false,ended:false,seeking:false,currentTime:0,readyState:4,networkState:2,NETWORK_NO_SOURCE:3,__mineradioQueueItemKey:'netease:1',__mineradioPlaybackStartedToken:7,__mineradioPlaybackExpected:true};
  const recovery = {visitedSongKeys:{'netease:1':true}};
  const context = vm.createContext({
    audio:media,playQueue:[song],currentIdx:0,trackSwitchToken:7,pendingAudioPause:null,
    PLAYBACK_RESUME_STALL_DELAYS:[1600,3600,6500,9500],
    playbackResumeRecovery:{serial:0,pending:false,lastAttemptAt:0,timerIds:[]},
    performance:{now:()=>now},setTimeout(fn,delay){const id=++nextId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
    queueItemKey:s=>s.provider+':'+s.id,songProviderKey:s=>s.provider,normalizePlaybackProvider:p=>p,
    playbackMediaMatchesCurrentQueueItem:m=>m===context.audio && m.__mineradioQueueItemKey===context.queueItemKey(context.playQueue[context.currentIdx]),
    ensurePlaybackAudioGraph:async()=>true,ensureAudiblePlaybackGain:()=>false,
    isQishuiTrackStartStalled:()=>false,nudgeQishuiTrackStart:async()=>false,
    currentResumeSeconds:value=>Math.max(media.currentTime,value||0),
    playbackStallRecoveryTransaction:()=>recovery,sourceFallbackRecoveryIdentityActive:r=>r===recovery,
    settleSourceFallbackTerminal(_idx,_token,message,opts){notices.push({message,opts});return false;},
    playQueueAt:async()=>true,forcePlaybackControlsInteractive(){},console:{warn(){}},Promise,
  });
  vm.runInContext(['isSameAudioPlaybackTarget','canRefreshCurrentPlaybackUrlForResume','trackSwitchStallRecoveryAllowed','clearPlaybackResumeWatchdogs','playbackStallRecoveryOwnerStillCurrent','schedulePlaybackStallRecovery','playbackFreshUrlRecoverySongKey','resetPlaybackFreshUrlRecoveryBudget','recoverCurrentTrackPlaybackFromFreshUrl'].map(extract).join('\n'),context);
  const recover = context.recoverCurrentTrackPlaybackFromFreshUrl;
  context.recoverCurrentTrackPlaybackFromFreshUrl=async(reason,opts)=>{
    retries.push({reason,opts});context.clearPlaybackResumeWatchdogs();context.playbackResumeRecovery.serial++;return true;
  };
  return {context,media,timers,retries,notices,recover,advance(ms){now+=ms;},async fire(delay){const entry=[...timers].find(([,timer])=>timer.delay===delay);assert(entry,'missing deadline '+delay);timers.delete(entry[0]);now+=delay;await entry[1].fn();}};
}
(async()=>{
  const starting=fixture();starting.media.__mineradioPlaybackStartedToken=undefined;
  starting.context.schedulePlaybackStallRecovery('stalled',{});
  assert.equal(starting.timers.size,0,'buffering before play starts must not race the startup retry');
  const partial=fixture();partial.context.schedulePlaybackStallRecovery('track-start',{trackSwitch:true,silent:true});
  partial.media.currentTime=0.4;await partial.fire(1600);
  for(let i=0;i<8;i++)partial.context.schedulePlaybackStallRecovery('stalled',{silent:true});
  assert.equal(partial.timers.size,3,'stalled notifications must preserve the original remaining deadlines');
  await partial.fire(3600);assert.equal(partial.retries.length,1,'a short initial advance must not hide a later stall');
  assert.equal(partial.retries[0].opts.resumeAt,0.4);

  const later=fixture();later.context.schedulePlaybackStallRecovery('track-start',{trackSwitch:true});
  later.media.currentTime=1;await later.fire(1600);later.media.currentTime=2;await later.fire(3600);
  await later.fire(6500);assert.equal(later.retries.length,1,'opening stall after the first two checks must be recovered');

  const normal=fixture();normal.context.schedulePlaybackStallRecovery('track-start',{trackSwitch:true});
  for(const [delay,time] of [[1600,1],[3600,3],[6500,6],[9500,9]]){normal.media.currentTime=time;await normal.fire(delay);}
  assert.equal(normal.retries.length,0,'normally progressing playback must not retry');
  const seeking=fixture();seeking.media.currentTime=10;seeking.context.schedulePlaybackStallRecovery('track-start',{});
  seeking.media.currentTime=2;await seeking.fire(3600);assert.equal(seeking.retries.length,0,'a backward seek must reset the progress baseline');

  const failed=fixture();failed.media.paused=true;failed.media.error={code:2};
  failed.context.schedulePlaybackStallRecovery('error',{silent:false});await failed.fire(3600);
  assert.equal(failed.retries.length,1,'automatic error pause must still recover');
  const paused=fixture();paused.media.paused=true;paused.media.error={code:2};paused.media.__mineradioPlaybackExpected=false;
  paused.context.schedulePlaybackStallRecovery('error',{});await paused.fire(3600);assert.equal(paused.retries.length,0,'manual pause must not restart');
  const pausing=fixture();pausing.context.pendingAudioPause={};pausing.context.schedulePlaybackStallRecovery('stalled',{});
  await pausing.fire(3600);assert.equal(pausing.retries.length,0,'pending manual pause must not restart');

  const stale=fixture();stale.context.schedulePlaybackStallRecovery('track-start',{});stale.context.trackSwitchToken++;
  await stale.fire(3600);assert.equal(stale.retries.length,0,'old track watchdog must not affect a new track');

  const bounded=fixture();let freshCalls=0;bounded.context.playQueueAt=async()=>{freshCalls++;return true;};
  bounded.context.recoverCurrentTrackPlaybackFromFreshUrl=bounded.recover;
  assert.equal(await bounded.recover('stalled',{silent:true}),true);bounded.advance(2000);
  assert.equal(await bounded.recover('stalled-again',{silent:true}),false);
  assert.equal(freshCalls,1,'fresh link retry must stay bounded');
  assert.equal(bounded.notices.length,1);assert.equal(bounded.notices[0].opts.silent,false,'exhausted recovery must show a failure notice');

  const reload=fixture();let reloads=0,restored=0;
  reload.media.error={code:2};reload.media.readyState=1;reload.media.networkState=3;reload.media.paused=true;reload.media.currentTime=2;
  reload.media.load=()=>{reloads++;reload.media.error=null;};
  reload.media.play=()=>{assert(!reload.media.error,'errored source must reload before play');reload.media.paused=false;return Promise.resolve();};
  Object.assign(reload.context,{
    waitForAudioReadyToPlay:async()=>false,playbackAttemptStillCurrent:(media,token)=>media===reload.media && token===7,
    audioGraphHealthy:()=>true,applyAudioOutputDevice:async()=>{},awaitMediaPlayWithTimeout:async(_media,promise)=>promise,
    restoreMediaTimeWhenReady:(_media,seconds)=>{restored=seconds;},completeAudioPlayStart:async()=>true,
  });
  vm.runInContext(extract('retryTrackSwitchAudioPlayOnce'),reload.context);
  assert.equal(await reload.context.retryTrackSwitchAudioPlayOnce({manual:true},new Error('network'),reload.media,7),true);
  assert.equal(reloads,1);assert.equal(restored,2);
  console.log('OK playback-start-stall: partial/later stall, event deduplication, healthy playback, error/manual pause, stale track, bounded retry and notice');
})().catch(error=>{console.error(error);process.exitCode=1;});
