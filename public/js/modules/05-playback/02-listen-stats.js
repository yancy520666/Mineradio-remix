function boundListenDailyHistory(daily) {
  var keys = Object.keys(daily).sort().reverse();
  keys.slice(730).forEach(function (key) { delete daily[key]; });
  return daily;
}
function boundListenStats(state, maxBytes) {
  maxBytes = maxBytes || 512 * 1024;
  state.archivedPlays = Math.max(0, Number(state.archivedPlays) || 0);
  state.history = (state.history || []).slice(0, 180);
  function compactText(item) {
    if (!item || typeof item !== 'object') return;
    ['name', 'artist', 'source'].forEach(function (key) { if (typeof item[key] === 'string') item[key] = item[key].slice(0, 512); });
    if (typeof item.cover === 'string' && item.cover.length > 4096) item.cover = '';
  }
  state.history.forEach(compactText);
  var songs = Object.keys(state.songs), artists = Object.keys(state.artists);
  songs.forEach(function (key) { compactText(state.songs[key]); });
  artists.forEach(function (key) { compactText(state.artists[key]); });
  // Keep the leaders as well as recent entries; lifetime play count is folded
  // into a scalar before any old detail is evicted.
  function evictionOrder(keys, values) {
    var leaders = keys.slice().sort(function (a, b) { return (Number(values[b] && values[b].plays) || 0) - (Number(values[a] && values[a].plays) || 0); }).slice(0, 30);
    var protectedKeys = new Set(leaders);
    return keys.sort(function (a, b) {
      return Number(protectedKeys.has(a)) - Number(protectedKeys.has(b))
        || (Number(values[a] && values[a].lastPlayedAt) || 0) - (Number(values[b] && values[b].lastPlayedAt) || 0);
    });
  }
  songs = evictionOrder(songs, state.songs);
  artists = evictionOrder(artists, state.artists);
  function removeSong() {
    var key = songs.shift();
    state.archivedPlays += Math.max(0, Number(state.songs[key] && state.songs[key].plays) || 0);
    delete state.songs[key];
  }
  while (songs.length > 2000) removeSong();
  while (artists.length > 1000) delete state.artists[artists.shift()];
  var serialized = JSON.stringify(state);
  while (serialized.length * 2 > maxBytes && (songs.length || artists.length || state.history.length)) {
    // Remove in batches so migration of a large legacy store doesn't repeatedly
    // stringify its whole contents for every individual song.
    if (songs.length) { var n = Math.max(1, Math.ceil(songs.length / 8)); while (n-- && songs.length) removeSong(); }
    if (artists.length) { var n = Math.max(1, Math.ceil(artists.length / 8)); while (n-- && artists.length) delete state.artists[artists.shift()]; }
    if (!songs.length && !artists.length) state.history = state.history.slice(0, Math.floor(state.history.length / 2));
    serialized = JSON.stringify(state);
  }
  return serialized;
}
function persistListenStats(state) {
  for (var budget = 512 * 1024; budget >= 16 * 1024; budget /= 2) {
    var serialized = boundListenStats(state, budget);
    try { localStorage.setItem(HOME_LISTEN_STATS_KEY, serialized); return true; }
    catch (error) {
      if (error.name !== 'QuotaExceededError') break;
    }
  }
  if (!persistListenStats.warned) {
    persistListenStats.warned = true;
    console.warn('听歌统计暂时无法保存：本地存储空间不足，请在设置中检查存储占用');
  }
  return false;
}

var HOME_LISTEN_ROLLUP_V2_KEY = 'mineradio-listen-rollup-v2';
var listenSessionSerial = 0;

function emptyListenRollupV2() {
  return { version: 2, totalListenMs: 0, sessions: 0, daily: {}, updatedAt: 0 };
}
function loadListenRollupV2() {
  try {
    var raw = localStorage.getItem(HOME_LISTEN_ROLLUP_V2_KEY);
    if (!raw) return emptyListenRollupV2();
    var data = JSON.parse(raw);
    return {
      version: 2,
      totalListenMs: Math.max(0, Number(data.totalListenMs) || 0),
      sessions: Math.max(0, Number(data.sessions) || 0),
      daily: boundListenDailyHistory(data.daily && typeof data.daily === 'object' ? data.daily : {}),
      updatedAt: Number(data.updatedAt) || 0,
    };
  } catch (e) {
    return emptyListenRollupV2();
  }
}
function listenDayKey(timestamp) {
  var date = new Date(timestamp || Date.now());
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
function recordListenRollupV2(record) {
  try {
    var state = loadListenRollupV2();
    var listenMs = Math.max(0, Math.round(Number(record && record.listenMs) || 0));
    var dayKey = listenDayKey(record && record.playedAt);
    var day = state.daily[dayKey] && typeof state.daily[dayKey] === 'object'
      ? state.daily[dayKey]
      : { listenMs: 0, sessions: 0, completed: 0 };
    state.totalListenMs += listenMs;
    state.sessions += 1;
    day.listenMs = Math.max(0, Number(day.listenMs) || 0) + listenMs;
    day.sessions = Math.max(0, Number(day.sessions) || 0) + 1;
    day.completed = Math.max(0, Number(day.completed) || 0) + (record && record.completed ? 1 : 0);
    state.daily[dayKey] = day;
    state.updatedAt = Date.now();
    boundListenDailyHistory(state.daily);
    localStorage.setItem(HOME_LISTEN_ROLLUP_V2_KEY, JSON.stringify(state));
  } catch (e) { }
}
function createListenSessionId() {
  try {
    var cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      var hex = Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    }
  } catch (e) { }
  listenSessionSerial += 1;
  return 'mr-' + Date.now().toString(36) + '-' + listenSessionSerial.toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}
function listenSnapshotDurationMs(snapshot) {
  var rawDuration = Math.max(0, Number(snapshot && snapshot.duration) || 0);
  if (!rawDuration) return 0;
  return Math.round(rawDuration > 10000 ? rawDuration : rawDuration * 1000);
}
function listenReportProvider(snapshot) {
  var provider = String(
    (snapshot && (snapshot.provider || snapshot.sourceKey || snapshot.resolvedPlaybackProvider)) || ''
  ).trim().toLowerCase();
  if (provider === 'song' || provider === 'music') provider = 'netease';
  if (/^(netease|qq|kugou|qishui|spotify)$/.test(provider) && typeof normalizePlaybackProvider === 'function') {
    provider = normalizePlaybackProvider(provider);
  }
  return provider;
}
function reportListenSession(record, session, durationMs) {
  if (typeof fetch !== 'function' || !record || !session) return;
  var snapshot = session.song || {};
  var payload = {
    sessionId: session.sessionId || '',
    provider: listenReportProvider(snapshot),
    song: {
      key: snapshot.key || record.key || '',
      id: snapshot.id || '',
      mid: snapshot.mid || '',
      mediaMid: snapshot.mediaMid || '',
      hash: snapshot.hash || '',
      mixSongId: snapshot.mixSongId || '',
      albumId: snapshot.albumId || '',
      providerSongId: snapshot.providerSongId || '',
      spotifyId: snapshot.spotifyId || '',
      uri: snapshot.uri || '',
      type: snapshot.type || 'song',
      sourceKey: snapshot.sourceKey || '',
      name: snapshot.name || record.name || '未知歌曲',
      artist: snapshot.artist || record.artist || '',
      resolvedPlaybackProvider: snapshot.resolvedPlaybackProvider || '',
    },
    listenMs: record.listenMs,
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    completed: !!record.completed,
    context: record.context || null,
  };
  var body = '';
  try {
    body = JSON.stringify(payload);
  } catch (e) {
    payload.context = null;
    try {
      body = JSON.stringify(payload);
    } catch (serializeError) {
      return;
    }
  }
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 3500) : null;
  var options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body,
    keepalive: true,
  };
  if (controller) options.signal = controller.signal;
  try {
    Promise.resolve(fetch('/api/listen/report', options)).then(function () {
      if (timeoutId) clearTimeout(timeoutId);
    }, function () {
      if (timeoutId) clearTimeout(timeoutId);
    });
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function loadListenStatsState() {
  try {
    var raw = localStorage.getItem(HOME_LISTEN_STATS_KEY);
    if (!raw) return { history: [], songs: {}, artists: {}, updatedAt: 0 };
    var data = JSON.parse(raw);
    var state = {
      history: Array.isArray(data.history) ? data.history.slice(0, 180) : [],
      songs: data.songs && typeof data.songs === 'object' ? data.songs : {},
      artists: data.artists && typeof data.artists === 'object' ? data.artists : {},
      archivedPlays: Math.max(0, Number(data.archivedPlays) || 0),
      updatedAt: Number(data.updatedAt) || 0,
    };
    var serialized = boundListenStats(state);
    if (serialized.length < raw.length) persistListenStats(state);
    return state;
  } catch (e) {
    return { history: [], songs: {}, artists: {}, updatedAt: 0 };
  }
}
function saveListenStatsState() {
  try {
    listenStatsState.updatedAt = Date.now();
    persistListenStats(listenStatsState);
  } catch (e) { }
}
function listenSongSnapshot(song) {
  song = song || {};
  return {
    key: queueItemKey(song),
    id: song.id || '',
    mid: song.mid || song.songmid || '',
    mediaMid: song.mediaMid || song.media_mid || '',
    hash: song.hash || song.fileHash || song.audioHash || '',
    mixSongId: song.mixSongId || song.mix_song_id || '',
    albumId: song.albumId || song.album_id || (song.album && song.album.id) || '',
    providerSongId: song.providerSongId || song.provider_song_id || '',
    spotifyId: song.spotifyId || song.spotify_id || '',
    uri: song.spotifyUri || song.uri || '',
    type: song.type || 'song',
    sourceKey: song.source || song.provider || '',
    name: song.name || song.title || '未知歌曲',
    artist: song.artist || '',
    cover: songCoverSrc(song, 220) || song.cover || '',
    source: songSourceLabel(song),
    provider: song.provider || song.source || song.type || '',
    resolvedPlaybackProvider: song.resolvedPlaybackProvider || song.playbackProvider || song.audioProvider || song.providerResolved || '',
    duration: Number(song.duration) || 0,
  };
}
function beginListenSession(song, context) {
  if (!song) return;
  var snap = listenSongSnapshot(song);
  if (!snap.key) return;
  if (listenSession && listenSession.key !== snap.key) finalizeListenSession(false);
  listenSession = {
    sessionId: createListenSessionId(),
    key: snap.key,
    song: snap,
    context: context || activeRadioContext || null,
    startedAt: Date.now(),
    lastWallAt: Date.now(),
    lastAudioTime: audio && isFinite(audio.currentTime) ? audio.currentTime : 0,
    listenMs: 0,
    maxProgress: 0,
  };
}
function tickListenSessionSnapshot(session, force) {
  if (!session || !audio || !audio.duration || audio.paused) return;
  var now = Date.now();
  var audioTime = isFinite(audio.currentTime) ? audio.currentTime : 0;
  var deltaByAudio = Math.max(0, audioTime - (session.lastAudioTime || 0)) * 1000;
  var deltaByWall = Math.max(0, now - (session.lastWallAt || now));
  var delta = deltaByAudio > 0 ? Math.min(deltaByAudio, deltaByWall || deltaByAudio, 4200) : 0;
  if (force && delta <= 0) delta = Math.min(deltaByWall, 1500);
  if (delta > 0 && delta < 8000) session.listenMs += delta;
  session.lastWallAt = now;
  session.lastAudioTime = audioTime;
  session.maxProgress = Math.max(session.maxProgress || 0, audio.duration ? audioTime / audio.duration : 0);
}
function updateListenStatsTick(force) {
  if (!audio || !audio.duration || audio.paused) return;
  var song = currentCoverSong();
  if (!song) return;
  var key = queueItemKey(song);
  if (!listenSession || listenSession.key !== key) beginListenSession(song, activeRadioContext);
  if (!listenSession) return;
  tickListenSessionSnapshot(listenSession, force);
}
function finalizeListenSession(completed) {
  if (!listenSession) return;
  var session = listenSession;
  tickListenSessionSnapshot(session, true);
  var actualDurationMs = audio && isFinite(audio.duration) && audio.duration > 0
    ? Math.round(audio.duration * 1000)
    : listenSnapshotDurationMs(session.song);
  listenSession = null;
  var effective = completed || session.listenMs >= 45000 || session.maxProgress >= 0.5 || (!audio || !audio.duration ? session.listenMs >= 30000 : false);
  if (!effective) return;
  var now = Date.now();
  var snap = session.song || {};
  var record = {
    sessionId: session.sessionId || '',
    key: session.key,
    id: snap.id || '',
    mid: snap.mid || '',
    mediaMid: snap.mediaMid || '',
    hash: snap.hash || '',
    mixSongId: snap.mixSongId || '',
    albumId: snap.albumId || '',
    providerSongId: snap.providerSongId || '',
    spotifyId: snap.spotifyId || '',
    uri: snap.uri || '',
    type: snap.type || 'song',
    sourceKey: snap.sourceKey || '',
    provider: snap.provider || '',
    resolvedPlaybackProvider: snap.resolvedPlaybackProvider || '',
    name: snap.name || '未知歌曲',
    artist: snap.artist || '',
    cover: snap.cover || '',
    source: snap.source || '',
    playedAt: now,
    listenMs: Math.round(session.listenMs),
    completed: !!completed,
    context: session.context || null,
  };
  listenStatsState.history = [record].concat((listenStatsState.history || []).filter(function (item) { return item && item.key !== record.key; })).slice(0, 180);
  var songStat = listenStatsState.songs[record.key] || { key: record.key, name: record.name, artist: record.artist, cover: record.cover, source: record.source, plays: 0, listenMs: 0, completed: 0, lastPlayedAt: 0 };
  songStat.name = record.name;
  songStat.artist = record.artist;
  songStat.cover = record.cover || songStat.cover || '';
  songStat.source = record.source || songStat.source || '';
  songStat.plays += 1;
  songStat.listenMs += record.listenMs;
  songStat.completed += completed ? 1 : 0;
  songStat.lastPlayedAt = now;
  listenStatsState.songs[record.key] = songStat;
  String(record.artist || '').split(/\s*\/\s*|\s*,\s*|、|&/).forEach(function (name) {
    name = name.trim();
    if (!name) return;
    var artistStat = listenStatsState.artists[name] || { name: name, plays: 0, listenMs: 0, lastPlayedAt: 0 };
    artistStat.plays += 1;
    artistStat.listenMs += record.listenMs;
    artistStat.lastPlayedAt = now;
    listenStatsState.artists[name] = artistStat;
  });
  recordListenRollupV2(record);
  saveListenStatsState();
  reportListenSession(record, session, actualDurationMs);
  if (emptyHomeActive) renderHomeDiscover();
}
function mostPlayedSong() {
  var list = Object.keys(listenStatsState.songs || {}).map(function (key) { return listenStatsState.songs[key]; });
  list.sort(function (a, b) { return (b.plays - a.plays) || (b.listenMs - a.listenMs) || (b.lastPlayedAt - a.lastPlayedAt); });
  return list[0] || null;
}
function topListenArtist() {
  var list = Object.keys(listenStatsState.artists || {}).map(function (key) { return listenStatsState.artists[key]; });
  list.sort(function (a, b) { return (b.plays - a.plays) || (b.listenMs - a.listenMs) || (b.lastPlayedAt - a.lastPlayedAt); });
  return list[0] || null;
}
function homeListenSummary() {
  var recent = (listenStatsState.history || [])[0] || null;
  var topSong = mostPlayedSong();
  var topArtist = topListenArtist();
  var totalPlays = (Number(listenStatsState.archivedPlays) || 0) + Object.keys(listenStatsState.songs || {}).reduce(function (sum, key) { return sum + ((listenStatsState.songs[key] && listenStatsState.songs[key].plays) || 0); }, 0);
  return { recent: recent, topSong: topSong, topArtist: topArtist, totalPlays: totalPlays };
}
