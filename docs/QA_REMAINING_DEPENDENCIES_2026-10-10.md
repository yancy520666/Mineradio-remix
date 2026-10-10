# Residual dependency review, 2026-10-10

Latest status: the fresh isolated install completed, but the candidate was rejected
after a reproducible HTTPS custom-CA regression. Shared package manifests,
lockfile and node_modules symlink remain unchanged. No Git commit/push. The earlier
sections below are chronological review history; the final section records the
completed installation and rejection evidence.

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

## Final delivered status

The real application manifests and installed-tree symlink are unchanged by this
review. Current application audit remains the 11-entry baseline, NOT the candidate
three-entry audit. The candidate is NOT an applied security repair. Two attempts
to complete the final candidate install were interrupted by the tool; there is no
remaining complete candidate installation. The initial exploratory successful
installation was overwritten by those attempts and cannot be used for acceptance.

Persistent supporting artifacts: `docs/qa/security-dependency-candidate-20261010/`.
That folder contains the exact lock-only audit, package-node delta, official npm
pack manifest, blocked-install logs, benign manual fixture, baseline fixture
results and manual-verification.md. No automatic test file was added.
The candidate manifests/patch are stored separately in
`/workspace/shared/mineradio-dependency-candidate-20261010/`; do not apply without
completed candidate installation/contracts and independent review.

This documentation does not alter application source, the current search fix,
its validation snapshot, root package manifests, root lockfile or node_modules.

## Completed install; candidate rejected, 10:39 UTC

The newly authorized clean isolated installation completed successfully:
`npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`
returned 0, installed 482 packages and created the installed-tree lock. Both full
`npm ls --all --json` and the selected dependency listing returned 0. This resolves the
earlier tooling blocker, but it does not establish upgrade acceptance.

With the same benign loopback fixtures, global-agent 3.0.0 accepts an explicitly
trusted test certificate; 4.1.3 rejects it with `DEPTH_ZERO_SELF_SIGNED_CERT`.
The actual @electron/get 3.1.0 `downloadArtifact` HTTPS path also regresses:
Got's `https.certificateAuthority` reaches the proxy agent as `ca`, but 4.1.3
discards TLS options because `configuration.secureEndpoint` is absent. Its
`Agent.addRequest` gates TLS option forwarding on that field, whereas 3.0.0
uses `this.protocol === 'https:'`. The request configuration still has
`protocol: 'https:'` and `rejectUnauthorized: true`. No fixture weakened TLS
verification or altered installed dependency code to make the positive test pass.

Candidate HTTP proxy, dynamic NO_PROXY, repeated bootstrap, HTTP artifact SHA256
download, untrusted-certificate rejection, 407 CONNECT rejection and wrong-SHA256
rejection with an empty artifact cache all passed. These passes do not cancel the
HTTPS custom-CA failure. The baseline passes the same trusted HTTPS artifact
download, untrusted-certificate and checksum-negative contracts.

The completed candidate's installed-tree audit reports **3 high, 0 moderate,
0 critical**: node-forge, NeteaseCloudMusicApi and http-cache-semantics. The logging
chain is removed only in that rejected candidate. A fresh read-only audit of the
unchanged application lock still reports **11 entries: 3 high, 8 moderate,
0 critical**. Audit counts are package propagation, not independent exploits.
Official npm metadata still identifies 4.1.3 as latest. The prior major-version
release notes do not prove this actual consumer's TLS compatibility:
https://github.com/gajus/global-agent/releases/tag/v4.0.0
https://github.com/gajus/global-agent/releases/tag/v4.1.0
https://github.com/gajus/global-agent/releases/tag/v4.1.3

Decision: do not apply this override under the user's safe-upgrade-only scope.
Root package.json, package-lock.json, existing node_modules symlink, node-forge,
http-cache-semantics, Electron and builder versions remain unchanged. No custom
proxy patch, downgrade, real credentials, external proxy, Electron install script,
Windows build or application acceptance run was used. A future upstream TLS fix
must pass these contracts before integration is reconsidered.

Evidence and reproducible fixtures are in
`docs/qa/security-dependency-candidate-20261010/verified-install-rejected/`.
See its README and verification-summary.json. No node_modules or generated test
private key is included. The rejected-candidate.patch is evidence only, not an
instruction to apply the upgrade.
