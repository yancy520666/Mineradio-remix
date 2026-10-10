'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(interruption) {
  const no = () => {}, original = { name: 'A', provider: 'netease' }, searches = [], effects = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const c = vm.createContext({ console, playQueue: [original], currentIdx: 0, trackSwitchToken: 1,
    miniQueueOpen: false, playbackRestrictionCategory: () => 'url_unavailable', playbackProviderLabel: () => 'fixture',
    alternatePlaybackProviders: () => ['qq', 'kugou'], ensureSourceFallbackRecovery: () => ({}),
    sourceFallbackQueuePlaybackOptions: () => ({}), sourceFallbackRecoveryCanContinue: () => true,
    beginSourceFallbackProviderAttempt: () => true, sourceFallbackProviderTitle: p => p, sourceFallbackBudgetTimeoutResult: {},
    searchAlternatePlatformSong: async (_song, p) => { searches.push(p); return { name: p, provider: p }; },
    resolveAlbumGaplessPlaybackData: async () => ({ url: 'fake:audio' }), awaitSourceFallbackBudget: p => p,
    hydrateCustomCover: s => s, safeRenderQueuePanel: no, safeShelfRebuild: no, songProviderKey: s => s.provider,
    sourceFallbackSongKey: s => s.name, document: { getElementById: () => null }, completeSourceFallbackRecovery: no,
    showSourceFallbackNotice: no, skipFailedQueueItem: async () => { effects.push('skip'); return false; }
  });
  loadFunctions(c, 'public/js/modules/05-playback/11-provider-fallback.js', ['tryAutoPlaybackFallback', 'restoreSourceFallbackQueueItem']);
  c.playQueueAt = async (idx, opts) => {
    c.trackSwitchToken++;
    const candidateProvider = c.playQueue[idx].provider;
    const result = await c.tryAutoPlaybackFallback(c.playQueue[idx], {}, idx, c.trackSwitchToken, opts);
    if (interruption && candidateProvider === 'qq') await gate;
    return result;
  };
  const pending = c.tryAutoPlaybackFallback(original, {}, 0, 1, {});
  if (interruption) {
    await new Promise(setImmediate);
    if (interruption === 'new-selection') { c.playQueue[0] = { name: 'user-choice', provider: 'netease' }; c.trackSwitchToken++; }
    if (interruption === 'same-original-new-token') c.trackSwitchToken++;
    if (interruption === 'new-queue-same-entry') c.playQueue = [original];
    release();
  }
  return { result: await pending, searches, effects, queue: Array.from(c.playQueue, s => s.name) };
}
if (require.main === module) (async () => { for (const kind of [undefined,'new-selection','same-original-new-token','new-queue-same-entry']) console.log(JSON.stringify({ kind: kind || 'owned-rollback', ...await scenario(kind) })); })().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { scenario };
