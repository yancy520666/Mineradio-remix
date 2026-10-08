const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function context(){const ctx=vm.createContext({window:{addEventListener(){}},performance:{now:()=>0},runtimeHardwareProfile:null,
 playQueue:[{id:1},{id:2},{id:3},{id:4}],currentIdx:1,persistentLyricCacheKey:s=>String(s.id)});
 vm.runInContext(fs.readFileSync('public/js/modules/03-beat/05a-adjacent-preparation.js','utf8'),ctx);return ctx;}
test('candidates are the actual adjacent queue items and follow navigation direction',()=>{
 const c=context();assert.deepEqual(Array.from(c.adjacentTrackCandidates(),x=>x.song.id),[3,1]);
 c.adjacentPreparationDirection=-1;assert.deepEqual(Array.from(c.adjacentTrackCandidates(),x=>x.song.id),[1,3]);
 c.playQueue=c.playQueue.slice(0,2);assert.equal(c.adjacentTrackCandidates().length,1);
});
test('speculative memory is capped, evicted resources are disposed and taking transfers ownership',()=>{
 const c=context();let released=0;const cap=c.adjacentPreparationBudget();
 c.storeAdjacentEntry('a',{},cap,()=>released++,'3');
 assert.equal(c.storeAdjacentEntry('b',{},1,()=>released++,'1'),false,'previous must not evict preferred next');
 assert.equal(c.adjacentPreparation.bytes,cap);assert.equal(released,1);
 assert(c.takeAdjacentEntry('a'));assert.equal(c.adjacentPreparation.bytes,0);assert.equal(released,1);
 c.runtimeHardwareProfile={lowSpec:true};assert.equal(c.adjacentPreparationBudget(),16*1024*1024);
 assert.equal(c.storeAdjacentEntry('too-large',{},cap,()=>released++,'3'),false);assert.equal(released,2);
});

test('extra preparation pauses under sustained render pressure without changing display quality',()=>{
 const c=context();c.audio={paused:false};c.playing=true;c.navigator={onLine:true};
 c.adaptiveLoadPressureLevel=()=>0;assert.equal(c.adjacentPreparationAllowed(),true);
 c.adaptiveLoadPressureLevel=()=>2;assert.equal(c.adjacentPreparationAllowed(),false);
 c.adaptiveLoadPressureLevel=()=>1;assert.equal(c.adjacentPreparationAllowed(),true);
 c.audio.paused=true;assert.equal(c.adjacentPreparationAllowed(),false);
});

test('all background image consumers share two slots and release each slot once',()=>{
 const c=context();let wake=0;c.setTimeout=fn=>{wake++;return 1;};
 const a=c.reserveBackgroundImageSlot(),b=c.reserveBackgroundImageSlot();
 assert(a&&b);assert.equal(c.reserveBackgroundImageSlot(),null);
 a();a();assert.equal(c.backgroundImageBudget.active,1);assert.equal(wake,1);
 const d=c.reserveBackgroundImageSlot();assert(d);b();d();assert.equal(c.backgroundImageBudget.active,0);
});

test('a prepared title adopts the current cover palette rather than the previous song colors',()=>{
 const c=context();vm.runInContext(fs.readFileSync('public/js/modules/02-visual/07-lyrics-palette-text-utils.js','utf8'),c);
 c.adjacentStyleKey=()=> 'fixture';c.currentLyricSong=()=>({id:3});c.normalizeStageLyricPayload=text=>({text});
 c.stageLyrics={palette:{primary:'#123456'}};c.lyricThreeColor=value=>value;
 const color={value:'#old',copy(value){this.value=value;}};
 const mesh={userData:{stageLyricText:'Prepared title',lyric:{textMat:{uniforms:{uBaseColor:{value:color}}}}}};
 c.storeAdjacentEntry('title|3|fixture',mesh,1,()=>{},'3');
 assert.equal(c.takeAdjacentTitleMesh('Prepared title'),mesh);assert.equal(color.value,'#123456');
 assert.equal(c.adjacentPreparation.bytes,0);
});
