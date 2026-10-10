// Saved account state remains usable during outages; this is presentation evidence,
// never a replacement for per-track rights or an audio playback check.
function providerSessionNeedsValidation(info) {
  return !!(info && (info.unverified || info.pendingProfile || info.statusPending || info.sessionRejected));
}
function providerSessionPendingText(provider, info) {
  return '暂时无法确认登录，请刷新状态';
}

function readProviderVipAuditState() {
  try {
    var raw = localStorage.getItem(PROVIDER_VIP_AUDIT_STORE_KEY) || '{}';
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}
function writeProviderVipAuditState(state) {
  try { localStorage.setItem(PROVIDER_VIP_AUDIT_STORE_KEY, JSON.stringify(state || {})); } catch (e) { }
}
var QQ_PLAYBACK_VIP_EVIDENCE_TTL_MS = 12 * 60 * 60 * 1000;
function qqPlaybackVipEvidenceUserKey(status) {
  return String(status && (status.userId || status.uin || status.uid || status.openId || status.id) || '').trim();
}
function readQQPlaybackVipEvidence() {
  try {
    var raw = localStorage.getItem(QQ_PLAYBACK_VIP_EVIDENCE_STORE_KEY) || '{}';
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}
function writeQQPlaybackVipEvidence(evidence) {
  try { localStorage.setItem(QQ_PLAYBACK_VIP_EVIDENCE_STORE_KEY, JSON.stringify(evidence || {})); } catch (e) { }
}
function clearQQPlaybackVipEvidence() {
  try { localStorage.removeItem(QQ_PLAYBACK_VIP_EVIDENCE_STORE_KEY); } catch (e) { }
}
function qqPlaybackVipEvidenceApplies(evidence, status) {
  if (!evidence || !status || !status.loggedIn) return false;
  var checkedAt = Number(evidence.checkedAt || evidence.vipCheckedAt || 0) || 0;
  if (!checkedAt || Date.now() - checkedAt > QQ_PLAYBACK_VIP_EVIDENCE_TTL_MS) return false;
  var evidenceUser = qqPlaybackVipEvidenceUserKey(evidence);
  var statusUser = qqPlaybackVipEvidenceUserKey(status);
  return !!(evidenceUser && statusUser && evidenceUser === statusUser);
}
function mergeQQPlaybackVipEvidence(status) {
  if (!status || !status.loggedIn) return status;
  var evidence = readQQPlaybackVipEvidence();
  if (!qqPlaybackVipEvidenceApplies(evidence, status)) return status;
  var svip = providerVipLevel('qq', status) === 'svip' || providerVipLevel('qq', evidence) === 'svip' || !!status.isSvip || !!evidence.isSvip;
  return Object.assign({}, status, {
    provider: 'qq',
    loggedIn: true,
    vipType: Math.max(Number(status.vipType || status.vip_type || 0) || 0, Number(evidence.vipType || evidence.vip_type || 0) || 0, 1),
    svipType: Math.max(Number(status.svipType || status.svip_type || 0) || 0, Number(evidence.svipType || evidence.svip_type || 0) || 0),
    vipLevel: svip ? 'svip' : 'vip',
    isVip: true,
    isSvip: svip,
    playbackKeyReady: true,
    vipCheckedAt: Math.max(Number(status.vipCheckedAt || 0) || 0, Number(evidence.checkedAt || evidence.vipCheckedAt || 0) || 0),
    vipSource: evidence.vipSource || status.vipSource || 'qq-playback-evidence',
    vipProbeAvailable: true,
    membershipStale: false,
    authorizationIncomplete: false,
    vipSyncState: 'playback_evidence'
  });
}
function providerVipAuditSnapshot(provider, status) {
  status = status || {};
  var level = providerVipLevel(provider, status);
  return {
    provider: provider,
    loggedIn: !!status.loggedIn,
    userId: String(status.userId || status.uid || status.uin || status.openId || status.id || ''),
    vipLevel: level,
    isVip: level !== 'none',
    checkedAt: Date.now()
  };
}
function providerVipAuditLabel(provider, snapshot) {
  var meta = platformMeta(provider);
  var label = meta && meta.label || provider;
  var level = snapshot && snapshot.vipLevel === 'svip' ? 'SVIP' : 'VIP';
  return label + ' ' + level;
}
function providerVipAuditSameUser(previous, current) {
  if (!previous || !current) return true;
  if (!previous.userId || !current.userId) return true;
  return String(previous.userId) === String(current.userId);
}
function auditProviderVipState(provider, status) {
  if (!status) return;
  if (providerMembershipNeedsSync(provider, status)) return;
  var state = readProviderVipAuditState();
  var previous = state[provider] || null;
  var current = providerVipAuditSnapshot(provider, status);
  var sameUser = providerVipAuditSameUser(previous, current);
  if (previous && sameUser && previous.loggedIn && previous.isVip && current.loggedIn && !current.isVip) {
    var title = providerVipAuditLabel(provider, previous) + ' 状态掉了';
    var body = '当前显示为普通账号，部分歌曲可能只能试听。';
    if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice(title, body);
    else showToast(title);
  }
  if (previous && sameUser && previous.loggedIn && !previous.isVip && current.loggedIn && current.isVip) {
    var syncTitle = providerVipAuditLabel(provider, current) + ' 已同步';
    var syncBody = '已重新检查到当前账号会员状态，会员曲目会按新的平台权限继续尝试播放。';
    if (typeof showToast === 'function') showToast(syncTitle);
    else if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice(syncTitle, syncBody);
  }
  state[provider] = current;
  writeProviderVipAuditState(state);
}

// The login panel keeps a wire drawn for sessions connected in this window. When the
// platform ends the session elsewhere, drop that wire too so the panel shows it unplugged.
function forgetProviderLiveSession(provider) {
  if (typeof loginWorkflowVerifiedSession !== 'undefined' && loginWorkflowVerifiedSession) delete loginWorkflowVerifiedSession[provider];
}
function clearNeteaseSessionState() {
  neteasePlaylists = [];
  userPlaylists = (builtInPlaylists || []).concat(qqPlaylists || [], kugouPlaylists || [], qishuiPlaylists || []);
  playlistCatalogRevision += 1;
  myPodcastCollections = [];
  myPodcastItems = {};
  likedSongMap = {};
  updateLikeButtons();
}
async function refreshLoginStatus(force) {
  var authEpoch = typeof providerAuthEpoch === 'function' ? providerAuthEpoch('netease') : 0;
  try {
    var info = await apiJson('/api/login/status?t=' + Date.now() + (force === true ? '&fresh=1' : ''));
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('netease') !== authEpoch) return loginStatus;
    var neteaseWasLoggedIn = !!(loginStatus && loginStatus.loggedIn);
    loginStatusChecked = true;
    loginStatusCheckFailed = false;
    if (info && info.unverified && loginStatus && loginStatus.loggedIn) {
      info = Object.assign({}, loginStatus, { unverified: true, pendingProfile: true });
    }
    loginStatus = info || { loggedIn: false };
    loginPresenceState.netease.rejected = 0;
    auditProviderVipState('netease', loginStatus);
    if (loginStatus.loggedIn && !hasPlatformLogin(activeAccountProvider)) activeAccountProvider = 'netease';
    renderUserBtn();
    if (info && info.loggedIn) {
      homeDiscoverState.loaded = false;
      homeDiscoverState.loggedIn = true;
      refreshUserPlaylists(true);
      loadHomeDiscover(true);
      syncLikeStatusForSongs(playQueue.concat(playlist || []));
    } else {
      if (neteaseWasLoggedIn) forgetProviderLiveSession('netease');
      clearNeteaseSessionState();
    }
    return info;
  } catch (e) {
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('netease') !== authEpoch) return loginStatus;
    console.warn(e);
    loginStatusChecked = true;
    loginStatusCheckFailed = true;
    renderUserBtn();
    return null;
  }
}

function normalizeQQLoginStatus(info) {
  var fallback = { provider: 'qq', loggedIn: false, preview: false, nickname: 'QQ 音乐', userId: '', avatar: '', vipType: 0, svipType: 0, vipLevel: 'none', isVip: false, isSvip: false, stale: false, playbackKeyReady: false, vipCheckedAt: 0, vipSource: '', vipProbeAvailable: false, membershipKnown: false, membershipStale: false, authorizationIncomplete: false, vipSyncState: '' };
  if (!info || !info.loggedIn) return Object.assign({}, fallback, info || {}, {
    provider: 'qq',
    loggedIn: false,
    nickname: info && info.nickname || fallback.nickname,
    userId: info && (info.userId || info.uin) || '',
    avatar: info && info.avatar || '',
    vipType: Number(info && (info.vipType || info.vip_type) || 0) || 0,
    svipType: Number(info && (info.svipType || info.svip_type) || 0) || 0,
    vipLevel: info && (info.vipLevel || info.vip_level) || 'none',
    isVip: !!(info && info.isVip),
    isSvip: !!(info && info.isSvip),
    stale: !!(info && info.stale),
    vipCheckedAt: Number(info && info.vipCheckedAt || 0) || 0,
    vipSource: info && info.vipSource || '',
    vipProbeAvailable: !!(info && info.vipProbeAvailable),
    membershipKnown: !!(info && info.membershipKnown),
    membershipStale: !!(info && info.membershipStale),
    authorizationIncomplete: !!(info && info.authorizationIncomplete),
    vipSyncState: info && info.vipSyncState || ''
  });
  return Object.assign({}, fallback, info, {
    provider: 'qq',
    loggedIn: true,
    nickname: info.nickname || fallback.nickname,
    userId: info.userId || info.uin || '',
    avatar: info.avatar || '',
    vipType: Number(info.vipType || info.vip_type || 0) || 0,
    svipType: Number(info.svipType || info.svip_type || 0) || 0,
    vipLevel: info.vipLevel || info.vip_level || 'none',
    isVip: !!info.isVip,
    isSvip: !!info.isSvip,
    playbackKeyReady: !!info.playbackKeyReady,
    stale: !!info.stale || !!(info.profileUnavailable && !(info.nickname && info.avatar)),
    vipCheckedAt: Number(info.vipCheckedAt || 0) || 0,
    vipSource: info.vipSource || '',
    vipProbeAvailable: !!info.vipProbeAvailable,
    membershipKnown: !!info.membershipKnown,
    membershipStale: !!info.membershipStale,
    authorizationIncomplete: !!info.authorizationIncomplete,
    vipSyncState: info.vipSyncState || ''
  });
}

function qqLoginNeedsAuthorizationRefresh(status) {
  status = status || qqLoginStatus;
  return !!(status && status.loggedIn && (
    status.authorizationIncomplete ||
    status.playbackKeyReady === false
  ));
}
function qqMembershipNeedsSync(status) {
  status = status || qqLoginStatus;
  return !!(status && status.loggedIn && (
    status.membershipKnown !== true ||
    status.membershipStale
  ));
}
function qqMembershipLabel(status) {
  if (qqMembershipNeedsSync(status)) return '会员状态待确认';
  var level = providerVipLevel('qq', status);
  return level === 'svip' ? 'SVIP 会员' : (level === 'vip' ? 'VIP 会员' : '普通账号');
}
function qqLoginStatusText(info) {
  info = normalizeQQLoginStatus(info || qqLoginStatus);
  if (providerSessionNeedsValidation(info)) return providerSessionPendingText('qq', info);
  if (!info.loggedIn) return '点击“扫码登录”打开 QQ 音乐官方窗口';
  if (qqLoginNeedsAuthorizationRefresh(info)) return '已登录，还需完成 QQ 音乐播放授权';
  if (qqMembershipNeedsSync(info)) return '请刷新 QQ 音乐会员状态';
  var syncText = info.vipCheckedAt ? ' · 会员状态已更新' : '';
  return 'QQ 音乐登录信息已保存 · ' + (info.nickname || 'QQ 音乐') + ' · ' + qqMembershipLabel(info) + syncText;
}

async function refreshQQLoginStatus(options) {
  if (options === true) options = { forceVip: true };
  options = options || {};
  var authEpoch = typeof providerAuthEpoch === 'function' ? providerAuthEpoch('qq') : 0;
  try {
    var query = '/api/qq/login/status?t=' + Date.now() + (options.forceVip ? '&forceVip=1' : '');
    var info = await apiJson(query);
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('qq') !== authEpoch) return qqLoginStatus;
    var prevLogged = !!qqLoginStatus.loggedIn;
    info = applyQQSessionRejection(info);
    qqLoginStatus = normalizeQQLoginStatus(info);
    auditProviderVipState('qq', qqLoginStatus);
    if (!qqLoginStatus.loggedIn) {
      if (prevLogged || qqLoginWasLoggedIn) {
        forgetProviderLiveSession('qq');
        showToast(qqLoginStatus.reauthRequired ? 'QQ 音乐账号已在别处退出，请重新登录' : (qqLoginStatus.stale ? '暂时无法确认 QQ 音乐登录，请刷新状态' : '请重新登录 QQ 音乐'));
      }
      qqPlaylists = [];
      userPlaylists = userPlaylists.filter(function (pl) { return pl.provider !== 'qq'; });
      playlistCatalogRevision += 1;
      homeDiscoverState.loaded = false;
    } else if (!userPlaylists.some(function (pl) { return pl && pl.provider === 'qq'; })) {
      homeDiscoverState.loaded = false;
      homeDiscoverState.loggedIn = true;
      loadHomeDiscover(true);
      refreshUserPlaylists(true);
    } else if (qqLoginStatus.stale) {
      showToast('暂时无法确认 QQ 音乐登录，请刷新状态');
    }
    qqLoginWasLoggedIn = !!qqLoginStatus.loggedIn;
    if (!hasPlatformLogin(activeAccountProvider)) activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    return qqLoginStatus;
  } catch (e) {
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('qq') !== authEpoch) return qqLoginStatus;
    console.warn('QQ login status failed:', e);
    if (qqLoginStatus && qqLoginStatus.loggedIn) {
      qqLoginStatus = normalizeQQLoginStatus(Object.assign({}, qqLoginStatus, {
        loggedIn: true,
        unverified: true,
        stale: true,
        membershipStale: true,
        vipProbeAvailable: false,
        vipSyncState: 'stale'
      }));
    } else {
      qqLoginStatus = normalizeQQLoginStatus(null);
    }
    renderUserBtn();
    return qqLoginStatus;
  }
}
function refreshQQVipStatusNow(reason) {
  var now = Date.now();
  if (now - qqLoginStatusLastForcedAt < 8000) return Promise.resolve(qqLoginStatus);
  qqLoginStatusLastForcedAt = now;
  return refreshQQLoginStatus({ forceVip: true, reason: reason || 'manual' });
}
function startQQLoginStatusAutoRefresh() {
  if (qqLoginAutoRefreshTimer) clearInterval(qqLoginAutoRefreshTimer);
  qqLoginAutoRefreshTimer = setInterval(function () {
    refreshQQLoginStatus({ reason: 'auto' }).catch(function (e) { console.warn('QQ login auto refresh failed:', e); });
  }, 45000);
  if (startQQLoginStatusAutoRefresh._boundFocusRefresh) return;
  startQQLoginStatusAutoRefresh._boundFocusRefresh = true;
  function refreshOnVisible(reason) {
    if (document.hidden) return;
    if (!qqLoginStatus.loggedIn && !qqLoginWasLoggedIn) return;
    refreshQQVipStatusNow(reason).catch(function (e) { console.warn('QQ VIP foreground refresh failed:', e); });
  }
  window.addEventListener('focus', function () { refreshOnVisible('window-focus'); });
  document.addEventListener('visibilitychange', function () { refreshOnVisible('visibility'); });
}

function normalizeKugouLoginStatus(info) {
  var fallback = { provider: 'kugou', loggedIn: false, preview: false, nickname: '酷狗音乐', userId: '', avatar: '', vipType: 0, svipType: 0, vipLevel: 'none', isVip: false, isSvip: false, stale: false, playbackKeyReady: false };
  var normalizedLevel = info && info.loggedIn ? providerVipLevel('kugou', info) : (info && (info.vipLevel || info.vip_level) || 'none');
  if (!info || !info.loggedIn) return Object.assign({}, fallback, info || {}, {
    provider: 'kugou',
    loggedIn: false,
    nickname: info && info.nickname || fallback.nickname,
    userId: info && (info.userId || info.userid) || '',
    avatar: info && info.avatar || '',
    vipType: Number(info && (info.vipType || info.vip_type) || 0) || 0,
    svipType: Number(info && (info.svipType || info.svip_type) || 0) || 0,
    vipLevel: normalizedLevel,
    isVip: normalizedLevel !== 'none' || !!(info && info.isVip),
    isSvip: normalizedLevel === 'svip' || !!(info && info.isSvip),
    stale: !!(info && info.stale),
    playbackKeyReady: !!(info && (info.playbackReady || info.playbackKeyReady))
  });
  return Object.assign({}, fallback, info, {
    provider: 'kugou',
    loggedIn: true,
    nickname: info.nickname || fallback.nickname,
    userId: info.userId || info.userid || '',
    avatar: info.avatar || '',
    vipType: Number(info.vipType || info.vip_type || 0) || 0,
    svipType: Number(info.svipType || info.svip_type || 0) || 0,
    vipLevel: normalizedLevel,
    isVip: normalizedLevel !== 'none' || !!info.isVip,
    isSvip: normalizedLevel === 'svip' || !!info.isSvip,
    playbackKeyReady: !!(info.playbackReady || info.playbackKeyReady),
    stale: !!info.stale
  });
}
function applyKugouPlaybackStatusEvidence(info) {
  if (!info || info.provider !== 'kugou' || !info.loggedIn) return false;
  var existing = kugouLoginStatus || {};
  var requiresVerification = !!(info.verificationRequired || info.reason === 'verification_required' || info.restriction && info.restriction.category === 'verification_required');
  var verifiedMembership = info.membershipVerified === true &&
    (info.membershipSource === 'kugou-vip-api' ||
      info.membershipSource === 'kugou-web-roleinfo' ||
      info.membershipSource === 'kugou-cookie-explicit');
  var safeUpdate = {
    provider: 'kugou',
    loggedIn: true,
    verificationRequired: requiresVerification,
    playbackReady: !requiresVerification && !!(info.playbackReady || info.playbackKeyReady || existing.playbackKeyReady),
    playbackKeyReady: !requiresVerification && !!(info.playbackReady || info.playbackKeyReady || existing.playbackKeyReady)
  };
  if (verifiedMembership) {
    safeUpdate.vipType = Number(info.vipType || 0) || 0;
    safeUpdate.svipType = Number(info.svipType || 0) || 0;
    safeUpdate.vipLevel = info.vipLevel === 'svip' ? 'svip' : (info.vipLevel === 'vip' ? 'vip' : 'none');
    safeUpdate.isVip = info.isVip === true;
    safeUpdate.isSvip = info.isSvip === true;
    safeUpdate.membershipVerified = true;
    safeUpdate.membershipSource = info.membershipSource;
  }
  kugouLoginStatus = normalizeKugouLoginStatus(Object.assign({}, existing, safeUpdate));
  kugouLoginWasLoggedIn = true;
  renderUserBtn();
  return true;
}
function qqPlaybackShowsMemberAccess(info, song) {
  // A playable URL plus a song-level VIP hint proves that this request worked;
  // it does not prove the account owns a subscription.
  return false;
}
function applyQQPlaybackStatusEvidence(info, song) {
  return false;
}
var kugouStatusVerificationPrompted = false;
async function refreshKugouLoginStatus() {
  var statusAtStart = kugouLoginStatus;
  var authEpoch = typeof providerAuthEpoch === 'function' ? providerAuthEpoch('kugou') : 0;
  try {
    var info = await apiJson('/api/kugou/login/status?t=' + Date.now());
    if (kugouLoginStatus !== statusAtStart) return kugouLoginStatus;
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('kugou') !== authEpoch) return kugouLoginStatus;
    if (info && info.error && !info.reauthRequired && !info.verificationRequired) throw new Error(info.error);
    var prevLogged = !!kugouLoginStatus.loggedIn;
    kugouLoginStatus = normalizeKugouLoginStatus(info);
    auditProviderVipState('kugou', kugouLoginStatus);
    if (info && info.verificationRequired) {
      if (!kugouStatusVerificationPrompted && typeof openKugouSecurityVerification === 'function') {
        kugouStatusVerificationPrompted = true;
        openKugouSecurityVerification(info);
      }
      renderUserBtn();
      return kugouLoginStatus;
    }
    kugouStatusVerificationPrompted = false;
    if (!kugouLoginStatus.loggedIn) {
      if (prevLogged || kugouLoginWasLoggedIn) {
        forgetProviderLiveSession('kugou');
        showToast(kugouLoginStatus.stale ? '暂时无法确认酷狗音乐登录，请刷新状态' : '请重新登录酷狗音乐');
      }
      kugouPlaylists = [];
      userPlaylists = userPlaylists.filter(function (pl) { return pl.provider !== 'kugou'; });
      playlistCatalogRevision += 1;
      homeDiscoverState.loaded = false;
    } else if (!userPlaylists.some(function (pl) { return pl && pl.provider === 'kugou'; })) {
      homeDiscoverState.loaded = false;
      homeDiscoverState.loggedIn = true;
      refreshUserPlaylists(true);
    } else if (kugouLoginStatus.stale) {
      showToast('酷狗音乐登录状态可能已失效');
    }
    kugouLoginWasLoggedIn = !!kugouLoginStatus.loggedIn;
    if (!hasPlatformLogin(activeAccountProvider)) activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    return kugouLoginStatus;
  } catch (e) {
    if (kugouLoginStatus !== statusAtStart) return kugouLoginStatus;
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('kugou') !== authEpoch) return kugouLoginStatus;
    console.warn('Kugou login status failed:', e);
    kugouLoginStatus = normalizeKugouLoginStatus(kugouLoginStatus && kugouLoginStatus.loggedIn
      ? Object.assign({}, kugouLoginStatus, {
        stale: true, membershipStale: true, membershipVerified: false,
        playbackReady: false, playbackKeyReady: false, authorizationIncomplete: true
      }) : null);
    renderUserBtn();
    return kugouLoginStatus;
  }
}
function startKugouLoginStatusAutoRefresh() {
  if (kugouLoginAutoRefreshTimer) clearInterval(kugouLoginAutoRefreshTimer);
  kugouLoginAutoRefreshTimer = setInterval(function () {
    refreshKugouLoginStatus().catch(function (e) { console.warn('Kugou login auto refresh failed:', e); });
  }, 45000);
}

function normalizeQishuiLoginStatus(info) {
  var fallback = { provider: 'qishui', loggedIn: false, configured: false, oauthConfigured: false, oauthMissing: [], preview: false, nickname: '汽水音乐', userId: '', avatar: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, stale: false, playbackKeyReady: false, playbackMode: 'recommend-match', searchReady: false, publicCatalog: false };
  var configured = !!(info && (info.configured || info.loggedIn));
  var loggedIn = !!(info && info.loggedIn === true && info.webSession === true);
  var webSession = !!(loggedIn && info.webSession);
  var capabilities = info && info.capabilities || {};
  var searchReady = !!(configured || capabilities.search || info && info.publicCatalog);
  return Object.assign({}, fallback, info || {}, {
    provider: 'qishui',
    loggedIn: loggedIn,
    configured: configured,
    oauthConfigured: !!(info && (info.oauthConfigured || (info.oauth && info.oauth.configured))),
    oauthMissing: info && Array.isArray(info.oauthMissing) ? info.oauthMissing : [],
    userId: info && (info.userId || info.openId || info.open_id || info.tokenSource || info.scope || '') || '',
    nickname: info && info.nickname ? info.nickname : (webSession ? '汽水音乐账号' : (configured ? '汽水开放平台' : fallback.nickname)),
    avatar: info && info.avatar || '',
    vipType: Number(info && (info.vipType || info.vip_type) || 0) || 0,
    vipLevel: info && (info.vipLevel || info.vip_level) || 'none',
    isVip: !!(info && info.isVip),
    isSvip: !!(info && info.isSvip),
    playbackKeyReady: !!(webSession && capabilities.playableUrl && info.playbackKeyReady !== false && !info.stale && !info.reauthRequired),
    playbackMode: info && info.playbackMode || 'recommend-match',
    searchReady: searchReady,
    webSession: webSession,
    cookieReady: !!(info && info.cookieReady),
    tokenConfigured: !!(info && info.tokenConfigured),
    publicCatalog: !!(!configured && searchReady),
    stale: !!(info && info.stale)
  });
}
async function refreshQishuiLoginStatus() {
  var authEpoch = typeof providerAuthEpoch === 'function' ? providerAuthEpoch('qishui') : 0;
  try {
    var info = await apiJson('/api/qishui/status?t=' + Date.now());
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('qishui') !== authEpoch) return qishuiLoginStatus;
    if (info && info.error && !info.reauthRequired) throw new Error(info.error);
    var prevLogged = !!qishuiLoginStatus.loggedIn;
    qishuiLoginStatus = normalizeQishuiLoginStatus(info);
    auditProviderVipState('qishui', qishuiLoginStatus);
    if (!qishuiLoginStatus.loggedIn) {
      if (prevLogged || qishuiLoginWasLoggedIn) {
        forgetProviderLiveSession('qishui');
        showToast(qishuiLoginStatus.reauthRequired ? '汽水音乐登录已过期，请重新扫码' : '已退出汽水音乐');
      }
      qishuiPlaylists = [];
      userPlaylists = userPlaylists.filter(function (pl) { return pl.provider !== 'qishui'; });
      playlistCatalogRevision += 1;
      homeDiscoverState.loaded = false;
    } else if (!userPlaylists.some(function (pl) { return pl && pl.provider === 'qishui'; })) {
      homeDiscoverState.loaded = false;
      homeDiscoverState.loggedIn = true;
      refreshUserPlaylists(true);
      loadHomeDiscover(true);
    }
    qishuiLoginWasLoggedIn = !!qishuiLoginStatus.loggedIn;
    if (!hasPlatformLogin(activeAccountProvider)) activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    return qishuiLoginStatus;
  } catch (e) {
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('qishui') !== authEpoch) return qishuiLoginStatus;
    console.warn('Qishui login status failed:', e);
    qishuiLoginStatus = normalizeQishuiLoginStatus(qishuiLoginStatus && qishuiLoginStatus.loggedIn
      ? Object.assign({}, qishuiLoginStatus, {
        stale: true, membershipStale: true, playbackKeyReady: false
      }) : null);
    renderUserBtn();
    return qishuiLoginStatus;
  }
}
function startQishuiLoginStatusAutoRefresh() {
  if (qishuiLoginAutoRefreshTimer) clearInterval(qishuiLoginAutoRefreshTimer);
  qishuiLoginAutoRefreshTimer = setInterval(function () {
    refreshQishuiLoginStatus().catch(function (e) { console.warn('Qishui login auto refresh failed:', e); });
  }, 45000);
}

// ---------- 账号在线检测 ----------
// 登录后定期、窗口重新获得焦点时向平台确认会话仍有效。网络失败只算“未确认”，
// 不会断开；平台明确回答“未登录”需要隔一小段时间再确认一次，才断开连线并提示。
var LOGIN_PRESENCE_INTERVAL_MS = 5 * 60 * 1000;
var LOGIN_PRESENCE_FOCUS_GAP_MS = 60 * 1000;
var LOGIN_PRESENCE_CONFIRM_DELAY_MS = 15 * 1000;
var loginPresenceState = {
  netease: { rejected: 0, checking: false, lastAt: 0, confirmTimer: 0, timer: 0 },
  qq: { rejected: 0, confirmTimer: 0 }
};
function applyQQSessionRejection(info) {
  var state = loginPresenceState.qq;
  if (!info || !info.loggedIn || !info.sessionRejected) {
    state.rejected = 0;
    return info;
  }
  state.rejected += 1;
  if (state.rejected >= 2) return Object.assign({}, info, { loggedIn: false, stale: true, reauthRequired: true });
  // First "not logged in" from QQ: ask again soon instead of waiting for the next poll.
  if (!state.confirmTimer) {
    state.confirmTimer = setTimeout(function () {
      state.confirmTimer = 0;
      refreshQQLoginStatus({ reason: 'presence-confirm' }).catch(function (e) { console.warn('QQ presence confirm failed:', e); });
    }, LOGIN_PRESENCE_CONFIRM_DELAY_MS);
  }
  return info;
}
function disconnectNeteaseAfterRemoteLogout() {
  loginStatus = { loggedIn: false, sessionRejected: true };
  forgetProviderLiveSession('netease');
  clearNeteaseSessionState();
  homeDiscoverState.loaded = false;
  if (!hasPlatformLogin('netease') || loggedProviderCount() < 2) dualAccountMode = false;
  if (!hasPlatformLogin(activeAccountProvider)) activeAccountProvider = firstLoggedProvider();
  if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('netease-session-lost', { scrollCurrent: miniQueueOpen });
  renderUserBtn();
  if (typeof safeShelfRebuild === 'function') safeShelfRebuild('netease-session-lost');
  showToast('网易云音乐账号已在别处退出，请重新登录');
}
async function checkNeteaseLoginPresence(reason) {
  var state = loginPresenceState.netease;
  if (state.checking || !loginStatus || !loginStatus.loggedIn) return;
  if (document.hidden && reason !== 'presence-confirm') return;
  var userId = String(loginStatus.userId || '');
  var authEpoch = typeof providerAuthEpoch === 'function' ? providerAuthEpoch('netease') : 0;
  state.checking = true;
  state.lastAt = Date.now();
  try {
    var info = await apiJson('/api/login/status?fresh=1&t=' + Date.now());
    if (typeof providerAuthEpoch === 'function' && providerAuthEpoch('netease') !== authEpoch) return;
    // The user logged out or switched account while this check was in flight.
    if (!loginStatus || !loginStatus.loggedIn || String(loginStatus.userId || '') !== userId) return;
    if (info && info.loggedIn) {
      state.rejected = 0;
      if (String(info.userId || '') !== userId) {
        refreshLoginStatus(true);
        return;
      }
      loginStatus = info;
      auditProviderVipState('netease', loginStatus);
      renderUserBtn();
      return;
    }
    if (!info || !info.sessionRejected) return;
    state.rejected += 1;
    if (state.rejected < 2) {
      if (state.confirmTimer) clearTimeout(state.confirmTimer);
      state.confirmTimer = setTimeout(function () {
        state.confirmTimer = 0;
        checkNeteaseLoginPresence('presence-confirm');
      }, LOGIN_PRESENCE_CONFIRM_DELAY_MS);
      return;
    }
    state.rejected = 0;
    disconnectNeteaseAfterRemoteLogout();
  } catch (e) {
    // Offline or the local service is busy: keep the session as it is.
    console.warn('NetEase presence check failed:', e);
  } finally {
    state.checking = false;
  }
}
function startLoginPresenceWatch() {
  var state = loginPresenceState.netease;
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(function () { checkNeteaseLoginPresence('interval'); }, LOGIN_PRESENCE_INTERVAL_MS);
  if (startLoginPresenceWatch._bound) return;
  startLoginPresenceWatch._bound = true;
  function checkOnReturn(reason) {
    if (document.hidden) return;
    if (Date.now() - state.lastAt < LOGIN_PRESENCE_FOCUS_GAP_MS) return;
    checkNeteaseLoginPresence(reason);
  }
  window.addEventListener('focus', function () { checkOnReturn('window-focus'); });
  document.addEventListener('visibilitychange', function () { checkOnReturn('visibility'); });
}

function renderUserBtn() {
  var btn = document.getElementById('user-btn');
  if (!btn) return;
  var loggedIn = hasAnyPlatformLogin();
  var externalProviders = accountProviderExternalRenderList().filter(function (provider) {
    return hasPlatformLogin(provider);
  });
  if (loggedIn && !externalProviders.length) externalProviders = [firstLoggedProvider()];
  var topRight = document.getElementById('top-right');
  if (topRight && topRight.classList.contains('account-pill-stack') !== (externalProviders.length > 1)) topRight.classList.toggle('account-pill-stack', externalProviders.length > 1);
  ['multi-account', 'external-account-pills', 'logged-in', 'logged-out'].forEach(function (name) {
    var enabled = name === 'logged-out' ? !loggedIn : loggedIn;
    if (btn.classList.contains(name) !== enabled) btn.classList.toggle(name, enabled);
  });
  var pillsChanged = false;
  if (loggedIn) {
    activeAccountProvider = firstLoggedProvider();
    var st = platformStatus(activeAccountProvider);
    var meta = platformMeta(activeAccountProvider);
    var title = providerAccountIdentity(activeAccountProvider, st) + ' / 账号与登录接入';
    if (btn.title !== title) btn.title = title;
    pillsChanged = syncTopAccountPills(btn, externalProviders);
  } else {
    if (btn.title !== '登录账号') btn.title = '登录账号';
    if (!btn.querySelector('.login-word')) {
      btn.innerHTML = '<span class="login-word">登录</span>';
      pillsChanged = true;
    }
  }
  if (pillsChanged && typeof updateAccountPillGlassDisplacementMap === 'function') {
    requestAnimationFrame(updateAccountPillGlassDisplacementMap);
  }
  bindTopAccountPillSorting();
  if (typeof updateLoginNodeGraphUi === 'function') {
    requestAnimationFrame(updateLoginNodeGraphUi);
  }
  updatePlaybackQualityUi();
}
