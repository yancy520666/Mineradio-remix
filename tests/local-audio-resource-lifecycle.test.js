'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const { loadFunctions } = require('./helpers/classic-functions');
const uploadPath = 'public/js/modules/06-lyrics/05-upload-dragdrop.js';
const beatPath = 'public/js/modules/03-beat/03-local-beat-cache-modal.js';
const builtinPath = 'public/js/modules/06-lyrics/00-built-in-playlists.js';
function harness() {
  const revoked = [], timers = new Map(), storage = new Map(), handlers = {};
  let serial = 0, timerSerial = 0;
  const no = () => {};
  const c = vm.createContext({ console, Promise, WeakSet, Set, Date, Object, Array, Math, Number,
    URL: { createObjectURL: () => 'blob:owned-' + (++serial), revokeObjectURL: url => revoked.push(url) },
    setTimeout: (fn, ms) => { const id = ++timerSerial; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id), window: { addEventListener: (event, fn) => { handlers[event] = fn; } },
    document: { getElementById: () => null, addEventListener: no, querySelector: () => null },
    hydrateCustomCover: song => song, cloneSong: song => ({ ...song }), playQueue: [], currentIdx: -1,
    trackSwitchToken: 0, currentLocalSong: null, audio: { src: '', currentSrc: '', duration: 100, currentTime: 0 },
    localBeatAnalysis: { song: null, audioUrl: '', active: false, token: 0 }, currentBeatMap: null, currentDjBeatMap: null,
    localBeatMapCache: {}, localBeatMapPrefs: {}, LOCAL_BEATMAP_STORE_KEY: 'maps', LOCAL_BEAT_PREF_STORE_KEY: 'prefs',
    LOCAL_BEAT_COMBOS: ['', 'downbeat'], localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    localBeatDiskKey: (key, mode) => key + ':' + mode, writeBeatDiskCache: async () => true,
    estimateBeatMapBytes: map => map.fixtureBytes || 128, beatMapCache: {}, djBeatMapCache: {}, beatMapToken: 0, djBeatMapToken: 0,
    setHomeControlsLocked: no, safeRenderQueuePanel: no, safeShelfRebuild: no, forcePlaybackControlsInteractive: no,
    updateEmptyHomeVisibility: no, showToast: no, miniQueueOpen: false, loadCoverFromFile: no,
    closeGsapModal: no, openGsapModal: no, immersiveMode: false,
  });
  vm.runInContext(fs.readFileSync(uploadPath, 'utf8'), c, { filename: uploadPath });
  vm.runInContext(fs.readFileSync(beatPath, 'utf8'), c, { filename: beatPath });
  c.playQueueAt = async index => { c.trackSwitchToken++; c.currentLocalSong = c.playQueue[index]; c.audio.src = c.currentLocalSong.localUrl; };
  const song = (name = 'same.mp3') => c.localSongFromAudioFile({ name, size: 100, lastModified: 1 });
  function flush() {
    for (let i = 0; i < 20; i++) {
      const immediate = [...timers].find(([, t]) => t.ms === 0);
      if (!immediate) return;
      timers.delete(immediate[0]); immediate[1].fn();
    }
    throw new Error('unbounded immediate timer loop');
  }
  return { c, revoked, timers, storage, handlers, song, flush, no };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
function map(label, bytes) { return { cameraBeats: [{ time: 1, strength: 0.5 }], pulseBeats: [], label, fixtureBytes: bytes || 128 }; }

test('500 repeated file selections retire replaced URLs without revoking the active queue; one timer only', async () => {
  const h = harness(), { c } = h;
  for (let i = 0; i < 500; i++) {
    const next = h.song(); c.importLocalAudioSongs([next]); await settle(); h.flush();
    assert.equal(Object.keys(c.localAudioObjectUrlRegistry()).length, 1);
    assert.equal(c.audio.src, next.localUrl); assert(!h.revoked.includes(next.localUrl));
    assert.equal(h.timers.size, 1);
  }
  assert.equal(h.revoked.length, 499);
  assert.equal(new Set(h.revoked).size, 499);
});

test('queue replacement pins outgoing media until playback settles; obsolete completions cannot revoke the new queue', async () => {
  const h = harness(), { c } = h;
  const first = h.song('one.mp3'); c.importLocalAudioSongs([first]); await settle(); h.flush();
  const old = deferred(); c.playQueueAt = () => old.promise;
  const second = h.song('two.mp3'); c.importLocalAudioSongs([second]); h.flush();
  assert(!h.revoked.includes(first.localUrl)); assert(!h.revoked.includes(second.localUrl));
  const third = h.song('three.mp3');
  c.playQueueAt = async () => { c.trackSwitchToken++; c.currentLocalSong = third; c.audio.src = third.localUrl; };
  c.importLocalAudioSongs([third]); await settle(); h.flush();
  old.resolve(true); await settle(); h.flush();
  assert(h.revoked.includes(first.localUrl)); assert(h.revoked.includes(second.localUrl));
  assert(!h.revoked.includes(third.localUrl));
});

test('details, collection, shelf, media preload and analysis owners pin URLs outside the queue', () => {
  const h = harness(), { c } = h;
  const roots = [
    song => { c.detailCommentSong = song; }, song => { c.collectTargetSong = song; },
    song => { c.detailAlbumSongs = [song]; }, song => { c.detailArtistSongs = [song]; },
    song => { c.playlistPanelDetailState = { tracks: [song] }; }, song => { c.userPlaylists = [{ songs: [song] }]; },
    song => { c.albumGaplessState = { preload: { previousAudio: { src: song.localUrl } } }; },
    song => { c.cuefieldActiveTransitionContext = { outgoingMedia: { currentSrc: song.localUrl } }; },
    song => { c.shelfManager = { getCards: () => [{ item: song }] }; },
  ];
  const songs = roots.map((root, i) => { const song = h.song(i + '.mp3'); root(song); return song; });
  c.sweepLocalAudioObjectUrls(false); assert.equal(h.revoked.length, 0);
  delete c.detailCommentSong; delete c.collectTargetSong; delete c.detailAlbumSongs; delete c.detailArtistSongs;
  delete c.playlistPanelDetailState; delete c.userPlaylists; delete c.albumGaplessState; delete c.cuefieldActiveTransitionContext; delete c.shelfManager;
  c.sweepLocalAudioObjectUrls(false); assert.equal(h.revoked.length, songs.length);
});

test('failed ownership scan is conservative; foreign blob and persistent protocol URLs are never owned', () => {
  const h = harness(), { c } = h, owned = h.song();
  c.playQueue = [{ localUrl: 'blob:foreign' }, { localUrl: 'mineradio-local://saved/file' }];
  c.shelfManager = { getCards() { throw new Error('temporarily rebuilding'); } };
  c.sweepLocalAudioObjectUrls(false); assert.equal(h.revoked.length, 0);
  delete c.shelfManager; c.sweepLocalAudioObjectUrls(false);
  assert.deepEqual(h.revoked, [owned.localUrl]);
});

test('cancelled in-flight analysis keeps its URL lease until settling; old results cannot store or apply', async () => {
  const h = harness(), { c, no } = h, pending = deferred();
  const song = h.song(); c.localBeatAnalysis.song = song; c.localBeatAnalysis.audioUrl = song.localUrl;
  c.updateLocalBeatModal = no; c.setLocalBeatStatus = no; c.setDjModeActive = no; c.resetBeatCameraSync = no;
  c.analyzeAudioBeats = () => pending.promise;
  let stored = 0; c.storeLocalBeatEntry = () => stored++; c.applyLocalBeatMap = () => stored++;
  const work = c.startLocalBeatAnalysis('mr');
  c.localBeatAnalysis.active = false; c.localBeatAnalysis.token++; c.beatMapToken++; c.trackSwitchToken++;
  c.closeLocalBeatModal(); h.flush(); assert(!h.revoked.includes(song.localUrl));
  pending.resolve(map('obsolete')); await work; h.flush();
  assert.equal(stored, 0); assert(h.revoked.includes(song.localUrl));
  assert.equal(c.localBeatAnalysis.song, null); assert.equal(c.localBeatAnalysis.audioUrl, '');
});

test('analysis completion timer does not close a reopened modal', async () => {
  const h = harness(), { c, no } = h, song = h.song();
  c.localBeatAnalysis.song = song; c.localBeatAnalysis.audioUrl = song.localUrl;
  c.updateLocalBeatModal = no; c.setLocalBeatStatus = no; c.setDjModeActive = no; c.resetBeatCameraSync = no;
  c.analyzeAudioBeats = async () => map('done'); c.applyLocalBeatMap = no;
  await c.startLocalBeatAnalysis('mr');
  c.openLocalBeatModal(song, song.localUrl);
  let closed = 0; c.closeGsapModal = () => closed++;
  for (const [id, timer] of [...h.timers]) if (timer.ms === 900) { h.timers.delete(id); timer.fn(); }
  assert.equal(closed, 0); assert.equal(c.localBeatAnalysis.song, song);
});

test('pending and saved built-in playlists retain session audio, failed saves release it, page exit cleans owned URLs', async () => {
  const h = harness(), { c, no } = h, saving = deferred(), song = h.song();
  c.builtInPlaylistApiAvailable = () => true; c.applyBuiltInPlaylistSnapshot = no; c.builtInPlaylistErrorMessage = () => 'failed';
  c.window.desktopWindow = { addBuiltInPlaylistTrack: () => saving.promise };
  loadFunctions(c, builtinPath, ['addTrackToBuiltInPlaylist']);
  const result = c.addTrackToBuiltInPlaylist('saved', song); h.flush(); assert.equal(h.revoked.length, 0);
  saving.resolve({ ok: true }); await result; h.flush(); assert.equal(h.revoked.length, 0);
  const failed = h.song('failed.mp3'); c.window.desktopWindow.addBuiltInPlaylistTrack = async () => ({ ok: false });
  assert.equal(await c.addTrackToBuiltInPlaylist('saved', failed), false); h.flush();
  assert(h.revoked.includes(failed.localUrl)); assert(!h.revoked.includes(song.localUrl));
  h.handlers.pagehide({ persisted: true }); assert(!h.revoked.includes(song.localUrl));
  h.handlers.pagehide({ persisted: false }); assert(h.revoked.includes(song.localUrl)); assert.equal(h.timers.size, 0);
});

test('create-playlist await retains its initial track before the add-track request starts', async () => {
  const h = harness(), { c, no } = h, creating = deferred(), song = h.song();
  c.builtInPlaylistApiAvailable = () => true; c.applyBuiltInPlaylistSnapshot = no; c.builtInPlaylistErrorMessage = () => 'failed';
  c.window.desktopWindow = { createBuiltInPlaylist: () => creating.promise, addBuiltInPlaylistTrack: async () => ({ ok: true }) };
  loadFunctions(c, builtinPath, ['createBuiltInPlaylist', 'addTrackToBuiltInPlaylist']);
  const work = c.createBuiltInPlaylist('new', song); h.flush(); assert(!h.revoked.includes(song.localUrl));
  creating.resolve({ ok: true, playlist: { id: 'new' } }); await work; h.flush();
  assert(!h.revoked.includes(song.localUrl)); assert.equal(c.localAudioObjectUrlRegistry()[song.localUrl].readers, 0);
});

test('automatic beatmap LRU bounds 500 analyses while preserving all preferences and active maps', () => {
  const h = harness(), { c } = h, pinned = map('playing');
  c.currentBeatMap = pinned; c.storeLocalBeatEntry('playing', 'mr', pinned, null, { automatic: true });
  for (let i = 0; i < 500; i++) c.storeLocalBeatEntry('auto-' + i, 'mr', map(String(i)), null, { automatic: true });
  assert.equal(Object.keys(c.localBeatMapCache).length, 12); assert.equal(c.localBeatMapCache.playing.mr, pinned);
  assert.equal(Object.keys(c.localBeatMapPrefs).length, 501);
  assert.equal(pinned.cameraBeats[0].time, 1);
});

test('LRU reads refresh recency, memory byte budget evicts only unpinned generated maps', () => {
  const { c } = harness();
  for (let i = 0; i < 12; i++) c.storeLocalBeatEntry('auto-' + i, 'mr', map(String(i)), null, { automatic: true });
  c.getLocalBeatEntry('auto-0', 'mr'); c.storeLocalBeatEntry('auto-12', 'mr', map('12'), null, { automatic: true });
  assert(c.localBeatMapCache['auto-0']); assert.equal(c.localBeatMapCache['auto-1'], undefined);
  c.localBeatMapCache = {};
  c.storeLocalBeatEntry('a', 'mr', map('a', 5 * 1024 * 1024), null, { automatic: true });
  c.storeLocalBeatEntry('b', 'dj', map('b', 5 * 1024 * 1024), null, { automatic: true });
  assert.equal(c.localBeatMapCache.a, undefined); assert(c.localBeatMapCache.b);
});

test('unknown/edited maps survive memory and quota reductions with extra fields and mode preferences intact', () => {
  const h = harness(), { c } = h;
  const edited = map('user'); edited.userEdits = { offset: 3, notes: ['keep this'] };
  c.storeLocalBeatEntry('edited', 'mr', edited);
  for (let i = 0; i < 25; i++) c.storeLocalBeatEntry('auto-' + i, 'mr', map(String(i)), null, { automatic: true });
  assert.equal(c.localBeatMapCache.edited.mr, edited);
  const previous = c.localBeatMapCache['auto-24'].mr;
  c.storeLocalBeatEntry('auto-24', 'mr', previous); // Explicit caller save invalidates generated provenance.
  for (let i = 25; i < 45; i++) c.storeLocalBeatEntry('auto-' + i, 'mr', map(String(i)), null, { automatic: true });
  assert.equal(c.localBeatMapCache['auto-24'].mr, previous);
  let attempts = 0;
  c.localStorage.setItem = (key, value) => { if (key === 'maps' && ++attempts < 4) throw new Error('quota'); h.storage.set(key, value); };
  assert.equal(c.saveLocalBeatMapCache(), true); assert.equal(attempts, 4);
  const reloaded = c.readLocalBeatMapCache();
  assert.equal(reloaded.edited.mr.userEdits.offset, 3); assert.equal(reloaded.edited.mr.label, 'user');
  assert(reloaded['auto-24']); assert.equal(c.localBeatMapPrefs.edited, 'mr');
  assert.equal(Object.keys(reloaded).length, 5); // 2 preserved entries + 3 automatic.
});

test('automatic provenance round-trips through disk packing; legacy records remain protected', () => {
  const h = harness(), { c } = h, generated = map('auto');
  c.storeLocalBeatEntry('auto', 'mr', generated, null, { automatic: true });
  const disk = c.packLocalBeatMap(generated), restored = c.unpackLocalBeatMap(disk);
  assert.equal(disk.automaticLocalAnalysis, true); assert(c.generatedLocalBeatMaps().has(restored));
  h.storage.set('maps', JSON.stringify({ legacy: { updatedAt: 1, mr: { v: 1, cameraBeats: [[1, 0.5]] } } }));
  c.localBeatMapCache = c.readLocalBeatMapCache();
  for (let i = 0; i < 30; i++) c.storeLocalBeatEntry('new-' + i, 'mr', map(String(i)), null, { automatic: true });
  assert(c.localBeatMapCache.legacy); assert.equal(Object.keys(c.localBeatMapCache).length, 13);
});

test('duplicate playlist add preserves the saved URL but does not pin a newly reimported unused URL', async () => {
  const h = harness(), { c, no } = h, saved = h.song(), duplicate = h.song();
  c.builtInPlaylistApiAvailable = () => true; c.applyBuiltInPlaylistSnapshot = no;
  c.window.desktopWindow = { addBuiltInPlaylistTrack: async () => ({ ok: true, duplicate: false }) };
  loadFunctions(c, builtinPath, ['addTrackToBuiltInPlaylist']);
  await c.addTrackToBuiltInPlaylist('saved', saved);
  c.window.desktopWindow.addBuiltInPlaylistTrack = async () => ({ ok: true, duplicate: true });
  assert.equal(await c.addTrackToBuiltInPlaylist('saved', duplicate), 'duplicate'); h.flush();
  assert(!h.revoked.includes(saved.localUrl)); assert(h.revoked.includes(duplicate.localUrl));
});

test('a newer edit wins over a same-track pending analysis and stays non-evictable', async () => {
  const h = harness(), { c, no } = h, pending = deferred(), song = h.song();
  c.localBeatAnalysis.song = song; c.localBeatAnalysis.audioUrl = song.localUrl;
  c.updateLocalBeatModal = no; c.setLocalBeatStatus = no; c.setDjModeActive = no; c.resetBeatCameraSync = no;
  c.analyzeAudioBeats = () => pending.promise; let applied;
  c.applyLocalBeatMap = (s, mode, value) => { applied = value; };
  const work = c.startLocalBeatAnalysis('mr'), edited = map('newer edit');
  c.storeLocalBeatEntry(song.localKey, 'mr', edited);
  pending.resolve(map('older analysis')); await work;
  assert.equal(applied, edited); assert.equal(c.getLocalBeatEntry(song.localKey, 'mr'), edited);
  assert.equal(c.isAutomaticLocalBeatMap(c.localBeatMapCache[song.localKey], 'mr'), false);
});

test('a newer edit wins over delayed disk restoration for the same track', async () => {
  const h = harness(), { c } = h, pending = deferred(), song = h.song();
  c.currentLocalSong = song; c.readBeatDiskCache = () => pending.promise; let applied;
  c.applyLocalBeatMap = (s, mode, value) => { applied = value; };
  c.prepareLocalBeatAnalysis(song, song.localUrl);
  const edited = map('disk should not overwrite'); c.storeLocalBeatEntry(song.localKey, 'mr', edited);
  pending.resolve(map('disk')); await settle();
  assert.equal(applied, edited); assert.equal(c.getLocalBeatEntry(song.localKey, 'mr'), edited);
});

test('real queue removal/clear hooks release only detached URLs and keep the selected paused track', async () => {
  const h = harness(), { c, no } = h;
  ['cancelPlaylistQueueHydration', 'cancelSourceFallbackRecovery', 'clearAlbumGaplessPreload', 'resetCuefieldAutoMix',
    'clearPlaybackResumeWatchdogs', 'cancelBeatAnalysisTimer', 'cancelBeatPrefetchTimer', 'cancelDjBeatAnalysisTimer',
    'finalizeListenSession', 'setPlayIcon', 'hideLoading', 'updateCustomCoverButton', 'updateCustomLyricControls',
    'saveLastPlaybackSnapshot'].forEach(name => { c[name] = no; });
  c.playbackResumeRecovery = { serial: 0, pending: false }; c.LAST_PLAYBACK_STORE_KEY = 'last'; c.localStorage.removeItem = no;
  c.pauseCurrentAudioForTrackSwitch = () => { c.audio.paused = true; };
  c.audio.removeAttribute = () => { c.audio.src = ''; c.audio.currentSrc = ''; }; c.audio.load = no;
  loadFunctions(c, 'public/js/modules/05-playback/14-player-controls.js', ['clearQueue', 'removeFromQueue']);
  const first = h.song('first.mp3'), second = h.song('second.mp3'), third = h.song('third.mp3');
  c.playQueue = [first, second, third]; c.currentIdx = 1; c.currentLocalSong = second; c.audio.src = second.localUrl;
  await c.removeFromQueue(0); h.flush(); assert(h.revoked.includes(first.localUrl)); assert(!h.revoked.includes(second.localUrl));
  c.audio.paused = true; c.audio.__mineradioPlaybackStartedToken = c.trackSwitchToken;
  c.playQueueAt = async (index, opts) => {
    assert.equal(opts.selectOnly, true); c.currentLocalSong = c.playQueue[index]; c.audio.removeAttribute('src');
    c.scheduleLocalAudioObjectUrlSweep();
  };
  await c.removeFromQueue(0); h.flush(); assert(h.revoked.includes(second.localUrl)); assert(!h.revoked.includes(third.localUrl));
  assert.equal(c.audio.paused, true); c.clearQueue(); h.flush();
  assert(h.revoked.includes(third.localUrl)); assert.equal(Object.keys(c.localAudioObjectUrlRegistry()).length, 0);
});

test('large generated current/modal maps remain pinned over budget and trim once both owners release', () => {
  const { c } = harness(); const playing = map('playing', 9 * 1024 * 1024), analyzing = map('analyzing', 9 * 1024 * 1024);
  c.currentBeatMap = playing; c.localBeatAnalysis.song = { localKey: 'modal' };
  c.storeLocalBeatEntry('playing', 'mr', playing, null, { automatic: true });
  c.storeLocalBeatEntry('modal', 'dj', analyzing, null, { automatic: true });
  assert.equal(c.localBeatMapCache.playing.mr, playing); assert.equal(c.localBeatMapCache.modal.dj, analyzing);
  c.currentBeatMap = null; c.closeLocalBeatModal();
  assert.equal(Object.keys(c.localBeatMapCache).length, 0);
});
