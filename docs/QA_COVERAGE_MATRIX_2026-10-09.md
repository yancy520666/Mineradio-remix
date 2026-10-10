# Mineradio 完整工程 QA 功能与调用链覆盖矩阵

> 这是修改前建立的功能分母及历史分工清单，下面“待二轮”等描述保留原盘点时状态，不能当作最终结果。后续实际审查/运行/开放风险逐项见 [61组功能结果矩阵](QA_FEATURE_RESULTS_2026-10-09.md) 和 [工程总报告](QA_ENGINEERING_REVIEW_2026-10-09.md)；机器 JSON/CSV 在代码冻结后独立刷新，其时间/哈希以文件自身记录为准。两个时间点不可混为同一次验证。

盘点日期：2026-10-09。源码快照：`451b6cf178fb6d872368941020141c312f02c4a3`，分支 `dot/takeover`；采集时间 `2026-10-09T21:10:54.031Z`。

## 最终机器清单刷新（与历史分母分开）

冻结生产 `bc5258d`，采集时间 `2026-10-09T22:29:42.676Z`：993个已登记文件（包含本轮证据），207个自有生产JS，527个非vendor `.js`已解析；解析错误0、采集期间变化0。131个前端载入项、96个API路径、110个IPC channel、113个preload方法、302个HTML内联入口、466个静态控件、61组功能、220个npm test文件。`.cjs`复现材料作为文件证据登记，不把上述`.js`计数解释为每种扩展名都完成AST审查。

盘点器初轮把保存的运行时DOM误当成生产页面，重复解析快照并产生132个属性解析报错；已修正为保留快照文件/哈希而不重做生产DOM解析，QA复现脚本计入工具而非生产分母。原诊断见 `qa/INVENTORY_GENERATED_HTML_DIAGNOSTIC_2026-10-09.json`。没有忽略真实生产文件的解析失败，也没有把索引升级为语义/运行通过。

## 结论与证据等级

本文件建立全项目审查分母和下一轮分工，不宣布产品通过。全部本地文件已登记，非第三方 JS 完成 AST 盘点；具名函数、调用位置、HTTP/IPC、页面事件、测试入口均有逐项索引。源码盘点不是逐函数审查，测试存在不是测试通过，Node/VM 通过也不是实际平台或 Windows 实机通过。

- 所有文件默认：已盘点；本清单未做业务审查；本清单未执行运行验证。后续报告必须绑定文件哈希和实际运行日志。
- 同一工作树正在并行修改，行号与哈希以本快照为准；后续代码改变会使对应证据失效，不能把旧通过结果自动沿用。
- 第三方资源与授权未确认的汽水资源分别登记。仅核实本仓库实际可读技能：`isolated-ui-check`、`mineradio-release`，以及工程环境指导；未安装或宣称使用不存在的其他审查技能。
- 全部操作入口的静态清单是必要分母。运行时生成的菜单/3D 操作、实体设备、上游账号权限和平台真实返回仍须下一轮动态枚举。

## 完整机器索引

- [主清单 JSON](QA_INVENTORY_2026-10-09.json)：所有文件 SHA-256、分组、行数、具名函数定位、直接/间接测试引用、前端顺序、HTTP/IPC、页面事件、控件及功能链。源码和网络 query 值不复制入清单。
- [调用位置 CSV](QA_CALL_SITES_2026-10-09.csv)：所有非 vendor JS 调用位置；`caller_definition_id` / `candidate_definition_ids` 对应 JSON 的具名函数 id。名字匹配仅为词法候选，匿名/计算调用留空或标 `<dynamic-expression>`，不能视为已解析运行调用图。
- 本文附录逐文件列出全部分母，并逐项列出模块加载、HTTP、IPC、HTML 操作和测试入口。

## 规模与全量文件分组

快照含 540 个文件（包含文档、测试、资源和生成文件）；207 个生产自有 JS、441 个非 vendor JS（包含工具/测试）成功解析，解析失败 0。索引 6785 个具名函数、61559 个非 vendor 调用位置；前端载入 131 项，其中 modules 目录 126 项；HTTP 精确 API 路径 96 个；IPC channel 110 个、主进程 handler 101 个；preload 方法 113 个；HTML 内联事件 302 个、静态控件 465 个。

| 分组 | 文件 | 文本行 | 二轮重点 |
|---|---:|---:|---|
| `docs-guidance` | 49 | 5428 | 工具/配置/文档与交付一致性 |
| `project-config-launchers` | 8 | 6039 | 工具/配置/文档与交付一致性 |
| `packaging-ci` | 10 | 1465 | 桌面/安全/生命周期；Windows实机 |
| `generated-local-artifact` | 1 | 0 | 生成文件，非自有源码，不纳入业务审查分母 |
| `backend-and-provider-adapters` | 18 | 18477 | 全平台/API/网络；安全交叉 |
| `cuefield-transition-planning` | 19 | 6683 | 播放/歌词/持久化；UI/平台交叉 |
| `desktop-main-and-native` | 34 | 21867 | 桌面/安全/生命周期；Windows实机 |
| `frontend/assets-and-entry` | 12 | 26455 | UI/UX/a11y；性能交叉 |
| `frontend/00-state` | 14 | 2361 | 已分配架构/资源审查；证据到达前仍未审 |
| `frontend/01-scene` | 6 | 2632 | 已分配架构/资源审查；证据到达前仍未审 |
| `frontend/02-visual` | 18 | 13694 | 已分配架构/资源审查；证据到达前仍未审 |
| `frontend/03-beat` | 8 | 3981 | 已分配架构/资源审查；证据到达前仍未审 |
| `frontend/04-shelf` | 8 | 3122 | UI/UX/a11y；性能交叉 |
| `frontend/05-playback` | 29 | 17416 | 播放/歌词/持久化；UI/平台交叉 |
| `frontend/06-lyrics` | 9 | 4036 | 播放/歌词/持久化；UI/平台交叉 |
| `frontend/07-fx` | 16 | 9861 | UI/UX/a11y；性能交叉 |
| `frontend/08-account` | 9 | 4639 | UI/UX/a11y；性能交叉 |
| `frontend/09-idle-toast-libraries.js` | 1 | 514 | UI/UX/a11y；性能交叉 |
| `frontend/09a-onboarding-guide.js` | 1 | 760 | UI/UX/a11y；性能交叉 |
| `frontend/10-shell` | 6 | 3846 | UI/UX/a11y；性能交叉 |
| `frontend/11-main-loop.js` | 1 | 752 | 已分配架构/资源审查；证据到达前仍未审 |
| `third-party` | 15 | 5878 | 分发来源/授权；不当作自有代码假通过 |
| `qishui-decryptor-provenance-unverified` | 3 | 414 | 分发来源/授权；不当作自有代码假通过 |
| `qishui-security-host-provenance-unverified` | 2 | 396 | 分发来源/授权；不当作自有代码假通过 |
| `qa-dev-release-tools` | 32 | 14866 | 工具/配置/文档与交付一致性 |
| `tests` | 211 | 27045 | 映射断言与执行入口，不能以数量代替覆盖 |

## 架构与共享状态/依赖边界

1. Electron 主进程：`package.json` → `desktop/main.js`。main 管理单实例、稳定配置路径、本地服务器、BrowserWindow/WebContentsView、登录会话、IPC、设备权限、托盘/热键、WE/Win32 子进程和退出清理。
2. Renderer：`public/index.html` 先载入 three、music-tempo、gsap、preload-mode；最后 index-loader 按固定数组顺序同步 XHR 读取 131 项并拼接为一个经典 script。各模块共享全局声明与对象，无法把目录边界当模块隔离；全局写入、加载时初始化与回调取消是跨功能审查重点。
3. 本地服务：`server.js` 手写路径分派，调用网易依赖、QQ helper、酷狗/汽水 adapter、评论适配、封面/音频代理、分析与 CueField。API 路径含读和写，方法/登录/Origin/Host/世代检查需逐分支验证。Spotify API 分支拒绝服务，仍有 token 清理代码，旧文档声明不能作当前能力依据。
4. 平台网络：HTTPS/DNS/DoH/重定向边界、provider 会话/会员、取链、媒体代理、加密下载和 spill 磁盘属于不同阶段；一个阶段返回 200 不能代替全曲权益或播放成功。
5. 持久化：localStorage 与 main 下磁盘 store 并存；账号经 cookie storage，加密安全存储可用性影响迁移；播放检查点、内置/本地歌单、visual autosave、画质和引导分别独立。必须检查恢复优先级、原子写、坏文件、盘满及退出竞态。
6. 原生/外部边界：Windows 桌面/图标/WE/DWM、系统内存、浏览器 Cookie 读取和可选汽水 native bridge。Linux 源码环境不能证明这些真实 Windows 路径；授权未确认的分发资源仅报告，不能安装、删除或宣称合规。
7. 隔离测试：tests/helpers、scripts/qa 和测试自己的临时 profile；仅用假账号/临时曲库。真实账号、浏览器数据、维护者播放器和 Windows 安装/升级动作必须遵循已授权范围。

## 全量用户功能/操作链与已有测试映射

下列 61 组覆盖功能分母；每组中的全部源文件和测试候选在 JSON `user_function_paths` 中可直接查询。测试映射是候选/引用，不代表实际断言覆盖。共同追加：正常、空、错误、超时/慢网、取消、重复操作、新导航抢占、后台/恢复和资源回收。

### F01 启动与单实例

- 用户操作：启动；重复启动；启动失败重试；崩溃恢复
- 调用链：package.json main → desktop/main.js → 本地server → index.html → index-loader → startup绑定
- 边界检查：端口冲突；慢网络；已运行实例；renderer-crash；错误页与退出
- 二轮范围：桌面/安全 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/startup.html`, `public/index.html`, `public/js/index-loader.js`, `public/js/modules/10-shell/00-gesture-control.js`, `public/js/modules/10-shell/01-viewport-resize-shortcuts.js`, `public/js/modules/10-shell/02-peek-panels-upload.js`, `public/js/modules/10-shell/03-splash.js`, `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js`, `public/js/modules/10-shell/05-startup-bindings.js`, `server.js`
- 已有测试候选：`tests/dev-launcher-process-selection.test.ps1`, `tests/dev-launcher.test.js`, `tests/main-window-runtime-recovery.test.js`, `tests/player-navigation-startup-electron-smoke.js`, `tests/pre-release-startup-memory.test.js`, `tests/startup-flow-electron-smoke.js`, `tests/startup-navigation-readiness.test.js`, `tests/startup-qa-userdata-isolation.test.js`, `tests/startup-window-guide.test.js`

### F02 首次引导与原始画质

- 用户操作：打开引导；下一步；后退；跳过；重看；选择画质
- 调用链：onboarding-state / first-run-quality → guide DOM → sonic偏好
- 边界检查：所有步骤后退/关闭；窄屏；示范卡片不持久化；迁移旧偏好
- 二轮范围：UI + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/onboarding-state.js`, `desktop/sonic-performance-preferences.js`, `public/js/modules/00-state/02a-onboarding-state.js`, `public/js/modules/00-state/08a-first-run-quality.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/09a-onboarding-guide.js`
- 已有测试候选：`tests/first-run-quality.test.js`, `tests/onboarding-guide-electron-smoke.js`, `tests/onboarding-guide.test.js`, `tests/original-render-quality.test.js`, `tests/startup-window-guide.test.js`

### F03 网易云扫码与网页登录

- 用户操作：生成二维码；刷新；手机确认；网页回退；取消
- 调用链：login-modal-flows → /api/login/qr/* 或 preload.openNeteaseMusicLogin → desktop登录会话 → cookie store
- 边界检查：过期；切平台；重复刷新；晚到确认；确认前退登；断网重连
- 二轮范围：平台/API + 登录修复。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`cookie-storage.js`, `desktop/login-inline-qr.js`, `desktop/main.js`, `public/js/modules/08-account/00-update-preview.js`, `public/js/modules/08-account/01-login-modal-utils.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `public/js/modules/08-account/01b-content-priority.js`, `public/js/modules/08-account/02-login-status.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/08-account/06-original-profile-import.js`, `server.js`
- 已有测试候选：`tests/client-qr-login.test.js`, `tests/inline-login-lifecycle.test.js`, `tests/login-logout-race.test.js`, `tests/login-qr-loading.test.js`, `tests/provider-login-state-recovery.test.js`

### F04 QQ音乐App/官方网页登录

- 用户操作：生成App二维码；刷新；选择QQ网页；扫码交接；取消
- 调用链：login-modal-flows → preload → qq-native-qr/protocol 或 qq-login-page → server QQ账户/播放
- 边界检查：SDK错误码；错误扫码App；二维码仓库隔离；设备上下文；迟到授权；错误提示不被覆盖
- 二轮范围：平台/API + 登录修复。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/qq-login-page.js`, `desktop/qq-native-protocol.js`, `desktop/qq-native-qr.js`, `public/js/modules/08-account/00-update-preview.js`, `public/js/modules/08-account/01-login-modal-utils.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `public/js/modules/08-account/01b-content-priority.js`, `public/js/modules/08-account/02-login-status.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/08-account/06-original-profile-import.js`, `qq-vip-api.js`, `server.js`
- 已有测试候选：`tests/client-qr-login.test.js`, `tests/inline-login-lifecycle.test.js`, `tests/login-logout-race.test.js`, `tests/qq-login-page.test.js`, `tests/qq-native-protocol.test.js`

### F05 酷狗扫码与安全验证

- 用户操作：生成客户端二维码；网页回退；打开官方验证；刷新；取消
- 调用链：login-modal-flows → native-qr / official verification → server cookie/login → kugou-api
- 边界检查：验证URL来源；外跳；关闭窗口；会话落盘失败；验证未完成；会员权益未知
- 二轮范围：平台/API + 桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/kugou-native-qr.js`, `desktop/kugou-verification.js`, `desktop/main.js`, `kugou-api.js`, `public/js/modules/08-account/00-update-preview.js`, `public/js/modules/08-account/01-login-modal-utils.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `public/js/modules/08-account/01b-content-priority.js`, `public/js/modules/08-account/02-login-status.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/08-account/06-original-profile-import.js`
- 已有测试候选：`tests/client-qr-login.test.js`, `tests/kugou-login-bridge.test.js`, `tests/kugou-native-qr.test.js`, `tests/kugou-verification-electron-smoke.js`, `tests/kugou-verification-flow.test.js`, `tests/kugou-verification.test.js`, `tests/login-logout-race.test.js`

### F06 汽水扫码与授权

- 用户操作：创建二维码；检测扫码；刷新；关闭/重开；授权验证
- 调用链：/api/qishui/login/* → qr-login/auth-v6 → security_host/resources → provider session
- 边界检查：应用与passport状态不一致；跨世代结果；验证webSecurity；存储异常；专有资源许可
- 二轮范围：平台/API + 桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/08-account/00-update-preview.js`, `public/js/modules/08-account/01-login-modal-utils.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `public/js/modules/08-account/01b-content-priority.js`, `public/js/modules/08-account/02-login-status.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/08-account/06-original-profile-import.js`, `qishui-auth-v6/bdms.js`, `qishui-auth-v6/react-dom.js`, `qishui-auth-v6/react.js`, `qishui-auth-v6/sdk-glue.js`, `qishui-auth-v6/security_host.html`, `qishui-auth-v6/security_seed.html`, `qishui-auth-v6.js`, `qishui-qr-login.js`, `server.js`
- 已有测试候选：`tests/client-qr-login.test.js`, `tests/login-qr-loading.test.js`, `tests/qishui-passport-live-smoke.js`, `tests/qishui-passport-qr-login.test.js`, `tests/qishui-session-recovery.test.js`

### F07 Cookie/浏览器登录导入

- 用户操作：粘贴Cookie；二次确认浏览器读取；选择平台；失败后重试
- 调用链：account UI → preload.importBrowserLogin → browser-cookie-import → provider cookie route → encrypted store
- 边界检查：限定域名/路径；Chrome/Edge/Brave/Firefox；DPAPI失败；只读原文件；错误日志不含秘密
- 二轮范围：桌面/安全 + 平台/API。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`cookie-storage.js`, `desktop/browser-cookie-import.js`, `desktop/main.js`, `desktop/preload.js`, `public/js/modules/08-account/00-update-preview.js`, `public/js/modules/08-account/01-login-modal-utils.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `public/js/modules/08-account/01b-content-priority.js`, `public/js/modules/08-account/02-login-status.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/08-account/06-original-profile-import.js`, `server.js`
- 已有测试候选：`tests/browser-cookie-import.test.js`, `tests/cookie-storage.test.js`, `tests/credential-migration-lifecycle.test.js`, `tests/login-entry-direct.test.js`

### F08 退出登录/撤销/账号隔离

- 用户操作：拖开平台连线；撤销；单平台退出；全部退出
- 调用链：user-modal-logout → login attempt generation + clear-login IPC/HTTP → session/cache invalidation
- 边界检查：四秒撤销边界；迟到cookie；旧QR；多窗口；落盘失败；帐号切换泄漏缓存
- 二轮范围：平台/API + 登录修复。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`cookie-storage.js`, `desktop/main.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `server.js`
- 已有测试候选：`tests/client-qr-login.test.js`, `tests/credential-migration-lifecycle.test.js`, `tests/login-logout-race.test.js`, `tests/provider-login-state-recovery.test.js`, `tests/request-lifecycle.test.js`

### F09 账号在线/会员/能力状态

- 用户操作：刷新状态；回前台检测；显示VIP/SVIP/未知；拖动平台优先级
- 调用链：login-status → 各provider status → membership normalize / capability API → home/search/source priority
- 边界检查：过期会员；未知状态；上游拒绝；断网不退登；两次确认；UI与播放权限一致
- 二轮范围：平台/API + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`kugou-api.js`, `public/js/modules/08-account/00-update-preview.js`, `public/js/modules/08-account/01-login-modal-utils.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `public/js/modules/08-account/01b-content-priority.js`, `public/js/modules/08-account/02-login-status.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/08-account/06-original-profile-import.js`, `qishui-api.js`, `qq-vip-api.js`, `server.js`
- 已有测试候选：`tests/content-provider-priority.test.js`, `tests/kugou-vip-hardening.test.js`, `tests/login-presence-check.test.js`, `tests/membership-badge-consistency.test.js`, `tests/platform-account-sync-guard.test.js`, `tests/provider-entitlement-boundary.test.js`, `tests/qishui-entitlement-cache.test.js`, `tests/qq-vip-entitlement.test.js`

### F10 原版配置导入

- 用户操作：检查原版；选择导入项；确认导入；重试
- 调用链：preload.inspect/importOriginalProfile → original importer/preferences → Remix stores
- 边界检查：只补缺项；原版只读；危险键；损坏JSON；不同路径/权限；已有账号不覆盖
- 二轮范围：桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/original-profile-import.js`, `desktop/original-profile-preferences.js`, `public/js/modules/08-account/06-original-profile-import.js`
- 已有测试候选：`tests/credential-migration-lifecycle.test.js`, `tests/next-critical-boundaries.test.js`, `tests/original-profile-entry-electron-smoke.js`, `tests/original-profile-import.test.js`

### F11 首页推荐/每日歌曲

- 用户操作：打开首页；刷新；选择推荐平台；播放一首/整组；回退查看原因
- 调用链：home-dashboard/actions → /api/discover/home/provider recommendations → shelf / queue / playback
- 边界检查：首选未登录；推荐失败；加载时点播放；平台改序；旧请求晚到；虚拟列表长集合
- 二轮范围：平台/API + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`kugou-community-api.js`, `public/js/modules/05-playback/03-home-discover-weather.js`, `public/js/modules/05-playback/03a-home-dashboard.js`, `public/js/modules/05-playback/05-home-actions.js`, `server.js`
- 已有测试候选：`tests/content-provider-priority.test.js`, `tests/home-card-hover-electron-smoke.js`, `tests/home-daily-recommendation-virtualization.test.js`, `tests/home-daily-recommendations-backend.test.js`, `tests/home-dashboard-update.test.js`, `tests/home-hero-mp4-platform-recommend.test.js`

### F12 天气/IP定位与发现

- 用户操作：查看天气；IP定位；切换发现内容
- 调用链：home-discover-weather → weather/radio + weather/ip-location → remote HTTPS
- 边界检查：不可达；非法数据；定位隐私；HTTPS；超时；空状态
- 二轮范围：平台/API。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/03-home-discover-weather.js`, `server.js`
- 已有测试候选：`tests/home-dashboard-update.test.js`, `tests/home-hero-mp4-platform-recommend.test.js`, `tests/network-compatibility.test.js`

### F13 听歌统计/平台上报

- 用户操作：查看累计；切歌记录；暂停后继续；读取平台时长
- 调用链：listen-stats → local persistence → /api/listen/report,total → provider capability
- 边界检查：长时间增长；重复上报；seek计时；帐号分离；上游未支持；实验功能明确
- 二轮范围：播放/持久化 + 平台/API。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/02-listen-stats.js`, `server.js`
- 已有测试候选：`tests/cache-lifecycle.test.js`, `tests/pre-release-startup-memory.test.js`, `tests/provider-entitlement-boundary.test.js`

### F14 综合歌曲搜索/拼音

- 用户操作：输入词；输入法完成；取消旧词；点结果；选择平台顺序
- 调用链：search/pinyin → /api/search + provider search → normalize/dedupe → incremental UI
- 边界检查：最快结果先到；慢平台；同曲版本；IME组合；空/错误；连续换词
- 二轮范围：平台/API + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`kugou-api.js`, `public/js/modules/05-playback/06c-search-pinyin.js`, `public/js/modules/05-playback/07-search.js`, `qishui-api.js`, `server.js`
- 已有测试候选：`tests/content-provider-priority.test.js`, `tests/search-backend-latency.test.js`, `tests/search-frontend-pagination.test.js`, `tests/search-pinyin.test.js`

### F15 分类搜索/分页/公开用户歌单

- 用户操作：切歌曲/歌手/专辑/歌单/用户类型；加载更多；点详情
- 调用链：search → /api/search/overview,type,user-playlists → detail/playlist loaders
- 边界检查：offset/cursor；分类切换；重复页；失效用户；晚到平台更新保留滚动
- 二轮范围：平台/API + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/07-search.js`, `public/js/modules/06-lyrics/02-playlist-detail.js`, `server.js`
- 已有测试候选：`tests/artist-albums-more.test.js`, `tests/playlist-paging.test.js`, `tests/search-frontend-pagination.test.js`

### F16 歌手/专辑详情

- 用户操作：查看歌手；看全部专辑；继续加载；播放专辑；收藏
- 调用链：search/detail UI → artist/detail,artist/albums,album/detail → playlist/read collect
- 边界检查：平台不支持；分页终点；类型/版本混合；关闭后回调；按钮状态
- 二轮范围：平台/API + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/07-search.js`, `public/js/modules/06-lyrics/02-playlist-detail.js`, `server.js`
- 已有测试候选：`tests/artist-albums-more.test.js`, `tests/playlist-detail-layout-electron-smoke.js`, `tests/provider-entitlement-boundary.test.js`

### F17 播客/电台浏览与节目

- 用户操作：搜索电台；热门；电台详情；节目分页；我的播客
- 调用链：playlist-loaders → /api/podcast/* → queue → DJ分析
- 边界检查：付费节目；长节目；全长/试听；未知时长；无权限；分页与取消
- 二轮范围：平台/API + 播放。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`dj-analyzer.js`, `public/js/modules/03-beat/02-podcast-dj-analysis.js`, `public/js/modules/06-lyrics/03-podcast-playlist-loaders.js`, `server.js`
- 已有测试候选：`tests/beat-analysis-memory.test.js`, `tests/cache-lifecycle.test.js`, `tests/playlist-paging.test.js`

### F18 普通播放取链/起播

- 用户操作：点击歌曲；重复点击；上一首/下一首；播放本地曲目
- 调用链：playback-switch-core → api-quality-output/provider fallback → /api/*/song/url → audio proxy/media graph
- 边界检查：地址失败；decode；stalled；已切歌owner；暂停意图；重试上限；30/60秒试听
- 二轮范围：播放 + 平台/API。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/00-api-quality-output.js`, `public/js/modules/05-playback/11-provider-fallback.js`, `public/js/modules/05-playback/12-playback-switch-core.js`, `public/js/modules/05-playback/13-playback-start-audio.js`, `server.js`
- 已有测试候选：`tests/playback-load-recovery.test.js`, `tests/playback-network-ownership.test.js`, `tests/playback-source-fallback-transaction.test.js`, `tests/playback-start-stall-electron-smoke.js`, `tests/playback-start-stall.test.js`, `tests/source-switch-playability.test.js`

### F19 暂停/恢复/停止/单击静音

- 用户操作：点播放暂停；快速连点；静音恢复；停止；控制媒体键
- 调用链：player-controls → fade/intent/state → HTMLAudio/WebAudio → media session
- 边界检查：淡出中恢复；后台；自动恢复不抵消主动暂停；静音旧音量；输入框空格
- 二轮范围：播放 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/08-audio-graph-controls.js`, `public/js/modules/05-playback/13-playback-start-audio.js`, `public/js/modules/05-playback/14-player-controls.js`, `public/js/modules/05-playback/14a-system-media-session.js`
- 已有测试候选：`tests/audio-output-routing.test.js`, `tests/playback-background-resume.test.js`, `tests/playback-pause-cancellation.test.js`, `tests/queue-pause-electron-smoke.js`, `tests/system-media-session.test.js`

### F20 音质切换与多源回退

- 用户操作：选择音质；查看真实标签；选择来源；会员试听补全
- 调用链：quality-output → provider tier rights / fallback transaction → current track handoff
- 边界检查：不同版本误匹配；进度保持；试音/全长真实；账号不足；降级提示；AutoMix试听路径
- 二轮范围：播放 + 平台/API。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`kugou-api.js`, `public/js/modules/05-playback/00-api-quality-output.js`, `public/js/modules/05-playback/11-provider-fallback.js`, `qishui-api.js`, `qq-vip-api.js`, `server.js`
- 已有测试候选：`tests/provider-entitlement-boundary.test.js`, `tests/qishui-quality-tier.test.js`, `tests/qishui-tier-rights.test.js`, `tests/qishui-trial-full-source.test.js`, `tests/quality-chip-local-track.test.js`, `tests/source-switch-playability.test.js`

### F21 音频HTTP代理/Range/取消

- 用户操作：播放媒体；拖动进度触发Range；暂停预读；断开消费者
- 调用链：/api/audio → public resource checks → audio-spill-relay or qishui decrypt cache → response stream
- 边界检查：重定向重新校验；SSRF；慢读与封顶；盘满；取消；206/416；无限响应
- 二轮范围：平台/API + 桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`audio-spill-relay.js`, `music-dns.js`, `qishui-api.js`, `qishui-audio-decryptor/decrypt-utils.js`, `qishui-audio-decryptor/mp4-box.js`, `qishui-audio-decryptor/track-decryptor.js`, `server-security.js`, `server.js`
- 已有测试候选：`tests/audio-proxy-lifecycle.test.js`, `tests/audio-spill-relay.test.js`, `tests/music-dns.test.js`, `tests/qishui-cache-generation.test.js`, `tests/qishui-decrypt-cache-bounds.test.js`, `tests/request-lifecycle.test.js`, `tests/server-security.test.js`

### F22 进度点击/拖动/循环模式

- 用户操作：点击seek；拖动；歌词点击seek；单曲/顺序/随机循环
- 调用链：progress-seek → playback graph/media time → lyric state/checkpoint → loop queue
- 边界检查：边界0/末尾；未加载；AutoMix交接；暂停状态；无限duration；seek中切歌
- 二轮范围：播放 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/09-queue-snapshot-autoplay.js`, `public/js/modules/05-playback/09a-playback-checkpoint.js`, `public/js/modules/05-playback/14-player-controls.js`, `public/js/modules/06-lyrics/04-progress-seek.js`, `public/js/modules/06-lyrics/06-lyric-timing-offset.js`
- 已有测试候选：`tests/audio-route-drag.test.js`, `tests/lyric-seek-visibility.test.js`, `tests/lyric-track-seek-glide.test.js`, `tests/playback-single-repeat-loop.test.js`, `tests/progress-seek-gesture.test.js`, `tests/queue-logical-order.test.js`

### F23 队列添加/插入/删除/清空/重排

- 用户操作：下一首播放；加入队列；删当前/其他；清空确认；拖动重排；切模式
- 调用链：queue-actions/snapshot → current track identity → playlist panel → checkpoint
- 边界检查：空队列；末曲；加载中删除；暂停时删除；重排身份；双击；恢复空快照
- 二轮范围：播放/持久化 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/09-queue-snapshot-autoplay.js`, `public/js/modules/05-playback/10-queue-actions.js`, `public/js/modules/06-lyrics/01-playlist-panel-shell.js`
- 已有测试候选：`tests/playback-checkpoint.test.js`, `tests/queue-logical-order.test.js`, `tests/queue-pause-electron-smoke.js`, `tests/queue-removal.test.js`

### F24 播放检查点/崩溃恢复

- 用户操作：退出；异常退出；重开；恢复歌曲进度
- 调用链：renderer checkpoint-format → preload save/read → playback-checkpoint-store → queue restore
- 边界检查：损坏/未来时间；旧快照覆盖；系统回拨；磁盘满；本地离线；退登后在线曲目
- 二轮范围：播放/持久化 + 桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/playback-checkpoint-store.js`, `public/js/modules/05-playback/09a-playback-checkpoint.js`, `public/js/playback-checkpoint-format.js`
- 已有测试候选：`tests/playback-checkpoint.test.js`, `tests/queue-removal.test.js`, `tests/startup-navigation-readiness.test.js`

### F25 本地文件导入/曲库关联

- 用户操作：选择/拖入歌曲；读元数据；重定位移动文件；离线跳过
- 调用链：upload-dragdrop → preload file capability → LocalMusicLibrary → local protocol → playback
- 边界检查：中文/超长路径；同大小错文件；符号链接；U盘拔插；坏媒体；未授权文件；失效cap
- 二轮范围：播放/持久化 + 桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/local-music-library.js`, `desktop/main.js`, `desktop/preload.js`, `public/js/modules/06-lyrics/05-upload-dragdrop.js`
- 已有测试候选：`tests/local-alternate-fingerprint-cache.test.js`, `tests/local-library-offline-relink.test.js`, `tests/local-music-library-persistence.test.js`, `tests/local-playback-skip-notice.test.js`, `tests/media-security-electron-smoke.js`

### F26 内置歌单持久化/收藏

- 用户操作：创建；重命名；删除；加入/移除；重排；播放；页读取
- 调用链：built-in-playlists UI → preload CRUD → BuiltInPlaylistLibrary atomic store
- 边界检查：危险键；坏索引；磁盘满；并发写；重排当前歌；可恢复删除与取消
- 二轮范围：播放/持久化 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/built-in-playlist-library.js`, `desktop/main.js`, `desktop/preload.js`, `public/js/modules/06-lyrics/00-built-in-playlists.js`
- 已有测试候选：`tests/built-in-playlist-library.test.js`, `tests/next-critical-boundaries.test.js`, `tests/playlist-catalog-recovery.test.js`

### F27 远端歌单与收藏写操作

- 用户操作：读取歌单；分页；收藏歌单/专辑；新建远端歌单；加歌
- 调用链：playlist-detail + collect modal → /api/provider playlist/album/like endpoints → provider
- 边界检查：不支持能力；未登录；写失败回滚；重复请求；页顺序；权限与方法
- 二轮范围：平台/API + 播放/持久化。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`kugou-api.js`, `public/js/modules/04-shelf/00-layout-hover.js`, `public/js/modules/04-shelf/01-manager-core.js`, `public/js/modules/04-shelf/02-rebuild-panel-sync.js`, `public/js/modules/04-shelf/03-content-list-manager.js`, `public/js/modules/04-shelf/04-cover-api-helpers.js`, `public/js/modules/04-shelf/04a-cover-loader.js`, `public/js/modules/04-shelf/05-card-interactions.js`, `public/js/modules/04-shelf/06-keyboard-camera-events.js`, `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`, `public/js/modules/06-lyrics/02-playlist-detail.js`, `qishui-api.js`, `server.js`
- 已有测试候选：`tests/netease-like-cache.test.js`, `tests/platform-account-sync-guard.test.js`, `tests/playlist-catalog-recovery.test.js`, `tests/playlist-paging.test.js`, `tests/provider-entitlement-boundary.test.js`

### F28 歌单架/侧栏/详情交互

- 用户操作：打开架；回正；悬停；左右切卡；展开歌曲；滚动；图钉；关闭
- 调用链：shelf manager/interactions → camera recenter → list virtualization → detail/queue
- 边界检查：长歌单；动画中重复开关；1秒阻塞；固定状态；列表命中；键盘等价；焦点恢复
- 二轮范围：UI + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/01-scene/00-renderer-quality.js`, `public/js/modules/01-scene/01-orbit-free-camera.js`, `public/js/modules/01-scene/02-beat-camera-runtime.js`, `public/js/modules/01-scene/03-focus-cinema-camera.js`, `public/js/modules/01-scene/04-bottom-controls-cursor.js`, `public/js/modules/01-scene/05-ui-render-cache.js`, `public/js/modules/04-shelf/00-layout-hover.js`, `public/js/modules/04-shelf/01-manager-core.js`, `public/js/modules/04-shelf/02-rebuild-panel-sync.js`, `public/js/modules/04-shelf/03-content-list-manager.js`, `public/js/modules/04-shelf/04-cover-api-helpers.js`, `public/js/modules/04-shelf/04a-cover-loader.js`, `public/js/modules/04-shelf/05-card-interactions.js`, `public/js/modules/04-shelf/06-keyboard-camera-events.js`, `public/js/modules/06-lyrics/01-playlist-panel-shell.js`, `public/js/modules/06-lyrics/01a-scroll-motion.js`, `public/js/modules/06-lyrics/02-playlist-detail.js`
- 已有测试候选：`tests/panel-view-recenter.test.js`, `tests/playlist-detail-layout-electron-smoke.js`, `tests/playlist-interaction-electron-smoke.js`, `tests/shelf-lyric-flip.test.js`, `tests/shelf-panel-interaction.test.js`

### F29 歌曲红心与收藏状态

- 用户操作：检查红心；喜欢/取消；跨平台切换
- 调用链：track-detail/actions → /api/provider song/like → like cache/session invalidation
- 边界检查：账号换人；限流；写失败；重复点击；不支持平台；旧track结果
- 二轮范围：平台/API + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`kugou-api.js`, `netease-like-cache.js`, `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`, `qishui-api.js`, `server.js`
- 已有测试候选：`tests/netease-like-cache.test.js`, `tests/platform-account-sync-guard.test.js`, `tests/provider-entitlement-boundary.test.js`

### F30 歌曲详情/评论/排序/分页

- 用户操作：打开详情；最新/热门；加载更多；重试；关闭
- 调用链：track-detail → comment-list-api / provider comments → list state owner → DOM
- 边界检查：cursor/offset；去重；错误页；倒序切换；晚到旧歌；长评论/表情/XSS；可访问状态
- 二轮范围：评论封面 + UI + 平台/API。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`comment-list-api.js`, `kugou-community-api.js`, `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`, `qishui-api.js`, `server.js`
- 已有测试候选：`tests/comment-avatar-loader.test.js`, `tests/comment-replies.test.js`, `tests/song-comments-electron-smoke.js`, `tests/song-comments-pagination.test.js`

### F31 楼中楼/评论点赞与发送

- 用户操作：展开回复；继续翻页；返回；点赞/取消；汽水发送评论
- 调用链：comment-replies UI → /api/song/comment/replies or comments/like/create → platform adapter
- 边界检查：同楼游标；关闭后回调；账号退出；重复点赞；乐观回滚；文本注入；写操作权限
- 二轮范围：评论封面 + 平台/API + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`comment-replies-api.js`, `kugou-community-api.js`, `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`, `public/js/modules/05-playback/06a-comment-replies.js`, `qishui-api.js`, `server.js`
- 已有测试候选：`tests/comment-replies.test.js`, `tests/song-comments-electron-smoke.js`, `tests/song-comments-pagination.test.js`

### F32 封面/头像加载与自定义封面

- 用户操作：查看封面/头像；失败重试；预取；裁切；恢复默认
- 调用链：cover-loader/avatar recovery → /api/cover → bounded cover-cache → texture/DOM consumers
- 边界检查：并发上限；大小/类型；旧owner；坏图；未设置src；回收纹理；缓存身份与重试
- 二轮范围：评论封面 + 性能 + 安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`cover-cache.js`, `public/js/modules/03-beat/05-cover-loading-crop.js`, `public/js/modules/03-beat/05a-adjacent-preparation.js`, `public/js/modules/04-shelf/04-cover-api-helpers.js`, `public/js/modules/04-shelf/04a-cover-loader.js`, `public/js/modules/05-playback/01-cover-custom-map.js`, `public/js/modules/05-playback/06b-comment-avatars.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `server.js`
- 已有测试候选：`tests/account-avatar-electron-smoke.js`, `tests/adjacent-preparation.test.js`, `tests/comment-avatar-loader.test.js`, `tests/cover-cache.test.js`, `tests/cover-load-retry.test.js`, `tests/custom-cover-home-sync.test.js`, `tests/playlist-cover-loader.test.js`

### F33 歌词获取/解析/版本/翻译

- 用户操作：加载歌词；选择译文/罗马字；无歌词标题；慢歌词到达
- 调用链：lyrics-fetch-parse → provider lyric API → payloads → row/mesh/layout render
- 边界检查：畸形LRC；大文本；重复时间；慢旧歌词；切歌取消；无歌词；译文比例
- 二轮范围：播放/歌词 + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/02-visual/02-lyrics-state-layout.js`, `public/js/modules/02-visual/02a-lyric-work-scheduler.js`, `public/js/modules/02-visual/03-lyrics-star-river.js`, `public/js/modules/02-visual/05-lyrics-fonts-texture.js`, `public/js/modules/02-visual/07-lyrics-palette-text-utils.js`, `public/js/modules/02-visual/08-lyrics-display-modes.js`, `public/js/modules/02-visual/09-lyrics-payloads.js`, `public/js/modules/02-visual/10-lyrics-mask-textures.js`, `public/js/modules/02-visual/11-lyrics-shaders.js`, `public/js/modules/02-visual/12-lyrics-row-layers.js`, `public/js/modules/02-visual/12a-lyrics-edit-preview.js`, `public/js/modules/02-visual/13-lyrics-mesh-build.js`, `public/js/modules/02-visual/14-stage-lyrics-rendering.js`, `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`, `public/js/modules/06-lyrics/00-lyrics-fetch-parse.js`, `server.js`
- 已有测试候选：`tests/lyric-layout-electron-smoke.js`, `tests/lyric-motion-profiles.test.js`, `tests/lyric-runway-preparation.test.js`, `tests/lyric-style-refresh.test.js`, `tests/lyric-title-handoff.test.js`, `tests/paused-lyric-layout.test.js`

### F34 歌词校准/自定义编辑

- 用户操作：偏移±；保存自定义LRC；预览；删除；取消
- 调用链：lyric timing/custom modal → store/cache → active renderer rows
- 边界检查：负时间；超长输入；track改变；取消还原；危险标签；盘满；控件可键盘操作
- 二轮范围：播放/歌词 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `public/js/modules/02-visual/12a-lyrics-edit-preview.js`, `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`, `public/js/modules/06-lyrics/06-lyric-timing-offset.js`
- 已有测试候选：`tests/lyric-drag-quality.test.js`, `tests/lyric-edit-electron-smoke.js`, `tests/lyric-edit-preview.test.js`, `tests/lyric-style-refresh.test.js`, `tests/lyric-track-seek-glide.test.js`

### F35 歌词舞台/自由相机/歌单架避让

- 用户操作：拖动相机；焦点舞台；歌词模式；左侧让位；收起复位
- 调用链：scene camera → lyrics state/layout/font textures → stage render → shelf projections
- 边界检查：长原文/短译文；侧转；不同倾角；宽窄屏；暂停过渡；原纹理保留
- 二轮范围：UI + 性能 + 歌词。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/01-scene/00-renderer-quality.js`, `public/js/modules/01-scene/01-orbit-free-camera.js`, `public/js/modules/01-scene/02-beat-camera-runtime.js`, `public/js/modules/01-scene/03-focus-cinema-camera.js`, `public/js/modules/01-scene/04-bottom-controls-cursor.js`, `public/js/modules/01-scene/05-ui-render-cache.js`, `public/js/modules/02-visual/00-pointer-cover-particles.js`, `public/js/modules/02-visual/01-float-skull-backcover.js`, `public/js/modules/02-visual/02-lyrics-state-layout.js`, `public/js/modules/02-visual/02a-lyric-work-scheduler.js`, `public/js/modules/02-visual/03-lyrics-star-river.js`, `public/js/modules/02-visual/04-visual-settings-persistence.js`, `public/js/modules/02-visual/05-lyrics-fonts-texture.js`, `public/js/modules/02-visual/06-custom-background-colorlab.js`, `public/js/modules/02-visual/07-lyrics-palette-text-utils.js`, `public/js/modules/02-visual/08-lyrics-display-modes.js`, `public/js/modules/02-visual/09-lyrics-payloads.js`, `public/js/modules/02-visual/10-lyrics-mask-textures.js`, `public/js/modules/02-visual/11-lyrics-shaders.js`, `public/js/modules/02-visual/12-lyrics-row-layers.js`, `public/js/modules/02-visual/12a-lyrics-edit-preview.js`, `public/js/modules/02-visual/13-lyrics-mesh-build.js`, `public/js/modules/02-visual/14-stage-lyrics-rendering.js`, `public/js/modules/02-visual/15-ripples-cover-depth.js`, `public/js/modules/04-shelf/00-layout-hover.js`, `public/js/modules/04-shelf/01-manager-core.js`, `public/js/modules/04-shelf/02-rebuild-panel-sync.js`, `public/js/modules/04-shelf/03-content-list-manager.js`, `public/js/modules/04-shelf/04-cover-api-helpers.js`, `public/js/modules/04-shelf/04a-cover-loader.js`, `public/js/modules/04-shelf/05-card-interactions.js`, `public/js/modules/04-shelf/06-keyboard-camera-events.js`, `public/js/modules/11-main-loop.js`
- 已有测试候选：`tests/lyric-active-line-viewport-fit.test.js`, `tests/lyric-drag-quality.test.js`, `tests/lyric-spacing-stability.test.js`, `tests/lyric-track-seek-glide.test.js`, `tests/paused-lyric-layout.test.js`, `tests/shelf-lyric-flip.test.js`, `tests/stage-lyric-background-restore.test.js`

### F36 节拍/DJ分析与缓存

- 用户操作：触发本地分析；选MR/DJ；取消；读取缓存；预取相邻歌
- 调用链：tempo worker → analysis → /api/beatmap/cache,podcast/dj-beatmap → beat runtime
- 边界检查：长播客；并发取消；坏音频；缓存版本；磁盘满；对象URL/worker回收
- 二轮范围：播放/AutoMix + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`dj-analyzer.js`, `public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js`, `public/js/modules/03-beat/01-audio-beat-analysis.js`, `public/js/modules/03-beat/02-podcast-dj-analysis.js`, `public/js/modules/03-beat/03-local-beat-cache-modal.js`, `public/js/modules/03-beat/04-beat-map-runtime.js`, `public/js/modules/03-beat/05-cover-loading-crop.js`, `public/js/modules/03-beat/05a-adjacent-preparation.js`, `public/js/modules/03-beat/06-sonic-audio-monitor.js`, `server.js`
- 已有测试候选：`tests/adjacent-preparation.test.js`, `tests/beat-analysis-memory.test.js`, `tests/cache-lifecycle.test.js`, `tests/cuefield-electron-smoke.js`, `tests/cuefield-mineradio-integration.test.js`, `tests/cuefield-transition-runtime.test.js`

### F37 AutoMix/CueField连续混音

- 用户操作：开/关AutoMix；设跨曲；运行转场；反馈；跳过下一首
- 调用链：beat analysis → cuefield planner/bridge → executor/source loop → audio graph → queue/checkpoint
- 边界检查：多首连续；试听下一首；中途暂停/seek/删队列；晚到解码；节点断连；owner交接
- 二轮范围：播放/AutoMix + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`cuefield/adapter-mineradio.js`, `cuefield/boundary-evidence.js`, `cuefield/bridge-planner.js`, `cuefield/cue-profile.js`, `cuefield/feedback-log.js`, `cuefield/lrc-anchors.js`, `cuefield/lyric-link.js`, `cuefield/mineradio-bridge.js`, `cuefield/musical-profile.js`, `cuefield/planner-contracts.js`, `cuefield/recipe-planner.js`, `cuefield/section-candidates.js`, `cuefield/shadow-diagnostics.js`, `cuefield/structure-map.js`, `cuefield/transition-artifact.js`, `cuefield/transition-evaluator.js`, `cuefield/transition-router.js`, `cuefield/transition-window-planner.js`, `cuefield/version.js`, `public/js/modules/05-playback/08-audio-graph-controls.js`, `public/js/modules/05-playback/16-cuefield-automix-core.js`, `public/js/modules/05-playback/17-cuefield-timeline-executor.js`, `public/js/modules/05-playback/17a-cuefield-bridge-engine.js`, `public/js/modules/05-playback/17b-cuefield-source-loop.js`, `public/js/modules/05-playback/18-cuefield-automix-integration.js`, `server.js`
- 已有测试候选：`tests/cache-lifecycle.test.js`, `tests/cuefield-electron-smoke.js`, `tests/cuefield-mineradio-integration.test.js`, `tests/cuefield-transition-runtime.test.js`, `tests/playback-audio-graph-recovery.test.js`

### F38 多音频输出与路由

- 用户操作：枚举设备；选择多输出；音量；单路静音；输出设备切换
- 调用链：quality-output/audio-graph → captureStream/HTML media sinks → UI routing
- 边界检查：setSinkId拒绝；设备移除；蓝牙重连；静音恢复；多个consumer；后台稳定
- 二轮范围：播放/音频 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/00-api-quality-output.js`, `public/js/modules/05-playback/08-audio-graph-controls.js`, `public/js/modules/05-playback/14-player-controls.js`
- 已有测试候选：`tests/audio-output-routing.test.js`, `tests/audio-route-drag.test.js`, `tests/playback-audio-graph-recovery.test.js`

### F39 麦克风混音与权限

- 用户操作：选择输入；申请捕获；开/关；增益/静音；结束捕获
- 调用链：microphone mixer UI → preload permission gate → getUserMedia → WebAudio → output graph
- 边界检查：拒绝/取消；devicechange；丢失轨道；权限token；反馈啸叫；退出停止所有track
- 二轮范围：播放/音频 + 桌面/安全 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/microphone-permission.js`, `desktop/preload.js`, `public/js/modules/05-playback/19-microphone-mixer-runtime.js`, `public/js/modules/05-playback/20-microphone-mixer-ui.js`
- 已有测试候选：`tests/microphone-mixer-ui.test.js`, `tests/microphone-mixer.test.js`, `tests/microphone-permission.test.js`

### F40 系统媒体键/媒体面板

- 用户操作：系统播放暂停；上一首下一首；seek；显示封面信息
- 调用链：system-media-session → navigator.mediaSession → core player controls
- 边界检查：实体Windows键；旧封面metadata；关闭解绑；无队列；暂停意图
- 二轮范围：播放 + Windows实机。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/05-playback/14-player-controls.js`, `public/js/modules/05-playback/14a-system-media-session.js`
- 已有测试候选：`tests/system-media-session.test.js`

### F41 快捷键/鼠标侧键/全屏

- 用户操作：配置键位；全局媒体键；缩放；退出全屏；鼠标前后按钮
- 调用链：hotkeys/shell handlers → preload/globalShortcut → desktop/window state
- 边界检查：文本输入竞争；重复注册；失焦；多屏；Esc优先级；global key冲突
- 二轮范围：UI + 桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/preload.js`, `public/js/modules/07-fx/06-hotkeys.js`, `public/js/modules/10-shell/00-gesture-control.js`, `public/js/modules/10-shell/01-viewport-resize-shortcuts.js`, `public/js/modules/10-shell/02-peek-panels-upload.js`, `public/js/modules/10-shell/03-splash.js`, `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js`, `public/js/modules/10-shell/05-startup-bindings.js`
- 已有测试候选：`tests/player-navigation-startup-electron-smoke.js`, `tests/startup-navigation-readiness.test.js`, `tests/visual-clarity-and-portrait-fullscreen.test.js`

### F42 通知/弹窗/控制条自动隐藏

- 用户操作：连续提示；关闭；hover音量/来源/音质；固定控制条
- 调用链：idle-toast-libraries → bounded stack; bottom-controls → pointer/UI menu state
- 边界检查：第5条提示；退场重复关闭；portal菜单；鼠标移出/失焦；读屏live状态
- 二轮范围：UI + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/index.html`, `public/js/modules/01-scene/04-bottom-controls-cursor.js`, `public/js/modules/05-playback/15-control-glass-animations.js`, `public/js/modules/09-idle-toast-libraries.js`
- 已有测试候选：`tests/bottom-controls-hover.test.js`, `tests/next-critical-boundaries.test.js`, `tests/pre-release-startup-memory.test.js`, `tests/queue-pause-electron-smoke.js`

### F43 视觉预设/档案导入导出

- 用户操作：选预设；编辑参数；保存档案；重命名/删除；导出/导入JSON
- 调用链：fx controls/archive → localStorage/autosave → preload JSON dialog → persistence
- 边界检查：旧schema；危险键；大JSON；未知字段；取消；切背景保留偏好；档案扩散范围
- 二轮范围：UI + 性能 + 桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/preload.js`, `public/default-user-fx-archive.json`, `public/js/modules/00-state/04-fx-defaults.js`, `public/js/modules/00-state/05-packaged-fx-archive.js`, `public/js/modules/00-state/06-fx-runtime-layout.js`, `public/js/modules/07-fx/00-preset-archive-data.js`, `public/js/modules/07-fx/01-lyric-color-controls.js`, `public/js/modules/07-fx/02-accent-background-controls.js`, `public/js/modules/07-fx/02a-album-cover-background.js`, `public/js/modules/07-fx/03-cover-picker-fonts.js`, `public/js/modules/07-fx/03-wallpaper-engine-library.js`, `public/js/modules/07-fx/03a-wallpaper-engine-interaction.js`, `public/js/modules/07-fx/03b-wallpaper-engine-loop.js`, `public/js/modules/07-fx/04-preset-grid-uniforms.js`, `public/js/modules/07-fx/04a-effect-scope.js`, `public/js/modules/07-fx/05-fx-panel-performance.js`, `public/js/modules/07-fx/06-hotkeys.js`, `public/js/modules/07-fx/06a-slider-preview.js`, `public/js/modules/07-fx/07-bindings-shelf-immersive.js`, `public/js/modules/07-fx/08-cache-storage-settings.js`, `public/js/modules/07-fx/09-console-workspace.js`
- 已有测试候选：`tests/curated-visual-presets.test.js`, `tests/ui-default-theme-shelf-layer.test.js`, `tests/user-fx-archive-compat.test.js`, `tests/visual-effect-controls-electron-smoke.js`, `tests/visual-performance-controls.test.js`

### F44 主题/歌词颜色/字体/图像裁切

- 用户操作：改颜色；主题Aero；选字体；自定义封面/背景裁切；复位
- 调用链：color/cover/font controls → shared fx state → CSS / texture / shader rendering
- 边界检查：字体不可达；CORS；破图；高对比；主题!important层；资源重建；尺寸异常
- 二轮范围：UI + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/css/index.css`, `public/js/modules/02-visual/00-pointer-cover-particles.js`, `public/js/modules/02-visual/01-float-skull-backcover.js`, `public/js/modules/02-visual/02-lyrics-state-layout.js`, `public/js/modules/02-visual/02a-lyric-work-scheduler.js`, `public/js/modules/02-visual/03-lyrics-star-river.js`, `public/js/modules/02-visual/04-visual-settings-persistence.js`, `public/js/modules/02-visual/05-lyrics-fonts-texture.js`, `public/js/modules/02-visual/06-custom-background-colorlab.js`, `public/js/modules/02-visual/07-lyrics-palette-text-utils.js`, `public/js/modules/02-visual/08-lyrics-display-modes.js`, `public/js/modules/02-visual/09-lyrics-payloads.js`, `public/js/modules/02-visual/10-lyrics-mask-textures.js`, `public/js/modules/02-visual/11-lyrics-shaders.js`, `public/js/modules/02-visual/12-lyrics-row-layers.js`, `public/js/modules/02-visual/12a-lyrics-edit-preview.js`, `public/js/modules/02-visual/13-lyrics-mesh-build.js`, `public/js/modules/02-visual/14-stage-lyrics-rendering.js`, `public/js/modules/02-visual/15-ripples-cover-depth.js`, `public/js/modules/07-fx/01-lyric-color-controls.js`, `public/js/modules/07-fx/02-accent-background-controls.js`, `public/js/modules/07-fx/03-cover-picker-fonts.js`
- 已有测试候选：`tests/aero-input-electron-smoke.js`, `tests/album-cover-background.test.js`, `tests/custom-cover-home-sync.test.js`, `tests/lyric-style-refresh.test.js`, `tests/visual-effect-controls-electron-smoke.js`

### F45 自定义颜色/图片/MP4/封面背景

- 用户操作：选图片/视频；拖入；缩放/移动/裁切；切当前封面；清空
- 调用链：background controls → object URL/media → scene/sonic visual layer
- 边界检查：超大8K；错误媒体；切换旧video暂停/URL释放；透明连续；取消
- 二轮范围：UI + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/02-visual/06-custom-background-colorlab.js`, `public/js/modules/05-playback/04-home-empty-wallpaper.js`, `public/js/modules/07-fx/02-accent-background-controls.js`, `public/js/modules/07-fx/02a-album-cover-background.js`, `public/js/modules/07-fx/03-cover-picker-fonts.js`
- 已有测试候选：`tests/album-cover-background.test.js`, `tests/custom-cover-home-sync.test.js`, `tests/provider-removal-diy-cinema-preload.test.js`, `tests/wallpaper-background-regression.test.js`, `tests/wallpaper-cover-electron-smoke.js`

### F46 音域回响/特效渲染

- 用户操作：切地形/工坊；粒子/光效/波纹开关；调性能；暂停恢复
- 调用链：sonic presets/performance → audio monitor → shaders/resources → frame scheduler
- 边界检查：GPU丢上下文；WebGL失败；帧率30/60/高刷；反复切换；旧资源；声音响应
- 二轮范围：性能 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/js/modules/02-visual/00-pointer-cover-particles.js`, `public/js/modules/02-visual/01-float-skull-backcover.js`, `public/js/modules/02-visual/02-lyrics-state-layout.js`, `public/js/modules/02-visual/02a-lyric-work-scheduler.js`, `public/js/modules/02-visual/03-lyrics-star-river.js`, `public/js/modules/02-visual/04-visual-settings-persistence.js`, `public/js/modules/02-visual/05-lyrics-fonts-texture.js`, `public/js/modules/02-visual/06-custom-background-colorlab.js`, `public/js/modules/02-visual/07-lyrics-palette-text-utils.js`, `public/js/modules/02-visual/08-lyrics-display-modes.js`, `public/js/modules/02-visual/09-lyrics-payloads.js`, `public/js/modules/02-visual/10-lyrics-mask-textures.js`, `public/js/modules/02-visual/11-lyrics-shaders.js`, `public/js/modules/02-visual/12-lyrics-row-layers.js`, `public/js/modules/02-visual/12a-lyrics-edit-preview.js`, `public/js/modules/02-visual/13-lyrics-mesh-build.js`, `public/js/modules/02-visual/14-stage-lyrics-rendering.js`, `public/js/modules/02-visual/15-ripples-cover-depth.js`, `public/js/modules/03-beat/06-sonic-audio-monitor.js`, `public/js/modules/11-main-loop.js`, `public/sonic-performance-policy.js`, `public/sonic-performance.js`, `public/sonic-topography-preset.js`, `public/sonic-workshop-preset.js`
- 已有测试候选：`tests/sonic-cover-palette-timing.test.js`, `tests/sonic-performance-electron-smoke.js`, `tests/sonic-performance.test.js`, `tests/sonic-topography-quality-continuity.test.js`, `tests/sonic-workshop-audio.test.js`, `tests/sonic-workshop-cadence.test.js`, `tests/sonic-workshop-electron-smoke.js`, `tests/sonic-workshop-ripples.test.js`, `tests/visual-resource-electron-smoke.js`

### F47 画质/帧率/自适应/后台策略

- 用户操作：选画质/前台FPS；开启自适应；查看诊断；保持当前；重试
- 调用链：prefs → sonic performance policy → renderer/cache/scheduler → notice
- 边界检查：低端核显；长帧；手动优先；后台0绘制；VRR高刷；反复重建；设置跨端口
- 二轮范围：性能 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/sonic-performance-preferences.js`, `public/js/modules/00-state/01-perf-render-state.js`, `public/js/modules/00-state/08-desktop-render-power.js`, `public/js/modules/00-state/09-performance-probe.js`, `public/js/modules/00-state/10-frame-scheduler.js`, `public/js/modules/01-scene/00-renderer-quality.js`, `public/js/modules/11-main-loop.js`, `public/sonic-performance-policy.js`, `public/sonic-performance.js`
- 已有测试候选：`tests/adaptive-quality-ui-electron-smoke.js`, `tests/paused-lyric-layout.test.js`, `tests/paused-render-cadence.test.js`, `tests/quality-preset.test.js`, `tests/quality-reset-electron-smoke.js`, `tests/sonic-preferences-store.test.js`, `tests/visual-performance-controls.test.js`

### F48 桌面歌词浮窗

- 用户操作：开启；拖动；锁定；鼠标穿透；关闭；多屏移动
- 调用链：renderer lyric state → preload lyrics IPC → overlay-preload → desktop-lyrics.html
- 边界检查：hot bounds；pointer capture清理；锁定状态；拖出屏幕；DPI；屏幕移除
- 二轮范围：桌面/安全 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/overlay-preload.js`, `public/desktop-lyrics.html`, `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js`
- 已有测试候选：`tests/full-desktop-geometry-electron-smoke.js`, `tests/full-desktop-mode-runtime.test.js`, `tests/lyric-layout-electron-smoke.js`, `tests/paused-lyric-layout.test.js`, `tests/wallpaper-interaction.test.js`, `tests/wallpaper-native-input.test.js`

### F49 完整桌面/图标层/窗口模式

- 用户操作：进入桌面；图标点击拖动；切显示器；Esc退出；最小化/恢复
- 调用链：shell overlay → FullDesktopModeRuntime / native icon layer/shape runtime → Win32 helper
- 边界检查：Explorer重启；后台层失效；实体键鼠；多DPI；原桌面恢复；进程退出清理
- 二轮范围：桌面/安全 + Windows实机。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/desktop-icon-shape-runtime.js`, `desktop/desktop-native-icon-layer-runtime.js`, `desktop/full-desktop-mode-runtime.js`, `desktop/main.js`, `desktop/wallpaper-mode-runtime.js`, `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js`
- 已有测试候选：`tests/desktop-icon-shape-runtime.test.js`, `tests/full-desktop-geometry-electron-smoke.js`, `tests/full-desktop-mode-runtime.test.js`, `tests/wallpaper-interaction.test.js`, `tests/wallpaper-native-input.test.js`

### F50 手势摄像头控制

- 用户操作：请求摄像头；启用手势；播放/暂停/seek；禁用
- 调用链：gesture-control → preload permission → MediaPipe vendor → player actions
- 边界检查：拒绝；摄像头掉线；长后台；卸载track；模型资源错误；混合audio/video申请
- 二轮范围：UI + 桌面/安全 + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/preload.js`, `public/js/modules/10-shell/00-gesture-control.js`
- 已有测试候选：`tests/gesture-camera-permission.test.js`, `tests/gesture-player-actions.test.js`, `tests/gesture-runtime-lifecycle.test.js`

### F51 WE项目发现/导入/移除

- 用户操作：导入文件/目录；刷新；恢复隐藏；打开详情
- 调用链：WE library UI → preload list/choose → WallpaperEngineLibrary safe scheme
- 边界检查：真实Steam布局；非法路径；链接；应用型exe仅预览；缺Steam/WE；文件选择取消
- 二轮范围：桌面/安全 + Windows实机。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/preload.js`, `desktop/wallpaper-engine-library.js`, `public/js/modules/07-fx/03-wallpaper-engine-library.js`
- 已有测试候选：`tests/wallpaper-compatibility-messages.test.js`, `tests/wallpaper-loop-cache.test.js`, `tests/wallpaper-loop-mode.test.js`, `tests/wallpaper-loop-window.test.js`, `tests/wallpaper-quality-properties.test.js`, `tests/wallpaper-window-follow.test.js`

### F52 WE原生实时/交互/取景

- 用户操作：启动Scene/Web；鼠标点击拖动；移动/缩放窗口；停止/切换
- 调用链：WE UI → runtime/start IPC → native helper/DWM surface/input → main window composition
- 边界检查：管理员边界；无签名；DPI圆角；Win10黄框；多次启动；长闲置；原桌面恢复
- 二轮范围：桌面/安全 + Windows实机。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/wallpaper-engine-input.js`, `desktop/wallpaper-engine-runtime.js`, `desktop/wallpaper-mode-runtime.js`, `public/js/modules/07-fx/03-wallpaper-engine-library.js`, `public/js/modules/07-fx/03a-wallpaper-engine-interaction.js`
- 已有测试候选：`tests/wallpaper-engine-idle-dispose.test.js`, `tests/wallpaper-engine-minimize-resident.test.js`, `tests/wallpaper-engine-win10-yellow-border.test.js`, `tests/wallpaper-interaction.test.js`, `tests/wallpaper-native-input.test.js`, `tests/wallpaper-window-follow.test.js`

### F53 WE属性与独立取景

- 用户操作：搜索属性；文字/颜色/开关/数值；保存；恢复默认；打开WE设置
- 调用链：WE project-details → WallpaperPropertyStore → native command → per-project view prefs
- 边界检查：复杂schema；换帐号；原项目只读；默认值；边界值；切回取景；恶意属性路径
- 二轮范围：桌面/安全 + UI。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/wallpaper-engine-properties.js`, `desktop/wallpaper-engine-runtime.js`, `public/js/modules/07-fx/03-wallpaper-engine-library.js`
- 已有测试候选：`tests/wallpaper-cover-electron-smoke.js`, `tests/wallpaper-quality-properties.test.js`, `tests/wallpaper-visual-reset.test.js`

### F54 WE循环视频录制/缓存

- 用户操作：按窗口/铺满屏幕录制；取消；重录；循环播放
- 调用链：wallpaper-loop UI → loop window/capture → loop cache → normal video background
- 边界检查：中断不留假视频；无帧；原窗口几何恢复；512MB预算；缓存失效；声音静音副本
- 二轮范围：桌面/安全 + 性能 + Windows实机。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/wallpaper-engine-loop-cache.js`, `desktop/wallpaper-engine-runtime.js`, `desktop/wallpaper-loop-window.js`, `public/js/modules/07-fx/03b-wallpaper-engine-loop.js`
- 已有测试候选：`tests/wallpaper-engine-idle-dispose.test.js`, `tests/wallpaper-engine-minimize-resident.test.js`, `tests/wallpaper-loop-cache.test.js`, `tests/wallpaper-loop-mode.test.js`, `tests/wallpaper-loop-window.test.js`

### F55 缓存目录/回收/数据边界

- 用户操作：选缓存目录；改预算；查看状态；失效磁盘回退；生成缓存清理
- 调用链：cache-settings UI → main cache dirs → cache pruner/lyric/beat/cover/decrypt/spill
- 边界检查：C盘；权限；盘满；链接根；共享目录；marker归属；打开文件；旧缓存迁移
- 二轮范围：桌面/安全 + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`audio-spill-relay.js`, `cover-cache.js`, `desktop/main.js`, `generated-cache-pruner.js`, `public/js/modules/07-fx/08-cache-storage-settings.js`, `qishui-api.js`, `server.js`
- 已有测试候选：`tests/audio-spill-relay.test.js`, `tests/cache-lifecycle.test.js`, `tests/cache-root-fallback.test.js`, `tests/cover-cache.test.js`, `tests/qishui-cache-generation.test.js`, `tests/qishui-decrypt-cache-bounds.test.js`

### F56 内存诊断/应用/系统回收

- 用户操作：查看快照；启用自动；回收应用；清理系统；取消提权
- 调用链：system-memory-controls → preload → app-memory/system-memory native helper
- 边界检查：Windows提权；阈值/间隔；前台延迟；原生失败；错误提示；不误报GPU显存
- 二轮范围：桌面/安全 + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/app-memory.js`, `desktop/main.js`, `desktop/system-memory.js`, `public/js/modules/00-state/11-system-memory-controls.js`
- 已有测试候选：`tests/beat-analysis-memory.test.js`, `tests/cache-lifecycle.test.js`, `tests/pre-release-startup-memory.test.js`

### F57 窗口/托盘/关闭/电源生命周期

- 用户操作：最小化；关闭至托盘/退出；恢复；全屏；系统睡眠唤醒
- 调用链：titlebar/preload → main window lifecycle → renderer recovery/background policy → cleanup
- 边界检查：遮挡；透明丢画；renderer crash；唤醒后过期媒体；退出并发；子进程清理
- 二轮范围：桌面/安全 + 播放 + 性能。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/preload.js`, `public/js/modules/00-state/08-desktop-render-power.js`, `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js`
- 已有测试候选：`tests/background-resume-electron-smoke.js`, `tests/background-window-state-recovery.test.js`, `tests/foreground-recovery-electron-smoke.js`, `tests/foreground-recovery-work.test.js`, `tests/main-window-runtime-recovery.test.js`, `tests/playback-background-resume.test.js`

### F58 更新检查/外部下载/安装入口

- 用户操作：检查新版本；打开说明；下载页面；稍后；旧本地更新禁用
- 调用链：update-preview → /api/update/latest + remix-updater IPC → verified external link / packaged updater
- 边界检查：镜像重定向；摘要；版本降级；晚到完成；子frame调用；旧入口410；草稿不误报
- 二轮范围：桌面/安全。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`desktop/main.js`, `desktop/remix-updater.js`, `docs/update/latest.yml`, `public/js/modules/08-account/00-update-preview.js`, `server.js`
- 已有测试候选：`tests/external-update-page-bridge.test.js`, `tests/remix-updater-download.test.js`, `tests/remix-updater.test.js`, `tests/update-download-link-rotation.test.js`, `tests/update-early-check.test.js`, `tests/update-external-only.test.js`

### F59 打包/安装/升级/卸载/发布边界

- 用户操作：正式/内测构建；覆盖升级；重启；卸载；草稿资产校验
- 调用链：package/builder files → after-pack → NSIS ownership marker → CI/release jobs → installed runtime
- 边界检查：asar差异；全依赖闭包；静默模式；保留用户文件；重解析路径；发布权限；未签名
- 二轮范围：桌面/安全 + Windows实机。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`.github/workflows/ci.yml`, `.github/workflows/release-windows.yml`, `build/after-pack.js`, `build/icon.ico`, `build/icon.png`, `build/installer-internal-beta.nsh`, `build/installer-remix.nsh`, `build/installer.nsh`, `build/installerHeader.bmp`, `build/installerSidebar.bmp`, `electron-builder.internal-beta.json`, `package.json`, `scripts/verify-installed-renderer.js`, `scripts/verify-packaged-metadata.js`, `scripts/verify-windows-installer.ps1`
- 已有测试候选：`tests/dev-launcher-process-selection.test.ps1`, `tests/dev-launcher.test.js`, `tests/installer-cleanup.test.js`, `tests/packaging-runtime-files.test.js`, `tests/workflow-release-boundary.test.js`

### F60 全站可访问性与非指针操作

- 用户操作：Tab/ShiftTab；Enter/Space；Esc；读屏；减弱动态；缩放
- 调用链：index/desktop-lyrics markup + CSS + dynamic event handlers → keyboard/focus/aria equivalents
- 边界检查：每个dialog焦点圈/归还；隐藏不可达；Canvas等价；name-role-state；对比度；触控命中；200%缩放
- 二轮范围：UI/UX/a11y。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`public/css/index.css`, `public/desktop-lyrics.html`, `public/index.html`, `public/js/modules/00-state/00-core-stores.js`, `public/js/modules/00-state/01-perf-render-state.js`, `public/js/modules/00-state/02-preferences-ui-modes.js`, `public/js/modules/00-state/02a-onboarding-state.js`, `public/js/modules/00-state/03-beat-dj-state.js`, `public/js/modules/00-state/04-fx-defaults.js`, `public/js/modules/00-state/05-packaged-fx-archive.js`, `public/js/modules/00-state/06-fx-runtime-layout.js`, `public/js/modules/00-state/07-ui-playback-runtime.js`, `public/js/modules/00-state/08-desktop-render-power.js`, `public/js/modules/00-state/08a-first-run-quality.js`, `public/js/modules/00-state/09-performance-probe.js`, `public/js/modules/00-state/10-frame-scheduler.js`, `public/js/modules/00-state/11-system-memory-controls.js`, `public/js/modules/01-scene/00-renderer-quality.js`, `public/js/modules/01-scene/01-orbit-free-camera.js`, `public/js/modules/01-scene/02-beat-camera-runtime.js`, `public/js/modules/01-scene/03-focus-cinema-camera.js`, `public/js/modules/01-scene/04-bottom-controls-cursor.js`, `public/js/modules/01-scene/05-ui-render-cache.js`, `public/js/modules/02-visual/00-pointer-cover-particles.js`, `public/js/modules/02-visual/01-float-skull-backcover.js`, `public/js/modules/02-visual/02-lyrics-state-layout.js`, `public/js/modules/02-visual/02a-lyric-work-scheduler.js`, `public/js/modules/02-visual/03-lyrics-star-river.js`, `public/js/modules/02-visual/04-visual-settings-persistence.js`, `public/js/modules/02-visual/05-lyrics-fonts-texture.js`, `public/js/modules/02-visual/06-custom-background-colorlab.js`, `public/js/modules/02-visual/07-lyrics-palette-text-utils.js`, `public/js/modules/02-visual/08-lyrics-display-modes.js`, `public/js/modules/02-visual/09-lyrics-payloads.js`, `public/js/modules/02-visual/10-lyrics-mask-textures.js`, `public/js/modules/02-visual/11-lyrics-shaders.js`, `public/js/modules/02-visual/12-lyrics-row-layers.js`, `public/js/modules/02-visual/12a-lyrics-edit-preview.js`, `public/js/modules/02-visual/13-lyrics-mesh-build.js`, `public/js/modules/02-visual/14-stage-lyrics-rendering.js`, `public/js/modules/02-visual/15-ripples-cover-depth.js`, `public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js`, `public/js/modules/03-beat/01-audio-beat-analysis.js`, `public/js/modules/03-beat/02-podcast-dj-analysis.js`, `public/js/modules/03-beat/03-local-beat-cache-modal.js`, `public/js/modules/03-beat/04-beat-map-runtime.js`, `public/js/modules/03-beat/05-cover-loading-crop.js`, `public/js/modules/03-beat/05a-adjacent-preparation.js`, `public/js/modules/03-beat/06-sonic-audio-monitor.js`, `public/js/modules/04-shelf/00-layout-hover.js`, `public/js/modules/04-shelf/01-manager-core.js`, `public/js/modules/04-shelf/02-rebuild-panel-sync.js`, `public/js/modules/04-shelf/03-content-list-manager.js`, `public/js/modules/04-shelf/04-cover-api-helpers.js`, `public/js/modules/04-shelf/04a-cover-loader.js`, `public/js/modules/04-shelf/05-card-interactions.js`, `public/js/modules/04-shelf/06-keyboard-camera-events.js`, `public/js/modules/05-playback/00-api-quality-output.js`, `public/js/modules/05-playback/01-cover-custom-map.js`, `public/js/modules/05-playback/02-listen-stats.js`, `public/js/modules/05-playback/03-home-discover-weather.js`, `public/js/modules/05-playback/03a-home-dashboard.js`, `public/js/modules/05-playback/04-home-empty-wallpaper.js`, `public/js/modules/05-playback/05-home-actions.js`, `public/js/modules/05-playback/06-track-detail-lyrics-actions.js`, `public/js/modules/05-playback/06a-comment-replies.js`, `public/js/modules/05-playback/06b-comment-avatars.js`, `public/js/modules/05-playback/06c-search-pinyin.js`, `public/js/modules/05-playback/07-search.js`, `public/js/modules/05-playback/08-audio-graph-controls.js`, `public/js/modules/05-playback/09-queue-snapshot-autoplay.js`, `public/js/modules/05-playback/09a-playback-checkpoint.js`, `public/js/modules/05-playback/10-queue-actions.js`, `public/js/modules/05-playback/11-provider-fallback.js`, `public/js/modules/05-playback/12-playback-switch-core.js`, `public/js/modules/05-playback/13-playback-start-audio.js`, `public/js/modules/05-playback/14-player-controls.js`, `public/js/modules/05-playback/14a-system-media-session.js`, `public/js/modules/05-playback/15-control-glass-animations.js`, `public/js/modules/05-playback/16-cuefield-automix-core.js`, `public/js/modules/05-playback/17-cuefield-timeline-executor.js`, `public/js/modules/05-playback/17a-cuefield-bridge-engine.js`, `public/js/modules/05-playback/17b-cuefield-source-loop.js`, `public/js/modules/05-playback/18-cuefield-automix-integration.js`, `public/js/modules/05-playback/19-microphone-mixer-runtime.js`, `public/js/modules/05-playback/20-microphone-mixer-ui.js`, `public/js/modules/06-lyrics/00-built-in-playlists.js`, `public/js/modules/06-lyrics/00-lyrics-fetch-parse.js`, `public/js/modules/06-lyrics/01-playlist-panel-shell.js`, `public/js/modules/06-lyrics/01a-scroll-motion.js`, `public/js/modules/06-lyrics/02-playlist-detail.js`, `public/js/modules/06-lyrics/03-podcast-playlist-loaders.js`, `public/js/modules/06-lyrics/04-progress-seek.js`, `public/js/modules/06-lyrics/05-upload-dragdrop.js`, `public/js/modules/06-lyrics/06-lyric-timing-offset.js`, `public/js/modules/07-fx/00-preset-archive-data.js`, `public/js/modules/07-fx/01-lyric-color-controls.js`, `public/js/modules/07-fx/02-accent-background-controls.js`, `public/js/modules/07-fx/02a-album-cover-background.js`, `public/js/modules/07-fx/03-cover-picker-fonts.js`, `public/js/modules/07-fx/03-wallpaper-engine-library.js`, `public/js/modules/07-fx/03a-wallpaper-engine-interaction.js`, `public/js/modules/07-fx/03b-wallpaper-engine-loop.js`, `public/js/modules/07-fx/04-preset-grid-uniforms.js`, `public/js/modules/07-fx/04a-effect-scope.js`, `public/js/modules/07-fx/05-fx-panel-performance.js`, `public/js/modules/07-fx/06-hotkeys.js`, `public/js/modules/07-fx/06a-slider-preview.js`, `public/js/modules/07-fx/07-bindings-shelf-immersive.js`, `public/js/modules/07-fx/08-cache-storage-settings.js`, `public/js/modules/07-fx/09-console-workspace.js`, `public/js/modules/08-account/00-update-preview.js`, `public/js/modules/08-account/01-login-modal-utils.js`, `public/js/modules/08-account/01a-avatar-recovery.js`, `public/js/modules/08-account/01b-content-priority.js`, `public/js/modules/08-account/02-login-status.js`, `public/js/modules/08-account/03-login-modal-flows.js`, `public/js/modules/08-account/04-user-modal-logout.js`, `public/js/modules/08-account/05-startup-login-guide.js`, `public/js/modules/08-account/06-original-profile-import.js`, `public/js/modules/09-idle-toast-libraries.js`, `public/js/modules/09a-onboarding-guide.js`, `public/js/modules/10-shell/00-gesture-control.js`, `public/js/modules/10-shell/01-viewport-resize-shortcuts.js`, `public/js/modules/10-shell/02-peek-panels-upload.js`, `public/js/modules/10-shell/03-splash.js`, `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js`, `public/js/modules/10-shell/05-startup-bindings.js`
- 已有测试候选：`tests/adaptive-quality-ui-electron-smoke.js`, `tests/onboarding-guide-electron-smoke.js`, `tests/onboarding-guide.test.js`, `tests/search-frontend-pagination.test.js`, `tests/song-comments-electron-smoke.js`, `tests/song-comments-pagination.test.js`, `tests/visual-effect-controls-electron-smoke.js`

### F61 安全/隐私/依赖来源横切

- 用户操作：读取服务能力；IPC访问；外部链接；加载第三方资源；诊断日志
- 调用链：HTTP trusted request → public fetch DNS/IP guard; preload sender validation; cookie encryption; provenance docs
- 边界检查：SSRF/重定向；Origin/Host；renderer权限；秘密日志；未知许可；私有native桥不打包；权限默认
- 二轮范围：桌面/安全 + 平台/API。静态待二轮逐函数审查，运行未验证。
- 全量源文件：`NOTICE.md`, `PRIVACY.md`, `SECURITY.md`, `cookie-storage.js`, `desktop/main.js`, `desktop/preload.js`, `docs/THIRD_PARTY_PORTS.md`, `music-dns.js`, `qishui-audio-decryptor/decrypt-utils.js`, `qishui-audio-decryptor/mp4-box.js`, `qishui-audio-decryptor/track-decryptor.js`, `qishui-auth-v6/bdms.js`, `qishui-auth-v6/react-dom.js`, `qishui-auth-v6/react.js`, `qishui-auth-v6/sdk-glue.js`, `qishui-auth-v6/security_host.html`, `qishui-auth-v6/security_seed.html`, `server-security.js`, `server.js`
- 已有测试候选：`tests/cookie-storage.test.js`, `tests/media-security-electron-smoke.js`, `tests/music-dns.test.js`, `tests/next-critical-boundaries.test.js`, `tests/server-security.test.js`, `tests/workflow-release-boundary.test.js`

## 最高风险尚未证明的区域与下一阶段分工

| 范围 | 当前证据 | 下一阶段必须建立的证据/停止条件 |
|---|---|---|
| 音频状态机/AutoMix/多输出/麦克风 | 已有不少VM/单元与部分Electron测试，当前清单未运行 | 绘制不干扰音频；owner/意图/超时/Abort/重试可逐次追踪；连续多首+暂停seek+输出热插拔+mic退出的真实隔离验证 |
| 所有平台认证/会员/取链/写操作 | 账号/平台细分专项存在；真实完整扫码与权益仍不能由匿名QR推断 | 四平台逐route/helper映射；回调世代；未知/失效权益；官方错误分类；取链→实际duration→播放闭环 |
| 本地/内置歌单持久化 | 有专项读写及危险键边界，交接历史曾标未审 | 全CRUD+重排/当前曲+退出保存/重启+盘满/损坏/路径授权；原版文件只读 |
| WE/桌面图标/输入/更新安装 | Windows原生脚本与fixture存在；当前环境是Linux | 在隔离Windows用户配置，分别真实Scene、DWM、多DPI、Explorer重启、实体输入、退出恢复；明确未运行项 |
| 经典脚本架构/全局共享 | 131加载项及依赖/具名函数全量可查 | 按实际拼接脚本检查重复声明、早初始化/late binding、事件重复绑定和清理；不以静态语法通过等同全局正确 |
| 长期UI/GPU/内存/CPU | 有性能专项与预算约束，缺完整组合/长时运行证据 | 全126模块资源owner释放；切歌/背景/歌词/WE反复切换和长idle；renderer/main/child/GPU分别测，原画质不降级掩盖 |
| a11y/键盘/读屏 | 现有主要是ARIA属性及局部focus断言 | 全302HTML入口+动态入口枚举；dialog焦点圈归还；Canvas功能等价；Tab/Esc/读屏/对比度/缩放实测 |
| 安全/隐私/资源分发 | 有安全专项、来源说明及已知许可缺口 | 逐97分支与110channel验证sender/method/URL/input/log；来源授权缺口持续记录；不复制真实秘密 |
| 覆盖与测试集成 | 175 Node test root入口；19个smoke已登记 | 逐测试解释实际assertion、夹具/跳过/环境要求；全部smoke明确跑或列未运行；失败归因不得先改期望 |

注意：上表是未完成的验证任务，尚不是确认的 P0/P1 产品缺陷。不得仅按未覆盖直接定级。

## 执行层次、运行门槛与缺陷格式

1. 静态逐组审查：以本清单全部路径为分母，标记已审/发现/未审及快照哈希；所有跨组调用回到声明位置与实际消费者，不只搜关键字。
2. 隔离 Node 行为：`npm test` 只自动执行 tests 根目录 `*.test.js`；必须核对所有超时、skip、失败。`npm run check` 是语法+专项静态守卫及部分回归，不是全面业务证明。
3. 隔离真实 Electron：`npm run test:electron` 只登记下文 19 个文件；其余 11 个 smoke 入口需分类后独立运行。`scripts/qa/isolated-electron.js` 必须仅用临时 profile；可见截图与DOM测量按 local skill；如果执行被拒绝，不换路径绕过，注明确切 blocker。
4. 实际网络：公共/假账号可验证连接与错误处理；本人扫码、会员权益和浏览器凭据读取不从文档推导授权。仅在既有明确授权和只读范围运行，记录平台返回和媒体实测时长，不推测上游限制原因。
5. Windows实机与最终包：所有原生功能、安装升级卸载、真实硬件设备、多屏DPI、WE长时场景独立验证。当前盘点环境确认 `Linux x86_64 / Node v24.19.0`、Electron Linux二进制在 node_modules；不能将Linux通过写作Windows通过。
6. 问题报告：P0=严重数据/安全/核心不可用；P1=高频核心失败或明显权限风险；P2=功能/体验失败且有规避；P3=低风险可用性/维护问题。每条必须包含确定文件:行号、快照、前置条件、逐步复现、实际/期望、影响、根因调用链、修复方案、回归证据和未验证边界。缺验证则标候选，不拿测试数量代替发现。

## 附录 A：真实前端加载顺序（全部）

| 顺序 | 文件 | loader行 | 存在 | 静态/运行 |
|---:|---|---:|---|---|
| 1 | `public/js/playback-checkpoint-format.js` | 6 | 是 | 待审 / 未验证 |
| 2 | `public/js/modules/00-state/00-core-stores.js` | 7 | 是 | 待审 / 未验证 |
| 3 | `public/js/modules/00-state/01-perf-render-state.js` | 8 | 是 | 待审 / 未验证 |
| 4 | `public/js/modules/00-state/02-preferences-ui-modes.js` | 9 | 是 | 待审 / 未验证 |
| 5 | `public/js/modules/00-state/02a-onboarding-state.js` | 10 | 是 | 待审 / 未验证 |
| 6 | `public/js/modules/00-state/03-beat-dj-state.js` | 11 | 是 | 待审 / 未验证 |
| 7 | `public/js/modules/00-state/04-fx-defaults.js` | 12 | 是 | 待审 / 未验证 |
| 8 | `public/js/modules/00-state/05-packaged-fx-archive.js` | 13 | 是 | 待审 / 未验证 |
| 9 | `public/js/modules/00-state/06-fx-runtime-layout.js` | 14 | 是 | 待审 / 未验证 |
| 10 | `public/js/modules/00-state/07-ui-playback-runtime.js` | 15 | 是 | 待审 / 未验证 |
| 11 | `public/js/modules/00-state/08-desktop-render-power.js` | 16 | 是 | 待审 / 未验证 |
| 12 | `public/js/modules/00-state/08a-first-run-quality.js` | 17 | 是 | 待审 / 未验证 |
| 13 | `public/js/modules/00-state/09-performance-probe.js` | 18 | 是 | 待审 / 未验证 |
| 14 | `public/js/modules/00-state/10-frame-scheduler.js` | 19 | 是 | 待审 / 未验证 |
| 15 | `public/js/modules/00-state/11-system-memory-controls.js` | 20 | 是 | 待审 / 未验证 |
| 16 | `public/js/modules/01-scene/00-renderer-quality.js` | 21 | 是 | 待审 / 未验证 |
| 17 | `public/js/modules/01-scene/01-orbit-free-camera.js` | 22 | 是 | 待审 / 未验证 |
| 18 | `public/js/modules/01-scene/02-beat-camera-runtime.js` | 23 | 是 | 待审 / 未验证 |
| 19 | `public/js/modules/01-scene/03-focus-cinema-camera.js` | 24 | 是 | 待审 / 未验证 |
| 20 | `public/js/modules/01-scene/04-bottom-controls-cursor.js` | 25 | 是 | 待审 / 未验证 |
| 21 | `public/js/modules/01-scene/05-ui-render-cache.js` | 26 | 是 | 待审 / 未验证 |
| 22 | `public/js/modules/02-visual/00-pointer-cover-particles.js` | 27 | 是 | 待审 / 未验证 |
| 23 | `public/js/modules/02-visual/01-float-skull-backcover.js` | 28 | 是 | 待审 / 未验证 |
| 24 | `public/js/modules/02-visual/02-lyrics-state-layout.js` | 29 | 是 | 待审 / 未验证 |
| 25 | `public/js/modules/02-visual/02a-lyric-work-scheduler.js` | 30 | 是 | 待审 / 未验证 |
| 26 | `public/js/modules/02-visual/03-lyrics-star-river.js` | 31 | 是 | 待审 / 未验证 |
| 27 | `public/js/modules/02-visual/04-visual-settings-persistence.js` | 32 | 是 | 待审 / 未验证 |
| 28 | `public/js/modules/02-visual/05-lyrics-fonts-texture.js` | 33 | 是 | 待审 / 未验证 |
| 29 | `public/js/modules/02-visual/06-custom-background-colorlab.js` | 34 | 是 | 待审 / 未验证 |
| 30 | `public/js/modules/02-visual/07-lyrics-palette-text-utils.js` | 35 | 是 | 待审 / 未验证 |
| 31 | `public/js/modules/02-visual/08-lyrics-display-modes.js` | 36 | 是 | 待审 / 未验证 |
| 32 | `public/js/modules/02-visual/09-lyrics-payloads.js` | 37 | 是 | 待审 / 未验证 |
| 33 | `public/js/modules/02-visual/10-lyrics-mask-textures.js` | 38 | 是 | 待审 / 未验证 |
| 34 | `public/js/modules/02-visual/11-lyrics-shaders.js` | 39 | 是 | 待审 / 未验证 |
| 35 | `public/js/modules/02-visual/12-lyrics-row-layers.js` | 40 | 是 | 待审 / 未验证 |
| 36 | `public/js/modules/02-visual/12a-lyrics-edit-preview.js` | 41 | 是 | 待审 / 未验证 |
| 37 | `public/js/modules/02-visual/13-lyrics-mesh-build.js` | 42 | 是 | 待审 / 未验证 |
| 38 | `public/js/modules/02-visual/14-stage-lyrics-rendering.js` | 43 | 是 | 待审 / 未验证 |
| 39 | `public/js/modules/02-visual/15-ripples-cover-depth.js` | 44 | 是 | 待审 / 未验证 |
| 40 | `public/sonic-performance-policy.js` | 45 | 是 | 待审 / 未验证 |
| 41 | `public/sonic-performance.js` | 46 | 是 | 待审 / 未验证 |
| 42 | `public/sonic-topography-preset.js` | 47 | 是 | 待审 / 未验证 |
| 43 | `public/sonic-workshop-preset.js` | 48 | 是 | 待审 / 未验证 |
| 44 | `public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js` | 49 | 是 | 待审 / 未验证 |
| 45 | `public/js/modules/03-beat/01-audio-beat-analysis.js` | 50 | 是 | 待审 / 未验证 |
| 46 | `public/js/modules/03-beat/02-podcast-dj-analysis.js` | 51 | 是 | 待审 / 未验证 |
| 47 | `public/js/modules/03-beat/03-local-beat-cache-modal.js` | 52 | 是 | 待审 / 未验证 |
| 48 | `public/js/modules/03-beat/04-beat-map-runtime.js` | 53 | 是 | 待审 / 未验证 |
| 49 | `public/js/modules/03-beat/05-cover-loading-crop.js` | 54 | 是 | 待审 / 未验证 |
| 50 | `public/js/modules/03-beat/05a-adjacent-preparation.js` | 55 | 是 | 待审 / 未验证 |
| 51 | `public/js/modules/03-beat/06-sonic-audio-monitor.js` | 56 | 是 | 待审 / 未验证 |
| 52 | `public/js/modules/04-shelf/00-layout-hover.js` | 57 | 是 | 待审 / 未验证 |
| 53 | `public/js/modules/04-shelf/01-manager-core.js` | 58 | 是 | 待审 / 未验证 |
| 54 | `public/js/modules/04-shelf/02-rebuild-panel-sync.js` | 59 | 是 | 待审 / 未验证 |
| 55 | `public/js/modules/04-shelf/03-content-list-manager.js` | 60 | 是 | 待审 / 未验证 |
| 56 | `public/js/modules/04-shelf/04-cover-api-helpers.js` | 61 | 是 | 待审 / 未验证 |
| 57 | `public/js/modules/04-shelf/04a-cover-loader.js` | 62 | 是 | 待审 / 未验证 |
| 58 | `public/js/modules/04-shelf/05-card-interactions.js` | 63 | 是 | 待审 / 未验证 |
| 59 | `public/js/modules/04-shelf/06-keyboard-camera-events.js` | 64 | 是 | 待审 / 未验证 |
| 60 | `public/js/modules/05-playback/00-api-quality-output.js` | 65 | 是 | 待审 / 未验证 |
| 61 | `public/js/modules/05-playback/01-cover-custom-map.js` | 66 | 是 | 待审 / 未验证 |
| 62 | `public/js/modules/05-playback/02-listen-stats.js` | 67 | 是 | 待审 / 未验证 |
| 63 | `public/js/modules/05-playback/03-home-discover-weather.js` | 68 | 是 | 待审 / 未验证 |
| 64 | `public/js/modules/05-playback/03a-home-dashboard.js` | 69 | 是 | 待审 / 未验证 |
| 65 | `public/js/modules/05-playback/04-home-empty-wallpaper.js` | 70 | 是 | 待审 / 未验证 |
| 66 | `public/js/modules/05-playback/05-home-actions.js` | 71 | 是 | 待审 / 未验证 |
| 67 | `public/js/modules/05-playback/06-track-detail-lyrics-actions.js` | 72 | 是 | 待审 / 未验证 |
| 68 | `public/js/modules/05-playback/06a-comment-replies.js` | 73 | 是 | 待审 / 未验证 |
| 69 | `public/js/modules/05-playback/06b-comment-avatars.js` | 74 | 是 | 待审 / 未验证 |
| 70 | `public/js/modules/05-playback/06c-search-pinyin.js` | 75 | 是 | 待审 / 未验证 |
| 71 | `public/js/modules/05-playback/07-search.js` | 76 | 是 | 待审 / 未验证 |
| 72 | `public/js/modules/05-playback/08-audio-graph-controls.js` | 77 | 是 | 待审 / 未验证 |
| 73 | `public/js/modules/05-playback/09-queue-snapshot-autoplay.js` | 78 | 是 | 待审 / 未验证 |
| 74 | `public/js/modules/05-playback/09a-playback-checkpoint.js` | 79 | 是 | 待审 / 未验证 |
| 75 | `public/js/modules/05-playback/10-queue-actions.js` | 80 | 是 | 待审 / 未验证 |
| 76 | `public/js/modules/05-playback/11-provider-fallback.js` | 81 | 是 | 待审 / 未验证 |
| 77 | `public/js/modules/05-playback/12-playback-switch-core.js` | 82 | 是 | 待审 / 未验证 |
| 78 | `public/js/modules/05-playback/13-playback-start-audio.js` | 83 | 是 | 待审 / 未验证 |
| 79 | `public/js/modules/05-playback/14-player-controls.js` | 84 | 是 | 待审 / 未验证 |
| 80 | `public/js/modules/05-playback/14a-system-media-session.js` | 85 | 是 | 待审 / 未验证 |
| 81 | `public/js/modules/05-playback/15-control-glass-animations.js` | 86 | 是 | 待审 / 未验证 |
| 82 | `public/js/modules/05-playback/16-cuefield-automix-core.js` | 87 | 是 | 待审 / 未验证 |
| 83 | `public/js/modules/05-playback/17-cuefield-timeline-executor.js` | 88 | 是 | 待审 / 未验证 |
| 84 | `public/js/modules/05-playback/17a-cuefield-bridge-engine.js` | 89 | 是 | 待审 / 未验证 |
| 85 | `public/js/modules/05-playback/17b-cuefield-source-loop.js` | 90 | 是 | 待审 / 未验证 |
| 86 | `public/js/modules/05-playback/18-cuefield-automix-integration.js` | 91 | 是 | 待审 / 未验证 |
| 87 | `public/js/modules/05-playback/19-microphone-mixer-runtime.js` | 92 | 是 | 待审 / 未验证 |
| 88 | `public/js/modules/05-playback/20-microphone-mixer-ui.js` | 93 | 是 | 待审 / 未验证 |
| 89 | `public/js/modules/06-lyrics/00-lyrics-fetch-parse.js` | 94 | 是 | 待审 / 未验证 |
| 90 | `public/js/modules/06-lyrics/00-built-in-playlists.js` | 95 | 是 | 待审 / 未验证 |
| 91 | `public/js/modules/06-lyrics/01-playlist-panel-shell.js` | 96 | 是 | 待审 / 未验证 |
| 92 | `public/js/modules/06-lyrics/01a-scroll-motion.js` | 97 | 是 | 待审 / 未验证 |
| 93 | `public/js/modules/06-lyrics/02-playlist-detail.js` | 98 | 是 | 待审 / 未验证 |
| 94 | `public/js/modules/06-lyrics/03-podcast-playlist-loaders.js` | 99 | 是 | 待审 / 未验证 |
| 95 | `public/js/modules/06-lyrics/04-progress-seek.js` | 100 | 是 | 待审 / 未验证 |
| 96 | `public/js/modules/06-lyrics/05-upload-dragdrop.js` | 101 | 是 | 待审 / 未验证 |
| 97 | `public/js/modules/06-lyrics/06-lyric-timing-offset.js` | 102 | 是 | 待审 / 未验证 |
| 98 | `public/js/modules/07-fx/00-preset-archive-data.js` | 103 | 是 | 待审 / 未验证 |
| 99 | `public/js/modules/07-fx/01-lyric-color-controls.js` | 104 | 是 | 待审 / 未验证 |
| 100 | `public/js/modules/07-fx/02a-album-cover-background.js` | 105 | 是 | 待审 / 未验证 |
| 101 | `public/js/modules/07-fx/02-accent-background-controls.js` | 106 | 是 | 待审 / 未验证 |
| 102 | `public/js/modules/07-fx/03a-wallpaper-engine-interaction.js` | 107 | 是 | 待审 / 未验证 |
| 103 | `public/js/modules/07-fx/03-wallpaper-engine-library.js` | 108 | 是 | 待审 / 未验证 |
| 104 | `public/js/modules/07-fx/03b-wallpaper-engine-loop.js` | 109 | 是 | 待审 / 未验证 |
| 105 | `public/js/modules/07-fx/03-cover-picker-fonts.js` | 110 | 是 | 待审 / 未验证 |
| 106 | `public/js/modules/07-fx/04-preset-grid-uniforms.js` | 111 | 是 | 待审 / 未验证 |
| 107 | `public/js/modules/07-fx/04a-effect-scope.js` | 112 | 是 | 待审 / 未验证 |
| 108 | `public/js/modules/07-fx/05-fx-panel-performance.js` | 113 | 是 | 待审 / 未验证 |
| 109 | `public/js/modules/07-fx/06-hotkeys.js` | 114 | 是 | 待审 / 未验证 |
| 110 | `public/js/modules/07-fx/06a-slider-preview.js` | 115 | 是 | 待审 / 未验证 |
| 111 | `public/js/modules/07-fx/07-bindings-shelf-immersive.js` | 116 | 是 | 待审 / 未验证 |
| 112 | `public/js/modules/07-fx/08-cache-storage-settings.js` | 117 | 是 | 待审 / 未验证 |
| 113 | `public/js/modules/07-fx/09-console-workspace.js` | 118 | 是 | 待审 / 未验证 |
| 114 | `public/js/modules/08-account/00-update-preview.js` | 119 | 是 | 待审 / 未验证 |
| 115 | `public/js/modules/08-account/01-login-modal-utils.js` | 120 | 是 | 待审 / 未验证 |
| 116 | `public/js/modules/08-account/01a-avatar-recovery.js` | 121 | 是 | 待审 / 未验证 |
| 117 | `public/js/modules/08-account/01b-content-priority.js` | 122 | 是 | 待审 / 未验证 |
| 118 | `public/js/modules/08-account/02-login-status.js` | 123 | 是 | 待审 / 未验证 |
| 119 | `public/js/modules/08-account/03-login-modal-flows.js` | 124 | 是 | 待审 / 未验证 |
| 120 | `public/js/modules/08-account/04-user-modal-logout.js` | 125 | 是 | 待审 / 未验证 |
| 121 | `public/js/modules/08-account/05-startup-login-guide.js` | 126 | 是 | 待审 / 未验证 |
| 122 | `public/js/modules/08-account/06-original-profile-import.js` | 127 | 是 | 待审 / 未验证 |
| 123 | `public/js/modules/09-idle-toast-libraries.js` | 128 | 是 | 待审 / 未验证 |
| 124 | `public/js/modules/09a-onboarding-guide.js` | 129 | 是 | 待审 / 未验证 |
| 125 | `public/js/modules/10-shell/00-gesture-control.js` | 130 | 是 | 待审 / 未验证 |
| 126 | `public/js/modules/10-shell/01-viewport-resize-shortcuts.js` | 131 | 是 | 待审 / 未验证 |
| 127 | `public/js/modules/10-shell/02-peek-panels-upload.js` | 132 | 是 | 待审 / 未验证 |
| 128 | `public/js/modules/10-shell/03-splash.js` | 133 | 是 | 待审 / 未验证 |
| 129 | `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js` | 134 | 是 | 待审 / 未验证 |
| 130 | `public/js/modules/10-shell/05-startup-bindings.js` | 135 | 是 | 待审 / 未验证 |
| 131 | `public/js/modules/11-main-loop.js` | 136 | 是 | 待审 / 未验证 |

index.html 外层脚本：

- `public/index.html:12`：顺序 1，`vendor/three.r128.min.js`
- `public/index.html:13`：顺序 2，`vendor/music-tempo.min.js`
- `public/index.html:14`：顺序 3，`vendor/gsap.min.js`
- `public/index.html:15`：顺序 4，`js/preload-mode.js`
- `public/index.html:1983`：顺序 5，`js/index-loader.js`

其他HTML内联/外部脚本的完整顺序在JSON `html_scripts`。不同宿主页不能当同一全局作用域。

## 附录 B：HTTP 路由分派（全部精确路径）

HTTP手写分派没有统一router schema。表中的方法是分支出现的method token，不等于只允许该方法；没有token的分支必须核实实际限制。Spotify另含 `/api/spotify/` 前缀拒绝分支；末尾 `/`→index.html及静态文件映射不是API，亦需验证路径边界。

| 路径 | server.js起止行 | 显式method token | 直接路径测试数 | frontend literal调用数 | 审查状态 |
|---|---:|---|---:|---:|---|
| `/api/spotify` | 5159–5162 | 未出现guard token | 0 | 21 | 待逐分支审查/未运行 |
| `/api/app/version` | 5164–5179 | 未出现guard token | 2 | 0 | 待逐分支审查/未运行 |
| `/api/platform/capabilities` | 5181–5206 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/listen/report` | 5208–5226 | POST | 0 | 1 | 待逐分支审查/未运行 |
| `/api/listen/total` | 5228–5249 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/update/latest` | 5251–5261 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/update/download` | 5263–5276 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/update/download/status` | 5263–5276 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/update/patch` | 5263–5276 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/update/patch/status` | 5263–5276 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/beatmap/cache/status` | 5278–5288 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/cuefield/transition` | 5292–5322 | POST | 1 | 1 | 待逐分支审查/未运行 |
| `/api/cuefield/feedback` | 5326–5347 | GET,POST | 1 | 1 | 待逐分支审查/未运行 |
| `/api/beatmap/cache` | 5349–5391 | GET,POST | 1 | 3 | 待逐分支审查/未运行 |
| `/api/discover/home` | 5393–5401 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/weather/radio` | 5403–5422 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/weather/ip-location` | 5424–5432 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/search` | 5435–5444 | 未出现guard token | 0 | 8 | 待逐分支审查/未运行 |
| `/api/search/overview` | 5446–5454 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/search/type` | 5456–5469 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/search/user-playlists` | 5472–5488 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qq/search` | 5490–5502 | 未出现guard token | 0 | 4 | 待逐分支审查/未运行 |
| `/api/kugou/search` | 5504–5516 | 未出现guard token | 0 | 3 | 待逐分支审查/未运行 |
| `/api/kugou/recommendations` | 5518–5526 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/login/qrcode` | 5528–5551 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/login/check` | 5553–5632 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/status` | 5634–5642 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/login/status` | 5634–5642 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/qishui/logout` | 5644–5655 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/qishui/search` | 5657–5668 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/qishui/feed` | 5670–5679 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/user/playlists` | 5681–5689 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/playlist/tracks` | 5691–5702 | 未出现guard token | 0 | 4 | 待逐分支审查/未运行 |
| `/api/qishui/song/like/check` | 5704–5714 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/song/like` | 5716–5733 | POST | 1 | 2 | 待逐分支审查/未运行 |
| `/api/qishui/playlist/collect` | 5735–5750 | POST | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/playlist/add-song` | 5752–5765 | POST | 1 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/album/collect` | 5767–5782 | POST | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qishui/song/comments` | 5784–5802 | POST | 1 | 2 | 待逐分支审查/未运行 |
| `/api/qishui/song/url` | 5804–5820 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/qishui/lyric` | 5822–5831 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/kugou/song/url` | 5833–5856 | 未出现guard token | 1 | 2 | 待逐分支审查/未运行 |
| `/api/kugou/song/comments` | 5858–5870 | GET | 1 | 1 | 待逐分支审查/未运行 |
| `/api/kugou/lyric` | 5872–5885 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/login/attempt` | 5887–5904 | POST | 1 | 2 | 待逐分支审查/未运行 |
| `/api/kugou/login/status` | 5906–5914 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/kugou/login/cookie` | 5916–5939 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/kugou/logout` | 5941–5946 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/kugou/user/playlists` | 5948–5956 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/kugou/playlist/tracks` | 5958–5970 | 未出现guard token | 0 | 4 | 待逐分支审查/未运行 |
| `/api/kugou/song/like/check` | 5972–5985 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/kugou/song/like` | 5987–6002 | POST | 0 | 2 | 待逐分支审查/未运行 |
| `/api/kugou/playlist/add-song` | 6004–6020 | POST | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qq/song/url` | 6022–6041 | 未出现guard token | 0 | 3 | 待逐分支审查/未运行 |
| `/api/qq/lyric` | 6043–6055 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qq/login/status` | 6058–6068 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qq/login/cookie` | 6070–6104 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/qq/logout` | 6106–6111 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/qq/user/playlists` | 6113–6122 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qq/recommendations` | 6124–6132 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/qq/playlist/tracks` | 6134–6147 | 未出现guard token | 0 | 3 | 待逐分支审查/未运行 |
| `/api/qq/artist/detail` | 6149–6164 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qq/album/detail` | 6166–6180 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/qq/song/comments` | 6182–6196 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/podcast/search` | 6198–6213 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/podcast/hot` | 6215–6229 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/podcast/detail` | 6231–6244 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |
| `/api/podcast/programs` | 6246–6265 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/podcast/my` | 6267–6291 | 未出现guard token | 0 | 3 | 待逐分支审查/未运行 |
| `/api/podcast/my/items` | 6293–6307 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/album/detail` | 6309–6323 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/album/subscribe` | 6325–6341 | POST | 1 | 2 | 待逐分支审查/未运行 |
| `/api/album/subscribe/check` | 6343–6372 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/playlist/subscribe` | 6374–6390 | POST | 1 | 1 | 待逐分支审查/未运行 |
| `/api/song/url` | 6392–6420 | 未出现guard token | 0 | 4 | 待逐分支审查/未运行 |
| `/api/login/cookie` | 6422–6461 | 未出现guard token | 1 | 2 | 待逐分支审查/未运行 |
| `/api/podcast/dj-beatmap` | 6465–6486 | 未出现guard token | 1 | 2 | 待逐分支审查/未运行 |
| `/api/login/qr/key` | 6488–6503 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/login/qr/create` | 6506–6517 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/login/qr/check` | 6520–6585 | 未出现guard token | 1 | 1 | 待逐分支审查/未运行 |
| `/api/login/status` | 6588–6593 | 未出现guard token | 2 | 3 | 待逐分支审查/未运行 |
| `/api/logout` | 6596–6603 | 未出现guard token | 1 | 2 | 待逐分支审查/未运行 |
| `/api/user/playlists` | 6606–6637 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/song/like/check` | 6640–6656 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/song/like` | 6659–6678 | POST | 0 | 2 | 待逐分支审查/未运行 |
| `/api/playlist/create` | 6681–6697 | POST | 0 | 1 | 待逐分支审查/未运行 |
| `/api/playlist/add-song` | 6700–6749 | POST | 0 | 1 | 待逐分支审查/未运行 |
| `/api/lyric` | 6772–6806 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/song/comment/replies` | 6809–6839 | GET | 1 | 1 | 待逐分支审查/未运行 |
| `/api/song/comments` | 6841–6873 | POST | 4 | 3 | 待逐分支审查/未运行 |
| `/api/song/comments/like` | 6875–6892 | POST | 1 | 1 | 待逐分支审查/未运行 |
| `/api/artist/albums` | 6895–6905 | 未出现guard token | 0 | 2 | 待逐分支审查/未运行 |
| `/api/artist/detail` | 6907–6952 | 未出现guard token | 0 | 1 | 待逐分支审查/未运行 |
| `/api/playlist/tracks` | 6955–6991 | 未出现guard token | 1 | 4 | 待逐分支审查/未运行 |
| `/api/cover` | 6994–7030 | 未出现guard token | 5 | 2 | 待逐分支审查/未运行 |
| `/api/audio` | 7033–7113 | 未出现guard token | 2 | 5 | 待逐分支审查/未运行 |
| `/favicon.ico` | 7116–7119 | 未出现guard token | 0 | 0 | 待逐分支审查/未运行 |

每条路由全部helper调用、已有测试及前端调用行在JSON `http_routes`。零路径引用不等于零测试，已有VM可能只测试helper；必须逐断言核对。

## 附录 C：IPC channel 与 preload（全部）

| channel | main handler定位 | preload/renderer调用定位 | 字面测试数 |
|---|---|---|---:|
| `desktop-window-close` | `desktop/main.js:5027` (handle) | `desktop/preload.js:100` (invoke) | 0 |
| `desktop-window-exit-fullscreen-windowed` | `desktop/main.js:4209` (handle) | `desktop/preload.js:31` (invoke) | 0 |
| `desktop-window-get-close-behavior` | `desktop/main.js:5033` (handle) | `desktop/preload.js:101` (invoke) | 0 |
| `desktop-window-get-state` | `desktop/main.js:4230` (handle) | `desktop/preload.js:33` (invoke) | 0 |
| `desktop-window-minimize` | `desktop/main.js:4165` (handle) | `desktop/preload.js:27` (invoke) | 1 |
| `desktop-window-restore` | `desktop/main.js:4175` (handle) | `desktop/preload.js:28` (invoke) | 0 |
| `desktop-window-set-close-behavior` | `desktop/main.js:5037` (handle) | `desktop/preload.js:102` (invoke) | 0 |
| `desktop-window-state` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:1836` (send)<br>`desktop/preload.js:193` (on) | 0 |
| `desktop-window-toggle-fullscreen` | `desktop/main.js:4200` (handle) | `desktop/preload.js:30` (invoke) | 0 |
| `desktop-window-toggle-maximize` | `desktop/main.js:4191` (handle) | `desktop/preload.js:29` (invoke) | 0 |
| `kugou-music-clear-login` | `desktop/main.js:5186` (handle) | `desktop/preload.js:117` (invoke) | 1 |
| `kugou-music-open-login` | `desktop/main.js:5181` (handle) | `desktop/preload.js:116` (invoke) | 1 |
| `mineradio-built-in-playlist-add-track` | `desktop/main.js:4908` (handle) | `desktop/preload.js:77` (invoke) | 1 |
| `mineradio-built-in-playlist-create` | `desktop/main.js:4893` (handle) | `desktop/preload.js:74` (invoke) | 0 |
| `mineradio-built-in-playlist-delete` | `desktop/main.js:4903` (handle) | `desktop/preload.js:76` (invoke) | 0 |
| `mineradio-built-in-playlist-page` | `desktop/main.js:4878` (handle) | `desktop/preload.js:73` (invoke) | 0 |
| `mineradio-built-in-playlist-remove-track` | `desktop/main.js:4913` (handle) | `desktop/preload.js:78` (invoke) | 0 |
| `mineradio-built-in-playlist-rename` | `desktop/main.js:4898` (handle) | `desktop/preload.js:75` (invoke) | 0 |
| `mineradio-built-in-playlist-reorder-track` | `desktop/main.js:4918` (handle) | `desktop/preload.js:79` (invoke) | 0 |
| `mineradio-built-in-playlists-list` | `desktop/main.js:4873` (handle) | `desktop/preload.js:72` (invoke) | 0 |
| `mineradio-cache-choose-directory` | `desktop/main.js:4393` (handle) | `desktop/preload.js:40` (invoke) | 0 |
| `mineradio-cache-get-settings` | `desktop/main.js:4385` (handle) | `desktop/preload.js:39` (invoke) | 0 |
| `mineradio-cache-read-lyric` | `desktop/main.js:4994` (handle) | `desktop/preload.js:98` (invoke) | 0 |
| `mineradio-cache-set-settings` | `desktop/main.js:4403` (handle) | `desktop/preload.js:41` (invoke) | 0 |
| `mineradio-cache-write-lyric` | `desktop/main.js:5009` (handle) | `desktop/preload.js:99` (invoke) | 0 |
| `mineradio-clear-all-login` | `desktop/main.js:5163` (handle) | `desktop/preload.js:103` (invoke) | 0 |
| `mineradio-current-fx-autosave-read-sync` | `desktop/main.js:5126` (on) | `desktop/preload.js:143` (sendSync) | 0 |
| `mineradio-current-fx-autosave-save` | `desktop/main.js:5134` (handle) | `desktop/preload.js:149` (invoke) | 0 |
| `mineradio-current-fx-autosave-save-sync` | `desktop/main.js:5130` (on) | `desktop/preload.js:148` (sendSync) | 0 |
| `mineradio-desktop-lyrics-enabled-state` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:3943` (send)<br>`desktop/preload.js:167` (on) | 0 |
| `mineradio-desktop-lyrics-lock-state` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:3936` (send)<br>`desktop/preload.js:161` (on) | 0 |
| `mineradio-desktop-lyrics-move-by` | `desktop/main.js:5332` (handle) | `desktop/overlay-preload.js:17` (invoke) | 0 |
| `mineradio-desktop-lyrics-set-dragging` | `desktop/main.js:5293` (handle) | `desktop/overlay-preload.js:13` (invoke) | 0 |
| `mineradio-desktop-lyrics-set-enabled` | `desktop/main.js:5262` (handle) | `desktop/overlay-preload.js:18` (invoke)<br>`desktop/preload.js:156` (invoke) | 0 |
| `mineradio-desktop-lyrics-set-hot-bounds` | `desktop/main.js:5307` (handle) | `desktop/overlay-preload.js:15` (invoke) | 0 |
| `mineradio-desktop-lyrics-set-lock-state` | `desktop/main.js:5320` (handle) | `desktop/overlay-preload.js:16` (invoke) | 0 |
| `mineradio-desktop-lyrics-set-pointer-capture` | `desktop/main.js:5297` (handle) | `desktop/overlay-preload.js:14` (invoke) | 0 |
| `mineradio-desktop-lyrics-state` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:3958` (send) | 0 |
| `mineradio-desktop-lyrics-update` | `desktop/main.js:5276` (handle) | `desktop/preload.js:157` (invoke) | 0 |
| `mineradio-export-json-file` | `desktop/main.js:5067` (handle) | `desktop/preload.js:138` (invoke) | 0 |
| `mineradio-full-desktop-icon-shields` | `desktop/main.js:4234` (on) | `desktop/preload.js:174` (send) | 0 |
| `mineradio-full-desktop-pointer-route` | `desktop/main.js:4301` (on) | `desktop/preload.js:181` (send) | 0 |
| `mineradio-full-desktop-request-keyboard-focus` | `desktop/main.js:4257` (handle) | `desktop/preload.js:177` (invoke) | 0 |
| `mineradio-full-desktop-set-icons-visible` | `desktop/main.js:4245` (handle) | `desktop/preload.js:176` (invoke) | 0 |
| `mineradio-full-desktop-set-software-lock` | `desktop/main.js:4250` (handle) | `desktop/preload.js:175` (invoke) | 0 |
| `mineradio-gesture-camera-request-permission` | `desktop/main.js:5360` (handle) | `desktop/preload.js:173` (invoke) | 1 |
| `mineradio-get-gpu-diagnostics` | `desktop/main.js:4309` (handle) | `desktop/preload.js:34` (invoke) | 0 |
| `mineradio-global-hotkey` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:1841` (send)<br>`desktop/preload.js:153` (on) | 0 |
| `mineradio-hotkeys-configure-global` | `desktop/main.js:5046` (handle) | `desktop/preload.js:132` (invoke) | 0 |
| `mineradio-import-browser-login` | `desktop/main.js:5054` (handle) | `desktop/preload.js:139` (invoke) | 0 |
| `mineradio-import-json-file` | `desktop/main.js:5085` (handle) | `desktop/preload.js:140` (invoke) | 0 |
| `mineradio-local-library-authorize` | `desktop/main.js:4944` (handle) | `desktop/preload.js:94` (invoke) | 1 |
| `mineradio-local-library-import` | `desktop/main.js:4978` (handle) | `desktop/preload.js:96` (invoke) | 0 |
| `mineradio-local-library-list` | `desktop/main.js:4859` (handle) | `desktop/preload.js:69` (invoke) | 0 |
| `mineradio-local-library-lyric` | `desktop/main.js:4923` (handle) | `desktop/preload.js:71` (invoke) | 1 |
| `mineradio-local-library-resolve` | `desktop/main.js:4868` (handle) | `desktop/preload.js:70` (invoke) | 0 |
| `mineradio-memory-configure-auto` | `desktop/main.js:4331` (handle) | `desktop/preload.js:36` (invoke) | 0 |
| `mineradio-memory-get-snapshot` | `desktop/main.js:4313` (handle) | `desktop/preload.js:35` (invoke) | 0 |
| `mineradio-memory-purge-system` | `desktop/main.js:4349` (handle) | `desktop/preload.js:38` (invoke) | 0 |
| `mineradio-memory-trim-app` | `desktop/main.js:4345` (handle) | `desktop/preload.js:37` (invoke) | 0 |
| `mineradio-microphone-begin-capture` | `desktop/main.js:5367` (handle) | `desktop/preload.js:24` (invoke) | 1 |
| `mineradio-microphone-end-capture` | `desktop/main.js:5368` (handle) | `desktop/preload.js:26` (invoke) | 1 |
| `mineradio-microphone-enumerate` | `desktop/main.js:5366` (handle) | `desktop/preload.js:18` (invoke) | 0 |
| `mineradio-onboarding-read-sync` | `desktop/main.js:5108` (on) | `desktop/preload.js:146` (sendSync) | 0 |
| `mineradio-onboarding-seen-sync` | `desktop/main.js:5112` (on) | `desktop/preload.js:147` (sendSync) | 0 |
| `mineradio-open-update-page` | `desktop/main.js:5195` (handle) | `desktop/preload.js:119` (invoke) | 1 |
| `mineradio-original-profile-import` | `desktop/main.js:5236` (handle) | `desktop/preload.js:124` (invoke) | 0 |
| `mineradio-original-profile-inspect` | `desktop/main.js:5230` (handle) | `desktop/preload.js:123` (invoke) | 0 |
| `mineradio-playback-checkpoint-read-sync` | `desktop/main.js:5102` (on) | `desktop/preload.js:144` (sendSync) | 0 |
| `mineradio-playback-checkpoint-save` | `desktop/main.js:5105` (handle) | `desktop/preload.js:145` (invoke) | 0 |
| `mineradio-remix-update-check` | `desktop/main.js:5209` (handle) | `desktop/preload.js:120` (invoke) | 0 |
| `mineradio-remix-update-download` | `desktop/main.js:5213` (handle) | `desktop/preload.js:121` (invoke) | 0 |
| `mineradio-remix-update-install` | `desktop/main.js:5217` (handle) | `desktop/preload.js:122` (invoke) | 0 |
| `mineradio-remix-update-state` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:123` (send)<br>`desktop/preload.js:128` (on) | 0 |
| `mineradio-restart-app` | `desktop/main.js:5252` (handle)<br>`tests/original-profile-entry-electron-smoke.js:36` (handle) | `desktop/preload.js:131` (invoke) | 1 |
| `mineradio-sonic-preferences-read-sync` | `desktop/main.js:5117` (on) | `desktop/preload.js:141` (sendSync) | 0 |
| `mineradio-sonic-preferences-save-sync` | `desktop/main.js:5121` (on) | `desktop/preload.js:142` (sendSync) | 0 |
| `mineradio-wallpaper-engine-activate-dwm-surface` | `desktop/main.js:4746` (handle) | `desktop/preload.js:57` (invoke) | 0 |
| `mineradio-wallpaper-engine-capture-result` | `desktop/main.js:4650` (handle) | `desktop/preload.js:55` (invoke) | 0 |
| `mineradio-wallpaper-engine-choose-directory` | `desktop/main.js:4495` (handle) | `desktop/preload.js:50` (invoke) | 0 |
| `mineradio-wallpaper-engine-choose-project-file` | `desktop/main.js:4515` (handle) | `desktop/preload.js:51` (invoke) | 0 |
| `mineradio-wallpaper-engine-glass-surface` | `desktop/main.js:4764` (on) | `desktop/preload.js:58` (send) | 0 |
| `mineradio-wallpaper-engine-host-bounds-changed` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:1300` (send)<br>`desktop/main.js:1323` (send)<br>`desktop/main.js:1356` (send)<br>`desktop/main.js:1701` (send)<br>`desktop/preload.js:66` (on) | 0 |
| `mineradio-wallpaper-engine-list` | `desktop/main.js:4417` (handle) | `desktop/preload.js:42` (invoke) | 0 |
| `mineradio-wallpaper-engine-loop-cache` | `desktop/main.js:4820` (handle) | `desktop/preload.js:62` (invoke) | 0 |
| `mineradio-wallpaper-engine-open-project-details` | `desktop/main.js:4463` (handle) | `desktop/preload.js:46` (invoke) | 0 |
| `mineradio-wallpaper-engine-pointer-activity` | `desktop/main.js:4788` (on) | `desktop/preload.js:60` (send) | 0 |
| `mineradio-wallpaper-engine-prepare-glass-capture` | `desktop/main.js:4685` (handle) | `desktop/preload.js:56` (invoke) | 0 |
| `mineradio-wallpaper-engine-project-details` | `desktop/main.js:4428` (handle) | `desktop/preload.js:43` (invoke) | 0 |
| `mineradio-wallpaper-engine-property-path` | `desktop/main.js:4444` (handle) | `desktop/preload.js:45` (invoke) | 0 |
| `mineradio-wallpaper-engine-remove-directory` | `desktop/main.js:4539` (handle) | `desktop/preload.js:52` (invoke) | 0 |
| `mineradio-wallpaper-engine-runtime-status` | `desktop/main.js:4550` (handle) | `desktop/preload.js:53` (invoke) | 0 |
| `mineradio-wallpaper-engine-set-properties` | `desktop/main.js:4437` (handle) | `desktop/preload.js:44` (invoke) | 0 |
| `mineradio-wallpaper-engine-start-scene` | `desktop/main.js:4560` (handle) | `desktop/preload.js:54` (invoke) | 0 |
| `mineradio-wallpaper-engine-stop-scene` | `desktop/main.js:4835` (handle) | `desktop/preload.js:61` (invoke) | 0 |
| `mineradio-wallpaper-engine-visual-settings` | `desktop/main.js:4776` (on) | `desktop/preload.js:59` (send) | 1 |
| `mineradio-wallpaper-get-status` | `desktop/main.js:5380` (handle) | `desktop/preload.js:172` (invoke) | 0 |
| `mineradio-wallpaper-loop-window` | `desktop/main.js:4218` (handle) | `desktop/preload.js:32` (invoke) | 0 |
| `mineradio-wallpaper-runtime-state` | 无main handle/on（可能是main outbound事件） | `desktop/main.js:874` (send)<br>`desktop/preload.js:188` (on) | 0 |
| `mineradio-wallpaper-set-enabled` | `desktop/main.js:5350` (handle) | `desktop/preload.js:170` (invoke) | 0 |
| `mineradio-wallpaper-state` | 无main handle/on（可能是main outbound事件） | `desktop/wallpaper-mode-runtime.js:395` (send) | 0 |
| `mineradio-wallpaper-update` | `desktop/main.js:5370` (handle) | `desktop/preload.js:171` (invoke) | 0 |
| `netease-music-clear-login` | `desktop/main.js:5169` (handle) | `desktop/preload.js:113` (invoke) | 0 |
| `netease-music-open-login` | `desktop/main.js:5148` (handle) | `desktop/preload.js:104` (invoke) | 1 |
| `provider-login-inline-cancel` | `desktop/main.js:5152` (handle) | `desktop/preload.js:105` (invoke) | 0 |
| `provider-login-inline-click` | `desktop/main.js:5158` (handle) | `desktop/preload.js:106` (invoke) | 0 |
| `provider-login-inline-qr` | 无main handle/on（可能是main outbound事件） | `desktop/preload.js:110` (on) | 0 |
| `qishui-music-clear-login` | `desktop/main.js:5191` (handle) | `desktop/preload.js:118` (invoke) | 0 |
| `qq-music-clear-login` | `desktop/main.js:5177` (handle) | `desktop/preload.js:115` (invoke) | 0 |
| `qq-music-open-login` | `desktop/main.js:5173` (handle) | `desktop/preload.js:114` (invoke) | 1 |

| namespace.method | preload位置 | IPC channel |
|---|---|---|
| `desktopOverlay.onLyricsState` | `desktop/overlay-preload.js:11` | 事件订阅/本地逻辑，见calls |
| `desktopOverlay.onWallpaperState` | `desktop/overlay-preload.js:12` | 事件订阅/本地逻辑，见calls |
| `desktopOverlay.setLyricsDrag` | `desktop/overlay-preload.js:13` | `mineradio-desktop-lyrics-set-dragging` |
| `desktopOverlay.setLyricsPointerCapture` | `desktop/overlay-preload.js:14` | `mineradio-desktop-lyrics-set-pointer-capture` |
| `desktopOverlay.setLyricsHotBounds` | `desktop/overlay-preload.js:15` | `mineradio-desktop-lyrics-set-hot-bounds` |
| `desktopOverlay.setLyricsLockState` | `desktop/overlay-preload.js:16` | `mineradio-desktop-lyrics-set-lock-state` |
| `desktopOverlay.moveLyricsBy` | `desktop/overlay-preload.js:17` | `mineradio-desktop-lyrics-move-by` |
| `desktopOverlay.closeLyrics` | `desktop/overlay-preload.js:18` | `mineradio-desktop-lyrics-set-enabled` |
| `desktopWindow.isDesktop` | `desktop/preload.js:13` | 事件订阅/本地逻辑，见calls |
| `desktopWindow.beginMicrophoneEnumeration` | `desktop/preload.js:14` | `mineradio-microphone-enumerate` |
| `desktopWindow.beginMicrophoneCapture` | `desktop/preload.js:20` | `mineradio-microphone-begin-capture` |
| `desktopWindow.endMicrophoneCapture` | `desktop/preload.js:26` | `mineradio-microphone-end-capture` |
| `desktopWindow.minimize` | `desktop/preload.js:27` | `desktop-window-minimize` |
| `desktopWindow.restore` | `desktop/preload.js:28` | `desktop-window-restore` |
| `desktopWindow.toggleMaximize` | `desktop/preload.js:29` | `desktop-window-toggle-maximize` |
| `desktopWindow.toggleFullscreen` | `desktop/preload.js:30` | `desktop-window-toggle-fullscreen` |
| `desktopWindow.exitFullscreenWindowed` | `desktop/preload.js:31` | `desktop-window-exit-fullscreen-windowed` |
| `desktopWindow.wallpaperEngineLoopWindow` | `desktop/preload.js:32` | `mineradio-wallpaper-loop-window` |
| `desktopWindow.getState` | `desktop/preload.js:33` | `desktop-window-get-state` |
| `desktopWindow.getGpuDiagnostics` | `desktop/preload.js:34` | `mineradio-get-gpu-diagnostics` |
| `desktopWindow.getMemorySnapshot` | `desktop/preload.js:35` | `mineradio-memory-get-snapshot` |
| `desktopWindow.configureMemoryReduct` | `desktop/preload.js:36` | `mineradio-memory-configure-auto` |
| `desktopWindow.trimAppMemory` | `desktop/preload.js:37` | `mineradio-memory-trim-app` |
| `desktopWindow.purgeSystemMemory` | `desktop/preload.js:38` | `mineradio-memory-purge-system` |
| `desktopWindow.getCacheSettings` | `desktop/preload.js:39` | `mineradio-cache-get-settings` |
| `desktopWindow.chooseCacheDirectory` | `desktop/preload.js:40` | `mineradio-cache-choose-directory` |
| `desktopWindow.setCacheSettings` | `desktop/preload.js:41` | `mineradio-cache-set-settings` |
| `desktopWindow.listWallpaperEngineProjects` | `desktop/preload.js:42` | `mineradio-wallpaper-engine-list` |
| `desktopWindow.getWallpaperEngineProjectDetails` | `desktop/preload.js:43` | `mineradio-wallpaper-engine-project-details` |
| `desktopWindow.setWallpaperEngineProjectProperties` | `desktop/preload.js:44` | `mineradio-wallpaper-engine-set-properties` |
| `desktopWindow.chooseWallpaperEnginePropertyPath` | `desktop/preload.js:45` | `mineradio-wallpaper-engine-property-path` |
| `desktopWindow.openWallpaperEngineProjectDetails` | `desktop/preload.js:46` | `mineradio-wallpaper-engine-open-project-details` |
| `desktopWindow.chooseWallpaperEngineDirectory` | `desktop/preload.js:50` | `mineradio-wallpaper-engine-choose-directory` |
| `desktopWindow.chooseWallpaperEngineProjectFile` | `desktop/preload.js:51` | `mineradio-wallpaper-engine-choose-project-file` |
| `desktopWindow.removeWallpaperEngineDirectory` | `desktop/preload.js:52` | `mineradio-wallpaper-engine-remove-directory` |
| `desktopWindow.getWallpaperEngineRuntimeStatus` | `desktop/preload.js:53` | `mineradio-wallpaper-engine-runtime-status` |
| `desktopWindow.startWallpaperEngineScene` | `desktop/preload.js:54` | `mineradio-wallpaper-engine-start-scene` |
| `desktopWindow.reportWallpaperEngineCaptureResult` | `desktop/preload.js:55` | `mineradio-wallpaper-engine-capture-result` |
| `desktopWindow.prepareWallpaperEngineGlassCapture` | `desktop/preload.js:56` | `mineradio-wallpaper-engine-prepare-glass-capture` |
| `desktopWindow.activateWallpaperEngineDwmSurface` | `desktop/preload.js:57` | `mineradio-wallpaper-engine-activate-dwm-surface` |
| `desktopWindow.updateWallpaperEngineGlassSurface` | `desktop/preload.js:58` | `mineradio-wallpaper-engine-glass-surface` |
| `desktopWindow.updateWallpaperEngineVisualSettings` | `desktop/preload.js:59` | `mineradio-wallpaper-engine-visual-settings` |
| `desktopWindow.reportWallpaperEnginePointerActivity` | `desktop/preload.js:60` | `mineradio-wallpaper-engine-pointer-activity` |
| `desktopWindow.stopWallpaperEngineScene` | `desktop/preload.js:61` | `mineradio-wallpaper-engine-stop-scene` |
| `desktopWindow.wallpaperEngineLoopCache` | `desktop/preload.js:62` | `mineradio-wallpaper-engine-loop-cache` |
| `desktopWindow.onWallpaperEngineHostBoundsChanged` | `desktop/preload.js:63` | `mineradio-wallpaper-engine-host-bounds-changed` |
| `desktopWindow.listLocalMusicLibrary` | `desktop/preload.js:69` | `mineradio-local-library-list` |
| `desktopWindow.resolveLocalMusicTrack` | `desktop/preload.js:70` | `mineradio-local-library-resolve` |
| `desktopWindow.readLocalMusicLyric` | `desktop/preload.js:71` | `mineradio-local-library-lyric` |
| `desktopWindow.listBuiltInPlaylists` | `desktop/preload.js:72` | `mineradio-built-in-playlists-list` |
| `desktopWindow.readBuiltInPlaylist` | `desktop/preload.js:73` | `mineradio-built-in-playlist-page` |
| `desktopWindow.createBuiltInPlaylist` | `desktop/preload.js:74` | `mineradio-built-in-playlist-create` |
| `desktopWindow.renameBuiltInPlaylist` | `desktop/preload.js:75` | `mineradio-built-in-playlist-rename` |
| `desktopWindow.deleteBuiltInPlaylist` | `desktop/preload.js:76` | `mineradio-built-in-playlist-delete` |
| `desktopWindow.addBuiltInPlaylistTrack` | `desktop/preload.js:77` | `mineradio-built-in-playlist-add-track` |
| `desktopWindow.removeBuiltInPlaylistTrack` | `desktop/preload.js:78` | `mineradio-built-in-playlist-remove-track` |
| `desktopWindow.reorderBuiltInPlaylistTrack` | `desktop/preload.js:79` | `mineradio-built-in-playlist-reorder-track` |
| `desktopWindow.importLocalMusicFiles` | `desktop/preload.js:80` | `mineradio-local-library-authorize`, `mineradio-local-library-import` |
| `desktopWindow.readLyricCache` | `desktop/preload.js:98` | `mineradio-cache-read-lyric` |
| `desktopWindow.writeLyricCache` | `desktop/preload.js:99` | `mineradio-cache-write-lyric` |
| `desktopWindow.close` | `desktop/preload.js:100` | `desktop-window-close` |
| `desktopWindow.getCloseBehavior` | `desktop/preload.js:101` | `desktop-window-get-close-behavior` |
| `desktopWindow.setCloseBehavior` | `desktop/preload.js:102` | `desktop-window-set-close-behavior` |
| `desktopWindow.clearAllLoginState` | `desktop/preload.js:103` | `mineradio-clear-all-login` |
| `desktopWindow.openNeteaseMusicLogin` | `desktop/preload.js:104` | `netease-music-open-login` |
| `desktopWindow.cancelInlineLogin` | `desktop/preload.js:105` | `provider-login-inline-cancel` |
| `desktopWindow.clickInlineLoginQr` | `desktop/preload.js:106` | `provider-login-inline-click` |
| `desktopWindow.onInlineLoginQr` | `desktop/preload.js:107` | `provider-login-inline-qr` |
| `desktopWindow.clearNeteaseMusicLogin` | `desktop/preload.js:113` | `netease-music-clear-login` |
| `desktopWindow.openQQMusicLogin` | `desktop/preload.js:114` | `qq-music-open-login` |
| `desktopWindow.clearQQMusicLogin` | `desktop/preload.js:115` | `qq-music-clear-login` |
| `desktopWindow.openKugouMusicLogin` | `desktop/preload.js:116` | `kugou-music-open-login` |
| `desktopWindow.clearKugouMusicLogin` | `desktop/preload.js:117` | `kugou-music-clear-login` |
| `desktopWindow.clearQishuiMusicLogin` | `desktop/preload.js:118` | `qishui-music-clear-login` |
| `desktopWindow.openUpdatePage` | `desktop/preload.js:119` | `mineradio-open-update-page` |
| `desktopWindow.checkRemixUpdate` | `desktop/preload.js:120` | `mineradio-remix-update-check` |
| `desktopWindow.downloadRemixUpdate` | `desktop/preload.js:121` | `mineradio-remix-update-download` |
| `desktopWindow.installRemixUpdate` | `desktop/preload.js:122` | `mineradio-remix-update-install` |
| `desktopWindow.inspectOriginalProfile` | `desktop/preload.js:123` | `mineradio-original-profile-inspect` |
| `desktopWindow.importOriginalProfile` | `desktop/preload.js:124` | `mineradio-original-profile-import` |
| `desktopWindow.onRemixUpdateState` | `desktop/preload.js:125` | `mineradio-remix-update-state` |
| `desktopWindow.restartApp` | `desktop/preload.js:131` | `mineradio-restart-app` |
| `desktopWindow.configureGlobalHotkeys` | `desktop/preload.js:132` | `mineradio-hotkeys-configure-global` |
| `desktopWindow.copyText` | `desktop/preload.js:133` | 事件订阅/本地逻辑，见calls |
| `desktopWindow.readText` | `desktop/preload.js:137` | 事件订阅/本地逻辑，见calls |
| `desktopWindow.exportJsonFile` | `desktop/preload.js:138` | `mineradio-export-json-file` |
| `desktopWindow.importBrowserLogin` | `desktop/preload.js:139` | `mineradio-import-browser-login` |
| `desktopWindow.importJsonFile` | `desktop/preload.js:140` | `mineradio-import-json-file` |
| `desktopWindow.readSonicPreferencesSync` | `desktop/preload.js:141` | `mineradio-sonic-preferences-read-sync` |
| `desktopWindow.saveSonicPreferencesSync` | `desktop/preload.js:142` | `mineradio-sonic-preferences-save-sync` |
| `desktopWindow.readCurrentFxAutosaveSync` | `desktop/preload.js:143` | `mineradio-current-fx-autosave-read-sync` |
| `desktopWindow.readPlaybackCheckpointSync` | `desktop/preload.js:144` | `mineradio-playback-checkpoint-read-sync` |
| `desktopWindow.savePlaybackCheckpoint` | `desktop/preload.js:145` | `mineradio-playback-checkpoint-save` |
| `desktopWindow.readOnboardingStateSync` | `desktop/preload.js:146` | `mineradio-onboarding-read-sync` |
| `desktopWindow.markOnboardingSeenSync` | `desktop/preload.js:147` | `mineradio-onboarding-seen-sync` |
| `desktopWindow.saveCurrentFxAutosaveSync` | `desktop/preload.js:148` | `mineradio-current-fx-autosave-save-sync` |
| `desktopWindow.saveCurrentFxAutosave` | `desktop/preload.js:149` | `mineradio-current-fx-autosave-save` |
| `desktopWindow.onGlobalHotkey` | `desktop/preload.js:150` | `mineradio-global-hotkey` |
| `desktopWindow.setDesktopLyricsEnabled` | `desktop/preload.js:156` | `mineradio-desktop-lyrics-set-enabled` |
| `desktopWindow.updateDesktopLyrics` | `desktop/preload.js:157` | `mineradio-desktop-lyrics-update` |
| `desktopWindow.onDesktopLyricsLockState` | `desktop/preload.js:158` | `mineradio-desktop-lyrics-lock-state` |
| `desktopWindow.onDesktopLyricsEnabledState` | `desktop/preload.js:164` | `mineradio-desktop-lyrics-enabled-state` |
| `desktopWindow.setWallpaperMode` | `desktop/preload.js:170` | `mineradio-wallpaper-set-enabled` |
| `desktopWindow.updateWallpaperMode` | `desktop/preload.js:171` | `mineradio-wallpaper-update` |
| `desktopWindow.getWallpaperModeStatus` | `desktop/preload.js:172` | `mineradio-wallpaper-get-status` |
| `desktopWindow.requestGestureCameraPermission` | `desktop/preload.js:173` | `mineradio-gesture-camera-request-permission` |
| `desktopWindow.updateDesktopIconShields` | `desktop/preload.js:174` | `mineradio-full-desktop-icon-shields` |
| `desktopWindow.setDesktopSoftwareLocked` | `desktop/preload.js:175` | `mineradio-full-desktop-set-software-lock` |
| `desktopWindow.setDesktopIconsVisible` | `desktop/preload.js:176` | `mineradio-full-desktop-set-icons-visible` |
| `desktopWindow.requestDesktopKeyboardFocus` | `desktop/preload.js:177` | `mineradio-full-desktop-request-keyboard-focus` |
| `desktopWindow.updateDesktopPointerRoute` | `desktop/preload.js:181` | `mineradio-full-desktop-pointer-route` |
| `desktopWindow.onWallpaperModeState` | `desktop/preload.js:185` | `mineradio-wallpaper-runtime-state` |
| `desktopWindow.onStateChange` | `desktop/preload.js:191` | `desktop-window-state` |

对每一handler核实sender/main-frame、参数类型/长度/路径/权限、同步阻塞、失败/取消/重复调用及释放。字面channel测试数只是索引，不能推断安全边界被断言。

## 附录 D：静态 HTML 操作入口（全部内联事件）

| 文件:行 | tag / id | 事件 | 调用名（无源码） |
|---|---|---|---|
| `public/index.html:9` | `link` / `无独立id` | `onload` |  |
| `public/index.html:27` | `button` / `visual-guide-btn` | `onclick` | `startVisualGuide` |
| `public/index.html:29` | `button` / `update-entry` | `onclick` | `openUpdatePanel` |
| `public/index.html:38` | `button` / `diy-mode-btn` | `onclick` | `toggleDiyMode` |
| `public/index.html:62` | `button` / `fullscreen-diy-btn` | `onclick` | `toggleDiyMode` |
| `public/index.html:111` | `button` / `search-mode-song` | `onclick` | `setSearchMode` |
| `public/index.html:113` | `button` / `search-mode-netease` | `onclick` | `setSearchMode` |
| `public/index.html:115` | `button` / `search-mode-qq` | `onclick` | `setSearchMode` |
| `public/index.html:116` | `button` / `search-mode-kugou` | `onclick` | `setSearchMode` |
| `public/index.html:117` | `button` / `search-mode-qishui` | `onclick` | `setSearchMode` |
| `public/index.html:118` | `button` / `search-mode-podcast` | `onclick` | `setSearchMode` |
| `public/index.html:124` | `button` / `upload-btn` | `onclick` | `toggleUploadPanel` |
| `public/index.html:131` | `button` / `clear-cover-btn` | `onclick` | `clearCustomCoverForCurrent` |
| `public/index.html:133` | `div` / `upload-panel` | `onclick` | `event.stopPropagation` |
| `public/index.html:134` | `button` / `无独立id` | `onclick` | `triggerUploadInput` |
| `public/index.html:140` | `button` / `无独立id` | `onclick` | `triggerUploadInput` |
| `public/index.html:146` | `button` / `无独立id` | `onclick` | `triggerUploadInput` |
| `public/index.html:154` | `button` / `无独立id` | `onclick` | `closeUploadTip` |
| `public/index.html:171` | `button` / `无独立id` | `onclick` | `homeDashboardNextReview` |
| `public/index.html:172` | `button` / `home-dashboard-video-choose` | `onclick` | `openHomeDashboardVideoPicker` |
| `public/index.html:173` | `button` / `home-dashboard-video-clear` | `onclick` | `clearHomeDashboardVideo` |
| `public/index.html:174` | `button` / `无独立id` | `onclick` | `openHomePlayerConsole` |
| `public/index.html:181` | `button` / `无独立id` | `onclick` | `resumeHomeDashboardPlayback` |
| `public/index.html:188` | `button` / `无独立id` | `onclick` | `openHomeDashboardLibrary` |
| `public/index.html:195` | `button` / `无独立id` | `onclick` | `playHomeDaily` |
| `public/index.html:202` | `button` / `无独立id` | `onclick` | `playHomeRecent` |
| `public/index.html:216` | `button` / `无独立id` | `onclick` | `openHomeInsight` |
| `public/index.html:228` | `button` / `home-next-card` | `onclick` | `playHomeNextFromDock` |
| `public/index.html:248` | `button` / `无独立id` | `onclick` | `openHomeDashboardCharts` |
| `public/index.html:259` | `button` / `无独立id` | `onclick` | `openHomeDashboardRadio` |
| `public/index.html:310` | `button` / `user-capsule-hide-btn` | `onclick` | `toggleUserCapsuleAutoHide` |
| `public/index.html:312` | `button` / `home-btn` | `onclick` | `goHome` |
| `public/index.html:319` | `button` / `user-btn` | `onclick` | `onUserBtnClick` |
| `public/index.html:334` | `button` / `fx-fab-hide-btn` | `onclick` | `toggleFxFabAutoHide` |
| `public/index.html:353` | `button` / `无独立id` | `onclick` | `resetUiAccentColor` |
| `public/index.html:358` | `button` / `visual-tint-auto-btn` | `onclick` | `openCoverColorPicker` |
| `public/index.html:360` | `button` / `无独立id` | `onclick` | `resetVisualTintColor` |
| `public/index.html:363` | `button` / `无独立id` | `onclick` | `closeCoverColorPicker` |
| `public/index.html:366` | `div` / `cover-color-art` | `onclick` | `pickCoverColorFromArt` |
| `public/index.html:366` | `div` / `cover-color-art` | `onmousemove` | `moveCoverColorLoupe` |
| `public/index.html:366` | `div` / `cover-color-art` | `onmouseleave` | `hideCoverColorLoupe` |
| `public/index.html:376` | `button` / `无独立id` | `onclick` | `closeColorLab` |
| `public/index.html:392` | `button` / `无独立id` | `onclick` | `resetHomeAccentColor` |
| `public/index.html:397` | `button` / `无独立id` | `onclick` | `resetHomeIconColor` |
| `public/index.html:402` | `button` / `无独立id` | `onclick` | `resetVisualIconColor` |
| `public/index.html:407` | `button` / `无独立id` | `onclick` | `resetCustomBackgroundColor` |
| `public/index.html:413` | `button` / `bg-album-toggle-btn` | `onclick` | `toggleCustomBackgroundAlbumCover` |
| `public/index.html:415` | `button` / `无独立id` | `onclick` | `<dynamic-expression>`, `document.getElementById` |
| `public/index.html:417` | `button` / `bg-media-crop-btn` | `onclick` | `openCustomBackgroundCropModal` |
| `public/index.html:419` | `button` / `无独立id` | `onclick` | `clearCustomBackgroundImage` |
| `public/index.html:426` | `button` / `无独立id` | `onclick` | `openWallpaperEngineLibrary` |
| `public/index.html:427` | `button` / `wallpaper-engine-restore-btn` | `onclick` | `deactivateWallpaperEngineBackground` |
| `public/index.html:435` | `button` / `wallpaper-engine-mode-native` | `onclick` | `setWallpaperEnginePlaybackMode` |
| `public/index.html:435` | `button` / `wallpaper-engine-mode-native` | `onmouseenter` | `showWallpaperEngineModeHint` |
| `public/index.html:435` | `button` / `wallpaper-engine-mode-native` | `onmouseleave` | `hideWallpaperEngineModeHint` |
| `public/index.html:435` | `button` / `wallpaper-engine-mode-native` | `onfocus` | `showWallpaperEngineModeHint` |
| `public/index.html:435` | `button` / `wallpaper-engine-mode-native` | `onblur` | `hideWallpaperEngineModeHint` |
| `public/index.html:440` | `button` / `wallpaper-engine-mode-loop` | `onclick` | `setWallpaperEnginePlaybackMode` |
| `public/index.html:440` | `button` / `wallpaper-engine-mode-loop` | `onmouseenter` | `showWallpaperEngineModeHint` |
| `public/index.html:440` | `button` / `wallpaper-engine-mode-loop` | `onmouseleave` | `hideWallpaperEngineModeHint` |
| `public/index.html:440` | `button` / `wallpaper-engine-mode-loop` | `onfocus` | `showWallpaperEngineModeHint` |
| `public/index.html:440` | `button` / `wallpaper-engine-mode-loop` | `onblur` | `hideWallpaperEngineModeHint` |
| `public/index.html:451` | `input` / `wallpaper-engine-opacity` | `oninput` | `setWallpaperEngineVisualSetting` |
| `public/index.html:452` | `input` / `wallpaper-engine-position-x` | `oninput` | `setWallpaperEngineVisualSetting` |
| `public/index.html:453` | `input` / `wallpaper-engine-position-y` | `oninput` | `setWallpaperEngineVisualSetting` |
| `public/index.html:454` | `input` / `wallpaper-engine-scale` | `oninput` | `setWallpaperEngineVisualSetting` |
| `public/index.html:470` | `div` / `t-aeroWaterTheme` | `onclick` | `toggleFx` |
| `public/index.html:475` | `button` / `无独立id` | `onclick` | `setAeroWaterPalette` |
| `public/index.html:476` | `button` / `无独立id` | `onclick` | `setAeroWaterPalette` |
| `public/index.html:477` | `button` / `无独立id` | `onclick` | `setAeroWaterPalette` |
| `public/index.html:519` | `div` / `t-sonicAudioMonitorEnabled` | `onclick` | `toggleFx` |
| `public/index.html:522` | `div` / `t-sonicAudioAutoTrack` | `onclick` | `toggleFx` |
| `public/index.html:566` | `button` / `无独立id` | `onclick` | `resetSonicGroundColor` |
| `public/index.html:571` | `button` / `无独立id` | `onclick` | `resetSonicGroundColor` |
| `public/index.html:576` | `button` / `无独立id` | `onclick` | `resetSonicGroundColor` |
| `public/index.html:581` | `button` / `无独立id` | `onclick` | `resetSonicGroundColor` |
| `public/index.html:587` | `div` / `t-sonicGroundFloatingEnabled` | `onclick` | `toggleFx` |
| `public/index.html:614` | `button` / `sonic-workshop-cover-btn` | `onclick` | `setSonicWorkshopRegionColorMode` |
| `public/index.html:620` | `button` / `sonic-workshop-base-btn` | `onclick` | `setSonicWorkshopRegionColorMode` |
| `public/index.html:626` | `button` / `sonic-workshop-warm-btn` | `onclick` | `setSonicWorkshopRegionColorMode` |
| `public/index.html:632` | `button` / `sonic-workshop-cool-btn` | `onclick` | `setSonicWorkshopRegionColorMode` |
| `public/index.html:638` | `button` / `sonic-workshop-ripple-btn` | `onclick` | `setSonicWorkshopRegionColorMode` |
| `public/index.html:644` | `button` / `sonic-workshop-peak-btn` | `onclick` | `setSonicWorkshopRegionColorMode` |
| `public/index.html:648` | `button` / `无独立id` | `onclick` | `setSonicWorkshopTheme` |
| `public/index.html:649` | `button` / `无独立id` | `onclick` | `setSonicWorkshopTheme` |
| `public/index.html:650` | `button` / `无独立id` | `onclick` | `setSonicWorkshopTheme` |
| `public/index.html:651` | `button` / `无独立id` | `onclick` | `setSonicWorkshopTheme` |
| `public/index.html:652` | `button` / `无独立id` | `onclick` | `setSonicWorkshopTheme` |
| `public/index.html:656` | `div` / `无独立id` | `onclick` | `<dynamic-expression>`, `document.getElementById` |
| `public/index.html:666` | `button` / `lyric-auto-btn` | `onclick` | `setLyricColorAuto` |
| `public/index.html:673` | `button` / `lyric-highlight-auto-btn` | `onclick` | `setLyricHighlightAuto` |
| `public/index.html:677` | `div` / `lyric-glow-row` | `onclick` | `handleLyricGlowRowClick` |
| `public/index.html:680` | `button` / `lyric-glow-link-btn` | `onclick` | `toggleLyricGlowLink` |
| `public/index.html:684` | `button` / `lyric-glow-enable-btn` | `onclick` | `toggleFx` |
| `public/index.html:686` | `button` / `lyric-glow-beat-btn` | `onclick` | `toggleFx` |
| `public/index.html:692` | `button` / `lyric-source-original` | `onclick` | `setLyricSourceMode` |
| `public/index.html:694` | `button` / `lyric-source-custom` | `onclick` | `setLyricSourceMode` |
| `public/index.html:699` | `button` / `无独立id` | `onclick` | `setLyricDisplayMode` |
| `public/index.html:700` | `button` / `无独立id` | `onclick` | `setLyricDisplayMode` |
| `public/index.html:701` | `button` / `无独立id` | `onclick` | `setLyricDisplayMode` |
| `public/index.html:702` | `button` / `无独立id` | `onclick` | `setLyricDisplayMode` |
| `public/index.html:703` | `button` / `无独立id` | `onclick` | `setLyricDisplayMode` |
| `public/index.html:709` | `button` / `无独立id` | `onclick` | `setLyricTranslationMode` |
| `public/index.html:710` | `button` / `无独立id` | `onclick` | `setLyricTranslationMode` |
| `public/index.html:711` | `button` / `无独立id` | `onclick` | `setLyricTranslationMode` |
| `public/index.html:712` | `button` / `无独立id` | `onclick` | `setLyricTranslationMode` |
| `public/index.html:716` | `button` / `无独立id` | `onclick` | `setLyricMotionStyle` |
| `public/index.html:717` | `button` / `无独立id` | `onclick` | `setLyricMotionStyle` |
| `public/index.html:718` | `button` / `无独立id` | `onclick` | `setLyricMotionStyle` |
| `public/index.html:719` | `button` / `无独立id` | `onclick` | `setLyricMotionStyle` |
| `public/index.html:720` | `button` / `无独立id` | `onclick` | `setLyricMotionStyle` |
| `public/index.html:723` | `button` / `lyric-glitch-camera-bind` | `onclick` | `toggleLyricGlitchCameraBind` |
| `public/index.html:749` | `button` / `无独立id` | `onclick` | `setLyricTextureClarity` |
| `public/index.html:751` | `button` / `无独立id` | `onclick` | `setLyricTextureClarity` |
| `public/index.html:753` | `button` / `无独立id` | `onclick` | `setLyricTextureClarity` |
| `public/index.html:755` | `button` / `无独立id` | `onclick` | `setLyricTextureClarity` |
| `public/index.html:759` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:760` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:761` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:762` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:763` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:764` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:765` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:766` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:767` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:768` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:769` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:770` | `button` / `无独立id` | `onclick` | `setLyricFont` |
| `public/index.html:771` | `button` / `无独立id` | `onclick` | `triggerLyricFontUpload` |
| `public/index.html:796` | `div` / `无独立id` | `onclick` | `<dynamic-expression>`, `document.getElementById` |
| `public/index.html:802` | `div` / `t-float` | `onclick` | `toggleFx` |
| `public/index.html:804` | `div` / `t-cinema` | `onclick` | `toggleFx` |
| `public/index.html:806` | `div` / `t-lyricGlow` | `onclick` | `toggleFx` |
| `public/index.html:808` | `div` / `t-lyricGlowBeat` | `onclick` | `toggleFx` |
| `public/index.html:810` | `div` / `t-lyricGlowParticles` | `onclick` | `toggleFx` |
| `public/index.html:812` | `div` / `t-backgroundStarRiver` | `onclick` | `toggleFx` |
| `public/index.html:814` | `div` / `t-lyricVerticalFloat` | `onclick` | `toggleFx` |
| `public/index.html:816` | `div` / `t-lyricPauseHold` | `onclick` | `toggleFx` |
| `public/index.html:818` | `div` / `t-lyricCameraLock` | `onclick` | `toggleFx` |
| `public/index.html:820` | `div` / `t-bloom` | `onclick` | `toggleFx` |
| `public/index.html:822` | `div` / `t-edge` | `onclick` | `toggleFx` |
| `public/index.html:824` | `div` / `t-desktopLyrics` | `onclick` | `toggleFx` |
| `public/index.html:826` | `div` / `t-desktopLyricsClickThrough` | `onclick` | `toggleFx` |
| `public/index.html:828` | `div` / `t-desktopLyricsCinema` | `onclick` | `toggleFx` |
| `public/index.html:830` | `div` / `t-desktopLyricsHighlight` | `onclick` | `toggleFx` |
| `public/index.html:832` | `div` / `t-wallpaperMode` | `onclick` | `toggleFx` |
| `public/index.html:864` | `div` / `无独立id` | `onclick` | `<dynamic-expression>`, `document.getElementById` |
| `public/index.html:888` | `div` / `t-shelfShowPodcasts` | `onclick` | `toggleFx` |
| `public/index.html:890` | `div` / `t-shelfMergeCollections` | `onclick` | `toggleFx` |
| `public/index.html:897` | `button` / `无独立id` | `onclick` | `resetShelfAccentColor` |
| `public/index.html:973` | `div` / `t-gesturePlayerActions` | `onclick` | `toggleGesturePlayerActions` |
| `public/index.html:976` | `div` / `t-gestureHandOverlay` | `onclick` | `toggleGestureHandOverlay` |
| `public/index.html:982` | `button` / `无独立id` | `onclick` | `setGestureSensitivity` |
| `public/index.html:983` | `button` / `无独立id` | `onclick` | `setGestureSensitivity` |
| `public/index.html:984` | `button` / `无独立id` | `onclick` | `setGestureSensitivity` |
| `public/index.html:999` | `div` / `无独立id` | `onclick` | `<dynamic-expression>`, `document.getElementById` |
| `public/index.html:1016` | `div` / `t-startupAutoplay` | `onclick` | `toggleStartupAutoplay` |
| `public/index.html:1018` | `div` / `t-startupFastSkip` | `onclick` | `toggleStartupFastSkip` |
| `public/index.html:1039` | `button` / `无独立id` | `onclick` | `refreshAudioOutputDevices` |
| `public/index.html:1040` | `button` / `无独立id` | `onclick` | `openAudioOutputWorkflowPanel` |
| `public/index.html:1055` | `button` / `sonic-performance-toggle` | `onclick` | `MineradioSonicPerformance.toggle` |
| `public/index.html:1074` | `div` / `t-lyricLiveViewportFit` | `onclick` | `toggleFx` |
| `public/index.html:1076` | `div` / `t-lyricContextHighQuality` | `onclick` | `toggleFx` |
| `public/index.html:1078` | `div` / `t-lyricBackdropAdapt` | `onclick` | `toggleFx` |
| `public/index.html:1080` | `div` / `t-coverBackdropAdapt` | `onclick` | `toggleFx` |
| `public/index.html:1087` | `div` / `t-memoryAutoTrimApp` | `onclick` | `toggleFx` |
| `public/index.html:1089` | `div` / `t-memoryAutoTrimOnBackground` | `onclick` | `toggleFx` |
| `public/index.html:1091` | `div` / `t-memoryAutoSystemTrim` | `onclick` | `toggleFx` |
| `public/index.html:1093` | `div` / `t-memorySystemAutoElevate` | `onclick` | `toggleFx` |
| `public/index.html:1107` | `button` / `无独立id` | `onclick` | `runAppMemoryTrim` |
| `public/index.html:1108` | `button` / `无独立id` | `onclick` | `runSystemMemoryPurge` |
| `public/index.html:1109` | `button` / `无独立id` | `onclick` | `runSystemMemoryPurge` |
| `public/index.html:1116` | `button` / `无独立id` | `onclick` | `chooseMineradioCacheRoot` |
| `public/index.html:1117` | `button` / `无独立id` | `onclick` | `refreshMineradioCacheSettings` |
| `public/index.html:1118` | `button` / `cache-storage-restart` | `onclick` | `restartMineradioForCachePath` |
| `public/index.html:1150` | `button` / `无独立id` | `onclick` | `resetFx` |
| `public/index.html:1162` | `button` / `playlist-pin-btn` | `onclick` | `togglePlaylistPanelPinned` |
| `public/index.html:1170` | `button` / `无独立id` | `onclick` | `shuffleQueue` |
| `public/index.html:1183` | `button` / `tab-queue` | `onclick` | `switchPlaylistTab` |
| `public/index.html:1184` | `button` / `tab-pl` | `onclick` | `switchPlaylistTab` |
| `public/index.html:1185` | `button` / `tab-podcast` | `onclick` | `switchPlaylistTab` |
| `public/index.html:1190` | `button` / `play-mode-chip` | `onclick` | `cyclePlayMode` |
| `public/index.html:1194` | `button` / `queue-clear-btn` | `onclick` | `requestClearQueue` |
| `public/index.html:1209` | `button` / `无独立id` | `onclick` | `promptCreateBuiltInPlaylist` |
| `public/index.html:1211` | `button` / `无独立id` | `onclick` | `refreshUserPlaylists` |
| `public/index.html:1220` | `button` / `无独立id` | `onclick` | `refreshUserPlaylists` |
| `public/index.html:1235` | `span` / `trial-login-btn` | `onclick` | `showLoginModal` |
| `public/index.html:1236` | `span` / `无独立id` | `onclick` | `<dynamic-expression>`, `document.getElementById` |
| `public/index.html:1263` | `img` / `thumb-cover` | `onclick` | `openTrackDetailModal` |
| `public/index.html:1263` | `img` / `thumb-cover` | `onkeydown` | `event.preventDefault`, `openTrackDetailModal` |
| `public/index.html:1266` | `div` / `thumb-title` | `onclick` | `openTrackDetailModal` |
| `public/index.html:1267` | `div` / `thumb-artist` | `onclick` | `openTrackDetailModal` |
| `public/index.html:1365` | `div` / `mini-queue-popover` | `onclick` | `event.stopPropagation` |
| `public/index.html:1371` | `button` / `无独立id` | `onclick` | `closeMiniQueue` |
| `public/index.html:1383` | `div` / `control-cover` | `onclick` | `openTrackDetailModal` |
| `public/index.html:1383` | `div` / `control-cover` | `onkeydown` | `event.preventDefault`, `openTrackDetailModal` |
| `public/index.html:1387` | `div` / `control-title` | `onclick` | `openTrackDetailModal` |
| `public/index.html:1391` | `button` / `quality-btn` | `onclick` | `toggleQualityPanel` |
| `public/index.html:1393` | `div` / `无独立id` | `onclick` | `event.stopPropagation` |
| `public/index.html:1398` | `div` / `control-artist` | `onclick` | `openTrackDetailModal` |
| `public/index.html:1402` | `button` / `heart-btn` | `onclick` | `toggleLikeCurrent` |
| `public/index.html:1407` | `button` / `collect-btn` | `onclick` | `openCollectModalForCurrent` |
| `public/index.html:1414` | `button` / `play-mode-btn` | `onclick` | `cyclePlayMode` |
| `public/index.html:1421` | `button` / `cuefield-automix-btn` | `onclick` | `toggleCuefieldAutoMix` |
| `public/index.html:1429` | `button` / `prev-btn` | `onclick` | `prevTrack` |
| `public/index.html:1433` | `button` / `play-btn` | `onclick` | `togglePlay` |
| `public/index.html:1437` | `button` / `next-btn` | `onclick` | `nextTrack` |
| `public/index.html:1441` | `button` / `mini-queue-btn` | `onclick` | `toggleMiniQueue` |
| `public/index.html:1448` | `button` / `lyrics-toggle-btn` | `onclick` | `toggleLyricsPanel` |
| `public/index.html:1450` | `div` / `lyric-timing-popover` | `onclick` | `event.stopPropagation` |
| `public/index.html:1464` | `button` / `volume-btn` | `onclick` | `toggleMute` |
| `public/index.html:1470` | `div` / `无独立id` | `onclick` | `event.stopPropagation` |
| `public/index.html:1487` | `button` / `controls-hide-btn` | `onclick` | `toggleControlsAutoHide` |
| `public/index.html:1495` | `button` / `immersive-btn` | `onclick` | `toggleImmersiveMode` |
| `public/index.html:1504` | `button` / `无独立id` | `onclick` | `toggleFullscreen` |
| `public/index.html:1546` | `button` / `login-reset-all-btn` | `onclick` | `logoutAllAccounts` |
| `public/index.html:1548` | `button` / `无独立id` | `onclick` | `closeLoginModal` |
| `public/index.html:1553` | `button` / `login-provider-netease` | `onclick` | `selectLoginProviderNode` |
| `public/index.html:1555` | `button` / `login-provider-qq` | `onclick` | `selectLoginProviderNode` |
| `public/index.html:1557` | `button` / `login-provider-kugou` | `onclick` | `selectLoginProviderNode` |
| `public/index.html:1559` | `button` / `login-provider-qishui` | `onclick` | `selectLoginProviderNode` |
| `public/index.html:1567` | `button` / `login-mode-official` | `onclick` | `selectLoginMode` |
| `public/index.html:1569` | `button` / `login-mode-cookie` | `onclick` | `selectLoginMode` |
| `public/index.html:1583` | `button` / `qq-web-login-card` | `onclick` | `openProviderWebLogin` |
| `public/index.html:1591` | `button` / `browser-cookie-import-btn` | `onclick` | `importBrowserCookieLogin` |
| `public/index.html:1593` | `button` / `qq-cookie-save-btn` | `onclick` | `submitQQCookieLogin` |
| `public/index.html:1599` | `button` / `无独立id` | `onclick` | `skipLoginAndFocusSearch` |
| `public/index.html:1600` | `button` / `qq-cookie-toggle-btn` | `onclick` | `toggleQQCookiePanel` |
| `public/index.html:1602` | `button` / `netease-web-fallback-btn` | `onclick` | `openProviderOfficialWebLogin` |
| `public/index.html:1603` | `button` / `refresh-qr-btn` | `onclick` | `startSelectedLoginConnection` |
| `public/index.html:1606` | `button` / `无独立id` | `onclick` | `openOriginalProfileImport` |
| `public/index.html:1615` | `button` / `无独立id` | `onclick` | `closeOriginalProfileImport` |
| `public/index.html:1616` | `button` / `original-profile-confirm` | `onclick` | `confirmOriginalProfileImport` |
| `public/index.html:1626` | `button` / `无独立id` | `onclick` | `closeAudioOutputWorkflowPanel` |
| `public/index.html:1634` | `button` / `无独立id` | `onclick` | `disconnectAdditionalAudioRoutes` |
| `public/index.html:1635` | `button` / `无独立id` | `onclick` | `retryAudioRoutes` |
| `public/index.html:1636` | `button` / `无独立id` | `onclick` | `refreshAudioOutputDevices` |
| `public/index.html:1653` | `button` / `user-provider-netease` | `onclick` | `setActiveAccountProvider` |
| `public/index.html:1655` | `button` / `user-provider-qq` | `onclick` | `setActiveAccountProvider` |
| `public/index.html:1656` | `button` / `user-provider-kugou` | `onclick` | `setActiveAccountProvider` |
| `public/index.html:1657` | `button` / `user-provider-qishui` | `onclick` | `setActiveAccountProvider` |
| `public/index.html:1658` | `button` / `user-provider-both` | `onclick` | `enableDualAccountView` |
| `public/index.html:1661` | `button` / `account-add-netease` | `onclick` | `openProviderLogin` |
| `public/index.html:1662` | `button` / `account-add-qq` | `onclick` | `openProviderLogin` |
| `public/index.html:1663` | `button` / `account-add-kugou` | `onclick` | `openProviderLogin` |
| `public/index.html:1664` | `button` / `account-add-qishui` | `onclick` | `openProviderLogin` |
| `public/index.html:1668` | `button` / `无独立id` | `onclick` | `closeUserModal` |
| `public/index.html:1669` | `button` / `account-logout-btn` | `onclick` | `logoutActiveAccount` |
| `public/index.html:1691` | `button` / `无独立id` | `onclick` | `closeCoverCropModal` |
| `public/index.html:1692` | `button` / `无独立id` | `onclick` | `commitCoverCrop` |
| `public/index.html:1718` | `button` / `无独立id` | `onclick` | `cancelCustomBackgroundCropModal` |
| `public/index.html:1719` | `button` / `无独立id` | `onclick` | `resetCustomBackgroundCropInModal` |
| `public/index.html:1720` | `button` / `无独立id` | `onclick` | `commitCustomBackgroundCropModal` |
| `public/index.html:1725` | `div` / `wallpaper-engine-modal` | `onclick` | `closeWallpaperEngineLibrary` |
| `public/index.html:1734` | `button` / `无独立id` | `onclick` | `closeWallpaperEngineLibrary` |
| `public/index.html:1737` | `input` / `wallpaper-engine-search` | `oninput` | `scheduleWallpaperEngineLibraryRender` |
| `public/index.html:1739` | `button` / `无独立id` | `onclick` | `chooseWallpaperEngineProjectFile` |
| `public/index.html:1740` | `button` / `无独立id` | `onclick` | `chooseWallpaperEngineDirectory` |
| `public/index.html:1741` | `button` / `无独立id` | `onclick` | `refreshWallpaperEngineLibrary` |
| `public/index.html:1742` | `button` / `无独立id` | `onclick` | `restoreHiddenWallpaperEngineItems` |
| `public/index.html:1747` | `div` / `wallpaper-engine-details-drawer` | `onclick` | `closeWallpaperEngineProjectDetails` |
| `public/index.html:1755` | `button` / `无独立id` | `onclick` | `closeWallpaperEngineProjectDetails` |
| `public/index.html:1758` | `input` / `wallpaper-engine-property-search` | `oninput` | `filterWallpaperEngineProperties` |
| `public/index.html:1761` | `button` / `wallpaper-engine-details-save` | `onclick` | `saveWallpaperEngineProjectProperties` |
| `public/index.html:1762` | `button` / `wallpaper-engine-details-reset` | `onclick` | `saveWallpaperEngineProjectProperties` |
| `public/index.html:1763` | `button` / `wallpaper-engine-details-we` | `onclick` | `launchWallpaperEngineProjectDetails` |
| `public/index.html:1765` | `button` / `wallpaper-engine-details-workshop` | `onclick` | `launchWallpaperEngineProjectDetails` |
| `public/index.html:1775` | `div` / `built-in-playlist-prompt` | `onclick` | `closeBuiltInPlaylistPrompt` |
| `public/index.html:1778` | `input` / `built-in-playlist-prompt-input` | `onkeydown` | `closeBuiltInPlaylistPrompt` |
| `public/index.html:1780` | `button` / `无独立id` | `onclick` | `closeBuiltInPlaylistPrompt` |
| `public/index.html:1781` | `button` / `无独立id` | `onclick` | `closeBuiltInPlaylistPrompt` |
| `public/index.html:1786` | `div` / `home-daily-fallback-modal` | `onclick` | `closeHomeDailyFallback` |
| `public/index.html:1786` | `div` / `home-daily-fallback-modal` | `onkeydown` | `closeHomeDailyFallback` |
| `public/index.html:1793` | `button` / `无独立id` | `onclick` | `closeHomeDailyFallback` |
| `public/index.html:1794` | `button` / `无独立id` | `onclick` | `closeHomeDailyFallback` |
| `public/index.html:1805` | `button` / `无独立id` | `onclick` | `createPlaylistFromCollect` |
| `public/index.html:1809` | `button` / `无独立id` | `onclick` | `closeCollectModal` |
| `public/index.html:1822` | `button` / `local-beat-tab-mr` | `onclick` | `selectLocalBeatMode` |
| `public/index.html:1826` | `button` / `local-beat-tab-dj` | `onclick` | `selectLocalBeatMode` |
| `public/index.html:1833` | `button` / `local-beat-later-btn` | `onclick` | `closeLocalBeatModal` |
| `public/index.html:1834` | `button` / `local-beat-cancel-btn` | `onclick` | `cancelLocalBeatAnalysis` |
| `public/index.html:1836` | `button` / `local-beat-start-btn` | `onclick` | `startLocalBeatAnalysis` |
| `public/index.html:1852` | `button` / `无独立id` | `onclick` | `deleteCustomLyricForCurrent` |
| `public/index.html:1853` | `button` / `无独立id` | `onclick` | `closeCustomLyricModal` |
| `public/index.html:1854` | `button` / `无独立id` | `onclick` | `saveCustomLyricForCurrent` |
| `public/index.html:1864` | `button` / `无独立id` | `onclick` | `closeTrackDetailModal` |
| `public/index.html:1885` | `button` / `update-notes-link` | `onclick` | `openUpdateReleaseNotes` |
| `public/index.html:1889` | `button` / `update-primary-btn` | `onclick` | `startUpdatePreviewDownload` |
| `public/index.html:1894` | `button` / `无独立id` | `onclick` | `closeUpdatePanel` |
| `public/index.html:1907` | `button` / `无独立id` | `onclick` | `submitCuefieldFeedback` |
| `public/index.html:1908` | `button` / `无独立id` | `onclick` | `submitCuefieldFeedback` |
| `public/index.html:1909` | `button` / `无独立id` | `onclick` | `submitCuefieldFeedback` |
| `public/index.html:1915` | `button` / `无独立id` | `onclick` | `closeSourceFallbackNotice` |
| `public/index.html:1937` | `button` / `无独立id` | `onclick` | `closeVisualGuide` |
| `public/index.html:1940` | `button` / `visual-guide-prev` | `onclick` | `prevVisualGuideStep` |
| `public/index.html:1941` | `button` / `visual-guide-next` | `onclick` | `nextVisualGuideStep` |
| `public/index.html:1987` | `button` / `sonic-performance-close` | `onclick` | `MineradioSonicPerformance.closeNotice` |
| `public/index.html:1993` | `button` / `sonic-performance-enable` | `onclick` | `MineradioSonicPerformance.accept` |
| `public/index.html:1994` | `button` / `sonic-performance-keep` | `onclick` | `MineradioSonicPerformance.keep` |
| `public/index.html:1995` | `button` / `sonic-performance-retry` | `onclick` | `MineradioSonicPerformance.retry` |
| `public/index.html:1996` | `button` / `sonic-performance-diagnostics-button` | `onclick` | `MineradioSonicPerformance.diagnostics` |
| `qishui-auth-v6/security_host.html:389` | `button` / `mfa-cancel` | `onclick` | `window.__qishuiCancelSecondVerify` |

其他 JS 事件绑定在JSON `event_bindings`；465静态控件的role/name/tabindex状态在 `html_controls`，35个dialog/panel候选在 `html_dialog_panel_candidates`。所有UI生成DOM/3D事件仍须运行时枚举、命中与焦点测试。

## 附录 E：现有测试入口、真实自动登记与直接引用映射

| 测试入口 | 类型 | npm test | npm test:electron | 直接source引用数 | 当前运行 |
|---|---|---|---|---:|---|
| `tests/account-avatar-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/adaptive-quality-ui-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/adjacent-preparation.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/aero-input-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/album-cover-background.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/artist-albums-more.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/audio-output-routing.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/audio-proxy-lifecycle.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/audio-route-drag.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/audio-spill-relay.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/background-resume-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 2 | 本盘点未执行 |
| `tests/background-window-state-recovery.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/beat-analysis-memory.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/bottom-controls-hover.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/browser-cookie-import.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/built-in-playlist-library.test.js` | node-regression | 登记 | 未登记 | 10 | 本盘点未执行 |
| `tests/cache-lifecycle.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/cache-root-fallback.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/client-qr-login.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/comment-avatar-loader.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/comment-replies.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/content-provider-priority.test.js` | node-regression | 登记 | 未登记 | 6 | 本盘点未执行 |
| `tests/cookie-storage.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/cover-cache.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/cover-load-retry.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/cover-proxy-lifecycle.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/credential-migration-lifecycle.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/cuefield-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/cuefield-mineradio-integration.test.js` | node-regression | 登记 | 未登记 | 7 | 本盘点未执行 |
| `tests/cuefield-transition-runtime.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/curated-visual-presets.test.js` | node-regression | 登记 | 未登记 | 7 | 本盘点未执行 |
| `tests/custom-cover-home-sync.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/desktop-icon-shape-runtime.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/desktop-native-icon-layer-runtime.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/dev-launcher-process-selection.test.ps1` | windows-powershell | 未登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/dev-launcher.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/external-update-page-bridge.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/first-run-quality.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/foreground-recovery-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/foreground-recovery-work.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/full-desktop-geometry-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/full-desktop-mode-runtime.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/fx-slider-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/gesture-camera-permission.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/gesture-player-actions.test.js` | node-regression | 登记 | 未登记 | 8 | 本盘点未执行 |
| `tests/gesture-runtime-lifecycle.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/home-card-hover-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/home-daily-recommendation-virtualization.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/home-daily-recommendations-backend.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/home-dashboard-update.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/home-hero-mp4-platform-recommend.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/inline-login-lifecycle.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/installer-cleanup.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/kugou-api-resilience.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/kugou-community.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/kugou-login-bridge.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/kugou-native-qr.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/kugou-verification-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/kugou-verification-flow.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/kugou-verification.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/kugou-vip-hardening.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/local-alternate-fingerprint-cache.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/local-library-offline-relink.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/local-music-library-persistence.test.js` | node-regression | 登记 | 未登记 | 11 | 本盘点未执行 |
| `tests/local-playback-skip-notice.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/login-attempt-contract.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/login-entry-direct.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/login-logout-race.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/login-presence-check.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/login-qr-loading.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/lyric-active-line-viewport-fit.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/lyric-drag-quality.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/lyric-edit-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/lyric-edit-preview.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/lyric-layout-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/lyric-motion-profiles.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/lyric-runway-preparation.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/lyric-seek-visibility.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/lyric-spacing-stability.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/lyric-style-refresh.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/lyric-title-handoff.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/lyric-track-seek-glide.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/lyric-work-scheduler.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/main-window-runtime-recovery.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/media-security-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 4 | 本盘点未执行 |
| `tests/membership-badge-consistency.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/microphone-mixer-ui.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/microphone-mixer.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/microphone-permission.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/music-dns.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/netease-like-cache.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/netease-login-navigation.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/network-compatibility.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/next-critical-boundaries.test.js` | node-regression | 登记 | 未登记 | 6 | 本盘点未执行 |
| `tests/onboarding-guide-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 2 | 本盘点未执行 |
| `tests/onboarding-guide.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/original-profile-entry-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 2 | 本盘点未执行 |
| `tests/original-profile-import.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/original-render-quality.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/packaging-runtime-files.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/panel-view-recenter.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/paused-lyric-layout.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/paused-render-cadence.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/platform-account-sync-guard.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/playback-audio-graph-recovery.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/playback-background-resume.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/playback-checkpoint.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/playback-load-recovery.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/playback-network-ownership.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/playback-pause-cancellation.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/playback-single-repeat-loop.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/playback-source-fallback-transaction.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/playback-start-stall-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/playback-start-stall.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/player-navigation-startup-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/playlist-catalog-recovery.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/playlist-cover-loader.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/playlist-detail-layout-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/playlist-interaction-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/playlist-paging.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/playlist-panel-material.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/pre-release-startup-memory.test.js` | node-regression | 登记 | 未登记 | 7 | 本盘点未执行 |
| `tests/progress-seek-gesture.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/provider-entitlement-boundary.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/provider-login-state-recovery.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/provider-removal-diy-cinema-preload.test.js` | node-regression | 登记 | 未登记 | 9 | 本盘点未执行 |
| `tests/qishui-cache-generation.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-decrypt-cache-bounds.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-entitlement-cache.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-local-official-merge.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-mfa-lifecycle.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/qishui-native-signing.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-passport-live-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-passport-qr-login.test.js` | node-regression | 登记 | 未登记 | 7 | 本盘点未执行 |
| `tests/qishui-provider-distribution.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-quality-tier.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-seo-playback.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/qishui-session-recovery.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-tier-rights.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qishui-trial-full-source.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qq-login-page.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/qq-native-protocol.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/qq-vip-entitlement.test.js` | node-regression | 登记 | 未登记 | 10 | 本盘点未执行 |
| `tests/quality-chip-local-track.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/quality-preset.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/quality-reset-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 2 | 本盘点未执行 |
| `tests/queue-logical-order.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/queue-pause-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/queue-removal.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/remix-updater-download.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/remix-updater.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/request-lifecycle.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/search-backend-latency.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/search-frontend-pagination.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/search-pinyin.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/server-security.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/shelf-lyric-flip.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/shelf-panel-interaction.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/shelf-texture-quality.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/song-comments-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/song-comments-pagination.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/sonic-cover-palette-timing.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/sonic-performance-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/sonic-performance.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/sonic-preferences-store.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/sonic-topography-quality-continuity.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/sonic-workshop-audio.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/sonic-workshop-cadence.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/sonic-workshop-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/sonic-workshop-ripples.test.js` | node-regression | 登记 | 未登记 | 0 | 本盘点未执行 |
| `tests/source-switch-playability.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/spotify-api-resilience.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/spotify-setup-electron-smoke.js` | electron-or-live-smoke | 未登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/spotify-token-lifecycle.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/stage-lyric-background-restore.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/startup-flow-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 2 | 本盘点未执行 |
| `tests/startup-navigation-readiness.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/startup-qa-userdata-isolation.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/startup-window-guide.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/system-media-session.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/ui-default-theme-shelf-layer.test.js` | node-regression | 登记 | 未登记 | 8 | 本盘点未执行 |
| `tests/ui-render-cache.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/ui-sfx-volume.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/update-download-link-rotation.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/update-early-check.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/update-external-only.test.js` | node-regression | 登记 | 未登记 | 4 | 本盘点未执行 |
| `tests/user-fx-archive-compat.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/visual-clarity-and-portrait-fullscreen.test.js` | node-regression | 登记 | 未登记 | 8 | 本盘点未执行 |
| `tests/visual-effect-controls-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 4 | 本盘点未执行 |
| `tests/visual-performance-controls.test.js` | node-regression | 登记 | 未登记 | 8 | 本盘点未执行 |
| `tests/visual-resource-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 2 | 本盘点未执行 |
| `tests/wallpaper-background-regression.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/wallpaper-compatibility-messages.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/wallpaper-cover-electron-smoke.js` | electron-or-live-smoke | 未登记 | 登记 | 1 | 本盘点未执行 |
| `tests/wallpaper-engine-idle-dispose.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/wallpaper-engine-minimize-resident.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/wallpaper-engine-win10-yellow-border.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |
| `tests/wallpaper-interaction.test.js` | node-regression | 登记 | 未登记 | 5 | 本盘点未执行 |
| `tests/wallpaper-loop-cache.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/wallpaper-loop-mode.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/wallpaper-loop-window.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/wallpaper-native-input.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/wallpaper-quality-properties.test.js` | node-regression | 登记 | 未登记 | 6 | 本盘点未执行 |
| `tests/wallpaper-visual-reset.test.js` | node-regression | 登记 | 未登记 | 3 | 本盘点未执行 |
| `tests/wallpaper-window-follow.test.js` | node-regression | 登记 | 未登记 | 1 | 本盘点未执行 |
| `tests/workflow-release-boundary.test.js` | node-regression | 登记 | 未登记 | 2 | 本盘点未执行 |

未在总Electron入口登记的smoke：

- `tests/account-avatar-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/cuefield-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/foreground-recovery-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/full-desktop-geometry-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/kugou-verification-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/playback-start-stall-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/player-navigation-startup-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/playlist-detail-layout-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/qishui-passport-live-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/queue-pause-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）
- `tests/spotify-setup-electron-smoke.js`（独立入口存在，是否其他check/CI运行须核对，不能说完全未覆盖）

## 附录 F：全文件分母与测试引用（无抽样）

下表包含全部本地文件。JS/HTML/CSS/配置、工具、第三方、文档、测试、资源和生成文件分别归组；第三方资源、二进制/生成文件不冒作自有代码。每个文件完整SHA-256在JSON。直接测试引用支持“找到了可能消费者”，间接依赖及独占symbol候选另列于JSON，均不是覆盖率。

### docs-guidance

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `.claude/skills/isolated-ui-check/SKILL.md` | 47 | `f0bc54af0cfa` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `.claude/skills/mineradio-release/SKILL.md` | 53 | `1e5a6feb8517` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `CHANGELOG.md` | 214 | `d5f8d58b4142` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `CLAUDE.md` | 49 | `1a41a1c6944d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `LICENSE` | 561 | `c4d8bfbb3a56` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `NOTICE.md` | 35 | `e5b6661161a7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `PRIVACY.md` | 40 | `cffcaed94d4a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `README.md` | 453 | `3b3f5dd331a2` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `RELEASE.md` | 46 | `78c36ada9b93` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `SECURITY.md` | 29 | `7496818bd5dd` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/3D_PLAYLIST_SHELF_MEMORY.md` | 91 | `2bad36e077e0` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/AI_REVIEW_HANDOFF.md` | 183 | `9ac1af3f705f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/CRITICAL_PATH_AUDIT.md` | 56 | `1a4f22100501` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/CRITICAL_PATH_MUTATION_RESULTS.json` | 499 | `842bccb5a3b1` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/DESKTOP_LYRICS_VISUAL.md` | 28 | `ee7ea2252ca1` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/GLASS_SVG_TEXTURE.md` | 144 | `5fa918c960cd` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/INSTALLER_STYLE.md` | 63 | `fb085c432f7f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/INTERACTION_STABILITY_VALIDATION.md` | 98 | `17d3c3a4109b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/LOGIN_AUDIT_2026-10-09.md` | 51 | `3805f2746351` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/LOW_SPEC_OPTIMIZATION_DOCTRINE.md` | 194 | `6d4512662cc4` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/LYRIC_SLIDER_PREVIEW_VALIDATION.md` | 45 | `b8b2435a8912` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/NETWORK_CHAIN_AUDIT_2026-10-09.md` | 86 | `2444234ae4c7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/NETWORK_COMPATIBILITY_VALIDATION.md` | 28 | `8beb7f388644` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/NEXT_PATH_AUDIT.md` | 88 | `a5bf65b2cc3b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/NEXT_PATH_GREP_RESULTS.txt` | 204 | `3ba547fe0f4b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/NEXT_PATH_MUTATION_RESULTS.json` | 592 | `b3909d466876` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/NEXT_TEST_AND_FIX_BACKLOG.md` | 90 | `ad6ef9167331` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/QISHUI_PLAYBACK_VALIDATION.md` | 31 | `835385364f40` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_NEXT.md` | 587 | `cb45e7f1a033` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v1.1.0.md` | 39 | `963781216e3a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v2.2.0.md` | 18 | `70170c955492` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v2.2.4.md` | 19 | `1ca44c3b4179` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v2.3.0.md` | 71 | `e3f29b75768b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v2.3.1.md` | 34 | `125afa2d46ee` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v2.4.0.md` | 44 | `1acdfbc70c71` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v2.4.1.md` | 67 | `28572ef9c91d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/RELEASE_NOTES_v2.4.2.md` | 39 | `149c5074cfdd` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/SONIC_WORKSHOP_AUDIO_VALIDATION.md` | 26 | `521b9f14d979` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/SUPPORT.md` | 7 | `128dda111a36` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/THIRD_PARTY_PORTS.md` | 137 | `9e6e60889944` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/UPDATE_DELIVERY.md` | 18 | `2f6fa6d6f49b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/UPSTREAM_REVIEW_2026-10-02.md` | 43 | `649c24548e8b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/UPSTREAM_UI_REVIEW_2026-10-02.md` | 26 | `70cc7493daad` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/VISUAL_EFFECT_CONTROLS_VALIDATION.md` | 32 | `69d84febc813` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/assets/readme/cinema-beat-smoke.png` | 二进制 | `df890cca9929` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/assets/support/mineradio-author-support-poster.png` | 二进制 | `9c03e18068df` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/qa/COMMENT_COVER_BENCHMARK_2026-10-09.json` | 66 | `5108f427d4e9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/qa/COMMENT_COVER_REGRESSION_2026-10-09.txt` | 55 | `0904ccc5d104` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `docs/update/latest.yml` | 2 | `aa6ff5b08859` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |

### project-config-launchers

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `.gitattributes` | 9 | `3766c6333990` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `.gitignore` | 75 | `86fcb093f7b9` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `electron-builder.internal-beta.json` | 85 | `5b8b65b5196b` | `tests/packaging-runtime-files.test.js` | 已盘点；业务待审/未运行 |
| `package-lock.json` | 5648 | `1ba1135f199c` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `package.json` | 132 | `17b37e2e9abd` | `tests/client-qr-login.test.js`<br>`tests/local-music-library-persistence.test.js`<br>`tests/music-dns.test.js`<br>`tests/packaging-runtime-files.test.js`<br>`tests/qishui-passport-qr-login.test.js`<br>`tests/qq-native-protocol.test.js`<br>`tests/qq-vip-entitlement.test.js`<br>`tests/update-external-only.test.js` | 已盘点；业务待审/未运行 |
| `quick-check.bat` | 43 | `e59f93a7a064` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `start-mineradio.bat` | 26 | `969689d1b135` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `start-remix-dev.bat` | 21 | `7d4b4df5120e` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### packaging-ci

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `.github/workflows/ci.yml` | 45 | `0bf7249fccd7` | `tests/workflow-release-boundary.test.js` | 已盘点；业务待审/未运行 |
| `.github/workflows/release-windows.yml` | 135 | `4023197ee401` | `tests/workflow-release-boundary.test.js` | 已盘点；业务待审/未运行 |
| `build/after-pack.js` | 68 | `6ef5a2944a38` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `build/icon.ico` | 二进制 | `b925a0da513d` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `build/icon.png` | 二进制 | `57af0fc78de0` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `build/installer-internal-beta.nsh` | 10 | `82923106d5d5` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `build/installer-remix.nsh` | 8 | `4b42419ca3bf` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `build/installer.nsh` | 1199 | `6088cc14d027` | `tests/installer-cleanup.test.js` | 已盘点；业务待审/未运行 |
| `build/installerHeader.bmp` | 二进制 | `d8758504d8b8` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `build/installerSidebar.bmp` | 二进制 | `5acc6bf7ea72` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### generated-local-artifact

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `Mineradio/native-helper-temp/wallpaper-engine-muted-package-cache/d8895247a600171c890fe3175a82e50a1ab737fcd7e7d12d5f085bd43a3b7bfd.pkg` | 二进制 | `d0d8e30dfe63` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |

### backend-and-provider-adapters

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `audio-spill-relay.js` | 240 | `9c0970ec5f3b` | `tests/audio-spill-relay.test.js` | 已盘点；业务待审/未运行 |
| `comment-list-api.js` | 102 | `103d43837008` | `tests/song-comments-pagination.test.js` | 已盘点；业务待审/未运行 |
| `comment-replies-api.js` | 73 | `b2bf60d30d9e` | `tests/comment-replies.test.js` | 已盘点；业务待审/未运行 |
| `cookie-storage.js` | 148 | `29ac9503e7eb` | `tests/cookie-storage.test.js`<br>`tests/credential-migration-lifecycle.test.js`<br>`tests/media-security-electron-smoke.js`<br>`tests/next-critical-boundaries.test.js`<br>`tests/original-profile-entry-electron-smoke.js`<br>`tests/spotify-token-lifecycle.test.js` | 已盘点；业务待审/未运行 |
| `cover-cache.js` | 126 | `2daa835f1385` | `tests/cover-cache.test.js`<br>`tests/cover-proxy-lifecycle.test.js` | 已盘点；业务待审/未运行 |
| `dj-analyzer.js` | 864 | `ba936db0679d` | `tests/server-security.test.js` | 已盘点；业务待审/未运行 |
| `generated-cache-pruner.js` | 45 | `0087d8dfc570` | `tests/cache-lifecycle.test.js`<br>`tests/network-compatibility.test.js` | 已盘点；业务待审/未运行 |
| `kugou-api.js` | 2423 | `2c145d1a956c` | `tests/kugou-api-resilience.test.js`<br>`tests/kugou-community.test.js`<br>`tests/kugou-login-bridge.test.js`<br>`tests/kugou-vip-hardening.test.js`<br>`tests/provider-entitlement-boundary.test.js` | 已盘点；业务待审/未运行 |
| `kugou-community-api.js` | 121 | `aa16144edcb3` | `tests/kugou-community.test.js` | 已盘点；业务待审/未运行 |
| `music-dns.js` | 88 | `c1cbf48d2ac7` | `tests/music-dns.test.js` | 已盘点；业务待审/未运行 |
| `netease-like-cache.js` | 59 | `ed0ce57bd4d7` | `tests/netease-like-cache.test.js` | 已盘点；业务待审/未运行 |
| `qishui-api.js` | 3719 | `b506b84bbba5` | `tests/comment-replies.test.js`<br>`tests/provider-entitlement-boundary.test.js`<br>`tests/qishui-cache-generation.test.js`<br>`tests/qishui-entitlement-cache.test.js`<br>`tests/qishui-local-official-merge.test.js`<br>`tests/qishui-provider-distribution.test.js`<br>`tests/qishui-quality-tier.test.js`<br>`tests/qishui-seo-playback.test.js`<br>`tests/qishui-session-recovery.test.js`<br>`tests/qishui-tier-rights.test.js`<br>`tests/song-comments-pagination.test.js` | 已盘点；业务待审/未运行 |
| `qishui-auth-v6.js` | 598 | `c3ca540d21b4` | `tests/qishui-mfa-lifecycle.test.js`<br>`tests/qishui-passport-qr-login.test.js` | 已盘点；业务待审/未运行 |
| `qishui-qr-login.js` | 167 | `fa5acf49b6d0` | `tests/cookie-storage.test.js`<br>`tests/credential-migration-lifecycle.test.js`<br>`tests/media-security-electron-smoke.js`<br>`tests/qishui-passport-live-smoke.js`<br>`tests/qishui-passport-qr-login.test.js` | 已盘点；业务待审/未运行 |
| `qq-vip-api.js` | 786 | `16cfe87abb74` | `tests/qq-vip-entitlement.test.js` | 已盘点；业务待审/未运行 |
| `server-security.js` | 118 | `1f3e6cc48e1e` | `tests/music-dns.test.js`<br>`tests/server-security.test.js`<br>`tests/visual-resource-electron-smoke.js` | 已盘点；业务待审/未运行 |
| `server.js` | 7136 | `ab9705bc2581` | `tests/audio-proxy-lifecycle.test.js`<br>`tests/cache-lifecycle.test.js`<br>`tests/client-qr-login.test.js`<br>`tests/cover-proxy-lifecycle.test.js`<br>`tests/cuefield-mineradio-integration.test.js`<br>`tests/home-daily-recommendations-backend.test.js`<br>`tests/login-attempt-contract.test.js`<br>`tests/login-logout-race.test.js`<br>`tests/login-presence-check.test.js`<br>`tests/network-compatibility.test.js`<br>`tests/next-critical-boundaries.test.js`<br>`tests/packaging-runtime-files.test.js`<br>`tests/platform-account-sync-guard.test.js`<br>`tests/playlist-paging.test.js`<br>`tests/provider-login-state-recovery.test.js`<br>`tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/qishui-decrypt-cache-bounds.test.js`<br>`tests/qishui-passport-qr-login.test.js`<br>`tests/qq-native-protocol.test.js`<br>`tests/qq-vip-entitlement.test.js`<br>`tests/request-lifecycle.test.js`<br>`tests/search-backend-latency.test.js`<br>`tests/song-comments-pagination.test.js`<br>`tests/update-download-link-rotation.test.js`<br>`tests/update-external-only.test.js`<br>`tests/visual-resource-electron-smoke.js` | 已盘点；业务待审/未运行 |
| `spotify-api.js` | 1664 | `b203e76d1622` | `tests/next-critical-boundaries.test.js`<br>`tests/spotify-api-resilience.test.js`<br>`tests/spotify-token-lifecycle.test.js` | 已盘点；业务待审/未运行 |

### cuefield-transition-planning

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `cuefield/adapter-mineradio.js` | 186 | `ecb6902a8232` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/boundary-evidence.js` | 104 | `e1fc63dbc239` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/bridge-planner.js` | 202 | `1fd6ac75095b` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/cue-profile.js` | 218 | `1f60accad687` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/feedback-log.js` | 466 | `c610b02923b5` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/lrc-anchors.js` | 131 | `9d63e0433526` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/lyric-link.js` | 106 | `a257665831a8` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/mineradio-bridge.js` | 717 | `d9ed192bb6fd` | `tests/cuefield-transition-runtime.test.js` | 已盘点；业务待审/未运行 |
| `cuefield/musical-profile.js` | 189 | `29a7f60078c7` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/planner-contracts.js` | 81 | `862ffec1c66e` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/recipe-planner.js` | 1287 | `cf8c96605cc5` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/section-candidates.js` | 346 | `22ba3ff0e15d` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/shadow-diagnostics.js` | 213 | `410aa57f3f40` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/structure-map.js` | 307 | `3a7896127862` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/transition-artifact.js` | 196 | `09b1bfc2b002` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/transition-evaluator.js` | 273 | `344bdf1d98e9` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/transition-router.js` | 218 | `eb192a59367b` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/transition-window-planner.js` | 1352 | `81dad2a6c25c` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `cuefield/version.js` | 91 | `29852321a74f` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### desktop-main-and-native

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `desktop/app-memory.js` | 93 | `d05e7e5df1aa` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `desktop/browser-cookie-import.js` | 347 | `a59b78154f32` | `tests/browser-cookie-import.test.js` | 已盘点；业务待审/未运行 |
| `desktop/built-in-playlist-library.js` | 295 | `ccd72fabcfb6` | `tests/built-in-playlist-library.test.js`<br>`tests/next-critical-boundaries.test.js` | 已盘点；业务待审/未运行 |
| `desktop/desktop-icon-shape-runtime.js` | 965 | `4331dbc5239b` | `tests/desktop-icon-shape-runtime.test.js`<br>`tests/desktop-native-icon-layer-runtime.test.js` | 已盘点；业务待审/未运行 |
| `desktop/desktop-native-icon-layer-runtime.js` | 1368 | `61c7c7225004` | `tests/desktop-native-icon-layer-runtime.test.js` | 已盘点；业务待审/未运行 |
| `desktop/full-desktop-mode-runtime.js` | 2126 | `e08fbf056e84` | `tests/full-desktop-geometry-electron-smoke.js`<br>`tests/full-desktop-mode-runtime.test.js` | 已盘点；业务待审/未运行 |
| `desktop/kugou-native-qr.js` | 107 | `aea93ecad22e` | `tests/kugou-native-qr.test.js` | 已盘点；业务待审/未运行 |
| `desktop/kugou-verification.js` | 109 | `3edb735114df` | `tests/kugou-login-bridge.test.js`<br>`tests/kugou-verification-electron-smoke.js`<br>`tests/kugou-verification.test.js` | 已盘点；业务待审/未运行 |
| `desktop/local-music-library.js` | 874 | `bdf8966ebea7` | `tests/local-alternate-fingerprint-cache.test.js`<br>`tests/local-library-offline-relink.test.js`<br>`tests/local-music-library-persistence.test.js`<br>`tests/next-critical-boundaries.test.js` | 已盘点；业务待审/未运行 |
| `desktop/login-inline-qr.js` | 230 | `18d84c2b9854` | `tests/inline-login-lifecycle.test.js` | 已盘点；业务待审/未运行 |
| `desktop/main.js` | 6616 | `1a410fa59b90` | `tests/account-avatar-electron-smoke.js`<br>`tests/built-in-playlist-library.test.js`<br>`tests/cache-root-fallback.test.js`<br>`tests/credential-migration-lifecycle.test.js`<br>`tests/dev-launcher.test.js`<br>`tests/external-update-page-bridge.test.js`<br>`tests/gesture-camera-permission.test.js`<br>`tests/home-card-hover-electron-smoke.js`<br>`tests/kugou-login-bridge.test.js`<br>`tests/kugou-verification-electron-smoke.js`<br>`tests/local-music-library-persistence.test.js`<br>`tests/main-window-runtime-recovery.test.js`<br>`tests/microphone-permission.test.js`<br>`tests/netease-login-navigation.test.js`<br>`tests/next-critical-boundaries.test.js`<br>`tests/onboarding-guide-electron-smoke.js`<br>`tests/original-profile-entry-electron-smoke.js`<br>`tests/packaging-runtime-files.test.js`<br>`tests/playback-start-stall-electron-smoke.js`<br>`tests/player-navigation-startup-electron-smoke.js`<br>`tests/playlist-detail-layout-electron-smoke.js`<br>`tests/playlist-interaction-electron-smoke.js`<br>`tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/qishui-passport-qr-login.test.js`<br>`tests/qq-vip-entitlement.test.js`<br>`tests/quality-reset-electron-smoke.js`<br>`tests/queue-pause-electron-smoke.js`<br>`tests/startup-flow-electron-smoke.js`<br>`tests/startup-navigation-readiness.test.js`<br>`tests/startup-qa-userdata-isolation.test.js`<br>`tests/startup-window-guide.test.js`<br>`tests/visual-clarity-and-portrait-fullscreen.test.js`<br>`tests/wallpaper-engine-minimize-resident.test.js`<br>`tests/wallpaper-quality-properties.test.js` | 已盘点；业务待审/未运行 |
| `desktop/microphone-permission.js` | 133 | `abdf667bcc55` | `tests/microphone-permission.test.js` | 已盘点；业务待审/未运行 |
| `desktop/onboarding-state.js` | 29 | `730619eaf327` | `tests/onboarding-guide-electron-smoke.js`<br>`tests/player-navigation-startup-electron-smoke.js`<br>`tests/pre-release-startup-memory.test.js`<br>`tests/startup-flow-electron-smoke.js`<br>`tests/startup-window-guide.test.js` | 已盘点；业务待审/未运行 |
| `desktop/original-profile-import.js` | 89 | `a47b0e9d9b0e` | `tests/media-security-electron-smoke.js`<br>`tests/original-profile-import.test.js` | 已盘点；业务待审/未运行 |
| `desktop/original-profile-preferences.js` | 80 | `8d270916a638` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `desktop/overlay-preload.js` | 19 | `8eeee0502e89` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `desktop/playback-checkpoint-store.js` | 64 | `d5b8699fcb40` | `tests/playback-checkpoint.test.js` | 已盘点；业务待审/未运行 |
| `desktop/preload.js` | 201 | `2985e8cf0713` | `tests/built-in-playlist-library.test.js`<br>`tests/cuefield-electron-smoke.js`<br>`tests/external-update-page-bridge.test.js`<br>`tests/gesture-camera-permission.test.js`<br>`tests/kugou-login-bridge.test.js`<br>`tests/local-music-library-persistence.test.js`<br>`tests/microphone-permission.test.js`<br>`tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/qishui-passport-qr-login.test.js`<br>`tests/qq-vip-entitlement.test.js`<br>`tests/spotify-setup-electron-smoke.js`<br>`tests/visual-clarity-and-portrait-fullscreen.test.js` | 已盘点；业务待审/未运行 |
| `desktop/qishui-native-signing.js` | 92 | `c1ac71e6e4be` | `tests/qishui-native-signing.test.js` | 已盘点；业务待审/未运行 |
| `desktop/qishui-sign-worker.js` | 24 | `ab31f1f57bd2` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `desktop/qq-login-page.js` | 50 | `765c35ca6f05` | `tests/qq-login-page.test.js` | 已盘点；业务待审/未运行 |
| `desktop/qq-native-protocol.js` | 169 | `26469d4e3ed8` | `tests/qq-native-protocol.test.js` | 已盘点；业务待审/未运行 |
| `desktop/qq-native-qr.js` | 199 | `e65fb22aab05` | `tests/client-qr-login.test.js`<br>`tests/qq-native-protocol.test.js` | 已盘点；业务待审/未运行 |
| `desktop/remix-updater.js` | 162 | `1206fcdcf7b3` | `tests/remix-updater-download.test.js`<br>`tests/remix-updater.test.js`<br>`tests/update-download-link-rotation.test.js` | 已盘点；业务待审/未运行 |
| `desktop/sonic-performance-preferences.js` | 31 | `5d585426da2f` | `tests/quality-reset-electron-smoke.js`<br>`tests/sonic-preferences-store.test.js` | 已盘点；业务待审/未运行 |
| `desktop/startup.html` | 60 | `29fc9ad3390e` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `desktop/system-memory.js` | 496 | `2d532ea30b4b` | `tests/pre-release-startup-memory.test.js` | 已盘点；业务待审/未运行 |
| `desktop/wallpaper-engine-input.js` | 150 | `4f05a473a4db` | `tests/wallpaper-interaction.test.js`<br>`tests/wallpaper-native-input.test.js` | 已盘点；业务待审/未运行 |
| `desktop/wallpaper-engine-library.js` | 936 | `e885240105b9` | `tests/visual-clarity-and-portrait-fullscreen.test.js`<br>`tests/wallpaper-background-regression.test.js`<br>`tests/wallpaper-compatibility-messages.test.js`<br>`tests/wallpaper-engine-minimize-resident.test.js`<br>`tests/wallpaper-engine-win10-yellow-border.test.js`<br>`tests/wallpaper-interaction.test.js`<br>`tests/wallpaper-loop-mode.test.js`<br>`tests/wallpaper-quality-properties.test.js`<br>`tests/wallpaper-visual-reset.test.js` | 已盘点；业务待审/未运行 |
| `desktop/wallpaper-engine-loop-cache.js` | 205 | `568c0046cc97` | `tests/wallpaper-loop-cache.test.js` | 已盘点；业务待审/未运行 |
| `desktop/wallpaper-engine-properties.js` | 170 | `7940600afe0b` | `tests/wallpaper-background-regression.test.js`<br>`tests/wallpaper-quality-properties.test.js` | 已盘点；业务待审/未运行 |
| `desktop/wallpaper-engine-runtime.js` | 4538 | `00f33f12ca90` | `tests/cache-lifecycle.test.js`<br>`tests/main-window-runtime-recovery.test.js`<br>`tests/wallpaper-background-regression.test.js`<br>`tests/wallpaper-engine-idle-dispose.test.js`<br>`tests/wallpaper-interaction.test.js`<br>`tests/wallpaper-quality-properties.test.js`<br>`tests/wallpaper-window-follow.test.js` | 已盘点；业务待审/未运行 |
| `desktop/wallpaper-loop-window.js` | 101 | `badbf6850b11` | `tests/wallpaper-loop-window.test.js` | 已盘点；业务待审/未运行 |
| `desktop/wallpaper-mode-runtime.js` | 739 | `4ad0cc94802b` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### frontend/assets-and-entry

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/assets/skull-decimation-points.bin` | 二进制 | `4dfc716a5b8d` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/css/index.css` | 20156 | `001a4e398639` | `tests/curated-visual-presets.test.js`<br>`tests/home-dashboard-update.test.js`<br>`tests/home-hero-mp4-platform-recommend.test.js`<br>`tests/ui-default-theme-shelf-layer.test.js` | 已盘点；业务待审/未运行 |
| `public/default-user-fx-archive.json` | 216 | `4a57e11b12a9` | `tests/gesture-player-actions.test.js`<br>`tests/onboarding-guide.test.js` | 已盘点；业务待审/未运行 |
| `public/desktop-lyrics.html` | 1237 | `ec9e65d31605` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/index.html` | 2003 | `b6dbe03ae15c` | `tests/album-cover-background.test.js`<br>`tests/background-resume-electron-smoke.js`<br>`tests/cuefield-electron-smoke.js`<br>`tests/foreground-recovery-electron-smoke.js`<br>`tests/fx-slider-electron-smoke.js`<br>`tests/gesture-player-actions.test.js`<br>`tests/home-dashboard-update.test.js`<br>`tests/home-hero-mp4-platform-recommend.test.js`<br>`tests/login-qr-loading.test.js`<br>`tests/lyric-edit-electron-smoke.js`<br>`tests/lyric-layout-electron-smoke.js`<br>`tests/media-security-electron-smoke.js`<br>`tests/microphone-permission.test.js`<br>`tests/onboarding-guide.test.js`<br>`tests/pre-release-startup-memory.test.js`<br>`tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/server-security.test.js`<br>`tests/spotify-setup-electron-smoke.js`<br>`tests/ui-default-theme-shelf-layer.test.js`<br>`tests/update-external-only.test.js`<br>`tests/visual-effect-controls-electron-smoke.js`<br>`tests/visual-performance-controls.test.js`<br>`tests/wallpaper-cover-electron-smoke.js`<br>`tests/wallpaper-quality-properties.test.js` | 已盘点；业务待审/未运行 |
| `public/js/index-loader.js` | 154 | `6ef386322902` | `tests/built-in-playlist-library.test.js`<br>`tests/cuefield-mineradio-integration.test.js`<br>`tests/search-pinyin.test.js` | 已盘点；业务待审/未运行 |
| `public/js/playback-checkpoint-format.js` | 47 | `91e604f4e841` | `tests/playback-checkpoint.test.js`<br>`tests/queue-logical-order.test.js` | 已盘点；业务待审/未运行 |
| `public/js/preload-mode.js` | 8 | `a8af8d937f58` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/sonic-performance-policy.js` | 255 | `badd65f7a993` | `tests/sonic-performance.test.js`<br>`tests/sonic-topography-quality-continuity.test.js`<br>`tests/sonic-workshop-cadence.test.js` | 已盘点；业务待审/未运行 |
| `public/sonic-performance.js` | 403 | `5ecd78817c38` | `tests/sonic-performance.test.js` | 已盘点；业务待审/未运行 |
| `public/sonic-topography-preset.js` | 1113 | `06c40a23f08a` | `tests/sonic-topography-quality-continuity.test.js` | 已盘点；业务待审/未运行 |
| `public/sonic-workshop-preset.js` | 863 | `eaab5e6beb84` | `tests/sonic-workshop-audio.test.js`<br>`tests/sonic-workshop-electron-smoke.js` | 已盘点；业务待审/未运行 |

### frontend/00-state

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/00-state/00-core-stores.js` | 216 | `f0545914409d` | `tests/curated-visual-presets.test.js`<br>`tests/local-music-library-persistence.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/01-perf-render-state.js` | 80 | `3f10e79dffd0` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/02-preferences-ui-modes.js` | 382 | `70fc4b398aa0` | `tests/onboarding-guide.test.js`<br>`tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/ui-sfx-volume.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/02a-onboarding-state.js` | 29 | `6ff86db55fa1` | `tests/pre-release-startup-memory.test.js`<br>`tests/startup-window-guide.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/03-beat-dj-state.js` | 206 | `739e8742e55b` | `tests/cache-lifecycle.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/04-fx-defaults.js` | 220 | `645fd80e135b` | `tests/gesture-player-actions.test.js`<br>`tests/onboarding-guide.test.js`<br>`tests/ui-default-theme-shelf-layer.test.js`<br>`tests/user-fx-archive-compat.test.js`<br>`tests/visual-performance-controls.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/05-packaged-fx-archive.js` | 14 | `d154a7f0cae7` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/06-fx-runtime-layout.js` | 84 | `67f4219794c5` | `tests/playlist-panel-material.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/07-ui-playback-runtime.js` | 46 | `35a1dc8ac44f` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/08-desktop-render-power.js` | 513 | `f1ffe470f71f` | `tests/background-window-state-recovery.test.js`<br>`tests/foreground-recovery-work.test.js`<br>`tests/gesture-runtime-lifecycle.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/08a-first-run-quality.js` | 21 | `e5b2c179f427` | `tests/first-run-quality.test.js`<br>`tests/sonic-performance.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/09-performance-probe.js` | 223 | `ecf4066141c7` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/10-frame-scheduler.js` | 74 | `9b16a0b8cdf4` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/00-state/11-system-memory-controls.js` | 253 | `237da96d7021` | `tests/pre-release-startup-memory.test.js` | 已盘点；业务待审/未运行 |

### frontend/01-scene

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/01-scene/00-renderer-quality.js` | 194 | `728ea5eb3069` | `tests/original-render-quality.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/01-scene/01-orbit-free-camera.js` | 509 | `9eb61c5fb0b6` | `tests/curated-visual-presets.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/01-scene/02-beat-camera-runtime.js` | 1015 | `8a3cade51d26` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/01-scene/03-focus-cinema-camera.js` | 402 | `068cc1fb4aae` | `tests/panel-view-recenter.test.js`<br>`tests/visual-effect-controls-electron-smoke.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/01-scene/04-bottom-controls-cursor.js` | 404 | `5ab41074df99` | `tests/bottom-controls-hover.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/01-scene/05-ui-render-cache.js` | 108 | `1c9b104a7a3e` | `tests/paused-lyric-layout.test.js`<br>`tests/ui-render-cache.test.js` | 已盘点；业务待审/未运行 |

### frontend/02-visual

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/02-visual/00-pointer-cover-particles.js` | 1188 | `48217c1cb8c1` | `tests/curated-visual-presets.test.js`<br>`tests/visual-clarity-and-portrait-fullscreen.test.js`<br>`tests/visual-performance-controls.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/01-float-skull-backcover.js` | 826 | `b7f28a6013ae` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/02-lyrics-state-layout.js` | 111 | `147a08adf65b` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/02a-lyric-work-scheduler.js` | 91 | `218157e00902` | `tests/lyric-work-scheduler.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/03-lyrics-star-river.js` | 227 | `5f5dd731d481` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/04-visual-settings-persistence.js` | 1102 | `061e816b5a54` | `tests/gesture-player-actions.test.js`<br>`tests/ui-default-theme-shelf-layer.test.js`<br>`tests/user-fx-archive-compat.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/05-lyrics-fonts-texture.js` | 319 | `3c06223f960c` | `tests/lyric-spacing-stability.test.js`<br>`tests/user-fx-archive-compat.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/06-custom-background-colorlab.js` | 301 | `f9818a9e53cd` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/07-lyrics-palette-text-utils.js` | 581 | `4002760736e3` | `tests/adjacent-preparation.test.js`<br>`tests/visual-effect-controls-electron-smoke.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/08-lyrics-display-modes.js` | 154 | `e39e1a5f2b28` | `tests/lyric-motion-profiles.test.js`<br>`tests/lyric-spacing-stability.test.js`<br>`tests/user-fx-archive-compat.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/09-lyrics-payloads.js` | 219 | `cd3d4311ec20` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/10-lyrics-mask-textures.js` | 951 | `e4d6f73120ef` | `tests/lyric-runway-preparation.test.js`<br>`tests/visual-clarity-and-portrait-fullscreen.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/11-lyrics-shaders.js` | 160 | `d153661c567a` | `tests/lyric-motion-profiles.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/12-lyrics-row-layers.js` | 1976 | `590566517f50` | `tests/lyric-active-line-viewport-fit.test.js`<br>`tests/lyric-drag-quality.test.js`<br>`tests/lyric-runway-preparation.test.js`<br>`tests/lyric-spacing-stability.test.js`<br>`tests/lyric-track-seek-glide.test.js`<br>`tests/lyric-work-scheduler.test.js`<br>`tests/ui-default-theme-shelf-layer.test.js`<br>`tests/visual-clarity-and-portrait-fullscreen.test.js`<br>`tests/visual-performance-controls.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/12a-lyrics-edit-preview.js` | 186 | `63ddb0dfa4ca` | `tests/lyric-edit-preview.test.js`<br>`tests/lyric-work-scheduler.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/13-lyrics-mesh-build.js` | 503 | `ee6b6ca2cc37` | `tests/lyric-spacing-stability.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/14-stage-lyrics-rendering.js` | 4101 | `717ce3d922a1` | `tests/background-resume-electron-smoke.js`<br>`tests/lyric-edit-preview.test.js`<br>`tests/lyric-runway-preparation.test.js`<br>`tests/lyric-seek-visibility.test.js`<br>`tests/lyric-spacing-stability.test.js`<br>`tests/lyric-style-refresh.test.js`<br>`tests/lyric-title-handoff.test.js`<br>`tests/lyric-work-scheduler.test.js`<br>`tests/paused-lyric-layout.test.js`<br>`tests/playback-load-recovery.test.js`<br>`tests/shelf-lyric-flip.test.js`<br>`tests/shelf-panel-interaction.test.js`<br>`tests/stage-lyric-background-restore.test.js`<br>`tests/ui-default-theme-shelf-layer.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/02-visual/15-ripples-cover-depth.js` | 698 | `c4b2d6dec7ac` | `tests/foreground-recovery-electron-smoke.js`<br>`tests/foreground-recovery-work.test.js`<br>`tests/sonic-cover-palette-timing.test.js` | 已盘点；业务待审/未运行 |

### frontend/03-beat

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js` | 467 | `88c8868ce5fd` | `tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/qq-vip-entitlement.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/03-beat/01-audio-beat-analysis.js` | 761 | `378da5941092` | `tests/beat-analysis-memory.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/03-beat/02-podcast-dj-analysis.js` | 814 | `4b92eefa1aa4` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/03-beat/03-local-beat-cache-modal.js` | 364 | `6cc1a659d88f` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/03-beat/04-beat-map-runtime.js` | 125 | `664488172770` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/03-beat/05-cover-loading-crop.js` | 515 | `d7cc4b55a804` | `tests/cover-load-retry.test.js`<br>`tests/local-music-library-persistence.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/03-beat/05a-adjacent-preparation.js` | 199 | `de021c983574` | `tests/adjacent-preparation.test.js`<br>`tests/cover-load-retry.test.js`<br>`tests/playlist-cover-loader.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/03-beat/06-sonic-audio-monitor.js` | 736 | `3818caffc1e0` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### frontend/04-shelf

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/04-shelf/00-layout-hover.js` | 369 | `385d5ce51557` | `tests/shelf-panel-interaction.test.js`<br>`tests/shelf-texture-quality.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/04-shelf/01-manager-core.js` | 1004 | `3471a3e162b8` | `tests/built-in-playlist-library.test.js`<br>`tests/ui-default-theme-shelf-layer.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/04-shelf/02-rebuild-panel-sync.js` | 79 | `8524550bdbc0` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/04-shelf/03-content-list-manager.js` | 1120 | `c0abf41d885a` | `tests/built-in-playlist-library.test.js`<br>`tests/ui-default-theme-shelf-layer.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/04-shelf/04-cover-api-helpers.js` | 30 | `b20a50414255` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/04-shelf/04a-cover-loader.js` | 206 | `d79440d64fa4` | `tests/playlist-cover-loader.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/04-shelf/05-card-interactions.js` | 226 | `f08635da43a5` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/04-shelf/06-keyboard-camera-events.js` | 88 | `205f5079f710` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### frontend/05-playback

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/05-playback/00-api-quality-output.js` | 1277 | `b70337bfcfee` | `tests/audio-output-routing.test.js`<br>`tests/audio-route-drag.test.js`<br>`tests/playback-network-ownership.test.js`<br>`tests/provider-login-state-recovery.test.js`<br>`tests/quality-chip-local-track.test.js`<br>`tests/quality-preset.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/01-cover-custom-map.js` | 126 | `f34a3467624e` | `tests/album-cover-background.test.js`<br>`tests/cover-load-retry.test.js`<br>`tests/custom-cover-home-sync.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/02-listen-stats.js` | 370 | `f766fecbbaac` | `tests/cache-lifecycle.test.js`<br>`tests/platform-account-sync-guard.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/03-home-discover-weather.js` | 188 | `1e095fb86eec` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/03a-home-dashboard.js` | 1317 | `29c32bdfe2d7` | `tests/content-provider-priority.test.js`<br>`tests/home-daily-recommendation-virtualization.test.js`<br>`tests/home-dashboard-update.test.js`<br>`tests/home-hero-mp4-platform-recommend.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/04-home-empty-wallpaper.js` | 438 | `fef020119308` | `tests/content-provider-priority.test.js`<br>`tests/home-daily-recommendation-virtualization.test.js`<br>`tests/local-music-library-persistence.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/05-home-actions.js` | 65 | `995c3336d184` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/06-track-detail-lyrics-actions.js` | 2031 | `10edf993d37e` | `tests/artist-albums-more.test.js`<br>`tests/built-in-playlist-library.test.js`<br>`tests/comment-replies.test.js`<br>`tests/custom-cover-home-sync.test.js`<br>`tests/lyric-style-refresh.test.js`<br>`tests/platform-account-sync-guard.test.js`<br>`tests/song-comments-pagination.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/06a-comment-replies.js` | 127 | `9a4b605d438d` | `tests/comment-replies.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/06b-comment-avatars.js` | 118 | `c9563158c3ee` | `tests/comment-avatar-loader.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/06c-search-pinyin.js` | 152 | `96dd477a2627` | `tests/search-pinyin.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/07-search.js` | 2338 | `65f0ba9f6d83` | `tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/search-frontend-pagination.test.js`<br>`tests/search-pinyin.test.js`<br>`tests/source-switch-playability.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/08-audio-graph-controls.js` | 807 | `b4b4c79d1de6` | `tests/playback-audio-graph-recovery.test.js`<br>`tests/playback-pause-cancellation.test.js`<br>`tests/playback-single-repeat-loop.test.js`<br>`tests/ui-sfx-volume.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/09-queue-snapshot-autoplay.js` | 345 | `9f6422e40540` | `tests/playback-checkpoint.test.js`<br>`tests/queue-logical-order.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/09a-playback-checkpoint.js` | 22 | `bec592223881` | `tests/playback-checkpoint.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/10-queue-actions.js` | 150 | `a92edbffc3a3` | `tests/queue-logical-order.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/11-provider-fallback.js` | 1081 | `1fae39201ca3` | `tests/playback-network-ownership.test.js`<br>`tests/playback-source-fallback-transaction.test.js`<br>`tests/qishui-trial-full-source.test.js`<br>`tests/qq-vip-entitlement.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/12-playback-switch-core.js` | 188 | `db98a4ca01e3` | `tests/playback-checkpoint.test.js`<br>`tests/playback-load-recovery.test.js`<br>`tests/playback-network-ownership.test.js`<br>`tests/queue-removal.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/13-playback-start-audio.js` | 1716 | `37da36dfe1dc` | `tests/kugou-verification-flow.test.js`<br>`tests/local-music-library-persistence.test.js`<br>`tests/local-playback-skip-notice.test.js`<br>`tests/playback-network-ownership.test.js`<br>`tests/playback-single-repeat-loop.test.js`<br>`tests/playback-source-fallback-transaction.test.js`<br>`tests/qishui-seo-playback.test.js`<br>`tests/qq-vip-entitlement.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/14-player-controls.js` | 943 | `b20bfb2c1ba9` | `tests/local-music-library-persistence.test.js`<br>`tests/playback-background-resume.test.js`<br>`tests/playback-pause-cancellation.test.js`<br>`tests/playback-single-repeat-loop.test.js`<br>`tests/playback-source-fallback-transaction.test.js`<br>`tests/playback-start-stall.test.js`<br>`tests/queue-logical-order.test.js`<br>`tests/queue-removal.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/14a-system-media-session.js` | 111 | `81b1ae62b257` | `tests/system-media-session.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/15-control-glass-animations.js` | 1034 | `a9b14ecec4c0` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/16-cuefield-automix-core.js` | 372 | `3ff68826b26b` | `tests/cuefield-mineradio-integration.test.js`<br>`tests/cuefield-transition-runtime.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/17-cuefield-timeline-executor.js` | 314 | `2891c970e25f` | `tests/cuefield-mineradio-integration.test.js`<br>`tests/cuefield-transition-runtime.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/17a-cuefield-bridge-engine.js` | 177 | `107622c18a34` | `tests/cuefield-mineradio-integration.test.js`<br>`tests/cuefield-transition-runtime.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/17b-cuefield-source-loop.js` | 99 | `66a24b5ba3f8` | `tests/cuefield-mineradio-integration.test.js`<br>`tests/cuefield-transition-runtime.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/18-cuefield-automix-integration.js` | 1101 | `1ff75173991a` | `tests/cuefield-mineradio-integration.test.js`<br>`tests/playback-single-repeat-loop.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/19-microphone-mixer-runtime.js` | 197 | `7832ceeb7096` | `tests/microphone-mixer.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/05-playback/20-microphone-mixer-ui.js` | 212 | `e2a7a5916612` | `tests/microphone-mixer-ui.test.js` | 已盘点；业务待审/未运行 |

### frontend/06-lyrics

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/06-lyrics/00-built-in-playlists.js` | 189 | `70ae70780142` | `tests/built-in-playlist-library.test.js`<br>`tests/pre-release-startup-memory.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/00-lyrics-fetch-parse.js` | 672 | `30ec1bd0318b` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/01-playlist-panel-shell.js` | 766 | `4fb4a4e8615c` | `tests/content-provider-priority.test.js`<br>`tests/playlist-catalog-recovery.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/01a-scroll-motion.js` | 123 | `3afa291224f6` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/02-playlist-detail.js` | 816 | `b370ddfb0e0b` | `tests/built-in-playlist-library.test.js`<br>`tests/content-provider-priority.test.js`<br>`tests/platform-account-sync-guard.test.js`<br>`tests/playlist-catalog-recovery.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/03-podcast-playlist-loaders.js` | 319 | `24fb555bfc79` | `tests/built-in-playlist-library.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/04-progress-seek.js` | 540 | `e204d9f7c138` | `tests/playback-source-fallback-transaction.test.js`<br>`tests/progress-seek-gesture.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/05-upload-dragdrop.js` | 350 | `7cc581f93530` | `tests/local-music-library-persistence.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/06-lyrics/06-lyric-timing-offset.js` | 261 | `d45cbe6c444f` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### frontend/07-fx

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/07-fx/00-preset-archive-data.js` | 1507 | `47f7fcc049f3` | `tests/curated-visual-presets.test.js`<br>`tests/gesture-player-actions.test.js`<br>`tests/user-fx-archive-compat.test.js`<br>`tests/visual-performance-controls.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/01-lyric-color-controls.js` | 100 | `c00ea6b5c0a6` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/02-accent-background-controls.js` | 1192 | `4efcd85d2eb3` | `tests/album-cover-background.test.js`<br>`tests/wallpaper-background-regression.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/02a-album-cover-background.js` | 81 | `13e4f25d6278` | `tests/album-cover-background.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/03-cover-picker-fonts.js` | 320 | `591a7f9f3f70` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/03-wallpaper-engine-library.js` | 2663 | `66a88870e0a4` | `tests/visual-clarity-and-portrait-fullscreen.test.js`<br>`tests/wallpaper-background-regression.test.js`<br>`tests/wallpaper-compatibility-messages.test.js`<br>`tests/wallpaper-engine-minimize-resident.test.js`<br>`tests/wallpaper-engine-win10-yellow-border.test.js`<br>`tests/wallpaper-interaction.test.js`<br>`tests/wallpaper-loop-mode.test.js`<br>`tests/wallpaper-quality-properties.test.js`<br>`tests/wallpaper-visual-reset.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/03a-wallpaper-engine-interaction.js` | 68 | `c22c20929f4d` | `tests/wallpaper-interaction.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/03b-wallpaper-engine-loop.js` | 388 | `4c322a703733` | `tests/wallpaper-loop-mode.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/04-preset-grid-uniforms.js` | 127 | `f2ff7c88fed7` | `tests/curated-visual-presets.test.js`<br>`tests/visual-clarity-and-portrait-fullscreen.test.js`<br>`tests/visual-effect-controls-electron-smoke.js`<br>`tests/visual-performance-controls.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/04a-effect-scope.js` | 54 | `4adb6d37ab78` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/05-fx-panel-performance.js` | 887 | `5809a38c4f84` | `tests/gesture-player-actions.test.js`<br>`tests/wallpaper-visual-reset.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/06-hotkeys.js` | 358 | `4236935bbfde` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/06a-slider-preview.js` | 112 | `02106bdee3d1` | `tests/lyric-edit-preview.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/07-bindings-shelf-immersive.js` | 791 | `1deb0462554a` | `tests/shelf-panel-interaction.test.js`<br>`tests/visual-performance-controls.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/08-cache-storage-settings.js` | 80 | `643847db2cf4` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/07-fx/09-console-workspace.js` | 1133 | `825188b0740d` | `tests/gesture-player-actions.test.js`<br>`tests/visual-performance-controls.test.js` | 已盘点；业务待审/未运行 |

### frontend/08-account

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/08-account/00-update-preview.js` | 486 | `6a09c7c5eefd` | `tests/update-download-link-rotation.test.js`<br>`tests/update-early-check.test.js`<br>`tests/update-external-only.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/01-login-modal-utils.js` | 481 | `39cd8d322316` | `tests/content-provider-priority.test.js`<br>`tests/login-entry-direct.test.js`<br>`tests/login-presence-check.test.js`<br>`tests/membership-badge-consistency.test.js`<br>`tests/provider-login-state-recovery.test.js`<br>`tests/provider-removal-diy-cinema-preload.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/01a-avatar-recovery.js` | 70 | `f0de0e5df89e` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/01b-content-priority.js` | 91 | `a126e1487742` | `tests/content-provider-priority.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/02-login-status.js` | 696 | `c2bf000792d2` | `tests/kugou-verification-flow.test.js`<br>`tests/login-presence-check.test.js`<br>`tests/provider-login-state-recovery.test.js`<br>`tests/qq-vip-entitlement.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/03-login-modal-flows.js` | 2230 | `50c38e1315c5` | `tests/client-qr-login.test.js`<br>`tests/inline-login-lifecycle.test.js`<br>`tests/kugou-verification-flow.test.js`<br>`tests/login-attempt-contract.test.js`<br>`tests/login-entry-direct.test.js`<br>`tests/login-qr-loading.test.js`<br>`tests/membership-badge-consistency.test.js`<br>`tests/provider-login-state-recovery.test.js`<br>`tests/qishui-passport-qr-login.test.js`<br>`tests/qq-vip-entitlement.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/04-user-modal-logout.js` | 317 | `ec13281db4d7` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/05-startup-login-guide.js` | 132 | `2179e4bb709d` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/08-account/06-original-profile-import.js` | 136 | `d4c2a3dc8fe9` | `tests/original-profile-import.test.js` | 已盘点；业务待审/未运行 |

### frontend/09-idle-toast-libraries.js

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/09-idle-toast-libraries.js` | 514 | `c9d3f9224700` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### frontend/09a-onboarding-guide.js

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/09a-onboarding-guide.js` | 760 | `c49af4dea9d3` | `tests/onboarding-guide.test.js`<br>`tests/pre-release-startup-memory.test.js` | 已盘点；业务待审/未运行 |

### frontend/10-shell

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/10-shell/00-gesture-control.js` | 804 | `2cbd152eba9b` | `tests/gesture-camera-permission.test.js`<br>`tests/gesture-player-actions.test.js`<br>`tests/gesture-runtime-lifecycle.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/10-shell/01-viewport-resize-shortcuts.js` | 91 | `8e3b1649d13c` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `public/js/modules/10-shell/02-peek-panels-upload.js` | 502 | `005eba83fd3a` | `tests/shelf-panel-interaction.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/10-shell/03-splash.js` | 711 | `1c1e8826ac4f` | `tests/gesture-runtime-lifecycle.test.js`<br>`tests/startup-window-guide.test.js`<br>`tests/update-early-check.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/10-shell/04-desktop-overlay-fullscreen.js` | 1639 | `8a0a192c1722` | `tests/main-window-runtime-recovery.test.js` | 已盘点；业务待审/未运行 |
| `public/js/modules/10-shell/05-startup-bindings.js` | 99 | `686b1f859a0b` | `tests/local-music-library-persistence.test.js`<br>`tests/provider-removal-diy-cinema-preload.test.js`<br>`tests/update-early-check.test.js` | 已盘点；业务待审/未运行 |

### frontend/11-main-loop.js

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/js/modules/11-main-loop.js` | 752 | `7d70e8d980cc` | `tests/curated-visual-presets.test.js`<br>`tests/paused-lyric-layout.test.js`<br>`tests/paused-render-cadence.test.js` | 已盘点；业务待审/未运行 |

### third-party

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `public/vendor/gsap.min.js` | 11 | `92bb9a96476f` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/music-tempo.LICENCE` | 21 | `74b5c2717b3a` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/music-tempo.min.js` | 1 | `2927859a8e81` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/sonic-workshop/assets/index-Bhwp8mwk.css` | 1 | `6a860014b6a8` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/sonic-workshop/assets/index-Z-j1MQ-r.js` | 4598 | `0fb3c2693094` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/sonic-workshop/mineradio-bridge.html` | 392 | `c48e7cbfa2af` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/sonic-workshop/mineradio-performance.js` | 101 | `e9cc4999d971` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/sonic-workshop/mineradio-ripples.js` | 81 | `37cca106e6be` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/sonic-workshop/preview.gif` | 二进制 | `46a00ed397aa` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/sonic-workshop/project.json` | 387 | `82c7ed12a3ae` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `public/vendor/three.r128.min.js` | 6 | `9274bbcec8d9` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `qishui-auth-v6/bdms.js` | 1 | `dd918a8d2028` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `qishui-auth-v6/react-dom.js` | 245 | `9db33292007a` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `qishui-auth-v6/react.js` | 31 | `229bbf4d0e74` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |
| `qishui-auth-v6/sdk-glue.js` | 2 | `42f03c3d8f25` | 未检出直接文件/路径引用（可能间接覆盖） | 第三方来源/许可待核；不作自有通过 |

### qishui-decryptor-provenance-unverified

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `qishui-audio-decryptor/decrypt-utils.js` | 187 | `6050ebdc93aa` | 未检出直接文件/路径引用（可能间接覆盖） | 授权来源未核；待审/未运行 |
| `qishui-audio-decryptor/mp4-box.js` | 67 | `a8fd2f07f79b` | 未检出直接文件/路径引用（可能间接覆盖） | 授权来源未核；待审/未运行 |
| `qishui-audio-decryptor/track-decryptor.js` | 160 | `a83b23da07dd` | 未检出直接文件/路径引用（可能间接覆盖） | 授权来源未核；待审/未运行 |

### qishui-security-host-provenance-unverified

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `qishui-auth-v6/security_host.html` | 391 | `9c6e6f9c1e05` | `tests/qishui-mfa-lifecycle.test.js` | 授权来源未核；待审/未运行 |
| `qishui-auth-v6/security_seed.html` | 5 | `d68405171ca7` | 未检出直接文件/路径引用（可能间接覆盖） | 授权来源未核；待审/未运行 |

### qa-dev-release-tools

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `scripts/audit-critical-grep.js` | 34 | `3e3988b39f9a` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/audit-critical-mutations.js` | 140 | `510a03bbe99a` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/audit-next-targets.js` | 63 | `94417d11daf7` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-desktop-icon-lock-live.js` | 1102 | `c6c840423d1d` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-desktop-keyboard-focus-live.js` | 286 | `beba820c8203` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-audio-session.ps1` | 349 | `b44cec91b279` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-dwm-thumbnail.ps1` | 176 | `c9bc03d591e1` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-host-move-helper.js` | 134 | `8e843c54d415` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-library.js` | 212 | `59b7ef6c5d4f` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-lifecycle.js` | 1182 | `903763b2b6d1` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-live-scene.js` | 224 | `e188e6287a2f` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-live-ui.js` | 259 | `2503c3fa9400` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-normal-user.js` | 630 | `100384975cf0` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-property-command.js` | 275 | `18fd0d6def73` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-runtime.js` | 2153 | `a716866e0319` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-engine-window-list.ps1` | 87 | `a1ac4fc0db7a` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-mode-live.js` | 502 | `9978c7b3912a` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/check-wallpaper-mode-window-tree.ps1` | 102 | `b986c5d78548` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/diagnose-wallpaper-engine-pointer-target.js` | 247 | `ba54bb2750a3` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/list-wallpaper-engine-capture-sources.js` | 19 | `b4a9639fcb31` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/qa/comment-cover-benchmark.js` | 56 | `a876b4d082c7` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/qa/isolated-electron.js` | 121 | `f193a0535428` | `tests/adaptive-quality-ui-electron-smoke.js`<br>`tests/aero-input-electron-smoke.js`<br>`tests/song-comments-electron-smoke.js`<br>`tests/sonic-performance-electron-smoke.js` | 已盘点；业务待审/未运行 |
| `scripts/qa/render-static.js` | 32 | `56609ace16b5` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/quick-check.js` | 5745 | `5fb716bce941` | `tests/startup-qa-userdata-isolation.test.js` | 已盘点；业务待审/未运行 |
| `scripts/read-wallpaper-engine-dwm-state.js` | 309 | `ba629d2e7e5c` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/run-electron-smoke.js` | 51 | `eb293bbf3335` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/run-tests.js` | 20 | `1ed75bce44a2` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/start-remix-dev.ps1` | 106 | `9f56f91acd51` | `tests/dev-launcher-process-selection.test.ps1` | 已盘点；业务待审/未运行 |
| `scripts/sync-current-fx-default-archive.js` | 54 | `18f40a5507fd` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/verify-installed-renderer.js` | 65 | `27d1d8114202` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/verify-packaged-metadata.js` | 11 | `444b0ce73108` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |
| `scripts/verify-windows-installer.ps1` | 120 | `f972d93120bb` | 未检出直接文件/路径引用（可能间接覆盖） | 已盘点；业务待审/未运行 |

### tests

| 文件 | 行 | SHA-256前12位 | 直接测试引用（全部） | 审查/运行状态 |
|---|---:|---|---|---|
| `tests/account-avatar-electron-smoke.js` | 116 | `d99647efc9dc` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/adaptive-quality-ui-electron-smoke.js` | 185 | `a99eae2b5277` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/adjacent-preparation.test.js` | 45 | `ef527fc2358f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/aero-input-electron-smoke.js` | 22 | `d06041636684` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/album-cover-background.test.js` | 122 | `16eff422a755` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/artist-albums-more.test.js` | 57 | `14f3d5451210` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/audio-output-routing.test.js` | 130 | `da32ecaaf5d2` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/audio-proxy-lifecycle.test.js` | 127 | `ea4b7637c108` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/audio-route-drag.test.js` | 35 | `a00c1f5339aa` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/audio-spill-relay.test.js` | 199 | `f8e333d4bbde` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/background-resume-electron-smoke.js` | 224 | `f434cd4d82b4` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/background-window-state-recovery.test.js` | 79 | `7535726b72d8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/beat-analysis-memory.test.js` | 116 | `4345c4d96a4c` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/bottom-controls-hover.test.js` | 97 | `aba81dffbb15` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/browser-cookie-import.test.js` | 69 | `5e2e2b313d5a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/built-in-playlist-library.test.js` | 79 | `f97974ba23c8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cache-lifecycle.test.js` | 161 | `79a7b031d3e7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cache-root-fallback.test.js` | 22 | `4bf6d4aeeab7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/client-qr-login.test.js` | 152 | `66f57eaf8867` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/comment-avatar-loader.test.js` | 38 | `e272e51bd283` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/comment-replies.test.js` | 202 | `acee03785ef8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/content-provider-priority.test.js` | 271 | `bd127e43202c` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cookie-storage.test.js` | 36 | `84cfb0a9d9e7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cover-cache.test.js` | 116 | `e93f4827b615` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cover-load-retry.test.js` | 135 | `4dbccbbe7686` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cover-proxy-lifecycle.test.js` | 57 | `ace128124c4a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/credential-migration-lifecycle.test.js` | 37 | `7308bab2192f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cuefield-electron-smoke.js` | 115 | `483a6eefb939` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cuefield-mineradio-integration.test.js` | 39 | `1d7df2684a36` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/cuefield-transition-runtime.test.js` | 129 | `ee354fe6ff81` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/curated-visual-presets.test.js` | 42 | `7c0410d88012` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/custom-cover-home-sync.test.js` | 54 | `859b6f84d53c` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/desktop-icon-shape-runtime.test.js` | 275 | `0edb1590407b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/desktop-native-icon-layer-runtime.test.js` | 205 | `617caf39c151` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/dev-launcher-process-selection.test.ps1` | 30 | `023cb74229f9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/dev-launcher.test.js` | 30 | `0c187f755c61` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/external-update-page-bridge.test.js` | 26 | `94da37c86249` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/first-run-quality.test.js` | 63 | `8854ebcc5e91` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/fixtures/aero-input-probe.js` | 35 | `4a1dd23a7458` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/fixtures/slider-video.webm` | 二进制 | `18eef5cf518f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/fixtures/update-three-cloud-pages.json` | 24 | `695dc9135918` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/foreground-recovery-electron-smoke.js` | 72 | `7774ec15c461` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/foreground-recovery-work.test.js` | 30 | `612ec8498152` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/full-desktop-geometry-electron-smoke.js` | 123 | `e1ce41d184f7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/full-desktop-mode-runtime.test.js` | 1349 | `e83b00f2b33c` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/fx-slider-electron-smoke.js` | 214 | `5d397911bb81` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/gesture-camera-permission.test.js` | 24 | `60a568373b2a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/gesture-player-actions.test.js` | 54 | `baae20099c14` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/gesture-runtime-lifecycle.test.js` | 188 | `20082fcaafed` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/helpers/classic-functions.js` | 27 | `229ff94298bd` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/helpers/electron-frames.js` | 16 | `fea7c2d59c4d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/home-card-hover-electron-smoke.js` | 142 | `e560714370f0` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/home-daily-recommendation-virtualization.test.js` | 102 | `b96bf4fa7858` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/home-daily-recommendations-backend.test.js` | 76 | `77e78ad990b3` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/home-dashboard-update.test.js` | 167 | `576c2bc40d7a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/home-hero-mp4-platform-recommend.test.js` | 126 | `88e78d5daf47` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/inline-login-lifecycle.test.js` | 126 | `37d26f082f91` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/installer-cleanup.test.js` | 160 | `847bc265d6a3` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-api-resilience.test.js` | 540 | `d5712b294b7e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-community.test.js` | 117 | `c064aea7b374` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-login-bridge.test.js` | 350 | `57b8473925ca` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-native-qr.test.js` | 83 | `9a6e52052a12` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-verification-electron-smoke.js` | 88 | `8e21d5119e4b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-verification-flow.test.js` | 121 | `ee6f4ed35c4b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-verification.test.js` | 41 | `d7c47ab152cf` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/kugou-vip-hardening.test.js` | 343 | `8f96784956ea` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/local-alternate-fingerprint-cache.test.js` | 44 | `86a9246426a9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/local-library-offline-relink.test.js` | 93 | `3f2a8085598d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/local-music-library-persistence.test.js` | 285 | `88a7ff939dbc` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/local-playback-skip-notice.test.js` | 85 | `a73ac9923fff` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/login-attempt-contract.test.js` | 142 | `396dc156d3a4` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/login-entry-direct.test.js` | 51 | `e29f1c858f5d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/login-logout-race.test.js` | 97 | `1f70b3628dd1` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/login-presence-check.test.js` | 136 | `d7babfa777e8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/login-qr-loading.test.js` | 153 | `d203889ec5b2` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-active-line-viewport-fit.test.js` | 85 | `d2db9f81c318` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-drag-quality.test.js` | 20 | `f4e7a05e246f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-edit-electron-smoke.js` | 264 | `20aead3ce5a9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-edit-preview.test.js` | 70 | `d17ed0db84cf` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-layout-electron-smoke.js` | 122 | `ff5e055e20e6` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-motion-profiles.test.js` | 54 | `1c086ac9bcd8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-runway-preparation.test.js` | 106 | `066b187a2827` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-seek-visibility.test.js` | 72 | `d1a0e337a5ff` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-spacing-stability.test.js` | 94 | `33a52a816568` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-style-refresh.test.js` | 84 | `6e9b0033833e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-title-handoff.test.js` | 66 | `46b53311baf4` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-track-seek-glide.test.js` | 40 | `e698c84784c4` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/lyric-work-scheduler.test.js` | 182 | `6d0da4fac77e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/main-window-runtime-recovery.test.js` | 130 | `accdc83fb7b5` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/media-security-electron-smoke.js` | 82 | `aebaf92cbb05` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/membership-badge-consistency.test.js` | 18 | `dbc1a0e7d0e5` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/microphone-mixer-ui.test.js` | 11 | `f8075d4314bb` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/microphone-mixer.test.js` | 91 | `e2a64efc3699` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/microphone-permission.test.js` | 139 | `03585f8e7ea4` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/music-dns.test.js` | 81 | `b758f46e98fd` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/netease-like-cache.test.js` | 72 | `1c0df5d920dc` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/netease-login-navigation.test.js` | 80 | `5ffcc545d6af` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/network-compatibility.test.js` | 117 | `3ba38aff8bc3` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/next-critical-boundaries.test.js` | 157 | `9e2b374b0401` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/onboarding-guide-electron-smoke.js` | 180 | `dbe6472138c9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/onboarding-guide.test.js` | 182 | `b505beac8aff` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/original-profile-entry-electron-smoke.js` | 103 | `aafebe005d03` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/original-profile-import.test.js` | 126 | `034fd66e0164` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/original-render-quality.test.js` | 32 | `1515b38af644` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/packaging-runtime-files.test.js` | 37 | `72ec0f1a38a6` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/panel-view-recenter.test.js` | 23 | `ac251c6593cd` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/paused-lyric-layout.test.js` | 134 | `0f483f7df6ba` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/paused-render-cadence.test.js` | 36 | `40f8b3ac7635` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/platform-account-sync-guard.test.js` | 65 | `3726da657e42` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-audio-graph-recovery.test.js` | 455 | `36480da66292` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-background-resume.test.js` | 116 | `878b3387d97d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-checkpoint.test.js` | 185 | `46995c7df392` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-load-recovery.test.js` | 43 | `c7adcd42caf1` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-network-ownership.test.js` | 140 | `e6d357e9bf7f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-pause-cancellation.test.js` | 65 | `7732b1bab8fe` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-single-repeat-loop.test.js` | 39 | `da42e35cc0c7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-source-fallback-transaction.test.js` | 273 | `e57d64727940` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-start-stall-electron-smoke.js` | 80 | `86d6e5162c92` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playback-start-stall.test.js` | 88 | `2edde2cc647e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/player-navigation-startup-electron-smoke.js` | 81 | `18f2fdb6a08e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playlist-catalog-recovery.test.js` | 184 | `821c9d145e3d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playlist-cover-loader.test.js` | 98 | `2e50ee28b948` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playlist-detail-layout-electron-smoke.js` | 73 | `024fc8119f89` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playlist-interaction-electron-smoke.js` | 243 | `05e385e19b49` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playlist-paging.test.js` | 11 | `fc459341dd64` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/playlist-panel-material.test.js` | 28 | `f8c83a3a958e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/pre-release-startup-memory.test.js` | 153 | `07109ac64586` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/progress-seek-gesture.test.js` | 39 | `613ef3f98ccf` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/provider-entitlement-boundary.test.js` | 659 | `7d0c3e839120` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/provider-login-state-recovery.test.js` | 186 | `f2cece6a9cd2` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/provider-removal-diy-cinema-preload.test.js` | 44 | `46b570517956` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-cache-generation.test.js` | 40 | `f3cdf1dba28a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-decrypt-cache-bounds.test.js` | 113 | `169fc37978e1` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-entitlement-cache.test.js` | 215 | `108e9253ac07` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-local-official-merge.test.js` | 358 | `f3278e15e789` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-mfa-lifecycle.test.js` | 158 | `a841232326e9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-native-signing.test.js` | 44 | `17d8de60107b` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-passport-live-smoke.js` | 57 | `bd1f8c4d0cd0` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-passport-qr-login.test.js` | 144 | `7e791d1bb88a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-provider-distribution.test.js` | 117 | `42515fa45b81` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-quality-tier.test.js` | 20 | `5b04a48807fe` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-seo-playback.test.js` | 213 | `be7690e5ac3e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-session-recovery.test.js` | 252 | `c39ab8e43280` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-tier-rights.test.js` | 196 | `e33c77a71405` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qishui-trial-full-source.test.js` | 244 | `3a4758eb865e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qq-login-page.test.js` | 35 | `93c501a9aa74` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qq-native-protocol.test.js` | 163 | `f7d5557f9028` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/qq-vip-entitlement.test.js` | 590 | `d5d5127d3a23` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/quality-chip-local-track.test.js` | 42 | `c29744757901` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/quality-preset.test.js` | 52 | `52d5d59d51e9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/quality-reset-electron-smoke.js` | 98 | `81479252858f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/queue-logical-order.test.js` | 103 | `b832caad4eed` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/queue-pause-electron-smoke.js` | 118 | `c8acc87cc9f4` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/queue-removal.test.js` | 89 | `1128637f5f28` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/remix-updater-download.test.js` | 106 | `a40c9eda5d43` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/remix-updater.test.js` | 143 | `4af6c6a24caf` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/request-lifecycle.test.js` | 86 | `1723289e25a8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/search-backend-latency.test.js` | 109 | `1e7a4a66c207` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/search-frontend-pagination.test.js` | 490 | `870ff623ca53` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/search-pinyin.test.js` | 91 | `cce49157453f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/server-security.test.js` | 150 | `2a9004c70bb3` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/shelf-lyric-flip.test.js` | 148 | `920924d88483` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/shelf-panel-interaction.test.js` | 166 | `763c4f0b2a71` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/shelf-texture-quality.test.js` | 70 | `8f267a1c6d31` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/song-comments-electron-smoke.js` | 245 | `8be241816212` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/song-comments-pagination.test.js` | 394 | `47e389d6d832` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-cover-palette-timing.test.js` | 85 | `116f03ee4d5d` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-performance-electron-smoke.js` | 167 | `5e90977ec577` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-performance.test.js` | 719 | `b5a6fcaa1acd` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-preferences-store.test.js` | 28 | `6f678b15e891` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-topography-quality-continuity.test.js` | 44 | `319b13aca4cf` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-workshop-audio.test.js` | 90 | `787553d3b007` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-workshop-cadence.test.js` | 72 | `40a27983b131` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-workshop-electron-smoke.js` | 96 | `101efc098244` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/sonic-workshop-ripples.test.js` | 30 | `f5fefc55b51a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/source-switch-playability.test.js` | 41 | `2d83ada4f4e6` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/spotify-api-resilience.test.js` | 259 | `c5756d941dc5` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/spotify-setup-electron-smoke.js` | 101 | `1ebc2a90049f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/spotify-token-lifecycle.test.js` | 98 | `67c0cd96c7a8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/stage-lyric-background-restore.test.js` | 152 | `a12502b24070` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/startup-flow-electron-smoke.js` | 93 | `e3a4696b22f1` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/startup-navigation-readiness.test.js` | 224 | `68645c5ac98f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/startup-qa-userdata-isolation.test.js` | 20 | `c12c0cd7ce8a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/startup-window-guide.test.js` | 72 | `8195a798004f` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/system-media-session.test.js` | 46 | `9c85764a9d10` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/ui-default-theme-shelf-layer.test.js` | 147 | `1e7c53a8caea` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/ui-render-cache.test.js` | 31 | `41c727f5bc91` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/ui-sfx-volume.test.js` | 64 | `1c0f79c4c2f7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/update-download-link-rotation.test.js` | 170 | `1616ca3fd30c` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/update-early-check.test.js` | 65 | `8fc269469242` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/update-external-only.test.js` | 92 | `015ba0cb0bea` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/user-fx-archive-compat.test.js` | 155 | `72ee215e2656` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/visual-clarity-and-portrait-fullscreen.test.js` | 46 | `3e17924e968e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/visual-effect-controls-electron-smoke.js` | 180 | `67794d866894` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/visual-performance-controls.test.js` | 48 | `94840fb126e9` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/visual-resource-electron-smoke.js` | 121 | `2ac2228312d7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-background-regression.test.js` | 246 | `b9dbd6cb6c04` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-compatibility-messages.test.js` | 55 | `ae94f2679888` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-cover-electron-smoke.js` | 261 | `c5188556af00` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-engine-idle-dispose.test.js` | 67 | `c519eb1a6bd7` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-engine-minimize-resident.test.js` | 31 | `4a470e9c0741` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-engine-win10-yellow-border.test.js` | 70 | `59a4af4eb2bf` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-interaction.test.js` | 111 | `ae0a1b2e0f44` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-loop-cache.test.js` | 71 | `d4a74241b409` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-loop-mode.test.js` | 199 | `b021b0dc72bc` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-loop-window.test.js` | 66 | `cbdfe3e84673` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-native-input.test.js` | 64 | `4e1bec9bf22e` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-quality-properties.test.js` | 121 | `f09038306d72` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-visual-reset.test.js` | 82 | `ab849d18c23a` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/wallpaper-window-follow.test.js` | 153 | `39984ecc8669` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |
| `tests/workflow-release-boundary.test.js` | 34 | `96fec97c48d8` | 未检出直接文件/路径引用（可能间接覆盖） | 非业务源码；按所属角色核对 |

## 交接与更新契约

- 播放/歌词/持久化：05-playback、06-lyrics、歌词02-visual、分析03-beat、CueField、本地/内置歌单/检查点；逐文件给已审状态与实测边界。
- 桌面/安全/生命周期：所有 desktop/preload/IPC、server-security/凭据、更新/安装/导入、WE/完整桌面、依赖授权；Linux无法执行项必须继续列未验证。
- UI/UX/a11y：index/CSS、04-shelf、06-lyrics界面、08-account界面、09通知/引导、10-shell、desktop-lyrics；每个按钮/模态/键盘入口都以附录分母检查。
- 平台/API/网络：96API分支和全部provider helper、前端调用、登录/会员/取链/搜索/评论/写操作、DNS/代理/缓存；已修并行变化需要同哈希最终重验。
- 性能资源/架构已明确认领：00-state、01-scene、02-visual、03-beat、07-fx、10-shell、11-main-loop、sonic、CueField与音频/麦克风的架构、CPU/GPU/内存/资源生命周期。负责人已收到完整清单，报告证据到达前仍标未审。
- 后续报告不得直接把本文件的“待审/未运行”全部改成通过；用功能ID、文件hash、实际日志/截图和缺陷ID关联。保留所有仍未审文件与真实平台/Windows/长期压力缺口。

## 2026-10-09 21:20 UTC 盘点收口状态

- 架构/资源性能范围已明确分配；不再属于未认领遗漏，当前仍等待逐文件和运行报告证据。
- 桌面/安全审查在父任务安全检查中断后停止，当前状态为 interrupted/read-only-partial。详见 [桌面/安全部分报告](QA_DESKTOP_SECURITY_2026-10-09.md)。该报告的确认问题仍未修复，所有Windows实机验证未完成；本矩阵不把它标为全通过，也不重试或绕过被拒动作。
- 本清单产物完整性已验证：文件路径无重复、所有功能组均有源文件、全部131加载路径存在、调用CSV共61,559行；未执行应用或安全探针。
- 并行改动后发现下列文件与原盘点hash不同，相关行号/函数/调用索引必须在最终代码稳定后刷新。完整新旧hash保留在JSON final_inventory_validation；这些文件没有因为旧证据存在而获得当前通过状态。

| 已变化文件 | 当前行数 | 索引状态 |
|---|---:|---|
| `README.md` | 455 | 快照后变化，待刷新/重验 |
| `docs/LOGIN_AUDIT_2026-10-09.md` | 53 | 快照后变化，待刷新/重验 |
| `docs/NETWORK_CHAIN_AUDIT_2026-10-09.md` | 88 | 快照后变化，待刷新/重验 |
| `docs/RELEASE_NOTES_NEXT.md` | 596 | 快照后变化，待刷新/重验 |
| `kugou-api.js` | 2484 | 快照后变化，待刷新/重验 |
| `public/js/modules/04-shelf/06-keyboard-camera-events.js` | 88 | 快照后变化，待刷新/重验 |
| `public/js/modules/05-playback/01-cover-custom-map.js` | 134 | 快照后变化，待刷新/重验 |
| `public/js/modules/05-playback/14-player-controls.js` | 948 | 快照后变化，待刷新/重验 |
| `public/js/modules/05-playback/16-cuefield-automix-core.js` | 373 | 快照后变化，待刷新/重验 |
| `public/js/modules/06-lyrics/00-built-in-playlists.js` | 209 | 快照后变化，待刷新/重验 |
| `public/js/modules/06-lyrics/03-podcast-playlist-loaders.js` | 355 | 快照后变化，待刷新/重验 |
| `public/js/modules/06-lyrics/04-progress-seek.js` | 549 | 快照后变化，待刷新/重验 |
| `public/js/modules/08-account/01-login-modal-utils.js` | 599 | 快照后变化，待刷新/重验 |
| `public/js/modules/08-account/03-login-modal-flows.js` | 2235 | 快照后变化，待刷新/重验 |
| `public/js/modules/10-shell/00-gesture-control.js` | 815 | 快照后变化，待刷新/重验 |
| `public/js/modules/10-shell/01-viewport-resize-shortcuts.js` | 91 | 快照后变化，待刷新/重验 |
| `qishui-api.js` | 3758 | 快照后变化，待刷新/重验 |
| `scripts/quick-check.js` | 5752 | 快照后变化，待刷新/重验 |
| `server.js` | 7142 | 快照后变化，待刷新/重验 |
| `tests/login-attempt-contract.test.js` | 197 | 快照后变化，待刷新/重验 |
| `tests/queue-removal.test.js` | 100 | 快照后变化，待刷新/重验 |
