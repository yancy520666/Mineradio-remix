const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){let open=true;const network=[],timers=[],nodes=[],events={};
 const root={getBoundingClientRect:()=>({top:0,bottom:200}),querySelectorAll:()=>nodes,addEventListener(){}};
 class Image{constructor(){network.push(this);}set src(value){this.url=value;}decode(){this.naturalWidth=this.naturalHeight=64;return Promise.resolve();}removeAttribute(){this.url='';}}
 const ctx=vm.createContext({Image,Map,Set,innerHeight:600,navigator:{onLine:true},performance:{now:()=>100},
 document:{getElementById:id=>id==='track-detail-body'?root:{classList:{contains:()=>open}}},
 window:{addEventListener(name, handler){events[name]=handler;}},MutationObserver:class{observe(){}},
 setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cancelled=true;}});
 vm.runInContext(fs.readFileSync('public/js/modules/05-playback/06b-comment-avatars.js','utf8'),ctx);
 for(let i=0;i<8;i++)nodes.push({dataset:{commentAvatar:i%2?'bad':'same'},src:'placeholder',isConnected:true,
 getBoundingClientRect:()=>({top:i*20,bottom:i*20+20,width:40,height:40}),closest:()=>root});
 return {ctx,network,timers,nodes,events,setOpen:v=>open=v};}
test('visible avatars deduplicate, retry once and do not strand a cancelled retry on reopening',async()=>{
 const f=fixture();f.ctx.commentAvatarLoader.scan();assert.equal(f.network.length,2);assert.equal(f.ctx.commentAvatarLoader.snapshot().active,2);
 f.network[0].onload();await Promise.resolve();f.network[1].onerror();
 assert(f.nodes.filter(n=>n.dataset.commentAvatar==='same').every(n=>n.src==='same'));
 f.setOpen(false);f.ctx.commentAvatarLoader.scan();assert.equal(f.ctx.commentAvatarLoader.snapshot().active,0);
 assert(f.timers.find(t=>t.ms===800).cancelled);
 f.setOpen(true);f.ctx.commentAvatarLoader.scan();assert.equal(f.network.length,3);
 f.network[2].onerror();const retry=f.timers.filter(t=>t.ms===800&&!t.cancelled).at(-1);retry.fn();
 assert.equal(f.network.length,4);f.network[3].onload();await Promise.resolve();
 assert(f.nodes.every(n=>n.src===n.dataset.commentAvatar));assert.equal(f.ctx.commentAvatarLoader.snapshot().active,0);
 assert.equal(f.ctx.commentAvatarLoader.snapshot().bytes,32768);
});
test('online clears visible failed avatar cooldown, but does not restart hidden or removed avatars',async()=>{
 const f=fixture();f.ctx.commentAvatarLoader.scan();
 f.network[0].onload();await Promise.resolve();f.network[1].onerror();
 f.timers.find(t=>t.ms===800&&!t.cancelled).fn();f.network[2].onerror();
 assert.equal(f.network.length,3);
 f.nodes.filter(n=>n.dataset.commentAvatar==='bad').forEach(n=>n.isConnected=false);
 f.events.online();f.timers.filter(t=>t.ms===40&&!t.cancelled).at(-1).fn();
 assert.equal(f.network.length,3);
 f.nodes[1].isConnected=true;f.setOpen(false);f.events.online();f.timers.filter(t=>t.ms===40&&!t.cancelled).at(-1).fn();
 assert.equal(f.network.length,3);
 f.setOpen(true);f.events.online();f.timers.filter(t=>t.ms===40&&!t.cancelled).at(-1).fn();
 assert.equal(f.network.length,4,'visible failure retries immediately despite the 30 second cooldown');
 f.network[3].onload();await Promise.resolve();assert.equal(f.nodes[1].src,'bad');
});
