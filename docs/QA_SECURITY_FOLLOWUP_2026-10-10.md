# Security follow-up, 2026-10-10

Latest integrated state: Spotify executable provider code is removed; old
records are preserved as unsupported. Scoped basic-ftp 6.2.1 override and all
earlier bounded upgrades are included. Fresh audit has 11 package-level alerts
(0 critical, 3 high, 8 moderate); earlier counts are historical phase results.
Clean-tree bounded regression: 229 files passed, 1 execution-blocked, 0 failed;
five native/environment assertions and the Electron smoke stage remain skipped.
No full security or real-platform acceptance is claimed.

Scope: current restored baseline `d4a4200` plus this worktree's defensive fixes.
This is not a complete security acceptance or evidence of any actual data leak.
The 2026-10-09 audit is historical evidence; the following supersedes its claims
only where explicitly stated. No prior interrupted security harness, live account,
malicious parser fixture, remote write, vendor script, or real MFA flow was run.

## Implemented

- Removed obsolete Spotify credential names from both original-profile import
  and app-owned migration lists. Active Spotify routes already return
  `PROVIDER_REMOVED`; this does not restore the platform. Existing source and
  destination files are neither deleted nor rewritten by this change. The user's
  later explicit full-removal request additionally removed Spotify API code,
  OAuth/login/reset helpers and credential environment paths together, avoiding
  any fallback deletion target. See the full-removal section below.
- MFA component URL validation now rejects non-HTTPS URLs, credentials,
  nonstandard ports, fragments, control/space characters and excessive length.
  Validation runs before assigning script.src, including after query expansion.
- The dedicated MFA window denies new windows and permits top-level document
  navigation/redirects only to its exact local seed/host documents.
- Generated a minimal lockfile upgrade in a separate temporary directory with
  `--package-lock-only --ignore-scripts`: Electron 42.4.1 → 42.10.0 and Axios
  1.18.1 → 1.20.0. Only those package nodes and root metadata changed. The
  checkout's existing node_modules symlink was not changed or installed into.

## Verification and remaining gates

15/15 focused tests passed: original-profile import (including no obsolete
credential copies and preservation), pure MFA URL/navigation validation, and
existing mocked MFA lifecycle behavior. JavaScript syntax and diff whitespace
checks passed. No actual Electron/Windows/DPAPI/MFA validation was performed.
The existing runtime dependencies remain old until a separate clean install;
Node tests using them do not prove new-runtime compatibility.

MFA is only partially hardened: `webSecurity:false` remains. Official dynamic
component origins and necessary subframe origins have not been established.
The bundled SDK resource hosts do not prove the valid 2046 decision-component
origins. No blanket CDN allowlist was invented. URL validation does not validate
remote redirects or authenticate the eventual executable response. This P1
residual needs official origin evidence plus real-platform CORS/navigation
compatibility verification before it can be closed.

## Dependency source reconciliation

- [Electron advisory](https://github.com/electron/electron/security/advisories/GHSA-qmv3-fv6v-rmhq)
  identifies 42.10.0 as a patched version. [Release](https://github.com/electron/electron/releases/tag/v42.10.0)
  exists. Same-major selection limits change scope, but does not prove ABI or
  Windows compatibility. Package engines still require Node >=22.12.0.
- Axios [data URL advisory](https://github.com/axios/axios/security/advisories/GHSA-c29m-xwm3-cm6r)
  and [proxy redirect advisory](https://github.com/axios/axios/security/advisories/GHSA-mghh-pgcx-3jjj)
  identify 1.20.0 as patched; the [release](https://github.com/axios/axios/releases/tag/v1.20.0)
  exists. Existing protocol/proxy controls affect reachability, not the need for
  validating a clean upgraded tree.
- Important correction: the [music-metadata MP4 advisory](https://github.com/Borewit/music-metadata/security/advisories/GHSA-f94x-6692-553q)
  explicitly describes an unreleased master regression absent from npm 11.14.0.
  Do not treat npm's broader `<11.16.0` audit range as proof that this specific
  MP4 bug affects the checked-in 11.14.0.
- The [DSF advisory](https://github.com/Borewit/music-metadata/security/advisories/GHSA-8j4c-6x6g-rq3j)
  covers <=11.14.0 and identifies 11.15.0 as patched. The [EBML advisory](https://github.com/Borewit/music-metadata/security/advisories/GHSA-5gfj-9q3v-qfp3)
  lists 11.16.0 as patched but its narrative still says the patch was unreleased;
  published package/release confirmation is necessary before selecting it.
  Local-library parsing uses parseFile in the main process. Its extension list
  excludes DSF/WebM/MKV, but this alone does not prove that crafted bytes cannot
  reach affected parsers. No hostile media was executed.
- [js-yaml maintainer advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)
  identifies 4.3.2 as patched; the lock has 4.3.0, used by updater YAML parsing.
  Candidate only; no unverified extra upgrade was included.
- [proxy-addr maintainer advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)
  identifies 2.0.8 as patched. Its specific issue needs IPv4-mapped/zero-prefix
  trust-subnet configuration. MineRadio calls Netease API functions and creates
  its own Node HTTP server; it does not invoke serveNcmApi in reviewed source.
  Loading Express through that dependency does not prove this trust-proxy path
  is active. The old three critical package-level entries are propagated alerts,
  not three demonstrated application exploits.

Remaining dependency alerts require continued per-package compatibility and
reachability work. Never describe the historical 50 package alerts as 50 proven
exploits or claim a clean security pass from these two version updates.

Fresh registry audit of the staged lock completed with exit 1 (alerts remain),
recorded at `docs/qa/npm-audit-lock-20261010.json`: 25 package-level entries
(1 critical, 12 high, 12 moderate); no Electron/Axios entries remain in that
result. This is a lock-only audit, not installed-tree verification. Historical
registry counts are not directly attributable to the two upgrades because
advisory metadata can change; do not report 25 exploits fixed.

## Second dependency pass: bounded compatible updates

The preceding 25-entry audit is an intermediate snapshot. The final manifest
and lock now also select the following maintained security releases, retaining
all existing major lines (including separate versions of brace-expansion and
undici). Registry version/engine/dependency/integrity evidence is saved in
`docs/qa/dependency-patch-registry-20261010.json`.

- proxy-addr 2.0.8: [maintainer advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [release](https://github.com/jshttp/proxy-addr/releases/tag/v2.0.8).
- js-yaml 4.3.2: [maintainer advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh), [release](https://github.com/nodeca/js-yaml/releases/tag/4.3.2).
- music-metadata 11.16.0: [release confirmed](https://github.com/Borewit/music-metadata/releases/tag/v11.16.0), resolving the earlier uncertainty about availability. Node >=18 unchanged. The existing direct dependency and existing override both move together.
- qs 6.16.0: [maintainer advisory](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g). This deliberately overrides Express/body-parser's narrower ~6.15.1 constraint; it retains the major API line and passed a benign parse/stringify smoke, but complete upstream integration is not inferred.
- fast-uri 3.1.8: [maintainer advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj).
- @xmldom/xmldom 0.8.15: [maintainer advisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-93r5-fhx6-vmg9). Stays on 0.8 rather than crossing a pre-1.0 minor boundary.
- brace-expansion 1.1.21, 2.1.7, 5.0.12: [maintainer advisory](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr).
- undici 6.28.1 and 7.29.1: [maintainer advisory](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5). Runtime requirements remain below the Electron package's existing Node >=22.12.0 build requirement.
- ip-address 10.7.1: [maintainer advisory](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-h3mg-xc3c-68pw).

Version-qualified overrides avoid forcing other major lines onto these targets.
New required transitive resolutions include content-type 2.1.0 for
music-metadata and side-channel 1.1.1 for qs; existing API major lines remain.
No blanket audit-fix, package downgrade, unrelated toolchain upgrade or vendor
binary execution was used.

### Clean-tree validation

An independent `npm ci --ignore-scripts --no-audit --no-fund` succeeded, installing
489 packages. Direct dependency resolution (`npm ls --depth=0`) succeeded. A
benign API smoke checked Axios/Electron package versions, qs, YAML, proxy address
parsing, IPv6 parsing, URI parsing, XML parsing, all three brace-expansion lines
and both undici lines without making network requests or launching Electron.
Targeted tests use a source snapshot with the new independent dependency tree:
actual benign FLAC metadata/cover/LRC persistence and updater tests. The old
hard-coded expected music-metadata version was updated to 11.16.0; this changes
an intended dependency assertion, not behavioral acceptance criteria.

Electron postinstall was intentionally skipped, so its executable is absent in
this tree. Do not infer actual Electron, Windows installer, MFA, ABI, DPAPI or
platform-login compatibility from successful npm resolution or Node tests.
The previous shared dependency directory was never changed. The root task owns
any later checkout-symlink switch and full-suite verification.

### Final audit and retained risks

`docs/qa/npm-audit-lock-final-20261010.json` reports 14 package-level entries:
0 critical, 6 high, 8 moderate. These propagate from four distinct underlying
package advisories. Audit exit 1 is expected because entries remain. Counts are
registry metadata, not confirmed reachable vulnerabilities.

- basic-ftp 5.3.1 remains. Its [maintainer advisory](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-c475-qrg2-pj4r) identifies 6.2.1 as fixed. Moving 5→6 crosses a major API line and was not forced. It is pulled through get-uri/PAC handling; no FTP listing path was demonstrated in MineRadio. Further dependency-chain review is needed before claiming it unreachable.
- node-forge 1.4.0 remains with no verified published fixed version for the [open upstream signature-validation report](https://github.com/digitalbazaar/forge/issues/1149). Netease's reviewed util/crypto.js calls public-key encryption, not the reported signature verification method. That limits the observed call-chain relevance but does not prove the entire dependency graph cannot reach verification.
- http-cache-semantics 4.2.0 remains, in the development/download-tool chain through cacheable-request. The [maintainer explicitly disputes the report](https://github.com/kornelski/http-cache-semantics/issues/56) and closed it as not planned; cookie presence and freshness alone do not establish forbidden cross-user reuse. Keep the registry alert visible and mark it disputed, rather than inventing a patched version or claiming user leakage.
- sprintf-js 1.1.3 remains through development logging (roarr/global-agent). The [upstream discussion](https://github.com/alexei/sprintf.js/issues/237) records objections and a submitted CVE dispute; no verified patched release was selected. This is not proof that the alert has been withdrawn. The relevant risk requires attacker-controlled format templates and unhandled exceptions; app reachability was not demonstrated.

This bounded pass stops at verified compatible releases. A zero-count audit is
not achieved, and replacing/major-upgrading packages or suppressing disputed
alerts simply to obtain zero is outside this pass.

Final focused clean-tree result: 22/22 tests passed after the intended version
assertion update. This includes the existing actual updater download-integrity
test against its isolated local fixture, not a real release download or install.

## Node import boundary correction during aggregate validation

The root's later clean-dependency aggregate runs encountered an unexpected
Electron downloader side effect, followed by tool approval cancellation, during
Node-only authentication fixtures. Those runs did not produce passing aggregate
results and must not be reported as application assertion failures or as a
successful Electron installation. Source inspection established that the
Electron 42.10.0 npm entry point invokes install.js when its executable is
missing, and qishui-auth-v6 previously imported Electron at module load time.
`--ignore-scripts` during npm ci alone therefore did not prevent that later
import-time downloader attempt.

Production correction: qishui-auth-v6 now resolves Electron lazily and only in
an actual Electron main process (`process.versions.electron` and browser process
type). Plain Node initialization returns `QISHUI_ELECTRON_REQUIRED` without
resolving the package. Plain Node cleanup without a desktop runtime has no
Electron session to clear. Desktop cleanup still awaits app readiness and
clears the persistent authentication partition. The QR bridge's default instance
is lazy, so explicitly injected authentication does not load desktop auth.

Three new synthetic import-boundary tests passed, with a throwing Electron-load
sentinel for plain Node and an explicit mocked Electron main runtime for desktop
cleanup. Syntax checks passed. No installed-binary spoof, security-policy change,
downloader retry or Electron postinstall was used. Previously cancelled tests
were not rerun by this worker; the root owns a fresh aggregate run after source
verification. Actual Electron/Windows behavior remains unverified.

## Explicit Spotify full removal

The user subsequently requested complete removal because this provider is
unusable. This supersedes the earlier narrowly scoped importer-only correction.

- Removed spotify-api.js and the dedicated obsolete API/token lifecycle tests
  and desktop setup smoke; new removal/compatibility tests replace their purpose.
- Removed main-process PKCE/OAuth callback/browser helpers, partition constants,
  provider logout cleanup, and Spotify credential environment assignments.
- Removed server credential-module imports, token-clear calls, and Spotify
  listening-report support. Old `/api/spotify` URLs retain only an explicit 404
  `PROVIDER_REMOVED` response; they do not invoke a provider implementation.
- Removed obsolete positive Spotify integration checks from quick-check and its
  audit mutation target; static removal guards now reject reintroduction.
- Removed README claims of an active Spotify source or Spotify token encryption.
  Historical QA records and applicable third-party disclaimer text remain.
- Existing credential files are never read, migrated, overwritten or deleted by
  this removal. Stored playlist/checkpoint identifiers remain archive data.
  The built-in playlist reader preserves historical Spotify track IDs, names
  and URIs across reload and unrelated renames, marks them non-playable with
  `providerRemoved`, and rejects newly added Spotify tracks. Checkpoint
  normalization preserves identity without converting it to NetEase.
- Renderer work is owned by the coordinated frontend task. Its focused guard
  verifies no Spotify API/login surface, blocked legacy playback before queue
  or audio mutation, and no archived-record search/album/artist requests.

The combined focused suite passed 27/27 tests, including archive persistence,
checkpoint identity, source/API-removal guards, original-profile import and the
frontend removal tests. Syntax/diff checks passed. No real accounts, previously
blocked login-race fixture or old interrupted security harness were executed.
The root owns final aggregate validation after all workers freeze.

## Scoped basic-ftp security update (2026-10-10)

Added only the `get-uri@6.0.5` scoped override to `basic-ftp@6.2.1`.
The lockfile changes only that package's version, registry URL and integrity.
The sole consumer chain is NeteaseCloudMusicApi → pac-proxy-agent → get-uri.
The maintainer confirms GHSA-c475-qrg2-pj4r fixed in 6.2.1:
https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.2.1
https://github.com/advisories/GHSA-c475-qrg2-pj4r

The v6 breaking change disallows separate passive-transfer hosts by default;
this secure default remains enabled. No application callsite sets a PAC/FTP
proxy, so normal music provider behavior is not expected to change. This is a
source-based exposure assessment, not a claim that the vulnerable package was
unreachable under every deployment configuration.
https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.0.0

The installed 5.3.1 and 6.2.1 Client.d.ts files are identical. The consumer's
CommonJS imports, access, lastMod, list, downloadTo and close API remain intact.
Both versions declare Node >=10; the app's >=22.12 baseline satisfies this.
https://raw.githubusercontent.com/patrickjuchli/basic-ftp/v6.2.1/package.json

A new isolated clean stage was installed from the official npm registry with
`npm ci --ignore-scripts`. The existing dependency stage was not modified.
Benign loopback-only fixtures passed on both 5.3.1 and 6.2.1 under Node 24.19.0:
MDTM download and socket cleanup; machine-readable LIST fallback download;
ordinary Unix LIST parsing; cache-not-modified; 550 not-found; interrupted
basic-ftp transfer and cleanup; public CommonJS/API availability. The fixture
and output are in `docs/qa/basic-ftp-compatibility-{fixtures,results}-20261010.*`.
No crafted denial-of-service input, live accounts, or external FTP service was
used. An initial fixture incorrectly expected QUIT / immediate socket closure;
cleanup now checks actual socket closure within one second. A Unix LIST fixture
also confirmed an existing get-uri limitation: when MDTM is unsupported and
Unix metadata lacks modifiedAt, get-uri returns ENOTFOUND in both versions;
this upgrade does not introduce or change that behavior.

A fresh lock audit invocation was interrupted by an automatic approval-review
cancellation and produced no JSON. The previous audit remains historical and
must not be represented as the updated dependency state. Final full regression,
updated audit and actual Electron/Windows verification belong to the root
integration pass; Electron install scripts were deliberately not executed.

The single subsequently authorized retry completed successfully. Fresh audit
artifact: `docs/qa/npm-audit-lock-basic-ftp-final-20261010.json`. It reports 11
package alerts (8 moderate, 3 high; zero critical), from three underlying
advisories: http-cache-semantics, node-forge, and sprintf-js. The basic-ftp and
propagated get-uri/PAC-chain alerts are gone. This replaces the prior audit
blocker for the dependency change; the earlier 14-alert file is historical.
`npm ls basic-ftp get-uri` verifies exactly one overridden basic-ftp 6.2.1 and
get-uri 6.0.5 in the new clean stage. No force install, broader major upgrade,
security-warning bypass, or disputed-advisory suppression was used.
