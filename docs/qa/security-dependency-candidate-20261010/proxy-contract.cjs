'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const http=require('node:http');const https=require('node:https');const net=require('node:net');const path=require('node:path');
const base=process.argv[2]; const mode=process.argv[3];const sockets=new Set();const servers=[];let proxyHits=0,connectHits=0;
const listen=async s=>{servers.push(s);s.on('connection',c=>{sockets.add(c);c.on('close',()=>sockets.delete(c));});await new Promise(r=>s.listen(0,'127.0.0.1',r));return s.address().port;};
const request=(url,options={})=>new Promise((resolve,reject)=>{const r=(url.startsWith('https:')?https:http).get(url,options,res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve(body));});r.setTimeout(2000,()=>r.destroy(new Error('fixture timeout')));r.on('error',reject);});
(async()=>{
 const cert=fs.readFileSync(path.join(__dirname,'fixture-cert.pem'));const key=fs.readFileSync(path.join(__dirname,'fixture-key.pem'));
 const originPort=await listen(http.createServer((q,r)=>r.end('origin-ok')));
 const securePort=await listen(https.createServer({cert,key},(q,r)=>r.end('tls-ok')));
 const proxy=http.createServer((q,r)=>{proxyHits++;assert.ok(q.url.startsWith('http://127.0.0.1:'));r.end('proxy-ok');});
 proxy.on('connect',(req,client,head)=>{connectHits++;assert.equal(req.url,`127.0.0.1:${securePort}`);const dest=net.connect(securePort,'127.0.0.1',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)dest.write(head);client.pipe(dest);dest.pipe(client);});sockets.add(dest);dest.on('close',()=>sockets.delete(dest));dest.on('error',()=>client.destroy());client.on('error',()=>dest.destroy());});
 const proxyPort=await listen(proxy);
 for(const k of Object.keys(process.env))if(/proxy/i.test(k))delete process.env[k];
 process.env.GLOBAL_AGENT_HTTP_PROXY=`http://127.0.0.1:${proxyPort}`;process.env.GLOBAL_AGENT_HTTPS_PROXY=process.env.GLOBAL_AGENT_HTTP_PROXY;
 const getPath=path.join(base,'app-builder-lib/node_modules/@electron/get');const get=require(getPath);assert.equal(typeof get.downloadArtifact,'function');assert.equal(get.ElectronDownloadCacheMode.ReadWrite,0);get.initializeProxy();
 assert.ok(global.GLOBAL_AGENT);assert.equal(global.GLOBAL_AGENT.HTTP_PROXY,process.env.GLOBAL_AGENT_HTTP_PROXY);
 const agent=require(require.resolve('global-agent',{paths:[getPath]}));assert.equal(typeof agent.createGlobalProxyAgent,'function');assert.equal(agent.bootstrap(),false);
 if(mode==='http'){assert.equal(await request(`http://127.0.0.1:${originPort}/artifact`),'proxy-ok');assert.equal(proxyHits,1);global.GLOBAL_AGENT.NO_PROXY='127.0.0.1';assert.equal(await request(`http://127.0.0.1:${originPort}/artifact`),'origin-ok');assert.equal(proxyHits,1);}
 if(mode==='download'){const crypto=require('node:crypto');const cache=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'get-contract-'));const file=await get.downloadArtifact({version:'9.9.9',artifactName:'benign-fixture.txt',isGeneric:true,cacheRoot:cache,checksums:{'benign-fixture.txt':crypto.createHash('sha256').update('proxy-ok').digest('hex')},mirrorOptions:{resolveAssetURL:async()=>`http://127.0.0.1:${originPort}/benign-fixture.txt`},downloadOptions:{quiet:true,timeout:{request:2000}}});assert.equal(fs.readFileSync(file,'utf8'),'proxy-ok');assert.equal(proxyHits,1);fs.rmSync(cache,{recursive:true,force:true});}
 if(mode==='tls'){assert.equal(await request(`https://127.0.0.1:${securePort}/artifact`,{ca:cert}),'tls-ok');assert.equal(connectHits,1);await assert.rejects(request(`https://127.0.0.1:${securePort}/artifact`),e=>['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(e.code));assert.equal(connectHits,2);}
 console.log(JSON.stringify({version:require(path.join(require.resolve('global-agent',{paths:[getPath]}),'../../package.json')).version,mode,passed:true,proxyHits,connectHits}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const s of sockets)s.destroy();for(const s of servers)s.close();});
