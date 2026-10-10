# Decorative quality budgets, 2026-10-10

Applied after search batch 703448ffdfc12f13aecc198e2cb8e2ace810dc6b with explicit root go. Supersedes only the previous cover caps/high invariance statement in gpu-implementation.md. No main framebuffer, lyric texture/UI-cache, CSS filter, video, cadence, governor, preference or account changes. No real GPU/image/FPS validation claimed.

| Budget | eco | balanced | high | ultra |
|---|---:|---:|---:|---:|
| Cover/bloom grid cap | 97 | 127 | 167 | authored grid, unchanged |
| Cover points at default183 | 9,409 | 16,129 | 27,889 | 33,489 |
| Topography grid cap | 96 | 128 | 148 | 224 unchanged |
| Topography floating count | existing authored/managed minimum | existing | existing | existing |
| Managed Workshop grid | 96 | 128 | 192 | 320 unchanged |
| Managed Workshop DPR cap | .8 | 1 | 1.2 | 2 unchanged |
| Managed Workshop pixel budget | 1.4M | 2.1M | 3.2M | unlimited unchanged |
| Managed Workshop floating cap | 20 unchanged | 40 unchanged | 60 unchanged | 100 unchanged |

Floating counts were deliberately left unchanged: count-dependent ring initialization would alter later ultra restoration if lower tiers truncated them differently. No floating-state reconstruction was added. All caps respect smaller authored/current settings. Topography takes minimum with its managed profile and user's floating count. Cover subsets share exact attributes, seeds and spatial positions; no per-switch rebuild. Ultra restores original nonindexed geometry; resolution edits dispose all obsolete wrappers, including the new high wrapper. Default grid requires 106,854 bytes of cached index arrays (9,409+16,129+27,889 indices ×2 bytes), versus prior73,924 bytes; GPU first-bind/upload costs remain possible.

Ultra uses the original complete policy ladder, including every fractional adaptive step. Lower quality tiers use tighter detail arrays, while the original fractional pixel interpolation remains a ceiling; explicit profile DPR and pixel caps are also enforced. No new adaptation algorithm or default change. Existing adaptive preferences, dismissals and governor logic remain unchanged. The lowest fallback80/.7/1.3M/8 stays original. Managed=false still returns null. Ultra with existing adaptive enabled may still reduce as before, with exactly the old profile outputs. No new automatic reduction of ultra is introduced.

## What is and is not independently rasterized

Workshop has its own iframe/R3F WebGL renderer and existing root.setDpr path, so its pixel budget can change without lowering the main canvas. Main 3D, Topography, lyrics and shelf share a framebuffer; lowering mainDPR would soften them all and is not done. Lyrics' independent texture cache is not an independent final render target. UI cache contains full-size background color+depth copied to the main buffer; shrinking it changes depth/edges and is not a safe text-preserving generic resolution switch. Topography is reduced by instance count, not a new offscreen pass. Bloom reuses the existing point draw/shared subset; no offscreen bloom/copy pass is added. DOM video coded resolution and Chromium CSS blur are independent of mainDPR and unchanged.

## Expected visible tradeoffs, not FPS claims

Compared with the preceding implementation, cover point submissions drop33.56%/29.26%/16.72% in eco/balanced/high. Fine artwork, vinyl rims and tunnel bands can look sparser, and glow coverage drops. Default Topography grids112/156/156 become96/128/148; high cells are ~5.4% wider. Workshop terrain becomes coarser and edges may soften at lowered raster resolution. High is intentionally a light visual tradeoff; it is not promised to be invisible. Beat inputs, simulation clocks, lyrics sampling and UI rendering are unchanged. A GPU bottleneck in CSS/video/compositor can dominate and erase a benefit from fewer submitted vertices.

Workshop effective DPR at zero reduction (managed):

| CSS viewport / deviceDPR | eco | balanced | high | ultra |
|---|---:|---:|---:|---:|
| 1920x1080 / 1 | .800 | 1.000 | 1.000 | 1.000 |
| 1920x1080 / 2 | .800 | 1.000 | 1.200 | 2.000 |
| 2560x1440 / 1 | .616 | .755 | .932 | 1.000 |
| 2560x1440 / 2 | .616 | .755 | .932 | 2.000 |

At1080p DPR1 medium/high raster size does not fall, only geometry counts. MainDPR preserves its existing profiles for all screen sizes, DPRs and lowSpec paths. No CPU-brand/i5/i7/i9 capability classification is introduced.

## Verification

`node --test tests/tiered-decorative-render-budget.test.js tests/integrated-gpu-render-budget.test.js tests/sonic-topography-quality-continuity.test.js tests/original-render-quality.test.js tests/visual-performance-controls.test.js`:14/14 pass.

New test:64 viewport/deviceDPR/managed/quality combinations (1080p/1440p,DPR1/1.25/1.5/2), each across reduction0..4 in.125 increments; no budget increases vs old formulas; ultra profile deep equality and fractional resolution equivalence. An additional explicit fractional profile with a lower DPR/pixel ceiling verifies minimum protection. Six user cover resolutions, repeated tier changes, stable attributes/unique indices, ultra restore, and no tier-switch dispose/reseed. Actual THREE terrain meshes are resized with state/root/material continuity; active meteor preserved; managed grid80 and floating2 and user floating3 remain respected. Existing tests preserve main resolution policies, custom resolution disposal, shader completed-fade guards, inactive/death meteor writes, and original ultra resolution.

Release still needs independent QA and user real-device visual/FPS acceptance. Compare identical track/art/lyrics/camera at1080p/1440p,DPR1-2: fine cover/vinyl/tunnel,bloom/crossfade,Topography/Workshop,highlighted lyrics and shelf occlusion. Capture frame-time percentiles and GPU/compositor load; do not infer FPS from these synthetic counts.
