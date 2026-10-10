# Tiered quality and lyric temporary-file safety — independent QA

Baseline: `703448ffdfc12f13aecc198e2cb8e2ace810dc6b`. The user authorized stronger low/medium visual tradeoffs and mild high-tier tradeoffs, while ultra must retain the original effect. Validation uses local Node, actual Three.js data structures, controlled filesystem failures and deterministic policy arithmetic. No real Intel GPU, FPS, Windows driver, account or external security PoC was exercised.

## Final quality scope

- Cover particles use stable indexed subsets: eco 97², balanced 127², high 167², ultra the user's full authored grid. At default 183² this means 9,409 / 16,129 / 27,889 / 33,489 points per main or bloom draw. These are visible density/coverage tradeoffs, not FPS improvement percentages. Every retained particle shares the same position, UV and random attributes. Custom low-resolution selections are never raised to the cap. Tier changes select cached geometry without reseeding or disposal; an explicit authored-resolution change releases all old geometries.
- Topography grid caps are 96 / 128 / 148 / 224, further bounded by the existing authored density and any stricter managed profile. Default density produces ultra grid 156, not 224. Grid changes use the existing instance-buffer replacement path, retaining root, materials, animation time, opacity, rotation and meteor/ripple state. This does not establish zero real-device frame hitch.
- Managed Workshop lower endpoints are grid 96/128/192, DPR .8/1/1.2 and pixel ceilings 1.4M/2.1M/3.2M. Ultra retains the complete original adaptive ladder, including fractional reductions, not only its no-reduction endpoint. Unmanaged behavior and the existing governor/cadence algorithm stay unchanged.
- Proposed floating-count reductions were **withdrawn**. Review demonstrated that new effective-count initialization could change floating positions on returning to ultra. Final floating counts, authored limits and existing managed budgets retain baseline behavior. Existing history-dependent layout behavior was not redesigned.

## Independent preservation evidence

- `policy-differential`: 1,088 combinations across 1080p/1440p, DPR 1/1.25/1.5/2, quality, managed state and reduction 0..4 by .25. Actual DPR, grids and counts never increase relative to baseline. All 272 ultra combinations retain original fields and actual DPR exactly.
- `floating-sequence-differential`: 90 same-baseline transition steps, managed/unmanaged and five reduction levels, preserve complete per-slot floating data and counts. This compares identical histories; it does not incorrectly require legacy eco→ultra to equal direct ultra initialization.
- `preserved-surfaces`: 10 byte-level checks retain main renderer/DPR, lyric mesh/rendering, CSS, custom-background controls, governor implementation, packages/lock, production runner and all cover shader/material definitions.
- Cover tests cycle six custom resolutions through all four qualities, assert stable shared attributes, valid unique Uint16 subsets, exact ultra geometry restoration and disposal only on explicit resolution edits.

## Lyric temporary-file repair

Writers create PID plus random unique temporary paths with exclusive `wx`, track ownership only after successful open, write and close before rename, and remove only their own temporary file on failure. Successful rename releases temporary ownership immediately. Unknown historical `.tmp` files and another writer's colliding path remain untouched. Existing final cache data stays unchanged on injected write, close or rename failures.

Seven focused scenarios include three injected failure types (write/close/rename), successful publication, exclusive-create collision, a paused active writer and stale generation. The focused cache set has 26 passing tests. Cleanup is best-effort when the filesystem refuses deletion; forced process termination may still leave an unidentifiable temp. This does not claim historical unknown files were swept. Beat-cache budgets or user-edit semantics were not changed.

## Validation status

Final aggregate: **250/250 selected test files passed**; 1,377 entries: 1,372 passed, 5 native/environment skips, 0 failed. Final focused set: **75/75 passed**. Final npm check: **exit 0, All checks passed**. git diff --check passed; all source/test/script/package hashes were reverified after the runs and frozen production is unchanged.

Initial full run: 249/250 selected files passed; three assertions in one existing Sonic test file still expected the old eco grid 112 instead of newly authorized 96. Initial failures are preserved in first-run/ and first-focused-old-budget-failures.log.gz. The owner updated nine exact eco-ceiling expectations from 112 to the authorized 96, preserving all governor, disabled, ultra and recovery assertions. Final focused, complete bounded-suite and npm-check reruns passed. Initial npm check passed with exit 0.

The QA-only runner gives each file 60 seconds and excludes only the explicitly cancelled login-logout-race.test.js. Native environment skips and Electron fast/static-mode omission are disclosed separately. No production runner bypass was added.

No staging, commit, push or upload performed by this reviewer.
