'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/modules/07-fx/02-accent-background-controls.js'), 'utf8');
function fixture() {
  const nodes = [], timers = new Map(), frames = new Map(), revoked = [], blobs = [];
  let nextId = 0, reduced = false, wallpaper = false;
  const layer = { children: [], appendChild(n) { this.children.push(n); n.parentNode = this; },
    removeChild(n) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; } };
  function node(type) {
    const n = { type, style: { setProperty(k,v) { this[k]=v; } }, paused: true,
      setAttribute(k,v) { this[k] = v; }, removeAttribute(k) { this[k] = ''; },
      pause() { this.paused = true; }, load() {}, play() { this.paused = false; return Promise.resolve(); },
      decode() { return new Promise((resolve, reject) => { this.decoded = resolve; this.decodeFailed = reject; }); },
      requestVideoFrameCallback(fn) { this.firstFrame = fn; return 1; }, cancelVideoFrameCallback() { this.frameCancelled = true; }
    }; nodes.push(n); return n;
  }
  const c = vm.createContext({ console, Promise,
    customBgApplyToken: 0, customBgObjectUrl: '', customBgVideoState: {},
    document: { createElement: node, getElementById: id => layer.children.find(n => n.id === id),
      body: { classList: { contains: () => wallpaper } } },
    window: { matchMedia: () => ({ matches: reduced }) },
    URL: { createObjectURL: () => 'blob:owned-' + (++nextId), revokeObjectURL: url => revoked.push(url) },
    getCustomBackgroundBlob: id => new Promise(resolve => blobs.push({ id, resolve })),
    setTimeout: (fn, ms) => { const id=++nextId; timers.set(id, {fn,ms}); return id; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id=++nextId; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id)
  });
  vm.runInContext(source, c);
  const apply = (type, src, opacity=1) => c.applyCustomBackgroundSurface(layer, type ? {type,src} : null, opacity);
  const tick = () => { for (const [id,fn] of [...frames]) { frames.delete(id); fn(); } };
  const settle = () => c.finishCustomBackgroundHandoff();
  const readyImage = async n => { n.onload(); n.decoded(); await Promise.resolve(); await Promise.resolve(); tick(); tick(); };
  return {c, layer, nodes, revoked, blobs, timers, apply, tick, settle, readyImage,
    reduced: value => { reduced=value; }, wallpaper: value => {wallpaper=value;} };
}

test('images wait for decode, keep old on error, and latest A/B/C intent wins', async () => {
  const f=fixture(); f.apply('image','A'); await f.readyImage(f.nodes[0]); f.settle();
  const a=f.nodes[0]; assert.equal(f.c.customBgSurfaceState.active.node,a);
  f.apply('image','B'); const b=f.nodes[1]; b.onload();
  assert.equal(f.c.customBgSurfaceState.active.node,a);
  f.apply('image','C'); const c=f.nodes[2]; assert.equal(b.src,'');
  b.decoded(); await Promise.resolve(); assert.equal(f.c.customBgSurfaceState.active.node,a);
  c.onerror(); assert.equal(f.c.customBgSurfaceState.active.node,a);
  for(let i=0;i<20;i++) f.apply('image','C'); assert.equal(f.nodes.length,3);
  f.apply('image','D'); await f.readyImage(f.nodes[3]); assert.equal(f.layer.children.length,2);
  f.settle(); assert.equal(f.layer.children.length,1); assert.equal(a.src,'');
});

test('video awaits a presented frame and never mutates the playing old source', async () => {
  const f=fixture(); f.apply('video','A'); const a=f.nodes[0]; a.onloadeddata();
  assert.equal(f.c.customBgSurfaceState.active,null); a.firstFrame(); f.tick(); f.settle();
  f.apply('video','B'); const b=f.nodes[1]; assert.equal(a.src,'A'); assert.equal(a.paused,false);
  b.onloadeddata(); assert.equal(f.c.customBgSurfaceState.active.node,a);
  b.firstFrame(); f.tick(); assert.equal(b.id,'custom-bg-video'); assert.equal(a.src,'A');
  f.settle(); assert.equal(a.src,''); assert.equal(a.paused,true); assert.deepEqual(f.revoked,[]);
});

test('reduced motion still gates decoding and releases the old surface immediately', async () => {
  const f=fixture(); f.reduced(true); f.apply('image','A'); await f.readyImage(f.nodes[0]);
  f.apply('image','B'); assert.equal(f.c.customBgSurfaceState.active.node,f.nodes[0]);
  await f.readyImage(f.nodes[1]); assert.equal(f.layer.children.length,1);
  f.apply(null); assert.equal(f.layer.children.length,0);
});

test('timeout and decode rejection preserve old art; reset invalidates late work', async () => {
  const f=fixture(); f.apply('image','A'); await f.readyImage(f.nodes[0]); f.settle();
  f.apply('image','B'); const b=f.nodes[1]; b.onload(); b.decodeFailed(new Error('bad')); await Promise.resolve();
  assert.equal(f.c.customBgSurfaceState.active.node,f.nodes[0]);
  f.apply('video','C'); const c=f.nodes[2]; const timeout=[...f.timers.values()].find(t=>t.ms===15000); timeout.fn();
  assert.equal(c.src,''); assert.equal(f.c.customBgSurfaceState.active.node,f.nodes[0]);
  f.apply('image','D'); const d=f.nodes[3]; d.onload(); f.apply(null); d.decoded(); await Promise.resolve();
  f.tick(); f.settle(); assert.equal(f.layer.children.length,0);
});

test('only locally created blob URLs are revoked, once, including cancelled requests', async () => {
  const f=fixture(); f.c.applyCustomBackgroundSurface(f.layer,{type:'video',id:'A'},1);
  f.blobs[0].resolve({}); await Promise.resolve(); const a=f.nodes[0], owned=a.src;
  a.onloadeddata(); a.firstFrame(); f.tick(); f.settle();
  f.c.applyCustomBackgroundSurface(f.layer,{type:'video',id:'B'},1);
  f.blobs[1].resolve({}); await Promise.resolve(); const b=f.nodes[1], candidateUrl=b.src;
  f.apply('video','blob:borrowed'); assert.deepEqual(f.revoked,[candidateUrl]);
  const borrowed=f.nodes[2]; borrowed.onloadeddata(); borrowed.firstFrame(); f.tick(); f.settle();
  assert.deepEqual(f.revoked,[candidateUrl,owned]);
  f.apply(null); f.tick(); f.settle(); assert.deepEqual(f.revoked,[candidateUrl,owned]);
});

test('rapid switches maintain at most two surfaces; WE cancels candidate and resumes active', async () => {
  const f=fixture(); f.apply('video','A'); const a=f.nodes[0]; a.onloadeddata(); a.firstFrame(); f.tick(); f.settle();
  f.apply('image','B'); const b=f.nodes[1]; b.onload();
  f.wallpaper(true); f.apply('image','B'); b.decoded(); await Promise.resolve();
  assert.equal(a.paused,true); assert.equal(f.layer.children.length,1);
  f.wallpaper(false); f.apply('video','A'); assert.equal(a.paused,false);
  for(let i=0;i<20;i++) { f.apply('image','i'+i); await f.readyImage(f.nodes.at(-1)); assert(f.layer.children.length<=2); }
  f.settle(); assert.equal(f.layer.children.length,1);
});

test('WE suspend hook immediately cancels a pending decode; restore loads latest selected media', async () => {
  const f=fixture(); f.apply('video','A'); const a=f.nodes[0]; a.onloadeddata(); a.firstFrame(); f.tick(); f.tick(); f.settle();
  f.apply('image','B'); const b=f.nodes[1]; b.onload();
  const weSource=fs.readFileSync(require('node:path').join(__dirname,'../public/js/modules/07-fx/03-wallpaper-engine-library.js'),'utf8');
  const start=weSource.indexOf('function suspendOriginalBackgroundForWallpaperEngine() {');
  const end=weSource.indexOf('\nfunction wallpaperEngineLayerReady',start);
  vm.runInContext(weSource.slice(start,end),f.c);
  f.c.suspendOriginalBackgroundForWallpaperEngine();
  assert.equal(a.paused,true); assert.equal(b.src,''); assert.equal(f.c.customBgSurfaceState.candidate,null);
  b.decoded(); await Promise.resolve(); assert.equal(f.c.customBgSurfaceState.active.node,a);
  f.apply('image','B'); const replacement=f.nodes.at(-1); assert.notEqual(replacement,b);
  await f.readyImage(replacement); f.settle(); assert.equal(f.c.customBgSurfaceState.active.node,replacement);
});

test('same-media opacity changes do not reload; cache-hot image handoff spans two frames', async () => {
  const f=fixture(); f.apply('image','A',0.45); const a=f.nodes[0]; a.onload(); a.decoded(); await Promise.resolve();
  assert.equal(a.style['--custom-bg-surface-opacity'],'0'); f.tick(); assert.equal(a.style['--custom-bg-surface-opacity'],'0');
  f.tick(); assert.equal(a.style['--custom-bg-surface-opacity'],'0.450'); f.settle();
  f.apply('image','A',0.2); assert.equal(f.nodes.length,1); assert.equal(a.style['--custom-bg-surface-opacity'],'0.200');
});

test('an unresolved IndexedDB request cannot allocate or revive media after reset', async () => {
  const f=fixture(); f.c.applyCustomBackgroundSurface(f.layer,{type:'video',id:'A'},1);
  const a=f.nodes[0]; f.apply(null); f.blobs[0].resolve({}); await Promise.resolve();
  assert.equal(a.src,''); assert.equal(f.layer.children.length,0); assert.deepEqual(f.revoked,[]);
});

test('crop preview never borrows an outgoing video belonging to a different selection', () => {
  const f=fixture(); f.apply('video','A'); const a=f.nodes[0]; a.onloadeddata(); a.firstFrame(); f.settle();
  a.currentSrc='A';
  assert.equal(f.c.customBackgroundCropMediaSrc({type:'video',src:'A'}),'A');
  f.apply('video','B'); assert.equal(f.c.customBackgroundCropMediaSrc({type:'video',src:'B'}),'B');
  assert.equal(f.c.customBackgroundCropMediaSrc({type:'video',id:'C'}),'');
});

test('explicit media reselection can retry failure while slider-only updates cannot', () => {
  const f=fixture(); f.apply('image','A'); f.nodes[0].onerror();
  f.apply('image','A',0.4); assert.equal(f.nodes.length,1);
  f.c.fx={}; f.c.normalizeCustomBackgroundMedia=m=>m; f.c.saveLyricLayout=()=>{};
  f.c.updateCustomBackgroundControls=()=>f.c.applyCustomBackgroundSurface(f.layer,f.c.fx.backgroundMedia,1);
  f.c.setCustomBackgroundMedia({type:'image',src:'A'},true);
  assert.equal(f.nodes.length,2); assert.equal(f.nodes[1].src,'A');
});
