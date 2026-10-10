# Third-party ports

## Exact-target comment reply writes (2026-10-10)

- Netease: existing npm `NeteaseCloudMusicApi` 4.32.0, MIT; its installed `module/comment.js` supplies song `threadId` and exact `commentId` reply mapping. Its installed `util/crypto.js` supplies `weapi` encryption. Remix uses the existing bounded HTTP transport, matching the authenticated cookie's `__csrf`, rather than the package's unbounded transport. The original npm license remains bundled.
- QQ: [L-1124/QQMusicApi `comment.py`](https://github.com/L-1124/QQMusicApi/blob/27861e51432ea6b6e88dc35c4e8c8e239c0339e8/qqmusic_api/modules/comment.py#L261-L299) and [`versioning.py`](https://github.com/L-1124/QQMusicApi/blob/27861e51432ea6b6e88dc35c4e8c8e239c0339e8/qqmusic_api/core/versioning.py), GNU GPL v3. Independently written minimal `CommentWriteServer.AddComment` request mapping with `RepliedCmId` as the exact clicked comment. The existing QQ web/native transport retains the captured cookie and native comm fields; web CSRF derives from the music key. No Python runtime or additional dependency is bundled.
- Kugou: [MakcRe/KuGouMusicApi `_comment.js`](https://github.com/MakcRe/KuGouMusicApi/blob/ba3645f2c89e6b9d4fec82ff783c15287e4c5f43/module/_comment.js#L147-L191), [`comment_floor_send.js`](https://github.com/MakcRe/KuGouMusicApi/blob/ba3645f2c89e6b9d4fec82ff783c15287e4c5f43/module/comment_floor_send.js), and [`helper.js`](https://github.com/MakcRe/KuGouMusicApi/blob/ba3645f2c89e6b9d4fec82ff783c15287e4c5f43/util/helper.js#L158-L179). The current reference [LICENSE](https://github.com/MakcRe/KuGouMusicApi/blob/ba3645f2c89e6b9d4fec82ff783c15287e4c5f43/LICENSE) is MIT, Copyright (c) 2023 MakcRe. This is the license checked for the new reply mapping; the historical read-adapter attribution below describes its earlier review. Remix independently implements the minimal `commentsv2/reply` contract: `tid` stays the root, nested `pid` is the clicked target, top-level replies use `pid=0/is_t=1`. Its separate parameter-key contract is used without the default gateway signature. No upstream runtime or proprietary component is bundled.

The capability map distinguishes replies from top-level comment writing. Qishui
reply writes remain unsupported because no reviewed source established their
write path and exact-target fields. The 280-character limit is an application
limit, not a claim about platform maximums. Every write is sent once with a
9-second transport deadline. Timeouts and malformed acknowledgements remain
unknown outcomes; no automatic retries, challenge solving or re-login occurs.

Verification covered source inspection and isolated fake-account/mock transports.
No live comments, replies or login/logout actions were performed. Real-account
posting, moderation, anti-abuse challenges and platform acceptance remain
unverified. Redistributed source remains under this repository's GPL-3.0-only
license and preserves the existing third-party license material.

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

## QQ 音乐 App 扫码适配（2026-10-09）

- 来源：https://github.com/yakult-green-tea/qq-music-api ，npm `@yakult-green-tea/qq-music-api` 固定 3.1.3，MIT 许可；该项目源于 Rain120/qq-music-api，署名和许可证随 npm 包保留。
- 使用范围：desktop/qq-native-qr.js 延迟加载扫码、MQTT 与 HTTP 认证模块，不导入会启动 Koa 服务的包入口。库为社区兼容实现，并非腾讯提供的第三方官方 SDK。二维码使用 QQ 音乐 App 确认，实际歌曲权益仍由平台验证。

## 个人汽水本地签名桥（2026-10-09）

- 协议参考：https://github.com/sodahub-org/libresoda/blob/main/docs/FULL-QUALITY-STREAM.md 。本次独立编写桥接代码，没有导入 libresoda/libmssdk 的 AGPL 实现。
- 本机可选 SDK 来源：官方 https://www.qishui.com/ 指向的 SodaMusic-v2.1.0-official-win32_x64.exe；下载文件 Authenticode 验证有效，发布者 Douyin Vision Co., Ltd.。仅提取 bdms.node 与 metasecml.dll 到用户本机私有目录。官方二进制不属于社区开源许可，不随源码、npm 依赖或安装包分发。
- 桥接不启动官方播放器，只在隔离进程生成特定取流请求的 X-Helios/X-Medusa；使用本人已确认的会话和扫码设备标识，仍验证实际会员等级、流授权与试听时长。
