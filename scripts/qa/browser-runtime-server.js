'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const root = process.argv[2];
const temp = process.argv[3];
const files = {
 COOKIE_FILE:'netease.cookie', QQ_COOKIE_FILE:'qq.cookie', KUGOU_COOKIE_FILE:'kugou.cookie', QISHUI_COOKIE_FILE:'qishui.cookie',
 QISHUI_TOKEN_FILE:'qishui.token',
 QISHUI_OAUTH_CONFIG_FILE:'qishui.oauth.json', QISHUI_QR_CONFIG_FILE:'qishui.qr.json', MINERADIO_QISHUI_NATIVE_CONFIG:'qishui.native.json',
 MINERADIO_BEAT_CACHE_DIR:'beatmaps', MINERADIO_AUDIO_SPILL_DIR:'spill', CUEFIELD_FEEDBACK_FILE:'feedback.jsonl', MINERADIO_LISTEN_SYNC_FILE:'listen-sync.json',
};
for(const [key,name] of Object.entries(files)) process.env[key]=path.join(temp,name);
process.env.PORT='0';
// The real server serves the original static frontend. Frontend API traffic is
// replaced by labelled fake-platform responses in the isolated browser session.
// Fail closed if server startup unexpectedly attempts any external connection.
function allowedHost(input) {
 if (typeof input === 'string' || input instanceof URL) { try { return ['127.0.0.1','localhost','::1'].includes(new URL(input).hostname); } catch (_) { return false; } }
 return input && ['127.0.0.1','localhost','::1'].includes(input.hostname || input.host || 'localhost');
}
for (const name of ['http','https']) {
 const m=require(name), request=m.request, get=m.get;
 m.request=function(...args){ if(!allowedHost(args[0])) throw Error('QA_EXTERNAL_NETWORK_DISABLED'); return request.apply(this,args); };
 m.get=function(...args){ if(!allowedHost(args[0])) throw Error('QA_EXTERNAL_NETWORK_DISABLED'); return get.apply(this,args); };
}
const originalFetch=global.fetch;
global.fetch=function(input,...rest){if(!allowedHost(input)) return Promise.reject(Error('QA_EXTERNAL_NETWORK_DISABLED'));return originalFetch(input,...rest);};
const server = require(path.join(root,'server.js'));
server.once('listening',()=>console.log('QA_SERVER_ADDRESS '+JSON.stringify(server.address())));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
