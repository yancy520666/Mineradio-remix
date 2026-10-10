// ============================================================
function activeModalMask() {
  if (!document.querySelectorAll) return null;
  var masks = Array.prototype.slice.call(document.querySelectorAll('.modal-mask.show,.hotkey-modal.show'));
  masks.sort(function (a, b) {
    var za = typeof getComputedStyle === 'function' ? Number(getComputedStyle(a).zIndex) || 0 : 0;
    var zb = typeof getComputedStyle === 'function' ? Number(getComputedStyle(b).zIndex) || 0 : 0;
    return za - zb;
  });
  return masks[masks.length - 1] || null;
}
function modalFocusableElements(mask) {
  return Array.prototype.slice.call(mask.querySelectorAll('button,a[href],input:not([type="hidden"]),textarea,select,summary,[tabindex]')).filter(function (node) {
    return !node.disabled && node.tabIndex >= 0 && !node.closest('[hidden],[inert]') && node.getClientRects().length &&
      (typeof getComputedStyle !== 'function' || getComputedStyle(node).visibility !== 'hidden');
  });
}
function focusActiveModal(mask) {
  if (!mask || activeModalMask() !== mask || mask.contains(document.activeElement)) return;
  try { mask.focus({ preventScroll: true }); } catch (_) { mask.focus(); }
}
function activateModalAccessibility(mask) {
  initModalAccessibility();
  if (!mask || mask.__modalAccessibilityActive) return;
  var state = initModalAccessibility.state;
  mask.__modalAccessibilityActive = true;
  mask.__modalReturnFocus = mask.contains(document.activeElement) ? state.lastOutsideFocus : document.activeElement;
  mask.setAttribute('role', 'dialog');
  mask.setAttribute('aria-modal', 'true');
  mask.setAttribute('aria-hidden', 'false');
  mask.tabIndex = -1;
  if (!mask.hasAttribute('aria-labelledby') && !mask.hasAttribute('aria-label')) {
    var title = mask.querySelector('h2,h3,.login-panel-head b');
    if (title) {
      if (!title.id) title.id = mask.id + '-accessible-title';
      mask.setAttribute('aria-labelledby', title.id);
    }
  }
  var schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (fn) { fn(); };
  schedule(function () { focusActiveModal(mask); });
}
function deactivateModalAccessibility(mask) {
  if (!mask || !mask.__modalAccessibilityActive) return;
  mask.__modalAccessibilityActive = false;
  mask.setAttribute('aria-hidden', 'true');
  var returnFocus = mask.__modalReturnFocus;
  mask.__modalReturnFocus = null;
  var next = activeModalMask();
  if (next && (!returnFocus || !next.contains(returnFocus))) { focusActiveModal(next); return; }
  if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') {
    try { returnFocus.focus({ preventScroll: true }); } catch (_) { returnFocus.focus(); }
  }
}
function closeModalFromKeyboard(mask) {
  if (!mask) return false;
  if (mask.id === 'hotkey-modal' && typeof hotkeyCaptureState !== 'undefined' && hotkeyCaptureState) return false;
  if (mask.id === 'local-beat-modal' && typeof localBeatAnalysis !== 'undefined' && localBeatAnalysis.active && typeof cancelLocalBeatAnalysis === 'function') {
    cancelLocalBeatAnalysis(); return true;
  }
  if (mask.id === 'wallpaper-engine-modal') {
    var drawer = document.getElementById('wallpaper-engine-details-drawer');
    if (drawer && drawer.classList.contains('show') && typeof closeWallpaperEngineProjectDetails === 'function') {
      closeWallpaperEngineProjectDetails(); return true;
    }
  }
  var names = {
    'login-modal': 'closeLoginModal', 'user-modal': 'closeUserModal', 'hotkey-modal': 'closeHotkeySettings',
    'audio-output-workflow-modal': 'closeAudioOutputWorkflowPanel', 'collect-modal': 'closeCollectModal',
    'custom-lyric-modal': 'closeCustomLyricModal', 'track-detail-modal': 'closeTrackDetailModal',
    'update-modal': 'closeUpdatePanel', 'local-beat-modal': 'closeLocalBeatModal',
    'cover-crop-modal': 'closeCoverCropModal', 'background-crop-modal': 'cancelCustomBackgroundCropModal',
    'wallpaper-engine-modal': 'closeWallpaperEngineLibrary', 'original-profile-modal': 'closeOriginalProfileImport',
    'home-platform-recommend-mask': 'closeHomePlatformRecommendations',
    'built-in-playlist-prompt': 'closeBuiltInPlaylistPrompt', 'home-daily-fallback-modal': 'closeHomeDailyFallback'
  };
  var close = globalThis[names[mask.id]];
  if (typeof close !== 'function') return false;
  close(mask.id === 'built-in-playlist-prompt' ? false : undefined);
  return true;
}
function initModalAccessibility() {
  if (initModalAccessibility.state) return;
  var state = initModalAccessibility.state = { lastOutsideFocus: document.activeElement };
  if (!document.addEventListener || !document.querySelectorAll) return;
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.isComposing) return;
    var mask = activeModalMask();
    if (!mask) return;
    if (mask.id === 'hotkey-modal' && typeof hotkeyCaptureState !== 'undefined' && hotkeyCaptureState) return;
    if (e.key === 'Escape' && closeModalFromKeyboard(mask)) {
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (e.key !== 'Tab') return;
    var controls = modalFocusableElements(mask), current = document.activeElement;
    var first = controls[0], last = controls[controls.length - 1];
    if (!first || !mask.contains(current) || current === mask || (e.shiftKey ? current === first : current === last)) {
      e.preventDefault(); e.stopImmediatePropagation();
      var target = e.shiftKey ? last : first;
      if (target) target.focus(); else mask.focus();
    }
  }, true);
  document.addEventListener('focusin', function (e) {
    var mask = activeModalMask();
    if (!mask) { state.lastOutsideFocus = e.target; return; }
    if (!mask.contains(e.target)) focusActiveModal(mask);
  });
  if (typeof MutationObserver === 'function') {
    var observer = new MutationObserver(function (changes) {
      changes.forEach(function (change) {
        var mask = change.target;
        if (mask.classList.contains('show')) activateModalAccessibility(mask);
        else deactivateModalAccessibility(mask);
      });
    });
    document.querySelectorAll('.modal-mask').forEach(function (mask) { observer.observe(mask, { attributes: true, attributeFilter: ['class'] }); });
    state.observer = observer;
  }
}
function openGsapModal(mask) {
  if (!mask) return;
  var panel = mask.querySelector('.modal');
  mask.classList.add('show');
  if (window.gsap) {
    window.gsap.killTweensOf(mask);
    if (panel) window.gsap.killTweensOf(panel);
    window.gsap.set(mask, { display: 'flex', visibility: 'visible' });
    window.gsap.fromTo(mask,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.38, ease: 'power2.out', overwrite: true }
    );
    if (panel) {
      window.gsap.fromTo(panel,
        { autoAlpha: 0, y: 26, scale: 0.965, filter: 'blur(12px)' },
        { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.68, ease: 'expo.out', overwrite: true }
      );
    }
  } else {
    mask.style.display = 'flex';
    mask.style.visibility = 'visible';
    mask.style.opacity = '1';
  }
  activateModalAccessibility(mask);
}
function closeGsapModal(mask, afterClose) {
  if (!mask || !mask.classList.contains('show')) {
    if (afterClose) afterClose();
    return;
  }
  var panel = mask.querySelector('.modal');
  function finish() {
    mask.classList.remove('show');
    if (window.gsap) {
      window.gsap.set(mask, { clearProps: 'display,visibility,opacity' });
      if (panel) window.gsap.set(panel, { clearProps: 'opacity,visibility,transform,filter' });
    } else {
      mask.style.display = '';
      mask.style.visibility = '';
      mask.style.opacity = '';
    }
    deactivateModalAccessibility(mask);
    if (afterClose) afterClose();
  }
  if (window.gsap) {
    window.gsap.killTweensOf(mask);
    if (panel) {
      window.gsap.killTweensOf(panel);
      window.gsap.to(panel, { autoAlpha: 0, y: 18, scale: 0.976, filter: 'blur(8px)', duration: 0.28, ease: 'power2.in', overwrite: true });
    }
    window.gsap.to(mask, { autoAlpha: 0, duration: 0.34, ease: 'power2.inOut', overwrite: true, onComplete: finish });
  } else {
    finish();
  }
}
function bindModalBackdropClose() {
  initModalAccessibility();
  [
    ['track-detail-modal', closeTrackDetailModal],
    ['login-modal', closeLoginModal],
    ['user-modal', closeUserModal],
    ['audio-output-workflow-modal', closeAudioOutputWorkflowPanel],
    ['custom-lyric-modal', closeCustomLyricModal],
    ['update-modal', closeUpdatePanel]
  ].forEach(function (pair) {
    var mask = document.getElementById(pair[0]);
    var close = pair[1];
    if (!mask || mask.__backdropCloseBound) return;
    mask.__backdropCloseBound = true;
    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });
  });
}
function onUserBtnClick() {
  if (topAccountPillClickSuppressed) {
    topAccountPillClickSuppressed = false;
    return;
  }
  // Open the platform at the top of the left-hand list, following the user's
  // own ordering, rather than whichever account happened to be used last.
  showLoginModal({ provider: accountProviderOrder()[0] || 'netease', source: 'top-account' });
}
var ACCOUNT_PROVIDER_KEYS = ['netease', 'qq', 'kugou', 'qishui'];
var ACCOUNT_PROVIDER_ORDER_STORE_KEY = 'mineradio-account-provider-order-v1';
var ACCOUNT_PROVIDER_VISIBLE_STORE_KEY = 'mineradio-account-provider-visible-v1';
var topAccountPillDrag = null;
var topAccountPillClickSuppressed = false;

function normalizeAccountProviderKey(provider) {
  return provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : 'netease'));
}
function normalizeAccountProviderList(list) {
  var seen = {};
  var out = [];
  (Array.isArray(list) ? list : []).forEach(function (provider) {
    provider = normalizeAccountProviderKey(provider);
    if (seen[provider]) return;
    seen[provider] = true;
    out.push(provider);
  });
  ACCOUNT_PROVIDER_KEYS.forEach(function (provider) {
    if (!seen[provider]) out.push(provider);
  });
  return out;
}
function accountProviderOrder() {
  try {
    return normalizeAccountProviderList(JSON.parse(localStorage.getItem(ACCOUNT_PROVIDER_ORDER_STORE_KEY) || '[]'));
  } catch (e) {
    return normalizeAccountProviderList([]);
  }
}
function captureAccountProviderRects(root, selector) {
  var rects = {};
  if (!root || !root.querySelectorAll) return rects;
  Array.prototype.slice.call(root.querySelectorAll(selector)).forEach(function (node) {
    var key = node.getAttribute('data-login-provider') || node.getAttribute('data-account-provider') || node.id || '';
    if (!key) return;
    var rect = node.getBoundingClientRect();
    rects[key] = { left: rect.left, top: rect.top };
  });
  return rects;
}
function animateAccountProviderReorder(root, selector, beforeRects, movingClass) {
  if (!root || !beforeRects || !root.querySelectorAll) return;
  movingClass = movingClass || 'provider-reorder-moving';
  Array.prototype.slice.call(root.querySelectorAll(selector)).forEach(function (node) {
    var key = node.getAttribute('data-login-provider') || node.getAttribute('data-account-provider') || node.id || '';
    var before = key && beforeRects[key];
    if (!before) return;
    var after = node.getBoundingClientRect();
    var dx = before.left - after.left;
    var dy = before.top - after.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    var previousTransition = node.style.transition;
    node.classList.add(movingClass);
    node.style.transition = 'none';
    node.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    void node.offsetWidth;
    requestAnimationFrame(function () {
      node.style.transition = 'transform .26s cubic-bezier(.18, .86, .24, 1), opacity .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease';
      node.style.transform = '';
      setTimeout(function () {
        node.classList.remove(movingClass);
        node.style.transition = previousTransition;
        node.style.transform = '';
      }, 280);
    });
  });
}
function saveAccountProviderOrder(order) {
  var topRoot = document.getElementById('user-btn');
  var topRects = captureAccountProviderRects(topRoot, '.top-account-pill[data-account-provider]');
  order = normalizeAccountProviderList(order);
  try { localStorage.setItem(ACCOUNT_PROVIDER_ORDER_STORE_KEY, JSON.stringify(order)); } catch (e) { }
  syncAccountProviderOrderUi();
  if (typeof renderUserBtn === 'function') renderUserBtn();
  animateAccountProviderReorder(topRoot, '.top-account-pill[data-account-provider]', topRects, 'provider-reorder-moving');
  if (typeof scheduleLoginWorkflowEdges === 'function') scheduleLoginWorkflowEdges('provider-order');
  if (typeof syncContentProviderPriority === 'function') syncContentProviderPriority();
  return order;
}
function moveAccountProviderBefore(provider, beforeProvider) {
  provider = normalizeAccountProviderKey(provider);
  beforeProvider = beforeProvider ? normalizeAccountProviderKey(beforeProvider) : '';
  var order = accountProviderOrder().filter(function (item) { return item !== provider; });
  var index = beforeProvider ? order.indexOf(beforeProvider) : -1;
  if (index < 0) order.push(provider);
  else order.splice(index, 0, provider);
  return saveAccountProviderOrder(order);
}
function accountProviderVisibleList() {
  try {
    var parsed = JSON.parse(localStorage.getItem(ACCOUNT_PROVIDER_VISIBLE_STORE_KEY) || '[]');
    var allowed = {};
    ACCOUNT_PROVIDER_KEYS.forEach(function (key) { allowed[key] = true; });
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeAccountProviderKey)
      .filter(function (provider, index, arr) { return allowed[provider] && arr.indexOf(provider) === index; });
  } catch (e) {
    return [];
  }
}
function saveAccountProviderVisibleList(list) {
  var allowed = {};
  ACCOUNT_PROVIDER_KEYS.forEach(function (key) { allowed[key] = true; });
  var out = (Array.isArray(list) ? list : [])
    .map(normalizeAccountProviderKey)
    .filter(function (provider, index, arr) { return allowed[provider] && arr.indexOf(provider) === index; });
  try { localStorage.setItem(ACCOUNT_PROVIDER_VISIBLE_STORE_KEY, JSON.stringify(out)); } catch (e) { }
  if (typeof updateLoginProviderUi === 'function') updateLoginProviderUi();
  if (typeof renderUserBtn === 'function') renderUserBtn();
  return out;
}
function isAccountProviderExternallyVisible(provider) {
  provider = normalizeAccountProviderKey(provider);
  return accountProviderVisibleList().indexOf(provider) >= 0;
}
function toggleAccountProviderExternal(provider) {
  provider = normalizeAccountProviderKey(provider);
  var list = accountProviderVisibleList();
  var idx = list.indexOf(provider);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(provider);
  return saveAccountProviderVisibleList(list);
}
function accountProviderExternalRenderList() {
  var selected = accountProviderVisibleList();
  var order = accountProviderOrder();
  return order.filter(function (provider) { return selected.indexOf(provider) >= 0; });
}
function syncAccountProviderOrderUi() {
  var parent = document.getElementById('login-platform-tabs');
  if (parent) {
    var beforeRects = captureAccountProviderRects(parent, '[data-login-provider]');
    accountProviderOrder().forEach(function (provider) {
      var node = document.getElementById('login-provider-' + provider);
      if (node && node.parentNode === parent) parent.appendChild(node);
    });
    animateAccountProviderReorder(parent, '[data-login-provider]', beforeRects, 'provider-reorder-moving');
    if (typeof scheduleLoginWorkflowEdges === 'function') scheduleLoginWorkflowEdges('provider-order-ui');
  }
}
function platformMeta(provider) {
  if (provider === 'qq') return { key: 'qq', short: 'QQ', label: 'QQ 音乐', app: 'QQ 音乐 App', dot: 'qq' };
  if (provider === 'kugou') return { key: 'kugou', short: 'KG', label: '酷狗音乐', app: '酷狗音乐 App', dot: 'kugou' };
  if (provider === 'qishui') return { key: 'qishui', short: 'QS', label: '汽水音乐', app: '汽水音乐 App', dot: 'qishui' };
  return { key: 'netease', short: 'NE', label: '网易云音乐', app: '网易云音乐 App', dot: 'netease' };
}
function platformStatus(provider) {
  if (provider === 'qishui') return qishuiLoginStatus;
  if (provider === 'kugou') return kugouLoginStatus;
  return provider === 'qq' ? qqLoginStatus : loginStatus;
}
function providerVipType(provider, status) {
  status = status || platformStatus(provider) || {};
  return Number(status.vipType || status.vip_type || status.vip || status.isVip || status.is_vip || 0) || 0;
}
function providerFlagEnabled(status, keys) {
  status = status || {};
  return (keys || []).some(function (key) {
    var value = status[key];
    if (value === true) return true;
    if (Number(value) > 0) return true;
    var text = String(value || '').trim().toLowerCase();
    return text === 'true' || text === 'yes' || text === 'svip' || text === 'vip' || text === 'premium';
  });
}
function providerVipLevel(provider, status) {
  status = status || platformStatus(provider) || {};
  var raw = String(status.vipLevel || status.vip_level || status.vipLabel || status.vip_label || status.product || '').trim().toLowerCase();
  if (raw === 'svip' || raw === 'supervip' || raw === 'super_vip') return 'svip';
  if (raw === 'vip' || raw === 'premium') return 'vip';
  var text = [
    status.vipName,
    status.vip_name,
    status.memberName,
    status.member_name,
    status.memberType,
    status.member_type,
    status.vipLabel,
    status.vip_label,
    status.product
  ].map(function (value) { return String(value || '').toLowerCase(); }).join(' ');
  if (providerFlagEnabled(status, ['isSvip', 'is_svip', 'svip', 'superVip', 'super_vip', 'svipType', 'svip_type']) ||
      /svip|supervip|super_vip|超级会员|超级vip/.test(raw + ' ' + text) ||
      (provider !== 'netease' && /豪华绿钻/.test(raw + ' ' + text))) return 'svip';
  if (raw === 'none' || raw === 'free' || raw === 'open' || raw === 'unknown' ||
      raw === 'no vip' || raw === 'no_vip' || raw === 'no-vip' || raw === 'normal' || raw === '无vip') return 'none';
  var vip = providerVipType(provider, status);
  if (providerFlagEnabled(status, ['isVip', 'is_vip', 'vip', 'vipFlag', 'vipflag']) || vip > 0 || /vip|premium|会员|黑胶|绿钻/.test(raw + ' ' + text)) return 'vip';
  return 'none';
}
function hasProviderVip(provider, status) {
  return providerVipLevel(provider, status) !== 'none';
}
function hasProviderSvip(provider, status) {
  return providerVipLevel(provider, status) === 'svip';
}
function hasPlatformLogin(provider) {
  var st = platformStatus(provider);
  return !!(st && st.loggedIn);
}
function hasAnyPlatformLogin() {
  return hasPlatformLogin('netease') || hasPlatformLogin('qq') || hasPlatformLogin('kugou') || hasPlatformLogin('qishui');
}
function firstLoggedProvider() {
  if (hasPlatformLogin(activeAccountProvider)) return activeAccountProvider;
  var ordered = accountProviderOrder();
  for (var i = 0; i < ordered.length; i += 1) {
    if (hasPlatformLogin(ordered[i])) return ordered[i];
  }
  return 'netease';
}
function providerAvatarSrc(provider, status) {
  status = status || platformStatus(provider) || {};
  // A stable URL keeps decoded avatars cached; recovery adds a version only on failure.
  if (status.avatar) return coverProxySrc(status.avatar);
  var meta = platformMeta(provider);
  var fill = provider === 'qq' ? '#bfd66b' : (provider === 'kugou' ? '#56e0ff' : (provider === 'qishui' ? '#45d68f' : '#d95b67'));
  var bg = provider === 'qq' ? '#11150b' : (provider === 'kugou' ? '#071722' : (provider === 'qishui' ? '#071a12' : '#180b0f'));
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="' + bg + '"/><circle cx="48" cy="48" r="34" fill="' + fill + '" opacity=".16"/><text x="48" y="56" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="' + fill + '">' + meta.short + '</text></svg>';
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
function providerMembershipNeedsSync(provider, status) {
  if (!status || !status.loggedIn) return false;
  if (provider === 'qq') return !!(
    (typeof qqLoginNeedsAuthorizationRefresh === 'function' && qqLoginNeedsAuthorizationRefresh(status)) ||
    (typeof qqMembershipNeedsSync === 'function' && qqMembershipNeedsSync(status))
  );
  if (provider !== 'kugou' && provider !== 'qishui') return false;
  return !!(status.stale || status.membershipStale ||
    (provider === 'kugou' ? status.membershipVerified !== true : status.membershipKnown !== true));
}
function providerVipBadge(provider, status, idAttr, includeNormal) {
  status = status || platformStatus(provider) || {};
  if (!status.loggedIn) return '';
  var pendingSync = providerMembershipNeedsSync(provider, status);
  var level = providerVipLevel(provider, status);
  if (level === 'none' && !includeNormal && !pendingSync) return '';
  var id = idAttr ? ' id="' + idAttr + '"' : '';
  var badgeLevel = pendingSync ? 'pending' : (level === 'none' ? 'normal' : level);
  var cls = 'top-account-vip ' + escHtml(provider || 'netease') + ' ' + badgeLevel;
  var label = pendingSync ? '待同步' : (level === 'svip' ? 'SVIP' : (level === 'vip' ? 'VIP' : '普通'));
  return '<span' + id + ' class="' + cls + '">' + label + '</span>';
}
function providerAccountIdentity(provider, status) {
  status = status || platformStatus(provider) || {};
  var meta = platformMeta(provider) || {};
  var accountIds = [status.userId, status.uid, status.uin, status.openId, status.open_id, status.id]
    .map(function (value) { return String(value == null ? '' : value).trim(); })
    .filter(Boolean);
  var profile = status.profile && typeof status.profile === 'object' ? status.profile : {};
  var candidates = [
    status.nickname,
    status.nickName,
    status.nick_name,
    status.displayName,
    status.display_name,
    status.userName,
    status.user_name,
    status.username,
    status.publicName,
    status.public_name,
    status.name,
    profile.nickname,
    profile.nickName,
    profile.nick_name,
    profile.displayName,
    profile.display_name,
    profile.userName,
    profile.user_name,
    profile.username,
    profile.publicName,
    profile.public_name,
    profile.name
  ];
  var syntheticPrefixes = [meta.label, meta.short, provider, 'QQ 音乐', 'QQ', '酷狗音乐', '酷狗', '汽水音乐', '网易云音乐', '网易云']
    .map(function (value) { return String(value || '').replace(/[\s·:_-]+/g, '').toLowerCase(); })
    .filter(Boolean);
  for (var i = 0; i < candidates.length; i += 1) {
    var nickname = String(candidates[i] == null ? '' : candidates[i]).replace(/\s+/g, ' ').trim();
    if (!nickname || accountIds.indexOf(nickname) !== -1 || /^\d{5,}$/.test(nickname)) continue;
    var compactNickname = nickname.replace(/[\s·:_-]+/g, '').toLowerCase();
    var synthetic = accountIds.some(function (accountId) {
      var compactId = String(accountId || '').replace(/[\s·:_-]+/g, '').toLowerCase();
      return compactId && syntheticPrefixes.some(function (prefix) { return compactNickname === prefix + compactId; });
    });
    if (synthetic) continue;
    return nickname;
  }
  return String(meta.label || provider || '账号');
}
function renderTopAccountPill(provider, opts) {
  opts = opts || {};
  var st = platformStatus(provider);
  var loggedIn = !!(st && st.loggedIn);
  if (!loggedIn && !opts.force) return '';
  var meta = platformMeta(provider);
  st = st || {};
  var displayName = loggedIn ? ((provider === 'qq' && st.preview) ? '待接入' : providerAccountIdentity(provider, st)) : meta.label;
  var vipTag = providerVipBadge(provider, st, '', true);
  return '<span class="top-account-pill ' + (loggedIn ? 'online' : 'offline') + '" data-account-provider="' + escHtml(provider) + '">' +
    providerAvatarHtml(provider, st) +
    '<span class="top-account-name">' + escHtml(displayName) + '</span>' +
    vipTag +
    '</span>';
}
function syncTopAccountPills(btn, providers) {
  var existing = Array.prototype.slice.call(btn.querySelectorAll('.top-account-pill'));
  var cursor = btn.firstChild;
  var changed = false;
  providers.forEach(function (provider) {
    var html = renderTopAccountPill(provider);
    var pill = existing.find(function (node) { return node.getAttribute('data-account-provider') === provider; });
    if (!pill || pill.__accountHtml !== html) {
      var template = document.createElement('template');
      template.innerHTML = html;
      var desired = template.content.firstElementChild;
      if (!pill) {
        pill = desired;
      } else {
        // Keep the loaded image and its bounded retry state across status updates.
        if (pill.className !== desired.className) pill.className = desired.className;
        setProviderAvatar(pill.querySelector('img'), provider, platformStatus(provider));
        var name = pill.querySelector('.top-account-name');
        var nextName = desired.querySelector('.top-account-name').textContent;
        if (name.textContent !== nextName) name.textContent = nextName;
        var badge = pill.querySelector('.top-account-vip');
        var nextBadge = desired.querySelector('.top-account-vip');
        if (badge && !nextBadge) badge.remove();
        else if (!badge && nextBadge) pill.appendChild(nextBadge);
        else if (badge && nextBadge && badge.outerHTML !== nextBadge.outerHTML) badge.replaceWith(nextBadge);
      }
      pill.__accountHtml = html;
      changed = true;
    }
    if (pill !== cursor) {
      btn.insertBefore(pill, cursor);
      changed = true;
    }
    cursor = pill.nextSibling;
  });
  while (cursor) {
    var next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
    changed = true;
  }
  return changed;
}
function bindTopAccountPillSorting() {
  var btn = document.getElementById('user-btn');
  if (!btn || btn.__accountPillSortBound) return;
  btn.__accountPillSortBound = true;
  btn.addEventListener('pointerdown', function (e) {
    var pill = e.target && e.target.closest ? e.target.closest('.top-account-pill[data-account-provider]') : null;
    if (!pill || !btn.contains(pill)) return;
    topAccountPillDrag = {
      provider: normalizeAccountProviderKey(pill.getAttribute('data-account-provider') || ''),
      startX: e.clientX,
      startY: e.clientY,
      dragging: false
    };
    try { btn.setPointerCapture(e.pointerId); } catch (_) { }
  });
  btn.addEventListener('pointermove', function (e) {
    if (!topAccountPillDrag) return;
    var dx = e.clientX - topAccountPillDrag.startX;
    var dy = e.clientY - topAccountPillDrag.startY;
    if (!topAccountPillDrag.dragging && Math.sqrt(dx * dx + dy * dy) < 7) return;
    topAccountPillDrag.dragging = true;
    topAccountPillClickSuppressed = true;
    btn.classList.add('pill-sorting');
    var pills = Array.prototype.slice.call(btn.querySelectorAll('.top-account-pill[data-account-provider]'));
    var beforeProvider = '';
    for (var i = 0; i < pills.length; i += 1) {
      var rect = pills[i].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        beforeProvider = pills[i].getAttribute('data-account-provider') || '';
        break;
      }
    }
    if (beforeProvider === topAccountPillDrag.provider) return;
    moveAccountProviderBefore(topAccountPillDrag.provider, beforeProvider);
    e.preventDefault();
  });
  function finish(e) {
    if (!topAccountPillDrag) return;
    var provider = topAccountPillDrag.provider;
    var dragged = topAccountPillDrag.dragging;
    topAccountPillDrag = null;
    btn.classList.remove('pill-sorting');
    try { btn.releasePointerCapture(e.pointerId); } catch (_) { }
    if (!dragged && provider) loginProvider = provider;
    if (dragged) setTimeout(function () { topAccountPillClickSuppressed = false; }, 120);
  }
  btn.addEventListener('pointerup', finish);
  btn.addEventListener('pointercancel', finish);
}
