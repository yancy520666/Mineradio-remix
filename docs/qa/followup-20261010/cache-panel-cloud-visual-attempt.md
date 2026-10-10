# Isolated cache panel visual QA attempt

Date: 2026-10-10 UTC
Scope: isolated cache settings panel copied from production markup/styles, with mock desktop API. No production files changed. This is not an Electron integration test.

## Outcome

**Blocked, no visual pass claimed. No screenshots were produced.**

The supported `mcp__cua_repl` cloud browser initialized successfully. Its API documentation was read, including troubleshooting and screenshots guidance. This did not use the user's browser or an unapproved raw browser driver.

1. `file:///tmp/cache-release-preview.html` was rejected because cloud browser permits only HTTP/HTTPS navigation. No attempt was made to bypass the URL policy.
2. A dedicated HTTP directory containing only the preview HTML, CSS and script was served from the executor. `http://127.0.0.1:8766/` returned `net::ERR_CONNECTION_REFUSED` in cloud browser.
3. A scoped fixture was served with Node's HTTP server in the cua runtime itself (server initialization succeeded). The same browser URL still returned `net::ERR_CONNECTION_REFUSED`. This establishes the browser cannot reach these runtime-local loopback services, not that the application is faulty.
4. The cua runtime fixture server was stopped. No browser flags, sandbox workarounds, security bypasses, public deployment, user computer access, or production edits were used.

## Source observations only

The inspected production CSS includes flex wrapping for path actions, ellipsis for long paths, text wrapping for status, non-shrinking byte totals, hidden restart/status handling, disabled-control styling, and a visible keyboard focus outline. The script includes a busy guard that disables all four panel actions, an aria-busy flag, and live status updates. Safe-data copy explicitly lists login, favorites, playlists, settings, personal media and downloaded songs, and states that in-use files are skipped.

The original isolated preview mocks only `getCacheSettings`; it does not implement the `releaseCaches` API. Its release button would therefore test only the unsupported-version message, not repeated successful release. Additional mock cases would be needed to test success, partial failure, refresh failure, and busy/repeat interaction. Those were not visually executed.

## Still required

- Browser-reachable, authorized isolated preview or actual Electron session.
- Screenshots at wide and narrow widths, actual overflow measurements, keyboard focus checks.
- Visual busy/success/partial/failure/repeated-release flow with an explicitly mocked API, clearly separate from actual cache deletion integration.
- Actual Electron validation for playback continuity and regeneration after real release.
