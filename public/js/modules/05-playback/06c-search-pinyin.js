// ============================================================
//  拼音首字母搜索：smfx -> 失眠飞行
//  只在本机已有的歌曲里匹配（播放队列、当前歌单、本地曲库），不发请求，
//  结果作为补充插入搜索列表，不改变线上平台原有的相关性排序。
// ============================================================
var PINYIN_COLLATOR = null;
// First hanzi of each pinyin initial in collation order (a/b/c/d/e/f/g/h/j/k/l/m/n/o/p/q/r/s/t/w/x/y/z).
var PINYIN_BOUNDARIES = [
  ['a', '阿'], ['b', '八'], ['c', '嚓'], ['d', '搭'], ['e', '蛾'], ['f', '发'], ['g', '噶'], ['h', '哈'],
  ['j', '击'], ['k', '喀'], ['l', '垃'], ['m', '妈'], ['n', '拿'], ['o', '哦'], ['p', '啪'], ['q', '期'],
  ['r', '然'], ['s', '撒'], ['t', '塌'], ['w', '挖'], ['x', '昔'], ['y', '压'], ['z', '匝']
];
var pinyinInitialCache = Object.create(null);
var PINYIN_POOL_MAX = 6000;
var PINYIN_RESULT_MAX = 8;
function pinyinCollator() {
  if (PINYIN_COLLATOR === null) {
    try { PINYIN_COLLATOR = new Intl.Collator('zh-Hans-u-co-pinyin'); }
    catch (e) { PINYIN_COLLATOR = false; }
  }
  return PINYIN_COLLATOR || null;
}
// Initial letter of one hanzi, or '' when it is not a common hanzi / ICU has no pinyin data.
function pinyinInitialOfChar(ch) {
  var code = ch.charCodeAt(0);
  if (code < 0x4e00 || code > 0x9fff) return '';
  var hit = pinyinInitialCache[ch];
  if (hit !== undefined) return hit;
  var collator = pinyinCollator();
  var result = '';
  if (collator) {
    for (var i = PINYIN_BOUNDARIES.length - 1; i >= 0; i--) {
      if (collator.compare(ch, PINYIN_BOUNDARIES[i][1]) >= 0) { result = PINYIN_BOUNDARIES[i][0]; break; }
    }
  }
  pinyinInitialCache[ch] = result;
  return result;
}
// 'hasHanzi' stays false for pure Latin titles so "love" does not behave like a pinyin search.
function pinyinInitialsOf(text) {
  var out = '';
  var hasHanzi = false;
  var s = String(text || '');
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    var initial = pinyinInitialOfChar(ch);
    if (initial) { out += initial; hasHanzi = true; continue; }
    if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase();
  }
  return { text: out, hasHanzi: hasHanzi };
}
function searchQueryIsPinyinInitials(q) {
  return /^[a-z]{2,12}$/.test(String(q || '').trim().toLowerCase());
}
function pinyinSongKeys(song) {
  if (!song) return null;
  if (song._pinyinKeys) return song._pinyinKeys;
  var title = pinyinInitialsOf(song.name || song.title);
  var artist = pinyinInitialsOf(song.artist);
  var keys = { title: title.text, artist: artist.text, hasHanzi: title.hasHanzi || artist.hasHanzi };
  try { Object.defineProperty(song, '_pinyinKeys', { value: keys, enumerable: false, configurable: true, writable: true }); }
  catch (e) { }
  return keys;
}
// 0 = no match; higher is better. A title that starts with the query beats one that merely contains it.
function pinyinMatchScore(song, q) {
  var keys = pinyinSongKeys(song);
  if (!keys || !keys.hasHanzi) return 0;
  var score = 0;
  if (keys.title === q) score = 100;
  else if (keys.title.indexOf(q) === 0) score = 80;
  else if (keys.title.indexOf(q) > 0) score = 50;
  var combined = keys.title + keys.artist;
  if (!score && keys.artist && combined.indexOf(q) >= 0 && q.length >= 3) score = 40;
  else if (!score && keys.artist && keys.artist.indexOf(q) === 0) score = 45;
  return score;
}
function pinyinSongPool(mode) {
  var pools = [];
  if (typeof playQueue !== 'undefined' && Array.isArray(playQueue)) pools.push(playQueue);
  if (typeof persistentLocalLibraryTracks !== 'undefined' && Array.isArray(persistentLocalLibraryTracks)) pools.push(persistentLocalLibraryTracks);
  if (typeof playlistPanelDetailState !== 'undefined' && playlistPanelDetailState && Array.isArray(playlistPanelDetailState.tracks)) pools.push(playlistPanelDetailState.tracks);
  var specific = typeof searchModeProvider === 'function' ? searchModeProvider(mode) : '';
  var seen = Object.create(null);
  var out = [];
  pools.forEach(function (list) {
    for (var i = 0; i < list.length && out.length < PINYIN_POOL_MAX; i++) {
      var song = list[i];
      if (!song || !(song.name || song.title)) continue;
      if (specific && typeof songProviderKey === 'function' && songProviderKey(song) !== specific) continue;
      var key = (typeof songProviderKey === 'function' ? songProviderKey(song) : '') + ':' + (song.mid || song.id || (song.name + '|' + song.artist));
      if (seen[key]) continue;
      seen[key] = true;
      out.push(song);
    }
  });
  return out;
}
function localPinyinSongMatches(q, mode) {
  q = String(q || '').trim().toLowerCase();
  if (!searchQueryIsPinyinInitials(q)) return [];
  var scored = [];
  pinyinSongPool(mode).forEach(function (song) {
    var score = pinyinMatchScore(song, q);
    if (score) scored.push({ song: song, score: score });
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, PINYIN_RESULT_MAX).map(function (entry) { return entry.song; });
}
// Puts pinyin hits after the rows that already match the typed letters literally
// (or at the top when nothing does), without reordering the platform results.
function insertPinyinSongMatches(songs, matches, q) {
  if (!matches || !matches.length) return songs;
  var seen = Object.create(null), canonical = Object.create(null);
  var copy = songs.slice();
  var ranks = typeof searchProviderPreferenceRanks === 'function' ? searchProviderPreferenceRanks() : null;
  function identity(song) {
    return (typeof songProviderKey === 'function' ? songProviderKey(song) : '') + ':' + (song.mid || song.id || (song.name + '|' + song.artist));
  }
  function recording(song) {
    return typeof searchCanonicalSongKey === 'function' ? searchCanonicalSongKey(song) : '';
  }
  copy.forEach(function (song, index) {
    seen[identity(song)] = true;
    var key = recording(song);
    if (key) canonical[key] = index;
  });
  matches.forEach(function (song) {
    var id = identity(song);
    if (seen[id]) return;
    seen[id] = true;
    var key = recording(song), index = key ? canonical[key] : undefined;
    if (index !== undefined) {
      // Reuse the online search rule: one recording, preferred provider's copy.
      if (ranks && typeof searchProviderPreferenceRank === 'function'
          && searchProviderPreferenceRank(ranks, song) < searchProviderPreferenceRank(ranks, copy[index])) copy[index] = song;
      return;
    }
    if (key) canonical[key] = copy.length;
    copy.push(song);
  });
  var extra = copy.splice(songs.length);
  if (!extra.length) return copy;
  var nq = String(q || '').toLowerCase();
  var lastLiteral = -1;
  for (var i = 0; i < Math.min(songs.length, 18); i++) {
    var raw = String((songs[i].name || '') + ' ' + (songs[i].artist || '')).toLowerCase();
    if (raw.indexOf(nq) >= 0) lastLiteral = i;
  }
  Array.prototype.splice.apply(copy, [lastLiteral + 1, 0].concat(extra));
  return copy;
}
