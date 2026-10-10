# MineRadio follow-up: listening safety, cache release and update recovery

## Current publication status (2026-10-10)

Spotify removal and the scoped basic-ftp upgrade are included. Final clean-tree
bounded regression: **229 test files passed, 0 failed, 1 blocked (230 total)**;
five native/environment assertions skipped. `npm run check` passed, with its
Electron runtime stage explicitly skipped. The blocked login-race file has no
returned assertion result due to execution-review cancellation. Final dependency
audit: **11 package alerts (0 critical, 3 high, 8 moderate)**, not 11 proven
application vulnerabilities. Earlier counts below are retained phase evidence.

Final logs: `qa/followup-20261010/npm-test-post-removal.txt` and `.exit`,
`npm-check-post-removal-final.txt` and `.exit`. The initial post-removal check
failed an obsolete count of two Spotify-only 9000 ms requests; removing only
that obsolete requirement retained all four supported providers' timeout
assertions and the rerun passed. New dependency evidence is
`qa/npm-audit-lock-basic-ftp-final-20261010.json`.

Real listening, visual inspection of the cache panel, Windows installer/restart,
complete MFA origin policy, and remaining dependency issues are not closed.
Search, pause/resume responsiveness and smoother background transitions are
separate subsequent audit/optimization requests, not completed in this batch.

Baseline: delivered commit `d4a420085acb52866d8516af5383a804a49d02f7`.
This report covers the follow-up changes, not a new claim that every platform,
account, native audio device or Windows installation has been certified.

## Findings and changes

| Priority | Location | Reproduction / impact | Root cause and change |
|---|---|---|---|
| P1 | `cuefield/transition-window-planner.js`; playback modules 16/18 | AutoMix a short track into another short track; an advanced incoming cue can leave only a few seconds to hear. | Planner ignored supplied `maxEntryTime`; runtime did not consistently preserve caller listening floor. Filter entry candidates; enforce intro bounds and entry-relative residence; short/unknown incoming tracks start at zero. Unsafe or stale musical plans fall back to a short natural-tail equal-power transition. |
| P1 | `desktop/remix-updater.js`, `desktop/main.js` | Click install/restart after download; installer can race asynchronous application cleanup or fail while UI reports success. | Await bounded preparation before native install; expose installing/failure state and protect against duplicate installation. Follow-up review also found permanent runtime disposal broke desktop/wallpaper reuse after a failed launch; recovery is separately regression-tested. |
| P1 | `server-security.js`, `server.js` | Abort, error or stall a body-bearing request before completion. | Previous body reader could resolve malformed/incomplete input or remain pending. Bounded byte-aware reader rejects abort/error/premature close/timeout, cleans listeners and avoids invoking downstream mutation after rejection. Closed responses are not written again. |
| P2 | `desktop/cache-release.js`, cache IPC, cover/lyric/comment modules | Clear cache while fetches or delayed lyric translation are outstanding. | Generated-cache release now uses epochs and serialized disk writes; stale work cannot repopulate cleared caches. Delayed timer and idle callbacks validate their captured generation. Active media and user data are preserved. |
| P1 | `desktop/wallpaper-engine-loop-cache.js` | Release cache while lookup is asynchronously verifying a recorded wallpaper file. | Lookup previously pinned only after hashing; release could unlink the video and then lookup returned a URL that answered 404. Lookup verification and pinning now share the mutation queue with release. A real temporary recording/hash-delay test verifies the resulting URL remains usable. |
| P2 | `desktop/main.js` startup migration | Start with legacy Spotify token/credential files after the provider was removed. | An additional startup migration still copied credentials and unlinked the old token despite removing the import-list entries. Remove both obsolete migration blocks; isolated temporary-directory tests confirm source files remain and target files are not created. |
| P2 | `public/index.html`, `public/css/index.css`, cache settings module | Settings had usage refresh but no safe generated-cache release action. | Add compact release action, busy/partial/error status, duplicate-action lock and fresh cover/comment requests. Refresh usage without claiming all occupied storage is removable. |

Security dependency changes and remaining MFA restrictions are described in
`QA_SECURITY_FOLLOWUP_2026-10-10.md`; Git history is a separate, approval-gated
operation described in the history-preservation report.

## Listening policy and limitations

- Songs up to 90 seconds retain their body, with at most a 2.2-second tail fade.
- Longer tracks require the listening floor (65% position and up to 45 seconds
  from entry), a near-intro incoming cue, sufficient plan score, and a bounded
  transition window. Extremely short incoming clips reduce the overlap further.
- Manual seek/next invalidates stale preparation. Late output-device routing
  revalidates the window. Repeated play actions do not rewind an audible deck.
- Natural safety crossfades now use one paired outgoing-media-clock envelope,
  smooth zero-slope entry/exit, and a 40 ms watchdog during the short overlap.
  Advanced effect timelines retain their existing route. Cancellation, pause,
  stale tokens and normal completion clean up both scheduling mechanisms.
- The volume-aware peak guard preserves equal-power behavior at master volume
  <= 0.707. At full volume, nominal midpoint gains change from 0.707/0.707 to
  0.5/0.5: a synthetic correlated unit-peak signal sums to 1.0 rather than 1.414.
  The tradeoff is a 3.01 dB uncorrelated-power dip at that midpoint. This is not
  a true-peak limiter; existing silence floor, filters and effects preclude a
  universal output-ceiling claim. Direct and WebAudio gain-writer ownership were
  fixture-tested to avoid applying the master gain twice.
- A stalled media clock does not advance the fade. The watchdog covers ordinary
  requestAnimationFrame starvation, but complete JavaScript starvation can still
  produce a discontinuity on resume. Sample-accurate audio-thread automation is
  outside this narrow patch and remains a possible later improvement.
- These are explicit safety heuristics, not evidence of human-DJ phrase quality.
  Real listening across genres, variable tempo and streaming failures remains a
  user/device validation gate. No new DSP dependency was introduced.

References reviewed for design, not copied wholesale:
[Mixxx Auto DJ](https://manual.mixxx.org/2.5/en/chapters/djing_with_mixxx.html),
[Tone.js CrossFade](https://tonejs.github.io/docs/15.1.22/classes/CrossFade.html).
Mixxx's intro/outro workflow and equal-power fades are useful references; neither
establishes automatic phrase detection or universal seamless transitions here.

## Cache preservation contract

Release targets recognized generated lyrics, inactive generated wallpaper
packages/loops, verified orphan audio spill files, HTTP cache, and generated
in-memory cover/search/comment/lyric data. It does not clear cookies or browser
storage, login credentials, favorites, playlists, settings, downloaded/imported
media, user fonts, feedback, or beatmaps that might contain user edits. Linked
paths are refused. Active resources are skipped. Disk byte savings exclude RAM.

The UI action is not an automatic periodic eviction policy. Some protected cache
can remain until playback stops or the application restarts. Refresh is
on-demand; clearing cache can make the next network request slower, so it must
not be described as a general performance acceleration.

## Evidence and verification status

- First full test pass: 226/226 test files, exit 0; raw evidence in
  `qa/followup-20261010/npm-test-first.txt` and `.exit`.
- This first pass predates the final failure-recovery and delayed-translation
  review fixes. Final aggregate evidence must be recorded after those changes.
- Focused request-body/server tests: 13/13 passed, including loopback server
  security behavior. No real account or destructive payload was used.
- Dependency lock updates are not equivalent to testing upgraded installed
  Electron. The original shared node_modules directory is not mutated.
- A clean isolated dependency tree was installed with scripts disabled and the
  checkout's own symlink pointed to it. An aggregate attempt was interrupted by
  tool approval cancellation, not a returned assertion failure. A later bounded
  run revealed an import-time Electron binary downloader from the upgraded
  package; plain-Node authentication and wallpaper capturer imports were fixed
  to resolve Electron only in its actual main process. Synthetic boundary tests
  verify zero Electron loads in Node and retained desktop behavior. The login
  race file still encountered execution-review cancellation after the auth fix;
  its cancellation cause remains unknown. No interrupted run is a full pass.
- UI screenshot evidence, if obtained from the isolated preview, is explicitly
  mock-browser evidence and not an Electron end-to-end result.
- Real Windows NSIS/UAC/restart, native desktop attachment, real platform login,
  audible transitions and sustained memory/latency measurements remain unverified.

### Final frozen-source validation

The clean dependency tree matches the updated package-lock. The final bounded
aggregate recorded **228 test files passed, 0 failed, 1 blocked, 229 total**.
The blocked file is `login-logout-race.test.js`: execution approval was cancelled
without returning assertion evidence, and it was explicitly excluded from the
bounded final run rather than counted as passed. Native/environment skips inside
the passing files remain skips. `npm run check` passed; its Electron runtime
stage was explicitly skipped. These results must not be shortened to “all tests
passed” or “Windows verified.”

Evidence: `qa/followup-20261010/npm-test-verified-tree.txt`, its `.exit` file,
`npm-check-verified-tree.txt`, its `.exit` file, `clean-dependency-versions.txt`
and `clean-deps-interruption.txt`. Earlier attempts are retained for traceability.

Dependency audit after the bounded upgrades: **14 package-level alerts remain**
(0 critical, 6 high, 8 moderate), including propagated entries. See the security
report for remaining sources, disputes and compatibility limits. No clean
security bill of health is claimed.

## Subsequent requested Spotify removal

After the above baseline was saved, the user requested complete removal of the
unusable Spotify provider. The follow-up removes its obsolete API module,
desktop OAuth helpers/configuration, frontend account/setup/catalog/search/
playback entry points and dedicated provider tests. Existing archived track IDs
and provider identity are retained as unsupported/unplayable records; they are
not silently converted to another service or deleted from personal storage.
Historical credentials are not copied or deleted. Old provider URLs return
unsupported/not-found responses rather than offering a broken login path.

The aggregate counts above apply to the pre-removal baseline. Post-removal
validation is recorded separately, and only that frozen source should be used
for final publication.

## Performance comparison

No controlled before/after wall-clock, memory or acoustic benchmark has been
completed for this follow-up. No quantitative speedup or footprint reduction is
claimed. Cache release reports measured bytes per invocation; synthetic tests
verify accounting and preservation, not the user's actual 877 MB cache contents.
