// The visible queue follows playback order. Logical order belongs to each live
// entry, so removing a song cannot revive it from an old shuffle backup.
var queueLogicalOrderState = { queue: null, next: 0 };
function syncQueueLogicalOrder(restored) {
  var changed = queueLogicalOrderState.queue !== playQueue;
  if (changed) {
    queueLogicalOrderState.queue = playQueue;
    queueLogicalOrderState.next = 0;
  }
  playQueue.forEach(function (song) {
    if ((!changed || restored) && Number.isFinite(song._queueOrder)) {
      queueLogicalOrderState.next = Math.max(queueLogicalOrderState.next, song._queueOrder + 1);
    } else {
      song._queueOrder = queueLogicalOrderState.next++;
    }
  });
}
function queueLogicalEntries() {
  syncQueueLogicalOrder();
  return playQueue.slice().sort(function (a, b) { return a._queueOrder - b._queueOrder; });
}
function moveQueueLogicalEntry(item, anchor, after, atStart) {
  var entries = queueLogicalEntries().filter(function (song) { return song !== item; });
  var index = anchor ? entries.indexOf(anchor) : -1;
  entries.splice(index < 0 ? (atStart ? 0 : entries.length) : index + (after ? 1 : 0), 0, item);
  entries.forEach(function (song, i) { song._queueOrder = i; });
  queueLogicalOrderState.next = entries.length;
}
function restoreQueueLogicalOrder() {
  var current = playQueue[currentIdx];
  var entries = queueLogicalEntries();
  playQueue.splice.apply(playQueue, [0, playQueue.length].concat(entries));
  currentIdx = current ? playQueue.indexOf(current) : -1;
  safeRenderQueuePanel('restore-queue-order', { animate: false, scrollCurrent: false, deferWhenHidden: false });
  safeShelfRebuild('restore-queue-order', true);
}
function queueSong(song, opts) {
  opts = opts || {};
  if (!song) return -1;
  syncQueueLogicalOrder();
  var cloned = cloneSong(song);
  delete cloned._queueOrder;
  var insertAt = playQueue.length;
  if (opts.position === 'next') {
    var key = queueItemKey(cloned);
    var existing = -1;
    if (key) {
      for (var i = 0; i < playQueue.length; i++) {
        if (queueItemKey(playQueue[i]) === key) { existing = i; break; }
      }
    }
    if (existing === currentIdx) return currentIdx;
    if (existing >= 0) {
      cloned = playQueue.splice(existing, 1)[0];
      if (currentIdx >= 0 && existing < currentIdx) currentIdx -= 1;
    }
    var hasCurrent = currentIdx >= 0 && currentIdx < playQueue.length;
    insertAt = hasCurrent ? Math.min(playQueue.length, currentIdx + 1) : playQueue.length;
    playQueue.splice(insertAt, 0, cloned);
    moveQueueLogicalEntry(cloned, hasCurrent ? playQueue[currentIdx] : null, true);
  } else {
    playQueue.push(cloned);
    insertAt = playQueue.length - 1;
    syncQueueLogicalOrder();
  }
  safeRenderQueuePanel('queue-song');
  safeShelfRebuild('queue-song');
  if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'queue-song');
  return insertAt;
}
function queueSongNext(song) {
  return queueSong(song, { position: 'next' });
}
function queueSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  queueSongNext(song);
  showToast('已设为下一首: ' + song.name);
}
function queueDetailSongNext(song) {
  if (!song || song.type === 'podcast-radio') return;
  queueSongNext(song);
  showToast('已设为下一首: ' + (song.name || ''));
}
function queueIndexNext(i) {
  i = Number(i);
  if (!isFinite(i) || i < 0 || i >= playQueue.length) return;
  var song = playQueue[i];
  queueSongNext(song);
  showToast('已设为下一首: ' + (song && song.name ? song.name : ''));
}
function openQueueArtist(i) {
  var song = playQueue && playQueue[i];
  if (song) openArtistDetailForSong(song);
}
function moveQueueIndexToTop(idx) {
  idx = Number(idx);
  if (!isFinite(idx) || idx < 0 || idx >= playQueue.length) return -1;
  if (idx === 0) return 0;
  syncQueueLogicalOrder();
  var item = playQueue.splice(idx, 1)[0];
  playQueue.unshift(item);
  moveQueueLogicalEntry(item, null, false, true);
  if (currentIdx === idx) currentIdx = 0;
  else if (currentIdx >= 0 && currentIdx < idx) currentIdx += 1;
  return 0;
}
function moveQueueIndex(fromIdx, toIdx, opts) {
  opts = opts || {};
  fromIdx = Math.round(Number(fromIdx));
  toIdx = Math.round(Number(toIdx));
  if (!playQueue.length) return false;
  if (!isFinite(fromIdx) || !isFinite(toIdx)) return false;
  if (fromIdx < 0 || fromIdx >= playQueue.length) return false;
  toIdx = Math.max(0, Math.min(playQueue.length - 1, toIdx));
  if (fromIdx === toIdx) return false;
  syncQueueLogicalOrder();
  var currentSong = currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  var item = playQueue.splice(fromIdx, 1)[0];
  playQueue.splice(toIdx, 0, item);
  if (toIdx === 0) moveQueueLogicalEntry(item, null, false, true);
  else if (toIdx + 1 < playQueue.length) moveQueueLogicalEntry(item, playQueue[toIdx + 1], false);
  else moveQueueLogicalEntry(item, null, false);
  if (currentSong) {
    var nextCurrentIdx = playQueue.indexOf(currentSong);
    currentIdx = nextCurrentIdx >= 0 ? nextCurrentIdx : Math.min(currentIdx, playQueue.length - 1);
  } else {
    currentIdx = -1;
  }
  if (opts.renderPanel !== false) safeRenderQueuePanel('queue-reorder', { animate: false, scrollCurrent: false, deferWhenHidden: false });
  if (opts.rebuildShelf !== false) safeShelfRebuild('queue-reorder', true);
  if (opts.persistSnapshot !== false && typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'queue-reorder');
  return true;
}
function playSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  if (!playQueue.length) { playQueue.unshift(cloneSong(song)); currentIdx = 0; }
  else {
    var matchIdx = -1;
    var targetKey = queueItemKey(song);
    for (var j = 0; j < playQueue.length; j++) if (queueItemKey(playQueue[j]) === targetKey) { matchIdx = j; break; }
    if (matchIdx >= 0) currentIdx = moveQueueIndexToTop(matchIdx);
    else { playQueue.unshift(cloneSong(song)); currentIdx = 0; }
  }
  $results.classList.remove('show');
  $input.value = ''; $input.blur();
  playQueueAt(currentIdx);
}
