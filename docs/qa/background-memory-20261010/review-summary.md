# Background memory policy — independent final review

Baseline: `0becc950f50880b6c047cd7af81b35dfe1741acf`.

## Results

- 245 test files discovered, 244 executed and passed. `tests/login-logout-race.test.js` remains explicitly blocked and was not executed.
- TAP: 1304 tests, 1299 passed, 5 native Windows skips, 0 failures, cancellations or TODOs.
- A separate NSIS cleanup substep reports a Windows-required textual skip inside a passing wrapper; it is not an additional TAP skip.
- `npm run check`: exit 0; fast/static mode explicitly skips Electron runtime smoke.
- `git diff --check`: clean. All three changed/new source/test files match the frozen SHA256 manifest after the complete run.
- Independent focused regression: 11/11 across the new memory-policy test and existing UI-render-cache tests.

## Reviewed behavior

The main-process execution gate now arbitrates all automatic working-set trim requests using the same platform, current settings, current native visibility, in-flight state and cooldown. A renderer-triggered trim cancels the redundant native timer. Disabling either automatic trim setting and native restore/show cancel queued timers; execution rechecks settings and visibility even when cancellation notification is absent. Repeated hide events retain one pending deadline. Existing manual/manual-force foreground semantics are preserved.

Deep-background cleanup calls the existing UI render-cache disposer even if animation frames have stopped. The actual disposer is exercised for target, quad geometry and material cleanup, idempotence and draw-time reconstruction. The real deep-background predicate preserves keep mode and a native-visible desktop despite stale Chromium document.hidden. No renderer/main canvas, wallpaper workload or audio pipeline is stopped by this patch.

Production scope is limited to desktop/main.js and 00-state/08-desktop-render-power.js; the new test is tests/background-memory-policy.test.js. No production test-runner changes, staging, commits or remote writes were performed by this reviewer.

## Evidence and limits

Exact counts are in full-tests-summary.json, per-file results in test-results.json, full output in full-tests.log, and static output in npm-check.log. Logs require explicit inclusion because the repository ignores *.log.

These are source/VM and existing synthetic regressions, not Windows working-set/RSS/GPU measurements. The existing all-app PID selection and manual trim semantics are unchanged. Keep-mode rendering policy was not reinterpreted as a prohibition on working-set trimming. Broader Qishui verification-window P1 concerns and previous native/runtime validation gaps remain open as recorded in the preceding cache-isolation report.
