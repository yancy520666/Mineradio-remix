'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('closing real content manager cancels its cover viewport, pending rows and later online retries', () => {
  const images = [], timers = [], events = {};
  let budgetActive = 0;
  const c = vm.createContext({ console, Set, Map,
    Image: class { constructor() { images.push(this); } removeAttribute() { this.src = ''; } },
    performance: { now: () => 100, getEntriesByName: () => [] },
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimeout: t => { if (t) t.cancelled = true; },
    window: { addEventListener: (name, fn) => { events[name] = fn; } },
    THREE: { Vector3: function () {}, Object3D: function () {}, Matrix4: function () {} },
    playlistCoverCache: {}, coverProxySrc: src => src, coverUrlWithSize: src => src, isInlineCoverSrc: () => false,
    shelfLayoutProfile: () => ({ detail: {} }), userPlaylists: [], myPodcastCollections: [],
    reserveBackgroundImageSlot: () => { if (budgetActive >= 2) return null; budgetActive++; return () => budgetActive--; },
  });
  vm.runInContext(read('public/js/modules/04-shelf/04a-cover-loader.js'), c);
  // Only expose initial open/group state. Exercise the unchanged production close body.
  const source = read('public/js/modules/04-shelf/03-content-list-manager.js').replace(
    '    isOpen: function () { return open; },',
    '    __qaPrimeOpen: function () { open = true; group = {}; },\n    isOpen: function () { return open; },');
  vm.runInContext(source, c);
  const manager = c.makeContentListManager(); manager.__qaPrimeOpen();
  const urls = Array.from({ length: 20 }, (_, i) => 'https://fixture/' + i);
  c.updatePlaylistCoverViewport([urls[0]], urls.slice(1));
  urls.forEach(url => c.requestPlaylistCover(url, () => {}, { scope: 'content', isCurrent: () => manager.isOpen() }));
  assert.equal(c.playlistCoverActive, 2); assert.equal(budgetActive, 2);
  manager.close();
  assert.equal(manager.isOpen(), false); assert.equal(c.playlistCoverActive, 0); assert.equal(budgetActive, 0);
  assert.equal(c.playlistCoverQueue.length, 0); assert.equal(c.playlistCoverViewportVisible.size, 0); assert.equal(c.playlistCoverViewportNearby.size, 0);
  assert(images.every(img => img.src === '' && img.onload == null && img.onerror == null));
  const count = images.length;
  c.playlistCoverCache.fail = { failed: true, session: -1, failedAt: 0 };
  events.online(); assert.equal(images.length, count, 'closed viewport must not retry old covers');
  manager.close(); assert.equal(c.playlistCoverActive, 0, 'repeat close is harmless');
});
