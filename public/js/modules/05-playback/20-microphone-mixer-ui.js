// Preferences contain choices/levels only. Microphone capture is never restored.
var MICROPHONE_MIXER_STORE_KEY = 'mineradio-microphone-mixer-v1';
var microphoneMixerRuntime = null, microphoneMixerPanel = null, microphoneMixerExpanded = false;
function normalizeMicrophoneMixerPreference(value) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  function level(key, fallback) {
    return typeof value[key] === 'number' && isFinite(value[key]) ? Math.max(0, Math.min(100, value[key])) : fallback;
  }
  return { microphone: typeof value.microphone === 'string' ? value.microphone.slice(0, 512) : '',
    target: typeof value.target === 'string' ? value.target.slice(0, 512) : '',
    microphoneVolume: level('microphoneVolume', 80), musicVolume: level('musicVolume', 60),
    microphoneMuted: value.microphoneMuted === true, musicMuted: value.musicMuted === true };
}
function readMicrophoneMixerPreference() {
  try { return normalizeMicrophoneMixerPreference(JSON.parse(localStorage.getItem(MICROPHONE_MIXER_STORE_KEY) || '{}')); }
  catch (_) { return normalizeMicrophoneMixerPreference(null); }
}
var microphoneMixerPreference = readMicrophoneMixerPreference();
var microphoneMixerInputSnapshotKnown = true, microphoneMixerInputLabels = Object.create(null);
function updateMicrophoneMixerInputSnapshot(devices, authorized) {
  var inputs = (devices || []).filter(function (device) { return device && device.kind === 'audioinput'; });
  var identified = inputs.filter(function (device) { return device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications' && String(device.label || '').trim(); });
  var hiddenInput = inputs.some(function (device) { return device.deviceId !== 'default' && device.deviceId !== 'communications' && (!device.deviceId || !String(device.label || '').trim()); });
  // An ungranted enumeration may expose only aliases/blank labels. It cannot
  // prove that a previously selected microphone was unplugged or is physical.
  microphoneMixerInputSnapshotKnown = (identified.length > 0 && !hiddenInput) || (!!authorized && inputs.length === 0);
  inputs.forEach(function (device) { if (device.deviceId && device.label) microphoneMixerInputLabels[device.deviceId] = device.label; });
  // Reuse a known label only for the exact ID present in this response. Missing
  // devices remain unavailable; an old full list is never restored as live.
  audioInputDevices = inputs.map(function (device) {
    return { kind: device.kind, deviceId: device.deviceId, groupId: device.groupId,
      label: device.label || microphoneMixerInputLabels[device.deviceId] || '' };
  });
}
function saveMicrophoneMixerPreference() {
  try { localStorage.setItem(MICROPHONE_MIXER_STORE_KEY, JSON.stringify(normalizeMicrophoneMixerPreference(microphoneMixerPreference))); } catch (_) { }
}
function microphoneMixerInputs() {
  // Loopback/stereo-mix/virtual recording ends may contain teammates/system audio.
  return (audioInputDevices || []).filter(function (device) { return device && device.deviceId && String(device.label || '').trim() && device.deviceId !== 'default' && device.deviceId !== 'communications' && !isVirtualMicOutputDevice(device) && !/monitor of|what u hear|what you hear|监听|回环/i.test(device.label || ''); });
}
function microphoneMixerPrimaryIds() {
  var ids = [effectiveAudioPrimaryId()];
  [audio, audioCtx].forEach(function (target) {
    if (!target || typeof target.sinkId !== 'string') return;
    ids.push(target.sinkId || audioOutputDefaultDeviceId);
  });
  return ids;
}
function microphoneMixerTargets() {
  if (typeof audioOutputDeviceSnapshotKnown !== 'undefined' && !audioOutputDeviceSnapshotKnown) return [];
  return (audioOutputDevices || []).filter(function (device) { return device && device.deviceId && isVirtualMicOutputDevice(device) && microphoneMixerPrimaryIds().indexOf(device.deviceId) < 0; });
}
function microphoneMixerState() {
  return microphoneMixerRuntime ? microphoneMixerRuntime.getState() : { phase: 'off', reason: '', peak: 0, target: '' };
}
function microphoneMixerOwnsOutput(id) {
  var state = microphoneMixerState();
  return (state.phase === 'starting' || state.phase === 'running') && state.target === id;
}
function microphoneMixerVisibleTarget() { var state = microphoneMixerState(); return /starting|running/.test(state.phase) ? state.target : ''; }
function microphoneMixerOutputRunning(id) { return microphoneMixerOwnsOutput(id) && microphoneMixerState().phase === 'running'; }
function microphoneMixerError(error) {
  if (error && error.name === 'NotAllowedError') return '麦克风权限被拒绝，请主动开启并检查系统权限';
  if (error && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) return '所选设备不可用，请重新选择';
  if (error && error.name === 'NotReadableError') return '麦克风被占用或不可访问';
  if (error && error.name === 'NotSupportedError') return '当前内核不支持混音输出';
  return '混音开启失败，请重新选择设备';
}
function getMicrophoneMixerRuntime() {
  if (microphoneMixerRuntime) return microphoneMixerRuntime;
  microphoneMixerRuntime = createMicrophoneMixerRuntime({
    createContext: function () { var Ctor = window.AudioContext || window.webkitAudioContext; return new Ctor({ latencyHint: 'interactive' }); },
    createAudio: function () { return new Audio(); },
    getUserMedia: function (constraints) { return navigator.mediaDevices.getUserMedia(constraints); },
    requestPermission: function () {
      if (window.desktopWindow && typeof window.desktopWindow.beginMicrophoneCapture === 'function') return window.desktopWindow.beginMicrophoneCapture();
      return !!(navigator.userActivation && navigator.userActivation.isActive);
    },
    revokePermission: function (token) { if (window.desktopWindow && typeof window.desktopWindow.endMicrophoneCapture === 'function') return window.desktopWindow.endMicrophoneCapture(token); },
    isInputAvailable: function (id) { return microphoneMixerInputs().some(function (device) { return device.deviceId === id; }); },
    isTargetAvailable: function (id) { return microphoneMixerTargets().some(function (device) { return device.deviceId === id; }); },
    readableError: microphoneMixerError,
    onState: function () {
      // Temporarily replace the music mirror on this sink; preserve its preference.
      if (typeof syncAudioOutputMirrors === 'function') syncAudioOutputMirrors('microphone-mixer');
      renderMicrophoneMixerPanel();
      if (typeof renderAudioOutputDeviceUi === 'function') renderAudioOutputDeviceUi();
    },
    onMeter: function (peak) {
      var meter = microphoneMixerPanel && microphoneMixerPanel.querySelector('[data-mixer-meter]');
      if (meter) meter.value = peak;
    }
  });
  applyMicrophoneMixerLevels();
  return microphoneMixerRuntime;
}
function applyMicrophoneMixerLevels() {
  if (!microphoneMixerRuntime) return;
  microphoneMixerRuntime.setLevels({ microphone: microphoneMixerPreference.microphoneVolume, music: microphoneMixerPreference.musicVolume,
    microphoneMuted: microphoneMixerPreference.microphoneMuted, musicMuted: microphoneMixerPreference.musicMuted });
  var state = microphoneMixerRuntime.getState();
  microphoneMixerRuntime.setOutputSettings(audioRouteSetting(state.target || microphoneMixerPreference.target));
}
function attachMicrophoneMixerPreparedGraph(graph) {
  if (microphoneMixerRuntime && graph && graph.gainNode) microphoneMixerRuntime.attachMusic(graph.gainNode, graph.context, [graph.gainNode, graph.echoWetNode]);
}
function syncMicrophoneMixerMusic() {
  if (!microphoneMixerRuntime || microphoneMixerState().phase !== 'running') return;
  var tap = audioReady && (gainNode || analyser);
  var adopted = audioSourceMedia && audioSourceMedia.__mineradioAdoptedAudioGraph;
  if (tap && audioCtx && audioCtx.state !== 'closed') microphoneMixerRuntime.attachMusic(tap, audioCtx, [tap, adopted && adopted.echoWetNode]);
  if (typeof cuefieldAutoMixPreparedAudio !== 'undefined' && cuefieldAutoMixPreparedAudio) attachMicrophoneMixerPreparedGraph(cuefieldAutoMixPreparedAudio.__mineradioPreparedAudioGraph);
}
function detachMicrophoneMixerMusic(tap) { if (microphoneMixerRuntime && tap) microphoneMixerRuntime.detachMusic(tap); }
function stopMicrophoneMixer(reason) {
  microphoneMixerEnumeration += 1; microphoneMixerDiscovering = false;
  if (microphoneMixerRuntime && /starting|running/.test(microphoneMixerState().phase)) microphoneMixerRuntime.disable(reason || '');
}
function checkMicrophoneMixerDevices() {
  if (!microphoneMixerRuntime) return;
  var state = microphoneMixerState();
  if (/starting|running/.test(state.phase) && microphoneMixerPrimaryIds().indexOf(state.target) >= 0) stopMicrophoneMixer('混音目标已成为主监听，请重新选择');
  microphoneMixerRuntime.checkDevices(microphoneMixerInputs(), microphoneMixerTargets(), microphoneMixerInputSnapshotKnown, typeof audioOutputDeviceSnapshotKnown === 'undefined' || audioOutputDeviceSnapshotKnown);
  renderMicrophoneMixerPanel();
}
var microphoneMixerEnumeration = 0, microphoneMixerDiscovering = false, microphoneMixerDiscoveryMessage = '';
async function discoverMicrophoneMixerInputs() {
  if (microphoneMixerDiscovering || /starting|running/.test(microphoneMixerState().phase)) return;
  var operation = ++microphoneMixerEnumeration, grant;
  // Both refresh entry points write the same device lists. Retire any older
  // output-only enumeration before the explicitly authorized snapshot starts.
  if (typeof refreshAudioOutputDevices === 'function') refreshAudioOutputDevices.token = (refreshAudioOutputDevices.token || 0) + 1;
  microphoneMixerDiscovering = true; microphoneMixerDiscoveryMessage = ''; renderMicrophoneMixerPanel();
  try {
    if (!window.desktopWindow || typeof window.desktopWindow.beginMicrophoneEnumeration !== 'function') {
      microphoneMixerDiscoveryMessage = '请在桌面版选择麦克风'; return;
    }
    grant = await window.desktopWindow.beginMicrophoneEnumeration();
    if (!grant || !grant.ok) throw Object.assign(new Error('permission'), { name: 'NotAllowedError' });
    if (operation !== microphoneMixerEnumeration) return;
    // Device labels only: never capture a default input just to reveal names.
    var devices = await navigator.mediaDevices.enumerateDevices();
    if (operation !== microphoneMixerEnumeration) return;
    updateMicrophoneMixerInputSnapshot(devices, true);
    if (typeof updateAudioOutputDeviceSnapshot === 'function') updateAudioOutputDeviceSnapshot(devices, true);
    else {
      audioOutputDevices = devices.filter(function (device) { return device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== 'communications'; });
      var defaultDevice = devices.find(function (device) { return device.kind === 'audiooutput' && device.deviceId === 'default'; });
      var defaultPhysical = defaultDevice && defaultDevice.groupId && audioOutputDevices.find(function (device) { return device.groupId === defaultDevice.groupId; });
      audioOutputDefaultDeviceId = defaultPhysical ? defaultPhysical.deviceId : '';
    }
    microphoneMixerDiscoveryMessage = microphoneMixerInputs().length ? '选择麦克风后点击启用混音' : microphoneMixerInputSnapshotKnown ? '未发现可用麦克风，请检查系统权限或设备连接' : '未读取到可识别的麦克风，请检查系统权限后再次刷新麦克风';
  } catch (error) { if (operation === microphoneMixerEnumeration) microphoneMixerDiscoveryMessage = microphoneMixerError(error); }
  finally {
    try { if (grant && grant.token && window.desktopWindow) await window.desktopWindow.endMicrophoneCapture(grant.token); } catch (_) { }
    if (operation === microphoneMixerEnumeration) {
      microphoneMixerDiscovering = false; renderMicrophoneMixerPanel();
      if (typeof renderAudioOutputDeviceUi === 'function') renderAudioOutputDeviceUi();
    }
  }
}
async function toggleMicrophoneMixer() {
  if (/starting|running/.test(microphoneMixerState().phase)) { stopMicrophoneMixer(); return; }
  if (typeof enableMicrophoneMixerOneClick === 'function') return enableMicrophoneMixerOneClick();
  microphoneMixerExpanded = true; microphoneMixerDiscoveryMessage = '';
  if (!microphoneMixerInputs().length) { await discoverMicrophoneMixerInputs(); return; }
  var runtime = getMicrophoneMixerRuntime();
  applyMicrophoneMixerLevels();
  var ok = await runtime.start({ microphone: microphoneMixerPreference.microphone, target: microphoneMixerPreference.target });
  if (ok) { syncMicrophoneMixerMusic(); refreshAudioOutputDevices(false); }
  renderMicrophoneMixerPanel();
}
function mountMicrophoneMixerPanel(body) {
  if (!body) return;
  if (!microphoneMixerPanel) {
    microphoneMixerPanel = document.createElement('section'); microphoneMixerPanel.id = 'audio-microphone-mixer';
    microphoneMixerPanel.innerHTML = '<div class="audio-mixer-head"><button type="button" data-mixer-expand aria-expanded="false" aria-controls="audio-microphone-mixer-body"><span class="audio-mixer-disclosure" aria-hidden="true"></span>麦克风混音 <span data-mixer-state>未启用</span></button><button type="button" data-mixer-enable aria-pressed="false">启用混音</button></div>' +
      '<div id="audio-microphone-mixer-body" class="audio-mixer-body" hidden><button type="button" data-mixer-discover>选择麦克风</button><div class="audio-mixer-devices"><label>麦克风<select data-mixer-device="microphone" aria-label="真实麦克风"></select></label><label>混音输出<select data-mixer-device="target" aria-label="混音输出设备"></select></label></div>' +
      '<div class="audio-mixer-levels">' + ['microphone', 'music'].map(function (key) {
        var text = key === 'music' ? '音乐' : '人声';
        return '<label>' + text + '<input type="range" min="0" max="100" step="1" data-mixer-level="' + key + '" aria-label="混音' + text + '音量"><output data-mixer-value="' + key + '"></output></label><button type="button" data-mixer-mute="' + key + '" aria-pressed="false" aria-label="' + text + '静音">' + audioRouteMuteIcon(false) + '</button>';
      }).join('') + '</div><div class="audio-mixer-feedback" hidden><span data-mixer-message role="status"></span><meter data-mixer-meter min="0" max="1" value="0" low="0.7" high="0.9" optimum="0.4" aria-label="混音电平" hidden></meter></div></div>';
    microphoneMixerPanel.addEventListener('click', function (event) {
      if (event.target.closest('[data-mixer-discover]')) { discoverMicrophoneMixerInputs(); return; }
      var expand = event.target.closest('[data-mixer-expand]');
      if (expand) { microphoneMixerExpanded = !microphoneMixerExpanded; renderMicrophoneMixerPanel(); return; }
      if (event.target.closest('[data-mixer-enable]')) { toggleMicrophoneMixer(); return; }
      var mute = event.target.closest('[data-mixer-mute]');
      if (mute) {
        var key = mute.getAttribute('data-mixer-mute') + 'Muted'; microphoneMixerPreference[key] = !microphoneMixerPreference[key];
        applyMicrophoneMixerLevels(); saveMicrophoneMixerPreference(); renderMicrophoneMixerPanel();
      }
    });
    microphoneMixerPanel.addEventListener('input', function (event) {
      var level = event.target.getAttribute('data-mixer-level'); if (!level) return;
      microphoneMixerPreference[level + 'Volume'] = Number(event.target.value);
      applyMicrophoneMixerLevels(); saveMicrophoneMixerPreference(); renderMicrophoneMixerPanel();
    });
    microphoneMixerPanel.addEventListener('change', function (event) {
      var device = event.target.getAttribute('data-mixer-device'); if (!device) return;
      stopMicrophoneMixer('设备已更改，请重新开启');
      microphoneMixerPreference[device] = event.target.value; saveMicrophoneMixerPreference(); renderMicrophoneMixerPanel();
    });
    // Explicitly enabled capture continues when the routing controls are closed
    // or the app is minimized. Reload/exit still releases it, and never restores it.
    window.addEventListener('pagehide', function () { stopMicrophoneMixer(); });
    window.addEventListener('beforeunload', function () { stopMicrophoneMixer(); });
  }
  body.appendChild(microphoneMixerPanel);
  if (typeof mountVirtualAudioSetupEntry === 'function') mountVirtualAudioSetupEntry(microphoneMixerPanel);
  renderMicrophoneMixerPanel();
}
function renderMicrophoneMixerPanel() {
  if (!microphoneMixerPanel) return;
  var panel = microphoneMixerPanel, state = microphoneMixerState(), active = /starting|running/.test(state.phase);
  var expand = panel.querySelector('[data-mixer-expand]'); expand.setAttribute('aria-expanded', String(microphoneMixerExpanded));
  panel.querySelector('.audio-mixer-body').hidden = !microphoneMixerExpanded;
  panel.querySelector('[data-mixer-state]').textContent = state.phase === 'running' ? '已启用' : state.phase === 'starting' ? '启动中' : '未启用';
  var discover = panel.querySelector('[data-mixer-discover]'); discover.disabled = active || microphoneMixerDiscovering; discover.textContent = microphoneMixerDiscovering ? '读取设备…' : '刷新麦克风';
  var enable = panel.querySelector('[data-mixer-enable]'); enable.disabled = microphoneMixerDiscovering; enable.textContent = state.phase === 'starting' ? '取消启用' : active ? '停用混音' : '启用混音'; enable.setAttribute('aria-pressed', String(active));
  ['microphone', 'target'].forEach(function (key) {
    var select = panel.querySelector('[data-mixer-device="' + key + '"]');
    var devices = key === 'microphone' ? microphoneMixerInputs() : microphoneMixerTargets();
    var markup = '<option value="">' + (key === 'microphone' ? '选择真实麦克风' : '选择虚拟设备播放端') + '</option>' + devices.map(function (device, i) {
      return '<option value="' + escHtml(device.deviceId) + '">' + escHtml(device.label || '设备 ' + (i + 1)) + '</option>';
    }).join('');
    var savedId = microphoneMixerPreference[key];
    if (savedId && !devices.some(function (device) { return device.deviceId === savedId; })) {
      var snapshotKnown = key === 'microphone' ? microphoneMixerInputSnapshotKnown : typeof audioOutputDeviceSnapshotKnown === 'undefined' || audioOutputDeviceSnapshotKnown;
      var savedStatus = active && state[key] === savedId ? state.phase === 'running' ? '（正在使用）' : '（已选择）' : snapshotKnown ? '（未检测到）' : '（待重新读取）';
      var savedLabel = key === 'microphone' ? microphoneMixerInputLabels[savedId] || '已保存的麦克风' : typeof audioOutputDeviceLabels !== 'undefined' && audioOutputDeviceLabels[savedId] || '已保存的混音输出';
      markup += '<option value="' + escHtml(savedId) + '" disabled>' + escHtml(savedLabel) + savedStatus + '</option>';
    }
    if (select._mixerOptions !== markup) { select.innerHTML = markup; select._mixerOptions = markup; }
    select.value = microphoneMixerPreference[key];
  });
  ['microphone', 'music'].forEach(function (key) {
    panel.querySelector('[data-mixer-level="' + key + '"]').value = microphoneMixerPreference[key + 'Volume'];
    panel.querySelector('[data-mixer-value="' + key + '"]').textContent = microphoneMixerPreference[key + 'Volume'] + '%';
    var mute = panel.querySelector('[data-mixer-mute="' + key + '"]'), muted = microphoneMixerPreference[key + 'Muted'];
    mute.setAttribute('aria-pressed', String(muted)); mute.title = muted ? '取消静音' : '静音'; mute.innerHTML = audioRouteMuteIcon(muted);
  });
  var messages = [];
  if (state.reason || microphoneMixerDiscoveryMessage) messages.push(state.reason || microphoneMixerDiscoveryMessage);
  if (typeof audioOutputDeviceSnapshotKnown !== 'undefined' && !audioOutputDeviceSnapshotKnown) messages.push('输出设备列表未完整读取，请重新刷新接口');
  else if (!microphoneMixerTargets().length) messages.push('未检测到虚拟音频播放端，需要软件虚拟音频设备');
  if (state.phase === 'running') messages.push('人声 + 音乐 · 关闭面板后继续混音，停用或退出软件时停止');
  else if (!microphoneMixerInputSnapshotKnown && !microphoneMixerDiscoveryMessage) messages.push('麦克风列表未完整读取，请点击「刷新麦克风」');
  var message = messages.join('；');
  panel.querySelector('[data-mixer-message]').textContent = message;
  var meter = panel.querySelector('[data-mixer-meter]'); meter.hidden = state.phase !== 'running'; meter.value = state.peak || 0;
  panel.querySelector('.audio-mixer-feedback').hidden = !message && meter.hidden;
  if (typeof updateVirtualAudioSetupEntry === 'function') updateVirtualAudioSetupEntry(panel);
}
