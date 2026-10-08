# Third-party ports

## Kugou comments and daily recommendation protocol reference

- Reference: [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi), GPL-3.0.
- Reviewed on 2026-10-03: `module/comment_music.js`, `module/comment_floor.js` and `module/everyday_recommend.js`.

Remix reuses its existing gateway transport and song mapper. Endpoint parameters
were checked against this reference; hot/newest comment routes and response
fields were verified through anonymous requests to Kugou. No upstream runtime
or additional dependency is bundled.

## Nested comment reply protocol references

- Netease: the already installed `NeteaseCloudMusicApi` module `comment_floor` supplies the parent-comment and time-cursor contract.
- QQ: [official web client common bundle](https://y.qq.com/ryqq/js/common.chunk.ddca9cfefd825f4a733d.js), inspected on 2026-10-03 for `music.globalComment.CommentRead.GetReplyCommentList`, sequence/rank cursors and reply fields. No QQ client code is bundled.
- Qishui: [LuoYe17/ly-music-source comments adapter](https://github.com/LuoYe17/ly-music-source/blob/main/src/providers/qishui/comments.ts), GPL-3.0, inspected on 2026-10-03 for the PC `/luna/pc/comments/:id/replies` path and nested response records. Remix uses its existing authenticated request transport and mapper; no upstream runtime is bundled. Account-based Qishui replies remain unverified.

## Upstream reliability and security fixes

- Source: `XxHuberrr/Mineradio-paused`, GPL-3.0-only.
- [PR #487](https://github.com/XxHuberrr/Mineradio-paused/pull/487), author `sa2360`, revision `3894a4b4cd9528e617d2fe4239dbdbc77badc1ec`: sequential PCM-band reduction and its cancellation/failure regression fixture.
- [PR #304](https://github.com/XxHuberrr/Mineradio-paused/pull/304), author `ThySummer14`, revision `3fb00bd056581b1421f8cf8e1e26fa8e21f38680`: Cookie storage implementation and local API/proxy boundary design. Remix additionally pins validated DNS results to outbound sockets, covers Qishui/podcast media paths, and preserves credential import/export/logout behavior. The patch-updater subsystem was not ported.
- [Issue #479](https://github.com/XxHuberrr/Mineradio-paused/issues/479): non-destructive offline filtering and the need to refresh local references in built-in playlists. Remix adds streamed full-content fingerprints, stable relinking and bounded playback skip notices.
- [PR #486](https://github.com/XxHuberrr/Mineradio-paused/pull/486), [PR #210](https://github.com/XxHuberrr/Mineradio-paused/pull/210), and [iWYes/Mineradio-SMTC](https://github.com/iWYes/Mineradio-SMTC) were inspected as media-control references. Remix implements event-based MediaSession integration with the existing audio owner and playback/seek controls; the polling preload and global-key capture code were not copied.

Port/adaptation date: 2026-09-30. Preserve the upstream copyright notices and
corresponding source under this repository's GPL-3.0-only license.

## Cuefield AutoMix transition planner/runtime

- Upstream: `SLYysl/cuefield-mineradio`
- Reference revision: `c16f05a0bc731a49da7d42c135337fcac58f6dba`
- License: GNU GPL v3 (`GPL-3.0`)
- Port refresh date: 2026-08-01

Mineradio integrates the upstream cache-only transition planner, structure and
boundary evidence, recipe routing, preparation de-duplication, bounded bridge
and source-loop helpers, and advanced B-deck timeline actions. The runtime is
adapted to Mineradio's modular script loader, provider-aware beat-map cache,
existing AudioContext ownership transfer, finite source fallback, and the
already approved album-gapless crossmix path.

AutoMix remains opt-in and stops while disabled, paused, manually seeking, or
when album-gapless owns the next deck. Unsupported WebAudio actions degrade to
the volume-only/equal-power path instead of blocking normal queue advance. The
upstream optional remote-feedback service, monolithic Mineradio UI, private
audio URLs, account credentials, and raw local beat-map data are not included
or transmitted; ratings remain in the current user's local data directory.

## Mineradio-LX-Music desktop/home reference

- Upstream: `ww085213/Mineradio-LX-Music`
- Initial reference revision: `82826df814c32853d99697c0ee60f749a2fcad79`
- Homepage refresh revision: `812e2dc2e18bbc263e61dbd0206cb765e003d6e9`
- License: GNU GPL v3 (`GPL-3.0-only`)
- Port dates: 2026-07-18 (initial), 2026-07-19 (homepage refresh)

Mineradio's full desktop mode adapts the upstream idea of moving the existing
Electron main-window HWND between the Windows WorkerW desktop layer and an
interactive top-level window. The native attach/detach code in this project was
rewritten around the optimized edition's fail-closed WorkerW discovery, DPI
conversion, structured acknowledgements, serialized lifecycle, and cleanup
requirements.

The home dashboard adapts the upstream information hierarchy (continue,
library, daily recommendations, recent playback, today's listening, next up,
discovery, and radio entry points). Its data adapters use this project's current
multi-provider discovery, playlist, search, playback queue, and listen-history
state. Upstream LX-only server routes and the legacy standalone wallpaper
overlay were not copied.

The 2026-07-19 refresh additionally adapts the three-song "For You" strip,
stable cover-image swaps, in-place quick-card updates, daily-review hover
feedback, and compact-height scrolling/settings behavior. These features remain
implemented against Mineradio's existing provider, weather-radio, local-library,
queue, and playback modules rather than the upstream LX/local-only data model.

The combined application remains distributed under the repository's GNU GPL v3
license. Preserve this notice and the corresponding source when redistributing
modified builds.

## Qishui Passport Web QR authentication

- Upstream: `Wx2yZx/Mineradio-Qishui-QR-Login`
- Reference revision: `aaadaab7d011714f94fbe45b382ba8dcc7cf17b9`
- Declared license: `GPL-3.0-only`
- Port date: 2026-07-30

Mineradio ports only the official Passport Web QR authentication boundary:
an isolated hidden Electron security host, the Qishui web signing bootstrap,
QR creation and polling, account-session cookie persistence, and the official
second-verification UI when the service requests it. The upstream whole-project
installer was not run, and no application files were wholesale replaced.

The QR bridge feeds the authenticated cookie into Mineradio's existing
`qishui-api.js` provider. Search, playlists, likes, comments, entitlement checks,
and audio playback remain Mineradio implementations. Legacy token/manual-cookie
login controls and local SodaMusic cookie discovery are not exposed by the
current login UI.

The web security runtime resources under `qishui-auth-v6/` are retained
byte-for-byte for protocol compatibility and remain the property of their
respective rights holders. They are loaded only inside the isolated authentication
partition for the user's own official login session.

## Qishui public SEO playback fallback

The public fallback approach follows the discussion in upstream
[Issue #452](https://github.com/XxHuberrr/Mineradio-paused/issues/452), not a merged PR.
Remix's adapter changes were implemented in commit `6e73285`: public metadata and
VOD requests do not send account cookies, and actual returned duration determines
trial status. No official-client `.node` or `.dll` signing bridge was added.
The fallback does not guarantee VIP full tracks or a permanent public API.

This attribution concerns those adapter changes only. The pre-existing
`qishui-audio-decryptor/` entered this repository in initialization commit
`345dbb2`; its separate provenance and redistribution terms, and those of the
retained `qishui-auth-v6/` Web resources, remain unverified. See the
[scoped audit](NEXT_PATH_AUDIT.md). Existing files have not been removed.

## Kugou client QR and personal cloudlist request reference

- Reference: [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi), GPL-3.0.
- Reviewed 2026-10-09: `module/login_qr_key.js`, `module/login_qr_check.js`, `module/user_playlist.js` and `util/request.js`.
- Remix implements the public client QR flow with Node HTTPS/crypto and its existing qrcode dependency; no upstream runtime or proprietary component is bundled. Personal cloudlist reads reuse the existing Android gateway transport. Actual authorization requires the user's confirmation in the official Kugou client.
