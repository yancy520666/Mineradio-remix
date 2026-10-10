'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const check=fs.readFileSync(path.join(root,'scripts/quick-check.js'),'utf8');
const start=check.indexOf('  const qqIncompleteBranch =');
const end=check.indexOf('\n  if (!/Buffer',start);
assert(start>=0&&end>start);
const guard=check.slice(start,end);
const source=fs.readFileSync(path.join(root,'public/js/modules/08-account/03-login-modal-flows.js'),'utf8');
function run(text){vm.runInNewContext(guard,{qqLoginText:text,fail:message=>{throw Error(message);}});}
run(source);
const branch=source.match(/if \(!qqPlaybackReady\)\s*\{([\s\S]*?)\n\s*return;\s*\}/);
assert(branch);
for(const [label,replacement] of [
 ['condition',branch[0].replace('!qqPlaybackReady','qqPlaybackReady')],
 ['preview style',branch[0].replace("statusEl.className = 'preview'","statusEl.className = 'scan'")],
 ['early return',branch[0].replace(/\n\s*return;/,'')],
 ['premature close',branch[0].replace('return;','scheduleLoginAttemptClose(attempt, function () {}); return;')],
 ['false success copy',branch[0].replace(/还需完成 QQ 音乐播放授权|播放授权(?:尚)?未完成/g,'播放授权已完成')]
]) assert.throws(()=>run(source.replace(branch[0],replacement)),undefined,label);
console.log('PASS: current natural copy; reject 5 unsafe incomplete-authorization mutations.');
