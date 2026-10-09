// A cache miss can use the existing disk cache; eviction never mutates the
// currently playing map. Both MR and DJ caches have their own 8 MiB budget.
function estimateBeatMapBytes(value) {
  var bytes = 0, seen = new WeakSet(), pending = [value];
  while (pending.length) {
    var item = pending.pop();
    if (typeof item === 'string') bytes += item.length * 2;
    else if (!item || typeof item !== 'object') bytes += 8;
    else if (!seen.has(item)) {
      seen.add(item);
      if (ArrayBuffer.isView(item)) bytes += item.byteLength;
      else { bytes += 32; Object.keys(item).forEach(function (key) { bytes += key.length * 2 + 16; pending.push(item[key]); }); }
    }
  }
  return bytes;
}
function createBeatMapMemoryCache(maxBytes, maxEntries) {
  var values = Object.create(null), entries = new Map(), bytes = 0;
  maxBytes = maxBytes || 8 * 1024 * 1024;
  maxEntries = maxEntries || 24;
  function remove(key) {
    bytes -= entries.get(key) || 0;
    entries.delete(key); delete values[key];
  }
  return new Proxy(values, {
    get: function (target, key) {
      if (entries.has(key)) { var size = entries.get(key); entries.delete(key); entries.set(key, size); }
      return target[key];
    },
    set: function (target, key, value) {
      if (entries.has(key)) remove(key);
      var size = estimateBeatMapBytes(value);
      if (size > maxBytes) return true;
      target[key] = value; entries.set(key, size); bytes += size;
      while (bytes > maxBytes || entries.size > maxEntries) remove(entries.keys().next().value);
      return true;
    },
    deleteProperty: function (target, key) { remove(key); return true; }
  });
}

var targetVolume = readSavedVolume();
var uiSfxVolume = readSavedUiSfxVolume();
var lastNonZeroVolume = targetVolume > 0.01 ? targetVolume : 0.8;
var volumeCloseTimer = null;

// v7.2: 离线节拍预解析
//   每次切歌, fetch 完整音频 → OfflineAudioContext 分析 → 标出真鼓点
//   缓存按 song.id 存, 避免重复
var beatMapCache = createBeatMapMemoryCache();       // { songId: { kicks: [t1, t2, ...], duration: ... } }
var currentBeatMap = null;   // 当前播放的歌的 beatMap
var beatMapNextIdx = 0;      // 下一个待触发的 kick index
var beatMapBusy = false;     // 正在分析中
var beatMapToken = 0;        // 取消旧分析
var beatAnalysisTimer = null;
var beatAnalysisStartedAt = 0;
var beatPrefetchTimer = null;
var beatPrefetchBusy = false;
var beatPrefetchToken = 0;
var beatPrefetchLastKey = '';
var BEAT_PREFETCH_LIMIT = 2;
var beatDiskCacheStatus = { checked: false, enabled: false, mode: 'unknown', reason: '' };
var beatDiskCacheNoticeLogged = false;
var djBeatMapCache = createBeatMapMemoryCache();
var currentDjBeatMap = null;
var djBeatMapNextIdx = 0;
var djBeatPulseNextIdx = 0;
var djBeatMapBusy = false;
var djBeatMapToken = 0;
var djBeatAnalysisTimer = null;
var beatAnalysisConfig = {
  delayMs: 1600,
  minPlaybackSec: 1.2,
  idleTimeout: 1400,
  skipMusicTempoWhilePlaying: false
};
var beatCam = {
  nextIdx: 0,
  events: [],
  punch: 0,
  lookahead: 0.075,
  lastTriggerAt: -10,
  lastRealtimeAt: -10,
  minInterval: 0.500,
  fallbackMinInterval: 0.320,
  realtimeMinInterval: 0.460,
  realtimeMergeWindow: 0.135,
  attack: 0.028,
  hold: 0.030,
  release: 0.185,
  thetaKick: 0,
  phiKick: 0,
  radiusKick: 0,
  rollKick: 0,
  prevAudioTime: -1,
  stats: { map: 0, live: 0, merged: 0, liveBlocked: 0 }
};
var liveCamAvg = 0, liveCamPeak = 0.28, liveCamLastRaw = 0;
var cinemaDynamics = { avg: 0, lowAvg: 0, peak: 0.30, scale: 0.82 };
var cinemaTrackProfile = {
  scale: 1.0,
  target: 1.0,
  nameHint: 1.0,
  frames: 0,
  energyAvg: 0,
  lowAvg: 0,
  vocalAvg: 0,
  melodyAvg: 0,
  punchPeak: 0.10,
  density: 0
};
var rtBeat = {
  subFast: 0, subSlow: 0, lowFast: 0, lowSlow: 0,
  bodyFast: 0, bodySlow: 0, vocalFast: 0, vocalSlow: 0, snapFast: 0, snapSlow: 0,
  prevSub: 0, prevLow: 0, prevBody: 0, prevVocal: 0, prevSnap: 0, prevRms: 0,
  onsetAvg: 0.012, onsetPeak: 0.060,
  subPeak: 0.14, lowPeak: 0.18, bodyPeak: 0.16, vocalPeak: 0.16, snapPeak: 0.14,
  lastHitAt: -10,
  tempoGap: 0,
  tempoConfidence: 0,
  beatCount: 0,
  primedFrames: 0,
  warmupUntil: 0,
  pulse: 0,
  score: 0,
  stats: { hits: 0, blocked: 0, assisted: 0, strong: 0, rejected: 0 }
};
var djMode = {
  active: false,
  songKey: '',
  startedAt: 0,
  lastNoticeAt: -100000,
  tempoGap: 0,
  tempoConfidence: 0,
  sectionEnergy: 0,
  sectionLow: 0,
  sectionChange: 0,
  visualPulse: 0,
  lastBeatAt: -10
};

function isPodcastSong(song) {
  return !!(song && song.type === 'podcast');
}

function djSongKey(song) {
  if (!song) return '';
  if (song.localKey) return 'local:' + song.localKey;
  return 'podcast:' + (song.programId || song.id || song.name || '');
}

function resetDjModeMeter() {
  djMode.tempoGap = 0;
  djMode.tempoConfidence = 0;
  djMode.sectionEnergy = 0;
  djMode.sectionLow = 0;
  djMode.sectionChange = 0;
  djMode.visualPulse = 0;
  djMode.lastBeatAt = -10;
}

function resetDjBeatMapState() {
  currentDjBeatMap = null;
  djBeatMapNextIdx = 0;
  djBeatPulseNextIdx = 0;
}

function cancelDjBeatAnalysisTimer() {
  if (djBeatAnalysisTimer) {
    clearTimeout(djBeatAnalysisTimer);
    djBeatAnalysisTimer = null;
  }
}

function setDjModeActive(active, song) {
  active = !!active;
  var key = active ? djSongKey(song) : '';
  var changed = djMode.active !== active || djMode.songKey !== key;
  djMode.active = active;
  djMode.songKey = key;
  if (changed) {
    djMode.startedAt = performance.now();
    resetDjModeMeter();
  }
  if (active) {
    currentBeatMap = null;
    beatMapNextIdx = 0;
    cancelBeatAnalysisTimer();
    hideBeatChip();
  } else {
    djBeatMapToken++;
    cancelDjBeatAnalysisTimer();
    resetDjBeatMapState();
  }
}

function maybeAnnounceDjMode() {
  if (!djMode.active) return;
  var now = performance.now();
  if (now - djMode.lastNoticeAt > 8000) {
    djMode.lastNoticeAt = now;
    showToast('DJ Mode · 离线锁拍');
  }
}

// fx 状态: 预设 + 主滑块 + 开关 + 三态
