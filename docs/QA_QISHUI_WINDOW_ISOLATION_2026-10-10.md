# Qishui verification-window isolation review

Date: 2026-10-10. Base: a3eb0e9 (fix/playback-background-20261010).
Scope: authentication window only. No Git publication, live accounts, codes,
credentials, external security PoC, Electron installation or executable launch.

## Outcome

P1 **remains open**: `webSecurity:false`, unverified dynamic component origins,
unbounded subframe destinations, and incomplete permission policy. The small
patch explicitly pins existing no-Node/no-webview defaults and adds a defensive
webview-attachment denial. It does not close the same-origin-policy gap and is
not presented as a newly established full security boundary.

Files changed by this review:
- `qishui-auth-v6.js`: explicit `nodeIntegrationInSubFrames:false`,
  `nodeIntegrationInWorker:false`, `webviewTag:false`; deny `will-attach-webview`.
- `tests/qishui-window-isolation.test.js`: isolated initializer/window contract.
- This report.

No changes to desktop/main.js, cache modules, the account UI, permission
responses, CORS rewrites, mixed-content behavior, or supported verification flow.

## Source findings

1. `_startAssetServer` serves six bundled assets on randomized-token paths at a
   loopback-only HTTP origin. The window uses a separate persistent authentication
   partition, no preload, Node disabled, context isolation and sandbox enabled.
2. `security_host.html` loads bundled React and SDK glue, which loads BDMS from
   its official versioned URL. The session redirects that exact BDMS URL to the
   bundled copy. These bootstrap resources do not identify the later MFA origin.
3. The local host sends cross-origin XHR to `https://api.qishui.com/passport/...`.
   An HTTP 2046 decision may be expanded via
   `https://api.qishui.com/passport/safe/pack_verify_ways_data/?aid=386088`.
   The resulting `decision.url` supplies executable JavaScript to the top-level
   host, exporting `ucWebSecondVerify`. Dynamic component/frame bytes are absent
   from this checkout. The URL validator checks HTTPS syntax and bounded length,
   not a trusted host or final redirected origin.
4. Session response hooks write wildcard CORS response headers for
   api.qishui.com, verify.zijieapi.com and auth.zijieapi.com. Cross-origin local
   hosting explains a plausible compatibility motivation for disabled web
   security; source alone does not prove it is required. Preflight headers,
   credentials, redirects and component behavior still require observation.
5. SDK text includes rc-client-security hosts at
   lf-headquarters-speed.yhgfb-cn-static.com and lf-c-flwb.bytetos.com,
   captcha hosts lf-rc1/lf-rc2.yhgfb-cn-static.com, lf1/lf3/lf6-cdn-tos.bytegoofy.com,
   and monitoring at mon.zijieapi.com. This is a source inventory only, **not an
   approved MFA script/frame allowlist**. No vendor script was executed here.
6. Existing hooks deny popups and non-host main-frame navigation/redirects.
   Redirects in subframes deliberately bypass that guard. A child frame can still
   affect the host under disabled same-origin enforcement; a dedicated partition
   does not restore the same-origin policy within that renderer.
7. No direct Electron IPC bridge/preload is provided to this window. Main invokes
   narrow page functions using executeJavaScript/mainFrame.executeJavaScript.
   No Qishui-specific renderer IPC registration was found. This is not proof of
   safety against arbitrary cross-origin web requests, nor a claim that all of
   the application's ipcMain handlers authenticate their sender.
8. `configureLocalAppPermissions` in desktop/main.js configures defaultSession,
   not this authentication partition. No Qishui permission check/request handlers
   exist. The host explicitly reads notifications permission as browser
   fingerprint input. Unknown dynamic UI might use clipboard or media; a blanket
   deny would change observable behavior without compatibility evidence.

## Why broader production switches were not changed

Electron documents that disabling webSecurity disables same-origin enforcement
and enables allowRunningInsecureContent when not explicitly set. Pinning the
latter false would not solve HTTP-host same-origin exposure, and live component
compatibility is unknown. Enabling webSecurity or inventing a CDN allowlist is
therefore not represented as a safe completed repair.

The new explicit Node/guest settings match already disabled defaults; normal
web iframe/worker execution is unchanged. The guest-attachment denial blocks
Electron webview creation, which was already unavailable because webviewTag
was not enabled. There is no evidence the official web component needs that
Electron-only guest capability. Real Chromium enforcement remains untested.

## Evidence needed to close P1

Use a separately authorized, user-operated Windows/Electron verification session
or authoritative vendor documentation. Do not automate challenges or collect
secret values. Record only redacted scheme/host/path, method/status, resource
kind, redirect chain, main/subframe relationship and permission type/outcome.
Avoid cookies, tokens, codes, request/response bodies and full query strings.

Required observations:
- Each supported 2046 decision family: actual script source/final redirect origin,
  subframe documents, nested frame destinations, required API/CDN origins.
- Whether cross-origin credentialed requests/preflights need narrowly scoped
  response/header handling under `webSecurity:true`; distinguish bootstrap,
  QR polling, component load and completion retry.
- Requested and queried permission types, requesting frame/origin, user-gesture
  requirements, and fingerprint effects. Install both check/request handlers
  together only after defining the legitimate behavior; do not assume a URL on
  the top-level webContents identifies the requesting subframe.
- User cancellation before/during load, window close, refresh/newer attempt,
  failures/retries, and actual successful manual completion under the proposed
  policy. Verify server acceptance instead of treating a page callback as login.

Then enforce verified script/frame/connect destinations and redirect endpoints,
restore webSecurity, and minimize permissions in the dedicated partition.
If legitimate component behavior cannot fit that policy, the host architecture
needs a bounded redesign and review, rather than additional broad bypasses.

## Validation

`node --test tests/qishui-window-isolation.test.js tests/qishui-auth-url-policy.test.js tests/qishui-mfa-lifecycle.test.js tests/qishui-node-import-boundary.test.js`

14/14 passed. The new tests execute the real `_initialize` constructor/hook wiring
with a synthetic Electron object and stubbed network/SDK stages. They assert
explicit preferences, no preload, partition identity, guest/popup denial,
main-document navigation and redirect decisions, and the currently unverified
subframe behavior. Existing tests cover URL validation, cancellation/replacement,
deadlines and avoiding Electron import under ordinary Node.

`node --check qishui-auth-v6.js` and `git diff --check` passed.
These are isolated policy/lifecycle checks, not actual Electron enforcement,
Windows behavior, vendor rendering or successful real MFA validation.
`tests/login-logout-race.test.js` and live passport smoke were not run.

## Primary API references

- [Electron WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences):
  node/worker/subframe/guest options, sandbox, preload and webSecurity behavior.
- [Electron session permissions](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler):
  requesting-frame origin and permission request handling.
- [Electron permission checks](https://www.electronjs.org/docs/latest/api/session#sessetpermissioncheckhandlerhandler):
  both check and request handlers are needed for complete handling.
