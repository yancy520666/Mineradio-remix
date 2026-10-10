# 四平台 / API 调用链独立复核（2026-10-09）

## 结论与证据边界

- 独立复核 QQ、网易云、酷狗、汽水的账号、会员、搜索、播放音质、歌词、评论 / 回复、封面、歌单与收藏链路。新增原代码缺陷 8 组（4 组 P1、4 组 P2），另捕获并修复 1 组 P2 集成回归；未发现有证据支持的 P0。已经授权的修复只处理生命周期、账号隔离、可用性与网络边界，保留原平台、默认音质、匹配和分页语义。
- 初始来源为 `451b6cf`；第一批固定提交 `5bc4f03` 的全套结果由主审保存为 [175 个测试文件基线](qa/FIRST_BATCH_5bc4f03_TESTS.txt)。本报告新增问题的 before 日志在第一批修复之后、对应局部修复之前采集，故不是声称每条缺陷都在同一冻结 SHA 上执行。
- 本组最终定向检查：48 个测试文件、353 个子测试通过，命令、HEAD 与输出在 [平台链路回归原始记录](qa/platform-api/platform-api-regression-2026-10-09.txt)。这是共享工作树的定向结果；最终冻结版全套结果由主审另行记录，不能用 353 代替全工程或真实平台验收。
- 全部新增运行证据使用真实代码片段 / 经典脚本 / provider 模块和假响应；唯一真实网络接收端是 loopback，唯一 Cookie 为人为 `fixture` 值。未读取维护者账号、真实曲库或 AppData，未向外网发账号 Cookie，未完成个人扫码，未调用官方专有签名组件。
- Spotify 已移除：现有 `/api/spotify/*` 返回 `PROVIDER_REMOVED`，残留适配文件仅列清理依赖。没有恢复平台支持。
- 官方接口成功率、实际会员权益、实际播放全长、Windows 官方登录窗口及长期后台播放均未实测。接口字段 / 错误码不明时不归咎于平台；以下已确认缺陷均分类为本地实现原因。

## 1. 平台 × 功能路由矩阵

前端缩写：S=`05-playback/07-search.js`，P=`05-playback/00-api-quality-output.js` 与 `11-provider-fallback.js`、`12`～`14` 播放模块，D=`05-playback/06-track-detail-lyrics-actions.js`，R=`05-playback/06a-comment-replies.js`，L=`06-lyrics` 歌单模块，A=`08-account/01`～`04` 账号模块。所有路径前缀为 `public/js/modules/`。下列 server 行号为本组收尾时的共享工作树快照；之后其他小补丁可能使行号移动，函数名 / 路由字符串为稳定定位符。

### 网易云

| 功能 | 本地路由 / server 定位 | provider / 上游调用 | 前端与审查结论 |
| --- | --- | --- | --- |
| 登录、退出、在线状态 | `/api/login/attempt` L5948；`/login/cookie` L6497；`/login/qr/key,create,check` L6573～6672；`/login/status` L6673；`/logout` L6681 | `NeteaseCloudMusicApi` 的 `login_status`、`user_account`；扫码 `login_qr_key/create/check`；候选 Cookie 验证后提交 | A：第一批 attempt / session generation 已修；本组新增普通状态 GET 的 renderer epoch 复核，二次掉线确认保持 |
| 会员、音质能力 | `fetchNeteaseLoginInfo` L4972；`enrichNeteaseLoginInfo` L4954；`getPlaybackLoginInfo` L5035 | `vip_info_v2` / `vip_info`，明确账号与权益字段 | A/P：网络未确认不直接认定普通会员；真实套餐及过期边界未联机 |
| 搜索及分类 / 用户歌单 | `/api/search,overview,type,user-playlists` L5479～5533；`fetchNeteaseSearch` L1539、typed L4009 | `cloudsearch`、`song_detail`；歌手 / 专辑 / 歌单 / 用户类型对应现有字段 | S：保留 limit / offset、跨平台匹配与排序；隔离分页及匹配回归 |
| 播放 URL、音质、换源 | `/api/song/url` L6467；`resolveNeteaseDirectSongUrl` L4642；`handleSongUrl` L4793 | `song_url_v1` → 兼容 `song_url`，URL 音频探测；无权限 / 试听交给既有换源策略 | P：检查元数据 / 指纹同曲匹配、会员音质限制、网络取消旧请求；实际 CDN / 全曲未验 |
| 歌词 / 翻译 / 逐字 | `/api/lyric`；`lyricBodyHasPrimary/Translation` | `lyric_new` → 需要时 legacy `lyric`；lrc / yrc / tlyric / ytlrc | `06-lyrics/00-fetch-parse.js` 与 D：已修可选翻译失败丢有效原文；不伪造翻译 |
| 评论、评论写入、点赞 | `/api/song/comments` L6940；`/song/comments/like` L6977 | GET `comment_new`；POST `comment`；`comment_like` | D：GET ownership/cache 回归；POST 登录等待、body 等待、上游等待均复验会话 |
| 楼中楼 | `/api/song/comment/replies` L6908 | `comment_floor`，cursor / parent ID | R：检查去重、cursor 前进、空页停止与失败保留，不提前假装到底 |
| 用户歌单 / 分页 | `/api/user/playlists` L6691；`/playlist/tracks` L7060；`fetchNeteasePlaylistTrackIndex` L2502 | `user_playlist`；`playlist_detail` trackIds → `song_detail`，既有 `playlist_track_all` 路径 | L：已修私有 track index 跨账号 / 旧请求回填；分页完整性回归 |
| 红心 / 歌单收藏 / 新建 / 加歌 | `/song/like/check,like` L6725/6744；`/playlist/subscribe` L6446；`/playlist/create,add-song` L6766/6788 | `netease-like-cache.js`：`likelist`；`like`；`playlist_subscribe/create/tracks/track_add` | D/L：likes 原有 cookie 快照独立安全；新增其他业务写会话 generation 检查；已发 POST 不重试 |
| 专辑 / 歌手 / 专辑收藏 | `/album/detail` L6378；`/album/subscribe,check` L6394/6415；`/artist/albums,detail` L7000/7012 | `album`；`album_sublist/subscribe`；`artist_album/detail/top_song` | D：专辑收藏 pending/cache 已按账号 epoch 隔离；读取分页预算保留 |
| 听歌提交 / 时长读取 | `/listen/report,total` L5250/5272；`handlePlatformListenReport` L5097 | `scrobble`；`listen_data_total` | 提交不是平台计时已验证；已修 body / 登录等待切账号及 journal 归属 |

### QQ 音乐

| 功能 | 本地路由 / server 定位 | provider / 上游调用 | 前端与审查结论 |
| --- | --- | --- | --- |
| 登录、状态、退出 | `/api/login/attempt`；`/api/qq/login/status,cookie,logout` L6127/6139/6175 | desktop App QR：QIMEI、GetSession、CreateQRCode、MQTT、Login、GetLoginUserInfo；网页登录 `fcg_get_profile_homepage` | A：第一批 QR attempt / 候选验证；本组状态 GET epoch；只读代码及 fake SDK，不做真实授权 |
| 会员 | `getQQLoginInfo` L3024；`qq-vip-api.js` | `SRFVipQueryV2` / V1，账号匹配、期限、来源交叉确认 | A/P：VIP 待同步 / stale 与普通区分；播放成功不证明订阅，现有 `applyQQPlaybackStatusEvidence` 不升级会员 |
| 搜索 / 分类 | `/api/qq/search` L5534；公共 `/search/type,overview` 的 provider=qq | `DoSearchForQQMusicMobile`；Smartbox → song detail 补全；typed artist / album Smartbox | S：歌曲 full search 保留分页；typed 原有无分页能力如实保留，不能捏造新 cursor |
| 播放 URL / 音质 | `/api/qq/song/url` L6091；`handleQQSongUrl` L4258 | native `UrlGetVkey` 或 web `CgiGetVkey`，quality filename 与 CDN 音频探测 | P：已回归超大账号 ID、comm / loginType、授权边界；真实 104003 的原因不凭猜测细分 |
| 歌词 | `/api/qq/lyric` L6112；`handleQQLyric` L4419 | `GetPlayLyricInfo` → `fcg_query_lyric_new`，base64 / entity 解码 | lyrics / D：读取函数与解析调用；无真实歌词源成功率宣称 |
| 评论 / 回复 | `/api/qq/song/comments` L6251；公共 replies | song MID → QQ numeric ID；GetNew / HotCommentList；GetReplyCommentList | D/R：纯读取接口，排序 / cursor / reply resource 映射回归 |
| 用户歌单 / 喜欢歌单 / 每日推荐 | `/api/qq/user/playlists,recommendations,playlist/tracks` L6182/6193/6203 | created / collected CGI；dirid=201 virtual liked；`CgiGetDiss`；每日30首现有固定歌单 | L：喜欢歌单 cover cache 已账号限定；不删喜欢入口、不改“每日30首”来源 |
| 专辑 / 歌手 | `/api/qq/album/detail,artist/detail` L6235/6218 | `GetAlbumList` 等现有 QQ 获取接口 | S/D：现有只读能力保留 |
| 红心写入 / 专辑收藏 / 评论写入 | 无活跃 QQ 写路由 | UI 按原能力显示只读说明 | 这是原产品支持范围，不认定为缺失导致的平台故障；没有恢复 / 新造接口 |

### 酷狗音乐

| 功能 | 本地路由 / server 定位 | provider / 上游调用 | 前端与审查结论 |
| --- | --- | --- | --- |
| 登录、状态、退出 | `/api/kugou/login/status,cookie,logout` L5967/5977/6002；desktop native QR | `login-user.kugou.com/v2/qrcode,get_userinfo_qrcode`；cookie/token 候选验证；`getKugouLoginInfo` | A：验证码 / 风控作为明确 challenge 终止正常回退；不绕过，不扩大 fake-IP |
| 会员 | `kugou-api.js` profile / role / gateway probes | `get_all_list`、web role info、现有有界 gateway 权益查询 | A/P：有效账号和明确套餐识别，错误 / 未确认不伪装普通；本组补状态 GET epoch |
| 搜索 / 推荐 | `/api/kugou/search,recommendations` L5548/5562 | song search / song_search_v2；`everyday_song_recommend` | S：账号范围缓存、分页参数、推荐来源保留；只有 fixture 成功 |
| URL / 音质 / 权益拒绝 | `/api/kugou/song/url` L5894 | H5 v5/url → web song info → mobile → Android gateway → 有界 web retry | P：试听保留、总预算、challenge 不继续绕路；既有 resilience 回归发现重复 destroy 递归并已修 |
| 歌词 | `/api/kugou/lyric` L5933 | krcs search → download，base64 LRC | lyrics / D：8MiB 是元数据 / 编码文本上限，不是音频大小限制 |
| 评论 / 回复 | `/api/kugou/song/comments` L5919；公共 replies | `kugou-community-api.js` cmtlist resource rank/new/top liked；hot_replylist offset | D/R：resource / hash、排序与递增 offset 有隔离回归 |
| 用户歌单 / 曲目分页 | `/api/kugou/user/playlists,playlist/tracks` L6009/6019 | v7/get_all_list；v4/get_list_all_file，既有 reverse / offset 映射 | L：真实合法大型列表未测；选8MiB通用元数据限额并允许调用 opts 覆盖 |
| 喜欢 / 添加到歌单 | `/api/kugou/song/like/check,like` L6033/6048；`/playlist/add-song` L6069 | favorite list 扫描；v6/add_song；v4/delete_songs 需当前账号 fileId | D/L：已修 fileId / favorite list 跨账号缓存与7个跨provider写路由之一；扫描不足不能确认负喜欢 |
| 专辑详情 / 收藏 | 当前无完整独立 API；UI 既有能力提示 | 不猜测新的私有协议 | 保持支持范围，未标为平台不可用 |

### 汽水音乐

| 功能 | 本地路由 / server 定位 | provider / 上游调用 | 前端与审查结论 |
| --- | --- | --- | --- |
| 扫码、状态、退出 | `/api/qishui/login/qrcode,check` L5572/5597；`/status,login/status` L5678；`/logout` L5688 | `qishui-qr-login.js` + `qishui-auth-v6.js` Passport web QR；官方 scan_login URL | A：现有 MFA 取消 / 晚回回归；原专有资源授权仍未核实，本组未运行组件 |
| 会员 / 登录与开放目录区分 | `getQishuiStatus`、PC me / library / membership | PC web session；明确账号权益字段；OpenAPI token 不是 PC 用户已登录证明 | A/P：stale / reauth / membershipKnown 保留；普通状态 GET 新增 epoch |
| 搜索 / feed | `/api/qishui/search,feed` L5701/5714 | `/luna/pc/search/track` → public / volcengine 目录 → 仅 offset=0 的既有 OAuth related media；feed song tab → library fallback | S：局部排序 / 公共目录 limit100 现有预算，未改分页或请求排序 |
| URL / 音质 / 试听 / 解密 | `/api/qishui/song/url` L5865；`fetchQishuiPlayerInfo` qishui-api L3395 | PC track_v2 → VOD model；SEO track / H5 公开回退；authorized tier；既有 optional local native signing bridge / decrypted audio proxy | P：VOD URL 复用原 SEO HTTPS exact host 策略，移除账号 Cookie；音质权限、试听标记与跨平台补全保留；实际签名 / VIP 全长未验证 |
| 歌词 | `/api/qishui/lyric` L5883 | metadata cache → SEO track → PC GET → public contents；timing → lrc / yrc | lyrics / D：分层来源、cache generation 及公共回退隔离回归 |
| 评论写 / 读 / 回复 | `/api/qishui/song/comments` L5841；公共 replies | PC comments、create；comments/{id}/replies cursor | D/R：读取 auth cache 和取消已回归；写入待body / 上游归属409，已发 POST 不取消或重放 |
| 用户歌单 / 曲目 / 喜欢列表 | `/api/qishui/user/playlists,playlist/tracks` L5725/5735；`/song/like/check` L5748 | PC user playlist、me collection mixed、recently played；playlist detail cursor；虚拟 liked/recent/feed | L：完整性与 cursor 保持；部分喜欢扫描的未知负结果不刷为未喜欢 |
| 喜欢 / 歌单收藏 / 加歌 / 专辑收藏 | `/song/like` L5760；`/playlist/collect,add-song` L5782/5802；`/album/collect` L5821 | collection media / delete；playlist / delete；album / delete；playlist/media/append | D/L：本组全5条业务写检查 Cookie+generation；红心 / 专辑 pending 仅当前 epoch 写UI |
| 听歌提交 | `/api/listen/report` provider=qishui | recently played，原语义不累计平台听歌时长 | 当前 snapshot 才可发；已经成功提交旧A仅在A journal 去重，并返回变更409，不写B成功状态 |

### 跨平台封面、头像与音频

| 链路 | 覆盖 | 结论 |
| --- | --- | --- |
| 图片 URL → coverProxySrc → `/api/cover` L7099 | `fetchPublicResource` / DNS、公网及重定向边界；cover-cache；封面 loader；评论头像 loader | 第一批有界body / 解码预算、共享取消 / retry、L1/L2 缓存回归；本组代码交叉阅读和相关测试复跑，不声称所有 CDN 已联机 |
| URL → `/api/audio` → audio-spill-relay | 通用 requestText / public request；下游关闭、上游超时；汽水 auth audio / decrypt cache | 第一批生命周期修复集成回归；资源agent另行处理 DJ beatmap，不重复改 |

## 2. 已复现问题与最小修复

分级按本地影响：P1=账号隔离 / 凭据边界，P2=功能可用性或有界资源问题。P3 静态疑点 / 未验证项在下一节，不混作确定缺陷。

### P1-01 业务写入会跨账号执行或把旧提交结果写成新会话成功

- 定位：server `capture/checkNeteaseAccountSession` L1466～1497；网易 album subscribe / playlist subscribe / create / add-song / comment / comment_like；酷狗 like / add-song；汽水 like / playlist collect / add-song / album collect / comment；listen report L5097、L5250。
- 复现：假A发起写入，阻塞 `requireLogin` 或 `readRequestBody`，切到假B Cookie，再解阻塞。旧网易6条路由12个 gate 全部发出B Cookie；酷狗2条 / 汽水5条14个 gate 存在相同出站归属或晚结果问题；listen 的 body / 登录等待 / 上游完成3个 gate 均失败。见 [网易 before](qa/platform-api/netease-write-baseline.txt)、[其他provider before](qa/platform-api/provider-write-baseline.txt)、[听歌 before](qa/platform-api/listen-session-baseline.txt)。
- 影响：用户在A页面点的收藏 / 写评论可能改B账号；旧结果污染B UI / journal。根因是 await 后读取全局 Cookie，没有路由入口所有权。
- 修复：入口捕获 Cookie+loginSessionGeneration；在等登录、读取body、发上游前与上游返回后核验；旧会话409。上游仅用捕获Cookie，已经发出的POST不重试。listen 已成功旧A提交仅记A journal，HTTP409同时如实保留 `platformSubmitted`。网易已有 song/like 的 cookie 快照独立读取确认，未广泛重构。
- 验证：新增 `netease-write-session-isolation`、`provider-write-session-isolation`、`listen-report-session-isolation`；相关 after 与48文件回归均通过。分类：实现原因，不是接口被平台拒绝。

### P1-02 酷狗喜欢歌曲 fileId / favorite list 缓存跨账号串用

- 定位：`kugou-api.js` clear L83；scoped key L2149；remember L2153；favorite list L2198；find fileId L2324。
- 复现：A=userid111/list211/file10111查询相同hash喜欢状态；清会话后B=userid222/list322/file10222取消喜欢。旧出站 delete_songs body 包含A的 `fileid:10111`，原始假响应 / 出站body见 [before](qa/platform-api/kugou-account-baseline.txt)。第二个case证明A晚回仍能重新填缓存。
- 影响：对B提交错误文件ID，收藏状态错误；clear本身不能防止旧promise回填。根因：hash全局key、clear遗漏list/fileMap、没有generation。
- 修复：auth fingerprint + listId + hash为key；favorite list同scope；clear递增generation并清两级状态，旧任务不能回填，fileMap限制4096。歌曲hash/原分页语义不变。
- 验证：`kugou-account-cache-isolation.test.js` 两条before失败、修后及既有resilience全部通过。分类：实现原因。

### P1-03 汽水 PC player-info URL 未验证且发送账号Cookie

- 定位：`qishui-api.js:3395 fetchQishuiPlayerInfo`。原 PC 路径只检查 http 字符串，和已有限定host的SEO路径不一致。
- 复现：假PC响应提供loopback player URL，旧函数把 `sessionid=fixture-only` 发到本地接收端；其他不可信host用假transport执行，不访问外网。见 [before](qa/platform-api/qishui-player-boundary-baseline.txt)。
- 影响：动态URL错误 / 受控时可越过预期凭据发送边界。根因：PC路径没有复用VOD来源校验，而且将全PC Cookie附到VOD。
- 修复：沿用现有SEO精确 `https://vod-luna.douyin.com`，拒绝userinfo、非443端口、其他host / 子域 / 协议；VOD无需PC账号Cookie，签名URL仍照常请求。异常为可诊断 `QISHUI_PLAYER_INFO_URL_REJECTED`。没有新增猜测域名或扩张fake-IP规则。
- 验证：unsafe URL拒绝、已知HTTPS VOD允许且无Cookie、原session / tier / SEO夹具38/38通过；后来48文件通过。原夹具 `media.example` 替换为原已知VOD fixture，不说明真实PC接口已经恢复。分类：实现原因；未知合法VOD来源需要另行确认。

### P1-04 网易私有歌单索引跨账号共享及旧请求复填

- 定位：server `invalidate/clear/fetchNeteasePlaylistTrackIndex` L2487～2538，`clearNeteaseLoginInfoCache` L5008。
- 复现：A私有playlistId的元数据 / trackIds写入后切B，相同id不再请求B而返回A；旧A任务晚回还能填缓存或删除B in-flight槽；歌曲变更invalidated后旧读也可复填。见 [before](qa/platform-api/netease-index-baseline.txt)。
- 影响：账号私有元数据越界、歌单曲目 / 后续详情错乱。根因：cache仅playlistId、清授权不清index、finally无promise身份。
- 修复：cookie scope + id key；捕获cookie和generation；授权变化clear+递增generation；写操作invalidates；仅当前任务可写缓存 / 删除自身slot。原trackIds分页 / song_detail策略不变。
- 验证：`netease-playlist-index-session.test.js` 三条before失败、修后相关39/39通过；最终定向通过。分类：实现原因。

### P2-01 有效网易原文被可选 legacy 翻译失败丢弃

- 定位：server `/api/lyric`、`lyricBodyHasPrimary/Translation` L6844附近。
- 复现：`lyric_new` 返回有效LRC或YRC但无翻译，legacy `lyric`抛离线异常；原路由500且丢原文。见 [before](qa/platform-api/provider-api-baseline.txt)。
- 根因 / 影响：可选增强请求的异常逃逸到主请求catch，歌词整体不可用。修复：有primary时保留原文、独立catch翻译回退；无primary且必需请求失败仍500。成功合并旧翻译保持。
- 验证：`lyric-fallback-availability.test.js` 原文 / karaoke保留、主失败、成功合并三case通过。分类：实现原因，不能因此认定网易歌词接口坏了。

### P2-02 酷狗 / 汽水专用 metadata transport 无body上限并忽略signal

- 定位：`kugou-api.js:103 requestText`，`qishui-api.js:193/229 requestText/WithMeta`。
- 复现：假2xx声明 / 流式超额JSON持续buffer；已abort signal仍继续请求；见 [before](qa/platform-api/provider-api-baseline.txt)。原wrapper已有总deadline / response error / aborted监听，未把这些误报为不存在。
- 根因 / 影响：专用wrapper未集成公共requestText第一批资源边界；过大metadata与旧请求占用资源。用途统计为profile/search/library/comment、编码歌词、video model等文本，不是音频文件。
- 修复：默认8MiB并允许opts.maxBytes覆写；成功声明长度与流式均检查；非2xx保留有界 `error.body`，汽水保留headers，不损失风控challenge；signal和deadline共用one-shot完成。另在既有Kugou resilience fake destroy(error)发现fail重入，修为先settle后destroy、入口忽略已settled，汽水同修。
- 验证：`provider-network-bounds.test.js`声明 / stream超限、403body、abort、truncated/deadline及1MiB合法metadata；旧resilience回归通过。实际大曲库是否超过8MiB未联机，未削减分页功能。分类：实现原因。

### P2-03 红心 / 专辑收藏缓存和pending操作没有账号epoch所有权

- 定位：`06-track-detail-lyrics-actions.js` snapshot L38、专辑read/write L177/198、likes bulk L1741、write L1825。
- 复现：A喜欢GET/POST或专辑查询挂起，退出 / 切B；旧结果覆盖provider:id map，旧busy阻塞B或finally清Bbusy。见 [before](qa/platform-api/account-epoch-baseline.txt)。
- 修复：已有providerAuthEpoch+账号ID+loggedIn快照；仅当前快照可写UI；busy记录owner对象、finally只清自己；auth event只清该provider红心/专辑状态，不清其他平台、不取消已发POST。与评论auth event共存。
- 验证：`account-action-epoch.test.js`3case，旧评论和平台能力回归均通过。分类：实现原因。

### P2-04 普通登录状态刷新晚回可复活旧账号或降级新账号

- 定位：`08-account/02-login-status.js` refresh 网易L118、QQ L225、酷狗L368、汽水L458、网易presence L615。
- 复现：旧状态GET挂起，新扫码attempt已递增providerAuthEpoch但还没替换status对象，旧成功仍回写；旧失败降级B。网易同userid重新登录后presence旧回写。真实经典模块9case中8条before失败，酷狗已有对象身份检查挡住了B对象替换那一条。见 [before](qa/platform-api/login-status-epoch-baseline.txt)。
- 修复：所有四平台状态读成功和catch都核对已有epoch；保留酷狗对象身份检查；presence同时核对epoch和userID。不改会员规则、QR提交、二次掉线确认或Spotify。
- 验证：新增9case全部通过，与旧presence / write isolation41/41；最终定向353通过。分类：实现原因。

### P2-05（并入 P2-02 的独立集成复现）error destroy 重入导致无限错误递归

- 定位：Kugou `requestText fail`、Qishui `requestTextWithMeta fail`。修限额最初版本在既有resilience夹具的request.destroy → nextTick error → fail → destroy循环中超时。
- 影响 / 根因：错误终止未先检查并设置settled，不是上游接口失败；不能仅改夹具掩盖生产重复destroy。
- 修复与验证：fail入口忽略settled并先finish再destroy；保留真实错误监听。`kugou-api-resilience.test.js`及provider bounds全部通过。本条属本轮修复中捕获的集成回归，不说成451b6cf已存在的缺陷。

## 3. 未验证项与平台 / 网络 / 实现原因分界

| 项目 | 证据状态 | 处理 |
| --- | --- | --- |
| QQ / 酷狗 App实际扫码确认、真实会员与云歌单、播放权益 | fake SDK / HTTP fixture通过；本组无真账号 | 不能宣称官方登录成功；保留实际授权验收 |
| 汽水PC全曲 / VOD / optional native signing、扫码MFA实际挑战 | 无真实官方网络或专有组件调用 | 未改善 / 绕过签名，不把SEO试听认定为可恢复完整权限；来源授权待维护者核实 |
| QishuiAuthRuntime initialize 与 clear 并发 | 全文件阅读看到initialize多个await无clear代次核对；现有MFA测试只覆盖已进入验证后的取消 | 仅静态疑点，未复现；不改已停止安全分支，不与已验证MFA修复混同 |
| 歌单目录读取跨账号所有权 | 播放agent交叉线索及本组定向阅读：`01-playlist-panel-shell.js:564 loadPlaylistCatalogProviderPage` 只核对root.token和loggedIn，force刷新在loading不足1200ms可复用root；logout只有epoch失效，未见目录root代次刷新 | 尚未隔离复现；A读挂起→退出/重登B→旧A列表可能提交。移交主审复现；不能宣称本组已确认歌单目录前端跨账号安全 |
| `qishui-auth-v6/` / decryptor分发授权 | CLAUDE及handoff明确未核实 | 本组只报告，未删除、引入或声称合规 |
| 大型真实歌单 / 非JSON错误页的8MiB边界 | 合法1MiB metadata和超限fixture通过，真实最大值未知 | 可通过opts.maxBytes针对已确认用途调整；当前保留原分页，不以限制条数掩盖问题 |
| 20017 / 104003等实际上游拒绝 | 本组只读源码和既有handoff，没有当次外网响应 | 未判成单一版权、会员、风控或本机网络原因；诊断保留原始状态 / challenge |
| Windows客户端窗口、CDN长暂停 / 过期重取、真实长时间播放 | 当前Linux隔离测试未覆盖 | 交由Windows / 用户体验验收；UI视觉和手感最终由维护者确认 |

## 4. 逐文件实际覆盖 ledger

“阅读”指本组实际读取对应源码，“扫描”指仅依赖 / 域名 / 调用 / 测试定位，不冒充整文件审查；“实跑”仅指隔离fake VM / loopback /已有测试复跑。所有文件真实平台状态均为未验。全工程主索引、每路由前端位置和依赖图见 [inventory](QA_INVENTORY_2026-10-09.json)、[调用行号CSV](QA_CALL_SITES_2026-10-09.csv)、[主覆盖矩阵](QA_COVERAGE_MATRIX_2026-10-09.md)。

| 文件 | 本组阅读 / 扫描范围 | 隔离实跑与边界 |
| --- | --- | --- |
| `server.js` | 四平台登录/会员/搜索/URL/歌词/评论回复/album/artist/playlist/listen所有功能段逐段阅读；共享audio/cover只交叉阅读。未声称全server安全、天气或DJ完整审计 | route/helper VM：write/session、lyric、playlist index、listen、QQ/NCM URL、search、分页；audio/comment/cover集成回归；readRequestBody和DJ其他agent |
| `kugou-api.js` | transport、auth、membership、fallback、search、metadata、library、favorite读写函数分段阅读；协议常量未逐项官方核验 | fullmodule假HTTPS；出站fileId证据、body/abort/error、VIP/resilience/challenge；无真实gateway |
| `qishui-api.js` | transport/cache、OAuth、status/entitlement、quality/model、SEO/PC play、search/feed/library、collection/comment/replies/lyric分段阅读 | fullmodule假transport、loopback假Cookie；VOD边界、tier、cache generation、session、SEO/decrypt预算；native signer未运行 |
| `qq-vip-api.js` | 所有会员解析 / 来源与账号匹配 / 到期 / stale / quorum函数阅读 | qq-vip-entitlement假response，不是真实VIP状态 |
| `netease-like-cache.js` | 全文阅读、scope/pending/override/reset检查 | 既有完整fake缓存测试、账号写链交叉；原实现scope安全 |
| `comment-list-api.js` | 全文阅读：QQ ID和hot/new映射 | song-comments分页回归 |
| `comment-replies-api.js` | 全文阅读：平台dispatch、cursor/offset、resource | comment-replies假接口回归 |
| `kugou-community-api.js` | 全文阅读：社区request和challenge | community/verification fake网络回归 |
| `qishui-auth-v6.js` | 全文读取runtime、assetserver、Passport、QR/MFA/clear；专有打包asset仅来源/依赖扫描 | 既有passport/MFA fakeWindow，不初始化真实组件；init/clear静态疑点未实跑 |
| `qishui-qr-login.js` | 全文读取配置、encrypted store、generation、confirmed/clear | passport QR假auth模块、临时配置 |
| `cookie-storage.js` | encryption/candidate存储调用与第一批文档扫描；不是本组全文独立审计 | login相关测试交叉，全文归主审/登录agent |
| `music-dns.js` | provider network调用/域名和第一批文档扫描 | network-compatibility回归，真实DNS未查 |
| `server-security.js` | 已有公共/VOD URL策略及调用交叉阅读；未扩张fake-IP名单 | network兼容/URL边界间接回归；全安全审计归其他agent且其范围有停止边界 |
| `audio-spill-relay.js` | 第一批patch与资源归属调用扫描 | audio/播放网络ownership交叉；全生命周期主审/资源agent |
| `cover-cache.js` | 第一批限额、缓存key/清理调用交叉扫描 | cover-cache/proxy/retry定向实跑，主审图片agent负责全文 |
| `generated-cache-pruner.js` | 主inventory require图 / 使用位置扫描 | 本组未新增实跑；资源agent覆盖 |
| `dj-analyzer.js` | inventory dependency / listen边界扫描 | 本组未改；DJ取消/并发资源agent |
| `spotify-api.js` | token清理依赖 / removed-route扫描 | 不执行活跃平台或恢复功能 |
| `desktop/qq-login-page.js` | 全文：host校验、DOM ready、轮询/closed清理 | qq-login-page fakeWebContents |
| `desktop/qq-native-qr.js` | 全文：每次独立SDK、exactcredential、generation、poll/stop | client-qr-login假service与取消/晚回，没生成真授权 |
| `desktop/qq-native-protocol.js` | 全文：bootstrap、comm、大整数、per-runtime adapter | qq-native-protocol纯算法/假HTTP；协议常量未在官方验证 |
| `desktop/kugou-native-qr.js` | 全文：request deadline/256KiB、challenge、QRgeneration/stop | kugou-native-qr假request，真实QR未验 |
| `desktop/kugou-verification.js` | challenge解析与调用位置阅读 / 模式扫描 | verification/flow fakeWindow；不解决CAPTCHA |
| `desktop/qishui-native-signing.js`、`desktop/qishui-sign-worker.js` | 现有桥接/worker全文读取，来源与分发边界保留 | 不调用native签名；只静态归属，不能称可用 |
| `05-playback/00-api-quality-output.js` | API包装、quality caps和epoch调用段阅读，其余控制UI扫描 | provider capability / network ownership相关回归；不是全文视觉验收 |
| `05-playback/06-track-detail-lyrics-actions.js` | 平台能力、likes、album收藏、comments ownership/auth/cache与artist/album加载段阅读；自定义歌词编辑仅扫描 | 全经典module fakeVM测试，账号cache/write回归；自定义编辑未在本组专项实跑 |
| `05-playback/06a-comment-replies.js` | 全文：UIbinding、owner、cursor/offset去重和失败保留 | reply fixture回归；不代表真实汽水账号回复 |
| `05-playback/06b-comment-avatars.js` | 全文：image budget、observer、cancel、retry/online、pagehide | comment-avatar-loader假Image；真实CDN未验 |
| `05-playback/07-search.js` | provider search调用、classification/offset/cache、artist/album/profile入口定向阅读，其余DOM/keyboard扫描 | 原paging、match、typed与provider回归；交互完整覆盖归UIagent |
| `05-playback/11-provider-fallback.js`、`12`～`14` | URL链/换源/质量/音频ownership关键调用与已有patch扫描、定向函数阅读 | playback-network-ownership、现有来源/试听回归；全文由播放agent |
| `06-lyrics/00-lyrics-fetch-parse.js` | 各provider lyric fetch、prefetch、cache、translation来源段阅读 | lyric路由fake上游；后半歌词绘制由资源/视觉agent |
| `06-lyrics/00-built-in-playlists.js`、`01-playlist-panel-shell.js`、`02-playlist-detail.js` | 平台歌单ID/分发/收藏写调用段阅读，其余持久化/DOM扫描 | playlist-paging、provider write交叉；全持久化归播放歌单agent |
| `08-account/01-login-modal-utils.js` | provider状态/能力和panel routing函数阅读，余下DOM扫描 | 多项现有登录classic VM；UIagent同文件有独立patch |
| `08-account/02-login-status.js` | 全文：normalize、membership audit、refresh、presence、render | 新epoch9case+旧掉线二次确认；四平台fakeAPI |
| `08-account/03-login-modal-flows.js` | attempt / epoch / QR provider / confirm/stop接口函数定向阅读，余下UI扫描 | login-attempt-contract、inline/QR/client fixtures；第一批登录agent深审 |
| `08-account/04-user-modal-logout.js` | individual / clearAll授权失效与状态清理段阅读，模式UI扫描 | login-logout-race、provider recovery；不操作真实session |
| 封面loader / cover-custom-map模块 | coverProxySrc / URL / image lifecycle关键调用扫描，图片预算文档交叉 | cover-load-retry、proxy、avatar与cache回归；全视觉源文件不归本组 |

## 5. 复现与复核方式

新增10个测试文件均使用现有 `node --test` 机制，无额外网络账号依赖：

```
node --test tests/account-action-epoch.test.js tests/kugou-account-cache-isolation.test.js \
  tests/listen-report-session-isolation.test.js tests/login-status-refresh-epoch.test.js \
  tests/lyric-fallback-availability.test.js tests/netease-playlist-index-session.test.js \
  tests/netease-write-session-isolation.test.js tests/provider-network-bounds.test.js \
  tests/provider-write-session-isolation.test.js tests/qishui-player-info-boundary.test.js
```

完整48文件命令已保存到平台链路回归日志头部。before日志保留原失败断言 / 人造账号出站body；其中Kugou fileId与Qishui loopback Cookie是真实代码产生的假凭据证据，不是对维护者账号的操作。修复使用局部patch，没有整文件重写server，没有变更官方接口签名、默认音质、匹配或分页能力。README/下一版本说明与最终Git冻结由主审统一。
