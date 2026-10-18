var detailArtistSongState = null;

function renderArtistSongPage(state) {
  var target = document.getElementById('artist-hot-songs');
  if (!target || state !== detailArtistSongState || state.seq !== trackDetailSeq) return;
  var body = document.getElementById('track-detail-body');
  var top = body ? body.scrollTop : 0;
  target.innerHTML = renderArtistSongList(state.songs) +
    '<div class="detail-section-actions"><span class="artist-albums-count" role="status">已显示 ' + state.songs.length + ' 首</span>' +
    (state.hasMore || state.error ? '<button id="artist-songs-more" class="artist-albums-more" type="button" onclick="loadMoreArtistSongs()"' +
      (state.loading ? ' disabled' : '') + '>' + (state.loading ? '加载中…' : (state.error ? '加载失败，点击重试' : '加载更多 ›')) + '</button>' : '') + '</div>';
  if (body) body.scrollTop = top;
  bindTrackDetailScrollers();
}

function acceptArtistSongPage(state, result) {
  var page = Array.isArray(result.songs) ? result.songs : [];
  var seen = new Set(state.songs.map(function (song) { return String(song.mid || song.id); }));
  var added = page.filter(function (song) {
    var key = String(song && (song.mid || song.id) || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  state.songs = state.songs.concat(added.map(cloneSong));
  var next = Number(result.nextOffset);
  state.offset = isFinite(next) && next > state.offset ? next : state.offset + page.length;
  // Stop providers that repeat a page, even if their advertised total says more.
  state.hasMore = added.length > 0 && (typeof result.hasMore === 'boolean' ? result.hasMore : page.length >= 36);
}

function startArtistSongPaging(url, seq, result) {
  var state = { url: url, seq: seq, songs: [], offset: 0, hasMore: true, loading: false, error: false };
  detailArtistSongState = state;
  acceptArtistSongPage(state, result);
  renderArtistSongPage(state);
  var body = document.getElementById('track-detail-body');
  if (body && !body.__artistSongPagingBound) {
    body.__artistSongPagingBound = true;
    body.addEventListener('scroll', function () {
      var current = detailArtistSongState;
      if (!current || current.seq !== trackDetailSeq || current.error) return;
      if (body.scrollHeight - body.scrollTop - body.clientHeight < 240) loadMoreArtistSongs();
    }, { passive: true });
  }
}

async function loadMoreArtistSongs() {
  var state = detailArtistSongState;
  if (!state || state.seq !== trackDetailSeq || state.loading || !state.hasMore) return;
  state.loading = true;
  state.error = false;
  renderArtistSongPage(state);
  try {
    var result = await apiJson(state.url + '&offset=' + state.offset, { timeoutMs: 15000 });
    if (state !== detailArtistSongState || state.seq !== trackDetailSeq) return;
    if (!result || result.error) throw new Error('ARTIST_SONGS_FAILED');
    acceptArtistSongPage(state, result);
  } catch (e) {
    if (state !== detailArtistSongState || state.seq !== trackDetailSeq) return;
    state.error = true;
  } finally {
    state.loading = false;
    renderArtistSongPage(state);
  }
}
