# Playback/background integration verification — 2026-10-10

## Final frozen regression

- Discovered: 237 test files.
- Executed: 236; passed: 236; failed: 0.
- TAP cases: 1,230 total; 1,225 passed; 5 skipped; 0 failed/cancelled/TODO.
- Blocked and never executed: tests/login-logout-race.test.js (prior execution authorization cancelled). This is neither a passed test nor an ordinary platform skip.
- Five TAP skips require Windows/native facilities; native-skips.json lists their exact names.
- Additionally, installer-cleanup.test.js reports its Windows-only native NSIS portion skipped inside an otherwise passing legacy-script wrapper. It is not counted as a sixth TAP skip.
- Final npm run check: exit 0. Final git diff --check: exit 0.

## Checks and method

- Production scripts/run-tests.js remains unchanged. QA-only run-bounded.cjs selects sorted *.test.js, excludes only the blocked file, runs each in a separate Node TAP process, and applies a 60-second timeout per file.
- No --electron or --full flag; npm check has an outer 180-second timeout.
- An earlier copy-only check failed because it required obsolete literal wording. That evidence remains in obsolete-copy-guard-check.log. Root authorized a narrow quick-check.js guard update: accept accurate natural authorization wording while requiring the incomplete-auth condition, preview style, early return and no premature auto-close. The QA mutation fixture rejects five unsafe variants.
- The subsequent QQ-only copy/layout patch was reviewed and included in the final full rerun. Existing progress, failure, expiry and verification states remain, and ordinary QQ ready guidance is no longer duplicated.
- Combined final per-file output: full-tests.log (individual test-logs/ are local scratch copies). Machine-readable counts: full-tests-summary.json and test-results.json. Earlier successful pre-layout run is preserved in pre-qq-layout/.

## Frozen snapshot

- Branch and HEAD are recorded in branch.txt and head.txt.
- Reviewed tracked runtime/check-script diff was archived outside the repository to avoid duplicating the patch; source changes are recoverable from Git. Its SHA-256: 9da6248d74ebfca2d2a2acf875e5a4402dedcea3fd003eb3081818e29ad1c1eb.
- final-source-manifest.json hashes every modified source/test/check file and every added test.
- final-status.txt records the unstaged worktree. Existing Mineradio/ and node_modules are outside reviewed changes and must not be swept into a commit.
- No files were staged or committed by this reviewer. No remaining blocking regression found within tested scope.

## Not verified

- Actual GPU/browser frame smoothness or final visual appearance. The original QQ screenshot was reviewed by its owner, but post-change Chromium rendering was blocked by socket permission; no successful after screenshot exists.
- Windows desktop/native Wallpaper Engine behavior and the native cases listed above.
- Live-account login, CAPTCHA/MFA, provider network validation, and the blocked login/logout test.
- No Electron binary downloads, Electron smoke runs, real-account checks, or external security PoC/harness execution. Existing authorized synthetic loopback security regression is included in final counts.
