# 视觉资源与生命周期子审查（2026-10-09）

## 结论与验证边界

本项从完整生产调用链审查，不仅看本轮 diff。发现并在父审查授权后修复两个问题：主页卡片图片没有取消/超时/失败恢复；3D 内容列表关闭后保留旧封面视口与预取队列。首页 MP4 原生窗口休眠判断、保存操作代际由父审查并行修复，此处独立复核。另发现自定义背景视频 IndexedDB 无应用级空间上界与旧记录回收，保留未修复项交给总审查。

- 基线：Git HEAD `5bc4f03fed242b7df743924312b379642b1f3b7b`；工作区原有大量并行修改，未回滚、覆盖或提交它们。
- 已读 CLAUDE.md、docs/AI_REVIEW_HANDOFF.md、.claude/skills/isolated-ui-check/SKILL.md。
- 使用源码读取、Node VM 和纯内存 DOM/Image/IndexedDB 双替身。没有启动完整播放器、Unix socket 服务、Electron 窗口或真实 WebGL；没有读取真实账号、曲库或用户配置；没有访问真实网络、推送或发布。
- 没有截图或主观观感结论。VM 可证明请求所有权、状态转换和预算账本，不能证明真实 GPU/视频解码工作集、Chromium缓存占用、Windows窗口遮挡行为或高清视觉效果。

## 有证据的发现

### V1 · P2 · 主页图片失败永久冷却，快速替换没有资源所有权（本项已修）

位置：public/js/modules/05-playback/03a-home-dashboard.js，homeDashboardSetStableBackgroundImage；调用方 homeDashboardPatchCard / renderHomeInsightDock。

基线根因：请求前写 `__homeDashboardRequestedBackground`，相同源直接返回；onerror 为空。失败后后续相同源刷新不会重试，仍显示旧曲目封面。每次换源创建独立 Image，但没有取消旧 Image、解码代际、超时、共享并发预算或退场清理。

复现：真实函数 VM 中让新图片失败，再刷新同源100次，只创建1个Image，显示仍为old-art；再换30个源，31个Image的旧src清理数为0。此为请求生命周期证明，不将31个对象等同31份已解码内存。

影响：短暂网络失败会使对应主页卡片保持错误/旧封面；快速切歌和反复重绘会留下过时请求与解码任务，与其他图片消费者争抢资源。

修复：每元素owner；替换、断开DOM、离开首页、深后台、visibilitychange、pagehide取消并清src；借用 reserveBackgroundImageSlot 二槽预算；10秒超时、一次800ms自动重试、30秒冷却以及online恢复；旧图片的迟到decode不能提交；成功前保留已显示图片，URL与分辨率不变。最终owner不持有已结束Image。

实际验证：新增 tests/home-background-image-lifecycle.test.js 覆盖迟到decode、成功去重、失败与超时、有限重试、冷却/online、共享槽与退场。after探针失败尝试数为2、快速替换32个Image中31个已清src；剩余1个是当前请求。

### V2 · P3 · 关闭3D内容列表后，封面预取视口不退休（本项已修）

位置：public/js/modules/04-shelf/03-content-list-manager.js，prefetchContentCoversAround → updatePlaylistCoverViewport；close → 原来只清行、组和请求token。

基线根因：close 没有清 playlistCoverViewportVisible / Nearby，loader不知道内容已关闭；scope=content 的旧预取仍在queue。waiter的isCurrent只在viewport更新时剪枝；online也会按旧viewport重试。

复现：只暴露真实manager闭包的初始open/group状态，close代码体不改。排19个content封面后关闭，open=false但active=2、queued=17、visibleUrls=1、nearbyUrls=18。

影响：关闭列表后仍为旧内容下载/解码，保护过期图片，重连可能恢复隐藏内容；已显示封面和最大并发并未无限增长，因此按P3而非长期无界泄漏计。

修复：close在open=false和requestToken++之后执行updatePlaylistCoverViewport([], [])。先使旧waiter无效，再由原loader取消活动/重试/队列并释放共享槽。

实际验证：同一探针after全部归零。新增 tests/shelf-cover-close-lifecycle.test.js，真实close后活动Image清src、二槽归零、online不拉旧内容、重复close安全。

### V3 · P2 · 首页MP4与原生窗口休眠策略不一致（父审查已修，此处复核）

位置：03a-home-dashboard.js，homeDashboardVideoShouldPlay；窗口链为00-state/08-desktop-render-power.js updateDesktopRuntimeState → body render-deep-sleep class → 首页MutationObserver。

基线仅看document.hidden；原生isMinimized=true/isVisible=false而document.hidden短暂false时，isDeepBackgroundMode=true但homeDashboardVideoShouldPlay=true。源码明确说明Electron原生状态应作为电源策略依据。

影响：原生窗口已经休眠时，首页视频逻辑仍允许play/保留object URL。VM证明策略决策矛盾；没有量化真实Windows视频耗电。

父修复新增deep-background检查。相同VM after应播放=false；tests/home-video-ui-lifecycle.test.js对应断言通过。本项未修改MP4函数。

### V4 · P3 · 首页MP4较早保存的metadata/提示可越过较新编辑意图（父审查已加固）

位置：handleHomeDashboardVideoFile await put后的metadata/提示提交；clearHomeDashboardVideo。

较早save continuation没有编辑代际。抽象Promise次序VM中clear后旧continuation重新写metadata并发“主页MP4已保存”；父修复加入editToken，after metadata=null且只发恢复提示。

必须限定：此探针不是IndexedDB事务调度模型。同store读写事务真实串行；前台attach的后续get也可能清掉缺失blob的metadata。因此不声称真实视频最终复活、真实blob复写或实际IDB删除顺序已复现。本项只报告并验证陈旧metadata/提示的守卫。

### V5 · P2 · 自定义背景视频存储无空间上界与旧blob回收（未修，已交总审查）

位置：02-visual/06-custom-background-colorlab.js，openCustomBackgroundDb / putCustomBackgroundBlob；07-fx/02-accent-background-controls.js，readBackgroundVideoFile / setCustomBackgroundMedia / clearCustomBackgroundImage。

完整链：选择video → 每次生成bg-video-时间-随机id → IDB put → fx.backgroundMedia切换当前id。更换、切封面背景、清除媒体只修改fx/播放源，没有删除旧IDB记录。正常IDB写入路径没有单文件/累计字节限制；18MiB检查仅在写入失败后针对dataURL回退。

运行证明：在纯内存IDB双替身运行真实readBackgroundVideoFile/putCustomBackgroundBlob/setCustomBackgroundMedia，三个size=500MiB假文件依次保存，再执行真实clearCustomBackgroundImage，fx.backgroundMedia=null但保留3条记录、代表字节1,572,864,000。没有分配真实1.5GiB文件或测量真实磁盘。

影响：重复更换本地视频会保留无用大blob，直到浏览器配额/磁盘压力阻止保存；“清除背景”不能回收这些占用。浏览器配额不是应用级预算。

建议：事务化空间账本和明确单文件/总量限制；先成功持久化新的当前引用，再仅回收无任何当前布局/保留配置引用的记录。旧用户数据回收需遵守项目授权边界，不能直接清空整个store。还应区分清除画面与真正移除存储失败的提示。本项未改这两个生产文件。

## 逐文件/调用链实际覆盖 ledger

以下是实际阅读和追踪范围，不把静态读取或邻近测试等同完整UI验收。

| 文件或链 | 实际审查内容 | 动态证据/限制 |
|---|---|---|
| 01-scene/05-ui-render-cache.js | 单一颜色+深度render target、尺寸失效、capabilities回退、场景可见性/target/autoClear finally恢复、close/deep release | ui-render-cache VM；未跑真实WebGL深度格式/fragDepth |
| 01-scene/00-renderer-quality.js、00-state/08-desktop-render-power.js、11-main-loop.js | DPR/像素预算、paused/display cadence、原生deep判定、animate deep branch释放UI target、45秒/后台cache trim及受保护封面 | paused-render-cadence、foreground-recovery-work；ultra原始DPR没有像素上限是既有明确画质取舍，未当缺陷 |
| 02-visual/00-pointer-cover-particles.js | 固定dot/cover/edge/previous/ripple纹理；cover geometry重建共享给粒子+bloom，旧geometry释放；星河固定1400点 | 资源创建/替换源读；GPU实际分配未测；GLSL数值视觉未逐公式验收 |
| 02-visual/01-float-skull-backcover.js | float 1300/backCover 3000固定数组、create/destroy；skull二进制singleflight/failed标记、几何创建与按preset更新 | 静态源链；实际skull资产fetch/视觉未跑 |
| 02-visual/02-lyrics-state-layout.js、02a-lyric-work-scheduler.js | 单共享调度队列、同key替换/取消、2.4ms切片、pause/urgent/runWhenPaused、上传让步与清理防饿死 | lyric-work-scheduler VM |
| 02-visual/03-lyrics-star-river.js | 星河固定420点、owned texture区分共享dot；disposeLyricMesh从场景摘除、quality owner退休、分块12对象dispose | scheduler回归；没有真实GPU计数长期压力试验 |
| 02-visual/04-visual-settings-persistence.js | 自定义字体/背景恢复、选择规范化、视觉配置保存和pagehide/hidden保存；与缓存引用/代际的关系 | 静态资源相关段；并非整个偏好系统/所有主题组合验收 |
| 02-visual/05-lyrics-fonts-texture.js | 自定义FontFace owner/reconcile、迟到load拒绝；测量cache最多64字体×512字符；warmup与临时noise canvas | custom-font-lifecycle；FontFace修复是资源agent并行工作，本项未重复修改 |
| 02-visual/06-custom-background-colorlab.js | 背景normalize、IDB put/get/close、object URL状态定义，追到07-fx媒体调用 | V5真实函数+内存store；真实IDB事务/磁盘未运行 |
| 02-visual/07-lyrics-palette-text-utils.js | palette tween替换与hidden同步提交、封面小画布/颜色统计、文本measure缓存调用 | 源读；颜色观感未做截图判定 |
| 02-visual/08-lyrics-display-modes.js、09-lyrics-payloads.js | payload/显示模式规范化、row入口与track windows，确认尺寸/预算来源 | 源读；不是每种歌词内容和语言组合的实机验收 |
| 02-visual/10-lyrics-mask-textures.js | owned CanvasTexture、GPU max dimension、压缩旧纹理释放并1×1旧canvas、runway CPU+GPU预算、HD item/pool、glow/readability分阶段canvas | lyric-runway-preparation与drag-quality；实际Canvas光栅耗时未测 |
| 02-visual/11-lyrics-shaders.js | 材质uniform纹理共享/所有权调用 | 源读；真实GLSL编译/像素正确性未跑 |
| 02-visual/12-lyrics-row-layers.js、12a-lyrics-edit-preview.js | pending+committed quality账本、冷热行/代际/取消、一次pending上传、atomic替换、编辑预览旧几何/纹理释放 | lyric-work-scheduler/runway/drag/edit VM；现有布局视觉保持待人工验收 |
| 02-visual/13-lyrics-mesh-build.js | cooperative begin/step/finish/cancel；失败清mask/root；texture转交row owner | scheduler cooperative旧track拒绝回归；真实GL上传未跑 |
| 02-visual/14-stage-lyrics-rendering.js | 单行prewarm最多10项、resident/root代际、track接管、clearStageLyrics/outgoing dispose、恢复与paused warmup调用 | stage-lyric-background-restore、runway、scheduler；4100行中的视觉位移/倾角公式非本项穷举范围 |
| 02-visual/15-ripples-cover-depth.js | 固定12 ripple；256²深度canvas、最多18 depth cache、cover token与异步AI stale检查、previous canvas缩至256、背景恢复 | cover-load-retry/foreground恢复邻链；AI模型真实下载/推理/内存未跑 |
| 04-shelf/00-layout-hover.js、01-manager-core.js | quality档位与maxTexture；最多11 card池/rebind；dispose map/material/geometry、card build cancel | shelf-texture-quality VM；真实canvas clarity观感未测 |
| 04-shelf/02-rebuild-panel-sync.js、03-content-list-manager.js | close调用路线、最多11 row+1panel、row token/isCurrent、18 nearby prefetch、close清理资源 | V2 + 新真实close回归；网络分页本人账号未测 |
| 04-shelf/04-cover-api-helpers.js、04a-cover-loader.js | cache160/24MiB、4活动/2后台共享slot、12s超时、1自动retry/30s与online、scope prune/cancel、pagehide、保留签名URL | playlist-cover-loader VM；cache上界对visible/nearby是软保护，不宣称所有图片总解码字节硬限 |
| 04-shelf/05-card-interactions.js、06-keyboard-camera-events.js | 仅trace关闭/重建入口；与键盘/可访问性并行修复不重叠 | 不是这两文件全部交互行为审查 |
| 03-beat/05-cover-loading-crop.js、05a-adjacent-preparation.js | 当前封面cancel/timeout/retry/late retry；相邻最多两曲、共享二槽、16/32MiB owned CPU/GPU资源转移/释放 | cover-load-retry、playlist budget fixture；不重复另组节拍/音频budget审查 |
| 05-playback/03a-home-dashboard.js | MP4单blob300MiB限制、load token/object URL回收、decode失败、power hooks；主页稳定art调用链 | V1/V3/V4及home回归；真实MP4/H.264解码/IDB配额未验收 |
| 05-playback/06b-comment-avatars.js | 2活动（prefetch存在时1）、共享slot、80条/4MiB、near viewport、8s timeout、一次retry/30s cooldown、online、DOM/observer退场 | comment-avatar-loader VM：去重、失败、关闭取消、重连仅可见失败；真实IntersectionObserver/滚动截图未跑 |
| 07-fx/02a-album-cover-background.js → 02-accent-background-controls.js | 单一2048/800候选、live source/decode promotion guard、15s超时、失败稳定fallback、toggle取消；video object URL与WE暂停分支 | album-cover-background VM覆盖迟到decode/换歌/timeout/未知签名URL；媒体general存储缺陷见V5，实际高图显存未测 |

## 已有预算与资源释放结论

- UI render cache：一份native-resolution颜色+depth，账本width×height×8；关闭/深后台/尺寸变化释放。这个估值不含驱动额外存储，不能拿它代表renderer总GPU内存。
- 歌词runway：按完整歌曲与译文行数分摊CPU+GPU，低规格16MiB/其他32MiB；HD池按tier为64/128/192MiB，低规格32/64/96MiB、balanced48/96/144MiB；resident rows为4/6/8，短过渡允许一项替换余量。纹理item再限64MiB或池55%，并尊重GPU最大维度。
- shelf图片160条/24MiB是loaded软预算，近/可见图片受保护；failed记录另有全局runtime trim（正常180、激进72，loading跳过），因此没有把只读loaded trim不含failed误判为永久无界失败cache。
- comment头像80条/4MiB、最多两活动请求、一轮自动retry；album大背景单候选、15秒且失败不反复请求。未发现这些路径有已证明的重复GPU texture永久累积。
- 自定义视频IDB是明确例外：没有对应的应用级budget/旧blob回收。请勿由其推断首页单blob MP4也无界。

## 运行证明与复跑命令

1. `node docs/qa/visual-resources-vm.js --baseline`：读取Git HEAD完整目标文件，输出before状态。
2. `node docs/qa/visual-resources-vm.js`：读取当前工作区，输出after状态。MP4竞态一行明确标记abstract-order-only。
3. `node --test tests/home-background-image-lifecycle.test.js tests/shelf-cover-close-lifecycle.test.js tests/home-dashboard-update.test.js tests/home-hero-mp4-platform-recommend.test.js tests/playlist-cover-loader.test.js`：修改后的20项定向全部通过。
4. 本项还运行ui-render-cache、playlist-cover-loader、comment-avatar-loader、album-cover-background、home-dashboard-update、home-hero-mp4-platform-recommend、shelf-texture-quality、cover-load-retry、custom-font-lifecycle、lyric-work-scheduler、lyric-runway-preparation、lyric-drag-quality、lyric-edit-preview、stage-lyric-background-restore、foreground-recovery-work、paused-render-cadence、visual-performance-controls共17个测试文件，71项通过。它们是相关回归，不代表完整播放器验收。
5. `npm run check`：静态检查通过，输出明确SKIP Electron runtime smoke。
6. `node --check public/js/modules/05-playback/03a-home-dashboard.js`、`node --check public/js/modules/04-shelf/03-content-list-manager.js` 与 `git diff --check`通过。

证据：docs/qa/visual-resources-before.log、visual-resources-after.log、visual-resources-tests.log、visual-resources-after-tests.log、visual-resources-check.log。VM脚本无真实文件视频内容，大小仅为假file.size用于预算账本证明。

## 本项修改文件与未做事项

本项生产修改仅：03a-home-dashboard.js 的稳定背景图片helper及其支持函数/hooks；03-content-list-manager.js 的close清空viewport。MP4区域原有父审查改动保留未覆盖。新增两个必要回归、此报告及上述运行证明。

未提交/推送/发布，未改变真实用户媒体、设置或曲库，未绕过Unix socket EPERM，未尝试重启个人播放器。版本说明/README由总审查汇总。本项结论应与总报告的修复状态一致，不将仍需真实Window/GPU/IDB验收的部分写成已实机通过。
