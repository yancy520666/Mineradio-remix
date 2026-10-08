'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadFunctions}=require('./helpers/classic-functions');
const {createQQNativeQrSession,credentialCookie}=require('../desktop/qq-native-qr');
const settle=()=>new Promise(r=>setImmediate(r));
const image='data:image/png;base64,ZmFrZQ==';
function fixture(extra={}){
 const sent=[], results=[], canceled=[];
 const service={createSession:async channel=>{assert.equal(channel,'qq');return 'key';},createQr:async()=>image,
 checkQr:async()=>({code:801}),cancelSession:key=>canceled.push(key),logout:async()=>{},...extra};
 const session=createQQNativeQrSession({service,sessions:()=>[{token:'token',credential:{musicid:'123',musickey:'fixture-key',loginType:6}}],notify:r=>sent.push(r),finish:r=>results.push(r),timeoutMs:100,confirmationGraceMs:0,...extra.options});
 return {session,sent,results,canceled,service};
}
test('QQ client QR exports validated music credentials and releases the session',async()=>{
 const f=fixture({checkQr:async()=>({code:803,cookie:'qqmusic_session=token'})});
 await settle();assert.match(f.sent[0].scanApp,/QQ 音乐 App/);await f.session.poll();
 assert.equal(f.results[0].ok,true);assert.match(f.results[0].cookie,/tmeLoginType=6/);assert.deepEqual(f.canceled,['key']);
});
test('QR create failure stays on the client path without replacing the old login',async()=>{
 const f=fixture({createQr:async()=>{throw Error('network');}});await settle();assert.equal(f.results.length,0);assert.equal(f.sent.at(-1).stage,'failed');f.session.stop();
});
test('cancel during generation rejects late QR and cleans up returned key',async()=>{
 let release;const f=fixture({createSession:()=>new Promise(r=>release=r)});f.session.cancel();release('late');await settle();
 assert.equal(f.sent.filter(r=>r.stage==='qr').length,0);assert.equal(f.results[0].cancelled,true);assert.deepEqual(f.canceled,['late']);
});
test('expired code refreshes once, and hung refresh stays retryable on the client path',async()=>{
 const f=fixture({checkQr:async()=>({code:800,message:'QR code expired',failureReason:'qr-timeout'})});await settle();await f.session.poll();assert.equal(f.sent.at(-1).expired,true);
 f.service.createSession=()=>new Promise(()=>{});assert.equal(f.session.click(),true);assert.equal(f.session.click(),false);
 await new Promise(r=>setTimeout(r,130));assert.equal(f.results.length,0);assert.equal(f.sent.at(-1).stage,'failed');f.session.stop();
});
test('credential injection and incomplete authorization are rejected',()=>{
 for(const c of [{musicid:'123',musickey:'x; y=z',loginType:6},{musicid:'123',musickey:'key'},{musicid:'123',musickey:'key',loginType:'x'},{}])assert.throws(()=>credentialCookie(c));
});
test('App QR accepts the phone account login type instead of discarding a confirmed WeChat or QQ account',async()=>{
 // A phone signed in with WeChat (1) or QQ (2) confirms with that type; rejecting it showed "授权失败" on desktop.
 for(const loginType of [1,2,6]){
  const cookie=credentialCookie({musicid:'123',str_musicid:'0',musickey:'fixture-key',loginType});
  assert.match(cookie,/(^|; )uin=123;/);assert.match(cookie,new RegExp('tmeLoginType='+loginType+';'));assert.match(cookie,/mineradio_qq_native=1/);
 }
 const sent=[],results=[];
 const session=createQQNativeQrSession({service:{createSession:async()=>'key',createQr:async()=>image,checkQr:async()=>({code:803,cookie:'qqmusic_session=wx'}),cancelSession(){},logout:async()=>{}},
  sessions:()=>[{token:'wx',credential:{musicid:'456',musickey:'fixture-key',loginType:1},expiresAt:Date.now()+60000}],notify:r=>sent.push(r),finish:r=>results.push(r),timeoutMs:100,confirmationGraceMs:0});
 await settle();await session.poll();
 assert.equal(results[0]&&results[0].ok,true,JSON.stringify(sent.at(-1)));assert.match(results[0].cookie,/tmeLoginType=1;/);
});
test('desktop NetEase uses App QR first while webpage fallback stays explicit',async()=>{
 const calls=[];const ctx=vm.createContext({loginProvider:'netease',window:{desktopWindow:{openNeteaseMusicLogin:()=>{throw Error('web invoked');}}},refreshQr:()=>calls.push('app'),openQQWebLogin(){},openKugouWebLogin(){},openQishuiWebLogin(){},openSpotifyWebLogin(){}});
 loadFunctions(ctx,'public/js/modules/08-account/03-login-modal-flows.js',['loginProviderUsesInlineQr','openProviderWebLogin']);
 assert.equal(ctx.loginProviderUsesInlineQr('netease'),true);ctx.openProviderWebLogin();assert.deepEqual(calls,['app']);
});
test('late NetEase check cannot modify a newly selected provider',async()=>{
 let release;const ctx=vm.createContext({qrKey:'old',loginProvider:'netease',loginRefreshRequestSeq:1,apiJson:()=>new Promise(r=>release=r),document:{getElementById(){throw Error('stale UI touched');}},console});
 loadFunctions(ctx,'public/js/modules/08-account/03-login-modal-flows.js',['checkQr']);const pending=ctx.checkQr();ctx.loginProvider='qq';release({code:803,loggedIn:true});await pending;
});

test('authorization arriving after cancel is discarded and its SDK token is revoked',async()=>{
 let release;const revoked=[];const f=fixture({checkQr:()=>new Promise(r=>release=r),logout:async t=>revoked.push(t)});
 await settle();const pending=f.session.poll();f.session.cancel();release({code:803,cookie:'qqmusic_session=late'});await pending;
 assert.equal(f.results.length,1);assert.equal(f.results[0].cancelled,true);assert.deepEqual(revoked,['late']);
});

test('QQ QR transient poll failures retry without discarding phone authorization',async()=>{
 let count=0;const f=fixture({checkQr:async()=>{if(++count<3)throw Error('network');return {code:803,cookie:'qqmusic_session=token'};}});
 await settle();await f.session.poll();await f.session.poll();assert.equal(f.results.length,0);await f.session.poll();assert.equal(f.results[0].ok,true);
});
test('official QQ and Kugou fallback bypasses client QR and requests fresh web authorization',async()=>{
 for(const provider of ['qq','kugou']){
 const calls=[];const ctx=vm.createContext({loginProvider:provider,inlineLoginQrProvider:'',cancelInlineLoginQr:()=>calls.push('cancel'),openQQWebLogin:o=>calls.push(o),openKugouWebLogin:o=>calls.push(o),openNeteaseWebLogin:()=>{throw Error('wrong provider');}});
 loadFunctions(ctx,'public/js/modules/08-account/03-login-modal-flows.js',['openProviderOfficialWebLogin']);ctx.openProviderOfficialWebLogin();assert.equal(calls[0],'cancel');assert.equal(calls[1].officialWindow,true);
 }
});

test('native QQ requests restore the device used by QR authorization, with web login unchanged',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const base=path.join(path.dirname(require.resolve('@yakult-green-tea/qq-music-api/package.json')),'dist/src/services/auth');
 const device=require(path.join(base,'androidDevice.js')).createAndroidDevice();device.qimei='fixture-qimei';device.qimei36='fixture-qimei36';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qq-native-device-'));const previous=process.env.QQ_NATIVE_DEVICE_FILE;
 process.env.QQ_NATIVE_DEVICE_FILE=path.join(dir,'.qq-native-device.json');fs.writeFileSync(process.env.QQ_NATIVE_DEVICE_FILE,JSON.stringify(device));
 try{
 const {nativeCommForCookie}=require('../desktop/qq-native-qr');
 const comm=nativeCommForCookie({uin:'123',qm_keyst:'fixture-key',tmeLoginType:'6'});
 assert.equal(comm.ct,11);assert.equal(comm.QIMEI,'fixture-qimei');assert.equal(comm.authst,'fixture-key');assert.equal(comm.tmeLoginType,6);
 assert.equal(nativeCommForCookie({uin:'123',qm_keyst:'fixture-key'}),null);
 assert.equal(nativeCommForCookie({uin:'123',qm_keyst:'fixture-key',tmeLoginType:'1',mineradio_qq_native:'1'}).tmeLoginType,1);
 // A web-login cookie can carry its own tmeLoginType; without the App QR marker it keeps the web route.
 assert.equal(nativeCommForCookie({uin:'123',qm_keyst:'fixture-key',tmeLoginType:'2'}),null);
 }finally{if(previous===undefined)delete process.env.QQ_NATIVE_DEVICE_FILE;else process.env.QQ_NATIVE_DEVICE_FILE=previous;fs.rmSync(dir,{recursive:true,force:true});}
});

test('native QQ audio uses the client vkey endpoint and two-ID filenames; web sessions retain their route',async()=>{
 for(const native of [true,false]){
 let sent;
 const ctx=vm.createContext({crypto:require('node:crypto'),qqCookieObject:()=>({uin:'123',qm_keyst:'fixture',tmeLoginType:native?'6':''}),qqCookieUin:c=>c.uin,qqCookiePlaybackKey:c=>c.qm_keyst,nativeCommForCookie:()=>native?{}:null,
 normalizeQualityPreference:q=>q||'standard',qqPlaybackMemberHints:()=>false,qualityCandidatesFrom:()=>[{prefix:'M500',ext:'.mp3',level:'standard',label:'标准'}],QQ_QUALITY_CANDIDATE_TEMPLATES:[],QQ_VKEY_REQUEST_TIMEOUT_MS:6000,QQ_AUDIO_PROBE_TOTAL_MS:6200,QQ_AUDIO_PROBE_ATTEMPT_MS:2000,
 qqMusicRequest:async payload=>{sent=payload;return {req_0:{data:{midurlinfo:[{filename:payload.req_0.param.filename[0],purl:'fixture.mp3'}],sip:[]}}};},probeQQAudioUrl:async()=>({ok:true})});
 loadFunctions(ctx,'server.js',['handleQQSongUrl']);const result=await ctx.handleQQSongUrl('song','media','standard');
 assert.equal(result.playable,true);assert.equal(sent.req_0.module,native?'music.vkey.GetVkey':'vkey.GetVkeyServer');
 assert.equal(sent.req_0.param.filename[0],native?'M500songmedia.mp3':'M500media.mp3');
 if(native){assert.equal(sent.req_0.param.ctx,0);assert.equal(sent.req_0.param.platform,undefined);assert.match(result.url,/sjy6/);}
 }
});

test('native QQ profile uses client authorization and keeps temporary empty results distinct from expired credentials',async()=>{
 for(const response of [{req_0:{code:0,data:{nick:'fixture-user'}}},{req_0:{code:0,data:{}}},{req_0:{code:1000}}]){
 const ctx=vm.createContext({qqCookieObject:()=>({uin:'123',qm_keyst:'fixture'}),qqCookieUin:c=>c.uin,qqCookieMusicKey:c=>c.qm_keyst,
 normalizeQQProfile:b=>({loggedIn:true,nickname:b?.data?.nick||'fallback'}),nativeCommForCookie:()=>({}),fetchQQVipStatus:async()=>null,mergeQQVipStatus:i=>i,
 qqMusicRequest:async p=>{assert.equal(p.req_0.method,'GetLoginUserInfo');return response;},console});
 loadFunctions(ctx,'server.js',['getQQLoginInfo']);const result=await ctx.getQQLoginInfo();
 if(response.req_0.code===1000)assert.equal(result.sessionRejected,true);
 else if(response.req_0.data.nick)assert.equal(result.nickname,'fixture-user');
 else{assert.equal(result.sessionRejected,false);assert.equal(result.unverified,true);}
 }
});

test('clicking the official button while QR is waiting transitions the active request instead of being rejected as busy',()=>{
 const calls=[];const ctx=vm.createContext({loginProvider:'qq',inlineLoginQrProvider:'qq',openInlineLoginInWindow:()=>calls.push('transition'),cancelInlineLoginQr:()=>{throw Error('wrong cancellation path');},openQQWebLogin:()=>{throw Error('would fail busy guard');}});
 loadFunctions(ctx,'public/js/modules/08-account/03-login-modal-flows.js',['openProviderOfficialWebLogin']);ctx.openProviderOfficialWebLogin();assert.deepEqual(calls,['transition']);
});

test('QQ authorization failures are not displayed as expired, and mention unsupported scanners without claiming which App was used',async()=>{
 const f=fixture({checkQr:async()=>({code:800,message:'QR login failed',failureReason:'missing-credential',failureStage:'credential-payload'})});
 await settle();await f.session.poll();const notice=f.sent.at(-1);
 assert.equal(notice.stage,'failed');assert.equal(notice.expired,false);assert.match(notice.message,/QQ 或微信/);assert.equal(f.results.length,0);f.session.stop();
});
test('a credential issued after SDK expiry still completes the current QR within the grace window',async()=>{
 const issued=[];const f=fixture({checkQr:async()=>({code:800,message:'QR code expired'}),options:{confirmationGraceMs:8000,sessions:()=>issued}});
 await settle();await f.session.poll();assert.equal(f.sent.at(-1).stage,'scanned');assert.equal(f.session.click(),false);
 issued.push({token:'late-confirmed',credential:{musicid:'123',musickey:'fixture-key',loginType:6},expiresAt:Date.now()+60000});
 await f.session.poll();assert.equal(f.results[0].ok,true);
});
test('refresh creates an isolated client auth store; old QR authorization cannot confirm the replacement code',async()=>{
 const stores=[],notices=[],results=[];
 const session=createQQNativeQrSession({confirmationGraceMs:0,timeoutMs:100,
 createRuntime:()=>{const records=[];stores.push(records);return {sessions:()=>records,service:{createSession:async()=>String(stores.length),createQr:async()=>image,cancelSession(){},checkQr:async()=>({code:801}),logout:async()=>{}}};},notify:r=>notices.push(r),finish:r=>results.push(r)});
 await settle();assert.equal(session.click(),true);await settle();
 stores[0].push({token:'old-confirmed',credential:{musicid:'123',musickey:'fixture-key',loginType:6},expiresAt:Date.now()+60000});
 await session.poll();assert.equal(stores.length,2);assert.equal(results.length,0);session.stop();
});
test('refresh IPC never opens the official webpage',async()=>{
 const calls=[];const ctx=vm.createContext({inlineLoginQrProvider:'qq',window:{desktopWindow:{clickInlineLoginQr:async p=>calls.push(p)}},openInlineLoginInWindow:()=>{throw Error('web fallback invoked');}});
 loadFunctions(ctx,'public/js/modules/08-account/03-login-modal-flows.js',['refreshInlineLoginQr']);await ctx.refreshInlineLoginQr();assert.deepEqual(calls,['qq']);
});

test('even a displayed expiry cannot discard a later valid credential for the same unrefreshed code',async()=>{
 const issued=[];const f=fixture({checkQr:async()=>({code:800,message:'QR code expired'}),options:{sessions:()=>issued}});
 await settle();await f.session.poll();assert.equal(f.sent.at(-1).expired,true);
 issued.push({token:'confirmed-after-expiry',credential:{musicid:'123',musickey:'fixture-key',loginType:6},expiresAt:Date.now()+60000});
 await f.session.poll();assert.equal(f.results[0].ok,true);
});
