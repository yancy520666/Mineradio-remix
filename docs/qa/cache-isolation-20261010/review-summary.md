# Cache and isolation review — 2026-10-10

Baseline: a3eb0e9b751fa65a08833c8db5e59f133b94027b. No staging, commit or remote writes performed by this reviewer.

## Final validation

- 244 test files discovered; 243 executed and passed. The explicitly cancelled `tests/login-logout-race.test.js` remains blocked and was never executed.
- TAP: 1296 tests, 1291 passed, 5 native Windows skips, 0 failures, 0 cancellations, 0 TODOs.
- A separate NSIS native-cleanup substep reports Windows-required skip inside a passing wrapper; it is not an additional TAP skip.
- `npm run check`: exit 0. Its fast/static mode explicitly skips Electron runtime smoke.
- `git diff --check`: clean. All 29 changed/new source and test files matched `frozen-source-sha256.json` after the run.
- Runner, exact per-file results, full output and check output are in this directory. Logs are ignored by the repository's default `*.log` rule and require explicit inclusion if committed.

## Independent review outcomes

- Spill fallback owns copied buffers, splits oversized input into its available queue budget, releases backpressure on consumption/close, and retains the caller's awaited-push contract. A small subarray no longer pins the original oversized buffer.
- Lyrics success/miss caches have entry/estimated-byte/TTL bounds. Release epochs block late search, response, rejection and queued-hit resurrection; oversized current results can still render without retention. The cache-release fixture loads the real cache helpers and retains its behavioral assertions.
- Metadata caches use bounded LRU/TTL storage and reset epochs; synchronous clear before the producer microtask now prevents the old fetch from starting.
- Failed cover entries and global runtime trim use the real disposer, clearing timers, pending tasks and Image references while preserving active/visible records.
- Local importer-owned blob URLs preserve selected playback, delayed readers, actual gapless previousAudio and saved-playlist references. Duplicate backend additions do not pin a new unused import. User/historical beat maps and active analysis/playback maps remain protected; late automatic/disk results cannot overwrite a newer edit.
- Loop files use separate owner-bound leases and range-stream pins. Actual media unload precedes video-lease release; pause retains it. Same-key recording cannot replace an issued file. Failed re-verification cannot erase active protection. Main-document navigation retires the renderer owner; hash/history and child-frame navigation do not.
- Oversized decrypted audio bypasses cache retention without changing the active response Buffer. Explicit cache release clears accounting and advances the generation; older in-flight work can finish playback but cannot refill the cache. UI disk-cleared bytes remain separate from logical memory-reference bytes.
- Qishui window changes explicitly lock existing no-Node/no-webview defaults and prevent webview attachment. They do not close the broader verification-window security boundary.

## Limits

No real Windows/Electron/GPU/browser visual run, account login or MFA, external security PoC, or measured process-RSS soak test was performed. Qishui `webSecurity:false`, unverified script/subframe-origin exposure and auth-partition permission policy remain open P1 concerns. Queue/cache byte budgets are ownership/estimated retention budgets, not a total application RSS ceiling. Current upstream chunks, native/socket buffers, active response Buffers, protected/visible/user-edited entries, saved-session blob URLs and active/legacy loop pins can legitimately exceed individual soft budgets. Metadata pending-table bounds do not impose a global request-concurrency cap; concurrent spill disk usage remains outside this change.
