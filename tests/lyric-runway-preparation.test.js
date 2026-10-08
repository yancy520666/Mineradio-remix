'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
function context() {
  const canvasContext = { scale() {}, clearRect() {}, measureText() { return { actualBoundingBoxAscent: 90, actualBoundingBoxDescent: 20 }; } };
  const c = vm.createContext({ lyricsLines: new Array(300), runtimeHardwareProfile: {}, renderer: null,
    document: { createElement() { return { getContext() { return canvasContext; } }; } },
    THREE: { CanvasTexture: function(canvas) { this.image = canvas; } },
    lyricFillText() {}, lyricFontCss() { return ''; }, lyricEntryWeight() { return 500; }, lyricEntryLineOffset() { return 0; },
    lyricMaskStoneSeed() { return 1; }, lyricSeededRandom() {}, applyStonePrintTexture() {},
    applyLyricVerticalEdgeFade() {}, lyricEdgeFadeValue() { return 0; }, configureLyricTextureSampling() {},
    clampRange(v,a,b) { return Math.max(a,Math.min(b,v)); }, lyricRowTextureWidthBudget() { return 1600; },
    lyricQualityPoolBudgetBytes() { return 64*1024*1024; }
  });
  loadFunctions(c, 'public/js/modules/02-visual/10-lyrics-mask-textures.js', ['lyricRunwayRowPixelBudget','makeLyricMask','lyricQualityTargetMetrics']);
  return c;
}
function mask(c) {
  return c.makeLyricMask(null, { runwayPreview:true, plainPreview:true, preparedLayout:{payload:{},entries:[{text:'测试歌词',scale:1}],lines:['测试歌词'],activeLine:0,canvasWidth:2048,canvasHeight:384,fontSize:128,lineHeight:138,fitScaleX:1,textWidth:800,activeTextWidth:800,textHeight:128,lineY0:238,textMin:.1,textMax:.9} });
}
test('whole-song runway accounts for CPU and GPU copies, including translated lines', () => {
  const c=context();
  for (const count of [30,300,3000]) for (const lowSpec of [false,true]) {
    c.lyricsLines=new Array(count);c.runtimeHardwareProfile.lowSpec=lowSpec;
    const m=mask(c);assert.ok(m.width*m.height*8*count*2 <= (lowSpec?16:32)*1024*1024);
  }
});
test('small preview raster preserves authored geometry and karaoke proportions', () => {
  const m=mask(context());
  assert.equal(m.logicalWidth,2048);assert.equal(m.logicalFontSize,128);
  assert.equal(m.textWidth/m.width,800/2048);assert.equal(m.fontSize/m.width,128/2048);
  assert.ok(m.width <= 512);assert.ok(m.runwayPreview);
});
test('high quality redraw uses the original row width rather than enlarging the preview', () => {
  const c=context(),m=mask(c),metrics=c.lyricQualityTargetMetrics(m,2);
  assert.equal(metrics.width,3200);assert.equal(metrics.logicalWidth,2048);
});
test('resident work accepts the current prepared root but rejects old songs and disposed roots', () => {
  const mesh={userData:{preparedTrackToken:2}},other={userData:{preparedTrackToken:1}};
  const c=vm.createContext({stageLyrics:{current:null},stageLyricPrewarm:{mesh},trackSwitchToken:2});
  loadFunctions(c,'public/js/modules/02-visual/14-stage-lyrics-rendering.js',['stageLyricResidentMeshIsCurrent','stageLyricResidentJobIsCurrent']);
  const data={trackPersistent:true,trackKey:'song'};
  assert.equal(c.stageLyricResidentJobIsCurrent({mesh,trackToken:2,trackKey:'song'},data),true);
  assert.equal(c.stageLyricResidentJobIsCurrent({mesh,trackToken:1,trackKey:'song'},data),false);
  assert.equal(c.stageLyricResidentJobIsCurrent({mesh:other,trackToken:2,trackKey:'song'},data),false);
  c.stageLyricPrewarm.mesh=null;assert.equal(c.stageLyricResidentJobIsCurrent({mesh,trackToken:2,trackKey:'song'},data),false);
});

test('leaving a visible window releases the full base and returns to the cheap mask', () => {
  const released=[],full={},preview={texture:{}},row={lineIndex:100,isPrimary:true,runwayLineMask:preview,lineMask:{},baseLineTexture:full};
  const data={trackPersistent:true,rowLayers:[row]},mesh={userData:{lyric:data}};
  const c=vm.createContext({ lyricsLines:new Array(300), fx:{},
    lyricDisplayOffsetsForMode(){return [0,1];}, releaseLyricRowQuality(){},
    setLyricRowTextureMap(r,t){r.map=t;}, disposeOwnedLyricTexture(t){released.push(t);},
    updateStageLyricPersistentResidentBounds() {}, disposeLyricMesh(){}
  });
  loadFunctions(c,'public/js/modules/02-visual/14-stage-lyrics-rendering.js',['trimStageLyricPersistentTrackRows']);
  c.trimStageLyricPersistentTrackRows(mesh,0);
  assert.equal(row.lineMask,preview);assert.equal(row.map,preview.texture);
  assert.equal(row.runwayLineMask,null);assert.deepEqual(released,[full]);
  c.trimStageLyricPersistentTrackRows(mesh,0);assert.equal(released.length,1);
});

test('stationary captions reject the tiny runway but allow committed sharp text', () => {
  const c=vm.createContext({lyricQualityCurrentMap(row){return row.map;}});
  loadFunctions(c,'public/js/modules/02-visual/12-lyrics-row-layers.js',['lyricRowTextReadyForDisplay']);
  const tiny={},sharp={},row={lineMask:{runwayPreview:true},baseLineTexture:tiny,map:tiny};
  assert.equal(c.lyricRowTextReadyForDisplay(row,false),false);
  assert.equal(c.lyricRowTextReadyForDisplay(row,true),true);
  row.map=sharp;assert.equal(c.lyricRowTextReadyForDisplay(row,false),true);
  row.lineMask.runwayPreview=false;row.map=tiny;
  assert.equal(c.lyricRowTextReadyForDisplay(row,false),true);
});

test('sharp upcoming text takes priority over the remaining whole-song runway', () => {
  const calls=[],rows=[0,1,2,3].map(i=>({lineIndex:i,isPrimary:true,lineMask:{runwayPreview:i>0}}));
  const mesh={userData:{lyric:{trackPersistent:true,displayMode:'triple',rowLayers:rows}}};
  const c=vm.createContext({lyricsLines:new Array(300),fx:{lyricTranslationMode:'off'},stageLyrics:{current:mesh},stageLyricResidentBuild:{job:null},
    stageLyricResidentMeshIsCurrent(){return true;},stageLyricProgressPreviewActive(){return false;},
    stageLyricPersistentResidentRowMap(d){return Object.fromEntries(d.rowLayers.map(r=>[r.lineIndex+'|primary',r]));},
    stageLyricPersistentLineRowsResident(d,i,m){return !!m[i+'|primary'];},
    lyricDisplayOffsetsForMode(){return [0,1];},lyricLineDisplayTextAt(){return 'line';},
    stageLyricTrackBaseEntry(){return {text:'line'};},normalizeLyricTranslationMode(){return 'off';},
    startStageLyricResidentBuild(m,i,start,end,options){calls.push({m,i,start,end,options});return true;}
  });
  loadFunctions(c,'public/js/modules/02-visual/14-stage-lyrics-rendering.js',['ensureStageLyricPersistentTrackRows']);
  assert.equal(c.ensureStageLyricPersistentTrackRows(mesh,0),true);
  assert.equal(calls.length,1);assert.equal(calls[0].start,1);assert.equal(calls[0].end,3);
  assert.equal(calls[0].options.textOnly,true);assert.equal(calls[0].options.urgent,true);
  assert.notEqual(calls[0].options.runwayPreview,true);
  c.stageLyricResidentBuild.job={mesh,start:1,end:3,textOnly:true,runwayPreview:false};
  c.ensureStageLyricPersistentTrackRows(mesh,0);assert.equal(calls.length,1);
});

test('startup prepares clear visible text without making the whole initial page expensive', () => {
  const c=vm.createContext({lyricLineAllowedForDisplayMode(line,target){return Math.abs(line-target)<=1;}});
  loadFunctions(c,'public/js/modules/02-visual/12-lyrics-row-layers.js',['lyricRowUsesRunwayPreview']);
  const payload={trackIndex:0,mode:'triple'};
  assert.equal(c.lyricRowUsesRunwayPreview(payload,0),false);
  assert.equal(c.lyricRowUsesRunwayPreview(payload,1),false);
  assert.equal(c.lyricRowUsesRunwayPreview(payload,7),true);
  payload.trackRunwayPreview=true;assert.equal(c.lyricRowUsesRunwayPreview(payload,0),true);
  payload.trackRunwayPreview=false;assert.equal(c.lyricRowUsesRunwayPreview(payload,7),false);
});
