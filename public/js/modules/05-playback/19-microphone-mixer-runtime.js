// Local microphone + player music bus. It never connects to the monitor destination.
function createMicrophoneMixerRuntime(options) {
  options = options || {};
  var operation = 0, pending = null, session = null;
  var state = { phase: 'off', reason: '', peak: 0, microphone: '', target: '' };
  var levels = { microphone: 80, music: 60, microphoneMuted: false, musicMuted: false };
  var outputSettings = { volume: 100, muted: false, delay: 0 };
  function emit(phase, reason) {
    state.phase = phase; state.reason = reason || '';
    if (options.onState) options.onState(Object.assign({}, state));
  }
  function stopTracks(stream) {
    if (!stream || !stream.getTracks) return;
    stream.getTracks().forEach(function (track) {
      try { track.onended = null; track.stop(); } catch (_) { }
    });
  }
  function disconnect(node, destination) {
    try { if (node) destination ? node.disconnect(destination) : node.disconnect(); } catch (_) { }
  }
  function removeMusic(key) {
    var branch = session && session.music.get(key);
    if (!branch) return;
    branch.nodes.forEach(function (node) { disconnect(node, branch.destination); });
    disconnect(branch.source); disconnect(branch.destination);
    stopTracks(branch.destination.stream);
    session.music.delete(key);
  }
  function release(bundle) {
    if (!bundle || bundle.released) return;
    bundle.released = true;
    if (bundle.meterTimer) (options.clearInterval || clearInterval)(bundle.meterTimer);
    bundle.music.forEach(function (branch) {
      branch.nodes.forEach(function (node) { disconnect(node, branch.destination); });
      disconnect(branch.source); disconnect(branch.destination); stopTracks(branch.destination.stream);
    });
    bundle.music.clear();
    stopTracks(bundle.microphoneStream);
    [bundle.microphoneSource, bundle.microphoneGain, bundle.musicGain, bundle.limiter, bundle.outputDelay, bundle.outputGain, bundle.analyser, bundle.destination].forEach(function (node) { disconnect(node); });
    if (bundle.destination) stopTracks(bundle.destination.stream);
    if (bundle.output) {
      bundle.output.onerror = null; bundle.output.muted = true;
      try { bundle.output.pause(); bundle.output.srcObject = null; } catch (_) { }
    }
    if (bundle.context) {
      bundle.context.onstatechange = null;
      try { Promise.resolve(bundle.context.close()).catch(function () {}); } catch (_) { }
    }
  }
  function revoke(bundle) {
    if (!bundle || !bundle.permissionToken) return;
    var token = bundle.permissionToken; bundle.permissionToken = null;
    try { if (options.revokePermission) Promise.resolve(options.revokePermission(token)).catch(function () {}); } catch (_) { }
  }
  function revokeUnusedAuthorization(authorization) {
    if (!authorization || !authorization.token || session && session.permissionToken === authorization.token) return;
    revoke({ permissionToken: authorization.token });
  }
  function disable(reason) {
    operation += 1;
    var previous = session; session = null; pending = null;
    release(previous); revoke(previous); state.peak = 0;
    emit('off', reason);
  }
  function updateLevels(value) {
    value = value || {};
    ['microphone', 'music'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        var number = Number(value[key]);
        levels[key] = isFinite(number) ? Math.max(0, Math.min(100, number)) : levels[key];
      }
      var mute = key + 'Muted';
      if (Object.prototype.hasOwnProperty.call(value, mute)) levels[mute] = !!value[mute];
      if (session && session[key + 'Gain']) {
        session[key + 'Gain'].gain.setTargetAtTime(levels[mute] ? 0 : levels[key] / 100, session.context.currentTime || 0, 0.015);
      }
    });
    return Object.assign({}, levels);
  }
  function setOutputSettings(value) {
    value = value || {};
    outputSettings = { volume: Math.max(0, Math.min(100, Number(value.volume === undefined ? 100 : value.volume) || 0)), muted: !!value.muted, delay: Math.max(0, Math.min(1000, Number(value.delay) || 0)) };
    if (session && session.outputGain) {
      session.outputGain.gain.setTargetAtTime(outputSettings.muted ? 0 : outputSettings.volume / 100, session.context.currentTime || 0, 0.015);
      session.outputDelay.delayTime.setTargetAtTime(outputSettings.delay / 1000, session.context.currentTime || 0, 0.015);
    }
  }
  function limiterCurve() {
    // A final sample clamp prevents summed voices/music from exceeding full scale.
    // This is deliberately a safety ceiling, not a loudness/maximizer effect.
    var curve = new Float32Array(2049);
    for (var i = 0; i < curve.length; i++) {
      var sample = i * 2 / (curve.length - 1) - 1;
      curve[i] = Math.max(-0.95, Math.min(0.95, sample));
    }
    return curve;
  }
  function attachMusic(key, context, nodes) {
    if (!session || state.phase !== 'running' || !context || context.state === 'closed') return false;
    nodes = (nodes || []).filter(Boolean);
    if (!nodes.length) { removeMusic(key); return false; }
    var previous = session.music.get(key);
    if (previous && previous.context === context && previous.nodes.length === nodes.length && previous.nodes.every(function (node, i) { return node === nodes[i]; })) return true;
    removeMusic(key);
    var destination, source;
    try {
      destination = context.createMediaStreamDestination();
      source = session.context.createMediaStreamSource(destination.stream);
      nodes.forEach(function (node) { node.connect(destination); });
      source.connect(session.musicGain);
      session.music.set(key, { context: context, nodes: nodes, source: source, destination: destination });
      return true;
    } catch (_) {
      if (destination) nodes.forEach(function (node) { disconnect(node, destination); });
      disconnect(source); disconnect(destination); if (destination) stopTracks(destination.stream);
      return false;
    }
  }
  function start(config) {
    config = config || {};
    var preparedAuthorization = config.authorization && config.authorization.ok === true && typeof config.authorization.token === 'string' ? config.authorization : null;
    if (pending) { revokeUnusedAuthorization(preparedAuthorization); return pending; }
    if (state.phase === 'running') { revokeUnusedAuthorization(preparedAuthorization); return Promise.resolve(true); }
    if (!config.microphone || !config.target || !options.isInputAvailable(config.microphone) || !options.isTargetAvailable(config.target)) {
      revokeUnusedAuthorization(preparedAuthorization);
      emit('error', '请选择真实麦克风和可用的虚拟输出'); return Promise.resolve(false);
    }
    var token = ++operation;
    var bundle = { music: new Map(), released: false, permissionToken: preparedAuthorization && preparedAuthorization.token };
    session = bundle; state.microphone = config.microphone; state.target = config.target;
    emit('starting');
    function current() { return token === operation && session === bundle && !bundle.released; }
    var task = Promise.resolve().then(async function () {
      try {
        if (!current()) return false;
        bundle.context = options.createContext();
        bundle.output = options.createAudio(); bundle.output.muted = true;
        if (typeof bundle.output.setSinkId !== 'function') throw Object.assign(new Error('当前内核不支持输出选择'), { name: 'NotSupportedError' });
        // Verify the selected output before requesting/starting microphone capture.
        await bundle.output.setSinkId(config.target);
        if (!current()) return false;
        var authorization = preparedAuthorization || (options.requestPermission ? await options.requestPermission() : true);
        if (authorization && authorization.token) bundle.permissionToken = authorization.token;
        if (!current()) { revoke(bundle); return false; }
        if (authorization !== true && !(authorization && authorization.ok === true)) throw Object.assign(new Error('麦克风权限未获允许，请主动点击开启'), { name: 'NotAllowedError' });
        if (!options.isInputAvailable(config.microphone) || !options.isTargetAvailable(config.target)) throw Object.assign(new Error('设备已更改，请重新选择'), { name: 'NotFoundError' });
        var stream = await options.getUserMedia({ audio: { deviceId: { exact: config.microphone }, echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
        if (!current()) { stopTracks(stream); return false; }
        bundle.microphoneStream = stream;
        revoke(bundle);
        if (!stream.getAudioTracks().length) throw Object.assign(new Error('麦克风没有音频轨道'), { name: 'NotFoundError' });
        bundle.microphoneSource = bundle.context.createMediaStreamSource(stream);
        bundle.microphoneGain = bundle.context.createGain(); bundle.musicGain = bundle.context.createGain();
        bundle.microphoneGain.gain.value = levels.microphoneMuted ? 0 : levels.microphone / 100;
        bundle.musicGain.gain.value = levels.musicMuted ? 0 : levels.music / 100;
        bundle.limiter = bundle.context.createWaveShaper(); bundle.limiter.curve = limiterCurve();
        bundle.limiter.oversample = 'none';
        bundle.outputDelay = bundle.context.createDelay(1); bundle.outputGain = bundle.context.createGain();
        bundle.outputGain.gain.value = outputSettings.muted ? 0 : outputSettings.volume / 100;
        bundle.outputDelay.delayTime.value = outputSettings.delay / 1000;
        bundle.analyser = bundle.context.createAnalyser(); bundle.analyser.fftSize = 256;
        bundle.destination = bundle.context.createMediaStreamDestination();
        bundle.microphoneSource.connect(bundle.microphoneGain); bundle.microphoneGain.connect(bundle.limiter);
        bundle.musicGain.connect(bundle.limiter); bundle.limiter.connect(bundle.outputDelay); bundle.outputDelay.connect(bundle.outputGain); bundle.outputGain.connect(bundle.analyser); bundle.analyser.connect(bundle.destination);
        updateLevels(levels); setOutputSettings(outputSettings);
        bundle.output.srcObject = bundle.destination.stream;
        bundle.output.onerror = function () { if (current()) disable('输出不可用，请重新开启'); };
        stream.getAudioTracks().forEach(function (track) { track.onended = function () { if (current()) disable('麦克风已断开，请重新开启'); }; });
        bundle.context.onstatechange = function () { if (current() && bundle.context.state === 'closed') disable('混音已停止，请重新开启'); };
        await bundle.context.resume();
        if (!current()) return false;
        if (!options.isTargetAvailable(config.target)) throw Object.assign(new Error('混音目标已更改'), { name: 'NotFoundError' });
        // No unmuted frame is played on the system default output.
        bundle.output.muted = false;
        await bundle.output.play();
        if (!current()) return false;
        emit('running');
        var samples = new Float32Array(bundle.analyser.fftSize);
        bundle.meterTimer = (options.setInterval || setInterval)(function () {
          if (!current()) return;
          bundle.analyser.getFloatTimeDomainData(samples);
          var peak = 0; for (var i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
          state.peak = Math.min(1, peak);
          if (options.onMeter) options.onMeter(state.peak);
        }, 120);
        return true;
      } catch (error) {
        var wasCurrent = current();
        release(bundle);
        if (wasCurrent) { revoke(bundle); session = null; state.peak = 0; emit('error', options.readableError ? options.readableError(error) : error.message || '混音开启失败'); }
        return false;
      } finally { if (token === operation) pending = null; }
    });
    pending = task;
    return task;
  }
  function checkDevices(inputs, outputs, inputSnapshotKnown, outputSnapshotKnown) {
    if (!session) return;
    if ((inputSnapshotKnown !== false && !(inputs || []).some(function (device) { return device.deviceId === state.microphone; })) || (outputSnapshotKnown !== false && !(outputs || []).some(function (device) { return device.deviceId === state.target; }))) disable('设备已断开，请重新开启');
  }
  return { start: start, disable: disable, setLevels: updateLevels, setOutputSettings: setOutputSettings, attachMusic: attachMusic, detachMusic: removeMusic, checkDevices: checkDevices,
    getState: function () { return Object.assign({}, state); }, getLevels: function () { return Object.assign({}, levels); }, limiterCurve: limiterCurve };
}
