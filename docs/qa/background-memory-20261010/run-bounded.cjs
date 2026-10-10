'use strict';
// QA-only runner; production scripts/run-tests.js is unchanged.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const out = __dirname;
const excluded = {'login-logout-race.test.js':'blocked: execution explicitly cancelled; not run'};
const all = fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.js')).sort();
const files = all.filter(n=>!excluded[n]);
const results = [];
fs.mkdirSync(path.join(out,'test-logs'),{recursive:true});
fs.writeFileSync(path.join(out,'full-tests.log'),'Bounded test run; each file has 60s timeout. Electron smoke scripts are not selected.\n');
for(const name of files) {
 const start=Date.now();
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(root,'tests',name)],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:12*1024*1024,env:{...process.env,NODE_PATH:'/tmp/mineradio-basic-ftp-deps-20261010/node_modules',ELECTRON_SKIP_BINARY_DOWNLOAD:'1'}});
 const output=(r.stdout||'')+(r.stderr||'')+(r.error?'\nRUNNER ERROR: '+r.error.message+'\n':'');
 const totals={}; for(const k of ['tests','pass','fail','cancelled','skipped','todo']) { const matches=[...output.matchAll(new RegExp('^# '+k+' (\\d+)\\s*$','gm'))]; totals[k]=matches.length?Number(matches.at(-1)[1]):null; }
 const result={file:name,exitCode:r.status,signal:r.signal,error:r.error?.message||null,durationMs:Date.now()-start,...totals}; results.push(result);
 fs.writeFileSync(path.join(out,'test-logs',name+'.log'),output);
 fs.appendFileSync(path.join(out,'full-tests.log'),'\n== '+name+' ==\n'+output);
 fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify({startedScope:all.length,selected:files.length,excluded,completed:results.length,results},null,2));
 console.log((r.status===0?'PASS ':'FAIL ')+name+' '+result.durationMs+'ms');
}
const summary={discoveredFiles:all.length,selectedFiles:files.length,passedFiles:results.filter(x=>x.exitCode===0).length,failedFiles:results.filter(x=>x.exitCode!==0).length,excluded,totals:{}};
for(const k of ['tests','pass','fail','cancelled','skipped','todo']) summary.totals[k]=results.reduce((n,x)=>n+(x[k]||0),0);
fs.writeFileSync(path.join(out,'full-tests-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary)); process.exitCode=summary.failedFiles?1:0;
