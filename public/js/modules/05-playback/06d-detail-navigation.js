// One detail surface, with bounded in-memory history. Never changes playback.
var trackDetailNavigation = { current: null, history: [], links: [], linkKeys: new Map(), origin: null, request: 0 };
var trackDetailClosing = false;

function detailNavigationLink(text, type, song) {
  text = String(text || '');
  if (!song || !text || (type === 'album' && !albumDetailUrlForSong(song))) return escHtml(text);
  var key = detailNavigationKey(type, song) + ':' + (song.mid || song.id || '') + ':' + text;
  var index = trackDetailNavigation.linkKeys.get(key);
  if (index == null) {
    index = trackDetailNavigation.links.push({ type: type, song: cloneSong(song) }) - 1;
    trackDetailNavigation.linkKeys.set(key, index);
  }
  return '<button type="button" class="detail-entity-link" data-detail-link="' + index + '">' + escHtml(text) + '</button>';
}
function detailArtistLinks(song) {
  var artists = song && song.artists || [];
  if (!artists.length) return detailNavigationLink(song && song.artist || '未知歌手', 'artist', song && song.artist ? song : null);
  return artists.map(function (artist) {
    var name = artist.name || artist.title || song.artist || '未知歌手';
    var selected = Object.assign({}, song, { artist: name, artists: [artist], artistId: '', artistMid: '', singerMid: '' });
    if (songProviderKey(song) === 'qq') selected.artistMid = artist.mid || '';
    else selected.artistId = artist.id || '';
    return detailNavigationLink(name, 'artist', selected);
  }).join(' / ');
}
function detailLinkedRow(label, value, type, song) {
  return '<div class="detail-k">' + escHtml(label) + '</div><div class="detail-v">' +
    (type === 'artist' ? detailArtistLinks(song) : detailNavigationLink(value, type, song)) + '</div>';
}
function detailSongRowLinks(song, listType) {
  var album = listType === 'artist' ? detailNavigationLink(song.album || '未知专辑', 'album', song) : detailArtistLinks(song);
  return '<div class="artist-song-main"><div class="artist-song-name">' + detailNavigationLink(song.name || '', 'song', song) + '</div>' +
    '<div class="artist-song-meta">' + album + (song.duration ? ' · ' + escHtml(songDurationLabel(song)) : '') + '</div></div>';
}
function detailNavigationKey(type, song) {
  var id = type === 'artist' ? (currentArtistId(song) || currentQQArtistMid(song) || song.artist) :
    (type === 'album' ? currentAlbumKey(song) : song.mid || song.id || song.localKey || song.name);
  return songProviderKey(song) + ':' + type + ':' + id;
}
function copyDetailCommentsForHistory(state) {
  if (!state) return null;
  var copy = Object.assign({}, state, { loading: false, readControllers: new Set(), threads: Object.create(null) });
  Object.keys(state.threads || {}).forEach(function (key) {
    copy.threads[key] = Object.assign({}, state.threads[key], { loading: false });
  });
  return copy;
}
function captureTrackDetailPage() {
  var body = document.getElementById('track-detail-body');
  var current = trackDetailNavigation.current;
  if (!body || !current) return null;
  if (typeof resetDetailReplyComposer === 'function') resetDetailReplyComposer();
  var snapshot = Object.assign({}, current, {
    heading: document.getElementById('track-detail-heading').textContent,
    auth: accountActionAuthSnapshot(songProviderKey(current.song)),
    scrollTop: body.scrollTop, focus: document.activeElement,
    // Keep real nodes, including input values and delegated comment controls.
    nodes: Array.from(body.childNodes), links: trackDetailNavigation.links, linkKeys: trackDetailNavigation.linkKeys,
    initialPending: !!body.querySelector('.detail-loading'),
    artistSongs: detailArtistSongs, albumSongs: detailAlbumSongs, albumContext: detailAlbumContext,
    gapless: detailAlbumGaplessEnabled, gaplessTouched: detailAlbumGaplessUserTouched,
    artistState: detailArtistSongState ? Object.assign({}, detailArtistSongState, { loading: false }) : null,
    albums: detailArtistAlbums, albumQuery: detailArtistAlbumQuery,
    albumState: detailArtistAlbumState ? Object.assign({}, detailArtistAlbumState, { loading: false }) : null,
    comments: copyDetailCommentsForHistory(detailCommentsState), commentSort: detailCommentSort,
  });
  return snapshot;
}
function setDetailOriginSuspended(suspended) {
  var origin = trackDetailNavigation.origin;
  if (!origin) return;
  var panel = document.getElementById('playlist-panel');
  if (panel) {
    panel.classList.toggle('detail-origin-suspended', suspended);
    panel.inert = suspended || origin.inert;
  }
  playlistPanelPinned = suspended ? true : origin.pinned;
  if (suspended && typeof peekTimers !== 'undefined' && peekTimers.pl) { clearTimeout(peekTimers.pl); peekTimers.pl = null; }
  if (!suspended && panel) {
    panel.scrollTop = origin.scrollTop;
    if (typeof panel.__syncSmoothWheelTarget === 'function') panel.__syncSmoothWheelTarget(origin.scrollTop);
  }
}
function beginTrackDetailNavigation(type, song, options) {
  options = options || {};
  trackDetailNavigation.request++;
  if (options.child && trackDetailNavigation.current) {
    var previous = captureTrackDetailPage();
    if (previous) trackDetailNavigation.history.push(previous);
    if (trackDetailNavigation.history.length > 20) trackDetailNavigation.history.shift();
  } else if (!options.restore) {
    setDetailOriginSuspended(false);
    trackDetailNavigation.history = [];
    trackDetailNavigation.origin = null;
    if (options.origin) {
      var panel = document.getElementById('playlist-panel');
      trackDetailNavigation.origin = { scrollTop: panel ? panel.scrollTop : 0, inert: !!(panel && panel.inert),
        pinned: playlistPanelPinned };
    }
  }
  trackDetailNavigation.current = { type: type, song: cloneSong(song), key: detailNavigationKey(type, song) };
  trackDetailNavigation.links = [];
  trackDetailNavigation.linkKeys = new Map();
  setDetailOriginSuspended(true);
  updateTrackDetailBackButton();
}
function updateTrackDetailBackButton() {
  var back = document.getElementById('track-detail-back');
  if (!back) return;
  back.hidden = !trackDetailNavigation.history.length && !trackDetailNavigation.origin;
  back.querySelector('span').textContent = trackDetailNavigation.history.length ? '返回' : '返回歌单';
}
async function navigateTrackDetail(type, song, options) {
  if (!song) return;
  if (song.providerRemoved || songProviderKey(song) === 'spotify') { showToast('Spotify 支持已移除，历史记录已保留'); return; }
  if (type === 'album' && !albumDetailUrlForSong(song)) { showToast(albumDetailMissingText(song)); return; }
  var request = ++trackDetailNavigation.request;
  var seq = trackDetailSeq;
  if (type === 'artist' && !currentArtistId(song) && !currentQQArtistMid(song)) {
    if (!song.artist || song.artist === '未知歌手') { showToast('当前歌曲缺少歌手主页信息'); return; }
    showToast('正在查找歌手主页…');
    try {
      var found = await resolveArtistSongForDetail(song, song.artist);
      if (request !== trackDetailNavigation.request || seq !== trackDetailSeq) return;
      if (!found) { showToast('未找到该歌手的主页'); return; }
      song = found;
    } catch (_) {
      if (request === trackDetailNavigation.request && seq === trackDetailSeq) showToast('歌手主页查找失败，请重试');
      return;
    }
  }
  var current = trackDetailNavigation.current;
  if (current && current.key === detailNavigationKey(type, song)) return;
  openTrackDetailModal(type, song, Object.assign({ child: !!current }, options));
}
function backTrackDetail() {
  trackDetailNavigation.request++;
  var page = trackDetailNavigation.history.pop();
  if (!page) { if (trackDetailNavigation.origin) closeTrackDetailModal(); return; }
  if (page.initialPending || !accountActionAuthCurrent(page.auth)) {
    openTrackDetailModal(page.type, page.song, { restore: true });
    return;
  }
  cancelDetailCommentReads(detailCommentsState);
  if (typeof resetDetailReplyComposer === 'function') resetDetailReplyComposer();
  var seq = ++trackDetailSeq;
  trackDetailNavigation.current = { type: page.type, song: page.song, key: page.key };
  trackDetailNavigation.links = page.links;
  trackDetailNavigation.linkKeys = page.linkKeys;
  detailCommentSong = page.song;
  detailCommentSort = page.commentSort;
  detailCommentSubmitBusy = false;
  detailArtistSongs = page.artistSongs;
  detailAlbumSongs = page.albumSongs;
  detailAlbumContext = page.albumContext;
  detailAlbumGaplessEnabled = page.gapless;
  detailAlbumGaplessUserTouched = page.gaplessTouched;
  detailArtistSongState = page.artistState;
  detailArtistAlbums = page.albums;
  detailArtistAlbumQuery = page.albumQuery;
  detailArtistAlbumState = page.albumState;
  detailCommentsState = page.comments;
  [detailArtistSongState, detailArtistAlbumState, detailCommentsState].forEach(function (state) { if (state) state.seq = seq; });
  var body = document.getElementById('track-detail-body');
  body.replaceChildren.apply(body, page.nodes);
  document.getElementById('track-detail-heading').textContent = page.heading;
  if (detailArtistSongState) renderArtistSongPage(detailArtistSongState);
  if (detailArtistAlbumState) renderArtistAlbumSection();
  if (detailCommentsState) {
    var comments = document.getElementById('song-comments');
    updateDetailCommentsFooter(detailCommentsState, comments);
    Object.keys(detailCommentsState.threads).forEach(function (key) {
      var thread = detailCommentsState.threads[key];
      updateDetailReplyControls(thread, detailReplyRegion(thread));
    });
    if (!detailCommentsState.count && detailCommentsState.hasMore) loadMoreDetailComments();
  }
  if (page.type === 'artist' && (!detailArtistAlbumState || !detailArtistAlbumState.preview) && (currentArtistId(page.song) || currentQQArtistMid(page.song))) {
    loadArtistAlbumSection(songProviderKey(page.song), currentArtistId(page.song) || currentQQArtistMid(page.song), seq);
  }
  if (page.type === 'album') { syncAlbumCollectionState(page.song); syncAlbumGaplessButton(); }
  bindTrackDetailScrollers();
  body.scrollTop = page.scrollTop;
  if (typeof body.__syncSmoothWheelTarget === 'function') body.__syncSmoothWheelTarget(page.scrollTop);
  updateTrackDetailBackButton();
  if (page.focus && page.focus.isConnected) page.focus.focus({ preventScroll: true });
  else {
    var back = document.getElementById('track-detail-back');
    var focusTarget = back.hidden ? document.getElementById('track-detail-modal') : back;
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }
}
function clearTrackDetailNavigation() {
  trackDetailNavigation.request++;
  setDetailOriginSuspended(false);
  trackDetailNavigation.current = null;
  trackDetailNavigation.history = [];
  trackDetailNavigation.links = [];
  trackDetailNavigation.linkKeys = new Map();
  trackDetailNavigation.origin = null;
}
function openPlaylistTrackDetail(index, type) {
  var song = playlistPanelDetailState.tracks[index];
  if (song) return navigateTrackDetail(type, song, { origin: true, child: false });
}
document.getElementById('track-detail-body').addEventListener('click', function (event) {
  var link = event.target.closest('[data-detail-link]');
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  var target = trackDetailNavigation.links[Number(link.getAttribute('data-detail-link'))];
  if (target) navigateTrackDetail(target.type, target.song);
}, true);
