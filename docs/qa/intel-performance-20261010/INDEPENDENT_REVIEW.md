# Independent Intel-targeted performance review — 2026-10-10

Baseline: `a746952de73ed3e326d3f5b343a0bafc8e6efca7`. Cloud Node/VM regression validation, not Intel GPU/driver or visual-FPS measurement. Actual i5/i7/i9 generations are unknown. Target sizes are 1920×1080 and 2560×1440 CSS pixels at DPR 1, 1.25, 1.5 and 2. No account login, outside security PoC, Electron download or production runner changes.

## Image-preserving intent, with verified state evidence

- Old-cover texture sampling is bypassed only once the uniform mix reaches 1. Transitional paths and vinyl four-neighbor smoothing remain. Both main and bloom use the same vertex shader source. Source/algebra checks passed; no native shader compilation or rendered-pixel comparison was performed, and driver optimization may already eliminate work.
- Topography empty meteor/trail slots stop receiving matrices and attribute dirty flags. Final death clears the matrix once; hidden empty meshes become visible again on spawn. Terrain and floating blocks stay visible. A draft misplaced visibility write was caught and fixed before freeze, with a new regression assertion.
- Independent real-THREE deterministic comparison against baseline: 720 variable-delta frames, 3 meteor spawns, complete meteor/trail simulation state equality and 1,358 active-slot matrix comparisons. Baseline 158,400 matrix writes, optimized 1,409. Inactive slots have zero scale. These are API-call counts, not actual uploads or FPS.
- Invisible lyric sparks retain baseline cheap rotation integration using the original frame delta. Only per-point work sleeps. Independent 600-frame baseline comparison includes toggles, fade-out, edit preview and a wall-clock jump: all 327 visible frames have exactly equal position arrays and rotations. Dirty-attribute writes fall from 590 to 327 in this scenario; these are not measured GL uploads.
- Mousemove controls measurements coalesce to the latest coordinates per display frame, with fresh geometry on every flush. Immediate controls/drag paths cancel older queued coordinates. No permanent stale rectangle cache is introduced.
- Hidden lyric rows retain all motion, easing, position, material, texture/upload, seek and full-song runway state. Only exactly redundant scale assignments are omitted. The updater remains O(N); this is not whole-row hibernation and the actual CPU benefit is unmeasured.
- Native restore still draws synchronously first. Duplicate wake draws coalesce for at most a display frame, invalidating on time expiry, context/deep-background transitions, camera/scene identity, camera pose/projection, track token or framebuffer-size change. Native Windows restore still needs device testing.

## Explicit low/medium visible tradeoffs

Low (`eco`) uses a stable indexed subset up to 119² points; medium (`balanced`) uses up to 151². At the default 183² authored grid this is 14,161 / 22,801 instead of 33,489 points per main/bloom draw. This changes visual density and bloom coverage. It is not a corresponding FPS improvement claim.

High and ultra keep the original geometry object, positions, UVs, random seeds and custom resolution. Low→medium→high→ultra cycles restore the exact source geometry. Six authored custom resolutions, repeated switching, explicit resolution edits and disposal were covered. Indexed attributes share the original buffers; no extra render target or compositing pass is added. Maximum source index 33,488 fits Uint16. Extra low/medium index arrays are bounded; a first index upload may still cost time.

The 64 resolution×DPR×quality×hardware-flag combinations match the baseline main renderer pixel policy exactly. No blur filter, audio output, FFT, beat policy, quality labels or high-tier values changed. Full audio/lyrics/background scheduler decoupling was deliberately deferred; this work must not be described as achieving that.

## Validation status

Final bounded suite: **246/246 selected test files passed**, 1,319 test entries: 1,314 passed, 5 native/environment skips, 0 failed. Final focused run: **22/22 passed**. Production remains byte-identical to the frozen diff; final-source-manifest.json hashes the seven production files and all 247 discovered test files. git diff --check passed.

**npm run check passed, exit 0, on the single rerun explicitly approved by the user.** The terminal output says “All checks passed”; 183 JavaScript syntax checks passed. Electron runtime smoke was skipped by fast/static mode. See npm-check-authorized-rerun.log and its exit-code file.

The earlier interrupted attempt remains preserved in npm-check-blocked.json and npm-check-incomplete-first.log: its poll was cancelled by automatic approval review and one authorized poll retry returned an unknown process ID. No alternate route or extra rerun was used. Only after the user explicitly approved a fresh run was the successful single rerun started.

First full run: 245/246 selected files passed; one old source-shape assertion in lyric-active-line-viewport-fit failed after the equivalent scale expression was assigned to a variable. The original failure is preserved in first-run/. The owner updated equivalent expression constraints and added actual-code dynamic normal/preview easing, hidden exact-write suppression, ongoing hidden change and manually edited XYZ reentry assertions. Final focused and complete reruns passed without weakening the intended behavior.

`run-bounded.cjs` is QA-only; it selects every `tests/*.test.js` except the explicitly cancelled login-logout-race test and applies a 60-second timeout per file. Native Windows/Electron checks are separately disclosed as skipped, not passed.

No stage, commit, push or upload performed by this reviewer.
