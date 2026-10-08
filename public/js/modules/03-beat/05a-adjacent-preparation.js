// One shared allowance for speculative covers, nearby playlist art and avatars.
var backgroundImageBudget = { active: 0, wakeTimer: 0 };
function reserveBackgroundImageSlot() {
  if (backgroundImageBudget.active >= 2) return null;
  backgroundImageBudget.active++;
  var released = false;
  return function () {
    if (released) return; released = true; backgroundImageBudget.active--;
    if (!backgroundImageBudget.wakeTimer) backgroundImageBudget.wakeTimer = setTimeout(function () {
      backgroundImageBudget.wakeTimer = 0;
      window.dispatchEvent(new Event('mineradio-background-image-slot'));
    }, 0);
  };
}
// Only adjacent tracks are speculative. Owned CPU/GPU resources share a byte cap.
var adjacentPreparationDirection = 1;
var adjacentPreparation = { token: -1, timer: 0, generation: 0, entries: new Map(), bytes: 0, building: null, pendingBuilds: [] };
function adjacentPreparationBudget() {
  return (typeof runtimeHardwareProfile !== 'undefined' && runtimeHardwareProfile && runtimeHardwareProfile.lowSpec ? 16 : 32) * 1024 * 1024;
}
function adjacentPreparationAllowed() {
  return !!(audio && !audio.paused && playing && navigator.onLine !== false
    && !(typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode())
    && !(typeof isProgressDragPreviewActive === 'function' && isProgressDragPreviewActive())
    && !(typeof isRenderInteractionActive === 'function' && isRenderInteractionActive())
    && !(typeof lyricFxEditActive === 'function' && lyricFxEditActive())
    && !(typeof adaptiveLoadPressureLevel === 'function' && adaptiveLoadPressureLevel() >= 2));
}
function adjacentTrackCandidates(fromIndex) {
  if (!Array.isArray(playQueue) || playQueue.length < 2) return [];
  var from = Number.isFinite(Number(fromIndex)) ? Number(fromIndex) : currentIdx;
  var directions = adjacentPreparationDirection < 0 ? [-1, 1] : [1, -1];
  var seen = new Set(), result = [];
  directions.forEach(function (direction) {
    var index = (from + direction + playQueue.length) % playQueue.length;
    // A growing queue tail has no known successor yet; do not warm a wrong wrap.
    if (direction > 0 && index === 0 && typeof queueHydrationState !== 'undefined'
      && queueHydrationState && queueHydrationState.queueRef === playQueue && queueHydrationState.active) return;
    var song = playQueue[index], key = persistentLyricCacheKey(song);
    if (index === currentIdx || seen.has(key)) return;
    seen.add(key); result.push({ song: song, index: index, key: key });
  });
  return result;
}
function releaseAdjacentEntry(key) {
  var rec = adjacentPreparation.entries.get(key);
  if (!rec) return;
  adjacentPreparation.entries.delete(key); adjacentPreparation.bytes -= rec.bytes;
  if (rec.dispose) rec.dispose(rec.value);
}
function storeAdjacentEntry(key, value, bytes, dispose, songKey) {
  bytes = Math.max(0, Number(bytes) || 0);
  if (bytes > adjacentPreparationBudget()) { if (dispose) dispose(value); return false; }
  releaseAdjacentEntry(key);
  while (adjacentPreparation.bytes + bytes > adjacentPreparationBudget() && adjacentPreparation.entries.size) {
    var keyToRelease = Array.from(adjacentPreparation.entries.keys()).find(function (entryKey) {
      return adjacentPreparation.entries.get(entryKey).songKey !== songKey;
    }) || adjacentPreparation.entries.keys().next().value;
    var preferred = adjacentTrackCandidates()[0];
    if (preferred && songKey !== preferred.key && adjacentPreparation.entries.get(keyToRelease).songKey === preferred.key) {
      if (dispose) dispose(value); return false;
    }
    releaseAdjacentEntry(keyToRelease);
  }
  adjacentPreparation.entries.set(key, { value: value, bytes: bytes, dispose: dispose, songKey: songKey, at: performance.now() });
  adjacentPreparation.bytes += bytes;
  return true;
}
function takeAdjacentEntry(key) {
  var rec = adjacentPreparation.entries.get(key);
  if (!rec) return null;
  adjacentPreparation.entries.delete(key); adjacentPreparation.bytes -= rec.bytes;
  return rec.value;
}
function adjacentStyleKey() {
  return stageLyricPrewarmStyleKey({ omitLivePalette: true }) + '|clarity=' + lyricTextureClarityScale()
    + '|font=' + lyricFontCss(128, 700) + '|edge=' + lyricEdgeFadeValue();
}
function adjacentQualityKey(mask, tier) {
  var metrics = lyricQualityTargetMetrics(mask, tier);
  if (!metrics) return '';
  return 'quality|' + adjacentStyleKey() + '|' + JSON.stringify([mask.lines, (mask.entries || []).map(function (entry) { return [entry.text, entry.scale || 1, entry.alpha == null ? 1 : entry.alpha, lyricEntryWeight(entry), lyricEntryLineOffset(entry)]; }),
    metrics.width, metrics.height, mask.logicalFontSize, mask.logicalLineHeight, mask.logicalLineY0,
    mask.fitScaleX, mask.activeLine, mask.contextLayer, mask.stoneSeed]);
}
function takeAdjacentQualityTexture(mask, tier) {
  return takeAdjacentEntry(adjacentQualityKey(mask, tier));
}
function takeAdjacentTitleMesh(payload) {
  var song = typeof currentLyricSong === 'function' ? currentLyricSong() : null;
  var mesh = takeAdjacentEntry('title|' + persistentLyricCacheKey(song) + '|' + adjacentStyleKey());
  if (mesh && normalizeStageLyricPayload(payload).text !== mesh.userData.stageLyricText) { disposeLyricMesh(mesh); return null; }
  if (mesh && typeof applyLyricPaletteToMesh === 'function') applyLyricPaletteToMesh(mesh);
  return mesh;
}
function adjacentMeshBytes(mesh) {
  var textures = new Set(), arrays = new Set(), bytes = 0;
  mesh.traverse(function (node) {
    var mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.filter(Boolean).forEach(function (mat) {
      var maps = [mat.map];
      Object.keys(mat.uniforms || {}).forEach(function (key) { maps.push(mat.uniforms[key].value); });
      maps.forEach(function (texture) {
        if (!texture || !texture.isTexture || textures.has(texture) || !texture.userData || !texture.userData.__mineradioLyricOwned) return;
        textures.add(texture); var img = texture.image;
        bytes += img ? (img.width || 0) * (img.height || 0) * 9 : 0;
      });
    });
    Object.values(node.geometry && node.geometry.attributes || {}).forEach(function (attr) {
      if (attr.array && !arrays.has(attr.array)) { arrays.add(attr.array); bytes += attr.array.byteLength; }
    });
  });
  return bytes;
}
function cancelAdjacentBuild() {
  if (typeof lyricWorkScheduler !== 'undefined') lyricWorkScheduler.cancel('adjacent-prepare');
  var job = adjacentPreparation.building;
  adjacentPreparation.building = null;
  if (job && job.state) cancelCooperativeLyricMeshBuild(job.state);
}
function prepareAdjacentLyrics(candidate, response, generation) {
  if (adjacentPreparation.building) {
    if (adjacentPreparation.pendingBuilds.length < 1) adjacentPreparation.pendingBuilds.push([candidate, response, generation]);
    return;
  }
  var state = parseLyricResponseToOriginalState(candidate.song, mergeInlineLyricResponseForSong(candidate.song, response));
  if (!state) return;
  var style = adjacentStyleKey(), title = lyricFallbackTextForSong(candidate.song);
  var titleKey = 'title|' + candidate.key + '|' + style;
  var steps = [];
  if (!adjacentPreparation.entries.has(titleKey)) steps.push({ title: title, key: titleKey });
  (state.lines || []).filter(function (line) { return line && !line.fallback && !isNoLyricText(line.text); }).slice(0, 3).forEach(function (line) {
    steps.push({ text: line.text });
    if (line.translation && normalizeLyricTranslationMode(fx.lyricTranslationMode) !== 'off') steps.push({ text: line.translation, translation: true });
  });
  var job = { steps: steps, state: null, candidate: candidate, style: style, generation: generation };
  adjacentPreparation.building = job;
  function step() {
    if (adjacentPreparation.building !== job) return;
    if (generation !== adjacentPreparation.generation || style !== adjacentStyleKey()) { cancelAdjacentBuild(); return; }
    if (!adjacentPreparationAllowed()) { lyricWorkScheduler.schedule('adjacent-prepare', step, { delay: 350, priority: 80 }); return; }
    var item = job.steps[0];
    if (!item) {
      adjacentPreparation.building = null;
      var next = adjacentPreparation.pendingBuilds.shift();
      if (next) prepareAdjacentLyrics(next[0], next[1], next[2]);
      return;
    }
    if (item.title) {
      if (!job.state) job.state = beginCooperativeLyricMeshBuild(item.title);
      if (stepCooperativeLyricMeshBuild(job.state, 1, lyricWorkScheduler.sliceMs)) {
        var mesh = finishCooperativeLyricMeshBuild(job.state); job.state = null;
        if (mesh) { mesh.userData.stageLyricText = item.title; primeLyricMeshOpacity(mesh, 0); mesh.visible = false;
          storeAdjacentEntry(item.key, mesh, adjacentMeshBytes(mesh), disposeLyricMesh, candidate.key); }
        job.steps.shift();
      }
    } else {
      // Prepare the exact active row raster, including the selected clarity tier.
      var entry = { text: item.text, role: item.translation ? 'translation' : 'current', alpha: 1, scale: 1, weight: item.translation ? 650 : lyricFontWeightValue(), translationLine: !!item.translation };
      var parent = stableStageLyricRowMaskLayout();
      var mask = makeLyricLineMask(entry, parent, true), tier = lyricTextureClarityScale();
      var key = adjacentQualityKey(mask, tier), metrics = lyricQualityTargetMetrics(mask, tier);
      if (metrics && metrics.bytes <= adjacentPreparationBudget() - adjacentPreparation.bytes && !adjacentPreparation.entries.has(key)) {
        var built = makeLyricQualityTexture(mask, tier);
        if (built) storeAdjacentEntry(key, built, built.bytes, function (value) { lyricQualityDisposeTexture(value.texture); }, candidate.key);
      }
      disposeCooperativeLyricBuildMask(mask); job.steps.shift();
    }
    lyricWorkScheduler.schedule('adjacent-prepare', step, { delay: 24, priority: 80 });
  }
  lyricWorkScheduler.schedule('adjacent-prepare', step, { delay: 80, priority: 80 });
}
function scheduleAdjacentTrackPreparation(token) {
  clearTimeout(adjacentPreparation.timer); cancelAdjacentBuild(); adjacentPreparation.pendingBuilds = [];
  if (typeof cancelUpcomingCoverPrefetch === 'function') cancelUpcomingCoverPrefetch();
  if (typeof lyricQueuePrefetchController !== 'undefined' && lyricQueuePrefetchController) lyricQueuePrefetchController.abort();
  if (typeof lyricQueuePrefetchToken !== 'undefined') lyricQueuePrefetchToken++;
  adjacentPreparation.token = token; adjacentPreparation.generation++;
  var candidates = adjacentTrackCandidates(), currentKey = persistentLyricCacheKey(playQueue[currentIdx]);
  var allowed = new Set(candidates.map(function (c) { return c.key; }).concat(currentKey));
  adjacentPreparation.entries.forEach(function (rec, key) {
    if (!allowed.has(rec.songKey) || performance.now() - rec.at > 5 * 60 * 1000) releaseAdjacentEntry(key);
  });
  function run() {
    if (token !== trackSwitchToken) return;
    if (!adjacentPreparationAllowed()) { adjacentPreparation.timer = setTimeout(run, 400); return; }
    adjacentPreparation.timer = 0;
    scheduleUpcomingCoverPrefetch(token);
    scheduleQueueLyricPrefetch(currentIdx, 0);
  }
  adjacentPreparation.timer = setTimeout(run, 400);
}
window.addEventListener('pagehide', function () {
  clearTimeout(adjacentPreparation.timer); cancelAdjacentBuild();
  if (typeof lyricQueuePrefetchController !== 'undefined' && lyricQueuePrefetchController) lyricQueuePrefetchController.abort();
  if (typeof lyricQueuePrefetchTimer !== 'undefined') clearTimeout(lyricQueuePrefetchTimer);
  if (typeof cancelUpcomingCoverPrefetch === 'function') cancelUpcomingCoverPrefetch();
  Array.from(adjacentPreparation.entries.keys()).forEach(releaseAdjacentEntry);
});
