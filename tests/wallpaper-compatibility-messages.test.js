'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');
const file = 'public/js/modules/07-fx/03-wallpaper-engine-library.js';

test('preview labels explain unsupported applications and missing project files', () => {
  const ctx = vm.createContext({});
  loadFunctions(ctx, file, ['wallpaperEngineProjectLabel', 'wallpaperEnginePreviewReason']);
  for (const [projectType, reason] of [
    ['application', /暂不支持运行应用型/], ['scene', /PKGV/],
    ['web', /入口文件/], ['video', /视频文件/], ['unknown', /暂不支持/]
  ]) assert.match(ctx.wallpaperEnginePreviewReason({ projectType }), reason);
  assert.match(ctx.wallpaperEngineProjectLabel({ projectType: 'application' }), /暂不支持运行，仅预览/);
  assert.match(ctx.wallpaperEngineProjectLabel({ projectType: 'web', enginePlayable: true }), /原生运行/);
  // A runtime fallback is not a missing file or an unsupported project type.
  assert.match(ctx.wallpaperEnginePreviewReason({ projectType: 'scene', enginePlayable: true }), /重试运行/);
});

test('selecting an unsupported preview clearly warns that effects and interaction are unavailable', () => {
  const notices = [];
  const item = { id: 'fixture', title: '应用壁纸', projectType: 'application', hasPreview: true };
  const elements = { 'wallpaper-engine-layer': { classList: { contains: () => false } },
    'wallpaper-engine-image': {}, 'wallpaper-engine-video': {} };
  const ctx = vm.createContext({
    document: { getElementById: id => elements[id] },
    wallpaperEngineSelection: { active: true, id: item.id, kind: 'preview' },
    wallpaperEngineLayerToken: 0, wallpaperEngineSwitchTimer: 0,
    cancelWallpaperEngineSwitchTimer() {}, stopWallpaperEngineNativeSession() {},
    restoreOriginalBackgroundAfterWallpaperEngine() {}, clearWallpaperEngineLayerMedia() {},
    updateWallpaperEngineEntryUi() {}, wallpaperEngineMediaUrl: () => 'fixture-preview',
    showToast: text => notices.push(text)
  });
  loadFunctions(ctx, file, ['wallpaperEnginePreviewReason', 'applyWallpaperEngineBackground']);
  assert.equal(ctx.applyWallpaperEngineBackground(item, false), true);
  assert.equal(elements['wallpaper-engine-image'].src, 'fixture-preview');
  assert.match(notices[0], /暂不支持运行应用型壁纸.*仅显示项目预览.*不运行原壁纸的效果与交互/);
});

test('an unusable project without a preview reports why and leaves the current wallpaper alone', () => {
  const notices = [];
  let item = { projectType: 'web', hasPreview: false };
  const selection = { active: true, id: 'previous' };
  const ctx = vm.createContext({ wallpaperEngineSelection: selection,
    wallpaperEngineProjectById: () => item, showToast: text => notices.push(text) });
  loadFunctions(ctx, file, ['wallpaperEnginePreviewReason', 'activateWallpaperEngineItem']);
  ctx.activateWallpaperEngineItem('unavailable');
  assert.match(notices[0], /入口文件不可用.*没有预览图/);
  assert.equal(ctx.wallpaperEngineSelection, selection);
  assert.equal(selection.id, 'previous');
  item = null;
  ctx.activateWallpaperEngineItem('removed');
  assert.match(notices[1], /不在索引.*重新识别/);
});
