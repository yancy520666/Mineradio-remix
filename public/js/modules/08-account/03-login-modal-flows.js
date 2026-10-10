var loginRefreshRequestSeq = 0;
var loginAttemptCurrent = null;
var providerAuthEpochs = {};
function providerAuthEpoch(provider) { return providerAuthEpochs[provider] || 0; }
function invalidateProviderAuthSession(provider) {
  providerAuthEpochs[provider] = providerAuthEpoch(provider) + 1;
  if (typeof invalidatePlaybackQualityRuntimeCaps === 'function') invalidatePlaybackQualityRuntimeCaps(provider);
  try { window.dispatchEvent(new CustomEvent('provider-auth-session-changed', { detail: { provider: provider } })); } catch (e) { }
}
function isLoginAttemptCurrent(attempt) {
  return !!(attempt && loginAttemptCurrent === attempt && loginProvider === attempt.provider && loginRefreshRequestSeq === attempt.seq);
}
function cancelServerLoginAttempt(attempt) {
  if (!attempt || !attempt.id) return;
  apiJson('/api/login/attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: attempt.provider, action: 'cancel', attemptId: attempt.id }) }).catch(function () { });
}
function invalidateLoginAttempt(provider) {
  if (loginAttemptCurrent && (!provider || loginAttemptCurrent.provider === provider)) {
    var attempt = loginAttemptCurrent;
    loginAttemptCurrent = null;
    cancelServerLoginAttempt(attempt);
    if (attempt.provider === 'netease') neteaseWebLoginBusy = false;
    if (attempt.provider === 'qq') qqWebLoginBusy = false;
    if (attempt.provider === 'kugou') { kugouWebLoginBusy = false; kugouCookieBusy = false; }
    else qqCookieBusy = false;
  }
  if (!provider || provider === loginProvider) {
    loginRefreshRequestSeq += 1;
    qrKey = null;
    stopQrPoll();
  }
}
async function beginRendererLoginAttempt(provider) {
  invalidateLoginAttempt();
  var attempt = { provider: provider, seq: loginRefreshRequestSeq, id: '' };
  loginAttemptCurrent = attempt;
  invalidateProviderAuthSession(provider);
  var result;
  try {
    result = await apiJson('/api/login/attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider, action: 'begin' }) });
  } catch (e) {
    if (!isLoginAttemptCurrent(attempt)) return null;
    loginAttemptCurrent = null;
    throw e;
  }
  attempt.id = result && result.attemptId;
  if (!isLoginAttemptCurrent(attempt)) { cancelServerLoginAttempt(attempt); return null; }
  if (!attempt.id) { loginAttemptCurrent = null; throw new Error('无法开始登录，请重试'); }
  return attempt;
}
function scheduleLoginAttemptClose(attempt, callback, delay) {
  setTimeout(function () {
    if (!isLoginAttemptCurrent(attempt)) return;
    closeLoginModal();
    callback();
  }, delay);
}
var loginWorkflowDrag = null;
var LOGIN_WORKFLOW_CONNECTION_STORE_KEY = 'mineradio-login-workflow-connections-v1';
var LOGIN_WORKFLOW_PROVIDERS = ['netease', 'qq', 'kugou', 'qishui'];
var loginWorkflowPendingProvider = '';
var loginWorkflowVerifiedSession = {};
var loginProviderPointer = null;
var loginProviderClickSuppressed = false;
var loginWorkflowEdgeRenderFrame = 0;
var loginWorkflowEdgeRenderTimers = [];
var loginWorkflowPointerFrame = 0;
var loginWorkflowPointerPoint = null;
var loginWorkflowHoverProvider = '';
var loginWorkflowRetracts = [];
var loginWorkflowRetractFrame = 0;
var loginWorkflowPendingLogout = null;
var loginWorkflowCommittingLogout = {};
var LOGIN_WORKFLOW_LOGOUT_DELAY_MS = 4000;

function isLoginRefreshCurrent(provider, seq) {
  return loginProvider === provider && loginRefreshRequestSeq === seq;
}

function normalizeLoginProviderKey(provider) {
  return provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : 'netease'));
}
function loginProviderSupportsCookieMode(provider) {
  provider = normalizeLoginProviderKey(provider);
  return provider !== 'qishui';
}
function loginProviderOfficialModeText(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'qishui') return { title: '扫码', sub: '使用抖音 App 官方授权' };
  if (provider === 'kugou') return { title: '官网', sub: '弹出酷狗官方窗口' };
  return { title: '扫码', sub: '连接后弹出官方窗口' };
}
function setManualCookieOpenForProvider(provider, open) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'netease') neteaseManualCookieOpen = !!open;
  else if (provider === 'qq') qqManualCookieOpen = !!open;
  else if (provider === 'kugou') kugouManualCookieOpen = !!open;
  else if (provider === 'qishui') qishuiManualCookieOpen = false;
}
function isManualCookieOpenForProvider(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (provider === 'netease') return !!neteaseManualCookieOpen;
  if (provider === 'qq') return !!qqManualCookieOpen;
  if (provider === 'kugou') return !!kugouManualCookieOpen;
  if (provider === 'qishui') return false;
  return false;
}
function readLoginWorkflowConnections() {
  try { localStorage.removeItem(LOGIN_WORKFLOW_CONNECTION_STORE_KEY); } catch (e) { }
  return [];
}
function saveLoginWorkflowConnections(list) {
  try { localStorage.removeItem(LOGIN_WORKFLOW_CONNECTION_STORE_KEY); } catch (e) { }
}
function providerHasLiveLogin(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (loginWorkflowPendingLogout && loginWorkflowPendingLogout.provider === provider) return false;
  if (loginWorkflowCommittingLogout[provider]) return false;
  if (loginWorkflowVerifiedSession && loginWorkflowVerifiedSession[provider]) return true;
  try { return typeof hasPlatformLogin === 'function' && hasPlatformLogin(provider); } catch (e) { return false; }
}
function loginWorkflowConnectedProviders() {
  return loginWorkflowProviderOrder().filter(providerHasLiveLogin);
}
function loginWorkflowProviderOrder() {
  try { return accountProviderOrder(); } catch (e) { return LOGIN_WORKFLOW_PROVIDERS.slice(); }
}
function syncLoginWorkflowConnectionsFromStatus() {
  saveLoginWorkflowConnections([]);
  return loginWorkflowConnectedProviders();
}
function hasLoginWorkflowConnection(provider) {
  provider = normalizeLoginProviderKey(provider);
  return loginWorkflowConnectedProviders().indexOf(provider) >= 0;
}
function markLoginWorkflowConnected(provider) {
  provider = normalizeLoginProviderKey(provider);
  loginWorkflowVerifiedSession[provider] = true;
  autoShowAccountProviderOnFirstLogin(provider);
}
function setLoginAuthDrawerOpen(open) {
  var drawer = document.getElementById('login-auth-drawer');
  var modal = document.querySelector('#login-modal .dual-login-modal');
  if (modal) modal.classList.toggle('login-details-open', !!open);
  if (drawer) drawer.classList.toggle('show', !!open);
  if (!open) {
    invalidateLoginAttempt(loginProvider);
    loginWorkflowPendingProvider = '';
    try { stopQrPoll(); } catch (e) { }
    cancelInlineLoginQr();
  }
}
function markLoginNodeConnecting() {
  var graph = document.getElementById('login-node-graph');
  if (!graph) return;
  graph.classList.remove('connecting');
  void graph.offsetWidth;
  graph.classList.add('connecting');
  setTimeout(function () { graph.classList.remove('connecting'); }, 980);
}
function loginWorkflowActiveMode() {
  return isManualCookieOpenForProvider(loginProvider) ? 'cookie' : 'official';
}
function workflowPointForPort(port, root) {
  if (!port || !root) return null;
  var portRect = port.getBoundingClientRect();
  var rootRect = root.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width / 2 - rootRect.left,
    y: portRect.top + portRect.height / 2 - rootRect.top
  };
}
function workflowPointFromEvent(e, root) {
  if (!e || !root) return null;
  var rootRect = root.getBoundingClientRect();
  return { x: e.clientX - rootRect.left, y: e.clientY - rootRect.top };
}
function workflowPointDistance(a, b) {
  if (!a || !b) return Infinity;
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function loginWorkflowMrTargetPoint(graph) {
  if (!graph) return null;
  return workflowPointForPort(graph.querySelector('[data-login-mr-target="mr"]'), graph);
}
// Near the MR port the loose end is pulled in gradually (smoothstep) instead
// of jumping onto the port.
function loginWorkflowSnapPoint(point, graph) {
  var mr = loginWorkflowMrTargetPoint(graph);
  if (!point || !mr) return point;
  var d = workflowPointDistance(point, mr);
  if (d >= 92) return point;
  var k = 1 - d / 92;
  k = k * k * (3 - 2 * k);
  return { x: point.x + (mr.x - point.x) * k, y: point.y + (mr.y - point.y) * k };
}
function loginWorkflowNearMr(point, graph) {
  var mr = loginWorkflowMrTargetPoint(graph);
  return !!(point && mr && workflowPointDistance(point, mr) <= 108);
}
function workflowBezierPath(a, b) {
  var gap = Math.abs(b.x - a.x);
  var dx = Math.max(18, Math.min(86, gap * 0.55));
  return 'M ' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
    ' C ' + (a.x + dx).toFixed(1) + ' ' + a.y.toFixed(1) +
    ', ' + (b.x - dx).toFixed(1) + ' ' + b.y.toFixed(1) +
    ', ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
}
function appendWorkflowPath(svg, from, to, className) {
  if (!svg || !from || !to) return;
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', workflowBezierPath(from, to));
  path.setAttribute('class', className || 'workflow-link');
  svg.appendChild(path);
}
function clearWorkflowSvg(svg) {
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}
function renderLoginWorkflowEdges(tempPoint) {
  var graph = document.getElementById('login-node-graph');
  var svg = document.getElementById('login-workflow-svg');
  if (!graph || !svg) return;
  var w = Math.max(1, graph.clientWidth || 1);
  var h = Math.max(1, graph.clientHeight || 1);
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  clearWorkflowSvg(svg);
  var mrIn = graph.querySelector('[data-login-mr-target="mr"]');
  var unplugging = loginWorkflowDrag && loginWorkflowDrag.source === 'unplug' ? loginWorkflowDrag.provider : '';
  loginWorkflowConnectedProviders().forEach(function (provider) {
    if (provider === unplugging) return;
    var providerOut = graph.querySelector('[data-login-provider-output="' + provider + '"]');
    appendWorkflowPath(svg, workflowPointForPort(providerOut, graph), workflowPointForPort(mrIn, graph), 'workflow-link active' + (provider === loginProvider ? ' selected' : '') + (provider === loginWorkflowHoverProvider ? ' hover' : ''));
  });
  loginWorkflowRetracts.forEach(function (item) {
    var out = graph.querySelector('[data-login-provider-output="' + item.provider + '"]');
    var a = workflowPointForPort(out, graph);
    if (!a || !item.point) return;
    appendWorkflowPath(svg, a, item.point, 'workflow-link retract ' + (item.kind || 'temp'));
  });
  if (loginWorkflowPendingProvider && !providerHasLiveLogin(loginWorkflowPendingProvider)) {
    var pendingOut = graph.querySelector('[data-login-provider-output="' + loginWorkflowPendingProvider + '"]');
    appendWorkflowPath(svg, workflowPointForPort(pendingOut, graph), workflowPointForPort(mrIn, graph), 'workflow-link pending');
  }
  if (loginWorkflowDrag && tempPoint) {
    appendWorkflowPath(svg, workflowPointForPort(loginWorkflowDrag.port, graph), loginWorkflowSnapPoint(tempPoint, graph), unplugging ? 'workflow-link active selected unplug' : 'workflow-link temp');
  }
}
// Pointer moves can arrive faster than frames; draw at most once per frame.
function scheduleLoginWorkflowPointerRender(point) {
  loginWorkflowPointerPoint = point;
  if (loginWorkflowPointerFrame) return;
  loginWorkflowPointerFrame = requestAnimationFrame(function () {
    loginWorkflowPointerFrame = 0;
    if (loginWorkflowDrag) renderLoginWorkflowEdges(loginWorkflowPointerPoint);
  });
}
function cancelLoginWorkflowPointerRender() {
  if (loginWorkflowPointerFrame) cancelAnimationFrame(loginWorkflowPointerFrame);
  loginWorkflowPointerFrame = 0;
}
function loginWorkflowReducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
// A released loose end slides back into its platform port instead of vanishing.
function retractLoginWorkflowWire(provider, from, kind) {
  var graph = document.getElementById('login-node-graph');
  var out = graph && graph.querySelector('[data-login-provider-output="' + provider + '"]');
  var to = workflowPointForPort(out, graph);
  if (!graph || !from || !to || loginWorkflowReducedMotion()) {
    scheduleLoginWorkflowEdges('retract-skip');
    return;
  }
  loginWorkflowRetracts = loginWorkflowRetracts.filter(function (item) { return item.provider !== provider; });
  loginWorkflowRetracts.push({ provider: provider, from: from, point: from, kind: kind || 'temp', start: performance.now(), duration: 240 });
  if (loginWorkflowRetractFrame) return;
  var step = function (now) {
    loginWorkflowRetractFrame = 0;
    var g = document.getElementById('login-node-graph');
    loginWorkflowRetracts = loginWorkflowRetracts.filter(function (item) {
      var port = g && workflowPointForPort(g.querySelector('[data-login-provider-output="' + item.provider + '"]'), g);
      var t = Math.min(1, (now - item.start) / item.duration);
      if (!port || t >= 1) return false;
      var e = 1 - Math.pow(1 - t, 3);
      item.point = { x: item.from.x + (port.x - item.from.x) * e, y: item.from.y + (port.y - item.from.y) * e };
      return true;
    });
    renderLoginWorkflowEdges(loginWorkflowDrag ? loginWorkflowPointerPoint : null);
    if (loginWorkflowRetracts.length) loginWorkflowRetractFrame = requestAnimationFrame(step);
  };
  loginWorkflowRetractFrame = requestAnimationFrame(step);
}
function workflowBezierPoint(a, b, t) {
  var gap = Math.abs(b.x - a.x);
  var dx = Math.max(18, Math.min(86, gap * 0.55));
  var u = 1 - t;
  var c1x = a.x + dx;
  var c2x = b.x - dx;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y
  };
}
// Which connected wire is under the pointer (within a few pixels)?
function loginWorkflowWireAt(point, graph) {
  if (!point || !graph) return '';
  var mr = loginWorkflowMrTargetPoint(graph);
  if (!mr) return '';
  var best = '';
  var bestDist = 9;
  loginWorkflowConnectedProviders().forEach(function (provider) {
    var a = workflowPointForPort(graph.querySelector('[data-login-provider-output="' + provider + '"]'), graph);
    if (!a) return;
    // Skip the stretch hidden under the platform card.
    for (var i = 2; i <= 32; i += 1) {
      var d = workflowPointDistance(point, workflowBezierPoint(a, mr, i / 32));
      if (d < bestDist) { bestDist = d; best = provider; }
    }
  });
  return best;
}
function setLoginWorkflowHoverProvider(provider) {
  var graph = document.getElementById('login-node-graph');
  if (graph) {
    graph.classList.toggle('wire-hover', !!provider);
    if (provider) graph.setAttribute('title', '拖开连线即可退出' + loginWorkflowProviderLabel(provider));
    else graph.removeAttribute('title');
  }
  if (loginWorkflowHoverProvider === provider) return;
  loginWorkflowHoverProvider = provider;
  renderLoginWorkflowEdges();
}
function loginWorkflowShortLabel(provider) {
  return provider === 'qq' ? ' QQ ' : (provider === 'kugou' ? '酷狗' : (provider === 'qishui' ? '汽水' : '网易云'));
}
function loginWorkflowProviderLabel(provider) {
  var meta = platformMeta(provider);
  return meta && meta.label || provider;
}
// Unplugging a wire logs that platform out after a short delay; dragging it
// back or pressing 撤销 in the MR card keeps the account.
function scheduleLoginWorkflowLogout(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (loginWorkflowCommittingLogout[provider]) return;
  if (loginWorkflowPendingLogout && loginWorkflowPendingLogout.provider !== provider) finishLoginWorkflowLogout();
  if (loginWorkflowPendingLogout) clearTimeout(loginWorkflowPendingLogout.timer);
  loginWorkflowPendingLogout = {
    provider: provider,
    timer: setTimeout(finishLoginWorkflowLogout, LOGIN_WORKFLOW_LOGOUT_DELAY_MS)
  };
  if (loginWorkflowPendingProvider === provider) loginWorkflowPendingProvider = '';
  updateLoginProviderUi();
}
function undoLoginWorkflowLogout(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  if (!loginWorkflowPendingLogout) return;
  clearTimeout(loginWorkflowPendingLogout.timer);
  loginWorkflowPendingLogout = null;
  markLoginNodeConnecting();
  updateLoginProviderUi();
}
async function finishLoginWorkflowLogout() {
  var pending = loginWorkflowPendingLogout;
  if (!pending) return;
  clearTimeout(pending.timer);
  var provider = pending.provider;
  // Consume the undoable state before starting an irreversible request.
  loginWorkflowPendingLogout = null;
  loginWorkflowCommittingLogout[provider] = true;
  updateLoginProviderUi();
  try {
    if (typeof logoutProviderAccount === 'function') await logoutProviderAccount(provider);
    showToast('已退出 ' + loginWorkflowProviderLabel(provider));
  } catch (e) {
    console.warn('Login wire logout failed:', e);
    showToast('退出 ' + loginWorkflowProviderLabel(provider) + ' 未完成，请重试');
  } finally {
    delete loginWorkflowCommittingLogout[provider];
    updateLoginProviderUi();
  }
}
function scheduleLoginWorkflowEdges(reason) {
  if (loginWorkflowEdgeRenderFrame) cancelAnimationFrame(loginWorkflowEdgeRenderFrame);
  loginWorkflowEdgeRenderFrame = requestAnimationFrame(function () {
    loginWorkflowEdgeRenderFrame = 0;
    renderLoginWorkflowEdges();
  });
  loginWorkflowEdgeRenderTimers.forEach(function (timer) { clearTimeout(timer); });
  loginWorkflowEdgeRenderTimers = [];
  [70, 170, 340, 560].forEach(function (delay) {
    loginWorkflowEdgeRenderTimers.push(setTimeout(function () {
      renderLoginWorkflowEdges();
    }, delay));
  });
}
function selectLoginProviderNode(provider) {
  if (loginProviderClickSuppressed) {
    loginProviderClickSuppressed = false;
    return;
  }
  provider = normalizeLoginProviderKey(provider);
  setLoginProvider(provider, true);
  // Selecting a platform only selects it. The login drawer opens for a wire
  // that is still waiting for its scan; a logged-in platform re-logs in only
  // through the MR 扫码 button or by connecting again.
  var drawerOpen = loginWorkflowPendingProvider === provider && !hasLoginWorkflowConnection(provider);
  setLoginAuthDrawerOpen(drawerOpen);
  updateLoginProviderUi();
  if (drawerOpen) ensureLoginInlineQr();
}
function loginProviderUsesInlineQr(provider) {
  if (provider === 'qishui') return true;
  if (provider !== 'netease') return false;
  return true;
}
function ensureLoginInlineQr() {
  if (!loginProviderUsesInlineQr(loginProvider) || loginWorkflowActiveMode() !== 'official') return;
  var img = document.getElementById('qr-img');
  if (qrKey && img && img.getAttribute('src') && img.getAttribute('data-qr-provider') === loginProvider) {
    // Closing the drawer stops polling; resume it for the QR still on screen.
    startQrPoll();
    return;
  }
  if (loginProvider === 'qishui') openQishuiWebLogin();
  else refreshQr();
}
function connectLoginProviderToMr(provider) {
  provider = normalizeLoginProviderKey(provider);
  if (loginWorkflowCommittingLogout[provider]) {
    showToast('正在退出 ' + loginWorkflowProviderLabel(provider) + '，请稍后重新连接');
    return;
  }
  if (loginWorkflowPendingLogout && loginWorkflowPendingLogout.provider === provider) {
    if (provider !== loginProvider) setLoginProvider(provider, true);
    undoLoginWorkflowLogout();
    return;
  }
  if (provider !== loginProvider) setLoginProvider(provider, true);
  loginWorkflowPendingProvider = provider;
  setLoginAuthDrawerOpen(true);
  markLoginNodeConnecting();
  updateLoginProviderUi();
  connectLoginMode(loginWorkflowActiveMode());
}
function finishLoginWorkflowDrag(e) {
  var graph = document.getElementById('login-node-graph');
  if (!graph || !loginWorkflowDrag) return;
  var drag = loginWorkflowDrag;
  var target = document.elementFromPoint(e.clientX, e.clientY);
  var port = target && target.closest ? target.closest('.flow-port.in') : null;
  var mrNode = target && target.closest ? target.closest('[data-login-node="mr"]') : null;
  var eventPoint = workflowPointFromEvent(e, graph);
  var nearMr = loginWorkflowNearMr(eventPoint, graph);
  cancelLoginWorkflowPointerRender();
  if (drag.source === 'unplug') {
    loginWorkflowDrag = null;
    graph.classList.remove('dragging-line', 'drop-ready', 'unplugging');
    try { graph.releasePointerCapture(e.pointerId); } catch (_) { }
    if (nearMr) {
      scheduleLoginWorkflowEdges('wire-replug');
      return;
    }
    retractLoginWorkflowWire(drag.provider, loginWorkflowSnapPoint(eventPoint, graph), 'unplugged');
    scheduleLoginWorkflowLogout(drag.provider);
    return;
  }
  var connected = false;
  if ((port && graph.contains(port)) || (mrNode && graph.contains(mrNode)) || nearMr) {
    var mrTarget = port && port.getAttribute('data-login-mr-target');
    if (drag.source === 'provider' && (mrTarget || mrNode || nearMr)) {
      connected = true;
      connectLoginProviderToMr(drag.provider);
    }
  }
  loginWorkflowDrag = null;
  if (!connected) retractLoginWorkflowWire(drag.provider, loginWorkflowSnapPoint(eventPoint, graph), 'temp');
  graph.classList.remove('dragging-line', 'drop-ready');
  try { graph.releasePointerCapture(e.pointerId); } catch (_) { }
  scheduleLoginWorkflowEdges('wire-finish');
}
function beforeLoginProviderForPointer(y) {
  var parent = document.getElementById('login-platform-tabs');
  if (!parent) return '';
  var nodes = Array.prototype.slice.call(parent.querySelectorAll('[data-login-provider]'));
  for (var i = 0; i < nodes.length; i += 1) {
    var rect = nodes[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return nodes[i].getAttribute('data-login-provider') || '';
  }
  return '';
}
// Grab a connected wire (or the MR port, which takes the selected platform's
// wire) and pull its MR end loose.
function beginLoginWorkflowUnplug(graph, e) {
  if (e.button !== 0) return false;
  var target = e.target;
  var onMrPort = target && target.closest && target.closest('.flow-port.in');
  if (target && target.closest && target.closest('button') ) return false;
  var point = workflowPointFromEvent(e, graph);
  var provider = loginWorkflowWireAt(point, graph);
  if (!provider && onMrPort) {
    var connected = loginWorkflowConnectedProviders();
    provider = connected.indexOf(loginProvider) >= 0 ? loginProvider : (connected[0] || '');
  }
  if (!provider) return false;
  var port = graph.querySelector('[data-login-provider-output="' + provider + '"]');
  if (!port) return false;
  if (provider !== loginProvider) setLoginProvider(provider, true);
  loginWorkflowDrag = { port: port, source: 'unplug', provider: provider };
  loginWorkflowHoverProvider = '';
  graph.classList.remove('wire-hover');
  graph.removeAttribute('title');
  graph.classList.add('dragging-line', 'unplugging');
  loginProviderClickSuppressed = true;
  try { graph.setPointerCapture(e.pointerId); } catch (_) { }
  renderLoginWorkflowEdges(point);
  return true;
}
function startLoginWorkflowPointerDrag(graph, state, e) {
  loginWorkflowDrag = {
    port: state.port,
    source: 'provider',
    provider: state.provider
  };
  graph.classList.add('dragging-line');
  renderLoginWorkflowEdges(workflowPointFromEvent(e, graph));
}
function accountProviderOrderAfterMove(provider, beforeProvider) {
  provider = normalizeLoginProviderKey(provider);
  beforeProvider = beforeProvider ? normalizeLoginProviderKey(beforeProvider) : '';
  var order = accountProviderOrder().filter(function (item) { return item !== provider; });
  var index = beforeProvider ? order.indexOf(beforeProvider) : -1;
  if (index < 0) order.push(provider);
  else order.splice(index, 0, provider);
  return order;
}
function shouldMoveLoginProviderBefore(provider, beforeProvider) {
  var current = accountProviderOrder();
  var next = accountProviderOrderAfterMove(provider, beforeProvider);
  return current.join('|') !== next.join('|');
}
function finishLoginProviderPointer(e) {
  var graph = document.getElementById('login-node-graph');
  if (loginWorkflowDrag) {
    finishLoginWorkflowDrag(e);
    loginProviderClickSuppressed = true;
    setTimeout(function () { loginProviderClickSuppressed = false; }, 120);
    return;
  }
  var state = loginProviderPointer;
  loginProviderPointer = null;
  if (graph) graph.classList.remove('sorting-provider');
  if (!state) return;
  if (state.node) state.node.classList.remove('sorting');
  try { if (graph) graph.releasePointerCapture(e.pointerId); } catch (_) { }
  loginProviderClickSuppressed = true;
  setTimeout(function () { loginProviderClickSuppressed = false; }, 120);
  scheduleLoginWorkflowEdges('sort-finish');
}
function showPendingProviderLogin(provider, info, statusEl) {
  if (!providerSessionNeedsValidation(info)) return false;
  var text = providerSessionPendingText(provider, info);
  if (statusEl) { statusEl.textContent = text; statusEl.className = 'preview'; }
  return true;
}
async function retryProviderSessionValidation() {
  var provider = loginProvider;
  if (provider === 'netease') await refreshLoginStatus(true);
  else if (provider === 'qq') await refreshQQLoginStatus({ forceVip: true });
  else if (provider === 'kugou') await refreshKugouLoginStatus();
  else if (provider === 'qishui') await refreshQishuiLoginStatus();
  if (loginProvider === provider) updateLoginProviderUi();
}

function loginProviderVipLabel(provider, status) {
  if (!status || !status.loggedIn) return '';
  if (providerMembershipNeedsSync(provider, status)) return '待同步';
  var level = providerVipLevel(provider, status);
  return level === 'svip' ? 'SVIP' : (level === 'vip' ? 'VIP' : '普通');
}
function handleLoginProviderExternalSwitchEvent(e, provider) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  provider = normalizeLoginProviderKey(provider);
  toggleAccountProviderExternal(provider);
  updateLoginProviderUi();
  scheduleLoginWorkflowEdges('external-switch');
}
function updateLoginProviderCapsuleStatus(provider, btn) {
  var st = platformStatus(provider) || {};
  var meta = platformMeta(provider);
  var handle = btn.querySelector('.login-provider-sort-handle');
  if (!handle) {
    handle = document.createElement('span');
    handle.className = 'login-provider-sort-handle';
    handle.innerHTML = '<i></i><i></i><i></i>';
    btn.insertBefore(handle, btn.firstChild);
  }
  handle.setAttribute('data-login-provider-sort', provider);
  handle.setAttribute('title', '拖动调整平台优先顺序，推荐与歌单一起跟随');
  handle.setAttribute('aria-label', '拖动调整平台优先顺序');
  var logo = btn.querySelector('.provider-logo');
  if (logo) {
    if (st.loggedIn) {
      logo.classList.add('has-avatar');
      var avatar = logo.querySelector('img');
      if (avatar) setProviderAvatar(avatar, provider, st);
      else logo.innerHTML = providerAvatarHtml(provider, st);
    } else {
      logo.classList.remove('has-avatar');
      if (logo.textContent !== meta.short || logo.querySelector('img')) logo.textContent = meta.short;
    }
  }
  var badge = btn.querySelector('.login-provider-state-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'login-provider-state-badge';
    btn.appendChild(badge);
  }
  var externalSwitch = btn.querySelector('.login-provider-external-switch');
  if (!externalSwitch) {
    externalSwitch = document.createElement('span');
    externalSwitch.className = 'login-provider-external-switch';
    btn.appendChild(externalSwitch);
  }
  externalSwitch.removeAttribute('aria-hidden');
  externalSwitch.setAttribute('role', 'switch');
  externalSwitch.setAttribute('tabindex', '0');
  externalSwitch.setAttribute('data-login-provider-external', provider);
  externalSwitch.setAttribute('aria-label', '展示到右上角账号胶囊');
  externalSwitch.setAttribute('aria-checked', isAccountProviderExternallyVisible(provider) ? 'true' : 'false');
  if (!externalSwitch.querySelector('.login-provider-external-label')) {
    externalSwitch.innerHTML = '<span class="login-provider-external-label">展示</span><i></i>';
  }
  if (!externalSwitch.__loginProviderExternalBound) {
    externalSwitch.__loginProviderExternalBound = true;
    externalSwitch.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    externalSwitch.addEventListener('click', function (e) {
      handleLoginProviderExternalSwitchEvent(e, externalSwitch.getAttribute('data-login-provider-external') || provider);
    });
    externalSwitch.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      handleLoginProviderExternalSwitchEvent(e, externalSwitch.getAttribute('data-login-provider-external') || provider);
    });
  }
  externalSwitch.title = isAccountProviderExternallyVisible(provider) ? '已在右上角展示，点击关闭' : '未在右上角展示，点击开启';
  var label = loginProviderVipLabel(provider, st);
  var level = providerVipLevel(provider, st);
  badge.textContent = label;
  badge.className = 'login-provider-state-badge ' + (st.loggedIn ? (providerMembershipNeedsSync(provider, st) ? 'pending' : (level === 'none' ? 'normal' : level)) : 'hidden');
}
function bindLoginWorkflowPointerEvents() {
  var graph = document.getElementById('login-node-graph');
  if (!graph || graph._workflowBound) return;
  graph._workflowBound = true;
  graph.addEventListener('pointerdown', function (e) {
    var sortHandle = e.target && e.target.closest ? e.target.closest('[data-login-provider-sort]') : null;
    if (sortHandle && graph.contains(sortHandle)) {
      var sortNode = sortHandle.closest('.login-node-providers [data-login-provider]');
      var sortProvider = sortNode && sortNode.getAttribute('data-login-provider') || sortHandle.getAttribute('data-login-provider-sort') || '';
      if (!sortProvider) return;
      sortProvider = normalizeLoginProviderKey(sortProvider);
      if (sortProvider !== loginProvider) setLoginProvider(sortProvider, true);
      loginProviderPointer = {
        provider: sortProvider,
        node: sortNode,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false
      };
      if (sortNode) sortNode.classList.add('sorting');
      graph.classList.add('sorting-provider');
      loginProviderClickSuppressed = true;
      try { graph.setPointerCapture(e.pointerId); } catch (_) { }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var port = e.target && e.target.closest ? e.target.closest('.flow-port.out') : null;
    if (!port || !graph.contains(port)) {
      if (beginLoginWorkflowUnplug(graph, e)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    var providerNode = port.closest('.login-node-providers [data-login-provider]');
    var provider = port.getAttribute('data-login-provider-output') || (providerNode && providerNode.getAttribute('data-login-provider')) || '';
    if (!provider) return;
    if (provider !== loginProvider) setLoginProvider(provider, true);
    loginProviderClickSuppressed = true;
    startLoginWorkflowPointerDrag(graph, { provider: provider, port: port }, e);
    try { graph.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
    e.stopPropagation();
  });
  graph.addEventListener('pointermove', function (e) {
    if (!loginProviderPointer && !loginWorkflowDrag) {
      if (e.pointerType === 'mouse' && !e.buttons) {
        var overButton = e.target && e.target.closest && e.target.closest('button, .flow-port.out');
        setLoginWorkflowHoverProvider(overButton ? '' : loginWorkflowWireAt(workflowPointFromEvent(e, graph), graph));
      }
      return;
    }
    e.preventDefault();
    if (loginProviderPointer) {
      var dx = e.clientX - loginProviderPointer.startX;
      var dy = e.clientY - loginProviderPointer.startY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!loginProviderPointer.dragging && dist < 5) return;
      loginProviderPointer.dragging = true;
      if (loginProviderPointer.node) loginProviderPointer.node.classList.add('sorting');
      graph.classList.add('sorting-provider');
      loginProviderClickSuppressed = true;
      var beforeProvider = beforeLoginProviderForPointer(e.clientY);
      if (beforeProvider !== loginProviderPointer.provider && shouldMoveLoginProviderBefore(loginProviderPointer.provider, beforeProvider)) {
        moveAccountProviderBefore(loginProviderPointer.provider, beforeProvider);
        updateLoginProviderUi();
      }
      return;
    }
    if (!loginWorkflowDrag) return;
    var point = workflowPointFromEvent(e, graph);
    graph.classList.toggle('drop-ready', loginWorkflowNearMr(point, graph));
    scheduleLoginWorkflowPointerRender(point);
  });
  graph.addEventListener('pointerleave', function () {
    if (!loginWorkflowDrag) setLoginWorkflowHoverProvider('');
  });
  graph.addEventListener('pointerup', finishLoginProviderPointer);
  graph.addEventListener('pointercancel', function (e) {
    if (loginProviderPointer && loginProviderPointer.node) loginProviderPointer.node.classList.remove('sorting');
    loginProviderPointer = null;
    loginWorkflowDrag = null;
    cancelLoginWorkflowPointerRender();
    graph.classList.remove('dragging-line', 'drop-ready', 'sorting-provider', 'unplugging');
    try { graph.releasePointerCapture(e.pointerId); } catch (_) { }
    scheduleLoginWorkflowEdges('pointer-cancel');
  });
  if (!bindLoginWorkflowPointerEvents._resizeBound) {
    bindLoginWorkflowPointerEvents._resizeBound = true;
    window.addEventListener('resize', function () { scheduleLoginWorkflowEdges('resize'); });
    window.addEventListener('orientationchange', function () { scheduleLoginWorkflowEdges('orientation'); });
  }
}
function updateLoginNodeGraphUi() {
  var graph = document.getElementById('login-node-graph');
  if (graph) graph.setAttribute('data-provider', loginProvider);
  syncAccountProviderOrderUi();
  var connected = syncLoginWorkflowConnectionsFromStatus();
  loginWorkflowProviderOrder().forEach(function (provider) {
    var btn = document.getElementById('login-provider-' + provider);
    if (!btn) return;
    updateLoginProviderCapsuleStatus(provider, btn);
    btn.classList.toggle('active', provider === loginProvider);
    btn.classList.toggle('external-on', isAccountProviderExternallyVisible(provider));
    btn.classList.toggle('connected', connected.indexOf(provider) >= 0);
    btn.classList.toggle('pending', loginWorkflowPendingProvider === provider && connected.indexOf(provider) < 0);
  });
  var official = document.getElementById('login-mode-official');
  var cookie = document.getElementById('login-mode-cookie');
  var officialText = loginProviderOfficialModeText(loginProvider);
  if (official) {
    var title = official.querySelector('b');
    var sub = official.querySelector('small');
    if (title) title.textContent = officialText.title;
    if (sub) sub.textContent = officialText.sub;
    official.disabled = false;
    official.classList.toggle('active', !isManualCookieOpenForProvider(loginProvider));
  }
  if (cookie) {
    var cookieTitle = cookie.querySelector('b');
    var cookieSub = cookie.querySelector('small');
    if (cookieTitle) cookieTitle.textContent = 'Cookie';
    if (cookieSub) cookieSub.textContent = loginProviderSupportsCookieMode(loginProvider) ? '连接后打开手动导入' : '该平台不支持 Cookie 导入';
    cookie.disabled = !loginProviderSupportsCookieMode(loginProvider);
    cookie.classList.toggle('active', isManualCookieOpenForProvider(loginProvider));
  }
  var copy = graph && graph.querySelector('.login-node-copy');
  if (copy && loginWorkflowPendingLogout) {
    var undoSub = copy.querySelector('small');
    if (undoSub) {
      undoSub.textContent = '已断开' + loginWorkflowShortLabel(loginWorkflowPendingLogout.provider) + ' · ';
      var undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'login-wire-undo';
      undoBtn.textContent = '撤销';
      undoBtn.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      undoBtn.addEventListener('click', undoLoginWorkflowLogout);
      undoSub.appendChild(undoBtn);
    }
  } else if (copy) {
    var meta = platformMeta(loginProvider);
    var copySub = copy.querySelector('small');
    var connectedCount = connected.length;
    if (copySub) copySub.textContent = hasLoginWorkflowConnection(loginProvider)
      ? ((meta && meta.label || loginProvider) + ' 已接入 / 共 ' + connectedCount + ' 个接口')
      : (loginWorkflowPendingProvider === loginProvider
        ? ((meta && meta.label || loginProvider) + ' 待登录确认')
        : (connectedCount ? ('已接入 ' + connectedCount + ' 个接口，拖入当前接口可继续添加') : '把左侧接口拖入这里'));
  }
  scheduleLoginWorkflowEdges('node-ui');
}
function connectLoginProvider(provider) {
  selectLoginProviderNode(provider);
}
function selectLoginMode(mode) {
  if (mode === 'cookie' && !loginProviderSupportsCookieMode(loginProvider)) {
    showToast('汽水音乐仅使用官方扫码登录');
    return;
  }
  invalidateLoginAttempt(loginProvider);
  cancelInlineLoginQr();
  setManualCookieOpenForProvider(loginProvider, mode === 'cookie');
  updateLoginProviderUi();
  var drawerOpen = hasLoginWorkflowConnection(loginProvider) || loginWorkflowPendingProvider === loginProvider;
  setLoginAuthDrawerOpen(drawerOpen);
  // The MR "扫码" mode button opens the same drawer as selecting the node.
  if (drawerOpen) ensureLoginInlineQr();
}
function startSelectedLoginConnection() {
  if (!hasLoginWorkflowConnection(loginProvider) && loginWorkflowPendingProvider !== loginProvider) {
    showToast('先把左侧接口拖到 MR 接入口');
    return;
  }
  setLoginAuthDrawerOpen(true);
  connectLoginMode(loginWorkflowActiveMode());
}
function connectLoginMode(mode) {
  setLoginAuthDrawerOpen(true);
  markLoginNodeConnecting();
  if (mode === 'cookie') {
    if (!loginProviderSupportsCookieMode(loginProvider)) {
      showToast('汽水音乐仅使用官方扫码登录');
      return;
    }
    invalidateLoginAttempt(loginProvider);
    cancelInlineLoginQr();
    setManualCookieOpenForProvider(loginProvider, true);
    updateLoginProviderUi();
    var input = document.getElementById('qq-cookie-input');
    if (input) setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 80);
    return;
  }
  setManualCookieOpenForProvider(loginProvider, false);
  updateLoginProviderUi();
  var connectionProvider = loginProvider;
  var connectionSeq = loginRefreshRequestSeq;
  setTimeout(function () { if (isLoginRefreshCurrent(connectionProvider, connectionSeq)) openProviderWebLogin(); }, 120);
}

function markProviderLoginConnected(provider, info) {
  provider = normalizeLoginProviderKey(provider);
  if (!hasPlatformLogin(provider) && !(info && info.loggedIn)) return;
  invalidateProviderAuthSession(provider);
  markLoginWorkflowConnected(provider);
  updateLoginNodeGraphUi();
}
// One-click import of a login the user already has in Edge, Chrome or Firefox.
// The first click explains what will be read; only a second click reads it.
var browserCookieImportArmed = null;
var browserCookieImportBusy = false;
function browserCookieImportSupported(provider) {
  var api = window.desktopWindow;
  return !!(api && typeof api.importBrowserLogin === 'function') && (provider === 'netease' || provider === 'qq' || provider === 'kugou');
}
async function importBrowserCookieLogin() {
  var provider = loginProvider;
  var statusEl = document.getElementById('qr-status');
  var setStatus = function (text, cls) { if (statusEl) { statusEl.textContent = text; statusEl.className = cls || ''; } };
  if (!browserCookieImportSupported(provider)) {
    setStatus('桌面版才支持从浏览器导入，可以改用扫码或手动粘贴。', 'fail');
    return;
  }
  if (browserCookieImportBusy) return;
  var meta = platformMeta(provider);
  var label = meta && meta.label || provider;
  var armed = browserCookieImportArmed;
  if (!armed || armed.provider !== provider || armed.until < Date.now()) {
    browserCookieImportArmed = { provider: provider, until: Date.now() + 10000 };
    setStatus('将只读取本机 Edge、Chrome、Brave 或 Firefox 里的' + label + '登录信息，保存在本机，不会上传。再点一次“从浏览器导入”确认。', 'preview');
    return;
  }
  browserCookieImportArmed = null;
  browserCookieImportBusy = true;
  var importSeq = loginRefreshRequestSeq;
  var btn = document.getElementById('browser-cookie-import-btn');
  if (btn) btn.classList.add('busy');
  setStatus('正在读取浏览器里的' + label + '登录…', 'preview');
  try {
    var result = await window.desktopWindow.importBrowserLogin(provider);
    if (!isLoginRefreshCurrent(provider, importSeq)) return;
    if (!result || !result.ok || !result.cookie) {
      setStatus((result && result.message) || '没有在浏览器里找到登录信息，可以改用扫码登录。', 'fail');
      return;
    }
    setStatus('已从 ' + (result.browser || '浏览器') + ' 读到登录，正在验证…', 'preview');
    await submitQQCookieLogin(result.cookie);
  } catch (e) {
    setStatus('读取浏览器登录失败，可以改用扫码登录。', 'fail');
  } finally {
    browserCookieImportBusy = false;
    if (btn) btn.classList.remove('busy');
  }
}

function showLoginModal(opts) {
  opts = opts || {};
  invalidateLoginAttempt();
  loginProvider = opts.provider ? normalizeLoginProviderKey(opts.provider) : 'netease';
  var modal = document.getElementById('login-modal');
  openGsapModal(modal);
  bindLoginWorkflowPointerEvents();
  setLoginAuthDrawerOpen(false);
  updateLoginProviderUi();
  scheduleLoginWorkflowEdges('open');
}
function closeLoginModal() {
  stopQrPoll();
  if (loginWorkflowPendingLogout) finishLoginWorkflowLogout();
  setLoginAuthDrawerOpen(false);
  closeGsapModal(document.getElementById('login-modal'));
  if (typeof maybeRunStartupVisualGuide === 'function') maybeRunStartupVisualGuide('login-close');
}
function setLoginProvider(provider, silent) {
  invalidateLoginAttempt();
  loginProvider = normalizeLoginProviderKey(provider);
  if (inlineLoginQrProvider && inlineLoginQrProvider !== loginProvider) cancelInlineLoginQr();
  loginRefreshRequestSeq += 1;
  updateLoginProviderUi();
  if (!silent && document.getElementById('login-modal').classList.contains('show')) refreshQr();
}
function qishuiPublicSearchReady() {
  return !!(qishuiLoginStatus && (qishuiLoginStatus.searchReady || qishuiLoginStatus.publicCatalog));
}
function qishuiLoginStatusText(info) {
  info = info || qishuiLoginStatus || {};
  if (info.reauthRequired) return '汽水音乐登录已过期，请使用抖音 App 重新扫码';
  if (info.stale) return '暂时无法确认登录，请刷新状态';
  if (providerSessionNeedsValidation(info)) return providerSessionPendingText('qishui', info);
  if (info.webSession) return '汽水音乐已登录';
  return '请使用抖音 App 扫描二维码并确认登录';
}
function openQishuiPublicSearch() {
  closeLoginModal();
  if (typeof setSearchMode === 'function') setSearchMode('qishui');
  var input = document.getElementById('search-input');
  if (input) {
    setTimeout(function () {
      try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (_) { } }
    }, 60);
  }
  showToast('汽水搜索已切换为匹配源');
}
function updateLoginProviderUi() {
  var meta = platformMeta(loginProvider);
  var isQQ = loginProvider === 'qq';
  var isKugou = loginProvider === 'kugou';
  var isQishui = loginProvider === 'qishui';
  var isNetease = loginProvider === 'netease';
  var isManualCookieProvider = isNetease || isQQ || isKugou;
  var title = document.getElementById('login-modal-title');
  var desc = document.getElementById('login-modal-desc');
  var shell = document.getElementById('qr-shell');
  var st = document.getElementById('qr-status');
  var refreshBtn = document.getElementById('refresh-qr-btn');
  var qqPanel = document.getElementById('qq-cookie-panel');
  var qqCookieToggle = document.getElementById('qq-cookie-toggle-btn');
  var qqCookieInput = document.getElementById('qq-cookie-input');
  var qqCookieNote = qqPanel ? qqPanel.querySelector('.qq-cookie-note') : null;
  var qqCard = document.getElementById('qq-web-login-card');
  var neteaseBtn = document.getElementById('login-provider-netease');
  var qqBtn = document.getElementById('login-provider-qq');
  var kugouBtn = document.getElementById('login-provider-kugou');
  var qishuiBtn = document.getElementById('login-provider-qishui');
  var qqCookieSaveBtn = document.getElementById('qq-cookie-save-btn');
  var canOpenNeteaseWeb = !!(window.desktopWindow && typeof window.desktopWindow.openNeteaseMusicLogin === 'function');
  var browserImportBtn = document.getElementById('browser-cookie-import-btn');
  if (browserImportBtn) browserImportBtn.style.display = browserCookieImportSupported(loginProvider) ? '' : 'none';
  var neteaseFallback = document.getElementById('netease-web-fallback-btn');
  if (neteaseFallback) {
    neteaseFallback.style.display = (isNetease && canOpenNeteaseWeb) || ((isQQ || isKugou) && window.desktopWindow && window.desktopWindow.isDesktop) ? '' : 'none';
    neteaseFallback.textContent = isQQ ? 'QQ 网页登录' : (isKugou ? '官方验证' : '网页登录');
    neteaseFallback.onclick = openProviderOfficialWebLogin;
    neteaseFallback.disabled = isNetease && !!neteaseWebLoginBusy;
  }
  var canUseQishuiQrLogin = true;
  var qishuiSearchReady = qishuiPublicSearchReady();
  var qishuiBusy = !!(qishuiTokenBusy || qishuiOAuthBusy);
  var loginDrawer = document.getElementById('login-auth-drawer');
  updateLoginNodeGraphUi();
  if (neteaseBtn) neteaseBtn.classList.toggle('active', loginProvider === 'netease');
  if (qqBtn) qqBtn.classList.toggle('active', isQQ);
  if (kugouBtn) kugouBtn.classList.toggle('active', isKugou);
  if (qishuiBtn) qishuiBtn.classList.toggle('active', isQishui);
  if (title) title.textContent = isQQ ? '扫码登录 QQ 音乐' : (isQishui ? '扫码登录汽水音乐' : ('扫码登录' + meta.label));
  var inlineQrDesc = inlineLoginQrSupported() && isQQ;
  if (desc && inlineQrDesc) desc.textContent = '请用 QQ 音乐 App 扫码';
  else if (desc) desc.innerHTML = isQQ
    ? '打开 <b>QQ 音乐官方网页登录窗口</b> 扫码，确认后自动保存登录信息。'
    : (isKugou
      ? '优先使用 <b>酷狗音乐 App</b> 扫码授权；失败时回退官方网页登录。'
    : (isQishui
      ? '使用已登录账号的 <b>抖音 App</b> 扫描官方二维码并确认；会员完整播放仍取决于播放接口返回的音源。'
    : '优先使用 <b>网易云音乐 App</b> 扫码；遇到风控可改用官方网页登录。'));
  var manualCookieOpen = isManualCookieOpenForProvider(loginProvider);
  if (shell) {
    var useWebPreview = isQQ || isKugou || (isNetease && manualCookieOpen);
    shell.classList.toggle('web-login-preview', useWebPreview);
    shell.classList.toggle('qq-preview', isQQ);
    shell.classList.toggle('netease-preview', isNetease && manualCookieOpen);
  }
  if (qqPanel) qqPanel.classList.toggle('show', isManualCookieProvider && manualCookieOpen);
  if (qqCookieToggle) {
    qqCookieToggle.classList.toggle('show', isManualCookieProvider);
    qqCookieToggle.textContent = manualCookieOpen ? '收起导入' : 'Cookie 导入';
  }
  if (qqCookieInput) qqCookieInput.placeholder = isKugou ? 'KuGoo=...; token=...; userid=...; kg_mid=...' : (isNetease ? 'MUSIC_U=...; __csrf=...' : 'uin=...; qqmusic_key=...; qm_keyst=...');
  if (qqCookieNote) qqCookieNote.textContent = isKugou ? '从 kugou.com 的登录信息导入。' : (isNetease ? '从 music.163.com 的登录信息导入。' : '从 y.qq.com 的登录信息导入。');
  if (qqCookieSaveBtn) qqCookieSaveBtn.textContent = '保存 Cookie';
  if (qqCard) {
    qqCard.style.display = '';
    qqCard.onclick = isNetease ? openNeteaseWebLogin : openProviderWebLogin;
    qqCard.disabled = isQishui ? (qishuiBusy || !canUseQishuiQrLogin) : (isQQ ? !!qqWebLoginBusy : (isKugou ? !!kugouWebLoginBusy : !!neteaseWebLoginBusy));
    var cardMark = qqCard.querySelector('b');
    var cardLabel = qqCard.querySelector('span');
    if (cardMark) cardMark.textContent = isQQ ? 'QQ' : (isKugou ? 'KG' : (isQishui ? 'QS' : 'NE'));
    if (cardLabel) cardLabel.textContent = isQQ
      ? (qqWebLoginBusy ? '等待扫码确认' : (qqLoginStatus.loggedIn ? 'QQ 音乐 App 重新授权' : 'QQ 音乐 App 扫码'))
      : (isKugou ? (kugouWebLoginBusy ? '等待登录确认' : '酷狗音乐 App 扫码') : (isQishui ? (qishuiOAuthBusy ? '正在生成二维码' : '扫码登录汽水') : (neteaseWebLoginBusy ? '等待扫码确认' : '打开官方登录窗口')));
  }
  if (st && !(inlineLoginQrProvider === loginProvider && inlineLoginQrPhase)) {
    st.className = isManualCookieProvider ? 'preview' : '';
    var currentSession = platformStatus(loginProvider);
    st.textContent = providerSessionNeedsValidation(currentSession) ? providerSessionPendingText(loginProvider, currentSession) : isQQ
      ? qqLoginStatusText(qqLoginStatus)
      : (isKugou
        ? (kugouLoginStatus.loggedIn ? ('酷狗音乐登录信息已保存 · ' + (kugouLoginStatus.nickname || '')) : '点击“登录”打开酷狗音乐官方窗口')
        : (isQishui
          ? qishuiLoginStatusText()
        : '请使用网易云音乐 App 扫码；生成失败可打开官方窗口'));
  }
  if (refreshBtn) {
    refreshBtn.disabled = isQishui ? (qishuiBusy || !canUseQishuiQrLogin) : (isQQ ? !!qqWebLoginBusy : (isKugou ? !!kugouWebLoginBusy : !!neteaseWebLoginBusy));
    var qqNeedsAuthRefresh = isQQ && qqLoginStatus.loggedIn && (
      qqLoginStatus.authorizationIncomplete ||
      qqLoginStatus.playbackKeyReady === false
    );
    var qqNeedsMembershipSync = isQQ && typeof qqMembershipNeedsSync === 'function' && qqMembershipNeedsSync(qqLoginStatus);
    refreshBtn.textContent = isQishui ? (qishuiOAuthBusy ? '生成中…' : '刷新二维码') : (isQQ ? (qqWebLoginBusy ? '等待扫码…' : (qqNeedsAuthRefresh ? '重新授权' : (qqNeedsMembershipSync ? '同步会员' : (qqLoginStatus.loggedIn ? '刷新状态' : '扫码登录')))) : (isKugou ? (kugouWebLoginBusy ? '等待登录…' : '登录') : '刷新二维码'));
    refreshBtn.onclick = isQishui ? openQishuiWebLogin : (isQQ ? (qqNeedsAuthRefresh ? openQQWebLogin : (qqLoginStatus.loggedIn ? refreshQr : openQQWebLogin)) : (isKugou ? openKugouWebLogin : refreshQr));
    if (providerSessionNeedsValidation(platformStatus(loginProvider)) && !inlineLoginQrProvider) {
      refreshBtn.textContent = '刷新状态';
      refreshBtn.onclick = retryProviderSessionValidation;
    }
    if (inlineLoginQrProvider && inlineLoginQrProvider === loginProvider) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = loginProvider === 'qq' ? (inlineLoginQrPhase === 'loading' ? '生成中…' : (inlineLoginQrPhase === 'scanned' ? '确认中…' : '刷新二维码')) : '官网登录';
      refreshBtn.disabled = loginProvider === 'qq' && (inlineLoginQrPhase === 'loading' || inlineLoginQrPhase === 'scanned');
      refreshBtn.onclick = loginProvider === 'qq' ? refreshInlineLoginQr : openInlineLoginInWindow;
    }
  }
  // Cookie import gets the drawer to itself: the QR card is hidden while it is open.
  var cookieMode = isManualCookieProvider && manualCookieOpen;
  if (loginDrawer) {
    loginDrawer.classList.toggle('cookie-mode', cookieMode);
    loginDrawer.classList.toggle('qq-scan-mode', inlineQrDesc && !cookieMode);
  }
  if (cookieMode) {
    var cookieSite = isKugou ? 'kugou.com' : (isNetease ? 'music.163.com' : 'y.qq.com');
    if (title) title.textContent = '导入' + meta.label + '登录';
    if (desc) desc.innerHTML = '一键读取本机浏览器里 <b>' + cookieSite + '</b> 的登录，或粘贴 Cookie；只保存在本机。';
  }
  updateLoginNodeGraphUi();
}
// An empty src resolves to the page URL and renders a broken-image icon.
// Remove the attribute instead and show a spinner until the QR has decoded.
function setLoginQrLoading(loading) {
  var shell = document.getElementById('qr-shell');
  if (shell) shell.classList.toggle('qr-loading', !!loading);
}
function clearLoginQrImage(img) {
  img = img || document.getElementById('qr-img');
  if (!img) return;
  img.onload = null;
  img.onerror = null;
  img.removeAttribute('src');
  img.removeAttribute('data-qr-provider');
  img.alt = '';
  setLoginQrLoading(false);
}
function showLoginQrImage(img, src, alt) {
  img = img || document.getElementById('qr-img');
  if (!img) { setLoginQrLoading(false); return; }
  img.onload = function () { if (img.getAttribute('src') === src) setLoginQrLoading(false); };
  img.onerror = function () {
    if (img.getAttribute('src') !== src) return;
    clearLoginQrImage(img);
    setLoginQrLoading(false);
  };
  img.alt = alt || '';
  img.setAttribute('data-qr-provider', loginProvider);
  img.src = src;
}
async function refreshQr() {
  invalidateLoginAttempt();
  stopQrPoll();
  updateLoginProviderUi();
  var refreshProvider = loginProvider;
  var refreshSeq = ++loginRefreshRequestSeq;
  if (loginProvider === 'qishui') {
    invalidateProviderAuthSession('qishui');
    qrKey = null;
    var qishuiStatus = document.getElementById('qr-status');
    var qishuiImg = document.getElementById('qr-img');
    clearLoginQrImage(qishuiImg);
    qishuiOAuthBusy = true;
    setLoginQrLoading(true);
    updateLoginProviderUi();
    try {
      var qishuiQr = await apiJson('/api/qishui/login/qrcode?t=' + Date.now());
      if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
      if (!qishuiQr || !qishuiQr.token || !qishuiQr.qrcode) {
        throw new Error((qishuiQr && (qishuiQr.message || qishuiQr.error)) || '生成汽水音乐二维码失败');
      }
      qrKey = qishuiQr.token;
      showLoginQrImage(qishuiImg, qishuiQr.qrcode, '汽水音乐登录二维码');
      if (qishuiStatus) {
        qishuiStatus.textContent = '请使用抖音 App 扫码并确认登录';
        qishuiStatus.className = '';
      }
      startQrPoll();
    } catch (e) {
      if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
      setLoginQrLoading(false);
      if (qishuiStatus) {
        qishuiStatus.textContent = '出错: ' + (e && e.message ? e.message : e);
        qishuiStatus.className = 'fail';
      }
    } finally {
      qishuiOAuthBusy = false;
      if (isLoginRefreshCurrent(refreshProvider, refreshSeq)) updateLoginProviderUi();
      if (qishuiStatus && qrKey && isLoginRefreshCurrent(refreshProvider, refreshSeq)) {
        qishuiStatus.textContent = '请使用抖音 App 扫码并确认登录';
        qishuiStatus.className = '';
      }
    }
    return;
  }
  if (loginProvider === 'qq') {
    qrKey = null;
    var qqStatus = document.getElementById('qr-status');
    var qqImg = document.getElementById('qr-img');
    clearLoginQrImage(qqImg);
    var info = await refreshQQVipStatusNow('login-panel');
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (qqStatus) {
      qqStatus.textContent = qqLoginStatusText(info);
      qqStatus.className = 'preview';
    }
    return;
  }
  if (loginProvider === 'kugou') {
    qrKey = null;
    var kugouStatus = document.getElementById('qr-status');
    var kugouImg = document.getElementById('qr-img');
    clearLoginQrImage(kugouImg);
    var kugouInfo = await refreshKugouLoginStatus();
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (kugouStatus) {
      kugouStatus.textContent = kugouInfo && kugouInfo.loggedIn ? ('酷狗音乐登录信息已保存 · ' + (kugouInfo.nickname || '')) : '点击“登录”打开酷狗音乐官方窗口';
      kugouStatus.className = 'preview';
    }
    return;
  }
  var neQrImg = document.getElementById('qr-img');
  clearLoginQrImage(neQrImg);
  setLoginQrLoading(true);
  try {
    var attempt = await beginRendererLoginAttempt('netease');
    if (!attempt) return;
    refreshSeq = attempt.seq;
    var k = await apiJson('/api/login/qr/key?attemptId=' + encodeURIComponent(attempt.id));
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (!k.key) throw new Error('获取 key 失败');
    qrKey = k.key;
    var q = await apiJson('/api/login/qr/create?key=' + encodeURIComponent(qrKey) + '&attemptId=' + encodeURIComponent(attempt.id));
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    if (!q.img) throw new Error('生成二维码失败');
    showLoginQrImage(neQrImg, q.img, '网易云音乐登录二维码');
    document.getElementById('qr-status').textContent = '请使用网易云音乐 App 扫码';
    startQrPoll();
  } catch (e) {
    if (!isLoginRefreshCurrent(refreshProvider, refreshSeq)) return;
    setLoginQrLoading(false);
    document.getElementById('qr-status').textContent = '出错: ' + e.message;
    document.getElementById('qr-status').className = 'fail';
  }
}
function startQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    clearTimeout(qrPollTimer);
  }
  if (loginProvider === 'qishui') {
    var generation = qishuiQrPollGeneration;
    qrPollTimer = setTimeout(function () { pollQishuiQr(generation); }, 1200);
    return;
  }
  qrPollTimer = setInterval(checkQr, 2000);
}
function stopQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    clearTimeout(qrPollTimer);
    qrPollTimer = null;
  }
  qishuiQrPollGeneration += 1;
  qishuiQrPollBusy = false;
}
function scheduleQishuiQrPoll(generation, delay) {
  if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui' || !qrKey) return;
  if (qrPollTimer) clearTimeout(qrPollTimer);
  qrPollTimer = setTimeout(function () { pollQishuiQr(generation); }, Math.max(1000, Number(delay) || 4500));
}
async function pollQishuiQr(generation) {
  if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui' || !qrKey || qishuiQrPollBusy) return;
  qishuiQrPollBusy = true;
  var statusEl = document.getElementById('qr-status');
  var nextDelay = 4500;
  try {
    var result = await apiJson('/api/qishui/login/check?token=' + encodeURIComponent(qrKey) + '&t=' + Date.now());
    if (generation !== qishuiQrPollGeneration || loginProvider !== 'qishui') return;
    if (result && result.loggedIn) {
      stopQrPoll();
      qishuiLoginStatus = normalizeQishuiLoginStatus(result);
      invalidateProviderAuthSession('qishui');
      activeAccountProvider = 'qishui';
      markLoginWorkflowConnected('qishui');
      renderUserBtn();
      if (showPendingProviderLogin('qishui', result, statusEl)) { updateLoginProviderUi(); return; }
      if (statusEl) {
        statusEl.textContent = '登录成功！';
        statusEl.className = 'scan';
      }
      await refreshUserPlaylists(true);
      loadHomeDiscover(true);
      setTimeout(function () {
        closeLoginModal();
        showToast('汽水音乐已登录: ' + (qishuiLoginStatus.nickname || qishuiLoginStatus.userId || ''));
      }, 450);
      return;
    }
    var code = Number(result && (result.errorCode || result.error_code) || 0);
    var qrStatus = String(result && result.status || 'waiting');
    if (code === 2 || qrStatus === 'expired' || qrStatus === 'reauth_required' || result && result.reauthRequired) {
      stopQrPoll();
      // A dead QR must be regenerated, not resumed, when the drawer reopens.
      qrKey = null;
      if (statusEl) {
        statusEl.textContent = result && result.reauthRequired ? '登录状态已失效，请刷新二维码后重新扫码' : '二维码已过期，请刷新';
        statusEl.className = 'fail';
      }
      return;
    }
    if (qrStatus === 'verifying') {
      nextDelay = 8000;
      if (statusEl) {
        statusEl.textContent = '已扫码，正在确认登录…';
        statusEl.className = 'preview';
      }
    } else if (code === 7 || qrStatus === 'rate_limited') {
      nextDelay = Number(result && result.retryAfterMs) || 60000;
      if (statusEl) {
        statusEl.textContent = '操作太频繁，请稍候…';
        statusEl.className = 'preview';
      }
    } else if (qrStatus === 'mfa_cancelled' || qrStatus === 'cancelled') {
      stopQrPoll();
      if (statusEl) {
        statusEl.textContent = qrStatus === 'cancelled' ? '已取消登录，请刷新二维码重试' : '安全验证已取消，请刷新二维码重试';
        statusEl.className = 'fail';
      }
      return;
    } else if (statusEl) {
      statusEl.textContent = qrStatus === 'scanned' || qrStatus === '2'
        ? '已扫码，请在手机确认…'
        : '等待扫码确认…';
      statusEl.className = qrStatus === 'scanned' || qrStatus === '2' ? 'scan' : '';
    }
  } catch (e) {
    nextDelay = 8000;
    console.warn('Qishui QR check failed:', e);
    if (statusEl) {
      statusEl.textContent = '登录状态检查失败，正在重试…';
      statusEl.className = 'fail';
    }
  } finally {
    qishuiQrPollBusy = false;
    scheduleQishuiQrPoll(generation, nextDelay);
  }
}
function toggleQQCookiePanel() {
  setManualCookieOpenForProvider(loginProvider, !isManualCookieOpenForProvider(loginProvider));
  updateLoginProviderUi();
}
// Inline QR: the desktop shell runs the official login page offscreen and
// sends its QR here, so the scan happens inside this drawer. If no QR shows up
// the shell reports a fallback and the official window opens as before.
var inlineLoginQrProvider = '';
var inlineLoginQrPhase = '';
var inlineLoginQrRequest = null;
var inlineLoginQrRequestSeq = 0;
var inlineLoginQrUnsubscribe = null;
function inlineLoginQrSupported() {
  var api = window.desktopWindow;
  return !!(api && typeof api.cancelInlineLogin === 'function' && typeof api.onInlineLoginQr === 'function');
}
function inlineLoginQrAppLabel(provider) {
  if (provider === 'qq') return 'QQ 音乐 App（不是 QQ 的扫一扫）';
  if (provider === 'kugou') return '酷狗音乐 App ';
  return '网易云音乐 App ';
}
function setInlineLoginQrView(active) {
  var shell = document.getElementById('qr-shell');
  if (shell) shell.classList.toggle('inline-qr', !!active);
}
function handleInlineLoginQr(payload) {
  if (!payload || !payload.provider || payload.provider !== inlineLoginQrProvider || payload.provider !== loginProvider) return;
  if (!inlineLoginQrRequest || payload.requestId != null && payload.requestId !== inlineLoginQrRequest.id) return;
  var img = document.getElementById('qr-img');
  var statusEl = document.getElementById('qr-status');
  inlineLoginQrPhase = payload.stage === 'qr' ? (payload.expired ? 'expired' : 'qr') : payload.stage;
  if (payload.stage === 'qr' && payload.image) {
    setInlineLoginQrView(true);
    showLoginQrImage(img, payload.image, loginWorkflowProviderLabel(payload.provider) + '登录二维码');
    if (statusEl) {
      // QQ's persistent description already explains which app to use.
      // Keep this live status line for progress and errors, not duplicate guidance.
      statusEl.textContent = payload.expired ? '二维码已过期，点一下二维码刷新' : (payload.provider === 'qq' ? '' : ('请使用' + (payload.scanApp || inlineLoginQrAppLabel(payload.provider)) + '扫码'));
      statusEl.className = payload.expired ? 'fail' : '';
    }
  } else if (payload.stage === 'scanned' && statusEl) {
    statusEl.textContent = payload.message || '已扫码，正在完成登录…';
    statusEl.className = 'scan';
  } else if (payload.stage === 'failed' && statusEl) {
    setLoginQrLoading(false);
    statusEl.textContent = payload.message || '扫码登录未完成，请刷新二维码重试';
    statusEl.className = 'fail';
  } else if (payload.stage === 'loading') {
    clearLoginQrImage(img); setLoginQrLoading(true);
    if (statusEl) { statusEl.textContent = payload.message || '正在刷新客户端二维码…'; statusEl.className = 'preview'; }
  }
  updateLoginProviderUi();
}
async function refreshInlineLoginQr() {
  var provider = inlineLoginQrProvider;
  var api = window.desktopWindow;
  if (provider !== 'qq' || !api || typeof api.clickInlineLoginQr !== 'function') return;
  await api.clickInlineLoginQr(provider, 0.5, 0.5);
}
function bindInlineLoginQr() {
  if (inlineLoginQrUnsubscribe || !inlineLoginQrSupported()) return;
  inlineLoginQrUnsubscribe = window.desktopWindow.onInlineLoginQr(handleInlineLoginQr);
  var img = document.getElementById('qr-img');
  if (img && !img.__inlineLoginClickBound) {
    img.__inlineLoginClickBound = true;
    // Clicks on the copied QR go to the official page (e.g. 点击刷新).
    img.addEventListener('click', function (e) {
      var provider = inlineLoginQrProvider;
      var api = window.desktopWindow;
      if (!provider || img.getAttribute('data-qr-provider') !== provider || !api || typeof api.clickInlineLoginQr !== 'function') return;
      var rect = img.getBoundingClientRect();
      var cs = getComputedStyle(img);
      var padX = parseFloat(cs.paddingLeft) || 0;
      var padY = parseFloat(cs.paddingTop) || 0;
      var w = rect.width - padX - (parseFloat(cs.paddingRight) || 0);
      var h = rect.height - padY - (parseFloat(cs.paddingBottom) || 0);
      if (w <= 0 || h <= 0) return;
      api.clickInlineLoginQr(provider, (e.clientX - rect.left - padX) / w, (e.clientY - rect.top - padY) / h);
    });
  }
}
function resetInlineLoginQrView(provider) {
  var img = document.getElementById('qr-img');
  setInlineLoginQrView(false);
  setLoginQrLoading(false);
  if (img && img.getAttribute('data-qr-provider') === provider) clearLoginQrImage(img);
}
function cancelInlineLoginQr() {
  inlineLoginQrRequestSeq += 1;
  var provider = inlineLoginQrProvider;
  if (!provider) return;
  inlineLoginQrProvider = '';
  inlineLoginQrRequest = null;
  resetInlineLoginQrView(provider);
  var api = window.desktopWindow;
  try { if (api && typeof api.cancelInlineLogin === 'function') api.cancelInlineLogin(provider); } catch (e) { }
}
function openInlineLoginInWindow() {
  if (!inlineLoginQrProvider) return;
  var request = inlineLoginQrRequest;
  if (request) request.wantsWindow = true;
  cancelInlineLoginQr();
  if (request) request.fallbackGeneration = inlineLoginQrRequestSeq;
}
// open(options) calls the desktop login bridge. Returns its result, or null
// when the inline login was cancelled and nothing more should happen.
async function openProviderLoginWithInlineQr(provider, open, options) {
  options = options || {};
  if (inlineLoginQrSupported()) {
    bindInlineLoginQr();
    var request = { id: ++inlineLoginQrRequestSeq, wantsWindow: false };
    inlineLoginQrRequest = request;
    inlineLoginQrProvider = provider;
    inlineLoginQrPhase = 'loading';
    clearLoginQrImage();
    setInlineLoginQrView(true);
    setLoginQrLoading(true);
    updateLoginProviderUi();
    var result = null;
    var current = false;
    try {
      result = await open(Object.assign({}, options, { inline: true, requestId: request.id }));
    } finally {
      current = inlineLoginQrRequest === request;
      if (current) {
        inlineLoginQrProvider = '';
        inlineLoginQrRequest = null;
        if (!result || !result.ok) resetInlineLoginQrView(provider);
        updateLoginProviderUi();
      }
    }
    var wantsWindow = request.wantsWindow && request.fallbackGeneration === inlineLoginQrRequestSeq && loginProvider === provider && !inlineLoginQrRequest;
    if (!current && !wantsWindow) return null;
    if (!result || !result.inline) return result;
    if (result.cancelled && !wantsWindow) return null;
    if (!result.cancelled && !result.fallback) return result;
    var statusEl = document.getElementById('qr-status');
    if (statusEl && loginProvider === provider) {
      statusEl.textContent = wantsWindow ? '已打开官方登录窗口' : '没能在软件内显示二维码，已改用官方登录窗口';
      statusEl.className = 'preview';
    }
  }
  return open(Object.assign({}, options, { nativeQr: false, forceReauth: true }));
}
function openProviderOfficialWebLogin() {
  if (inlineLoginQrProvider === loginProvider) { openInlineLoginInWindow(); return; }
  cancelInlineLoginQr();
  if (loginProvider === 'qq') return openQQWebLogin({ officialWindow: true });
  if (loginProvider === 'kugou') return openKugouWebLogin({ officialWindow: true });
  return openNeteaseWebLogin();
}
function openProviderWebLogin() {
  if (loginProvider === 'qq') return openQQWebLogin();
  if (loginProvider === 'kugou') return openKugouWebLogin();
  if (loginProvider === 'qishui') return openQishuiWebLogin();
  return refreshQr();
}
async function openNeteaseWebLogin() {
  if (neteaseWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openNeteaseMusicLogin !== 'function') {
    if (statusEl) { statusEl.textContent = '当前环境不支持官方网页登录，正在尝试旧二维码…'; statusEl.className = 'fail'; }
    return refreshQr();
  }

  stopQrPoll();
  qrKey = null;
  loginRefreshRequestSeq++;
  neteaseWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = inlineLoginQrSupported() ? '正在载入网易云登录二维码…' : '正在打开网易云官方登录页，二维码加载完成后窗口会自动弹出…'; statusEl.className = 'preview'; }
  try {
    var attempt = await beginRendererLoginAttempt('netease');
    if (!attempt) return;
    neteaseWebLoginBusy = true;
    var result = await openProviderLoginWithInlineQr('netease', function (opts) { return api.openNeteaseMusicLogin(opts); });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (!result) return;
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || '网易云登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在确认网易云登录…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie, attemptId: attempt.id })
    });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (!info || !info.loggedIn || info.sessionRejected) throw new Error((info && (info.message || info.error)) || '暂时无法确认网易云登录，请重试');
    loginStatus = info;
    activeAccountProvider = 'netease';
    renderUserBtn();
    markProviderLoginConnected('netease', info);
    refreshUserPlaylists(true);
    loadHomeDiscover(true);
    if (showPendingProviderLogin('netease', info, statusEl)) return;
    if (statusEl) { statusEl.textContent = '网易云登录信息已保存'; statusEl.className = 'scan'; }
    scheduleLoginAttemptClose(attempt, function () {
      showToast('网易云已登录: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (attempt && !isLoginAttemptCurrent(attempt)) return;
    neteaseWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '网易云登录失败'; statusEl.className = 'fail'; }
  } finally {
    if ((!loginAttemptCurrent || loginAttemptCurrent === attempt) && neteaseWebLoginBusy) {
      neteaseWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openQQWebLogin(options) {
  options = options || {};
  if (qqWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openQQMusicLogin !== 'function') {
    qqManualCookieOpen = true;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = '当前环境不支持自动网页登录，可先使用手动导入。'; statusEl.className = 'fail'; }
    return;
  }

  qqWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = inlineLoginQrSupported() ? '正在载入 QQ 音乐登录二维码…' : '已打开 QQ 音乐窗口，请扫码并确认登录…'; statusEl.className = 'preview'; }
  try {
    var attempt = await beginRendererLoginAttempt('qq');
    if (!attempt) return;
    qqWebLoginBusy = true;
    var result = options.officialWindow ? await api.openQQMusicLogin({ nativeQr: false, forceReauth: true }) : await openProviderLoginWithInlineQr('qq', function (opts) { return api.openQQMusicLogin(opts); }, {
      forceReauth: !!(qqLoginStatus && qqLoginStatus.authorizationIncomplete && qqLoginStatus.playbackKeyReady === false)
    });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (!result) return;
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || 'QQ 登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在确认 QQ 音乐登录…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie, attemptId: attempt.id })
    });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (!info || !info.loggedIn || info.sessionRejected) throw new Error((info && (info.message || info.error)) || '暂时无法确认 QQ 音乐登录，请重试');
    qqLoginStatus = normalizeQQLoginStatus(info);
    auditProviderVipState('qq', qqLoginStatus);
    activeAccountProvider = 'qq';
    qqManualCookieOpen = false;
    renderUserBtn();
    markProviderLoginConnected('qq', info);
    refreshUserPlaylists(true);
    if (showPendingProviderLogin('qq', info, statusEl)) return;
    var qqPlaybackReady = !!info.playbackKeyReady && !result.partial;
    if (!qqPlaybackReady) {
      if (statusEl) { statusEl.textContent = '请重新打开 QQ 音乐登录窗口，进入播放器页面后再关闭'; statusEl.className = 'preview'; }
      showToast('已登录，还需完成 QQ 音乐播放授权');
      return;
    }
    if (statusEl) { statusEl.textContent = qqPlaybackReady ? qqLoginStatusText(qqLoginStatus) : '请完成 QQ 音乐播放授权'; statusEl.className = 'scan'; }
    scheduleLoginAttemptClose(attempt, function () {
      showToast((qqPlaybackReady ? 'QQ 音乐已登录: ' : 'QQ 账号已登录: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (attempt && !isLoginAttemptCurrent(attempt)) return;
    qqWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : 'QQ 登录失败'; statusEl.className = 'fail'; }
  } finally {
    if ((!loginAttemptCurrent || loginAttemptCurrent === attempt) && qqWebLoginBusy) {
      qqWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
// One visible official challenge at a time. Closing it is not proof of success.
var kugouVerificationBusy = false;
async function openKugouSecurityVerification(data) {
  if (kugouVerificationBusy) return false;
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openKugouMusicLogin !== 'function') {
    showToast('请在桌面版打开酷狗官方窗口完成安全验证');
    return false;
  }
  kugouVerificationBusy = true;
  if (typeof kugouStatusVerificationPrompted !== 'undefined') kugouStatusVerificationPrompted = true;
  try {
    var restriction = data && data.restriction || {};
    var result = await api.openKugouMusicLogin({ verification: true, nativeQr: false, inline: false,
      verificationUrl: data && data.verificationUrl || restriction.verificationUrl || '' });
    if (result && result.retryRequired) {
      showToast('验证窗口已关闭，请重试刚才的登录或播放');
    } else if (result && result.error) {
      showToast('酷狗验证窗口未能打开，请重试官方登录');
    }
    // Do not replace a client token with a website cookie or infer success from closing.
    return false;
  } catch (_) {
    showToast('酷狗验证窗口未能打开，请重试官方登录');
    return false;
  } finally { kugouVerificationBusy = false; }
}
async function openKugouWebLogin(options) {
  options = options || {};
  if (kugouWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openKugouMusicLogin !== 'function') {
    kugouManualCookieOpen = true;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = '当前环境不支持自动网页登录，可先使用手动导入。'; statusEl.className = 'fail'; }
    return;
  }

  kugouWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = inlineLoginQrSupported() ? '正在载入酷狗音乐登录二维码…' : '正在打开酷狗音乐官方登录页，加载完成后窗口会自动弹出…'; statusEl.className = 'preview'; }
  try {
    var attempt = await beginRendererLoginAttempt('kugou');
    if (!attempt) return;
    kugouWebLoginBusy = true;
    var result = options.officialWindow ? await api.openKugouMusicLogin({ nativeQr: false, forceReauth: true }) : await openProviderLoginWithInlineQr('kugou', function (opts) { return api.openKugouMusicLogin(opts); }, { forceReauth: true });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (!result) return;
    if (result.retryRequired) {
      if (statusEl) { statusEl.textContent = '验证窗口已关闭，请重试登录'; statusEl.className = 'preview'; }
      return;
    }
    if (result.verificationRequired) {
      if (statusEl) { statusEl.textContent = '请在官方窗口完成安全验证，再重新登录'; statusEl.className = 'preview'; }
      await openKugouSecurityVerification(result);
      return;
    }
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || '酷狗登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在确认酷狗音乐登录…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/kugou/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie, attemptId: attempt.id })
    });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (info && info.verificationRequired) {
      if (statusEl) { statusEl.textContent = '请在酷狗官方窗口完成安全验证，再重试登录'; statusEl.className = 'preview'; }
      await openKugouSecurityVerification(info);
      return;
    }
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '暂时无法确认酷狗音乐登录，请重试');
    kugouLoginStatus = normalizeKugouLoginStatus(info);
    activeAccountProvider = 'kugou';
    kugouManualCookieOpen = false;
    renderUserBtn();
    markProviderLoginConnected('kugou', info);
    refreshUserPlaylists(true);
    if (showPendingProviderLogin('kugou', info, statusEl)) return;
    var ready = !!info.playbackKeyReady && !result.partial;
    if (statusEl) { statusEl.textContent = ready ? '酷狗音乐登录信息已保存' : '请重新登录酷狗音乐，完成播放授权'; statusEl.className = 'scan'; }
    scheduleLoginAttemptClose(attempt, function () {
      showToast((ready ? '酷狗音乐已登录: ' : '酷狗账号已登录: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (attempt && !isLoginAttemptCurrent(attempt)) return;
    kugouWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '酷狗登录失败'; statusEl.className = 'fail'; }
  } finally {
    if ((!loginAttemptCurrent || loginAttemptCurrent === attempt) && kugouWebLoginBusy) {
      kugouWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openQishuiWebLogin() {
  if (qishuiTokenBusy || qishuiOAuthBusy) return;
  return refreshQr();
}
async function submitQQCookieLogin(importedCookie) {
  if (loginProvider === 'qishui') return openQishuiWebLogin();
  if (loginProvider === 'netease') return submitNeteaseCookieLogin(importedCookie);
  var isKugou = loginProvider === 'kugou';
  var provider = isKugou ? 'kugou' : 'qq';
  if (isKugou ? kugouCookieBusy : qqCookieBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var cookie = typeof importedCookie === 'string' ? importedCookie.trim() : (input ? input.value.trim() : '');
  if (!cookie) {
    if (statusEl) { statusEl.textContent = isKugou ? '请粘贴酷狗音乐 Cookie' : '请粘贴 QQ 音乐 Cookie'; statusEl.className = 'fail'; }
    return;
  }
  if (isKugou) kugouCookieBusy = true;
  else qqCookieBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = isKugou ? '正在保存酷狗登录信息…' : '正在保存 QQ 登录信息…'; statusEl.className = 'preview'; }
  try {
    var attempt = await beginRendererLoginAttempt(provider);
    if (!attempt) return;
    if (isKugou) kugouCookieBusy = true;
    else qqCookieBusy = true;
    var info = await apiJson(isKugou ? '/api/kugou/login/cookie' : '/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie, attemptId: attempt.id })
    });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (isKugou && info && info.verificationRequired) {
      if (statusEl) { statusEl.textContent = '请在酷狗官方窗口完成安全验证'; statusEl.className = 'preview'; }
      await openKugouSecurityVerification(info);
      return;
    }
    if (!info || !info.loggedIn || info.sessionRejected) throw new Error((info && (info.message || info.error)) || (isKugou ? '暂时无法确认酷狗音乐登录，请重试' : '暂时无法确认 QQ 音乐登录，请重试'));
    if (isKugou) kugouLoginStatus = normalizeKugouLoginStatus(info);
    else {
      qqLoginStatus = normalizeQQLoginStatus(info);
      auditProviderVipState('qq', qqLoginStatus);
    }
    activeAccountProvider = isKugou ? 'kugou' : 'qq';
    if (input) input.value = '';
    renderUserBtn();
    markProviderLoginConnected(activeAccountProvider, info);
    refreshUserPlaylists(true);
    if (showPendingProviderLogin(activeAccountProvider, info, statusEl)) return;
    var manualPlaybackReady = !!info.playbackKeyReady;
    if (statusEl) { statusEl.textContent = manualPlaybackReady ? (isKugou ? '酷狗音乐登录信息已保存' : qqLoginStatusText(qqLoginStatus)) : (isKugou ? '请重新登录酷狗音乐，完成播放授权' : '请完成 QQ 音乐播放授权'); statusEl.className = 'scan'; }
    setManualCookieOpenForProvider(activeAccountProvider, false);
    scheduleLoginAttemptClose(attempt, function () {
      showToast((manualPlaybackReady ? (isKugou ? '酷狗音乐已登录: ' : 'QQ 音乐已登录: ') : (isKugou ? '酷狗账号已登录: ' : 'QQ 账号已登录: ')) + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (attempt && !isLoginAttemptCurrent(attempt)) return;
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : (isKugou ? '酷狗登录信息保存失败，请重试' : 'QQ 登录信息保存失败，请重试'); statusEl.className = 'fail'; }
  } finally {
    if (!loginAttemptCurrent || loginAttemptCurrent === attempt) {
      if (isKugou) kugouCookieBusy = false;
      else qqCookieBusy = false;
      if (saveBtn) saveBtn.classList.remove('busy');
    }
  }
}

async function submitNeteaseCookieLogin(importedCookie) {
  if (qqCookieBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var cookie = typeof importedCookie === 'string' ? importedCookie.trim() : (input ? input.value.trim() : '');
  if (!cookie) {
    if (statusEl) { statusEl.textContent = '请粘贴网易云音乐 Cookie'; statusEl.className = 'fail'; }
    return;
  }
  qqCookieBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = '正在保存网易云登录信息…'; statusEl.className = 'preview'; }
  try {
    var attempt = await beginRendererLoginAttempt('netease');
    if (!attempt) return;
    qqCookieBusy = true;
    var info = await apiJson('/api/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie, attemptId: attempt.id })
    });
    if (!isLoginAttemptCurrent(attempt)) return;
    if (!info || !info.loggedIn || info.sessionRejected) throw new Error((info && (info.message || info.error)) || '暂时无法确认网易云登录，请重试');
    loginStatus = info;
    activeAccountProvider = 'netease';
    neteaseManualCookieOpen = false;
    if (input) input.value = '';
    renderUserBtn();
    markProviderLoginConnected('netease', info);
    refreshUserPlaylists(true);
    loadHomeDiscover(true);
    if (showPendingProviderLogin('netease', info, statusEl)) return;
    if (statusEl) { statusEl.textContent = '网易云登录信息已保存'; statusEl.className = 'scan'; }
    scheduleLoginAttemptClose(attempt, function () {
      showToast('网易云已登录: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (attempt && !isLoginAttemptCurrent(attempt)) return;
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '网易云登录信息保存失败，请重试'; statusEl.className = 'fail'; }
  } finally {
    if (!loginAttemptCurrent || loginAttemptCurrent === attempt) {
      qqCookieBusy = false;
      if (saveBtn) saveBtn.classList.remove('busy');
      updateLoginProviderUi();
    }
  }
}
async function checkQr() {
  if (!qrKey || loginProvider !== 'netease') return;
  var checkedKey = qrKey;
  var checkedSeq = loginRefreshRequestSeq;
  var attempt = loginAttemptCurrent;
  if (!isLoginAttemptCurrent(attempt)) return;
  try {
    var r = await apiJson('/api/login/qr/check?key=' + encodeURIComponent(checkedKey) + '&attemptId=' + encodeURIComponent(attempt.id));
    if (!isLoginAttemptCurrent(attempt) || qrKey !== checkedKey || loginRefreshRequestSeq !== checkedSeq) return;
    var $st = document.getElementById('qr-status');
    if (r.code === 800) { $st.textContent = '二维码已过期, 请刷新'; $st.className = 'fail'; invalidateLoginAttempt('netease'); }
    else if (r.code === 801) { $st.textContent = '请在 App 中扫码'; $st.className = ''; }
    else if (r.code === 802) { $st.textContent = '已扫码, 请在手机确认…'; $st.className = 'scan'; }
    else if (r.code === 803 && !r.sessionRejected && (r.loggedIn || r.hasCookie)) {
      $st.textContent = providerSessionNeedsValidation(r) ? providerSessionPendingText('netease', r) : '登录成功！'; $st.className = 'scan';
      stopQrPoll();
      loginStatus = r.loggedIn ? r : Object.assign({}, r, { loggedIn: true, pendingProfile: true, nickname: r.nickname || '网易云用户' });
      invalidateProviderAuthSession('netease');
      activeAccountProvider = 'netease';
      renderUserBtn();
      setTimeout(async function () {
        if (!isLoginAttemptCurrent(attempt)) return;
        var fresh;
        try { fresh = await apiJson('/api/login/status?fresh=1'); } catch (e) { fresh = { unverified: true }; }
        if (!isLoginAttemptCurrent(attempt)) return;
        if (fresh && fresh.sessionRejected) {
          loginStatus = fresh;
          if (typeof loginWorkflowVerifiedSession !== 'undefined') delete loginWorkflowVerifiedSession.netease;
          renderUserBtn();
          $st.textContent = '网易云登录已过期，请重新登录'; $st.className = 'fail';
          return;
        }
        loginStatus = fresh && fresh.loggedIn ? fresh : Object.assign({}, loginStatus, { pendingProfile: true, unverified: true });
        fresh = loginStatus;
        renderUserBtn();
        markLoginWorkflowConnected('netease');
        updateLoginNodeGraphUi();
        if (typeof refreshUserPlaylists === 'function') refreshUserPlaylists(true);
        if (typeof loadHomeDiscover === 'function') loadHomeDiscover(true);
        if (showPendingProviderLogin('netease', fresh, $st)) { updateLoginProviderUi(); return; }
        closeLoginModal();
        showToast('欢迎 ' + (fresh && fresh.nickname ? fresh.nickname : ''));
      }, r.pendingProfile ? 1200 : 500);
    } else if (r.code === 803) {
      $st.textContent = '扫码已确认，但没有拿到登录凭证，请刷新二维码重试'; $st.className = 'fail';
      stopQrPoll();
    }
  } catch (e) { console.warn(e); }
}
