'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
async function scenario(qishui) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const no = () => {}, song = { name: 'B', provider: qishui ? 'qishui' : 'netease' }, candidate = { name: 'B-full', provider: 'qq' };
  const c = vm.createContext({ playQueue: [{ name: 'A' }, song, { name: 'C' }], currentIdx: 1, trackSwitchToken: 7,
    queueLogicalOrderState: { queue: null, next: 0 }, document: { getElementById: () => null }, miniQueueOpen: false,
    playbackRestrictionCategory: () => 'url_unavailable', playbackProviderLabel: () => 'fixture', alternatePlaybackProviders: () => ['qq'],
    ensureSourceFallbackRecovery: () => ({}), sourceFallbackQueuePlaybackOptions: () => ({}), sourceFallbackRecoveryCanContinue: () => true,
    beginSourceFallbackProviderAttempt: () => true, sourceFallbackProviderTitle: () => 'QQ', sourceFallbackBudgetTimeoutResult: {},
    searchAlternatePlatformSong: () => gate, resolveAlbumGaplessPlaybackData: async () => ({ url: 'fixture:full' }), awaitSourceFallbackBudget: p => p,
    hydrateCustomCover: s => s, cloneSong: s => ({ ...s }), safeRenderQueuePanel: no, safeShelfRebuild: no, saveLastPlaybackSnapshot: no,
    queueItemKey: s => s.name, songProviderKey: s => s.provider, normalizePlaybackProvider: p => p, completeSourceFallbackRecovery: no,
    showSourceFallbackNotice: no, endQishuiPlaybackProgress: no, updateQishuiPlaybackProgress: no,
    songDurationSecondsForMatch: () => 180, qishuiFullSourceKey: () => 'B', qishuiTrialUpgradeMisses: {}, QISHUI_TRIAL_UPGRADE_BUDGET_MS: 6000,
    QISHUI_TRIAL_UPGRADE_MISS_TTL_MS: 1000, takeQishuiFullSourcePrefetch: () => null, findQishuiFullSourceCandidate: () => gate,
    rememberQishuiFullSource: no, sourceFallbackSongKey: s => s.name, console });
  c.playQueueAt = async index => { c.currentIdx = index; c.trackSwitchToken++; return true; };
  loadFunctions(c, 'public/js/modules/05-playback/10-queue-actions.js', ['syncQueueLogicalOrder', 'queueLogicalEntries', 'moveQueueLogicalEntry', 'moveQueueIndex']);
  const file = 'public/js/modules/05-playback/11-provider-fallback.js';
  loadFunctions(c, file, ['tryAutoPlaybackFallback', 'playQishuiFullSourceCandidate', 'tryQishuiTrialFullSourceUpgrade']);
  const job = qishui ? c.tryQishuiTrialFullSourceUpgrade(song, { trial: true, fullDuration: 180 }, 1, 7, {}) : c.tryAutoPlaybackFallback(song, {}, 1, 7, {});
  c.moveQueueIndex(1, 0);
  release(qishui ? { candidate, provider: 'qq', data: { url: 'fixture:full' }, resolvedAt: Date.now() } : candidate);
  await job;
  return { qishui, queue: Array.from(c.playQueue, song => song.name), currentIdx: c.currentIdx };
}
if (require.main === module) (async () => { for (const qishui of [false, true]) console.log('PBL-09 fallback reorder', JSON.stringify(await scenario(qishui))); })().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
