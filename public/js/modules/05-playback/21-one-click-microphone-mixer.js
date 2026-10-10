// One explicit enable click may enumerate, select unambiguous devices, then
// capture once. No setup state or authorization is restored on app startup.
function microphoneMixerMissingVirtualDriver() {
  return typeof audioOutputDeviceSnapshotObserved !== 'undefined' && audioOutputDeviceSnapshotObserved
    && typeof audioOutputDeviceSnapshotKnown !== 'undefined' && audioOutputDeviceSnapshotKnown
    && (audioOutputDevices || []).every(function (device) { return device && device.deviceId && String(device.label || '').trim(); })
    && !(audioOutputDevices || []).some(isVirtualMicOutputDevice);
}
function microphoneMixerAutomaticChoice(devices) {
  var inputs = microphoneMixerInputs(), targets = microphoneMixerTargets();
  var microphone = inputs.find(function (device) { return device.deviceId === microphoneMixerPreference.microphone; });
  if (!microphone) {
    var systemDefault = (devices || []).find(function (device) { return device.kind === 'audioinput' && device.deviceId === 'default'; });
    var defaultInputs = systemDefault && systemDefault.groupId ? inputs.filter(function (device) { return device.groupId === systemDefault.groupId; }) : [];
    if (defaultInputs.length === 1) microphone = defaultInputs[0];
    else if (inputs.length === 1) microphone = inputs[0];
  }
  if (!microphone) return { reason: inputs.length ? '有多个麦克风，请选择要使用的麦克风' : '未发现可用的真实麦克风，请检查系统权限或设备连接' };
  var target = targets.find(function (device) { return device.deviceId === microphoneMixerPreference.target; });
  if (!target) {
    // Name detection alone cannot establish routing for arbitrary virtual mixer
    // buses. Only an unambiguous simple CABLE endpoint is a safe first default.
    var cables = targets.filter(function (device) { return /\bcable(?:[-\s][a-z])?\s+input\b|vb-audio virtual cable/i.test(device.label || ''); });
    if (targets.length === 1 && cables.length === 1) target = cables[0];
  }
  if (!target) {
    var virtual = (audioOutputDevices || []).filter(isVirtualMicOutputDevice);
    return { microphone: microphone.deviceId, reason: virtual.length && !targets.length ? '请先选择耳机或音箱作为主监听' : targets.length ? '有多个或需配置的虚拟输出，请选择混音输出' : '未检测到虚拟音频播放端，需要软件虚拟音频设备' };
  }
  return { microphone: microphone.deviceId, target: target.deviceId };
}
async function enableMicrophoneMixerOneClick() {
  if (microphoneMixerDiscovering || /starting|running/.test(microphoneMixerState().phase)) return false;
  var bridge = window.desktopWindow;
  if (microphoneMixerMissingVirtualDriver() && bridge && typeof bridge.beginVirtualAudioSetup === 'function') {
    if (typeof beginVirtualAudioSetupFromUi === 'function') {
      await beginVirtualAudioSetupFromUi('install');
      return false;
    }
    var guide = await bridge.beginVirtualAudioSetup('install');
    microphoneMixerDiscoveryMessage = guide && guide.ok && guide.opened ? '已打开官方安装指引，完成安装并重启后刷新接口' : guide && guide.canceled ? '' : '安装指引未打开，请重试';
    renderMicrophoneMixerPanel(); return false;
  }
  microphoneMixerExpanded = true;
  if (!bridge || typeof bridge.beginMicrophoneMixingSetup !== 'function' || typeof bridge.prepareMicrophoneCapture !== 'function') {
    // Older preload/browser builds keep the explicit two-step path; do not
    // borrow cached permission or briefly open a default mic to reveal labels.
    var savedMicrophone = microphoneMixerInputs().some(function (device) { return device.deviceId === microphoneMixerPreference.microphone; });
    var savedTarget = microphoneMixerTargets().some(function (device) { return device.deviceId === microphoneMixerPreference.target; });
    if (savedMicrophone && savedTarget) {
      var legacyRuntime = getMicrophoneMixerRuntime(); applyMicrophoneMixerLevels();
      var enabled = await legacyRuntime.start({ microphone: microphoneMixerPreference.microphone, target: microphoneMixerPreference.target });
      if (enabled) { syncMicrophoneMixerMusic(); refreshAudioOutputDevices(false); }
      renderMicrophoneMixerPanel(); return enabled;
    }
    await discoverMicrophoneMixerInputs();
    var legacyChoice = microphoneMixerAutomaticChoice(audioInputDevices);
    if (legacyChoice.microphone) microphoneMixerPreference.microphone = legacyChoice.microphone;
    if (legacyChoice.target) microphoneMixerPreference.target = legacyChoice.target;
    saveMicrophoneMixerPreference();
    if (!microphoneMixerDiscoveryMessage || legacyChoice.target) microphoneMixerDiscoveryMessage = legacyChoice.reason || '设备已选择，再次点击启用混音';
    renderMicrophoneMixerPanel(); return false;
  }
  var operation = ++microphoneMixerEnumeration, grant = null, transferred = false;
  if (typeof refreshAudioOutputDevices === 'function') refreshAudioOutputDevices.token = (refreshAudioOutputDevices.token || 0) + 1;
  microphoneMixerDiscovering = true; microphoneMixerDiscoveryMessage = ''; renderMicrophoneMixerPanel();
  function current() { return operation === microphoneMixerEnumeration; }
  try {
    // This call is before any await, so the native gate can verify the actual
    // enable gesture. Setup permits labels only, never a preview capture.
    grant = await bridge.beginMicrophoneMixingSetup();
    if (!current()) return false;
    if (!grant || !grant.ok || !grant.token) throw Object.assign(new Error('permission'), { name: 'NotAllowedError' });
    var devices = await navigator.mediaDevices.enumerateDevices();
    if (!current()) return false;
    updateMicrophoneMixerInputSnapshot(devices, true);
    updateAudioOutputDeviceSnapshot(devices, true);
    if (!microphoneMixerInputSnapshotKnown || !audioOutputDeviceSnapshotKnown) {
      microphoneMixerDiscoveryMessage = '设备列表未完整读取，请检查权限后再次启用'; return false;
    }
    var choice = microphoneMixerAutomaticChoice(devices);
    if (choice.microphone) microphoneMixerPreference.microphone = choice.microphone;
    if (choice.reason) { microphoneMixerDiscoveryMessage = choice.reason; saveMicrophoneMixerPreference(); return false; }
    microphoneMixerPreference.target = choice.target; saveMicrophoneMixerPreference();
    var authorization = await bridge.prepareMicrophoneCapture(grant.token);
    if (!current()) return false;
    if (!authorization || !authorization.ok || authorization.token !== grant.token) {
      if (authorization && authorization.error === 'MICROPHONE_USER_ACTIVATION_REQUIRED') {
        microphoneMixerDiscoveryMessage = '操作等待过久，请再次点击启用混音'; return false;
      }
      throw Object.assign(new Error('permission'), { name: 'NotAllowedError' });
    }
    var runtime = getMicrophoneMixerRuntime(); applyMicrophoneMixerLevels();
    microphoneMixerDiscovering = false;
    var task = runtime.start({ microphone: choice.microphone, target: choice.target, authorization: authorization });
    transferred = true;
    var ok = await task;
    if (!current()) return false;
    if (ok) { syncMicrophoneMixerMusic(); refreshAudioOutputDevices(false); }
    return ok;
  } catch (error) {
    if (current()) microphoneMixerDiscoveryMessage = microphoneMixerError(error);
    return false;
  } finally {
    if (grant && grant.token && !transferred) {
      try { await bridge.endMicrophoneCapture(grant.token); } catch (_) { }
    }
    if (current()) {
      microphoneMixerDiscovering = false; renderMicrophoneMixerPanel();
      if (typeof renderAudioOutputDeviceUi === 'function') renderAudioOutputDeviceUi();
    }
  }
}
