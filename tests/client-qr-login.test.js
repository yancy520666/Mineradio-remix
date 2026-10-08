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
 const session=createQQNativeQrSession({service,sessions:()=>[{token:'token',credential:{musicid:'123',musickey:'fixture-key',loginType:6}}],notify:r=>sent.push(r),finish:r=>results.push(r),timeoutMs:100,...extra.options});
 return {session,sent,results,canceled,service};
}
test('QQ client QR exports validated music credentials and releases the session',async()=>{
 const f=fixture({checkQr:async()=>({code:803,cookie:'qqmusic_session=token'})});
 await settle();assert.equal(f.sent[0].scanApp,'QQ 音乐 App');await f.session.poll();
 assert.equal(f.results[0].ok,true);assert.match(f.results[0].cookie,/tmeLoginType=6/);assert.deepEqual(f.canceled,['key']);
});
test('QR create failure falls back without replacing the old login',async()=>{
 const f=fixture({createQr:async()=>{throw Error('network');}});await settle();assert.equal(f.results[0].fallback,true);
});
test('cancel during generation rejects late QR and cleans up returned key',async()=>{
 let release;const f=fixture({createSession:()=>new Promise(r=>release=r)});f.session.cancel();release('late');await settle();
 assert.equal(f.sent.length,0);assert.equal(f.results[0].cancelled,true);assert.deepEqual(f.canceled,['late']);
});
test('expired code refreshes once, and hung refresh has its own deadline',async()=>{
 const f=fixture({checkQr:async()=>({code:800})});await settle();await f.session.poll();assert.equal(f.sent.at(-1).expired,true);
 f.service.createSession=()=>new Promise(()=>{});assert.equal(f.session.click(),true);assert.equal(f.session.click(),false);
 await new Promise(r=>setTimeout(r,130));assert.equal(f.results[0].error,'QQ_APP_QR_TIMEOUT');
});
test('credential injection and incomplete authorization are rejected',()=>{
 for(const c of [{musicid:'123',musickey:'x; y=z',loginType:6},{musicid:'123',musickey:'key',loginType:2},{}])assert.throws(()=>credentialCookie(c));
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
