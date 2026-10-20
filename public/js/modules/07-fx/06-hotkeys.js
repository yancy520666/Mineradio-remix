function getHotkeyDefaults() {
  var defaults = { local: {}, global: {} };
  HOTKEY_ACTIONS.forEach(function (action) {
    defaults.local[action.key] = action.local || '';
    defaults.global[action.key] = action.global || '';
  });
  return defaults;
}
function readHotkeySettings() {
  var defaults = getHotkeyDefaults();
  try {
    var raw = JSON.parse(localStorage.getItem(HOTKEY_SETTINGS_STORE_KEY) || '{}') || {};
    ['local', 'global'].forEach(function (scope) {
      HOTKEY_ACTIONS.forEach(function (action) {
        var saved = raw[scope] && raw[scope][action.key];
        if (typeof saved === 'string') defaults[scope][action.key] = saved;
      });
    });
    return defaults;
  } catch (e) {
    return defaults;
  }
}
function saveHotkeySettings() {
  try { localStorage.setItem(HOTKEY_SETTINGS_STORE_KEY, JSON.stringify(hotkeySettings || getHotkeyDefaults())); } catch (e) { }
}
function hotkeyActionMeta(actionKey) {
  for (var i = 0; i < HOTKEY_ACTIONS.length; i++) {
    if (HOTKEY_ACTIONS[i].key === actionKey) return HOTKEY_ACTIONS[i];
  }
  return null;
}
function isModifierKeyCode(code) {
  return /^(ControlLeft|ControlRight|ShiftLeft|ShiftRight|AltLeft|AltRight|MetaLeft|MetaRight)$/i.test(String(code || ''));
}
function normalizeHotkeyEvent(e) {
  if (!e || isModifierKeyCode(e.code)) return '';
  var mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  var code = e.code || '';
  if (!code && e.key) code = String(e.key).length === 1 ? 'Key' + String(e.key).toUpperCase() : String(e.key);
  if (!code) return '';
  return mods.concat([code]).join('+');
}
function hotkeyDisplayPart(part) {
  if (part === 'Ctrl') return 'Ctrl';
  if (part === 'Alt') return 'Alt';
  if (part === 'Shift') return 'Shift';
  if (part === 'Meta') return 'Win';
  if (part === 'Space') return 'Space';
  if (part === 'ArrowLeft') return 'Left';
  if (part === 'ArrowRight') return 'Right';
  if (part === 'ArrowUp') return 'Up';
  if (part === 'ArrowDown') return 'Down';
  if (/^Key[A-Z]$/.test(part)) return part.slice(3);
  if (/^Digit[0-9]$/.test(part)) return part.slice(5);
  if (/^Numpad[0-9]$/.test(part)) return 'Num' + part.slice(6);
  return part.replace(/^Equal$/, '=').replace(/^Minus$/, '-');
}
function formatHotkey(hotkey) {
  hotkey = String(hotkey || '').trim();
  if (!hotkey) return '已停用';
  return hotkey.split('+').map(hotkeyDisplayPart).join(' + ');
}
function localHotkeyBindings(action) {
  var binding = hotkeySettings.local[action.key] || '';
  return binding ? [binding].concat(binding === action.local ? action.localAliases || [] : []) : [];
}
function syncSearchShortcutTabOrder() {
  var area = document.getElementById('search-area');
  if (!area) return;
  var hidden = !area.classList.contains('peek') && hotkeySettings.local.focusSearch !== 'Tab';
  area.querySelectorAll('input, button, a[href], [tabindex]').forEach(function (node) {
    if (hidden && !node.hasAttribute('data-shortcut-tabindex')) {
      node.setAttribute('data-shortcut-tabindex', node.getAttribute('tabindex') || '');
      node.setAttribute('tabindex', '-1');
    } else if (!hidden && node.hasAttribute('data-shortcut-tabindex')) {
      var previous = node.getAttribute('data-shortcut-tabindex');
      if (previous === '') node.removeAttribute('tabindex');
      else node.setAttribute('tabindex', previous);
      node.removeAttribute('data-shortcut-tabindex');
    }
  });
}
function hotkeyToAccelerator(hotkey) {
  var parts = String(hotkey || '').split('+').filter(Boolean);
  if (!parts.length) return '';
  return parts.map(function (part) {
    if (part === 'Ctrl') return 'Control';
    if (part === 'Alt') return 'Alt';
    if (part === 'Shift') return 'Shift';
    if (part === 'Meta') return 'Super';
    if (part === 'Space') return 'Space';
    if (part === 'ArrowLeft') return 'Left';
    if (part === 'ArrowRight') return 'Right';
    if (part === 'ArrowUp') return 'Up';
    if (part === 'ArrowDown') return 'Down';
    if (/^Key[A-Z]$/.test(part)) return part.slice(3);
    if (/^Digit[0-9]$/.test(part)) return part.slice(5);
    return part;
  }).join('+');
}
function hotkeyDuplicateMap(scope) {
  var map = {};
  var source = (hotkeySettings && hotkeySettings[scope]) || {};
  HOTKEY_ACTIONS.forEach(function (action) {
    if (scope === 'global' && action.globalAllowed === false) return;
    var keys = scope === 'local' ? localHotkeyBindings(action) : [source[action.key]];
    keys.forEach(function (key) { if (key) map[key] = (map[key] || 0) + 1; });
  });
  return map;
}
function executeHotkeyAction(actionKey, source) {
  if (actionKey === 'focusSearch') {
    if (immersiveMode) return;
    var input = document.getElementById('search-input');
    setPeek(document.getElementById('search-area'), true, 'search');
    if (input) input.focus({ preventScroll: true });
    return;
  }
  if (actionKey === 'goHome') return goHome();
  if (actionKey === 'toggleLyrics') { if (!immersiveMode) toggleLyricsPanel(); return; }
  if (actionKey === 'toggleConsole') {
    if (!immersiveMode && diyPlayerMode) toggleFxPanelFromUser();
    else if (!immersiveMode) showToast('开启 DIY 玩家模式后可打开视觉控制台');
    return;
  }
  if (actionKey === 'toggleImmersive') return toggleImmersiveMode();
  if (actionKey === 'toggleFreeCamera') return toggleFreeCamera();
  if (actionKey === 'resetCamera') {
    if (freeCamera && (freeCamera.active || freeCamera.locked)) resetFreeCameraToDefault();
    else { recenterCamera(); showToast('镜头已回正'); }
    return;
  }
  if (actionKey === 'prevShelf') { if (shelfManager) shelfManager.prev(); return; }
  if (actionKey === 'nextShelf') { if (shelfManager) shelfManager.next(); return; }
  if (actionKey === 'togglePlay') return togglePlay();
  if (actionKey === 'prevTrack') return prevTrack(true);
  if (actionKey === 'nextTrack') return nextTrack(true);
  if (actionKey === 'volumeUp') return adjustVolumeByKeyboard(0.05);
  if (actionKey === 'volumeDown') return adjustVolumeByKeyboard(-0.05);
  if (actionKey === 'toggleFullscreen') return toggleFullscreen();
  if (actionKey === 'toggleDesktopInteraction') {
    var api = getDesktopWindowApi && getDesktopWindowApi();
    if (!api || typeof api.getState !== 'function') return;
    return api.getState().then(function (state) {
      if (state && state.isDesktopEmbedded) {
        fx.wallpaperMode = false;
        updateFxInputs();
        return applyWallpaperModeState(true).then(function (result) {
          if (result && result.ok === true) showToast('已退出完整桌面模式');
          return result;
        });
      }
      fx.wallpaperMode = true;
      updateFxInputs();
      return applyWallpaperModeState(true).then(function (result) {
        if (result && result.ok === true) showToast('完整桌面模式已开启 · ' + desktopInteractionHotkeyHint());
        return result;
      });
    }).catch(function () { });
  }
  if (actionKey === 'toggleDesktopLyrics') return toggleFx('desktopLyrics');
}
function desktopInteractionHotkeyHint() {
  var binding = hotkeySettings && hotkeySettings.global && hotkeySettings.global.toggleDesktopInteraction;
  return binding ? ('按 ' + formatHotkey(binding) + ' 进入 / 退出完整桌面模式') : '可在热键设置中配置完整桌面模式切换';
}
function handleConfiguredLocalHotkey(e) {
  if (e.defaultPrevented || e.isComposing || !hotkeySettings || !hotkeySettings.local || isKeyboardUiTarget(e.target)) return false;
  if (hotkeyCaptureState || document.getElementById('hotkey-modal') && document.getElementById('hotkey-modal').classList.contains('show')) return false;
  if (freeCamera && freeCamera.active && /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code) && hotkeySettings.local.toggleFreeCamera !== normalizeHotkeyEvent(e)) return false;
  var combo = normalizeHotkeyEvent(e);
  if (!combo) return false;
  var duplicate = hotkeyDuplicateMap('local');
  for (var i = 0; i < HOTKEY_ACTIONS.length; i++) {
    var action = HOTKEY_ACTIONS[i];
    if (localHotkeyBindings(action).indexOf(combo) < 0) continue;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat && !/^volume/.test(action.key)) return true;
    if (duplicate[combo] > 1) return true;
    if (action.key !== 'togglePlay') markRenderInteraction('keyboard', 700);
    executeHotkeyAction(action.key, 'local');
    return true;
  }
  return false;
}
function ensureHotkeySettingsButton() {
  var panel = document.getElementById('fx-panel');
  var head = panel && panel.querySelector('.fx-head');
  if (!head || document.getElementById('hotkey-settings-btn')) return;
  if (head.firstElementChild) head.firstElementChild.classList.add('fx-head-main');
  var actions = document.createElement('div');
  actions.className = 'fx-head-actions';
  var btn = document.createElement('button');
  btn.id = 'hotkey-settings-btn';
  btn.type = 'button';
  btn.className = 'fx-mini-btn ghost';
  btn.textContent = '快捷键';
  btn.addEventListener('click', openHotkeySettings);
  actions.appendChild(btn);
  head.appendChild(actions);
  var entry = document.createElement('div');
  entry.id = 'hotkey-settings-panel';
  entry.className = 'fx-shortcut-entry';
  entry.innerHTML = '<div><strong>让按键顺手一点</strong><p>调整搜索、播放和镜头操作；清空按键即可停用。</p></div><button type="button" class="fx-mini-btn">管理快捷键 <span aria-hidden="true">→</span></button>';
  entry.querySelector('button').addEventListener('click', openHotkeySettings);
  panel.appendChild(entry);
}
function ensureHotkeyModal() {
  var modal = document.getElementById('hotkey-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'hotkey-modal';
  modal.className = 'hotkey-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '快捷键管理');
  modal.innerHTML =
    '<div class="hotkey-dialog">' +
    '<div class="hotkey-head">' +
    '<div><div class="hotkey-title">快捷键管理</div><div class="hotkey-sub">点击按键后直接录入，修改自动保存。清空后，该功能的快捷键即停用。</div></div>' +
    '<button class="hotkey-close" type="button" data-hotkey-close aria-label="关闭">×</button>' +
    '</div>' +
    '<div class="hotkey-toolbar">' +
    '<div class="hotkey-tabs"><button type="button" data-hotkey-scope="local" class="active">应用内</button><button type="button" data-hotkey-scope="global">全局</button></div>' +
    '<div class="hotkey-note" id="hotkey-scope-note">仅在当前窗口内生效</div>' +
    '</div>' +
    '<div id="hotkey-local-section" class="hotkey-section active"></div>' +
    '<div id="hotkey-global-section" class="hotkey-section"></div>' +
    '<div class="hotkey-capture-tip" id="hotkey-capture-tip" role="status" aria-live="polite">点击按键开始录入 · Esc 取消 · Delete / Backspace 清空</div><div class="hotkey-footnote">Esc 保留为关闭 / 返回；自由镜头中的移动按键保持原有操作。</div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-hotkey-close]')) closeHotkeySettings();
    var scopeBtn = e.target.closest('[data-hotkey-scope]');
    if (scopeBtn) setHotkeyModalScope(scopeBtn.getAttribute('data-hotkey-scope'));
    var bindBtn = e.target.closest('[data-hotkey-bind]');
    if (bindBtn) startHotkeyCapture(bindBtn.getAttribute('data-hotkey-action'), bindBtn.getAttribute('data-hotkey-bind'));
    var clearBtn = e.target.closest('[data-hotkey-clear]');
    if (clearBtn) { hotkeyCaptureState = null; setHotkeyBinding(clearBtn.getAttribute('data-hotkey-action'), clearBtn.getAttribute('data-hotkey-clear'), ''); }
    var resetBtn = e.target.closest('[data-hotkey-reset]');
    if (resetBtn) resetHotkeyBinding(resetBtn.getAttribute('data-hotkey-action'), resetBtn.getAttribute('data-hotkey-reset'));
  });
  return modal;
}
function hotkeyStatusMarkup(scope, actionKey, binding, duplicate) {
  if (!binding) return '<span class="hotkey-status">已停用</span>';
  var keys = scope === 'local' ? localHotkeyBindings(hotkeyActionMeta(actionKey)) : [binding];
  if (duplicate && keys.some(function (key) { return duplicate[key] > 1; })) return '<span class="hotkey-status conflict">按键重复，已暂停</span>';
  if (scope === 'local') return '<span class="hotkey-status ok">已启用</span>';
  if (hotkeyCaptureState) return '<span class="hotkey-status">录入时暂停</span>';
  var status = hotkeyGlobalStatus[actionKey];
  var api = getDesktopWindowApi();
  if (!status) return '<span class="hotkey-status">' + (api && typeof api.configureGlobalHotkeys === 'function' ? '检测中' : '桌面端可用') + '</span>';
  if (status.ok) return '<span class="hotkey-status ok">可用</span>';
  var source = status.conflict && status.conflict.sourceName || '系统 / 其他软件';
  return '<span class="hotkey-status conflict"><span class="source-icon">!</span>' + escHtml(source) + '</span>';
}
function renderHotkeyScope(scope) {
  var wrap = document.getElementById(scope === 'global' ? 'hotkey-global-section' : 'hotkey-local-section');
  if (!wrap) return;
  var duplicate = hotkeyDuplicateMap(scope);
  var html = '';
  var groups = {};
  HOTKEY_ACTIONS.forEach(function (action) {
    if (scope === 'global' && action.globalAllowed === false) return;
    (groups[action.category] = groups[action.category] || []).push(action);
  });
  Object.keys(groups).forEach(function (category) {
    html += '<div class="hotkey-group"><div class="hotkey-group-title">' + escHtml(category) + '</div>';
    groups[category].forEach(function (action) {
      var binding = (hotkeySettings[scope] && hotkeySettings[scope][action.key]) || '';
      var capturing = hotkeyCaptureState && hotkeyCaptureState.scope === scope && hotkeyCaptureState.action === action.key;
      var keys = binding ? binding.split('+').map(function (part) { return '<kbd>' + escHtml(hotkeyDisplayPart(part)) + '</kbd>'; }).join('<span class="hotkey-plus">+</span>') : '<span class="hotkey-empty">未设置</span>';
      html += '<div class="hotkey-row">' +
        '<div class="hotkey-name">' + escHtml(action.label) + (action.hint ? '<small>' + escHtml(action.hint) + '</small>' : '') + (scope === 'local' && binding === action.local && action.localAliases ? '<small>也可使用 ' + escHtml(action.localAliases.map(hotkeyDisplayPart).join(' / ')) + '</small>' : '') + '</div>' +
        '<button class="hotkey-key' + (capturing ? ' capturing' : '') + '" type="button" aria-label="修改' + escHtml(action.label) + '快捷键，当前' + escHtml(formatHotkey(binding)) + '" data-hotkey-bind="' + scope + '" data-hotkey-action="' + action.key + '">' + (capturing ? '请按下按键…' : keys) + '</button>' +
        '<div class="hotkey-row-actions"><button class="hotkey-clear" type="button" title="清空并停用" aria-label="停用' + escHtml(action.label) + '快捷键" data-hotkey-clear="' + scope + '" data-hotkey-action="' + action.key + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>' +
        '<button class="hotkey-reset" type="button" title="恢复默认：' + escHtml(formatHotkey(action[scope])) + '" aria-label="恢复' + escHtml(action.label) + '默认快捷键" data-hotkey-reset="' + scope + '" data-hotkey-action="' + action.key + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg></button></div>' +
        hotkeyStatusMarkup(scope, action.key, binding, duplicate) + '</div>';
    });
    html += '</div>';
  });
  wrap.innerHTML = html;
}
function renderHotkeySettings() {
  var modal = ensureHotkeyModal();
  var focused = document.activeElement;
  var focusAction = focused && focused.getAttribute('data-hotkey-action');
  var focusKind = focusAction && ['bind', 'clear', 'reset'].find(function (kind) { return focused.hasAttribute('data-hotkey-' + kind); });
  var focusScope = focusKind && focused.getAttribute('data-hotkey-' + focusKind);
  var active = modal.getAttribute('data-scope') || 'local';
  modal.classList.toggle('capturing', !!hotkeyCaptureState);
  modal.querySelectorAll('[data-hotkey-scope]').forEach(function (btn) {
    var selected = btn.getAttribute('data-hotkey-scope') === active;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  var local = document.getElementById('hotkey-local-section');
  var global = document.getElementById('hotkey-global-section');
  if (local) local.classList.toggle('active', active === 'local');
  if (global) global.classList.toggle('active', active === 'global');
  renderHotkeyScope('local');
  renderHotkeyScope('global');
  document.getElementById('hotkey-scope-note').textContent = active === 'local' ? '仅在当前窗口内生效' : '切换到其他软件后也能使用';
  document.getElementById('hotkey-capture-tip').textContent = hotkeyCaptureState ? '正在录入：' + hotkeyActionMeta(hotkeyCaptureState.action).label + ' · Esc 取消 · Delete / Backspace 清空' : '点击按键开始录入 · 右侧 × 停用 · ↶ 恢复默认';
  if (focusAction && focusScope === active) {
    var nextFocus = modal.querySelector('[data-hotkey-' + focusKind + '="' + focusScope + '"][data-hotkey-action="' + focusAction + '"]');
    if (nextFocus) nextFocus.focus({ preventScroll: true });
  }
}
function setHotkeyModalScope(scope) {
  var modal = ensureHotkeyModal();
  var wasCapturing = !!hotkeyCaptureState;
  hotkeyCaptureState = null;
  modal.setAttribute('data-scope', scope === 'global' ? 'global' : 'local');
  renderHotkeySettings();
  if (wasCapturing) registerGlobalHotkeys();
}
function openHotkeySettings() {
  var modal = ensureHotkeyModal();
  modal.classList.add('show');
  modal.setAttribute('data-scope', modal.getAttribute('data-scope') || 'local');
  renderHotkeySettings();
  registerGlobalHotkeys();
  if (typeof activateModalAccessibility === 'function') activateModalAccessibility(modal);
}
function closeHotkeySettings() {
  var wasCapturing = !!hotkeyCaptureState;
  hotkeyCaptureState = null;
  var modal = document.getElementById('hotkey-modal');
  if (modal) {
    modal.classList.remove('show', 'capturing');
    if (typeof deactivateModalAccessibility === 'function') deactivateModalAccessibility(modal);
  }
  if (wasCapturing) registerGlobalHotkeys();
}
function startHotkeyCapture(action, scope) {
  var meta = hotkeyActionMeta(action);
  if (!meta || scope !== 'local' && scope !== 'global' || scope === 'global' && meta.globalAllowed === false) return;
  hotkeyCaptureState = { action: action, scope: scope === 'global' ? 'global' : 'local' };
  var modal = ensureHotkeyModal();
  modal.setAttribute('data-scope', hotkeyCaptureState.scope);
  renderHotkeySettings();
  registerGlobalHotkeys();
}
function setHotkeyBinding(action, scope, value) {
  var meta = hotkeyActionMeta(action);
  if (!meta || scope !== 'local' && scope !== 'global' || scope === 'global' && meta.globalAllowed === false) return;
  if (!hotkeySettings) hotkeySettings = getHotkeyDefaults();
  if (!hotkeySettings[scope]) hotkeySettings[scope] = {};
  hotkeySettings[scope][action] = value || '';
  saveHotkeySettings();
  syncSearchShortcutTabOrder();
  updateCameraHotkeyHint();
  renderHotkeySettings();
  registerGlobalHotkeys();
}
function resetHotkeyBinding(action, scope) {
  var meta = hotkeyActionMeta(action);
  if (!meta) return;
  hotkeyCaptureState = null;
  setHotkeyBinding(action, scope, scope === 'global' ? meta.global : meta.local);
}
var hotkeyRegistrationGeneration = 0;
function registerGlobalHotkeys() {
  var generation = ++hotkeyRegistrationGeneration;
  var api = getDesktopWindowApi && getDesktopWindowApi();
  if (!api || typeof api.configureGlobalHotkeys !== 'function') {
    hotkeyGlobalStatus = {};
    renderHotkeySettings();
    return Promise.resolve();
  }
  var duplicate = hotkeyDuplicateMap('global');
  var bindings = [];
  HOTKEY_ACTIONS.forEach(function (action) {
    var key = hotkeySettings.global && hotkeySettings.global[action.key];
    if (hotkeyCaptureState || action.globalAllowed === false || !key || duplicate[key] > 1) return;
    var accelerator = hotkeyToAccelerator(key);
    if (accelerator) bindings.push({ action: action.key, accelerator: accelerator });
  });
  hotkeyGlobalStatus = {};
  return api.configureGlobalHotkeys(bindings).then(function (res) {
    if (generation !== hotkeyRegistrationGeneration) return;
    var next = {};
    (res && res.results || []).forEach(function (item) {
      next[item.action] = item;
    });
    hotkeyGlobalStatus = next;
    renderHotkeySettings();
  }).catch(function () {
    if (generation !== hotkeyRegistrationGeneration) return;
    hotkeyGlobalStatus = {};
    bindings.forEach(function (binding) {
      hotkeyGlobalStatus[binding.action] = { ok: false, conflict: { sourceName: '检测失败，请重新打开' } };
    });
    renderHotkeySettings();
  });
}
function updateCameraHotkeyHint() {
  var hint = document.getElementById('free-camera-hint');
  if (!hint) return;
  var toggle = hotkeySettings.local.toggleFreeCamera;
  var reset = hotkeySettings.local.resetCamera;
  hint.textContent = '自由镜头 · ' + (toggle ? formatHotkey(toggle) + ' 固定/退出 · ' : '') + 'WASD 移动 · 鼠标转向 · Shift 加速 · Space/Ctrl 升降 · Q/E 轻微旋转 · 滚轮景深' + (reset ? ' · ' + formatHotkey(reset) + ' 回正' : '');
}
var globalHotkeyListenerBound = false;
var searchHotkeyObserver = null;
function bindHotkeySettings() {
  ensureHotkeySettingsButton();
  ensureHotkeyModal();
  syncSearchShortcutTabOrder();
  updateCameraHotkeyHint();
  var searchArea = document.getElementById('search-area');
  if (searchArea && !searchHotkeyObserver) {
    searchHotkeyObserver = new MutationObserver(syncSearchShortcutTabOrder);
    searchHotkeyObserver.observe(searchArea, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }
  if (!globalHotkeyListenerBound) {
    var api = getDesktopWindowApi && getDesktopWindowApi();
    if (api && typeof api.onGlobalHotkey === 'function') {
      globalHotkeyListenerBound = true;
      api.onGlobalHotkey(function (payload) {
        var meta = payload && hotkeyActionMeta(payload.action);
        if (hotkeyCaptureState || !meta || meta.globalAllowed === false || !hotkeySettings.global[meta.key]) return;
        executeHotkeyAction(payload.action, 'global');
      });
    }
  }
  registerGlobalHotkeys();
}
document.addEventListener('keydown', function (e) {
  var hotkeyModal = document.getElementById('hotkey-modal');
  if (!hotkeyCaptureState) {
    if (hotkeyModal && hotkeyModal.classList.contains('show') && e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeHotkeySettings();
    }
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  if (e.code === 'Escape') {
    hotkeyCaptureState = null;
    renderHotkeySettings();
    registerGlobalHotkeys();
    return;
  }
  if (e.code === 'Backspace' || e.code === 'Delete') {
    var clearTarget = hotkeyCaptureState;
    hotkeyCaptureState = null;
    setHotkeyBinding(clearTarget.action, clearTarget.scope, '');
    return;
  }
  var combo = normalizeHotkeyEvent(e);
  if (!combo) return;
  var target = hotkeyCaptureState;
  hotkeyCaptureState = null;
  setHotkeyBinding(target.action, target.scope, combo);
}, true);
