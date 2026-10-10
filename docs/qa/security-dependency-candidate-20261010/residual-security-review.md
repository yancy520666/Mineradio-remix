# Residual dependency review, 2026-10-10

Status: isolated candidate only; no shared repository files, symlinks or installed
packages were changed by this review. No Git commit/push. Parent integration gate
and the interrupted clean-install gate remain outstanding.

## Candidate with a real dependency removal

Scoped override: `"@electron/get@3.1.0": {"global-agent":"4.1.3"}`.
Official source: https://github.com/gajus/global-agent/releases/tag/v4.1.0
removes roarr (and therefore sprintf-js), retaining a customizable logger.
https://github.com/gajus/global-agent/releases/tag/v4.0.0 documents the major
Flow-to-TypeScript change, added CA support and tightened default TLS verification.
https://github.com/gajus/global-agent/releases/tag/v4.1.3 fixes distribution output.
Registry metadata and the tarball identify 4.1.3, CommonJS dist/index.js,
Node >=10.0; this fits the existing >=22.12 Electron build baseline.
The exact consumer, @electron/get 3.1.0 proxy.js, invokes only bootstrap().
Both versions expose bootstrap/createGlobalProxyAgent and GLOBAL_AGENT runtime
HTTP_PROXY, HTTPS_PROXY and NO_PROXY controls. Removing ROARR_LOG logging is an
intentional upstream behavior change; download/installer proxy behavior still
needs completed candidate contracts and real Windows validation.

Candidate lock delta: global-agent 3.0.0 -> 4.1.3; matcher 3 -> 4;
serialize-error 7 -> 8.1; type-fest .13 -> .20.2; remove boolean, detect-node,
es6-error, json-stringify-safe, roarr, semver-compare, sprintf-js. No runtime
music dependency change. Latest generated stage/package-lock.json contains
only these 11 package-node differences from the repository baseline.

Do not substitute @electron/get 5.x: its official v5 release removes GotDownloader
and changes download options to Fetch RequestInit and proxy environment behavior.
Actual app-builder-lib 26.15.3 supplies got timeout.request, agent and potentially
https.rejectUnauthorized options. Blind overriding would lose functional and
safety contracts. https://github.com/electron/get/releases/tag/v5.0.0
Do not use npm audit's proposed electron-builder 26.5 downgrade.

## Test evidence and blocker

Local Node version v24.19.0; Linux only. No Electron import, install script,
Windows installer build, real credentials or external proxy was used.
proxy-contract.cjs starts only loopback fixture servers and synthetic TLS certs.
Baseline global-agent 3 passed HTTP proxy, dynamic NO_PROXY bypass, idempotent
bootstrap, HTTPS CONNECT with fixture CA, and rejection of the untrusted fixture
certificate. No TLS verification was disabled. A Node deprecation about IP SNI
is recorded in the output; fixture host naming can be tightened separately.

An initial isolated npm ci --ignore-scripts installed successfully but contained
an exploratory http-cache-semantics 4.3 override. That override was then removed
per parent instruction and the candidate lock regenerated from the original lock.
The new clean npm ci was interrupted: polling session 12750 returned
`Unified exec process failed: automatic approval review was cancelled`.
The install-final.log has no completion line. Current stage/node_modules is
incomplete; candidate tests failed to load http-cache-semantics and are NOT passes.
Audit was after npm ci in the command, so audit-candidate.json was never created.
Do not reuse this stage as an application runtime or infer audit counts.
No retry after cancellation occurred. Await exact retry authorization via parent.

Baseline audit remains 11 package-level alerts: 0 critical, 3 high, 8 moderate.
The candidate is expected to remove the 8 propagated logging-chain entries if
verified, but this has NOT been confirmed by a new audit. Counts are not exploits.

## Retained advisories and actual reachability

node-forge 1.4.0 remains the latest npm release. Open upstream report and reviewed
advisory have no published fixed version:
https://github.com/digitalbazaar/forge/issues/1149
https://github.com/advisories/GHSA-86w9-cpqp-85rv
The single installed direct consumer is runtime NeteaseCloudMusicApi 4.32.0;
only its util/crypto.js imports forge. That code calls publicKeyFromPem,
publicKey.encrypt(str, 'NONE'), and bytesToHex; no signature verification call
was found in the dependency's JavaScript. This narrows exposure, it does not
constitute a full dynamic reachability proof or a security fix. Do not downgrade
Netease to 4.13.6 or ship a custom cryptographic patch to manipulate audit counts.
Keep as P1 tracked upstream runtime dependency risk; require review before any
future forge verify/certificate-validation callsite is added.

http-cache-semantics 4.2 is development-only via app-builder-lib -> @electron/get
3.1 -> got 11.8.6 -> cacheable-request 7.0.4. The downloader does not set got.cache;
got only dispatches _createCacheableRequest when options.cache is truthy. Its
artifact disk cache is separate from a cross-user HTTP response cache. App source
has no direct import of got/http-cache-semantics; reviewed paths do not instantiate
the reported shared response cache. This is source-based, not Windows-package proof.
The maintainer disputes the report and closed it as not planned:
https://github.com/kornelski/http-cache-semantics/issues/56
https://github.com/advisories/GHSA-ch52-4w7c-c8xp still says patched versions None.
Official npm 4.3.0 exists, but tarball diff only adds response status APIs and
fixes Vary wildcard/own-property comparison. It does not modify max-stale behavior.
Thus do not describe 4.3.0 as this advisory's fix or update only to leave its range.
Retain alert with P2 build-tool exposure assessment, isolate build caches, do not
introduce a shared authenticated response cache or disable TLS checks.

sprintf-js 1.1.3 remains latest. Its advisory is disputed but not withdrawn:
https://github.com/alexei/sprintf.js/issues/237
https://github.com/advisories/GHSA-hp3w-g68c-fv3c
Current reachability is dev download-proxy logging via global-agent/roarr.
Reviewed global-agent log templates are static; network values are structured
context, not attacker-controlled sprintf format strings. Candidate removes the
package rather than muting the advisory. Until installed/audited, retain P2.

## Next gates

1. Parent supplies authorization for one retry of the exact interrupted isolated
   npm ci --ignore-scripts on the official npm registry; do not bypass cancellation.
2. Complete candidate proxy/TLS contracts, add actual get loopback-download contract,
   npm ls and audit evidence; retain failures and fix fixtures honestly.
3. Independent reviewer checks scoped override/API coverage and sources.
4. Parent integration go before any shared package/test/doc write or symlink switch.
5. Real Windows build/proxy and application acceptance remains user's machine work.

## Authorized retry and read-only audit update, 09:57 UTC

The user's explicit retry permission was supplied by parent. A single fresh
npm ci --ignore-scripts --no-audit --no-fund using registry.npmjs.org was started
in the isolated stage (session 64506). Polling returned automatic approval review
was cancelled again. Logs contain no install-completion line, no npm ci process
remained, no installed-tree .package-lock.json exists, and http-cache-semantics is
absent. One same-session confirmation poll returned Unknown process id. No further
installation attempt, alternative install path or incomplete-tree execution used.
See install-authorized-retry.log. This is a tooling blocker, not API test failure.

A separate authorized read-only lock audit completed (exit 1, alerts remain):
`audit-candidate-lock-only.json` reports total 3: high 3, moderate 0, critical 0.
The 8 sprintf-js/global-agent/build propagation entries are actually gone from
that lock audit. Remaining entries are node-forge, NeteaseCloudMusicApi and
http-cache-semantics. This is lock-only evidence, not installed-tree acceptance.

The completed baseline proxy contract now also covers get.downloadArtifact with
a benign loopback HTTP proxy response, supplied SHA256 checksum and isolated
artifact cache; bootstrap/API enum, proxy bypass and TLS tests pass on old global-
agent 3.0.0. Candidate 4.1.3 remains NOT runtime tested. Do not integrate until a
complete install and candidate tests are possible. Parent permits shared manifest
changes in principle, but no manifest or lock change has actually been applied.
