'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/classic-functions');

// Local files used to fall through songProviderKey to 'netease' and showed a
// NetEase quality chip. The chip must hide for them and come back for online songs.
function fixture() {
  const classes = new Set(['open']);
  const wrap = { classList: {
    toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    remove: name => classes.delete(name),
  } };
  const ctx = {
    playQueue: [], currentIdx: 0, playbackQuality: '', loginStatus: {},
    document: { getElementById: id => (id === 'quality-control' ? wrap : null), querySelectorAll: () => [] },
    currentPlaybackQualityProvider: () => 'netease', getProviderPlaybackQuality: () => 'exhigh',
    playbackQualityCapValue: () => '', effectivePlaybackQualityForSong: (song, provider, quality) => quality,
    hasProviderSvip: () => false, playbackQualityShortLabel: () => 'HQ', playbackQualityLabel: () => '极高',
  };
  vm.createContext(ctx);
  loadFunctions(ctx, 'public/js/modules/05-playback/00-api-quality-output.js', ['isLocalQualitySong', 'updatePlaybackQualityUi']);
  return { ctx, classes };
}

test('quality chip hides for local files and returns for online songs', () => {
  const { ctx, classes } = fixture();
  for (const local of [{ type: 'local' }, { source: 'local' }, { localFileId: 'f1' }, { localKey: 'k1' }, { localUrl: 'mineradio-local://x' }]) {
    classes.add('open');
    ctx.playQueue = [Object.assign({ name: 'song' }, local)];
    ctx.updatePlaybackQualityUi();
    assert.equal(classes.has('quality-control-local'), true, JSON.stringify(local));
    assert.equal(classes.has('open'), false, 'an open quality popover closes for a local file');
  }
  ctx.playQueue = [{ name: 'online', id: 1 }];
  ctx.updatePlaybackQualityUi();
  assert.equal(classes.has('quality-control-local'), false);
  ctx.playQueue = []; ctx.currentIdx = -1; ctx.currentLocalSong = { type: 'local', localKey: 'restored' };
  ctx.updatePlaybackQualityUi();
  assert.equal(classes.has('quality-control-local'), true, 'restored local selection can exist before a queue is hydrated');
});
