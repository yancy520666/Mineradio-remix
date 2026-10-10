# 桌面、安全与依赖审查：中文结论

本项审查中断，下面保留已取得的英文技术证据，不能称为完整安全验收。没有修改生产安全代码，没有重试被拦操作。问题均未修复：

- DS-01 / P1：汽水 MFA 动态组件来源缺少约束，另有 `webSecurity:false` 和导航边界风险。已有隔离假组件证据只证明本地加载/完成逻辑，不证明真实平台验证能被绕过。需基于官方来源证据约束组件、协议和导航，不能凭猜测扩域。
- DS-02 / P2：原版 Spotify 历史凭据导入没有完整对齐加密存储；不恢复已移除的 Spotify 平台，也不操作原版真实文件。
- DS-03 / P2：请求体错误/关闭的结算不完整；相关防御性修复尚未执行。
- 依赖：锁定树489节点，npm公告包含50个包级告警（3 critical、34 high、13 moderate），存在传递/重复计数，绝非50个已证明可利用漏洞。Electron42.10.0与Axios1.20.0是本次核对的官方修复版本方向；升级兼容性和Windows回归尚未执行，未改共享依赖。
- 汽水专有相关资源分发授权仍未核实。没有安装、删除或宣称合法。

实际位置、复现、根因、影响、建议与逐文件审查范围见下文；Windows/安装更新/真实账号均没有本项端到端通过证据。正式发布前必须处理或明确接受开放风险。

---

# Desktop / local API / distribution security review, 2026-10-09

## Result and execution boundary

This is an **interrupted, incomplete review**, not a whole-application security
pass. No production file was modified by this reviewer. At 21:16 UTC the parent
task required an immediate stop on new production edits, PoCs, and security tests
after a tool security-check interruption. Only the already completed results and
evidence are recorded here. The reviewer did not receive a tool result naming
the denied operation, so it cannot reliably identify that operation. No denied
action was retried, and no alternate route was used after that instruction.

The previously authorized fixes for request-body lifecycle, imported credential
encryption, and MFA URL protocol/credentials/port checks **have not been made**.
The unsafe behaviors described below therefore remain open.

Repository baseline: `451b6cf`; production working tree already contained other
reviewers' changes when this review started. Relevant evidence was captured from
the working tree at 21:14:37 UTC, not represented as an untouched baseline-commit
execution. The parent preserved the original checkout under its audit baseline.

All recorded audit fixtures used temporary directories, fake tokens, or VM
objects. They did not read real account files, the user's installed player,
APPDATA profiles, real libraries, private native configuration, or proprietary
native signing binaries. No GitHub push, publish, release, install, update, or
real challenge interaction was performed.

## Evidence already produced

- `scripts/qa/audit-desktop-security.js`: isolated read-only production-source
  audit harness. It captures defects rather than treating the presence of a
  defect as a security pass. It is not wired into `npm test`.
- `docs/qa/desktop-security-baseline-20261009.json`: harness result, actual exit 0
  at 21:14:37 UTC. The name identifies the pre-fix capture; the JSON's `root` is
  the current working checkout. It does not claim Electron or Windows execution.
- `docs/qa/npm-audit-20261009.json`: actual `npm audit --json --ignore-scripts`
  registry result, 489 dependency nodes and 50 package-level alerts: 3 critical,
  34 high, 13 moderate. These include propagated/transitive duplicates and are
  **not 50 independently exploitable application vulnerabilities**.
- `docs/qa/dependency-risk-summary-20261009.json`: lockfile-version and
  production/development grouping of that registry result.
- `docs/QA_INVENTORY_2026-10-09.json`: separate inventory reviewer enumerated
  34 desktop files, 110 IPC channels, 113 preload APIs, 97 HTTP paths (95 API
  paths), packaging files, and the static dependency graph. Enumeration is not
  behavior validation.

## Confirmed open findings

### DS-01 · P1 · MFA component source is not constrained

- Location: `qishui-auth-v6/security_host.html:227-248,333-350`,
  `qishui-auth-v6.js:245-269`.
- Call chain: QR poll returns 2046 → `checkQrConnect` → `secondVerify` →
  `__qishuiSecondVerify` → optional `expandVerifyCenterDecision` → `new URL` of
  `decision.url` → `loadVerifyScript` → dynamic `script.src` in the authentication
  document. `webSecurity:false` is enabled for this separate authentication
  partition. Its window setup contains no navigation or popup restriction.
- Root cause: URL construction appends `aid` and verification query fields but
  never checks the URL protocol, credentials, port, origin, or allowed component
  source. Request data is treated as authority to choose executable code.
- Reproduction already run: the isolated VM executes the real host script with
  each of an arbitrary HTTPS host, HTTP loopback, `file:` URL, and URL containing
  username/password. In each case `scriptAppended:true`; the fake component's
  callback can end the **local UI attempt** with `verificationFinished:true`.
- Impact: an untrusted or compromised decision/component can run in a document
  used for an account-authentication workflow. Disabling the same-origin boundary
  increases the consequence of unexpected script/navigation. This capture proves
  the unchecked executable-source sink and UI completion, **not** browser loading
  of the `file:` case, account-cookie theft, arbitrary native execution, or a
  successful bypass of the platform's server-side verification.
- Proposed minimum fix: reject non-HTTPS, URL credentials, fragments, abnormal
  ports, malformed URLs, and excessive length before dynamic insertion; also
  constrain navigation/popups. A complete fix additionally needs a documented,
  evidence-backed official component-source policy and evaluation of restoring
  `webSecurity:true`.
- Source-policy evidence available: bundled `sdk-glue.js` contains explicit
  static security-resource hosts including `lf-headquarters-speed.yhgfb-cn-static.com`,
  `lf-c-flwb.bytetos.com`, `lf-rc1.yhgfb-cn-static.com`,
  `lf-rc2.yhgfb-cn-static.com`, and `lf1/lf3/lf6-cdn-tos.bytegoofy.com`.
  These are resources used by that SDK; they do **not** prove the set of valid
  2046 decision component origins. No generic CDN suffix allowlist was invented.
- Status: **unfixed; isolated VM sink reproduction completed; actual official
  MFA and Windows/Electron compatibility not verified**.

### DS-02 · P2 · Original Spotify import bypasses encrypted credential storage

- Location: `desktop/original-profile-import.js:6-10,48-67`,
  `cookie-storage.js:8-10`; storage consumer `spotify-api.js:195-197,251`.
- Call chain: original-profile IPC → importer missing-file loop →
  `isProtectedCredentialFile(name)` → false for `.spotify-token.json` and
  `.spotify-credentials.json` → raw JSON parsing and `COPYFILE_EXCL`, instead of
  safeStorage read/re-encryption used for platform cookies.
- Root cause: the importer's credential list and storage classifier disagree.
- Reproduction already run: real temporary Original/Remix directories, fake
  access/refresh tokens, and a fake available encryption provider injected into
  the real importer. Plaintext token imported once, remained readable in the
  destination (`plaintextAtRest:true`), and source bytes remained unchanged.
  The same token stored with the encrypted prefix imported zero files and left
  no destination, because raw `JSON.parse` rejected the encrypted envelope.
- Impact: new local plaintext token copies bypass the at-rest protection; an
  already encrypted original token is silently skipped. Spotify is currently
  removed from active API routing, which reduces immediate runtime relevance but
  does not justify copying its old credentials in plaintext.
- Proposed minimum fix: classify the token as protected, decrypt with migration
  disabled on the original, and encrypt only the missing destination. The client
  credentials format must also be reconciled with its actual configuration
  reader before adding encryption to that file. Preserve source bytes and
  existing Remix choices.
- Status: **unfixed; filesystem behavior reproduced with synthetic encryption;
  real Windows DPAPI/safeStorage not exercised**.

### DS-03 · P2 · Request-body errors are success-shaped and lack complete cleanup

- Location: `server.js:1099-1118`; multiple callers in route branches.
- Call chain: local API mutation route → `readRequestBody` → data accumulation →
  error resolves `{}` or aborted/close-only does not settle → route continues
  with defaults/fallback query data or retains a pending continuation.
- Root cause: only `data`, `end`, and `error` listeners are registered; errors
  resolve an empty body. There is no one-shot settlement/cleanup, no independent
  body-read deadline, and the 8 MiB threshold measures decoded JavaScript string
  length rather than received bytes. Oversize input destroys the request instead
  of explicitly rejecting the body reader.
- Reproduction already run: real extracted function in VM with EventEmitter
  request objects. After partial JSON and `ECONNRESET`, the promise resolved `{}`
  and retained `data/end/error` listeners. An `aborted` + `close` sequence without
  a following `error/end` left the promise unsettled.
- Impact: failure and an intentionally empty body become indistinguishable;
  query/default-based mutation routes may proceed after a failed body read.
  Pending listeners/data can persist until the request object is released.
  This synthetic event capture is **not** a completed socket-level exploit or
  proof that every real Node abort omits its `error` event.
- Proposed minimum fix: reject transport errors, premature close, abort,
  oversized bodies, and deadline expiry; byte-count Buffers; clean listeners on
  every terminal path; preserve successful JSON/form and empty-body contracts.
  Callers should return a clean body-error response only while still writable.
- Status: **unfixed; function-level event evidence completed; real HTTP abort,
  slow upload, and all route integrations not verified**.

### DS-04 · P1 follow-up gate · Vulnerable installed dependencies

- Location: `package.json`, `package-lock.json`, dependency summary above.
- Root cause: several fixed security versions are newer than pinned overrides
  or installed lockfile resolutions. Electron is classified as development by
  npm, but its executable is the shipped application's runtime.
- Evidence already run: actual npm audit; matching installed/locked versions
  for Electron 42.4.1, Axios 1.18.1, body-parser 1.20.6, music-metadata 11.14.0;
  registry reads verified Electron 42.10.0 and Axios 1.20.0 exist with SHA-512
  integrity. All lockfile tarballs inspected had registry.npmjs.org resolved
  URLs and integrity fields; no nonregistry resolved URL or missing integrity
  was found in that static check.
- Impact: known affected dependencies require per-call-chain assessment and
  compatible upgrades; an npm severity alone does not establish exploitability.
- Status: **dependency inventory/audit completed; no upgrade, install, malicious
  parser execution, native ABI comparison, or post-upgrade regression performed**.

Verified primary sources and compatibility conclusions:

| Dependency | Installed/locked | Minimum verified security target | Source and reachability assessment |
| --- | --- | --- | --- |
| Electron | 42.4.1 | 42.10.0 | [Official preload-cache advisory](https://github.com/electron/electron/security/advisories/GHSA-qmv3-fv6v-rmhq) specifies 42.3.3–below42.10.0 and no app-side workaround. Remote login content is loaded by this app. Main renderer uses sandbox:false, while isolated login windows use sandbox:true with no preload, so exact exploit prerequisites still need native validation. [Popup sandbox advisory](https://github.com/electron/electron/security/advisories/GHSA-hq2x-r82h-9wj4) separately fixes 42.5.2; main popup denial is already a mitigation for that particular path. [42.10.0 release](https://github.com/electron/electron/releases/tag/v42.10.0) includes Windows shutdown/rendering fixes. Registry package engines are Node>=22.12.0. Same Electron major reduces major-ABI migration risk; native ABI equivalence was not measured. |
| Axios | 1.18.1 override | 1.20.0 | [Maintainer data-URL advisory](https://github.com/axios/axios/security/advisories/GHSA-c29m-xwm3-cm6r) and [maintainer proxy-redirect advisory](https://github.com/axios/axios/security/advisories/GHSA-mghh-pgcx-3jjj). Existing media proxy rejects data: before transport. Netease util/request defaults settings.proxy=false, mitigating the environment-proxy prerequisite; QQ SDK call-chain review is unfinished. Registry 1.20.0 has no newly declared engines restriction in returned metadata. |
| music-metadata | 11.14.0 | 11.16.0 indicated by npm audit, **not yet registry/primary verified** | LocalMusicLibrary parses selected files in the main process with parseFile(duration:true,skipCovers:false); M4A is allowed. Audit lists MP4 loop, EBML allocation, and crafted DSF crash advisories. Extension allowlisting alone cannot establish safety against crafted container bytes. No malicious parser file was executed. |
| js-yaml | 4.3.0 | 4.3.2 indicated by audit, **not yet independently verified** | Runtime electron-updater parses update YAML. Audit lists ordered-map/merge CPU exhaustion. Upstream release-feed trust and response limits need separate assessment. |
| proxy-addr / Express / NeteaseCloudMusicApi | 2.0.7 / 4.22.2 / 4.32.0 | **not yet verified** | The three critical package-level alerts propagate from proxy-addr. Installed package presence is not proof that the separate Express server or affected trust-proxy path starts in this application. Exact runtime reachability is unfinished. |
| Remaining high/moderate | See dependency summary | **not yet verified** | Includes production basic-ftp/get-uri/PAC/SOCKS/IP-address/node-forge/qs chains and build-only XML/asar/get/rebuild/glob/undici chains. Do not conflate build-only packages with active server paths or declare them harmless without review. |

Proposed upgrade procedure for the parent, not executed here: use an independent
temporary directory with copies of package.json/package-lock.json, change only
approved same-major targets, and generate/install independently. The current
node_modules is a symlink to shared older dependencies; modifying it would also
change the preserved baseline's environment. Switch the active checkout only
after the new lock and independent dependency tree are available. Run all Node
checks, static guards, Electron startup/login/overlay/protocol checks, then
Windows installer/upgrade/uninstall and actual WE/WorkerW/DWM/input/DPAPI checks.
Never run blanket `npm audit fix --force`, proprietary components, or publishing
as part of this procedure.

### DS-05 · P2 release gate · Resource redistribution authorization is unverified

- Location: `package.json` build.files includes `qishui-auth-v6/**/*` and
  `qishui-audio-decryptor/**/*`; `docs/THIRD_PARTY_PORTS.md`, `CLAUDE.md`.
- Evidence: packaged resource inclusion and existing handoff explicitly record
  that these resources' separate provenance and redistribution terms remain
  unverified. A declared GPL license for the bridge repository does not establish
  rights for every embedded third-party binary/web resource.
- Impact: distributing new packages while rights remain unverified creates an
  unresolved release/compliance risk. This is not a legal opinion or a claim
  that the resources are unlawful.
- Proposed resolution: maintainer supplies the provenance/license evidence for
  each retained resource; report before release. No file was removed and no
  proprietary signing component was introduced or executed.
- Status: **existing known risk reconfirmed by source; authorization unresolved**.

## Coverage ledger: all owned desktop files

The inventory is exhaustive; behavioral review is not. “Reviewed” below means
the named source function/section was actually inspected. It does not mean all
functions or operating-system behavior passed. No existing desktop test suite
was rerun by this reviewer before the interruption.

| File | Functions/features checked or remaining |
| --- | --- |
| app-memory.js | Complete small source inspected: app PID normalization, fixed PowerShell script, timeout, temp cleanup. Windows execution pending. |
| browser-cookie-import.js | Complete source inspected: browser/profile discovery, bounded target SQL clauses, private DB copies, DPAPI stdin, cookie name/domain/path/control filtering, expiry and candidate selection. Real browser/DPAPI pending. |
| built-in-playlist-library.js | Inventory only; delegated persistence review outside this review. |
| desktop-icon-shape-runtime.js | Native probe/watch/stop, stdout/stderr transport, DPI/rect complement and cleanup sections inspected. Full C# native behavior pending. |
| desktop-native-icon-layer-runtime.js | External guard transport, named-pipe startup, ready/terminal ACK, command waiters, source script/temp and stop sections inspected. Complete C# and Windows ACK/restore behavior pending. |
| full-desktop-mode-runtime.js | Serialization, generation/abort, icon-watcher restore-confirmation/circuit, interactive↔passive, reconcile, disable/dispose and fail-closed sections inspected. Other geometry/native branches and actual Explorer restart/input pending. |
| kugou-native-qr.js | Inventory and relevant transport/function references; complete review pending. |
| kugou-verification.js | Complete source inspected: official URL validation, challenge identification, frame detection coalescing/uncertain state, explicit entry. No actual challenge interaction. |
| local-music-library.js | Allowed media formats, parseFile metadata path, capability/protocol references inspected. Full import/persistence/media behavior outside this partial review. |
| login-inline-qr.js | Inventory and main caller chain only; complete lifecycle review pending. |
| main.js | Startup identity/userData/cache/library ownership; trust helpers; permissions; window/preload/nav; IPC region; login-window and original-import/update call sites; display events and shutdown cleanup inspected. 110 IPC enumeration exists, but complete per-handler spoof/cancellation/native review pending. |
| microphone-permission.js | Complete source inspected: sender/frame, real-input and activation check, one-shot grant, enumerate/capture type restrictions, reset and navigation lifecycle. Native permission behavior pending. |
| onboarding-state.js | Complete source inspected: bounded JSON, known guide keys, missing/default behavior, temp rename. Runtime suite pending. |
| original-profile-import.js | Complete source and temporary fake credential import executed; DS-02 remains. |
| original-profile-preferences.js | Complete source inspected: bounded copied LevelDB, isolated session interception, timeout and temporary-only cleanup. Electron/Windows file-lock behavior pending. |
| overlay-preload.js | Complete bridge inspected; its lyrics mutations need matching approved overlay sender validation before blanket IPC guarding. Native overlay behavior pending. |
| playback-checkpoint-store.js | Complete source inspected: primary/backup normalization, durable serialized replace, ordering and clock rollback. Existing suite pending in this reviewer. |
| preload.js | Complete exposed bridge inspected: named channels, webUtils file-path derivation, callback unsubscribe, clipboard and sync APIs. 113 API inventory exists; all main handler contracts pending. |
| qishui-native-signing.js | Complete source inspected only: narrow track target, bounded queue/timeout/idle child, header filtering, private configuration path. Native modules/config were not read or invoked. |
| qishui-sign-worker.js | Inventory and paired parent contract only; executable native signing behavior outside permitted audit. |
| qq-login-page.js | Inventory/main call sites; full source/actual page review pending. |
| qq-native-protocol.js | Inventory/reference transport only; provider reviewer owns active protocol inspection. |
| qq-native-qr.js | Inventory/main integration only; actual SDK auth/storage teardown review pending. |
| remix-updater.js | Complete source inspected: installed-pending guard, release plain text/highlights, state/check/download/install lifecycle. Package/runtime/native testing pending. |
| sonic-performance-preferences.js | Complete small source inspected: strict known booleans, size bound and temp rename. Runtime suite pending. |
| startup.html | Inventory only; startup renderer behavior pending. |
| system-memory.js | Main caller/background/auto-elevation gates inspected; complete native source review pending. |
| wallpaper-engine-input.js | Complete JS/native source inspected: bounded P command, exact source PID/class/ancestor, button reset, cursor-free forwarding. Windows target validation/input reset pending. |
| wallpaper-engine-library.js | Scheme/capability setup, format/property definitions and native scene/media target/response validation inspected. Complete Steam discovery/scanner/realpath lifetime review pending. |
| wallpaper-engine-loop-cache.js | Complete source inspected: bounded serialized recording, identity/hash lookup, partials, publish/prune, tokenized response. Tests and real Chromium recording pending. |
| wallpaper-engine-properties.js | Complete source inspected: account/project matching, definitions/key/value validation, command-size cap, serialized atomic update. Windows property command pending. |
| wallpaper-engine-runtime.js | Process ownership/generation, shell broker/control, DWM helper stop/ACK, source activation, native scene start, stop/dispose sections inspected. Full native C# and actual scene behavior pending. |
| wallpaper-loop-window.js | Complete source inspected: serialized token/bounds ownership, transition timeout, stale leave, restore ACK. Runtime suite pending. |
| wallpaper-mode-runtime.js | State normalization, WorkerW attach script, cancellation wrapper and main replacement context inspected; remaining legacy runtime/full branch review pending. |

## Local HTTP and packaging coverage

- `server-security.js`: complete source inspected; local peer/Host/Origin/Fetch
  Metadata checks; complete DNS result blocking and pinned lookup; redirects
  revalidated; fake-IP music-domain range **not changed**. Existing real socket
  tests were read but not rerun by this reviewer.
- `music-dns.js`: complete source inspected; pinned Alidns TLS bootstrap, JSON
  limits, matching DNS question/CNAME chain, TTL/pending/cache budgets.
- `cookie-storage.js`: complete source inspected; safeStorage/basic_text checks,
  encrypted prefix and failure preservation, restricted credential logging,
  owner-only atomic files; no real system storage exercised.
- `server.js`: boundary/static security headers, request-body reader, media
  headers/proxies, login/attempt/logout and provider mutation route regions read.
  All 95 API paths enumerated separately; full route validation, method matrix,
  socket malformed-URL/oversize/abort, arbitrary static path, and authorization
  tests are still pending. Login race fixes added by other reviewers were
  inspected at call sites, not independently fully validated here.
- `build/after-pack.js`: complete source inspected; official/npm rcedit discovery,
  target/icon existence and fixed execFile argument list. Packaging not run.
- `build/installer-remix.nsh`, `installer-internal-beta.nsh`: complete small
  brand/include definitions inspected; formal asar:false and beta asar:true are
  intentionally distinct and were not unified.
- `build/installer.nsh`: init/directory/marker and uninstall owned-tree/updater
  cache functions inspected; bounded appId line scan, nonrecursive link removal,
  silent warning defaults, and named installed-file cleanup. NSIS/Windows
  installation, upgrade, rollback, uninstall and junction races not run.
- `.github/workflows/ci.yml`, `release-windows.yml`: complete source inspected;
  pinned Actions, read default permissions, credential persistence disabled,
  version/tag target check, Windows install/upgrade/uninstall validation, digest
  check and separate draft publishing. No workflow was triggered.
- `package.json`, internal-beta packaging references and attribution documents:
  reviewed artifact boundaries/unsigned release statement. Launchers and full
  Windows validation scripts remain inventory-only for this reviewer.

## Operating-system and verification limitations

Current executor is Linux. Real WorkerW/Explorer icon-layer recovery, DWM
thumbnails, HWND/PID/class checks, WE Scene/Web processes, keyboard/IME and pointer
delivery, elevation broker, NSIS, browser DPAPI and real safeStorage **were not
executed**. The parent reports the ordinary and upgraded Electron main launch
are blocked by Unix-socket `EPERM`; this reviewer did not bypass that restriction
or label startup/native/UI validation as passed. VM source execution and static
inspection cannot replace these checks. Existing historic Windows/CI success
documents establish history only, not a pass for this current dirty working tree.

Further work must wait for the parent's decision and an allowed execution path;
do not retry a blocked action based on this report.
