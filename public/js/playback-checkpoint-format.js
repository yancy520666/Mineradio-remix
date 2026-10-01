(function (root) {
  'use strict';
  var songKeys = ['provider', 'source', 'type', 'id', 'mid', 'songmid', 'mediaMid', 'media_mid', 'qqId',
    'spotifyId', 'spotifyUri', 'spotifyUrl', 'uri', 'albumUri', 'hash', 'fileHash', 'audioHash',
    'albumId', 'album_id', 'albumMid', 'albummid', 'albumAudioId', 'album_audio_id', 'mixSongId',
    'hqHash', 'sqHash', 'resHash', 'name', 'title', 'artist', 'album', 'cover', 'duration',
    'durationMs', 'dt', 'fee', 'playable', 'playbackMode', 'recommendationSource', 'programId',
    'radioId', 'radioName', 'localKey', 'localFileId', 'localMissing'];
  function song(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var result = {};
    songKeys.forEach(function (key) {
      var item = value[key];
      if (typeof item === 'string' && item.length <= (key === 'cover' ? 16384 : 2048) || typeof item === 'number' && isFinite(item) || typeof item === 'boolean') result[key] = item;
    });
    if (result.cover && (!/^(https?:\/\/|data:image\/|mineradio-local:\/\/cover\/)/i.test(result.cover) || /[<>"'\s]/.test(result.cover))) delete result.cover;
    if (Array.isArray(value.artists)) result.artists = value.artists.slice(0, 6).map(function (artist) {
      if (typeof artist === 'string') return artist.slice(0, 512);
      return { id: Number(artist && artist.id) || 0, name: String(artist && artist.name || '').slice(0, 512) };
    });
    return result.id || result.mid || result.hash || result.spotifyId || result.localKey || result.name || result.title ? result : null;
  }
  function normalize(value) {
    if (!value || value.version !== 1 || !Number.isFinite(value.savedAt) || value.savedAt <= 0 || value.savedAt > Date.now() + 60000) return null;
    if (!Number.isFinite(value.currentTime) || value.currentTime < 0 || !Number.isFinite(value.duration) || value.duration < 0) return null;
    if (!Array.isArray(value.queue) || value.queue.length > 120 || !Number.isInteger(value.currentIdx) || value.currentIdx < -1 || value.currentIdx > 1000000) return null;
    var current = song(value.current);
    if (!current) return null;
    var queue = value.queue.map(song).filter(Boolean);
    var duration = Math.min(value.duration, 31536000);
    var result = { version: 1, savedAt: value.savedAt, reason: String(value.reason || '').slice(0, 64),
      currentIdx: value.currentIdx < 0 ? -1 : Math.min(value.currentIdx, Math.max(0, queue.length - 1)), currentTime: Math.min(value.currentTime, duration > 0 ? duration : 31536000),
      duration: duration, playing: value.playing === true, current: current, queue: queue };
    return new TextEncoder().encode(JSON.stringify(result)).length <= 524288 ? result : null;
  }
  var api = { normalize: normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlaybackCheckpointFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
