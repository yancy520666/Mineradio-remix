# Search reliability independent review — 2026-10-10

Baseline: `2b2ca9d18e9e8f6f3664170de667aaeadf123cf1`. Local deterministic fixtures, bounded Node tests and static checks only. No real account sign-in, external security PoC, Electron download or production test-runner change. The explicitly cancelled login-logout-race test remains excluded.

## Reviewed behavior

- IME composition Enter does not submit partial pinyin or prevent candidate confirmation; compositionstart invalidates outstanding queries and compositionend restarts the normal debounced input path. Explicit searches and provider switches cancel queued debounce work.
- Nested user-playlist requests bind to state identity, fixed request sequence, query, type, provider mode, user and abort signal. Clear, Escape, query/type/mode changes and back navigation cannot be repainted by stale success or failure.
- Independent review caught mutable sequence ownership in typed pagination: nested navigation advanced the same state object's requestSeq, potentially legitimizing the old page again. The owner fixed it with a captured sequence/controller and owner-guarded commit/finally. Regression tests cover late resolve/reject after nested/back transitions, including not clearing a newer loading flag. An independent production-function probe confirms a stale page cannot replace nested playlist items.
- Outside-click dismissal now cancels pending debounce/network ownership without destroying completed DOM/items. Late results cannot reopen the panel. Explicit refocus restarts interrupted queries; completed cached rows and paging remain usable. Review also caught stale inactive typed.partial causing completed song searches to restart; the owner scoped this check to the active search type and added a no-research-on-focus regression.
- Initial provider transport failures render explicit retry controls rather than falsely claiming no results. Failed page offsets remain intact; manual retry targets only failed providers. Automatic loading stops while a provider remains failed. Successful provider rows survive another provider's failure and retry.
- QQ uses a shared 7-second search deadline: first-page full search up to 4 seconds, fallback up to 2.5 seconds, optional detail enrichment up to the remaining 500 ms. Complete rows skip detail enrichment; later-page failures propagate instead of appearing exhausted. QQ overview maps artist and album blocks from one Smartbox request.
- Qishui uses a 7-second overall search deadline and reserves public fallback time across PC/token failures. Budget values reach the existing real HTTP helpers, which use wall-clock timeouts and destroy timed-out requests. Optional membership waiting is capped at 400 ms; its shared membership-cache request can continue under its existing 2.5-second HTTP deadline. This is not a claim that every browser abort cancels every backend/shared request end-to-end.

## Preservation checks

Byte comparisons against baseline confirm unchanged playback metadata cache/reset functions, server search-cache implementation, Qishui TTL-cache implementation and both underlying HTTP lifecycle helpers. The bounded metadata cache and authentication/pagehide invalidation remain intact. package.json and package-lock.json remain unchanged; no unverified dependency candidate is included.

Existing pagination assertions remain. Their VM fixtures load the added production failure helper and AbortController dependency; assertions were not removed to hide new behavior.

The first npm check failed because its search-glass composite guard still hard-coded the old one-argument pagination signature. CSS/filter code was unchanged. With parent approval, the owner matched the real two-argument signature, retained every glass constraint and added three retry/signal constraints plus a 30-second bounded execution of the two new production-function regression suites. The original failure log is preserved. scripts/run-tests.js remains unchanged.

## Results

Final full bounded suite: **248/248 selected files passed**, 1,366 test entries: 1,361 passed, 5 native/environment skips, 0 failed. Final focused search + metadata-cache run: **79/79 passed**. Final npm check: **exit 0, All checks passed**; Electron runtime smoke skipped in fast/static mode. Cache/dependency preservation: 8 checks passed. The production/test/script/package hash manifest was reverified after both aggregate runs; production remains frozen. git diff --check passed.

The only excluded test file is login-logout-race.test.js, explicitly cancelled earlier. No other test file was removed or skipped by the QA runner.

Limitations: real Chinese input methods/browser events, public-provider availability/latency, Windows and Electron native behavior remain for device validation. Mocked budget arithmetic proves request policy, not internet latency.

No Git staging, commit, push or upload performed by this reviewer.
