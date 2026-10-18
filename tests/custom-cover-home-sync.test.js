'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback', name), 'utf8');
function setup() {
  const album = 'https://example.com/album.jpg', avatar = 'data:image/webp;base64,old-avatar';
  const song = () => ({ id: 21178375, provider: 'netease', name: 'Break of Dawn', cover: album, customCover: avatar });
  const other = { id: 9, provider: 'netease', cover: album, customCover: 'data:image/webp;base64,other' };
  let saved, refreshed = 0;
  const c = vm.createContext({ console, CUSTOM_COVER_STORE_KEY: 'covers',
    customCoverMap: { 'id:21178375': avatar, 'id:9': other.customCover },
    localStorage: { setItem: (_key, value) => { saved = JSON.parse(value); } },
    document: { getElementById: () => null },
    playQueue: [song(), other], currentIdx: 0, currentLocalSong: song(), miniQueueOpen: false,
    homeDiscoverState: { songs: [song()] },
    homePlatformRecommendationState: { feeds: { qq: { songs: [song()] }, qishui: { songs: [] } } },
    homeDashboardDiscoveryCache: [song()], playlistCoverCache: {},
    currentCoverSong() { return c.playQueue[0]; },
    applyCoverDataUrl() {}, loadCoverFromUrl() {}, safeRenderQueuePanel() {}, safeShelfRebuild() {},
    updateCustomCoverButton() {}, showToast() {},
    renderHomeDiscover() { refreshed++; },
  });
  vm.runInContext(read('01-cover-custom-map.js'), c);
  const actions = read('06-track-detail-lyrics-actions.js');
  for (const name of ['setCustomCoverForCurrent', 'clearCustomCoverForCurrent']) {
    const start = actions.indexOf('function ' + name + '(');
    const end = actions.indexOf('\nfunction ', start + 1);
    vm.runInContext(actions.slice(start, end), c);
  }
  return { c, other, album, saved: () => saved, refreshed: () => refreshed,
    copies: () => [c.playQueue[0], c.currentLocalSong, c.homeDiscoverState.songs[0], c.homePlatformRecommendationState.feeds.qq.songs[0], c.homeDashboardDiscoveryCache[0]] };
}
test('restoring the official cover clears recommendation copies and preserves other songs', () => {
  const s = setup();
  s.c.clearCustomCoverForCurrent();
  for (const song of s.copies()) {
    assert.equal(song.customCover, undefined);
    assert.equal(s.c.songCoverSrc(song), s.album);
  }
  assert.equal(s.saved()['id:21178375'], undefined);
  assert.equal(s.saved()['id:9'], s.other.customCover);
  assert.equal(s.refreshed(), 1);
});
test('changing a custom cover replaces old recommendation copies immediately', () => {
  const s = setup(), next = 'data:image/webp;base64,new-cover';
  s.c.setCustomCoverForCurrent(next);
  for (const song of s.copies()) assert.equal(s.c.songCoverSrc(song), next);
  assert.equal(s.saved()['id:21178375'], next);
  assert.equal(s.refreshed(), 1);
  assert.equal(s.other.customCover, 'data:image/webp;base64,other');
});
