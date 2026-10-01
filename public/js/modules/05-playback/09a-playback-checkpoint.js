var playbackCheckpointPending = null;
var playbackCheckpointQueued = null;
var playbackCheckpointWarned = false;
function persistPlaybackCheckpoint(payload) {
  var bridge = window.desktopWindow;
  if (!bridge || typeof bridge.savePlaybackCheckpoint !== 'function') return;
  playbackCheckpointQueued = payload;
  if (playbackCheckpointPending) return;
  function sendLatest() {
    if (!playbackCheckpointQueued) return Promise.resolve();
    var latest = playbackCheckpointQueued;
    playbackCheckpointQueued = null;
    return bridge.savePlaybackCheckpoint(latest).then(function (result) {
      if (!result.ok && !playbackCheckpointWarned) {
        playbackCheckpointWarned = true;
        console.warn('[PlaybackCheckpoint]', result.error || 'SAVE_FAILED');
        if (typeof showToast === 'function') showToast('播放进度暂时无法保存到磁盘');
      }
    }).catch(function () { console.warn('[PlaybackCheckpoint] IPC_FAILED'); }).then(sendLatest);
  }
  playbackCheckpointPending = sendLatest().finally(function () { playbackCheckpointPending = null; });
}
