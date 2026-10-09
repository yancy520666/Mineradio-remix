'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const {importBrowserLogin,providerConfig,_test}=require('../desktop/browser-cookie-import');
const key=crypto.randomBytes(32);
function v10(text,host,metaVersion){
 const nonce=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,nonce);
 const plain=Buffer.concat([metaVersion>=24?crypto.createHash('sha256').update(host).digest():Buffer.alloc(0),Buffer.from(text)]);
 const data=Buffer.concat([c.update(plain),c.final()]);
 return Buffer.concat([Buffer.from('v10'),nonce,data,c.getAuthTag()]);
}
test('Chromium values decrypt with and without the host hash, and App-Bound values are reported, not guessed',()=>{
 assert.equal(_test.decryptChromiumValue({encrypted_value:v10('fixture','.163.com',24)},key,24).value,'fixture');
 assert.equal(_test.decryptChromiumValue({encrypted_value:v10('fixture','.163.com',23)},key,23).value,'fixture');
 assert.equal(_test.decryptChromiumValue({encrypted_value:Buffer.from('v20xxxxxxxxxxxxxxxxxxxxxxxxxxxxx')},key,24).appBound,true);
 assert.equal(_test.decryptChromiumValue({encrypted_value:v10('fixture','x',24)},crypto.randomBytes(32),24).failed,true);
});
test('only the platform domain and allowlisted login cookies are kept',()=>{
 const picked=_test.pickCookies([
  {name:'MUSIC_U',value:'fixture',domain:'.music.163.com'},
  {name:'MUSIC_U',value:'evil',domain:'.163.com.evil.example'},
  {name:'tracking',value:'x',domain:'.163.com'},
  {name:'__csrf',value:'old',domain:'.music.163.com',expires:1},
 ],{names:['MUSIC_U','__csrf'],domains:['163.com'],keyCookie:'MUSIC_U'});
 assert.equal(picked.header,'MUSIC_U=fixture');
});
function fakeEnv(rows,{locked=false}={}){
 const local='C:/L',files={[path.join(local,'Google','Chrome','User Data','Local State')]:JSON.stringify({os_crypt:{encrypted_key:Buffer.concat([Buffer.from('DPAPI'),Buffer.from('wrapped')]).toString('base64')}})};
 const cookieFile=path.join(local,'Google','Chrome','User Data','Default','Network','Cookies');
 files[cookieFile]='db';
 const fsApi={
  existsSync:f=>f in files||Object.keys(files).some(k=>k.startsWith(f+path.sep)),
  readdirSync:d=>[...new Set(Object.keys(files).filter(k=>k.startsWith(d+path.sep)).map(k=>k.slice(d.length+1).split(path.sep)[0]))],
  statSync:f=>({isFile:()=>f in files,isDirectory:()=>!(f in files)}),
  readFileSync:f=>{if(!(f in files))throw Object.assign(Error('ENOENT'),{code:'ENOENT'});return files[f];},
  mkdtempSync:p=>p+'tmp',copyFileSync:(from)=>{if(locked)throw Object.assign(Error('busy'),{code:'EBUSY'});if(!(from in files))throw Error('ENOENT');},rmSync(){},
 };
 const openDatabase=()=>({prepare:sql=>({get:()=>({value:'24'}),all:()=>/moz_cookies/.test(sql)?[]:rows}),close(){}});
 return {env:{LOCALAPPDATA:local,APPDATA:'C:/A'},fs:fsApi,openDatabase,dpapiUnprotect:async()=>key};
}
test('import returns the browser login and explains locked or App-Bound browsers',async()=>{
 const ok=await importBrowserLogin('netease',fakeEnv([{host_key:'.music.163.com',name:'MUSIC_U',value:'',encrypted_value:v10('fixture','.music.163.com',24),expires_utc:0}]));
 assert.equal(ok.ok,true,JSON.stringify(ok));assert.equal(ok.cookie,'MUSIC_U=fixture');assert.equal(ok.browser,'Chrome');
 const bound=await importBrowserLogin('netease',fakeEnv([{host_key:'.music.163.com',name:'MUSIC_U',value:'',encrypted_value:Buffer.from('v20'+'x'.repeat(40)),expires_utc:0}]));
 assert.equal(bound.error,'APP_BOUND');assert.match(bound.message,/Chrome/);
 const locked=await importBrowserLogin('netease',fakeEnv([],{locked:true}));
 assert.equal(locked.error,'LOCKED');
 const none=await importBrowserLogin('netease',fakeEnv([]));
 assert.equal(none.error,'NOT_LOGGED_IN');
 assert.equal((await importBrowserLogin('qishui',fakeEnv([]))).error,'UNSUPPORTED_PROVIDER');
});

test('music-site cookie scope rejects sibling accounts and chooses site cookies over shared parent cookies',()=>{
 const picked=_test.pickCookies([
  {name:'uin',value:'111',domain:'.qq.com',expires:4000000000},
  {name:'uin',value:'222',domain:'y.qq.com',expires:3000000000},
  {name:'uin',value:'333',domain:'mail.qq.com',expires:4100000000},
  {name:'qqmusic_key',value:'site-key',domain:'.y.qq.com'},
  {name:'qqmusic_key',value:'other-key',domain:'other.qq.com',expires:4100000000},
  {name:'skey',value:'bad; uin=999',domain:'.qq.com'},
  {name:'p_skey',value:'path-key',domain:'y.qq.com',path:'/other'},
 ],providerConfig('qq'));
 assert.equal(picked.header,'uin=222; qqmusic_key=site-key');
 const filter=_test.sqlDomainFilter('host_key',providerConfig('qq').domains);
 assert.doesNotMatch(filter.where,/LIKE/);
 assert.deepEqual(filter.params,['qq.com','.qq.com','y.qq.com','.y.qq.com']);
});
