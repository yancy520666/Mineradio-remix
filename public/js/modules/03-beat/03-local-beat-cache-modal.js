function showBeatChip(text) {
  document.getElementById('beat-text').textContent = text || '分析节奏…';
  document.getElementById('beat-chip').classList.add('show');
  if (localBeatAnalysis && localBeatAnalysis.active) setLocalBeatStatus(text || '分析中...', 'warn');
}
function hideBeatChip() {
  document.getElementById('beat-chip').classList.remove('show');
}

function localBeatRound(v, scale) {
  v = Number(v);
  if (!isFinite(v)) return 0;
  scale = scale || 1000;
  return Math.round(v * scale) / scale;
}
function packLocalBeatEvent(ev) {
  if (typeof ev === 'number') return [localBeatRound(ev, 1000), 0.42, 0.72, 0.42, 0.62, 0.22, 0.16, 0, 7, 0.62, 0.12, 0];
  ev = ev || {};
  var comboIdx = Math.max(0, LOCAL_BEAT_COMBOS.indexOf(ev.combo || ''));
  var flags = 0;
  if (ev.primary !== false) flags |= 1;
  if (ev.camera !== false) flags |= 2;
  if (ev.pulse !== false) flags |= 4;
  if (ev.dj) flags |= 8;
  if (ev.grid) flags |= 16;
  if (ev.kickOnly) flags |= 32;
  return [
    localBeatRound(ev.time, 1000),
    localBeatRound(ev.strength == null ? 0.42 : ev.strength, 1000),
    localBeatRound(ev.confidence == null ? 0.72 : ev.confidence, 1000),
    localBeatRound(ev.impact == null ? (ev.strength == null ? 0.42 : ev.strength) : ev.impact, 1000),
    localBeatRound(ev.low == null ? 0.62 : ev.low, 1000),
    localBeatRound(ev.body == null ? 0.22 : ev.body, 1000),
    localBeatRound(ev.snap == null ? 0.16 : ev.snap, 1000),
    comboIdx,
    flags,
    localBeatRound(ev.mass == null ? 0.62 : ev.mass, 1000),
    localBeatRound(ev.sharpness == null ? 0.12 : ev.sharpness, 1000),
    localBeatRound(ev.step || 0, 1000)
  ];
}
function unpackLocalBeatEvent(row) {
  if (typeof row === 'number') return row;
  if (!Array.isArray(row)) return row;
  var flags = row[8] || 0;
  return {
    time: row[0] || 0,
    strength: row[1] == null ? 0.42 : row[1],
    confidence: row[2] == null ? 0.72 : row[2],
    impact: row[3] == null ? (row[1] || 0.42) : row[3],
    low: row[4] == null ? 0.62 : row[4],
    body: row[5] == null ? 0.22 : row[5],
    snap: row[6] == null ? 0.16 : row[6],
    combo: LOCAL_BEAT_COMBOS[row[7] || 0] || undefined,
    primary: !!(flags & 1),
    camera: !!(flags & 2),
    pulse: !!(flags & 4),
    dj: !!(flags & 8),
    grid: !!(flags & 16),
    kickOnly: !!(flags & 32),
    mass: row[9] == null ? 0.62 : row[9],
    sharpness: row[10] == null ? 0.12 : row[10],
    step: row[11] || 0
  };
}
function generatedLocalBeatMaps() {
  if (!generatedLocalBeatMaps.values) generatedLocalBeatMaps.values = new WeakSet();
  return generatedLocalBeatMaps.values;
}
function packLocalBeatMap(map) {
  if (!map) return null;
  var camera = (map.cameraBeats || map.beats || map.kicks || []).map(packLocalBeatEvent);
  var pulse = (map.pulseBeats || map.kicks || []).map(packLocalBeatEvent);
  return {
    v: 1,
    automaticLocalAnalysis: generatedLocalBeatMaps().has(map),
    duration: localBeatRound(map.duration || 0, 1000),
    gridStep: localBeatRound(map.gridStep || 0, 1000),
    sectionSteps: (map.sectionSteps || []).map(function (v) { return localBeatRound(v, 1000); }),
    tempoSource: map.tempoSource || 'local',
    visualBeatCount: map.visualBeatCount || camera.length,
    analyzedAt: map.analyzedAt || Date.now(),
    partial: !!map.partial,
    partialUntilSec: map.partialUntilSec || 0,
    cameraBeats: camera,
    pulseBeats: pulse
  };
}
function unpackLocalBeatMap(stored) {
  if (!stored) return null;
  if (stored.v && stored.v !== 1 && stored.v !== 2) return stored;
  var camera = (stored.cameraBeats || []).map(unpackLocalBeatEvent);
  var pulse = (stored.pulseBeats || []).map(unpackLocalBeatEvent);
  var map = {
    kicks: camera.map(function (b) { return typeof b === 'number' ? b : b.time; }),
    beats: camera,
    pulseBeats: pulse,
    cameraBeats: camera,
    gridStep: stored.gridStep || 0,
    sectionSteps: stored.sectionSteps || [],
    tempoSource: stored.tempoSource || 'local',
    duration: stored.duration || 0,
    visualBeatCount: stored.visualBeatCount || camera.length,
    analyzedAt: stored.analyzedAt || Date.now(),
    partial: !!stored.partial,
    partialUntilSec: stored.partialUntilSec || 0
  };
  if (stored.automaticLocalAnalysis === true) generatedLocalBeatMaps().add(map);
  return map;
}
function readLocalBeatPrefs() {
  try { return JSON.parse(localStorage.getItem(LOCAL_BEAT_PREF_STORE_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function saveLocalBeatPrefs() {
  try { localStorage.setItem(LOCAL_BEAT_PREF_STORE_KEY, JSON.stringify(localBeatMapPrefs || {})); } catch (e) { }
}
// Provenance is deliberately opt-in. Historical maps and caller-supplied edits
// have no automatic-map marker and are never discarded to meet a cache budget.
function isAutomaticLocalBeatMap(entry, mode) {
  return !!(entry && entry[mode] && entry.automaticMaps && entry.automaticMaps[mode] === entry[mode] && generatedLocalBeatMaps().has(entry[mode]));
}
function touchLocalBeatEntry(entry) {
  touchLocalBeatEntry.serial = Math.max(Date.now(), (touchLocalBeatEntry.serial || 0) + 1);
  entry.lastUsedAt = touchLocalBeatEntry.serial;
}
function localBeatEntryIsPinned(key, entry) {
  if (typeof currentLocalSong !== 'undefined' && currentLocalSong && currentLocalSong.localKey === key) return true;
  if (typeof localBeatAnalysis !== 'undefined' && localBeatAnalysis && localBeatAnalysis.song && localBeatAnalysis.song.localKey === key) return true;
  return ['mr', 'dj'].some(function (mode) {
    var map = entry[mode];
    return !!(map && ((typeof currentBeatMap !== 'undefined' && currentBeatMap === map)
      || (typeof currentDjBeatMap !== 'undefined' && currentDjBeatMap === map)));
  });
}
function trimLocalBeatMapCache() {
  var automatic = [], bytes = 0;
  Object.keys(localBeatMapCache || {}).forEach(function (key) {
    var entry = localBeatMapCache[key];
    var modes = ['mr', 'dj'].filter(function (mode) { return isAutomaticLocalBeatMap(entry, mode); });
    if (!modes.length) return;
    var size = modes.reduce(function (total, mode) {
      return total + (typeof estimateBeatMapBytes === 'function' ? estimateBeatMapBytes(entry[mode]) : 0);
    }, 0);
    bytes += size;
    automatic.push({ key: key, entry: entry, modes: modes, size: size });
  });
  automatic.sort(function (a, b) { return (a.entry.lastUsedAt || a.entry.updatedAt || 0) - (b.entry.lastUsedAt || b.entry.updatedAt || 0); });
  var remaining = automatic.length;
  automatic.forEach(function (item) {
    if (remaining <= 12 && bytes <= 8 * 1024 * 1024) return;
    if (localBeatEntryIsPinned(item.key, item.entry)) return;
    item.modes.forEach(function (mode) { delete item.entry[mode]; delete item.entry.automaticMaps[mode]; });
    if (!item.entry.mr && !item.entry.dj) delete localBeatMapCache[item.key];
    remaining--;
    bytes -= item.size;
  });
}
function readLocalBeatMapCache() {
  var out = {};
  try {
    var raw = JSON.parse(localStorage.getItem(LOCAL_BEATMAP_STORE_KEY) || '{}') || {};
    Object.keys(raw).forEach(function (key) {
      var entry = raw[key] || {};
      out[key] = { updatedAt: entry.updatedAt || 0 };
      ['mr', 'dj'].forEach(function (mode) {
        if (!entry[mode]) return;
        out[key][mode] = entry.preservedModes && entry.preservedModes[mode] ? entry[mode] : unpackLocalBeatMap(entry[mode]);
        if (entry.automaticModes && entry.automaticModes[mode] === true) {
          if (!out[key].automaticMaps) out[key].automaticMaps = {};
          out[key].automaticMaps[mode] = out[key][mode];
          generatedLocalBeatMaps().add(out[key][mode]);
        }
      });
    });
  } catch (e) {
    out = {};
  }
  return out;
}
function packLocalBeatCache(maxEntries) {
  var entries = Object.keys(localBeatMapCache || {}).map(function (key) {
    var entry = localBeatMapCache[key] || {};
    return { key: key, updatedAt: entry.lastUsedAt || entry.updatedAt || 0, entry: entry };
  }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  var packed = {}, automaticCount = 0;
  entries.forEach(function (item) {
    var record = { updatedAt: item.entry.updatedAt || Date.now(), automaticModes: {}, preservedModes: {} };
    var hasAutomatic = false;
    ['mr', 'dj'].forEach(function (mode) {
      if (!item.entry[mode]) return;
      if (isAutomaticLocalBeatMap(item.entry, mode)) {
        if (maxEntries && automaticCount >= maxEntries) return;
        record[mode] = packLocalBeatMap(item.entry[mode]);
        record.automaticModes[mode] = true;
        hasAutomatic = true;
      } else {
        // Keep unknown/user data intact, including fields the compact generated
        // map format does not know. Quota fallback only reduces automatic maps.
        record[mode] = item.entry[mode];
        record.preservedModes[mode] = true;
      }
    });
    if (hasAutomatic) automaticCount++;
    if (record.mr || record.dj) packed[item.key] = record;
  });
  return packed;
}
function saveLocalBeatMapCache() {
  trimLocalBeatMapCache();
  var attempts = [12, 8, 5, 3];
  for (var i = 0; i < attempts.length; i++) {
    try {
      localStorage.setItem(LOCAL_BEATMAP_STORE_KEY, JSON.stringify(packLocalBeatCache(attempts[i])));
      return true;
    } catch (e) { }
  }
  return false;
}
function getLocalBeatEntry(localKey, mode) {
  var entry = localKey && localBeatMapCache ? localBeatMapCache[localKey] : null;
  if (!entry || !entry[mode]) return null;
  touchLocalBeatEntry(entry);
  return entry[mode];
}
function storeLocalBeatEntry(localKey, mode, map, song, opts) {
  if (!localKey || !map) return;
  opts = opts || {};
  var entry = localBeatMapCache[localKey] || {};
  entry[mode] = map;
  if (!entry.automaticMaps) entry.automaticMaps = {};
  if (opts.automatic === true) { entry.automaticMaps[mode] = map; generatedLocalBeatMaps().add(map); }
  else { delete entry.automaticMaps[mode]; generatedLocalBeatMaps().delete(map); }
  entry.updatedAt = Date.now();
  touchLocalBeatEntry(entry);
  localBeatMapCache[localKey] = entry;
  localBeatMapPrefs[localKey] = mode;
  saveLocalBeatPrefs();
  saveLocalBeatMapCache();
  if (!opts.skipDisk) writeBeatDiskCache(localBeatDiskKey(localKey, mode), map, song || { type: 'local', localKey: localKey }, mode);
}
function setLocalBeatStatus(text, tone) {
  var el = document.getElementById('local-beat-status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('warn', tone === 'warn');
  el.classList.toggle('fail', tone === 'fail');
}

function localBeatVisualCount(map) {
  return map ? (map.visualBeatCount || (map.cameraBeats && map.cameraBeats.length) || (map.beats && map.beats.length) || 0) : 0;
}
function setLocalBeatPreference(localKey, mode) {
  if (!localKey) return;
  localBeatMapPrefs[localKey] = mode === 'dj' ? 'dj' : 'mr';
  saveLocalBeatPrefs();
}
function applyLocalBeatMap(song, mode, map, fromCache) {
  if (!song || !song.localKey || !map) return false;
  mode = mode === 'dj' ? 'dj' : 'mr';
  song.localBeatMode = mode;
  setLocalBeatPreference(song.localKey, mode);
  if (mode === 'dj') {
    setDjModeActive(true, song);
    currentBeatMap = null;
    beatMapNextIdx = 0;
    currentDjBeatMap = map;
    djBeatMapCache[djSongKey(song)] = map;
    applyPodcastDjProfileFromMap(map);
    syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
    maybeAnnounceDjMode();
  } else {
    setDjModeActive(false, song);
    currentBeatMap = map;
    beatMapCache['local:' + song.localKey] = map;
    applyCinemaProfileFromBeatMap(map);
    syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0, true);
  }
  hideBeatChip();
  notifyDesktopLyricsBeatMapReady();
  if (fromCache) showToast((mode === 'dj' ? 'DJ' : 'MR') + ' 本地节奏缓存已载入');
  return true;
}
function prepareLocalBeatAnalysis(song, audioUrl) {
  if (!song || !song.localKey || !audioUrl) return;
  var preferred = localBeatMapPrefs[song.localKey] === 'dj' ? 'dj' : 'mr';
  var cached = getLocalBeatEntry(song.localKey, preferred) ||
    getLocalBeatEntry(song.localKey, preferred === 'dj' ? 'mr' : 'dj');
  if (cached) {
    applyLocalBeatMap(song, cached === getLocalBeatEntry(song.localKey, 'dj') ? 'dj' : 'mr', cached, true);
    return;
  }
  var diskToken = trackSwitchToken;
  (async function () {
    var firstMode = preferred;
    var secondMode = preferred === 'dj' ? 'mr' : 'dj';
    var firstMap = await readBeatDiskCache(localBeatDiskKey(song.localKey, firstMode));
    var mode = firstMap ? firstMode : secondMode;
    var map = firstMap || await readBeatDiskCache(localBeatDiskKey(song.localKey, secondMode));
    if (diskToken !== trackSwitchToken || !currentLocalSong || currentLocalSong.localKey !== song.localKey) return;
    // An edit or another analysis completed while disk I/O was pending.
    var newer = getLocalBeatEntry(song.localKey, preferred) || getLocalBeatEntry(song.localKey, secondMode);
    if (newer) {
      applyLocalBeatMap(song, newer === getLocalBeatEntry(song.localKey, 'dj') ? 'dj' : 'mr', newer, true);
      return;
    }
    if (map) {
      storeLocalBeatEntry(song.localKey, mode, map, song, { skipDisk: true, automatic: generatedLocalBeatMaps().has(map) });
      applyLocalBeatMap(song, mode, map, true);
      return;
    }
    openLocalBeatModal(song, audioUrl);
  })().catch(function () {
    if (diskToken === trackSwitchToken && currentLocalSong && currentLocalSong.localKey === song.localKey) openLocalBeatModal(song, audioUrl);
  });
}
function openLocalBeatModal(song, audioUrl) {
  if (localBeatAnalysis.active) return;
  localBeatAnalysis.token++;
  if (immersiveMode) setImmersiveMode(false);
  localBeatAnalysis.song = song || currentLocalSong;
  localBeatAnalysis.audioUrl = audioUrl || (audio && audio.src) || '';
  localBeatAnalysis.mode = (localBeatAnalysis.song && localBeatMapPrefs[localBeatAnalysis.song.localKey] === 'dj') ? 'dj' : 'mr';
  localBeatAnalysis.active = false;
  setLocalBeatStatus('', '');
  updateLocalBeatModal();
  openGsapModal(document.getElementById('local-beat-modal'));
}
function closeLocalBeatModal() {
  if (localBeatAnalysis.active) return;
  closeGsapModal(document.getElementById('local-beat-modal'));
  localBeatAnalysis.song = null;
  localBeatAnalysis.audioUrl = '';
  if (typeof trimLocalBeatMapCache === 'function') trimLocalBeatMapCache();
  if (typeof scheduleLocalAudioObjectUrlSweep === 'function') scheduleLocalAudioObjectUrlSweep();
}
function selectLocalBeatMode(mode) {
  if (localBeatAnalysis.active) return;
  localBeatAnalysis.mode = mode === 'dj' ? 'dj' : 'mr';
  updateLocalBeatModal();
}
function updateLocalBeatModal() {
  var song = localBeatAnalysis.song || currentLocalSong || {};
  var mode = localBeatAnalysis.mode === 'dj' ? 'dj' : 'mr';
  var modal = document.querySelector('#local-beat-modal .local-beat-modal');
  if (modal) modal.classList.toggle('analyzing', !!localBeatAnalysis.active);
  var title = document.getElementById('local-beat-title');
  var sub = document.getElementById('local-beat-sub');
  if (title) title.textContent = song.name || '本地歌曲';
  if (sub) {
    var cachedBits = [];
    if (song.localKey && getLocalBeatEntry(song.localKey, 'mr')) cachedBits.push('MR 已缓存');
    if (song.localKey && getLocalBeatEntry(song.localKey, 'dj')) cachedBits.push('DJ 已缓存');
    sub.textContent = cachedBits.length ? cachedBits.join(' / ') : '选择一种电影视角分析方式';
  }
  var mr = document.getElementById('local-beat-tab-mr');
  var dj = document.getElementById('local-beat-tab-dj');
  if (mr) mr.classList.toggle('active', mode === 'mr');
  if (dj) dj.classList.toggle('active', mode === 'dj');
  var desc = document.getElementById('local-beat-desc');
  if (desc) desc.textContent = mode === 'dj'
    ? '适合 DJ、长混音或鼓点密集的本地音频，会使用更稳定的低频锁拍并进入 DJ 视觉驱动。'
    : '适合普通歌曲和日常播放，会沿用 Mineradio 电影视角的综合节奏分析。';
  var start = document.getElementById('local-beat-start-btn');
  var cancel = document.getElementById('local-beat-cancel-btn');
  var later = document.getElementById('local-beat-later-btn');
  if (start) {
    start.disabled = !!localBeatAnalysis.active;
    start.textContent = getLocalBeatEntry(song.localKey, mode) ? '使用缓存' : '开始分析';
  }
  if (cancel) cancel.style.display = localBeatAnalysis.active ? '' : 'none';
  if (later) later.style.display = localBeatAnalysis.active ? 'none' : '';
}
function cancelLocalBeatAnalysis() {
  if (!localBeatAnalysis.active) {
    closeLocalBeatModal();
    return;
  }
  localBeatAnalysis.active = false;
  localBeatAnalysis.token++;
  beatMapToken++;
  djBeatMapToken++;
  beatMapBusy = false;
  djBeatMapBusy = false;
  cancelBeatAnalysisTimer();
  cancelDjBeatAnalysisTimer();
  hideBeatChip();
  if (localBeatAnalysis.mode === 'dj') setDjModeActive(false, localBeatAnalysis.song || currentLocalSong);
  setLocalBeatStatus('已取消分析', 'fail');
  updateLocalBeatModal();
}
async function startLocalBeatAnalysis(mode) {
  var song = localBeatAnalysis.song || currentLocalSong;
  var audioUrl = localBeatAnalysis.audioUrl || (song && song.localUrl) || (audio && audio.src) || '';
  mode = mode || localBeatAnalysis.mode;
  mode = mode === 'dj' ? 'dj' : 'mr';
  if (!song || !song.localKey || !audioUrl || localBeatAnalysis.active) return;
  var cached = getLocalBeatEntry(song.localKey, mode);
  if (cached) {
    applyLocalBeatMap(song, mode, cached, true);
    closeLocalBeatModal();
    return;
  }
  localBeatAnalysis.active = true;
  localBeatAnalysis.mode = mode;
  localBeatAnalysis.token++;
  var localToken = localBeatAnalysis.token;
  var analysisTrackToken = typeof trackSwitchToken === 'undefined' ? null : trackSwitchToken;
  updateLocalBeatModal();
  setLocalBeatStatus((mode === 'dj' ? 'DJ' : 'MR') + ' 分析准备中...', 'warn');
  var releaseAudioUrl = typeof retainLocalAudioObjectUrl === 'function' ? retainLocalAudioObjectUrl(audioUrl) : function () {};
  try {
    var map = null;
    if (mode === 'dj') {
      setDjModeActive(true, song);
      djBeatMapToken++;
      resetDjBeatMapState();
      currentBeatMap = null;
      resetBeatCameraSync(audio ? audio.currentTime : 0);
      var djToken = djBeatMapToken;
      map = await analyzePodcastDjBeats(audioUrl, djToken, audio && isFinite(audio.duration) ? audio.duration : 0);
      if (localToken !== localBeatAnalysis.token || djToken !== djBeatMapToken
        || (analysisTrackToken !== null && analysisTrackToken !== trackSwitchToken)) return;
      if (!map) throw new Error('DJ analysis returned empty map');
    } else {
      setDjModeActive(false, song);
      beatMapToken++;
      currentBeatMap = null;
      beatMapNextIdx = 0;
      resetBeatCameraSync(audio ? audio.currentTime : 0);
      var mrToken = beatMapToken;
      map = await analyzeAudioBeats(audioUrl, audio && isFinite(audio.duration) ? audio.duration : 0, mrToken, { background: false, song: song });
      if (localToken !== localBeatAnalysis.token || mrToken !== beatMapToken
        || (analysisTrackToken !== null && analysisTrackToken !== trackSwitchToken)) return;
      if (!map) throw new Error('MR analysis returned empty map');
    }
    var newer = getLocalBeatEntry(song.localKey, mode);
    if (newer) map = newer; // Never overwrite a newer caller-supplied edit.
    else storeLocalBeatEntry(song.localKey, mode, map, song, { automatic: true });
    applyLocalBeatMap(song, mode, map, false);
    localBeatAnalysis.active = false;
    setLocalBeatStatus((mode === 'dj' ? 'DJ' : 'MR') + ' 分析完成: ' + localBeatVisualCount(map) + ' 个主拍');
    updateLocalBeatModal();
    showToast((mode === 'dj' ? 'DJ' : 'MR') + ' 本地节奏分析完成');
    setTimeout(function () {
      if (!localBeatAnalysis.active && localBeatAnalysis.token === localToken && localBeatAnalysis.song === song
        && (analysisTrackToken === null || analysisTrackToken === trackSwitchToken)) closeLocalBeatModal();
    }, 900);
  } catch (err) {
    if (localToken !== localBeatAnalysis.token || (mode === 'dj' ? djToken !== djBeatMapToken : mrToken !== beatMapToken)
      || (analysisTrackToken !== null && analysisTrackToken !== trackSwitchToken)) return;
    console.warn('local beat analysis failed:', err);
    localBeatAnalysis.active = false;
    hideBeatChip();
    if (mode === 'dj') setDjModeActive(false, song);
    setLocalBeatStatus('分析失败，请换另一种模式重试', 'fail');
    updateLocalBeatModal();
    showToast('本地节奏分析失败');
  } finally {
    releaseAudioUrl();
  }
}

