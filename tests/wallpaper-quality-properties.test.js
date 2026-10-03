'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { WallpaperPropertyStore } = require('../desktop/wallpaper-engine-properties');
const { WallpaperEngineRuntime } = require('../desktop/wallpaper-engine-runtime');
const { loadFunctions } = require('./helpers/classic-functions');

const id = '1234567890abcdef12345678';
const definitions = [
  { key: 'clock', type: 'bool', value: true },
  { key: 'size', type: 'slider', value: 15, min: 10, max: 50, step: 0.5 },
  { key: 'mode', type: 'combo', value: '1', options: [{value:'1'}, {value:'2'}] },
  { key: 'color', type: 'color', value: '0.2 0.3 0.4' },
  { key: 'text', type: 'textinput', value: 'Original' },
  { key: 'volume', type: 'slider', value: 10, autoMuted: true },
  { key: 'file', type: 'file', value: '' },
];

test('wallpaper edits validate types, persist atomically, reset and leave original project read-only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mineradio-we-edit-'));
  try {
    const store = new WallpaperPropertyStore(root);
    await Promise.all([
      store.update(id, definitions, {clock:false, size:20.7}),
      store.update(id, definitions, {text:'自定义文字\n第二行', mode:'2', color:'1 0.4 0'}),
    ]);
    const restarted = new WallpaperPropertyStore(root);
    assert.deepEqual(await restarted.values(id, definitions), {clock:false, size:20.5, text:'自定义文字\n第二行', mode:'2', color:'1 0.4 0'});
    for (const changes of [{size:51}, {size:NaN}, {mode:2}, {color:'1 2 0'}, {volume:99}, {text:'x)~END'}, {file:path.join(root,'secret')}, JSON.parse('{"__proto__":true}')]) {
      await assert.rejects(store.update(id, definitions, changes), /PROPERTY_/);
    }
    const textDefinitions = Array.from({length:7},(_,index)=>({key:'text'+index,type:'textinput',value:''}));
    await assert.rejects(store.update(id,textDefinitions,Object.fromEntries(textDefinitions.map(property=>[property.key,'x'.repeat(4096)]))), /TEXT_TOO_LONG/);
    assert.equal((await store.values(id, definitions)).clock, false);
    await store.update(id, definitions, {}, true);
    assert.deepEqual(await new WallpaperPropertyStore(root).values(id, definitions), {});
    await store.update(id, definitions, {clock:true});
    assert.equal((await store.values(id, definitions)).clock, true, 'invalid edits do not poison the save queue');
  } finally { await fs.rm(root, {recursive:true, force:true}); }
});

test('local edits apply only to the matching live window, mute wins and reset reapplies defaults', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mineradio-we-live-edit-'));
  try {
    const projectFile = path.join(root, 'project.json');
    const original = JSON.stringify({type:'web',general:{properties:{clock:{type:'bool',value:true}}}});
    await fs.writeFile(projectFile, original);
    const store = new WallpaperPropertyStore(path.join(root,'private'));
    const commands = [];
    const runtime = new WallpaperEngineRuntime({ propertyStore:store, nativeTempPath:path.join(root,'temp'), platform:'linux',
      library: { getProjectDetails:async()=>({ok:true,id,properties:definitions}), getNativeSceneTarget:async()=>({id, projectFile, nativeFile:path.join(root,'index.html')}) },
    });
    runtime._discoverExecutable = async()=>({available:false});
    runtime._runTransientControl = async(_exe,args)=>{ commands.push(args); };
    const session = {id, executable:path.join(root,'wallpaper64.exe'), originalProjectFile:projectFile,
      locationTitle:'Mineradio Wallpaper isolated', defaultUserProperties:{clock:true,volume:10}, propertyDefinitions:definitions, muteProperties:{volume:0}};
    runtime.active = session;
    const saved = await runtime.updateProjectProperties(id,{clock:false});
    assert.equal(saved.applied, true);
    assert(commands[0].includes(session.locationTitle));
    assert(commands[0].includes('RAW~({"clock":false,"volume":0})~END'));
    await runtime.updateProjectProperties(id,{},true);
    assert(commands[1].includes('RAW~({"clock":true,"volume":0})~END'));
    session.defaultUserProperties.file = '';
    const chosen = path.join(root,'chosen.png');
    await runtime.updateProjectProperties(id,{file:chosen},false,true);
    assert(commands[2].includes(`RAW~(${JSON.stringify({file:chosen,volume:0})})~END`));
    await runtime.updateProjectProperties(id,{},true);
    assert(commands[3].includes('RAW~({"file":"","volume":0})~END'),'reset clears a file property without an author default');
    session.id = '222222222222222222222222';
    assert.equal((await runtime.updateProjectProperties(id,{clock:false})).applied,false);
    assert.equal(commands.length,4,'editing another project does not touch the active wallpaper');
    assert.equal(await fs.readFile(projectFile,'utf8'),original);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('video decode failures try the original native target before a clearly labeled thumbnail', () => {
  const events = [];
  const selection = {active:true,kind:'media'};
  const context = vm.createContext({wallpaperEngineSelection:selection,wallpaperEngineLayerToken:1,
    wallpaperEngineRuntimeError:'', wallpaperEngineNativeSessionId:'',wallpaperEngineHostRecoveryInFlight:false,
    cancelWallpaperEngineFirstFrameWait(){}, stopWallpaperEngineCaptureStream(){}, stopWallpaperEngineNativeSession:()=>Promise.resolve(),
    cancelWallpaperEngineHostRecovery(){}, applyWallpaperEngineBackground:()=>events.push(selection.kind),showToast:()=>{},
  });
  loadFunctions(context,'public/js/modules/07-fx/03-wallpaper-engine-library.js',['wallpaperEngineLayerFailed']);
  context.wallpaperEngineLayerFailed({enginePlayable:true,hasPreview:true},'media',1);
  assert.deepEqual(events,['engine']);
  context.wallpaperEngineRuntimeError = 'WE 控制通道未就绪';
  context.wallpaperEngineLayerFailed({enginePlayable:true,hasPreview:true},'engine',1);
  assert.deepEqual(events,['engine','preview']);
  assert.equal(context.wallpaperEngineRuntimeError,'WE 控制通道未就绪');
});

test('Windows PowerShell helpers do not inherit incompatible PowerShell Core module paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'mineradio-we-powershell-'));
  try {
    const runtime = new WallpaperEngineRuntime({nativeTempPath:root});
    const original = process.env.PSModulePath;
    process.env.PSModulePath = 'C:/PowerShell7/Modules';
    try {
      const environment = runtime._powerShellEnv({MINERADIO_WE_SIGNATURE_TARGET:'verified.exe'});
      assert(!Object.keys(environment).some(key=>key.toLowerCase()==='psmodulepath'));
      assert.equal(environment.MINERADIO_WE_SIGNATURE_TARGET,'verified.exe');
      assert.equal(environment.TEMP,root);
    } finally { if (original === undefined) delete process.env.PSModulePath; else process.env.PSModulePath = original; }
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('automatic wallpaper FPS avoids a heavy scene rendering at desktop 240 Hz', () => {
  const context = vm.createContext({WALLPAPER_ENGINE_MAX_CAPTURE_FPS:240});
  loadFunctions(context,'desktop/main.js',['wallpaperEngineTargetFps']);
  assert.equal(context.wallpaperEngineTargetFps({displayFrequency:240},0),60);
  assert.equal(context.wallpaperEngineTargetFps({displayFrequency:48},0),48);
  assert.equal(context.wallpaperEngineTargetFps({displayFrequency:240},120),120,'explicit fixed FPS is preserved');
  assert.equal(context.wallpaperEngineTargetFps({displayFrequency:60},120),60);
});
