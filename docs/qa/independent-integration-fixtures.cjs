'use strict';
// Read-only renderer function checks. All responses, timers, and accounts are fake.
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
const no = () => {};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function qishuiStatusAcrossQr(outcome = 'success') {
  const gate = deferred(), timers = [], effects = [], events = [];
  const c = vm.createContext({ console: { warn() {} }, Date,
    providerAuthEpochs: {}, qishuiLoginStatus: { loggedIn: true, userId: 'A' }, qishuiLoginWasLoggedIn: true,
    loginProvider: 'qishui', qrKey: 'fake-qr', qrPollTimer: 0, qishuiQrPollGeneration: 0, qishuiQrPollBusy: false,
    normalizeQishuiLoginStatus: x => x, auditProviderVipState: no, renderUserBtn: no,
    markLoginWorkflowConnected: p => effects.push('connected:' + p),
    hasPlatformLogin: () => true, userPlaylists: [{ provider: 'qishui' }], activeAccountProvider: 'qishui',
    apiJson: url => url.includes('/login/check') ? Promise.resolve({ loggedIn: true, userId: 'B' }) : gate.promise,
    homeDiscoverState: { loaded: true }, showToast: no, refreshUserPlaylists: async () => {}, loadHomeDiscover: no,
    document: { getElementById: () => null }, window: { dispatchEvent: event => events.push({ type: event.type, userId: c.qishuiLoginStatus.userId }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: (_fn, ms) => { timers.push(ms); return timers.length; }, clearTimeout: no, clearInterval: no,
    closeLoginModal: no
  });
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js',
    ['providerAuthEpoch', 'invalidateProviderAuthSession', 'stopQrPoll', 'scheduleQishuiQrPoll', 'pollQishuiQr']);
  loadFunctions(c, 'public/js/modules/08-account/02-login-status.js', ['refreshQishuiLoginStatus', 'providerSessionNeedsValidation', 'providerSessionPendingText']);
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js', ['showPendingProviderLogin']);
  const statusRead = c.refreshQishuiLoginStatus();
  await c.pollQishuiQr(0);
  if (outcome === 'error') gate.reject(new Error('fake old status failure'));
  else gate.resolve({ loggedIn: true, userId: 'A' });
  await statusRead;
  return { outcome, status: c.qishuiLoginStatus, epoch: c.providerAuthEpoch('qishui'),
    qrGeneration: c.qishuiQrPollGeneration, timers, effects, events };
}
async function catalogAccountChangesDuringAwait(outcome = 'success') {
  const gate = deferred();
  let rows = [{ id: 'A-page1', provider: 'qishui' }];
  const state = { loading: false, hasMore: true, nextOffset: 0, loaded: 1, authEpoch: 0,
    accountKey: JSON.stringify([true, 'A']), replaceOnFirstPage: true };
  const c = vm.createContext({ console: { warn() {} }, providerAuthEpoch: () => 0,
    qishuiLoginStatus: { loggedIn: true, userId: 'A' }, loginStatus: { loggedIn: false }, qqLoginStatus: { loggedIn: false },
    kugouLoginStatus: { loggedIn: false }, spotifyLoginStatus: { loggedIn: false },
    playlistCatalogSyncState: { token: 1, providers: { qishui: state } }, PLAYLIST_CATALOG_FIRST_PAGE_SIZE: 50,
    PLAYLIST_CATALOG_BACKGROUND_PAGE_SIZE: 50, playlistCatalogPageUrl: () => '/fake', apiJson: () => gate.promise,
    playlistCatalogProviderArray: () => rows, setPlaylistCatalogProviderArray: (_p, next) => { rows = next; },
    rebuildUserPlaylistsFromCatalog: no, renderUserPlaylistsList: no, isPlaylistPanelVisibleForRender: () => false
  });
  loadFunctions(c, 'public/js/modules/06-lyrics/01-playlist-panel-shell.js',
    ['playlistCatalogProviderLoggedIn', 'playlistCatalogAccountKey', 'mergePlaylistCatalogRows', 'loadPlaylistCatalogProviderPage']);
  const task = c.loadPlaylistCatalogProviderPage('qishui', 'independent-fake');
  c.qishuiLoginStatus = { loggedIn: true, userId: 'B' };
  if (outcome === 'error') gate.reject(new Error('fake old page failure'));
  else gate.resolve({ playlists: [{ id: 'A-private-page' }], hasMore: false });
  return { outcome, committed: await task, rows: Array.from(rows, x => x.id), current: c.qishuiLoginStatus.userId,
    storedAccountKey: state.accountKey, error: state.error || '', loading: state.loading };
}
async function fallbackCandidateRollsBack(supersede = '') {
  const original = { name: 'A', provider: 'netease' }, searches = [], effects = [];
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
  loadFunctions(c, 'public/js/modules/05-playback/11-provider-fallback.js',
    ['tryAutoPlaybackFallback', 'restoreSourceFallbackQueueItem']);
  c.playQueueAt = async (idx, opts) => {
    c.trackSwitchToken++;
    const result = await c.tryAutoPlaybackFallback(c.playQueue[idx], { reason: 'fake media rejected' }, idx, c.trackSwitchToken, opts);
    if (supersede === 'token') c.trackSwitchToken++;
    if (supersede === 'queue') c.playQueue = [original];
    if (supersede === 'entry') c.playQueue[0] = { ...original };
    if (supersede === 'selection') { c.playQueue.push({ name: 'user-selected' }); c.currentIdx = 1; }
    return result;
  };
  const result = await c.tryAutoPlaybackFallback(original, {}, 0, 1, {});
  return { supersede, result, searches, effects, queue: Array.from(c.playQueue, x => x.name) };
}
async function neteaseFirstQrCommit() {
  const gate = deferred(), timers = [], qrUi = {};
  const c = vm.createContext({ console: { warn() {} }, providerAuthEpochs: {}, loginStatus: { loggedIn: true, userId: 'A' },
    loginStatusChecked: false, loginStatusCheckFailed: false, loginPresenceState: { netease: { rejected: 0 } },
    loginProvider: 'netease', qrKey: 'fake-qr', loginRefreshRequestSeq: 1, loginAttemptCurrent: { id: 'fake-attempt' },
    isLoginAttemptCurrent: () => true, stopQrPoll: no,
    apiJson: url => url.includes('/login/qr/check') ? Promise.resolve({ code: 803, loggedIn: true, userId: 'B' }) : gate.promise,
    document: { getElementById: () => qrUi }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    renderUserBtn: no, auditProviderVipState: no, hasPlatformLogin: () => true, activeAccountProvider: 'netease',
    homeDiscoverState: {}, refreshUserPlaylists: no, loadHomeDiscover: no, syncLikeStatusForSongs: no,
    playQueue: [], playlist: [], window: { dispatchEvent: no }, markLoginWorkflowConnected: no,
    updateLoginNodeGraphUi: no, normalizeLoginProviderKey: p => p, closeLoginModal: no, showToast: no });
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js',
    ['providerAuthEpoch', 'invalidateProviderAuthSession', 'markProviderLoginConnected', 'checkQr']);
  loadFunctions(c, 'public/js/modules/08-account/02-login-status.js', ['providerSessionNeedsValidation', 'providerSessionPendingText']);
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js', ['showPendingProviderLogin']);
  loadFunctions(c, 'public/js/modules/08-account/02-login-status.js', ['refreshLoginStatus']);
  const oldRead = c.refreshLoginStatus();
  await c.checkQr();
  const committed = c.loginStatus.userId;
  gate.resolve({ loggedIn: true, userId: 'A' });
  await oldRead;
  return { committed, afterOldRead: c.loginStatus.userId, epoch: c.providerAuthEpoch('netease'), delays: timers.map(t => t.ms) };
}
async function homeRefreshBeforeLoginEpoch() {
  // Negative control: deliberately retain the obsolete load-then-invalidate
  // sequence. Correct ownership must reject this result; current call sites
  // are verified separately by neteaseWebLoginHomeRefresh.
  const gate = deferred();
  const c = vm.createContext({ console: { warn() {} }, providerAuthEpochs: {},
    homeDiscoverState: { songs: [], playlists: [], podcasts: [], loaded: false, loading: false }, homeDiscoverToken: 0,
    platformStatus: p => p === 'netease' ? { loggedIn: true, userId: 'B' } : { loggedIn: false },
    renderHomeDiscover: no, apiJson: () => gate.promise, hasAnyPlatformLogin: () => true, cloneSong: x => x,
    userPlaylists: [], window: { dispatchEvent: no }, normalizeLoginProviderKey: p => p, hasPlatformLogin: () => true,
    markLoginWorkflowConnected: no, updateLoginNodeGraphUi: no });
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js',
    ['providerAuthEpoch', 'invalidateProviderAuthSession', 'markProviderLoginConnected']);
  loadFunctions(c, 'public/js/modules/05-playback/03-home-discover-weather.js', ['homeDiscoverAuthKey', 'loadHomeDiscover']);
  const home = c.loadHomeDiscover(true);
  c.markProviderLoginConnected('netease', { loggedIn: true });
  gate.resolve({ loggedIn: true, dailySongs: [{ id: 'B-daily' }] });
  await home;
  return { loaded: c.homeDiscoverState.loaded, songs: Array.from(c.homeDiscoverState.songs, x => x.id), loading: c.homeDiscoverState.loading };
}
async function neteaseWebLoginHomeRefresh() {
  const gate = deferred();
  let homeTask;
  const c = vm.createContext({ console: { warn() {} }, providerAuthEpochs: {}, loginStatus: { loggedIn: true, userId: 'A' },
    homeDiscoverState: { songs: [], playlists: [], podcasts: [], loaded: false, loading: false }, homeDiscoverToken: 0,
    renderHomeDiscover: no, apiJson: url => url.includes('/login/cookie') ? Promise.resolve({ loggedIn: true, userId: 'B' }) : gate.promise,
    hasAnyPlatformLogin: () => true, cloneSong: x => x, userPlaylists: [], neteaseWebLoginBusy: false,
    document: { getElementById: () => ({}) }, window: { dispatchEvent: no, desktopWindow: { isDesktop: true, openNeteaseMusicLogin: no } },
    normalizeLoginProviderKey: p => p, hasPlatformLogin: () => true, markLoginWorkflowConnected: no, updateLoginNodeGraphUi: no,
    stopQrPoll: no, qrKey: '', loginRefreshRequestSeq: 0, updateLoginProviderUi: no, inlineLoginQrSupported: () => false,
    openProviderLoginWithInlineQr: async () => ({ ok: true, cookie: 'fake-cookie' }), isLoginAttemptCurrent: () => true,
    renderUserBtn: no, refreshUserPlaylists: no, scheduleLoginAttemptClose: no });
  c.platformStatus = p => p === 'netease' ? c.loginStatus : { loggedIn: false };
  c.beginRendererLoginAttempt = async () => (c.loginAttemptCurrent = { id: 'fake-attempt' });
  loadFunctions(c, 'public/js/modules/08-account/03-login-modal-flows.js',
    ['providerAuthEpoch', 'invalidateProviderAuthSession', 'markProviderLoginConnected', 'openNeteaseWebLogin']);
  loadFunctions(c, 'public/js/modules/05-playback/03-home-discover-weather.js', ['homeDiscoverAuthKey', 'loadHomeDiscover']);
  const loadHome = c.loadHomeDiscover;
  c.loadHomeDiscover = force => (homeTask = loadHome(force));
  await c.openNeteaseWebLogin();
  gate.resolve({ loggedIn: true, dailySongs: [{ id: 'B-daily' }] });
  await homeTask;
  return { loaded: c.homeDiscoverState.loaded, songs: Array.from(c.homeDiscoverState.songs, x => x.id), loading: c.homeDiscoverState.loading,
    current: c.loginStatus.userId, epoch: c.providerAuthEpoch('netease') };
}
if (require.main === module) (async () => {
  for (const outcome of ['success', 'error']) {
    console.log('qishuiStatusAcrossQr', JSON.stringify(await qishuiStatusAcrossQr(outcome)));
    console.log('catalogAccountChangesDuringAwait', JSON.stringify(await catalogAccountChangesDuringAwait(outcome)));
  }
  console.log('fallbackCandidateRollsBack', JSON.stringify(await fallbackCandidateRollsBack()));
  for (const supersede of ['token', 'queue', 'entry', 'selection']) {
    console.log('fallbackCandidateRollsBack', JSON.stringify(await fallbackCandidateRollsBack(supersede)));
  }
  console.log('neteaseFirstQrCommit', JSON.stringify(await neteaseFirstQrCommit()));
  console.log('homeRefreshBeforeLoginEpoch', JSON.stringify(await homeRefreshBeforeLoginEpoch()));
  console.log('neteaseWebLoginHomeRefresh', JSON.stringify(await neteaseWebLoginHomeRefresh()));
})().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { qishuiStatusAcrossQr, catalogAccountChangesDuringAwait, fallbackCandidateRollsBack,
  neteaseFirstQrCommit, homeRefreshBeforeLoginEpoch, neteaseWebLoginHomeRefresh };
