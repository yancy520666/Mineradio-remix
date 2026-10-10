'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');
const qualityFile='public/js/modules/05-playback/00-api-quality-output.js';
const playbackFile='public/js/modules/05-playback/13-playback-start-audio.js';
const qualityNames=['normalizePlaybackProvider','normalizePlaybackQuality','normalizePlaybackQualityForProvider','playbackQualityRank',
 'playbackQualityTrackKey','playbackQualityAuthorizationKey','invalidatePlaybackQualityRuntimeCaps','playbackQualityRuntimeCapForSong',
 'playbackQualityCapValue','playbackQualityAboveCap','effectivePlaybackQualityForSong','requestPlaybackQualityRuntimeProbe',
 'consumePlaybackQualityRuntimeProbe','prunePlaybackQualityRuntimeCaps','markPlaybackQualityRuntimeCap','setPlaybackQuality','currentPlaybackQualityProvider',
 'getProviderPlaybackQuality','playbackQualityLabel'];
function qualityContext() {
 let now=100000;const song={provider:'qq',mid:'fixture-track'};const applied=[],notices=[];
 const c=vm.createContext({Date:{now:()=>now},playbackQualitySessionEpochs:{},playbackQualityRuntimeCaps:{},playQueue:[song],currentIdx:0,
  qqLoginStatus:{loggedIn:true,userId:'fixture-a',vipLevel:'none',playbackKeyReady:true},songProviderKey:s=>s.provider,
  playbackQualityPrefs:{qq:'hires'},PLAYBACK_QUALITY_DEFAULTS:{qq:'hires'},updatePlaybackQualityUi(){},savePlaybackQualityPreference(){},
  setProviderPlaybackQuality(p,q){c.playbackQualityPrefs[p]=q;},document:{getElementById:()=>null},applyPlaybackQualityToCurrentTrack:q=>applied.push(q),
  showSourceFallbackNotice:(...args)=>notices.push(args),providerAuthEpoch:()=>c.authEpoch,authEpoch:0});
 loadFunctions(c,qualityFile,qualityNames);
 return {c,song,applied,notices,advance(ms){now+=ms;}};
}
test('quality cap follows account identity, entitlement and authorization epoch; TTL distinguishes temporary evidence',()=>{
 const {c,song,advance}=qualityContext();
 c.markPlaybackQualityRuntimeCap(song,'qq','standard','resolved-lower');
 assert.equal(c.effectivePlaybackQualityForSong(song,'qq','hires'),'standard');
 c.qqLoginStatus.userId='fixture-b';assert.equal(c.effectivePlaybackQualityForSong(song,'qq','hires'),'hires');
 c.markPlaybackQualityRuntimeCap(song,'qq','standard','vip_required');
 c.qqLoginStatus.vipLevel='svip';assert.equal(c.effectivePlaybackQualityForSong(song,'qq','hires'),'hires');
 c.markPlaybackQualityRuntimeCap(song,'qq','standard','resolved-lower');c.authEpoch++;
 assert.equal(c.playbackQualityCapValue(song,'qq'),'');
 c.markPlaybackQualityRuntimeCap(song,'qq','standard','network-timeout');advance(60000);
 assert.equal(c.playbackQualityCapValue(song,'qq'),'');
 c.markPlaybackQualityRuntimeCap(song,'qq','standard','vip_required');advance(5*60000);
 assert.equal(c.playbackQualityCapValue(song,'qq'),'standard');advance(25*60000);
 assert.equal(c.playbackQualityCapValue(song,'qq'),'');
});
test('explicit high quality gets one consumable probe per minute while repeated playback retains its cap',()=>{
 const {c,song,applied,notices,advance}=qualityContext();
 c.markPlaybackQualityRuntimeCap(song,'qq','standard','resolved-lower');
 c.setPlaybackQuality('hires');assert.deepEqual(applied,['hires']);
 assert.equal(c.consumePlaybackQualityRuntimeProbe(song,'qq','hires'),true);
 assert.equal(c.consumePlaybackQualityRuntimeProbe(song,'qq','hires'),false);
 assert.equal(c.effectivePlaybackQualityForSong(song,'qq','hires'),'standard');
 c.markPlaybackQualityRuntimeCap(song,'qq','lossless','resolved-lower',true);
 assert.equal(c.playbackQualityCapValue(song,'qq'),'lossless');
 c.setPlaybackQuality('hires');assert.equal(applied.length,1);assert.match(notices[0][1],/每分钟/);
 advance(60000);c.setPlaybackQuality('hires');assert.equal(applied.length,2);
 c.invalidatePlaybackQualityRuntimeCaps('qq');assert.equal(c.playbackQualityCapValue(song,'qq'),'');
});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function preloadContext(extra={}) {
 const calls=[];const source={id:'A'},next={id:'B'};
 const c=vm.createContext({AbortController,Promise,console,trackSwitchToken:7,currentIdx:0,playQueue:[source,next],
  albumGaplessState:{serial:0,preload:null,albumKey:'fixture'},albumGaplessQueueCanAdvance:()=>true,queueItemKey:s=>s&&s.id,
  disposeAlbumGaplessPreload:p=>{if(p && p.media)p.media.disposed=true;},armAlbumGaplessMonitor(){},clearInterval(){},clearTimeout(){},
  resolveAlbumGaplessPlaybackData:async(s,opts)=>{calls.push('url:'+s.id);return {url:'fixture'};},
  searchAlternatePlatformSong:async()=>{calls.push('search');return {id:'C'};},
  Audio:function(){this.load=()=>calls.push('audio');},applyAudioOutputDevice:async()=>{},...extra});
 loadFunctions(c,playbackFile,['clearAlbumGaplessPreload','scheduleAlbumGaplessPreloadForCurrent']);
 return {c,calls};
}
test('clearing stale next-track URL work aborts it and stops before alternate search',async()=>{
 const gate=deferred();let signal;const {c,calls}=preloadContext({resolveAlbumGaplessPlaybackData:async(s,opts)=>{calls.push('url:'+s.id);signal=opts.signal;return gate.promise;}});
 const job=c.scheduleAlbumGaplessPreloadForCurrent(7);c.trackSwitchToken=8;c.currentIdx=1;c.clearAlbumGaplessPreload('switch');
 assert.equal(signal.aborted,true);gate.resolve({url:null});assert.equal(await job,false);assert.deepEqual(calls,['url:B']);
});
test('cancel during alternate search stops the next URL request and old cleanup preserves the new owner',async()=>{
 const gate=deferred();let searchSignal;let searches=0;
 const {c,calls}=preloadContext({resolveAlbumGaplessPlaybackData:async s=>{calls.push('url:'+s.id);return {url:null};},
  searchAlternatePlatformSong:async(s,t,r,opts)=>{searches++;searchSignal=opts.signal;calls.push('search');return gate.promise;}});
 const old=c.scheduleAlbumGaplessPreloadForCurrent(7);await new Promise(setImmediate);assert.equal(searches,1);
 c.clearAlbumGaplessPreload('replace');assert.equal(searchSignal.aborted,true);
 const newGate=deferred();c.resolveAlbumGaplessPlaybackData=async()=>newGate.promise;
 const newer=c.scheduleAlbumGaplessPreloadForCurrent(7),owner=c.albumGaplessState.pendingRequest;
 gate.resolve({id:'C'});assert.equal(await old,false);assert.equal(c.albumGaplessState.pendingRequest,owner);assert.deepEqual(calls,['url:B','search']);
 c.clearAlbumGaplessPreload('done');newGate.resolve({url:null});assert.equal(await newer,false);
});
test('duplicate preload scheduling shares only the next track and stale scheduler cannot cancel current work',async()=>{
 const gate=deferred();let urls=0;const {c}=preloadContext({resolveAlbumGaplessPlaybackData:async()=>{urls++;return gate.promise;}});
 const first=c.scheduleAlbumGaplessPreloadForCurrent(7),second=c.scheduleAlbumGaplessPreloadForCurrent(7);
 assert.equal(urls,1);const owner=c.albumGaplessState.pendingRequest;
 assert.equal(await c.scheduleAlbumGaplessPreloadForCurrent(6),false);assert.equal(c.albumGaplessState.pendingRequest,owner);assert.equal(owner.controller.signal.aborted,false);
 gate.resolve({url:'fixture'});assert.equal(await first,true);assert.equal(await second,true);
});
test('replaced work awaiting output selection never starts an audio download',async()=>{
 const gate=deferred();let media;const {c,calls}=preloadContext({applyAudioOutputDevice:async m=>{media=m;return gate.promise;}});
 const job=c.scheduleAlbumGaplessPreloadForCurrent(7);await new Promise(setImmediate);
 assert.equal(media.src,undefined);c.clearAlbumGaplessPreload('switch');gate.resolve();assert.equal(await job,false);assert.equal(media.disposed,true);assert.ok(!calls.includes('audio'));
});
test('main URL abort releases old work without old finally or stale caller cancelling the new track',async()=>{
 const gates=[deferred(),deferred()];const signals=[];let index=0;
 const c=vm.createContext({AbortController,DOMException,Promise,navigator:{onLine:true},trackSwitchToken:1,
  apiJson:async(url,opts)=>{signals.push(opts.signal);return gates[index++].promise;},setTimeout,clearTimeout});
 loadFunctions(c,'public/js/modules/05-playback/12-playback-switch-core.js',['cancelPlaybackSourceRequest','requestPlaybackSourceUrl','playbackLoadIsNetworkError']);
 const old=c.requestPlaybackSourceUrl('/old',{},1);c.trackSwitchToken=2;c.cancelPlaybackSourceRequest();assert.equal(signals[0].aborted,true);
 const newer=c.requestPlaybackSourceUrl('/new',{},2);const owner=c.pendingPlaybackSourceRequest;
 await assert.rejects(c.requestPlaybackSourceUrl('/stale',{},1),e=>e.name==='AbortError');assert.equal(signals[1].aborted,false);
 gates[0].resolve({url:'old'});await assert.rejects(old,e=>e.name==='AbortError');assert.equal(c.pendingPlaybackSourceRequest,owner);
 gates[1].resolve({url:'new'});assert.equal((await newer).url,'new');assert.equal(c.pendingPlaybackSourceRequest,null);
});
test('main source cancellation reaches the actual apiJson fetch signal and settles without a retry',async()=>{
 let called=0,signal;
 const c=vm.createContext({AbortController,DOMException,Promise,navigator:{onLine:true},trackSwitchToken:1,window:{AbortController},setTimeout,clearTimeout,
  fetch:(url,opts)=>{called++;signal=opts.signal;return new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));}});
 loadFunctions(c,qualityFile,['apiJson']);
 loadFunctions(c,'public/js/modules/05-playback/12-playback-switch-core.js',['cancelPlaybackSourceRequest','requestPlaybackSourceUrl','playbackLoadIsNetworkError']);
 const old=c.requestPlaybackSourceUrl('/fixture',{timeoutMs:10000},1);c.trackSwitchToken=2;c.cancelPlaybackSourceRequest();
 assert.equal(signal.aborted,true);await assert.rejects(old,e=>e.name==='AbortError');assert.equal(called,1);
});
test('alternate search carries the owner signal and drops a late result after invalidation',async()=>{
 const gate=deferred(),controller=new AbortController();let valid=true,requests=0;
 const c=vm.createContext({SOURCE_FALLBACK_SEARCH_TIMEOUT_MS:6000,sourceFallbackBudgetTimeoutResult:{},
  alternatePlaybackProvider:()=> 'qq',sourceFallbackProviderReady:()=>true,artistNameParts:()=> ['fixture'],
  awaitSourceFallbackBudget:p=>p,apiJson:async(url,opts)=>{requests++;assert.equal(opts.signal,controller.signal);return gate.promise;},
  isSameTitleArtist:()=>true,cloneSong:s=>s});
 loadFunctions(c,'public/js/modules/05-playback/11-provider-fallback.js',['searchAlternatePlatformSong']);
 const job=c.searchAlternatePlatformSong({name:'fixture'},null,null,{signal:controller.signal,isCurrent:()=>valid});
 valid=false;controller.abort();gate.resolve({songs:[{id:'late'}]});assert.equal(await job,null);
 assert.equal(await c.searchAlternatePlatformSong({name:'fixture'},null,null,{signal:controller.signal,isCurrent:()=>valid}),null);assert.equal(requests,1);
});
test('runtime caps stay within a small bounded in-memory budget and prune expired songs',()=>{
 const {c,advance}=qualityContext();
 for(let i=0;i<257;i++){c.markPlaybackQualityRuntimeCap({provider:'qq',mid:'fixture-'+i},'qq','standard','resolved-lower');advance(1);}
 assert.equal(Object.keys(c.playbackQualityRuntimeCaps).length,256);
 assert.equal(c.playbackQualityCapValue({provider:'qq',mid:'fixture-0'},'qq'),'');
 advance(5*60000);c.markPlaybackQualityRuntimeCap({provider:'qq',mid:'fresh'},'qq','standard','resolved-lower');
 assert.equal(Object.keys(c.playbackQualityRuntimeCaps).length,1);
});
test('quality UI leaves above-cap tiers selectable for explicit reprobe and clears ceiling after membership changes',()=>{
 const {c,song}=qualityContext(),list={innerHTML:''};
 c.document={getElementById:id=>id==='quality-option-list'?list:null,querySelectorAll:()=>[]};
 c.PLAYBACK_QUALITY_OPTIONS={qq:[{key:'hires',title:'Hi-Res FLAC',sub:'优先尝试'},{key:'standard',title:'128k MP3',sub:'兼容优先'}]};
 c.hasProviderSvip=()=>false;c.escHtml=s=>s;
 loadFunctions(c,qualityFile,['playbackQualityOptions','isLocalQualitySong','playbackQualityShortLabel','updatePlaybackQualityUi']);
 c.markPlaybackQualityRuntimeCap(song,'qq','standard','resolved-lower');
 assert.match(list.innerHTML,/点选重试/);assert.match(list.innerHTML,/cap-locked/);
 const high=list.innerHTML.match(/<button[^>]*data-quality="hires"[^>]*>/)[0];assert.ok(!high.includes('disabled'));
 c.qqLoginStatus.vipLevel='svip';c.updatePlaybackQualityUi();assert.ok(!list.innerHTML.includes('cap-locked'));assert.ok(!list.innerHTML.includes('点选重试'));
});
