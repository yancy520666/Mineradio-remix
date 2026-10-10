'use strict';
const {createCuefieldAutoMix}=require('../../public/js/modules/05-playback/16-cuefield-automix-core');
(async()=>{
 let rejectOld;const oldGate=new Promise((_,reject)=>rejectOld=reject);let requests=0;
 const mix=createCuefieldAutoMix({getKey:s=>s.id,planTransition:()=>++requests===1?oldGate:Promise.resolve({ok:true,chosen:{evaluation:{tier:'usable'},exit:{time:20},entry:{time:0},timeline:[{op:'handoff',t:1}]}}),prepareAudioUrl:async()=>'/fixture'});
 mix.setEnabled(true);const old=mix.prepare({token:1,currentIndex:0,nextIndex:1,currentSong:{id:'A'},nextSong:{id:'B'}});await new Promise(setImmediate);
 mix.reset('track-switch');await mix.prepare({token:2,currentIndex:1,nextIndex:2,currentSong:{id:'B'},nextSong:{id:'C'}});
 const before=mix.snapshot();rejectOld(new Error('old request network failure'));const oldResult=await old;const after=mix.snapshot();
 console.log('PBL-07 stale AutoMix rejection',JSON.stringify({newReadyBefore:before.pending&&before.pending.toKey,oldResult:oldResult.status,newReadyAfter:after.pending&&after.pending.toKey,afterStatus:after.lastStatus}));
})().catch(e=>{console.error(e);process.exitCode=1;});
