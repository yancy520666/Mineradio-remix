function mineradioCacheStorageNode(id) {
  return document.getElementById(id);
}

function formatMineradioCacheBytes(value) {
  var bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return bytes + ' B';
  var units = ['KB', 'MB', 'GB', 'TB'];
  var index = -1;
  do {
    bytes /= 1024;
    index += 1;
  } while (bytes >= 1024 && index < units.length - 1);
  return (bytes >= 100 || index === 0 ? bytes.toFixed(0) : bytes.toFixed(1)) + ' ' + units[index];
}

function setMineradioCacheStorageText(id, value) {
  var node = mineradioCacheStorageNode(id);
  if (node) node.textContent = value == null || value === '' ? '—' : String(value);
}

function applyMineradioCacheSettings(snapshot) {
  if (!snapshot || !snapshot.ok) {
    setMineradioCacheStorageText('cache-storage-total', '读取失败');
    setMineradioCacheStorageText('cache-storage-note', snapshot && snapshot.error ? ('缓存设置不可用：' + snapshot.error) : '缓存设置不可用');
    return;
  }
  var settings = snapshot.settings || {};
  var usage = snapshot.usage || {};
  setMineradioCacheStorageText('cache-storage-root', settings.rootPath);
  setMineradioCacheStorageText('cache-storage-total', '已占用 ' + formatMineradioCacheBytes(usage.totalManagedBytes));
  setMineradioCacheStorageText('cache-storage-lyrics-path', settings.lyricsPath);
  setMineradioCacheStorageText('cache-storage-lyrics-size', formatMineradioCacheBytes(usage.lyricsBytes));
  setMineradioCacheStorageText('cache-storage-chromium-path', settings.activeChromiumPath || settings.chromiumPath);
  setMineradioCacheStorageText('cache-storage-chromium-size', formatMineradioCacheBytes(usage.chromiumBytes));
  setMineradioCacheStorageText('cache-storage-beatmaps-path', settings.activeBeatmapsPath || settings.beatmapsPath);
  setMineradioCacheStorageText('cache-storage-beatmaps-size', formatMineradioCacheBytes(usage.beatmapsBytes));
  setMineradioCacheStorageText('cache-storage-wallpaper-path', settings.activeWallpaperEnginePath || settings.wallpaperEnginePath);
  setMineradioCacheStorageText('cache-storage-wallpaper-size', formatMineradioCacheBytes(usage.wallpaperEngineBytes));
  setMineradioCacheStorageText('cache-storage-userdata-path', settings.userDataPath || '系统安全数据目录');
  setMineradioCacheStorageText('cache-storage-userdata-size', formatMineradioCacheBytes(usage.userDataBytes));
  var restartButton = mineradioCacheStorageNode('cache-storage-restart');
  if (restartButton) restartButton.hidden = !settings.restartRequired;
  setMineradioCacheStorageText(
    'cache-storage-note',
    settings.restartRequired
      ? '歌词缓存已切换；封面、网络、音频分片、节奏分析与 WE 静音场景将在重启后改用新目录。'
      : '歌词缓存立即生效；封面、网络、音频分片、节奏分析与 WE 静音场景已使用此目录。'
  );
}

var mineradioCacheStorageBusy = false;
function setMineradioCacheStorageBusy(busy, action) {
  mineradioCacheStorageBusy = busy;
  ['choose', 'refresh', 'release', 'restart'].forEach(function (key) {
    var node = mineradioCacheStorageNode('cache-storage-' + key);
    if (node) node.disabled = busy;
  });
  var panel = mineradioCacheStorageNode('cache-storage-panel');
  if (panel) panel.setAttribute('aria-busy', busy ? 'true' : 'false');
  setMineradioCacheStorageText('cache-storage-release', busy && action === 'release' ? '释放中…' : '释放缓存');
}
function setMineradioCacheStorageStatus(message, state) {
  var node = mineradioCacheStorageNode('cache-storage-status');
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || '';
  node.setAttribute('data-state', state || 'success');
}
function readMineradioCacheSettings() {
  return Promise.resolve().then(function () { return window.desktopWindow.getCacheSettings(); }).then(function (snapshot) {
    applyMineradioCacheSettings(snapshot);
    return snapshot;
  });
}
function refreshMineradioCacheSettings() {
  if (mineradioCacheStorageBusy) return Promise.resolve();
  if (!window.desktopWindow || typeof window.desktopWindow.getCacheSettings !== 'function') {
    applyMineradioCacheSettings({ ok: false, error: '仅桌面版支持本地缓存路径设置' });
    return Promise.resolve();
  }
  setMineradioCacheStorageBusy(true, 'refresh');
  setMineradioCacheStorageText('cache-storage-total', '正在统计…');
  return readMineradioCacheSettings().catch(function (error) {
    applyMineradioCacheSettings({ ok: false, error: error && error.message || '读取失败' });
  }).finally(function () { setMineradioCacheStorageBusy(false); });
}
function chooseMineradioCacheRoot() {
  if (mineradioCacheStorageBusy || !window.desktopWindow || typeof window.desktopWindow.chooseCacheDirectory !== 'function') return Promise.resolve();
  setMineradioCacheStorageBusy(true, 'choose');
  return Promise.resolve().then(function () { return window.desktopWindow.chooseCacheDirectory(); }).then(function (choice) {
    if (!choice || !choice.ok || choice.canceled || !choice.rootPath) return;
    return window.desktopWindow.setCacheSettings({ rootPath: choice.rootPath });
  }).then(function (snapshot) {
    if (snapshot) applyMineradioCacheSettings(snapshot);
  }).catch(function (error) {
    applyMineradioCacheSettings({ ok: false, error: error && error.message || '保存失败' });
  }).finally(function () { setMineradioCacheStorageBusy(false); });
}
function resetMineradioGeneratedMemoryCaches(reload) {
  if (typeof resetGeneratedLyricCaches === 'function') resetGeneratedLyricCaches();
  if (typeof resetGeneratedCoverCaches === 'function') resetGeneratedCoverCaches(reload);
  if (typeof resetGeneratedCommentCaches === 'function') resetGeneratedCommentCaches(reload);
}
function releaseMineradioCaches() {
  if (mineradioCacheStorageBusy) return Promise.resolve();
  if (!window.desktopWindow || typeof window.desktopWindow.releaseCaches !== 'function') {
    setMineradioCacheStorageStatus('当前版本暂不支持释放缓存，请更新桌面版。', 'error');
    return Promise.resolve();
  }
  setMineradioCacheStorageBusy(true, 'release');
  setMineradioCacheStorageStatus('正在释放可再生缓存，音乐继续播放…', 'progress');
  // Cancel old readers before the disk generation changes; never touch audio or user storage.
  resetMineradioGeneratedMemoryCaches(false);
  return Promise.resolve().then(function () { return window.desktopWindow.releaseCaches(); }).then(function (result) {
    result = result || {};
    resetMineradioGeneratedMemoryCaches(true);
    var hasResult = result.ok || result.partial || Number(result.freedBytes) > 0;
    if (!hasResult) {
      setMineradioCacheStorageStatus('未能释放缓存，请稍后重试。' + (result.error ? ' ' + result.error : ''), 'error');
    } else {
      var message = '已释放 ' + formatMineradioCacheBytes(result.freedBytes) + '，封面与评论已请求更新。';
      var failed = Number(result.failedFiles) > 0 || Array.isArray(result.errors) && result.errors.length > 0;
      if (failed) message += ' 部分缓存未清理，可稍后重试。';
      else if (result.skippedFiles) message += ' 已保留正在使用或受保护的文件。';
      setMineradioCacheStorageStatus(message, failed ? 'error' : 'success');
    }
    if (result.snapshot && result.snapshot.ok) { applyMineradioCacheSettings(result.snapshot); return; }
    return readMineradioCacheSettings();
  }).catch(function (error) {
    resetMineradioGeneratedMemoryCaches(true);
    setMineradioCacheStorageStatus('释放未完成，请稍后重试。' + (error && error.message ? ' ' + error.message : ''), 'error');
  }).finally(function () { setMineradioCacheStorageBusy(false); });
}

function restartMineradioForCachePath() {
  if (mineradioCacheStorageBusy || !window.desktopWindow || typeof window.desktopWindow.restartApp !== 'function') return;
  window.desktopWindow.restartApp();
}

setTimeout(refreshMineradioCacheSettings, 450);
