# Playback, background, and login follow-up — 2026-10-10

Base: `5d3cc3ecfb06ae32d6db232d62ca37746f1aac50`. This batch is separate from the previously frozen source delivery and publication staging. Remote publication is not established by a local commit or passing tests.

## Scope and evidence

| Area | Change | Verification boundary |
| --- | --- | --- |
| Playback start | Beat-cache disk reads no longer block the play call. Late results require matching media, track, queue, session and cache ownership; current playback time is preserved. | Synthetic runtime/VM tests, not measured Windows first-sound latency. |
| Output routing | Avoid repeated successful same-sink writes and rebuilding hidden routing controls; refresh, disconnect and retry invalidate the optimization. | VM sequence: three route applications previously produced nine sink calls, now three; two hidden refreshes previously rebuilt controls twice, now zero. |
| Topography and Workshop | Keep outgoing visual until candidate readiness; reject stale generations; fade actual material alpha; bound resource retirement; preserve archive camera and save committed preset. | Readiness includes renderer submission, not proof that a GPU displayed a frame. |
| Custom image/video | Decode image or obtain first video frame before swapping; preserve outgoing media on error; bounded two-surface handoff and owned URL cleanup. | Synthetic loading, cancellation, crop identity, retry and reduced-motion tests. |
| QQ login | Consistent navigation guards for root, child and warm-up windows. | Simulated Electron events; no real login or challenge completion. |
| Login feedback | Existing status line and refresh action distinguish an unconfirmed session from success. Short wording: “暂时无法确认登录，请刷新状态”. | Presentation, refresh epochs and ownership tests; no new badges or panels. Network failure is not relabeled as expired login. |
| QQ scan guidance | Merge duplicated ordinary scanning instructions into “请用 QQ 音乐 App 扫码”; normalize title spacing, scope text/QR spacing and action alignment to QQ, with narrow-screen stacking. Progress, expiry and error states remain visible. | Original user screenshot inspected. Corrected browser rendering remains unverified because installed Chromium could not start under the available socket permissions. |
| Qishui source extent | Unknown source duration is explicitly unknown, not assumed full length; advanced full-source and beat-prefetch gates respect that evidence. | Mock provider and playback contract tests; ordinary URL playback remains allowed. |

## Independent review corrections

- Save the selected preset only after asynchronous commit; do not overwrite restored archive camera with stale pending options.
- Resume Workshop preparation after returning from a hidden window; settle failed commits and dispose partial candidates.
- Preserve the actual outgoing skull rather than substitute generic particles.
- Match crop previews to selected video identity; allow explicit retry after a failed media selection.
- Honor reduced-motion CSS specificity.
- Make the existing NetEase refresh request bypass its status cache.
- Replace internal login jargon with short actionable wording. The static check now recognizes that wording while retaining the partial-authorization guard, preview state and early return before automatic closure; mutation checks reject removal of those safeguards.

## Aggregate verification

Bounded aggregate logs are recorded under `docs/qa/playback-background-20261010/`: 237 test files discovered, 236 executed and passed, zero failed, one explicitly blocked. TAP totals: 1,230 tests, 1,225 passed, five native-platform skips, zero failed/canceled/TODO. A separate legacy installer-cleanup wrapper also reports its native NSIS portion skipped; a passing wrapper is not an installer test. `npm run check` exited 0 with Electron runtime smoke skipped. The final run includes the natural login wording and QQ scan guidance/layout changes. Independent review and `git diff --check` passed. Earlier run logs are retained as phase evidence, not the final count.

`tests/login-logout-race.test.js` remains blocked following a canceled operation and must not be rerun in this environment. Native/platform skips must be counted separately from passed assertions. No real credentials, security challenge, audio device, installer, or GPU validation is claimed.

## Remaining risks and explicit exclusions

- Actual Windows first-sound latency, audible transitions and GPU smoothness require a real device run.
- Native Wallpaper Engine handoff and ordinary particle-to-particle shape transitions were not redesigned.
- Qishui MFA local SDK isolation/origin concerns remain open; this batch does not claim to solve them.
- Login credentials, a validated account, an obtainable song URL and audible licensed playback are distinct; mocks do not prove live platform availability.
- Long-pause URL refresh and audio-element rebuild behavior are unchanged.
- Search interaction/backend findings were reported separately; search code is not changed in this batch.
- Remaining dependency advisories and historical tag work are tracked in the previous security/history reports.
