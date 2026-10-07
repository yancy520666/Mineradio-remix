// Gesture state lives in the FX panel; these helpers own only lyric resources.
function lyricFxEditActive() {
  return typeof isLyricFxEditPreviewActive === 'function' && isLyricFxEditPreviewActive();
}
function suspendLyricFxEditWork() {
  if (typeof lyricWorkScheduler !== 'undefined') {
    lyricWorkScheduler.cancel('prewarm-start');
    lyricWorkScheduler.cancel('quality-build');
  }
  var currentData = stageLyrics.current && stageLyrics.current.userData.lyric;
  if (currentData && currentData.fxEditTextOnly) fxSliderEdit.rebuild = true;
  if (stageLyricPrewarm.build && stageLyricPrewarm.build.reason === 'fx-edit-commit') fxSliderEdit.rebuild = true;
  if (lyricRealtimeRefreshTimer) clearTimeout(lyricRealtimeRefreshTimer);
  lyricRealtimeRefreshTimer = null;
  if (stageLyricStyleRefreshTimer) clearTimeout(stageLyricStyleRefreshTimer);
  stageLyricStyleRefreshTimer = 0;
  cancelStageLyricResidentBuild();
  cancelStageLyricPrewarmBuildOnly();
  if (stageLyricPrewarm.timer) clearTimeout(stageLyricPrewarm.timer);
  stageLyricPrewarm.timer = 0;
  stageLyricPrewarm.dueAt = 0;
  clearStageLyricFullTrackWarmup();
  if (lyricQualityState.timer) clearTimeout(lyricQualityState.timer);
  if (lyricQualityState.idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(lyricQualityState.idle);
  lyricQualityState.timer = lyricQualityState.idle = 0;
}
function finishLyricFxEditWork(rebuild) {
  // FX values form the track cache key even when only row transforms changed.
  var currentData = stageLyrics.current && stageLyrics.current.userData.lyric;
  if (!rebuild && currentData && currentData.usesTrack) currentData.trackKey = stageLyricTrackKeyForMode(currentData.displayMode);
  if (rebuild) {
    cancelStageLyricResidentBuild();
    disposeStageLyricPrewarmMesh();
    clearStageLyricSingleLinePrewarmCache();
    if (audio && lyricsLines && lyricsLines.length) {
      var time = getAdjustedLyricPlaybackTime(stageLyricPlaybackSeconds());
      var index = findStageLyricIndexAtTime(time);
      if (index >= 0) {
        var payload = buildStageLyricDisplayPayload(index, { lightweightTrack: true });
        payload.trackTextOnly = true;
        if (payload.mode !== 'single') {
          payload.trackEntries = payload.entries;
          var indexes = payload.entries.filter(function (entry) { return !entry.translationLine; }).map(function (entry) { return entry.lineIndex; });
          payload.trackStart = Math.min.apply(Math, indexes);
          payload.trackEnd = Math.max.apply(Math, indexes);
        }
        startStageLyricCooperativePrewarm(payload, stageLyricPreparedKey(payload), stageLyricPrewarm.token, true, 'fx-edit-commit');
      }
    }
  } else {
    scheduleLyricQualityBuild(0);
    scheduleStageLyricFullTrackWarmup('fx-edit-commit', 180);
  }
}
function lyricFxRasterKey() {
  return [fx.lyricFont, fx.lyricWeight, fx.lyricLetterSpacing, fx.lyricEdgeFade].join('|');
}
function syncLyricFxLiveRows(key) {
  var raster = key === 'lyricWeight' || key === 'lyricLetterSpacing' || key === 'lyricEdgeFade';
  if (raster || key === 'lyricCustomLineCount') fxSliderEdit.rebuild = true;
  [stageLyrics.current].concat(stageLyrics.outgoing || []).forEach(function (mesh) {
    var data = mesh && mesh.userData && mesh.userData.lyric;
    if (!data) return;
    if (data.usesTrack) {
      var first = (data.rowLayers || []).find(function (row) { return row.isPrimary && row.lineIndex > 0; });
      var oldSlot = first ? first.virtualIndex / first.lineIndex : lyricPrimarySlotStepValue();
      var ratio = lyricPrimarySlotStepValue() / Math.max(0.01, oldSlot);
      if (isFinite(data.trackScrollOffset)) data.trackScrollOffset *= ratio;
      data.trackTargetVirtualIndex = lyricPrimaryVirtualIndex(data.trackTargetLineIndex || 0);
      (data.rowLayers || []).forEach(function (row) {
        row.virtualIndex = row.isTranslation ? lyricTranslationVirtualIndex(row.parentIndex) : lyricPrimaryVirtualIndex(row.lineIndex);
      });
    }
    data.lineWorldStep = lyricTrackLineStepWorld();
    data.translationLineStepWorld = lyricTranslationLineStepWorld();
    if (key === 'lyricCustomLineCount') {
      var offsets = lyricDisplayOffsetsForMode(data.displayMode);
      data.trackVisibleRadius = Math.max(1.2, Math.max.apply(Math, offsets.map(Math.abs)) + 0.5);
      if (data.trackPersistent) ensureStageLyricPersistentTrackRows(mesh, data.trackTargetLineIndex || 0, { urgent: true, reason: 'fx-edit-visible-text' });
    }
    if (raster) data.editRasterKey = lyricFxRasterKey();
    var profile = /^lyricGlitch/.test(key) ? lyricMotionProfile() : null;
    (data.rowLayers || []).forEach(function (row) {
      if (row.isTranslation && key === 'lyricTranslationScale') {
        var entry = makeStageLyricTranslationEntry({ translation: row.text, role: row.parentRole || 'current', lineIndex: row.parentIndex }, row.parentIndex === data.trackTargetLineIndex || row.parentRole === 'current');
        if (entry) {
          var baked = row.lineMask.entries[0].scale || 1;
          if (row.editBaseFontScale == null) row.editBaseFontScale = row.fontScale;
          if (row.editBaseScale == null) row.editBaseScale = row.baseScale;
          row.editTranslationScale = entry.scale / baked;
          row.fontScale = row.editBaseFontScale * row.editTranslationScale;
          row.baseScale = row.editBaseScale * row.editTranslationScale;
        }
      }
      if (row.isTranslation && !data.usesTrack) row.baseY = -lyricTranslationVisualGapValue() * data.translationLineStepWorld;
      if (key === 'lyricContextOpacity' || key === 'lyricTranslationOpacity') {
        var index = row.isTranslation ? row.parentIndex : row.lineIndex;
        if (index != null) {
          var context = stageLyricContextEntry(index, Number(data.trackTargetLineIndex) || 0);
          if (context && row.isTranslation) context = makeStageLyricTranslationEntry(context, index === data.trackTargetLineIndex);
          if (context) row.targetAlpha = context.alpha;
        }
      }
      if (profile && row.mat && row.mat.uniforms) {
        ['glitch', 'glitchSlice', 'glitchChroma', 'glitchRate'].forEach(function (name) {
          var uniform = row.mat.uniforms['u' + name[0].toUpperCase() + name.slice(1)];
          if (uniform) uniform.value = profile[name] || 0;
        });
      }
    });
  });
}
function updateLyricFxTextPreview(data) {
  if (!lyricFxEditActive() || !data.editRasterKey || lyricRenderUploadFrameBudget.remaining < 1) return;
  var row = data.rowLayers.find(function (candidate) {
    return candidate.renderWindowActive && candidate.editRasterKey !== data.editRasterKey;
  });
  if (!row) return;
  var old = row.lineMask;
  var entry = Object.assign({}, old.entries[0], { text: row.text, alpha: 1 });
  if (!row.isTranslation) delete entry.weight;
  var input = { mode: 'single', activeLine: 0, entries: [entry] };
  var job = data.editTextJob;
  if (!job || job.key !== data.editRasterKey || job.row !== row) {
    job = data.editTextJob = { row: row, key: data.editRasterKey, input: input,
      layout: beginLyricMaskLayoutBuild(input, { fontSize: old.logicalFontSize || old.fontSize, lineHeight: old.logicalLineHeight || old.lineHeight }) };
  }
  if (!stepLyricMaskLayoutBuild(job.layout, 1)) return;
  if (!consumeLyricRenderUploadFrameBudget()) return;
  var mask = compactLyricLineMaskTexture(makeLyricMask(job.input, { preparedLayout: job.layout.result, plainPreview: true }));
  releaseLyricRowQuality(row, false);
  row.lineMask = mask;
  row.baseLineTexture = mask.texture;
  setLyricRowTextureMap(row, mask.texture);
  if (row.mat.uniforms.uTextMin) row.mat.uniforms.uTextMin.value = mask.textMin;
  if (row.mat.uniforms.uTextMax) row.mat.uniforms.uTextMax.value = mask.textMax;
  row.mesh.geometry.dispose();
  row.lineWorldW = lyricRowLogicalWorldWidth(mask, data.worldW);
  row.lineWorldH = row.lineWorldW * mask.height / mask.width;
  row.mesh.geometry = new THREE.PlaneGeometry(row.lineWorldW, row.lineWorldH, 1, 1);
  row.editRasterKey = job.key;
  row.editTextPreview = true;
  lyricQualityDisposeTexture(old.texture);
  data.editTextJob = null;
}

// Cached logical ink bounds do not depend on texture resolution or frame rate.
function lyricMaskInkBounds(mask) {
  if (!mask || !mask.inkBounds) return null;
  var units = 6.10 / 2048;
  return { top: mask.inkBounds.top * units, bottom: mask.inkBounds.bottom * units,
    em: mask.inkBounds.em * units };
}
function lyricTranslationTightDistance(row, primary) {
  var original = lyricMaskInkBounds(primary && primary.lineMask);
  var translated = lyricMaskInkBounds(row && row.lineMask);
  if (!original || !translated) return null;
  var originalScale = primary.mesh ? primary.mesh.scale.x : 1;
  var translationScale = row.mesh ? row.mesh.scale.x : (row.fontScale || 1);
  return Math.max(0, original.bottom * originalScale - translated.top * translationScale) + original.em * originalScale * 0.02;
}
function lyricTranslationDistanceForRow(row, primary, legacyDistance) {
  var value = lyricTranslationGapValue();
  var defaultGap = Number(fxDefaults.lyricTranslationGap) || 0.92;
  if (value >= defaultGap) return legacyDistance;
  var tight = lyricTranslationTightDistance(row, primary);
  if (tight == null) return legacyDistance;
  var mix = clampRange((value - 0.28) / (defaultGap - 0.28), 0, 1);
  return tight + (legacyDistance - tight) * mix;
}
function prepareLyricTranslationParents(data) {
  if (data.editParentRows === data.rowLayers && data.editParentCount === data.rowLayers.length) return;
  var parents = {};
  var active = null;
  data.rowLayers.forEach(function (row) {
    if (row.isPrimary) {
      if (row.lineIndex != null) parents[row.lineIndex] = row;
      if (row.isActive) active = row;
    }
  });
  data.rowLayers.forEach(function (row) {
    if (row.isTranslation) row.tightParent = row.parentIndex != null ? parents[row.parentIndex] : active;
  });
  data.editParentRows = data.rowLayers;
  data.editParentCount = data.rowLayers.length;
}
