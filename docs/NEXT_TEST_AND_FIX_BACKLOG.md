# 下一轮定向测试与修复清单

更新：2026-10-02；源码核对基线 `706188f`。整合用户提供的建议与现有专项检查，本次只整理计划，不代表以下待办已经执行或缺陷已经修复。

状态说明：**已覆盖**仅指列明的子场景；**有缺口**包含缺少测试证据，不能直接视作业务 bug；**不适用**指建议需要调整。存在普通测试不等于已通过变异验证。上一轮选定的 31 个变异及结果见 [关键路径审查](CRITICAL_PATH_AUDIT.md)，不重复执行其中已验证且代码未改变的条件。

## 执行原则

- 先读测试、实现和调用链，核对歌曲身份、取消、状态迁移、配置兼容与正常路径；每批只处理一个相关问题。
- 怀疑业务 bug 时先用正常需求写出失败案例；仅缺测试时，让故意改错的隔离副本失败即可，不改正确的生产代码。
- 变异要合法、可达且有业务含义；超时、缺依赖、语法错误和测试环境故障不算检出。存活项要补行为断言，或给出等价／不可达证据，不能强改实现来消灭变异。
- 不把按钮几何、文案、字体观感或流畅度纳入变异测试。软件体验由用户验收；生命周期、数据正确性与资源计数可自动检查。
- 使用假账号、模拟接口、隔离目录／窗口，不改真实账号、原版配置、曲库或运行中的播放器。一次通过后不无故扩大回归范围。
- 不引入官方客户端的专有签名二进制；来源或分发权限存疑时先记录报告，不自行删除现有内容。
- 验证记录写明：状态、改动、测试名、正常结果、变异及存活原因、未验证范围。源码修改分批审查并同步 Git；安装包、Draft 和 Release 继续等待用户后续授权。

## 需要纠正的建议

1. **更新主机**：Release 元数据来源应固定本仓库，但不能禁止所有跨主机重定向。GitHub 资产交付可能使用其他下载主机；先核对实际 GitHub/CDN/已配置镜像链，再测试 HTTPS、跳转次数、凭据不跨域及产物校验。镜像与元数据的哈希不能代替代码签名，也不能证明发布者身份。不要从不可信输入设置更新源。
2. **更新哈希**：目前校验在 `electron-updater`／`builder-util-runtime` 依赖中，不能假装删除本项目的一个哈希比较就完成验证。用本地隔离下载服务验证真实依赖拒绝损坏／截断内容，并另测本项目状态机；不修改或提交 `node_modules`。
3. **退出登录**：阻止旧缓存自动复活账号，清理 Remix 管理的凭据；不能据此删除只读导入源中的原版账号。用户主动再次确认导入属于另一项操作，不能与静默恢复混为一谈。检查点本来就不应保存账号凭据。
4. **代理白名单**：当前音乐域名列表用于 fake-IP 特例，不是所有音频／封面的全局白名单。不能未经产品判断把所有其他公共 CDN 禁掉。保留通用公网地址校验，定向验证特例不能放宽私网边界。
5. **安装包二进制**：Electron 本身需要 DLL，可信依赖也可能需要原生模块；不能禁止全部 `.dll`、`.node` 或 `.asar`。检查来源、许可证、预期依赖与清单，明确禁止加入官方汽水客户端的 `bdms.node`／`metasecml.dll` 等专有签名文件。
6. **包格式与静态规则**：正式版 `package.json` 当前 `asar:false`，内测配置 `asar:true`；分别检查 `resources/app` 文件树或 asar 内容。`alert/confirm/eval/new Function/shell:true` 和文档盘符只作审查候选，不按 grep 命中自动删除或失败。外部页面、测试夹具和业务代码分别判断。
7. **试听文案**：公开回退不保证 VIP 全曲，片段长度按服务器返回；不能写成所有播放路径下所有 VIP 歌永远只能试听。官方 PC 成功路径仍保留。约 20 首真实样本是可选扩大验证，不是每次改动的固定成本。

## P1：先处理数据与更新

| 原清单编号 | 状态与现有证据 | 新增或保留的定向待办 |
| --- | --- | --- |
| 1 卸载 | **部分已覆盖／有缺口**：`tests/installer-cleanup.test.js` 编译运行实际 NSIS 清理函数，检查程序资源删除、相邻文件及安装目录内用户文件保留；`build/installer.nsh` 校验目录名与安装标记。 | 补相似前缀目录、错误标记／无标记、盘根、原版配置和外部曲库保留；隔离的 junction／符号链接测试。确认 NSIS 的链接处理再决定是否需要修复，不能假设递归删除一定跟随或一定不跟随。变异真正的目录与归属检查，而不是猜一个不存在的“跳过原版”条件。编译器缺失必须记为未验证。 |
| 2 更新 | **部分已覆盖／有缺口**：`desktop/remix-updater.js` 与 `desktop/main.js` 的 Remix 更新 IPC；`tests/remix-updater.test.js` 覆盖用户确认、错误、未就绪拒绝安装。 | 优先补真实依赖下载完整／损坏／截断数据的集成测试、版本降级、过期下载事件、并发检查／下载、可信 IPC。区分 Remix 安装版更新与已有外部下载页流程，不能只看后者测试。源／重定向规则采用上面的修正。 |
| 3 账号 | **部分已覆盖／有缺口**：`tests/cookie-storage.test.js`、`tests/credential-migration-lifecycle.test.js` 覆盖加密失败保留旧文件、拒绝弱加密后端和退出后旧缓存不复活。 | 对失败后不覆写、不明文回退、登出迁移标记做少量变异；再查各平台缓存／异步登录结果能否恢复已退出账号。用假凭据捕获输出验证 Cookie/token/Authorization 不进日志，包括错误对象；不打印真实秘密。 |
| 4 本地曲库 | **部分已覆盖／明确测试缺口**：`tests/local-library-offline-relink.test.js`、`tests/local-music-library-persistence.test.js` 覆盖离线保留、指纹关联、重载和协议读写；`tests/local-playback-skip-notice.test.js` 的离线队列仅两首。 | **优先补“连续几十首离线＋一首可播放”与“全部离线终止”**。`13-playback-start-audio.js` 中 `skipUnavailableLocalQueueSong` 对离线项也递增计数，达到 `min(queue.length,12)` 停止；需顺着实际入队与刷新链验证，不直接删除防死循环上限。区分已知离线扫描与真实播放失败额度。补过期 localUrl/mediaToken 重解析、指纹相同异路径、同名异内容与插拔恢复。 |
| 5 原版导入 | **核心已覆盖／输入边界有缺口**：`tests/original-profile-import.test.js` 与上一轮四个变异覆盖保留源、已有账号／设置／视觉选择和敏感字段过滤；`06-original-profile-import.js` 在确认按钮后调用导入。 | 不重跑保留条件；补主 frame/IPC 与用户确认链、异常类型／嵌套危险键／超长值／未知 schema。`__proto__`、`constructor` 测试要覆盖实际合并消费者，不能把 JSON 能包含某个键直接判定为污染。保留用户已指定不导入播放／搜索历史的范围。 |
| 6 汽水资源来源 | **有缺口，先报告**：`qishui-audio-decryptor/` 当前三个 JS 文件，`server.js` 实际导入，两个打包配置均包含该目录；本次 `git ls-files` 未列出受跟踪 `.node/.dll/.asar`。 | 核对提交历史、源项目、许可证、用途和归属记录；现有 NOTICE／移植记录未明确交代此目录。顺带审查 `qishui-auth-v6/` 保留的第三方 Web 安全资源，已有说明不等于分发授权证据。没有构建新包，不能据源码列表断言现有安装包完全合规；不自动删或补写未经核实的来源。 |

## P2：补安全边界，不重复已验证条件

| 原编号 | 状态与证据 | 定向待办 |
| --- | --- | --- |
| 7 SSRF | **混合地址／跳转校验已覆盖；其他子项补查**：`tests/server-security.test.js`、`tests/music-dns.test.js` 与上一轮安全变异。 | IP 另类写法／IPv6、超大或无限响应、异常 Range、重定向循环、取消。先核对媒体流与封面缓冲各自预算，不能给大歌曲套封面大小限制。 |
| 8 DoH | **大部分已覆盖**：`tests/music-dns.test.js` 有禁用开关、危险解析、TTL、并发合并、CNAME 与失败重试；已做 TTL／域名后缀变异。 | 仅查高并发不同域名时总量是否有界、挂起解析和禁用后的失败行为是否还有未覆盖分支。没有全局并发上限不自动等于漏洞，结合调用并发与期限判断。 |
| 9 本地协议 | **正常协议与能力令牌已有检查／负向缺口待补**：`desktop/local-music-library.js` 的 `recordForRequest` 以记录 ID 和 cap 取文件；`tests/local-music-library-persistence.test.js`。 | 缺失／伪造 cap、旧 token、异常 URL、路径编码和 Range。记录路径被替换成链接时是否越过授权范围；已由用户选择的库外文件不能一概禁用，先明确用户授权文件与任意请求输入的区别。 |
| 10 摄像头 | **代码检查已有／行为验证有缺口**：`tests/gesture-camera-permission.test.js` 主要正则检查；实现位于 `desktop/main.js` 的 `isTrustedGestureCameraMediaPermission`。 | 执行实际判定函数：音频、混合音视频、子 frame、其他窗口、远程 origin、授权过期必须拒绝；可信摄像头路径通过。实体设备情况交给手动验收。 |
| 11 原型污染 | **有缺口**：导入／歌单已有合法数据测试；相关模块 `desktop/original-profile-import.js`、`desktop/built-in-playlist-library.js`、前端导入消费者。 | 假 JSON 的危险键、嵌套对象、类型、长度，断言 `Object.prototype` 与后续配置不变；与第 5 项合并执行，避免两套重复测试。 |
| 12 CI | **权限与草稿门控已存在／加固可补**：`.github/workflows/ci.yml` 是 `contents:read`；`release-windows.yml` 是 `contents:write`，只由 tag push 或手动触发，产物发布 `draft:true`；手动 `prepare_draft` 默认 false。 | 核对写权限最小作用域、构建 checkout 持有的令牌、非可信代码与发布凭据分离；Action 从可移动版本标签固定为核实过的完整提交 SHA。普通 main push／PR 不发布；tag push 自动创建草稿是既有设计，不直接取消。保护私密文件不进入 artifact。 |

## P3–P5：播放集成与生命周期

| 原编号 | 状态与证据 | 定向待办 |
| --- | --- | --- |
| 13 公开回退不带账号 | **API 侧已覆盖／代理侧补查**：`tests/qishui-seo-playback.test.js` 与 `qishui-public-cookie` 变异。 | 只补实际音频代理头部与跨域重定向；禁止账号 Cookie/Authorization，不能去掉维持合法 Range 等必要头部。 |
| 14 试听时长 | **基本已覆盖／短歌边界待查**：同上测试覆盖误导性 preview、全曲与 60 秒片段；`qishui-trial-direction` 已检出。 | 增加短歌、30 秒片段、容差边界、未知／异常 duration；断言实际长度而非固定“30 秒”。 |
| 15 地址到期 | **通用换址恢复已有／汽水串联待查**：`tests/playback-start-stall.test.js`、`tests/qishui-session-recovery.test.js`。 | 长暂停／重启时旧签名地址失效，重新解析后正确恢复当前歌曲与合法进度；不重复实现另一套恢复调度。 |
| 16 空响应等 | **多数已覆盖**：`tests/qishui-seo-playback.test.js`、`tests/qishui-session-recovery.test.js` 覆盖空 PC 响应、错误身份／目标、失败重试及墙钟期限。 | 只补未覆盖的代理跳转与极端字段；先确认代码是否真的有熔断和关闭开关，不为对齐清单凭空新加功能。 |
| 17 试听集成 | **有缺口待查**：试听标识和检查点分别有测试，未据此证明组合行为。 | 试听结束→正常下一首、进度上限、AutoMix 交接、重启恢复；不占失败歌曲额度，不把免费全曲误标试听。 |
| 18 Range／断流 | **通用协议已有／集成补查**：本地协议和代理已有 Range 用例，播放恢复已有模拟测试。 | 汽水回退音频拖动、半途断流、旧错误晚到；模拟资源不拿真实平台稳定性作自动测试前提。 |
| 19 网络隔离 | **现有夹具已使用**：上述汽水测试模拟请求；真实账号记录另见 `QISHUI_PLAYBACK_VALIDATION.md`。 | 新测试明确禁止外网与真实账号；真实歌曲少量针对性抽样，需要扩大才追加，结果与自动测试分开记录。 |
| 20 其他平台会员 | **已有专项／变异待做**：`tests/qq-vip-entitlement.test.js`、`tests/kugou-vip-hardening.test.js`、`tests/spotify-api-resilience.test.js`。 | 过期／缺字段／未知账号不得授权付费音质。按各平台语义设夹具，Spotify 不照搬网易云 VIP/SVIP 枚举。 |
| 21 系统媒体会话 | **部分已覆盖**：`tests/system-media-session.test.js` 测动作幂等、音频 owner 交接和进度。 | 切歌旧元数据、空／失败封面、退出清理、旧事件不能更新新歌曲。系统面板与实体键体验手动验收。 |
| 22 封面 | **加载器已覆盖／卡片身份补查**：`tests/playlist-cover-loader.test.js` 测去重、四并发、优先级和有界重试；已有 Electron 歌单测试。 | 旧封面请求在卡片复用／面板关闭后返回，不更新错误卡片；优先补消费者身份断言而非重复测四并发。 |
| 23 后台／特效 | **已有专项／资源计数补查**：`tests/main-window-runtime-recovery.test.js`、`tests/background-window-state-recovery.test.js`、`tests/playback-audio-graph-recovery.test.js` 及歌词／视觉专项。 | 重复唤醒／切特效前后监听器、RAF、连接／计时器计数有界，旧任务不能复活已停效果。透明问题触发仍需用户体验反馈，不宣称假音频测试能覆盖 GPU 合成异常。 |
| 24 切歌竞态 | **旧歌曲恢复／暂停竞态已覆盖**：上一轮六个播放变异；另有 `tests/playback-source-fallback-transaction.test.js`。 | 只补晚到音源响应与 AutoMix 共用 owner 的差异；休眠可模拟事件，真实系统休眠／音频设备拔插仍属手动或隔离实机检查。 |
| 25 AutoMix／行距 | **已有专项／AutoMix 连续链需核对**：`tests/cuefield-transition-runtime.test.js`、`tests/cuefield-mineradio-integration.test.js`、`tests/cuefield-electron-smoke.js`；`tests/lyric-edit-preview.test.js`、`tests/lyric-spacing-stability.test.js` 与歌词预览验证文档。 | 对照上游 #464 连续三首及以上交接，关注 AudioContext owner／断开重连；不重复视觉间距观感检查。#482 的字段读写与预览／最终布局差异只查未覆盖部分。 |

## P6–P8：发布前检查与文档

| 原编号 | 状态与证据 | 定向待办 |
| --- | --- | --- |
| 26 持久化 | **检查点已有深入覆盖／其他文件补查**：`tests/playback-checkpoint.test.js` 与六个变异；本地库及歌单已有持久化专项。 | 聚焦设置／索引／歌单迁移：截断、空文件、未知版本、磁盘满、权限错误、中文空格路径、失败不覆盖有效旧数据。复用原子写入策略，避免无需求改保存频率。 |
| 27 安装包内容 | **静态配置有缺口，构建暂不执行**：正式配置 `package.json` 与 `electron-builder.internal-beta.json` 不一致。内测清单未显式包含正式版新增的 `server-security.js`、`music-dns.js`、`cookie-storage.js`、汽水登录桥及资源。 | **优先核对内测配置实际合并／匹配结果与运行依赖闭包**，确认是否导致缺文件再修。包内容采用白名单／来源核对，检查秘密、测试数据、个人路径和汽水资源；按上面的 asar／DLL 修正执行，不因文件扩展名删除运行依赖。 |
| 28 安装包冒烟 | **已有脚本与工作流／下包时再验证**：`scripts/verify-windows-installer.ps1`，发布工作流调用安装、升级、重启与卸载。 | 核对脚本实际覆盖内容，登录／完整播放不因流程名称而视为已测。下次用户授权构建后使用新安装包与隔离配置；本轮不生成包或重测真实账号。 |
| grep 静态规则 | **基础已执行／候选规则可扩展**：`scripts/audit-critical-grep.js`。 | 增加 Authorization 日志、生产窗口的 nodeIntegration/webSecurity、命令执行与删除入口、危险动态执行候选；区分生产窗口与测试窗口。重复监听器用生命周期计数验证，grep 只能定位。路径与二进制另作人工来源审查。 |
| 29 README | **主要限制已写／可补精度**：README 及 `RELEASE_NOTES_NEXT.md` 已说明公开回退不保证 VIP 全曲、按实际音频时长识别试听。 | 补“片段长度按服务器返回、非公开稳定 API 可能变化”的说明；不写死试听秒数，也不把公共回退限制推广为 PC 成功路径限制。 |
| 30 归属 | **验证文档已有引用／NOTICE 有缺口**：`QISHUI_PLAYBACK_VALIDATION.md` 引用上游 #452；NOTICE／移植记录没有明确列出本次 SEO 回退思路。 | 核对提交历史后补思路来源、改动范围和自有实现；与第 6 项分开记录，不能将整个汽水模块统称为自有代码或凭空推定许可证。 |
| 31 文档路径 | **按需调整**：验证文档包含历史本机证据与复跑说明。 | 新增共享文档用相对仓库链接和 `%APPDATA%`／临时目录占位；修真实个人路径暴露与不可移植复跑命令，保留说明 D 盘回退或文件格式的合法示例，不全库替换盘符。 |

## 顺序与手动验收

先做：卸载路径与链接边界 → 更新真实校验／状态 → 账号退出 → 长离线队列 → 导入异常输入。资源来源报告和内测打包配置核对可提前进行只读审查。之后补摄像头／本地协议负向行为、试听与 AutoMix 集成、异步生命周期；已有安全／DoH 变异按新增缺口补查。安装包实测留到用户授权打包时。

用户验收：视觉观感、流畅度、实体摄像头与设备、媒体面板／实体键、后台透明、长时间闲置与真实网络播放。自动验证只报告其覆盖的行为，不据模拟测试承诺这些体验已正常。

## 参考依据

- [上游 #479：本地离线记录与播放失败](https://github.com/XxHuberrr/Mineradio-paused/issues/479)、[#478：本地音乐相关问题](https://github.com/XxHuberrr/Mineradio-paused/issues/478)、[#464：连续 AutoMix 交接卡死](https://github.com/XxHuberrr/Mineradio-paused/issues/464)。问题报告是用例参考，不证明 Remix 存在相同根因；#478 正文此次后续请求超时，具体去重描述仍须核对，不能作为已经确认的上游修复。
- [上游 Issue #452：SEO 回退与签名讨论](https://github.com/XxHuberrr/Mineradio-paused/issues/452)。它是 Issue，不是已合并 PR；不采纳专有签名二进制方案。
- [electron-builder v26 更新说明](https://www.electron.build/v26/docs/features/auto-update/)；实际哈希校验还核对了本机锁定依赖的 `DownloadedUpdateHelper` 和 `DigestTransform`，未来执行测试以项目安装版本为准，不套用新版功能。
- [GitHub Actions 安全说明](https://docs.github.com/en/actions/reference/security/secure-use)：最小权限与完整提交 SHA 固定。固定 Action 需核实对应版本与维护者，不能随意填 SHA。
