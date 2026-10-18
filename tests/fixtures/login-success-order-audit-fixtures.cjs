'use strict';
const vm = require('node:vm');
const { loadFunctions } = require('../../tests/helpers/classic-functions');
const loginFile = 'public/js/modules/08-account/03-login-modal-flows.js';
function loadLogin(c, names, sourceOverride) {
  if (!sourceOverride) return loadFunctions(c, loginFile, names);
  for (const name of names) {
    const start = sourceOverride.indexOf('function ' + name + '('), body = sourceOverride.indexOf('{', start);
    if (start < 0) throw new Error('missing snapshot function ' + name);
    let depth = 0, end = body;
    for (; end < sourceOverride.length; end++) { if (sourceOverride[end] === '{') depth++; if (sourceOverride[end] === '}' && --depth === 0) break; }
    vm.runInContext(sourceOverride.slice(sourceOverride.slice(start - 6, start) === 'async ' ? start - 6 : start, end + 1), c);
  }
}
async function scenario(provider, mode, sourceOverride) {
  const no = () => {}, effects = [], homeJobs = [], timers = [];
  let releaseHome;
  const homeGate = new Promise(resolve => { releaseHome = resolve; });
  const statusName = provider === 'netease' ? 'loginStatus' : provider + 'LoginStatus';
  const c = vm.createContext({ console: { warn() {} }, providerAuthEpochs: {}, loginProvider: provider, loginRefreshRequestSeq: 0,
    loginAttemptCurrent: null, loginStatus: { loggedIn: true, userId: provider === 'netease' ? 'A' : 'other' }, qqLoginStatus: { loggedIn: true, userId: provider === 'qq' ? 'A' : 'other' },
    kugouLoginStatus: { loggedIn: true, userId: provider === 'kugou' ? 'A' : 'other' }, qishuiLoginStatus: { loggedIn: false }, spotifyLoginStatus: { loggedIn: false },
    neteaseWebLoginBusy: false, qqWebLoginBusy: false, kugouWebLoginBusy: false, qqCookieBusy: false, kugouCookieBusy: false,
    neteaseManualCookieOpen: false, qqManualCookieOpen: false, kugouManualCookieOpen: false, activeAccountProvider: provider,
    document: { getElementById: () => null }, qrKey: 'fake', stopQrPoll: no, updateLoginProviderUi: no, inlineLoginQrSupported: () => false,
    window: { desktopWindow: { isDesktop: true, openNeteaseMusicLogin: no, openQQMusicLogin: no, openKugouMusicLogin: no }, dispatchEvent: no },
    CustomEvent: function () {}, isLoginAttemptCurrent: () => true, renderUserBtn: no, auditProviderVipState: no,
    openProviderLoginWithInlineQr: async () => ({ ok: true, cookie: 'fixture-cookie', partial: false }),
    normalizeQQLoginStatus: x => x, normalizeKugouLoginStatus: x => x, hasPlatformLogin: () => true, normalizeLoginProviderKey: p => p,
    markLoginWorkflowConnected: p => effects.push({ kind: 'connected', provider: p, epoch: c.providerAuthEpoch(p) }), updateLoginNodeGraphUi: no,
    refreshUserPlaylists: () => { effects.push({ kind: 'catalog', epoch: c.providerAuthEpoch(provider) }); return Promise.resolve(); },
    scheduleLoginAttemptClose: no, showToast: no, setManualCookieOpenForProvider: no, qqLoginStatusText: () => 'ready',
    apiJson: url => url.includes('/discover/home') ? homeGate : Promise.resolve({ loggedIn: true, userId: 'B', playbackKeyReady: true }),
    homeDiscoverState: { songs: [], playlists: [], podcasts: [], loading: false, loaded: false }, homeDiscoverToken: 0,
    renderHomeDiscover: no, hasAnyPlatformLogin: () => true, cloneSong: x => x, userPlaylists: [],
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, closeLoginModal: no, playQueue: [], playlist: [] });
  c.platformStatus = p => c[p === 'netease' ? 'loginStatus' : p + 'LoginStatus'];
  loadFunctions(c, 'public/js/modules/08-account/02-login-status.js', ['providerSessionNeedsValidation', 'providerSessionPendingText']);
  loadFunctions(c, loginFile, ['showPendingProviderLogin']);
  loadLogin(c, ['providerAuthEpoch', 'invalidateProviderAuthSession', 'markProviderLoginConnected'], sourceOverride);
  c.beginRendererLoginAttempt = async p => { c.invalidateProviderAuthSession(p); return c.loginAttemptCurrent = { id: 'fixture-attempt' }; };
  loadFunctions(c, 'public/js/modules/05-playback/03-home-discover-weather.js', ['homeDiscoverAuthKey', 'loadHomeDiscover']);
  const baseLoadHome = c.loadHomeDiscover;
  c.loadHomeDiscover = force => { effects.push({ kind: 'home', epoch: c.providerAuthEpoch(provider) }); const job = baseLoadHome(force); homeJobs.push(job); return job; };
  const method = mode === 'cookie' ? (provider === 'netease' ? 'submitNeteaseCookieLogin' : 'submitQQCookieLogin')
    : mode === 'qr' ? 'checkQr' : provider === 'netease' ? 'openNeteaseWebLogin' : provider === 'qq' ? 'openQQWebLogin' : 'openKugouWebLogin';
  loadLogin(c, [method], sourceOverride);
  if (mode === 'qr') {
    c.document.getElementById = () => ({}); c.loginRefreshRequestSeq = 1; c.loginAttemptCurrent = { id: 'fixture-attempt' };
    c.apiJson = url => url.includes('/login/qr/check') ? Promise.resolve({ code: 803, loggedIn: true, userId: 'B' })
      : url.includes('/discover/home') ? homeGate : Promise.resolve({ loggedIn: true, userId: 'B' });
  }
  await c[method]('fixture-cookie');
  if (mode === 'qr') await timers[0].fn();
  releaseHome({ loggedIn: true, dailySongs: [{ id: 'B-daily' }] });
  await Promise.all(homeJobs);
  return { provider, mode, userId: c[statusName].userId, epoch: c.providerAuthEpoch(provider), effects,
    loaded: c.homeDiscoverState.loaded, songs: Array.from(c.homeDiscoverState.songs, x => x.id), delays: timers.map(t => t.ms) };
}
if (require.main === module) (async () => { for (const p of ['netease','qq','kugou']) for (const mode of ['web','cookie']) console.log(JSON.stringify(await scenario(p,mode))); console.log(JSON.stringify(await scenario('netease','qr'))); })().catch(e => { console.error(e); process.exitCode=1; });
module.exports = { scenario };
