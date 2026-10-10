# 独立浏览器运行证据（2026-10-09）

## 结论与边界

原 `server.js` 已在随机 `127.0.0.1` TCP 端口实际运行，普通 BrowserWindow 通过原 HTTP 静态入口加载 `public/index.html`、本地 vendor、真实 CSS 和 `index-loader.js` 的 131 个原模块，未剪切成 UI 手工夹具。主页面和模块完成启动，页面中 `require` / `window.desktopWindow` 均为 `undefined`。

这验证的是项目现有 Node 静态服务加浏览器前端运行路径，不是 `desktop/main.js`、Windows Electron 主应用或安装包启动通过。没有禁用主应用单实例锁，没有修改生产入口、preload、CSP 或主应用安全配置。Linux headless 普通 QA 窗口使用软件 WebGL，不据此评价 Windows CPU/GPU、帧率、资源长期预算或人工观感。

## 实际覆盖

- Node 原后端四个平台的未登录状态路由均实际返回 HTTP 200 / `loggedIn:false`。所有前端平台 API、更新 API、封面等随后使用显式假平台空态；无真实账号、cookie、会员、线上音源或平台写入验证。
- 原 DOM 搜索 input/debounce -> 无结果空态；平台模式切换；队列和歌单空态；DIY 视觉控制台打开、再点关闭；登录弹窗打开、QQ 节点选择、关闭。DOM 尺寸及中心命中保存于 `result.json`，截图均为 1280×820，已实际查看像素。
- 13 个预设依次走原控制台 click / setPreset 并恢复。主场景相关实际 GPU program 的 LINK_STATUS 全为 true，GL error 为 0。安魂实际加载 52,416 点且 visible；7 号音域回响实际可见 root、5 次 draw；8 号 Workshop 的浏览器 iframe 真实显示方块地形，其原 render adapter `health[8].state=ready`（`focused/result.json`）。这不验证原生 Wallpaper Engine 进程或 Windows HWND。
- 10 个视觉开关逐项切换、恢复。bloom/edge/cinema/backgroundStarRiver 的现有场景被实际编译/绘制；Aero 仅是 DOM/CSS 状态烟测。空首页没有歌词时，lyricGlow 等参数变化不代表相应歌词效果已渲染。floatLayer 原 createFloatLayer 会强制关回、没有生成 mesh，应算未启用，不能列为渲染通过。
- 独立纯文本歌词夹具调用原 buildLyricMesh 和原 updateLyricRowLayers，正常等待上传，没有绕过 scheduler/上传门控。初轮只编译、mesh 仍 hidden；补充真实更新后 row uploaded/visible=true，opacity≈0.878，主场景新增 Mesh，drawCalls 1→2，实际截图可见“隔离测试歌词 QA shader”。全部相关 program linked / GL0。未以此证明真实歌曲字幕时序、逐字准确性或所有动效组合。
- 真实生成静音 PCM WAV Files/Blob，经原 localSongFromAudioFile、playQueueAt、togglePlay、commitProgressSeek，用真实 HTMLAudioElement 运行。12 秒资源实际起播推进 0.833→2.048 秒；暂停后 currentTime delta=0、playing=false；seek 到 6.000 秒仍暂停；resume 到 6.170 秒；快速切换最终队列索引 2，currentSrc、localKey、队列归属一致，media.error=null；BrowserWindow 始终静音（`media/result.json`）。没有读取用户音乐、请求线上音频、麦克风或声卡授权。

## 本轮发现与复核

修前真实完整页面 console 记录 `Splash shader compile failed: ERROR: 0:71: 'c' : redefinition`。同一 fragment main 内时间轴变量 c 和第三个 animatedLoop 变量 c 重复。父任务局部将后者改为 loopC，保留时间轴 c。

修后原完整冷启动实际得到：context=true、program=true、isProgram=true、linked=true、programInfo 空、GL error=0、fallback2d=false。另保存真实启动动画截图 `splash-cold-start.png`。这比仅“console 不再报警”更强；修前原 console 摘录在 `before-fix-console.txt`。

未改生产的第一轮 `--disable-gpu` 环境没有 WebGL context，Three 在创建 renderer 时停止；使用允许的软件 WebGL 配置后原页面可运行。此为本环境 GPU 能力边界，不据此声称所有产品启动都失败。

启动还出现 Electron 内部 `node:electron/js2c/sandbox_bundle` 的 `Uncaught (in promise) TypeError: Failed to construct 'URL': Invalid URL`。最小普通 loopback 空 HTML BrowserWindow（也尝试同 CSP 和一条无作用 inline script）没有复现该异常。未可靠归因，保留原日志/源位置；没有忽略或屏蔽异常，不宣称 console 完全干净。

媒体烟测中，前端尝试 `/api/listen/report` 的 OPTIONS/POST。这个请求只到假 API，并被 405 拒绝，没有进入原 Node 后端或上游账号；因此媒体报告的 `noApiWrites=false` 正确记录写尝试，不能改写为“没有任何 API 写尝试”。其余媒体状态断言全部通过。

## 隔离方式

每次独立临时 userData/session/cache，Node 子进程 cookie、QQ/Kugou/Qishui cookie、Qishui/Spotify token/config、Qishui native/QR config、beat/spill/listen-sync/feedback 路径全部指向临时目录。子进程不继承平台凭据环境变量。浏览器外部请求被阻止，Node 非 loopback 网络 fail-closed。所有权限检查/请求均拒绝，不授权麦克风、摄像头、位置或设备选择。

## 可复跑脚本

在仓库目录，Linux headless 示例（不要用该软件渲染配置评价用户 Windows 性能）：

```bash
HOME=/tmp/mineradio-audit-home XDG_CACHE_HOME=/tmp/mineradio-audit-xdg ELECTRON_RUN_AS_NODE= \
  node_modules/electron/dist/electron --no-sandbox --headless --ozone-platform=headless \
  --use-gl=angle --use-angle=swiftshader scripts/qa/browser-runtime-check.js
```

输出目录默认新建临时 evidence 文件夹；可用 `MINERADIO_QA_OUTPUT=/绝对/隔离/证据目录` 指定。`browser-runtime-render-check.js` 是较短的 Splash/Workshop/纯文本歌词渲染复核；`browser-runtime-media-check.js` 为静音 WAV 原播放流程；`browser-runtime-paused-lyrics-check.js` 为与阶段审查协同的暂停边界夹具。共用 `browser-runtime-server.js`。每次输出 QA_RESULT 与 result.json；只有实际生成的证据可作为通过依据。脚本已做语法检查；早期证据来自同逻辑的 scratch 副本，最终阶段及完整前端回归使用仓库持久脚本，实际运行记录和源码 hash 保存于各最终结果。

## 仍未覆盖

Windows 主应用、单实例/IPC、真实账号登录扫码和验证、在线会员/版权/歌单成功、实际网络音频、设备授权、原生 WE、系统内存清理、文件选择器真实点选、真实曲库持久化、安装升级卸载、长期后台/AutoMix/硬件性能，以及所有视觉参数和歌词模式组合。

## 暂停边界实际 before（已完成修后复核）

与歌词阶段审查协同，在同一生成 WAV 的真实暂停 audio 上，1.8 秒显示 A，offset +0.5 之后等待 900ms，stageLyrics.currentIdx=-999 / currentDisplayKey 清空，仍旧 A 且 mesh47 未换，已实际重现。暂停字重编辑后，row.editTextPreview=true/uEditPreview=1；commit 1200ms 后仍 mesh55，prewarm.reason=fx-edit-commit，scheduler.pending=[prewarm-build]、runs 无推进，旧预览未退出，也已重现。原始数据和媒体证明在 paused-before/result.json。已放行负责阶段审查的任务做局部修复，修后会用同条件复跑。

真实页面的内部 Invalid URL 完整 CDP 栈已保存在 paused-before/result.json 的 runtimeExceptions，定位到 sandbox_bundle 的 Array.filter 内 new URL。empty-html-controls.json 为三个同窗口配置的 empty、同 CSP/普通 inline、dynamic inline 控制；三者均未复现该 exception。未可靠归因，仍为未解决风险，不将它抹掉。

## 暂停修复第一轮 after

同条件实际复跑：暂停1.8秒加0.5秒校准后，index=1/text=B，mesh46→54，原row uploaded/visible=true。字重commit任务已正常推进、mesh70→82，prewarm=null。新mesh仍有 editTextPreview/uEditPreview=1，resident-build/full-track-warmup仍暂停排队；负责阶段审查的任务继续确认是否需要最小最终字形/effects补充。阶段截图已检查像素，但第一轮被原“本地节奏分析”和软件渲染建议遮挡，所以此轮以状态/原函数和mesh证据为准，不称截图已看见B。最终复跑会先用原“暂不分析”和关闭建议入口，再拍无遮挡阶段。

持久脚本 browser-runtime-paused-lyrics-check.js 已实际运行并产生 paused-after/result.json，真实媒体断言再次全部通过，实际权限request为空，所有权限check拒绝。输出完整路径和CDP栈均为隔离运行的证据。

## 暂停歌词最终真实闭环

最终阶段源码14-stage SHA256 d794c103dd3b543eb47217c3898826cd0241cf0d33793857245c30afca4deb87；12-row b437f166cc05443e958d368df837d01c35f65f4bdfd73b1436586d05e1af6642、12a-preview 2fb051d964dfb05baf1a4aafde8c2465dcd724d3f2c35f9c925fe76177bfb1dc。完整绑定及共享树 git HEAD/status 见 paused-final-extended/result.json。没有把共享未提交树当正式版本标签。

- 原 paused offset +0.5 在真实 HTMLAudioElement 1.8 秒暂停条件下正确切到 B/index1；offset-after.png 实际像素已查看，清楚显示 B。
- single 模式、原 setLyricTextureClarity(4,true)、原字重编辑开始/同步/结束：新mesh88、row glyph/readability/glow 均真正上传可见，uEditPreview=0、qualityTier4、currentMap===qualityTexture、target/rasterKey匹配，有限 owner token 正常删除。只剩普通 full-track-warmup 暂停待机。无遮挡截图 fx-commit-after.png 已查看显示 A。
- 原 setLyricDisplayMode('triple')，同一生成静音队列，audio.currentTime=2.2 且始终暂停：新mesh124、index1，primary0/1/2 三行真实可见；所有glyph/readability/glow均uploaded、4×纹理绑定且raster一致，uEditPreview全0、owner token正常退休/resident null。triple-fx-commit-after.png 已查看，A/C灰色上下文与当前B清晰。全部相关GPU程序linked、GL error0。
- 首次仅4秒等待时triple尚未完成，raw evidence留在 paused-final/，没有假称PASS。遵照正常调度延长观察后约6.8秒完成，分片进度与owner/job状态逐次保留，没有强推scheduler/上传。软件渲染等待时长只用于边界确认，不能作为Windows性能数值。
- 最终原local-beat“暂不分析”/关闭画质建议后，DOM localBeatDisplay=none/Show=false、performanceHidden=true；截图无遮挡。静音WAV起播、暂停、seek、resume和快速切歌断言再次全部通过，窗口静音，API POST仍只到假服务405拒绝。

复跑：使用上文相同Electron隔离命令，将脚本换为 scripts/qa/browser-runtime-paused-lyrics-check.js。结果 paused-final-extended/result.json 与 paused-stage-final-extended.log。脚本只有真实状态断言全部满足才成功退出；20秒上限用于暂停短夹具正常调度观察，超时会保留失败证据。

## 冻结生产版本的完整前端最终回归

生产测试基准：7cf5cce27e9234592d4c2ac316e44379b5714225。最终使用持久 scripts/qa/browser-runtime-check.js 跑完整原页面，输出 full-final-corrected/result.json / full-final-corrected.log，进程exit0、9项断言全为true。131个index-loader原manifest入口全部实际HTTP200，无missing；全部131份运行前绑定的生产源码hash以及原manifest源码与该提交逐一核对一致，运行期间 changedDuringRun=[]。阶段上述绑定hash也与该提交一致。最终核对清单：full-final-corrected-source-comparison.json。

最终冷启动特意在全临时localStorage保存一条生成dummy字体记录：mineradio-custom-lyric-fonts-v1，qa-saved，data:font/ttf;base64,AAAA。实际恢复1条非空记录，FontFace解码/OTS拒绝被原 catch捕获，ownerMap仍有效、failed ownerCount=0；原页面ready=complete、首页真实可见、splash已hide、renderer有效，随后全部原DOM操作、13预设和纯文本歌词真实上传继续完成。此只证明保存的无效字体不会再次中断classic整页启动、失败owner释放；有效字体ready后的字形/metrics刷新没有在这个浏览器夹具实测，不能借此称ready通过。

保留 full-final/result.json / full-final.log 的第一次exit1：是QA错误地断言不存在的body class home-revealed，并记录了不存在但未用于判定的finishSplash符号；实际app功能已完成。获得父任务允许后仅修QA为真实#empty-home可见+splash.hide/renderer、移除无用符号，不改生产；同条件完整复跑才得到最终exit0。没有覆盖或清洗原失败数据。

最终截图（启动shader、保存字体冷启动首页、搜索/队列/歌单空态、原控制台、登录弹窗、7个复杂预设、纯文本歌词）均实际打开查看1280×820像素。控制台打开时原软件渲染建议可能覆盖局部面板，纯文本长行右侧被该控制台遮挡；这些截图不是无遮挡全视觉参数验收。暂停阶段的single/offset/triple另有真实无遮挡图和上传状态闭环。

最终原日志仍保留内部Electron sandbox_bundle Invalid URL完整CDP栈（两次整页启动各一次），以及软件WebGL弃用警告、Canvas2D读回提示和Workshop的Three.Clock弃用提示。最小空HTML同配置不复现Invalid URL，因此继续列为未归因风险；不得将最终exit0解读为console完全干净。所有浏览器permission requests为空、checks均拒绝；未启用unsafe-swiftshader或修改desktop单实例锁。

最后QA改动仅保存字体冷启动断言修正；此报告及证据形成最终冻结清单，不再改脚本或生产。上文软件渲染、假API/无账号和桌面未验证边界全部保留。

## 最后独立增量 bc5258d（取代整页“所有hash仍相同”的推断）

父任务最后新增生产06-custom-background-colorlab.js 的 IndexedDB get/put错误、abort、同步异常结算修复，并以 bc5258d6dc2d437f677d6b7fcc45ece7ad19988b 独立提交。相对7cf5cce，只有这一份生产文件变化（另有已准许的QA首页断言和4项VM测试）。前述13预设/10开关/saved字体整页证据仍绑定7cf5cce，不能重标为bc5258d的全批回归，也不能宣称旧131份hash全部仍同。

在全新临时profile及随机loopback服务上，用 docs/qa/browser-runtime-2026-10-09/incremental-idb-render-check.js 包装既有 scripts/qa/browser-runtime-render-check.js（后者与生产均未编辑）。最新完整原前端再次加载131个原manifest入口；冷启动实际Splash program存在/linked、GL0；纯文本歌词row真正visible/uploaded且opacity>0、相关GPU program linked/GL0。4张必要截图已实际查看像素，包含完整清楚可读的“隔离测试歌词 QA shader”。此轮没有重新遍历13预设。

同一新profile调用原 putCustomBackgroundBlob/getCustomBackgroundBlob：临时自造8字节Blob [81,65,0,1,2,3,254,255]，实际浏览器IndexedDB存入并读取字节完全一致、size8/type application/octet-stream，读出是实际Blob，put完成返回undefined、缺失ID get返回null，fx.backgroundMedia前后相同。没有调用背景apply/save或任何delete，没有读取用户媒体。成功契约在真实IDB通过；错误/abort/同步异常结算仍依赖父任务4项VM before/after，不假称浏览器真实故障注入。

增量进程exit0，8项专门断言全true；135份最新前端/入口/服务源码逐一匹配bc5258d，运行期间源码无变化。旧整页已绑定源码只有06的hash不同。原结果：incremental-bc5258d-corrected/result.json；增强断言与实际IDB/完整CDP栈：incremental-bc5258d-corrected/incremental-result.json；最后核对：incremental-bc5258d-source-comparison.json；运行日志 incremental-bc5258d-corrected.log。旧full与stage证据保留原版本，不覆盖。

初次增量附加QA误读不存在customBackgroundMedia字段，IDB调用前即ReferenceError，已保留 incremental-bc5258d/ 及log。只改附加QA只读字段为真实fx.backgroundMedia后，同条件全新profile重跑通过；没有改生产或原render脚本。既有未归因Electron sandbox_bundle Invalid URL仍保留，所有窗口无desktop preload/实际权限授权，Windows/桌面主应用仍未验证。

复跑时使用上文相同隔离Electron参数，入口换为 docs/qa/browser-runtime-2026-10-09/incremental-idb-render-check.js。这一增量完成后，脚本、文档和所有证据再次冻结，不再改生产。


## 原始DOM归档格式

原始 `final-dom.html` 统一以同目录 `final-dom.html.gz` 无损保存，避免把反复捕获的整份内联源码作为百万行文本diff。`raw-dom-archives.json` 保留原始大小、SHA256与压缩文件SHA256；逐份解压已逐字节验证一致。日志、状态JSON、失败输出及截图未据此改变。任何早期记录的 `final-dom.html` 路径对应同位置的 `.gz` 归档。
