const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){const events={},parent={},c=vm.createContext({parent,location:{origin:'local'},window:{addEventListener:(key,fn)=>events[key]=fn}});
 vm.runInContext(fs.readFileSync('public/vendor/sonic-workshop/mineradio-ripples.js','utf8'),c);
 const pool=c.window.MineradioWorkshopRipples.create(class{constructor(x=0,y=0){this.x=x;this.y=y;}});
 return {pool,c,pause:value=>events.message({source:parent,origin:'local',data:{type:'mineradio-sonic-performance-config',config:{paused:value}}})};}
test('a replaced visible wave keeps its position, original time and shape through a continuous 200ms retirement',()=>{
 const {pool}=fixture();for(let i=0;i<10;i++)pool.spawn(i,0,2,false,1);
 pool.spawn(10,0,3,true,1.1);const old=pool.values[10];
 assert.equal(old.pos.x,0);assert.equal(old.time,1);assert.equal(old.strength,2);assert.equal(old.retireFade,1);
 pool.step(1.2);assert(Math.abs(old.retireFade-.5)<1e-10);assert.equal(old.isActive,1);
 pool.step(1.301);assert.equal(old.retireFade,0);assert.equal(old.isActive,0);
 assert.equal(pool.values[0].time,1.1);assert.equal(pool.values[0].rippleType,1);
});
test('bursts keep four retirement slots and eight pending events; dequeuing does not restart wave time',()=>{
 const {pool}=fixture();for(let i=0;i<30;i++)pool.spawn(i,0,1,false,2+i*.001);
 assert.equal(pool.values.length,14);assert.equal(pool.snapshot().retiring,4);assert.equal(pool.snapshot().queued,8);
 pool.step(2.25);assert(pool.values.some(r=>r.time>2&&r.time<2.03));
 assert(pool.snapshot().retiring<=4);assert(pool.snapshot().queued<=8);
 pool.dispose();assert.equal(pool.snapshot().queued,0);assert.equal(pool.snapshot().active,0);
});
test('pause and background restoration do not age every live ripple by the hidden wall-clock gap',()=>{
 const {pool,pause}=fixture();assert.equal(pool.time(1),1);assert.equal(pool.time(1.1),1.1);
 pause(true);pool.time(10);pause(false);assert.equal(pool.time(20),1.1);
 assert(Math.abs(pool.time(20.016)-1.116)<1e-10);
});
test('ordinary waves retain the original WE propagation and shading constants',()=>{
 const source=fs.readFileSync('public/vendor/sonic-workshop/assets/index-Z-j1MQ-r.js','utf8');
 for(const fragment of ['float speed = 14.0','float width = 5.0','float curFadeDist = 22.0','curSpeed = 18.0','curWidth = 2.5','curFadeDist = 18.0','elevationScale = 1.8','float strengthCurve = clamp(uRipples[i].strength * 0.4, 0.0, 1.0)','sqrt(rippleIntensityNormal)'])assert(source.includes(fragment),fragment);
 assert(source.includes('ripplePool.current.step(Ce.uTime)'));assert(source.includes('window.MineradioWorkshopRipples.create(Ye)'));
});
