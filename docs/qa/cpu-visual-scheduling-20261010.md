# CPU / visual scheduling changes, 2026-10-10

Scope: all quality modes retain their authored visible parameters. These changes do not reduce lyric, interaction, audio-analysis or render FPS targets. No Intel hardware measurement, browser trace, or GPU-time comparison was performed here. No installer, account operation, Electron download, staging, commit, or push was performed.

## Implemented

1. `01-scene/04-bottom-controls-cursor.js`: only mouse-motion entry is coalesced to one `requestAnimationFrame`; the caller in `02-visual/00-pointer-cover-particles.js` uses the queue. Immediate pointer/click callers supersede queued coordinates. Enter/leave and pointer capture behavior retain their immediate control updates. Every executed measurement reads current rectangles; no persistent geometry cache can become stale after resize or scrolling. Hover can be delayed by one display frame; click/drag hit testing is not moved into the queue.
2. `02-visual/14-stage-lyrics-rendering.js`: invisible spark point buffers skip trigonometry and array/dirty writes. Cheap rotation-z advancement remains exactly where and at the rate it ran before, including the original dt semantics. Reentry recalculates point positions and rotation-x from the current animation time `t`; no accumulated point-position delta must be replayed. The change does not introduce a new wall clock or extrapolate a beat across a hidden-window gap.
3. `02-visual/12-lyrics-row-layers.js`: line/readability/glow scalar writes are omitted only if the mesh is hidden and all three scale coordinates already equal the exact next scalar. No epsilon, shortened runway, skipped row-state calculation, parked mesh, logical-scale cache, altered easing, dropped upload candidate or changed lyric target. All motion, translation/parent state, material updates, and whole-song positions continue as before. This is a modest redundant-write optimization, not whole-row sleep or an O(N) to O(K) algorithm.
4. `11-main-loop.js`: native wake still renders the first frame synchronously. Identical repeated wakes can share that draw only within one display period and before the main loop executes. A different framebuffer size, renderer context, scene/camera identity, camera pose/projection, track token, expired time window, deep background or context-loss observation invalidates the record. The stored camera signature is captured after rendering because Three may update matrices during render. Existing RAF replacement/recovery remains intact.

## Actual production-function VM counts

Run from the repository:

```
node docs/qa/cpu-scheduling-evidence.cjs --baseline
node docs/qa/cpu-scheduling-evidence.cjs
```

The baseline reads commit `a746952de73ed3e326d3f5b343a0bafc8e6efca7` with read-only `git show`. Results are saved as `cpu-scheduling-before.json` and `cpu-scheduling-after.json` next to this report.

- 1,000 pointer motions in a single display interval: normal controls 3,000 → 3 rectangle reads; DIY controls 5,000 → 5; hide-scheduling calls 1,000 → 1.
- 132 invisible spark points, 60 frames: sin/cos calls 39,660 → 0; float-component writes 23,760 → 0; `position.needsUpdate` assignments 60 → 0. Dirty flags are not actual GPU upload counts.
- 200 primary rows, three visible, after 350 frames at fixed animation time: scale setters 200 → 3 per sampled frame. This count describes settled scale only. With changing scale targets the hidden scales continue updating, by design. It is not a representative whole-animation CPU speedup figure.
- Three immediate wakes: synchronous render calls 3 → 1. RAF requests stay 3 and cancellations stay 2 to preserve the previous stale-RAF recovery route.

These are operation counts under controlled inputs, not FPS, wall-clock speedup, forced-layout counts, or Intel i5/i7/i9 device guarantees. Different Intel generations, memory bandwidth and 1920×1080 versus 2560×1440 can behave very differently.

## Focused verification

`node --test tests/cpu-visual-scheduling.test.js` passes 10 tests:

- normal and DIY high-frequency pointer batching;
- immediate event supersession, live resized geometry, captured drag, pointer release, and hidden-page cancellation;
- invisible sparks, current-time reentry, preserved angular phase, and edit-preview freeze;
- synchronous first wake, duplicate suppression, dimensions, camera/scene/context changes, context loss/recovery, repeated sleep/restore, elapsed display frame, and track token;
- exact state equivalence between guarded and unconditional scale setters for 50/200/500 resident rows through settling, far retargeting, single/three/five-line presentation, drag preview, jitter, and restore;
- readability/glow exact state equivalence in persistent-track and legacy easing paths;
- a deliberate test documenting the currently remaining render-cadence coupling.

`tests/lyric-active-line-viewport-fit.test.js` retains strict authored expressions and setter arguments, and now executes the actual scale code to verify edit-preview immediate scale versus normal easing, unchanged hidden-write omission, still-moving hidden-state updates, and manually changed XYZ scales on reentry.

Existing focused controls, seek visibility, seek glide, stage-lyric restoration, and background-window recovery tests also passed. The independent aggregate QA report owns full-suite results and any limitations; do not infer a full pass from these focused checks. First-pass aggregate failure was an obsolete inline-expression source assertion in viewport-fit, subsequently replaced with equal-strength source and stronger dynamic checks; its original log is retained by aggregate QA.

## Main-loop split: analysis only, not implemented

Current `animate()` returns from `shouldSkipAdaptiveRenderFrame()` before audio analysis, `tickLyricsParticles()` and `updateStageLyrics3D()`. A VM run of the actual `animate()` skip path confirms that 30 skipped frames draw the UI cache 30 times and sample audio/lyrics zero times. Raising their frame-gate targets alone cannot decouple these paths. This patch does not claim otherwise.

A direct code move is unsafe because:

- `beatOnsetFlag` is cleared per visual frame, while audio analysis can set it and schedule camera events. Sampling more often without an event-consumption boundary can lose a beat or replay it.
- `beatPulse` is modified by analysis and again by preset-specific visual gain/decay. Running either block at a new cadence changes the authored envelope unless state ownership is separated.
- `tickLyricsParticles()` does more than read time: it can select/prepare/commit payloads and textures. `updateStageLyrics3D()` also owns mesh transitions, quality upload selection and lyric layout.
- UI cache composition currently targets shelf interaction. Running a new lyric state tick without refreshing the correct cache can advance CPU state while the displayed lyric stays old.

### Safe next-stage design

1. Extract audio sampling into an independent clocked producer. Preserve existing analyser FFT/stride/beat semantics and analysis targets. Publish an immutable snapshot with track token, sample time, envelope values and monotonically increasing onset sequence; do not mutate its pulse when applying visual gains.
2. Give each visual consumer its own consumed-onset cursor and derived pulse. Multiple audio samples before a visual render must neither drop an onset nor fire the same camera event twice. Clear state atomically on track-token change and explicit seek, not merely on a skipped render.
3. Extract a read-only lyric clock sample containing token, corrected audio time, line/progress, seek/drag revision, and pending payload identity. Keep resource building, upload budgets, seek holds, parent/translation relationships and scene mutation in an ordered commit stage.
4. Split the render passes/cache ownership so background cadence can differ from lyric/interaction presentation cadence without showing stale cached lyrics. Maintain current lyric/interaction cadence or better; do not call a 30 FPS whole-scene setting a background-only optimization.
5. Preserve deep-background sleep, desktop-overlay refresh, first synchronous native wake, context-loss recovery, splash, paused editing and upload-budget behavior as explicit lifecycle states.

### Evidence required before shipping the split

- Controlled 60/120/144 Hz callback traces with background limited to 30/45/60 Hz: verify analysis and lyric clock sample rates independently, including dropped-frame and >1 s stall cases.
- Scripted beat inputs with multiple onsets between visual frames: each onset consumed once, no duplicate camera event, no changed visible envelope at the original reference cadence.
- Audio-clock seek/drag/rapid track-switch tests: no snapshot crosses a track token; no stale payload wins; committed current lyric/progress matches corrected audio time.
- Single/three/five-line and translation modes, outgoing/entering rows, paused editing, hidden/restore and camera motion: compare visible poses/progress and cache composition against the current reference.
- Real integrated-GPU browser traces and frame captures at 1080p and 1440p for frame time p95/p99, long tasks, visual phase/latency, uploads/draw calls and thermal steady state. Node VM counts do not satisfy this gate.

Until those boundaries and measurements exist, retaining current scheduling is safer than silently changing lyric/beat behavior under a performance label.
