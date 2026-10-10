'use strict';
// Benign loopback-only FTP compatibility fixtures; no credentials or external services.
const assert = require('node:assert/strict');
const net = require('node:net');
const { createRequire } = require('node:module');
const load = createRequire(process.env.DEPENDENCY_ROOT + '/package.json');
const { getUri } = load('get-uri');
const { Client } = load('basic-ftp');
const date = new Date('2026-10-09T12:00:00Z');
async function fixture(mode, action) {
  const sockets = new Set(), servers = [], commands = [];
  let dataSocket, dataReady, dataResolve;
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error',()=>{});
    socket.write('220 local fixture\r\n'); let input = '';
    socket.on('data', chunk => { input += chunk; let n;
      while ((n = input.indexOf('\r\n')) !== -1) {
        const line = input.slice(0,n); input = input.slice(n+2); const cmd = line.split(' ')[0]; commands.push(cmd);
        if (cmd === 'USER') socket.write('230 anonymous fixture\r\n');
        else if (cmd === 'FEAT') socket.write('211 no extensions\r\n');
        else if (cmd === 'MDTM') socket.write(mode === 'missing' ? '550 no file\r\n' : ['list','unix-list'].includes(mode) ? '502 unsupported\r\n' : '213 20261009120000\r\n');
        else if (cmd === 'EPSV' || cmd === 'PASV') {
          dataReady = new Promise(resolve => { dataResolve = resolve; });
          const data = net.createServer(s => { dataSocket=s; sockets.add(s); s.on('close',()=>sockets.delete(s)); s.on('error',()=>{}); dataResolve(s); }); servers.push(data);
          data.listen(0,'127.0.0.1',()=>{const p=data.address().port;socket.write(cmd==='EPSV'?`229 Entering Extended Passive Mode (|||${p}|)\r\n`:`227 Entering Passive Mode (127,0,0,1,${p>>8},${p&255})\r\n`);});
        } else if (cmd === 'LIST' || cmd === 'RETR') {
          socket.write('150 opening data\r\n');
          dataReady.then(s=>{
            if (mode === 'transfer-error' && cmd === 'RETR') {s.destroy();socket.write('426 transfer interrupted\r\n');}
            else {s.end(cmd==='LIST'?(mode==='unix-list'?'-rw-r--r-- 1 owner group 31 Oct 09 2026 proxy.pac\r\n':'type=file;size=31;modify=20261009120000; proxy.pac\r\n'):'function FindProxyForURL(){return "DIRECT";}\n');if(!socket.destroyed)socket.write('226 transfer complete\r\n');}
          });
        } else if (cmd === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('200 OK\r\n');
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); servers.push(server);
  const url=`ftp://127.0.0.1:${server.address().port}/proxy.pac`;
  try {await action(url,commands,()=>sockets.size);}
  finally { for(const s of sockets)s.destroy(); await Promise.all(servers.map(s=>new Promise(resolve=>s.close(resolve)))); }
}
(async()=>{
  console.log('VERSION',load('basic-ftp/package.json').version);
  const client = new Client(); for(const m of ['access','lastMod','list','downloadTo','close'])assert.equal(typeof client[m],'function'); client.close(); assert.equal(client.closed,true);
  for(const mode of ['mdtm','list']) await fixture(mode,async(url,commands,openSockets)=>{
    const stream=await getUri(url); let body=''; for await(const chunk of stream)body+=chunk;
    assert.match(body,/FindProxyForURL/);assert(stream.lastModified instanceof Date); assert(commands.includes('RETR')); assert.equal(commands.includes('LIST'),mode==='list');
    for(let i=0;i<50 && openSockets();i++) await new Promise(r=>setTimeout(r,20)); assert.equal(openSockets(),0); console.log('PASS get-uri '+mode+' + stream + cleanup');
  });
  await fixture('unix-list',async(url)=>{await assert.rejects(getUri(url),e=>e.code==='ENOTFOUND');const u=new URL(url),c=new Client(1000);await c.access({host:u.hostname,port:Number(u.port)});const list=await c.list('/');assert.equal(list[0].name,'proxy.pac');assert.equal(list[0].size,31);assert.equal(list[0].modifiedAt,undefined);c.close();console.log('PASS ordinary Unix LIST; existing get-uri unknown-date ENOTFOUND preserved');});
  await fixture('mdtm',async(url,commands)=>{await assert.rejects(getUri(url,{cache:{lastModified:date}}),e=>e.code==='ENOTMODIFIED');assert(!commands.includes('RETR'));console.log('PASS cache-not-modified');});
  await fixture('missing',async(url,commands)=>{await assert.rejects(getUri(url),e=>e.code==='ENOTFOUND');assert(!commands.includes('RETR'));console.log('PASS 550 not found');});
  await fixture('transfer-error',async(url)=>{const u=new URL(url), c=new Client(1000);await c.access({host:u.hostname,port:Number(u.port)}); const {PassThrough}=require('node:stream'); const sink=new PassThrough();sink.resume();await assert.rejects(c.downloadTo(sink,'proxy.pac'));c.close();assert(c.closed);console.log('PASS basic-ftp interrupted transfer + cleanup');});
  console.log('PASS CommonJS/API surface and all benign consumer compatibility fixtures');
})().catch(e=>{console.error(e);process.exitCode=1;});
