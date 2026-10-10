// A small, optional setup hint. Device enumeration is owned by the routing UI;
// this module never requests a microphone, downloads a file or installs a driver.
var virtualAudioSetupSessionKey = 'mineradio-virtual-audio-setup-offered-v1';
var virtualAudioSetupWasOffered = false;
try { virtualAudioSetupWasOffered = sessionStorage.getItem(virtualAudioSetupSessionKey) === '1'; } catch (_) { }
var virtualAudioSetupCard = null;
var virtualAudioSetupCardVisible = false;
var virtualAudioSetupReturnFocus = null;
var virtualAudioSetupEntry = null;
var virtualAudioSetupInfo = null;
var virtualAudioSetupInfoRequested = false;
var virtualAudioSetupPending = false;
var virtualAudioSetupCancelPending = false;
var virtualAudioSetupState = null;
var virtualAudioSetupStateSubscribed = false;
var virtualAudioSetupCanUseOfficialFallback = false;
var virtualAudioSetupFeedbackMessage = '';
var virtualAudioSetupViewToken = 0;
var virtualAudioSetupRouteDismissed = false;

function virtualAudioSetupBridge() {
  return typeof window !== 'undefined' && window.desktopWindow || null;
}
function virtualAudioSetupRouteIsOpen() {
  var modal = document.getElementById('audio-output-workflow-modal');
  return !!(!virtualAudioSetupRouteDismissed && modal && modal.classList.contains('show') && modal.getAttribute('aria-hidden') !== 'true');
}
function beginVirtualAudioSetupRoute() {
  virtualAudioSetupRouteDismissed = false;
  virtualAudioSetupViewToken += 1;
}
function virtualAudioSetupIsSupported() {
  var bridge = virtualAudioSetupBridge();
  return !!(bridge && typeof bridge.beginVirtualAudioSetup === 'function'
    && (!virtualAudioSetupInfo || virtualAudioSetupInfo.supported !== false));
}
function virtualAudioSetupIsBusy() {
  return virtualAudioSetupPending || !!(virtualAudioSetupState && virtualAudioSetupState.busy);
}
function virtualAudioSetupStageMessage(state) {
  if (!state) return '';
  if (state.phase === 'error' && (state.error === 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN' || state.busy)) {
    return '安装程序状态未知，请在官方安装窗口中检查';
  }
  var messages = {
    downloading: '正在下载官方驱动…', verifying: '正在校验官方驱动…',
    handoff: '请在系统确认和官方安装程序中继续',
    'installer-opened': '安装程序已打开，完成后重启并刷新接口',
    'installer-exited': '安装程序已结束，重启后刷新接口',
    canceled: '驱动准备已取消', error: '驱动准备失败，可重试或打开官方安装页',
  };
  return messages[state.phase] || '';
}
function virtualAudioSetupHideAction(root, action, hidden) {
  if (!action) return;
  if (hidden && document.activeElement === action && virtualAudioSetupRouteIsOpen()) {
    var modal = document.getElementById('audio-output-workflow-modal');
    var target = root === virtualAudioSetupCard && root.querySelector('[data-virtual-audio-dismiss]')
      || modal.querySelector('[data-mixer-expand], .login-panel-close') || modal;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }
  action.hidden = hidden;
}
function renderVirtualAudioSetupState() {
  var bridge = virtualAudioSetupBridge();
  var canCancel = !!(bridge && typeof bridge.cancelVirtualAudioSetup === 'function'
    && virtualAudioSetupState && virtualAudioSetupState.canCancel);
  var message = virtualAudioSetupRouteIsOpen()
    ? virtualAudioSetupFeedbackMessage || virtualAudioSetupStageMessage(virtualAudioSetupState) : '';
  [virtualAudioSetupEntry, virtualAudioSetupCard].forEach(function (root) {
    if (!root) return;
    var cancel = root.querySelector('[data-virtual-audio-cancel]');
    var fallback = root.querySelector('[data-virtual-audio-official]');
    var status = root.querySelector('[data-virtual-audio-status]');
    if (cancel) { virtualAudioSetupHideAction(root, cancel, !canCancel); cancel.disabled = !canCancel || virtualAudioSetupCancelPending; }
    if (fallback) { virtualAudioSetupHideAction(root, fallback, !virtualAudioSetupCanUseOfficialFallback); fallback.disabled = virtualAudioSetupPending; }
    if (status) {
      status.textContent = message;
      // One status line is enough while the optional hint is visible.
      status.hidden = !message || (root === virtualAudioSetupEntry && virtualAudioSetupCardVisible);
    }
  });
}
function updateVirtualAudioSetupEntry(panel) {
  var supported = virtualAudioSetupIsSupported();
  var title = supported ? '获取 VB-CABLE 官方驱动，安装前会再次确认'
    : '请在 Windows 桌面版打开驱动安装设置';
  [virtualAudioSetupEntry, virtualAudioSetupCard].forEach(function (root) {
    if (!root) return;
    var button = root.querySelector('[data-virtual-audio-install]');
    button.disabled = !supported || virtualAudioSetupIsBusy();
    button.title = title;
    button.setAttribute('aria-busy', String(virtualAudioSetupIsBusy()));
  });
  // The host may have been rebuilt since the last device refresh.
  if (panel && virtualAudioSetupEntry && !panel.contains(virtualAudioSetupEntry)) mountVirtualAudioSetupEntry(panel);
  renderVirtualAudioSetupState();
}
function mountVirtualAudioSetupEntry(panel) {
  if (!panel) return;
  var head = panel.querySelector('.audio-mixer-head');
  if (!head) return;
  if (!virtualAudioSetupEntry) {
    virtualAudioSetupEntry = document.createElement('span');
    virtualAudioSetupEntry.className = 'audio-virtual-setup-entry';
    virtualAudioSetupEntry.innerHTML = '<button type="button" data-virtual-audio-install>下载驱动</button>'
      + '<button type="button" data-virtual-audio-cancel hidden>取消下载</button>'
      + '<button type="button" data-virtual-audio-official hidden>官方安装页</button>'
      + '<span class="virtual-audio-entry-status" data-virtual-audio-status role="status" hidden></span>';
    virtualAudioSetupEntry.addEventListener('click', function (event) {
      if (event.target.closest('[data-virtual-audio-install]')) beginVirtualAudioSetupFromUi();
      else if (event.target.closest('[data-virtual-audio-cancel]')) cancelVirtualAudioSetupFromUi();
      else if (event.target.closest('[data-virtual-audio-official]')) beginVirtualAudioSetupFromUi('official');
    });
  }
  if (virtualAudioSetupEntry.parentNode !== head) {
    var enable = head.querySelector('[data-mixer-enable]');
    head.insertBefore(virtualAudioSetupEntry, enable || null);
  }
  updateVirtualAudioSetupEntry();
  var bridge = virtualAudioSetupBridge();
  if (!virtualAudioSetupStateSubscribed && bridge && typeof bridge.onVirtualAudioSetupState === 'function') {
    try {
      bridge.onVirtualAudioSetupState(function (state) {
        if (!state || typeof state !== 'object') return;
        virtualAudioSetupState = state;
        virtualAudioSetupFeedbackMessage = '';
        virtualAudioSetupCanUseOfficialFallback = state.phase === 'error' && state.fallbackAvailable === true;
        updateVirtualAudioSetupEntry();
      });
      virtualAudioSetupStateSubscribed = true;
    } catch (_) { /* A disconnected bridge must not block the routing controls. */ }
  }
  if (!virtualAudioSetupInfoRequested && bridge && typeof bridge.getVirtualAudioSetupInfo === 'function') {
    virtualAudioSetupInfoRequested = true;
    // A capability read has no installation or permission side effects.
    Promise.resolve().then(function () { return bridge.getVirtualAudioSetupInfo(); }).then(function (info) {
      if (info && typeof info === 'object') {
        virtualAudioSetupInfo = info;
        if (!virtualAudioSetupState && info.operation && typeof info.operation === 'object') {
          virtualAudioSetupState = info.operation;
          virtualAudioSetupCanUseOfficialFallback = info.operation.phase === 'error' && info.operation.fallbackAvailable === true;
        }
      }
      updateVirtualAudioSetupEntry();
    }).catch(function () { /* Keep the explicit, guarded setup action available. */ });
  }
}
function virtualAudioSetupRestoreFocus() {
  if (!virtualAudioSetupCard || !virtualAudioSetupCard.contains(document.activeElement) || !virtualAudioSetupRouteIsOpen()) return;
  var modal = document.getElementById('audio-output-workflow-modal');
  var target = virtualAudioSetupReturnFocus;
  if (!target || !target.isConnected || !modal.contains(target) || virtualAudioSetupCard.contains(target)) {
    target = virtualAudioSetupEntry && virtualAudioSetupEntry.querySelector('[data-virtual-audio-install]');
    if (!target || !target.isConnected || target.disabled) target = modal.querySelector('[data-mixer-expand], .login-panel-close') || modal;
  }
  if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
}
function hideVirtualAudioSetupCard(restoreFocus) {
  // A route Close takes effect immediately, before its fade animation removes
  // .show. Only an explicit Open may release this late-enumeration guard.
  if (restoreFocus !== true) virtualAudioSetupRouteDismissed = true;
  virtualAudioSetupViewToken += 1;
  virtualAudioSetupCardVisible = false;
  if (virtualAudioSetupCard) {
    if (restoreFocus) virtualAudioSetupRestoreFocus();
    virtualAudioSetupCard.hidden = true;
  }
  renderVirtualAudioSetupState();
}
function dismissVirtualAudioSetupCard() {
  hideVirtualAudioSetupCard(true);
}
function createVirtualAudioSetupCard() {
  if (virtualAudioSetupCard) return virtualAudioSetupCard;
  virtualAudioSetupCard = document.createElement('section');
  virtualAudioSetupCard.id = 'virtual-audio-setup-card';
  virtualAudioSetupCard.setAttribute('aria-label', '虚拟音频驱动设置');
  virtualAudioSetupCard.hidden = true;
  virtualAudioSetupCard.innerHTML = '<p class="virtual-audio-setup-copy" role="status">未检测到虚拟音频输出。安装后可将音乐与人声一起送到游戏。</p>'
    + '<div class="virtual-audio-setup-actions"><button class="modal-btn primary" type="button" data-virtual-audio-install>安装虚拟音频驱动</button>'
    + '<button class="modal-btn" type="button" data-virtual-audio-dismiss>暂不安装</button>'
    + '<button class="modal-btn" type="button" data-virtual-audio-cancel hidden>取消下载</button>'
    + '<button class="modal-btn" type="button" data-virtual-audio-official hidden>官方安装页</button></div>'
    + '<button class="virtual-audio-setup-close" type="button" data-virtual-audio-dismiss aria-label="关闭虚拟音频设置提示">×</button>'
    + '<p class="virtual-audio-setup-feedback" data-virtual-audio-status role="status" hidden></p>';
  virtualAudioSetupCard.addEventListener('click', function (event) {
    if (event.target.closest('[data-virtual-audio-dismiss]')) { dismissVirtualAudioSetupCard(); return; }
    if (event.target.closest('[data-virtual-audio-install]')) beginVirtualAudioSetupFromUi();
    else if (event.target.closest('[data-virtual-audio-cancel]')) cancelVirtualAudioSetupFromUi();
    else if (event.target.closest('[data-virtual-audio-official]')) beginVirtualAudioSetupFromUi('official');
  });
  return virtualAudioSetupCard;
}
function syncVirtualAudioSetupCard(snapshot) {
  snapshot = snapshot || {};
  var panel = document.getElementById('audio-microphone-mixer');
  if (panel) mountVirtualAudioSetupEntry(panel);
  // Check the live modal as well as the caller's snapshot. An enumeration that
  // finishes after Close must never re-open this hint or steal keyboard focus.
  if (snapshot.routeOpen !== true || !virtualAudioSetupRouteIsOpen()) { hideVirtualAudioSetupCard(); return; }
  if (typeof microphoneMixerState === 'function' && /^(starting|running)$/.test(microphoneMixerState().phase)) {
    hideVirtualAudioSetupCard(true); return;
  }
  if (snapshot.enumerationComplete !== true || !Array.isArray(snapshot.outputs)
    || typeof isVirtualMicOutputDevice !== 'function') { hideVirtualAudioSetupCard(true); return; }
  var outputs = snapshot.outputs;
  if (outputs.some(function (device) { return device && !device.offline && isVirtualMicOutputDevice(device); })) {
    hideVirtualAudioSetupCard(true); return;
  }
  // An unlabeled or saved-offline endpoint is inconclusive, not proof that a
  // driver is absent. Test every live output, including the chosen main output.
  if (outputs.some(function (device) {
    return !device || device.offline || !device.deviceId || !String(device.label || '').trim()
      || (device.kind && device.kind !== 'audiooutput');
  })) { hideVirtualAudioSetupCard(true); return; }
  if (virtualAudioSetupWasOffered && !virtualAudioSetupCardVisible) return;
  var body = document.getElementById('audio-output-workflow-body');
  if (!body) return;
  var card = createVirtualAudioSetupCard();
  if (!virtualAudioSetupCardVisible) {
    virtualAudioSetupReturnFocus = document.activeElement;
    virtualAudioSetupCardVisible = true;
    virtualAudioSetupWasOffered = true;
    try { sessionStorage.setItem(virtualAudioSetupSessionKey, '1'); } catch (_) { }
  }
  if (card.parentNode !== body) body.insertBefore(card, body.firstChild || null);
  card.hidden = false;
  updateVirtualAudioSetupEntry();
}
function virtualAudioSetupFeedback(message) {
  if (!message) return;
  virtualAudioSetupFeedbackMessage = message;
  renderVirtualAudioSetupState();
  if (!virtualAudioSetupEntry && !virtualAudioSetupCardVisible && typeof showToast === 'function') showToast(message);
}
function virtualAudioSetupFailureMessage(result, topic) {
  if (topic === 'official') return '官方安装页暂时无法打开，请重试';
  if (result && result.error === 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN'
    || virtualAudioSetupState && virtualAudioSetupState.phase === 'error' && virtualAudioSetupState.busy) {
    return '安装程序状态未知，请在官方安装窗口中检查';
  }
  if (result && result.error === 'VIRTUAL_AUDIO_SETUP_BUSY') return '官方驱动设置正在进行，请完成当前操作';
  if (result && result.error === 'VIRTUAL_AUDIO_SETUP_UNSUPPORTED') return '请在 Windows 桌面版安装虚拟音频驱动';
  return '安装设置暂时无法打开，请重试';
}
async function beginVirtualAudioSetupFromUi(topic) {
  topic = topic === 'official' ? 'official' : 'install';
  if ((topic === 'official' ? virtualAudioSetupPending : virtualAudioSetupIsBusy()) || !virtualAudioSetupIsSupported()
    || (topic === 'official' && !virtualAudioSetupCanUseOfficialFallback)) return;
  var bridge = virtualAudioSetupBridge(), viewToken = virtualAudioSetupViewToken;
  virtualAudioSetupPending = true;
  if (topic === 'install') virtualAudioSetupState = null;
  virtualAudioSetupFeedbackMessage = '';
  if (topic === 'install') virtualAudioSetupCanUseOfficialFallback = false;
  updateVirtualAudioSetupEntry();
  try {
    // Invoke immediately inside the user's click to preserve user activation.
    // The native layer owns source/privilege/reboot disclosures and confirmation.
    var result = await bridge.beginVirtualAudioSetup(topic);
    if (viewToken !== virtualAudioSetupViewToken || !virtualAudioSetupRouteIsOpen()) return result;
    if (result && result.canceled) return result;
    if (result && result.fallbackAvailable === true) virtualAudioSetupCanUseOfficialFallback = true;
    if (result && result.ok && result.opened && result.mode === 'official-guide') {
      dismissVirtualAudioSetupCard();
      if (typeof showToast === 'function') showToast('官方安装指引已打开，完成后重启并刷新接口');
    } else if (result && result.ok && result.installerOpened && result.mode === 'guided-installer') {
      dismissVirtualAudioSetupCard();
      if (typeof showToast === 'function') showToast('安装程序已打开，完成后重启并刷新接口');
    } else if (!result || !result.ok) {
      virtualAudioSetupFeedback(virtualAudioSetupFailureMessage(result, topic));
    }
    return result;
  } catch (_) {
    if (viewToken === virtualAudioSetupViewToken && virtualAudioSetupRouteIsOpen()) {
      virtualAudioSetupFeedback(virtualAudioSetupFailureMessage(null, topic));
    }
  } finally {
    virtualAudioSetupPending = false;
    updateVirtualAudioSetupEntry();
  }
}
async function cancelVirtualAudioSetupFromUi() {
  var bridge = virtualAudioSetupBridge(), viewToken = virtualAudioSetupViewToken;
  if (!bridge || typeof bridge.cancelVirtualAudioSetup !== 'function'
    || !virtualAudioSetupState || !virtualAudioSetupState.canCancel || virtualAudioSetupCancelPending) return;
  virtualAudioSetupCancelPending = true;
  renderVirtualAudioSetupState();
  try {
    var result = await bridge.cancelVirtualAudioSetup();
    // Dismissing a hint never stops a driver installer. Once Windows/installer
    // has taken over, only the user can cancel in that native interface.
    if (viewToken === virtualAudioSetupViewToken && virtualAudioSetupRouteIsOpen()
      && result && result.error === 'VIRTUAL_AUDIO_INSTALLER_HANDOFF_IN_PROGRESS') {
      virtualAudioSetupFeedback('官方安装程序已接管，请在安装窗口中操作');
    } else if (viewToken === virtualAudioSetupViewToken && virtualAudioSetupRouteIsOpen() && result && !result.ok) {
      virtualAudioSetupFeedback('暂时无法取消下载，请重试');
    }
    return result;
  } catch (_) {
    if (viewToken === virtualAudioSetupViewToken && virtualAudioSetupRouteIsOpen()) virtualAudioSetupFeedback('暂时无法取消下载，请重试');
  } finally {
    virtualAudioSetupCancelPending = false;
    updateVirtualAudioSetupEntry();
  }
}

// Keep this inline hint keyboard-accessible without taking focus on arrival.
// Escape is owned only while its controls have focus; ordinary route Escape
// continues to close the routing window through its existing accessibility code.
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('keydown', function (event) {
  if (event.defaultPrevented || event.isComposing || event.key !== 'Escape'
    || !virtualAudioSetupCardVisible || !virtualAudioSetupCard || virtualAudioSetupCard.hidden
    || !virtualAudioSetupRouteIsOpen() || !virtualAudioSetupCard.contains(document.activeElement)) return;
  event.preventDefault(); event.stopImmediatePropagation(); dismissVirtualAudioSetupCard();
}, true);
