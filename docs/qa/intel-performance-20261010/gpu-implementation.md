# Integrated GPU rendering changes (2026-10-10)

Baseline: `a746952de73ed3e326d3f5b343a0bafc8e6efca7`. Working-tree changes only; no commit/push. No GPU benchmark or real rendered-image comparison was possible in this cloud runtime. i5/i7/i9 labels are not used as GPU capability detection.

## Implemented

- All tiers: previous-cover texture reads bypassed only when `uColorMixT >= 1`. The CPU completes a fade at exactly 1. All samples remain during transitions, including the four old-cover neighbors in vinyl smoothing; main and bloom derive from the same vertex program. This preserves the mathematical displayed result, subject to real-driver shader validation.
- All tiers: Topography meteor/trail slots write matrices only while active, including their final death frame. Empty meshes are hidden and resume on activation. Construction still initializes zero-scale matrices once. Terrain and floating blocks remain visible and unchanged. Simulation, spawning, timing and ripple logic are preserved.
- Low (`eco`): cover and its bloom select at most 119×119 existing grid points.
- Medium (`balanced`): at most 151×151 existing grid points.
- High and ultra: retain the full original, non-indexed cover geometry and original point order.

The budget geometries share original position/UV/random attributes. Their index arrays are built alongside a new user-resolution geometry, never on quality switching. Surviving particles do not change position, shape input, color sample coordinate or random phase when switching. Resolution values smaller than a cap stay smaller. `fx.coverResolution`, texture size, shader `uCoverRes`, bloom enable/strength/radius, main DPR profiles, CSS glass, video decode and UI are not modified. Preset restore calling the same-resolution resolution setter also reapplies current quality selection.

## Counts, not FPS

For the default 183×183 cover, with both regular and bloom points visible:

| Tier | Before points per draw | After points per draw | Two-pass point submissions | Reduction |
|---|---:|---:|---:|---:|
| Low | 33,489 | 14,161 | 66,978 → 28,322 | 57.71% |
| Medium | 33,489 | 22,801 | 66,978 → 45,602 | 31.91% |
| High / ultra | 33,489 | 33,489 | 66,978 → 66,978 | 0% |

This reduces decorative geometry and corresponding bloom point coverage; no FPS percentage follows from these counts. Both draw calls remain when both effects are enabled. The two cached index arrays add 73,924 bytes at the default grid; underlying full-resolution attributes remain shared and retained for exact restoration. First use can still upload/bind an index buffer: this is not a claim of zero driver stalls.

Cover source-level fetch expressions at completed fades are halved: common initial pair 2→1, tunnel's two pairs 4→2, vinyl center+four-neighbor path including initial pair 12→6. A driver may already eliminate some unused sampling; these are shader-path counts, not measured GPU texture transactions. During a fade the original reads remain.

For 60 completely empty Topography update calls after construction: matrix writes 13,200→0, `needsUpdate=true` assignments 120→0. Nominal marked 4×4 float matrix data previously 844,800 bytes; this is not observed GL traffic. The independent reviewer also compared 720 variable-dt frames with meteor/trail activity: 158,400→1,409 matrix writes, 1,358 active-slot matrices elementwise equivalent, simulation state equivalent. See `topography-differential.json` and its reproducible script.

## Verification

`node --test tests/integrated-gpu-render-budget.test.js tests/sonic-topography-quality-continuity.test.js tests/original-render-quality.test.js tests/visual-performance-controls.test.js`: 10/10 pass.

The new test covers:

- 64 combinations: 1920×1080 / 2560×1440 CSS, DPR 1 / 1.25 / 1.5 / 2, normal / lowSpec heuristic, four existing quality tiers. Existing DPR and pixel budgets are retained exactly; custom cover resolution 1.32 stays 1.32 in every case. `quality-matrix.json` independently compares renderer baseline/current.
- Six custom cover resolutions (0.75, 0.9, 1, 1.1, 1.32, 1.55), repeated low/medium/high/ultra switching, unique spatial index coverage, shared exact attributes, original high/ultra geometry restoration with no rebuild/disposal on tier changes.
- Explicit resolution edits dispose all obsolete geometry wrappers; lower-tier caps never persist into the custom setting.
- Shader guards, complete vinyl neighbor transition source, exact fade completion, shared bloom shader and scalar interpolation algebra. These do not replace shader compilation or image comparison.
- Actual THREE matrix writes/versions for empty frames, active spawning, final zero scale, recycled slots, clear/recreate, terrain/floating visibility.

## Remaining risk and required real-device validation

Low and medium intentionally produce fewer decorative particles and less aggregate glow. Spatial sampling is a nearest-point subset of the original grid, so gaps can alternate between one and two source steps; reduced coverage/aliasing may be visible, especially on vinyl rims, tunnel bands or very fine artwork. High/ultra have no budget-induced change. No graphics-vendor code or broad GPU-name assumptions were added.

No native Intel UHD/Iris/Arc measurements, GPU timer queries, GPU/compositor utilization, p50/p95/p99 frame timings, image captures or real-driver GLSL compilation were run. Browser startup is blocked by the known runtime socket restriction. Real-device checks should compare transition frames, vinyl smoothing/rim, bright bloom, UI occlusion, custom-resolution restoration and 1080p/1440p OS scaling. High/ultra should image-match aside from ordinary nondeterministic animation; low/medium require visual acceptance. CSS/video bottlenecks may dominate independently of these improvements.
