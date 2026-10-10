# 舞台歌词逐函数深审（2026-10-09）

## 结论

本轮补齐了此前仅约 800 行生命周期抽查的缺口：`14-stage-lyrics-rendering.js` 原 4101 行已逐段全文审读，并审阅全部顶层函数和嵌套回调。补齐 `10-lyrics-mask-textures.js` 951 行、`13-lyrics-mesh-build.js` 503 行全文，以及字体、编辑预览、歌词校准接口。发现并最小修复四项 P2：暂停校准不换行、暂停提交字形编辑不能完成、冷启动已选自定义字体就绪后不替换回退字形、字体就绪后逐字比例缓存过期。未在本范围证明 P0/P1 缺陷；这不是整个应用不存在高优先级问题的结论。

暂停编辑修复必须包括原效果和所选高清纹理。第一次真实浏览器 after 虽换了 mesh，却仍有 `uEditPreview=1`，因此没有据此宣布修复完成。后续有限 owner 修复已通过原函数隔离回归；真实浏览器单行 4× 与三行 4× 都已完整上传且 owner 退休。三行最初 4s 观察窗口内尚未完成，保持原调度继续等待约6.8s后完成，没有再修改生产代码或绕过预算。时间只记录软件渲染夹具的过程，不代表 Windows 性能。

## 1. 审查依据与覆盖口径

- 先读 `CLAUDE.md` 和 `docs/AI_REVIEW_HANDOFF.md`；经典脚本共享全局，按真实调用链检查初始化时序，不把模块孤立加载视为完整启动验证。
- 全文审读包括条件短路、状态赋值、回调闭包、时间单位、函数参数、数组边界、所有权转移以及 dispose/cancel 分支。测试只调用实际生产函数，依赖用隔离时钟、绘图度量或原浏览器媒体夹具提供。
- 逐函数/回调完整清单、行号、SHA256、动态证据及未单独执行的函数见 `QA_STAGE_LYRICS_FUNCTIONS_2026-10-09.md` 和可机读 `QA_STAGE_LYRICS_LEDGER_2026-10-09.json`。生成器为 `scripts/qa/audit-stage-lyrics-ledger.js`。AST 枚举用于索引，不能替代全文审读或证明运行覆盖。

本组全文文件（最终行数以 ledger 的 SHA 对应快照为准）：

| 文件 | 本组深度 | 审查重点 |
| --- | --- | --- |
| 02-visual/14-stage-lyrics-rendering.js | 原 4101 行全文；修改后 4129 行，169 顶层函数、206 含回调 | 时钟、单行与持久多行、代次、恢复、预热、质量、排版和动画数学 |
| 02-visual/10-lyrics-mask-textures.js | 951 行全文，42 顶层函数、47 含回调 | 空输入、布局拟合、runway/full、HD尺寸/预算、纹理生成和接管 |
| 02-visual/13-lyrics-mesh-build.js | 503 行全文，15 顶层函数、16 含回调 | mask/bundle 所有权、空 mesh、协作分阶段、cancel/finish、track retarget |
| 02-visual/05-lyrics-fonts-texture.js | 字体和测量全文 | FontFace 迟到/替换/移除、选中字体刷新、缓存 generation、字距/石印样式 |
| 02-visual/12a-lyrics-edit-preview.js | 原 186 行全文及新增有限 owner helper | 手势取消、显式 commit、预览替换、logical geometry、父译文行 |
| 06-lyrics/06-lyric-timing-offset.js | 原 261 行全文 | 每曲校准键、单位、界面 debounce、调整后的播放时间与暂停恢复 |

任务描述中的 `07-lyrics-time-offset.js` 并不存在，实际接口文件是上述 `06-lyric-timing-offset.js`。

`11-lyrics-row-shaders.js` 由主审全文审读；`12-lyrics-row-layers.js` 由资源组全文审读。本组只交叉审读其创建、上传、质量队列和 dispose 调用，不重复声称独立全文覆盖。有限暂停上传补丁由资源组协调落地，完整资源报告为 `QA_ARCHITECTURE_RESOURCES_2026-10-09.md`。

### 14-stage 分段审读 ledger

以下为修后源码范围，函数完整清单另附，不省略大函数中的视觉计算：

- L1–711：预热 style/prepared/render keys、曲目 generation、单行有界 lookahead、restore/demand/upgrade 与取消。
- L712–1585：resident row 身份与边界、current/prepared owner、stale token、当前屏幕坐标快照、merge/资源接管、visible/sharp/runway/effects 排序、trim 与 persistent 初始化。
- L1586–1797：揭示/旧字幕保持、轻量接管、暂停恢复、seek hold、progress preview 与媒体时钟选择。
- L1798–2239：cooperative phase slices、finish guard、显式暂停 commit、取消/重试/full-track warmup。确认普通后台工作仍服从原暂停预算。
- L2240–2455：intro/title handoff、show/retarget/redraw、唯一 current/outgoing 交接、style refresh debounce、clear。
- L2456–2960：书架参考相机、字幕投影、fit/clamp、旋转/位置/arc、暂停时界面几何更新。
- L2961–3398：整段 `updateStageLyrics3D`，包括 entrance、held outgoing、显示进度平滑、preview lock、glitch、glow、粒子、呼吸与 exit disposal；未修改原节奏/颜色/幅度/质量常数。
- L3399–3475：原生逐字 widths/ranges、测量缓存 generation、缺字范围 fallback、progress 边界。
- L3476–3840：上下文/译文 entry、固定 virtual slots、五种 display mode、四种 translation mode、轻量窗口/全轨 payload/cache identity。
- L3841–4129：二分查找、idle retirement、重复 resume、attached mesh 修复、前后台恢复、pause-hold/hide、tick 和最终 dispose。

## 2. 已证问题与最小修复

### SLY-01，P2：暂停时校准歌词时间，字幕保持在旧行

- 定位：`06-lyric-timing-offset.js:166–179`；`14-stage-lyrics-rendering.js:3980–3984,4000–4113`。
- 根因：校准把 `currentIdx` 设为 -999、清显示 key；正常暂停 tick 发现原 mesh 已挂载便保持并返回，不重新按照 adjusted clock 选择行。
- 影响：例如实际媒体暂停在 1.8 秒、A/B 分界 2 秒，用户设 +0.5 秒，应显示 B，但仍显示 A，直到播放恢复。
- before：原函数 VM 预期 index1，实际 -999；真实 HTMLAudioElement 暂停 before 等 900ms 仍旧 A/mesh47、index -999。
- 修复：只在显式 offset invalidation 且 audio.paused 时调用既有 `restorePausedStageLyrics('timing-offset',false)`。普通播放继续正常 tick；pause-hide 偏好仍由原恢复入口处理，没有播放/暂停副作用。
- after：VM 检查 B/index1、媒体仍暂停、hide 模式不重新显示；真实首轮 after 1.8s+0.5 换 B/index1，mesh46→54，visible/uploaded=true，playing=false/audio.paused=true。

### SLY-02，P2：暂停时提交字体栅格编辑，协作构建与原样式恢复停住

- 定位：`12a-lyrics-edit-preview.js:6–88`；`14-stage-lyrics-rendering.js:1091–1098,1354–1372,1831–1900,1922–1931,3393–3395`；资源组 `12-lyrics-row-layers.js:1026–1130,1254–1277,1957–1968`。
- 根因一：显式 `fx-edit-commit` 被当作普通非 urgent 预热；已有 current 的暂停 scheduler 令 readyAt=Infinity，因此永不 step/finish。
- 根因二：仅放 glyph commit 后，单行 `fxEditTextOnly` 还需要原 resident effects job；多行先补窗口外 sharp/runway；readability/glow 和 selected HD prepare/commit 也在暂停门控外，导致永久 text-only。首轮 after 实际证明该未闭环。
- before：VM 150 帧没有 step；原浏览器字重编辑释放后等 1200ms 仍 mesh55、editTextPreview=true/uEditPreview=1、prewarm.reason=fx-edit-commit、pending prewarm-build，scheduler runs 未推进。
- 首轮 after（不能算完整修复）：glyph commit 推进且 mesh70→82，但新 row 的 uEditPreview 仍1，resident-build 等待暂停。
- 完整修复：仅显式 commit prewarm 允许暂停分片；接管后的原 current data 附有限 track token 和原 visible row snapshot；同 owner effectsOnly 仍用原 phase/slice 上传预算。多行先恢复该 snapshot 的效果，不扩展 paused 权限到普通 runway。quality prepare/commit 与新 decorative uploads 只额外放行严格 owner/snapshot。仍保留原“可见基本文字上传”例外。
- 取消/退休：只承认 current、未 dispose、相同 trackSwitchToken、暂停且未再进入手势；旧 outgoing、新 runway、替代 root、旧 token 不得利用权限。新手势清 owner。原 visible 预览退出、效果上传及所选 HD map 真正提交后移除 token/rows；恢复播放也会退休。
- 函数 before/after：多行原 ensure 在三行 4/5/6 已有 text 时先补 3…8 sharp；after 仅原窗口 4…6 的 effectsOnly。单帧 byte/upload 原门控仍执行。对应 13 项合并回归和资源组 23 项回归通过。
- 最终真实浏览器：首轮单行4×约2517ms已完整通过；随后相同冻结源码延长测试 single约2404ms、triple约6768ms均完成。三行新mesh124/idx1/primary0,1,2全部glyph/readability/glow真实uploaded+visible，每row qualityTier4/currentMap===qualityTexture且raster匹配、uEditPreview0，有限owner token清除、resident null；仅普通full-track-warmup仍paused，audio未恢复播放。最初4s不足的原阶段结果保留，用阶段推进和最终完成区分慢分片与停滞。
- 三行推进证据：同一resident token18/trackToken4/key持续匹配，1200ms→2751ms→4121ms completedPhases12→26→38/51，cursor0→1→2，glow/readability实际阶段推进；5457ms resident完成，6768ms effects/HD上传完成后owner退休。不是重复取消/重建或全局暂停放行。

### SLY-03，P2：冷启动已选自定义字体迟到时，已显示回退字形不刷新

- 定位：`05-lyrics-fonts-texture.js:74–114`；交叉 `00-core-stores.js:180` 与 `07-fx/03-cover-picker-fonts.js` 手动选字体路径。
- 根因：手动选择有就绪 refresh，但保存字体恢复的异步 success 仅 clear/warm 测量缓存，未重新构建已显示歌词。
- before：选中 saved 字体延迟完成，实际 register success 无舞台 refresh；未选中字体同样无 refresh。
- 修复：现有有效 owner load 分支中，仅所选字体匹配且 `refreshCurrentLyricStyle` 可用时调用原 coalesced refresh；未选、移除或 superseded load 不刷新。
- after：延迟 unused 不 refresh；selected 正好触发一次；原 remove/replacement/eviction/reject-retry 回归保留。
- P3 边界补强：成功 `document.fonts.add` 后的测量/显示 hook 异常分别警告，不能落入 font-load failure 删除成功 owner。fake refresh throw 仍返回成功、保留 face/loaded，重复 register 不重复 add。
- classic 初始 ownerMap 早调用问题由资源组另行证实和修复，见资源报告；本组最终合并其 caller-before-module 三项真实脚本顺序回归，全部通过。单模块 savedfont 夹具不等同于该启动顺序验证。

### SLY-04，P2：同字体 key 就绪后，逐字比例继续使用旧回退字体度量

- 定位：`05-lyrics-fonts-texture.js:158–163`；`14-stage-lyrics-rendering.js:3403–3441`。
- 根因：逐字 ranges 的 cache key 有 font key、文本、字重、字距和词数，缺字体度量 generation。同 family/key 在 font-ready 后变宽，clear measure cache 不会失效 line 上 ranges。
- before：W/i 回退宽度1:1，范围0.5；字体就绪 W/i变3:1且清缓存后仍0.5。
- 修复：原 clear measure cache 时增加 generation，karaoke metrics key 带该 generation；同值不反复测量。未修改逐字时间、字符分割和高亮数学。
- after：就绪后范围0.75，同 generation 二次读取无额外测量。

## 3. 边界、预算和所有权验证

- `10` 原实际 mask/layout/quality/compact 函数：空字符串、正常汉字、2000字超长输入，width/height/fontSize/fitScale/text bounds 有限正值。full/runway/compact 保持相同 logical world width/height；旧 texture 只 dispose 一次、旧 canvas 归1×1。
- HD tier1/2/3/4 × GPU尺寸2048/4096/8192 × lowSpec true/false：实际 target 的 tier、最大尺寸及 per-item CPU+GPU byte预算保持原策略。tier1 无额外 HD map；不人为下调用户选择。
- 311 行 × 5 display × 4 translation 轻量窗口，都包含请求 index；空轨 binary index=-1、resident payload=null；首/末/超末时间边界按原输入契约工作。
- `13` 实际 cooperative cancel/finish：cancel 重入不重复释放；已取消状态不能 finish 接管 mask/root。`14` resident/prewarm stale token、current/dispose 交叉检查保持；不能把取消后 bundle 交给 successor。
- `12a` paused owner 夹具：current snapshot 可用；offscreen、非快照、已 dispose、旧 token、播放状态、再编辑、替代 current 全拒绝。preview/effects/HD pending 任一未完成，不提前退休。
- 资源组实际 quality prepare/commit 夹具：原 Infinity keyed job 被有限 owner 重排；旧/outgoing 在队头也不构建；没有 eligible 时不 poll；commit 只消费原单帧预算；替代 current 和 stale token 不能提交。
- 时钟全文核对：进度拖动 preview 优先于真实媒体时间；校准只在该秒时钟之上加有界 offset；restore/prewarm/line progress 使用同选择器。实际媒体烟测由浏览器组跑开始/暂停/seek/快速切歌，独立于 fake scheduler clock。
- 持久排版数学全文核对：virtual index、logical row geometry、共享 scroll snapshot、译文 parent、source pose 与相机 clamp。未修改动画节奏、字形、色彩、默认效果和预算常数。

## 4. 实验与证据

可重跑命令：

```sh
node --test tests/*lyric*.test.js tests/custom-font-lifecycle.test.js tests/custom-font-classic-startup.test.js
npm run check
node scripts/qa/audit-stage-lyrics-ledger.js
```

最新最终源码函数回归：81 pass/0 fail；静态 `npm run check` exit0。数量只说明执行结果，不说明所有显示模式/平台已验。静态 check 的 Electron runtime 阶段显式 SKIP，不能当 Electron 全量 pass。

证据文件：

- `docs/qa/stage-lyrics-paused-before-2026-10-09.log` / `...paused-after...log`：暂停校准/显式 glyph commit 的原函数 before/after。
- `docs/qa/stage-lyrics-font-ready-before-2026-10-09.log` / `...font-ready-after...log`：字体 ready 与 metrics 的 before/after。
- `docs/qa/stage-lyrics-effects-owner-before-2026-10-09.log` / `...effects-owner-after...log`：有限 owner 和多行完整效果闭环；后者包含 font hook throw 回归。
- `docs/qa/stage-lyrics-full-regression-2026-10-09.log`、`...check...log`：最终隔离回归/静态结果。
- `docs/qa/paused-quality-owner-integration-2026-10-09.log`：资源组有限 quality prepare/commit。
- `docs/qa/stage-lyrics-source-before/`：本组修改前源快照，含先前资源 owner 修复，不等于仓库完全原版。
- `docs/qa/browser-runtime-2026-10-09/paused-before/result.json`、`paused-after/result.json`：真实生成 WAV + HTMLAudioElement 原前端 before/首轮 after；首轮 FX 的未完成状态如实保留。
- `docs/qa/browser-runtime-2026-10-09/paused-final/result.json`：单行4×完整结果及三行最初4s未完成的阶段采样；该整组stageChecksPassed=false如实保留，不能把单行通过宣称为整组通过。
- `docs/qa/browser-runtime-2026-10-09/paused-final-extended/result.json`：相同冻结源码延长原调度后单行/三行4×完整闭环，stageChecksPassed=true；生成器 `scripts/qa/browser-runtime-paused-lyrics-check.js`。没有强制flush scheduler或改质量。
- `docs/qa/browser-runtime-2026-10-09/focused/{result.json,synthetic-lyric.png}`：原 build/updateRow 真实 ShaderMaterial linked、visible/uploaded，drawCalls1→2、GL error0；浏览器组已查看实际文字截图。

原浏览器是完整原网页/原模块，平台响应是明确标注的假平台空态，使用隔离配置和短静音 WAV。软件 WebGL 只证明编译和功能链，不代表 Windows GPU 性能。初轮 after 图被原自动分析弹窗/软件渲染通知遮挡，不用该图证明最终字形观感；最终延长测试通过原关闭入口移除遮挡。本组已实际查看 `paused-final-extended/triple-fx-commit-after.png`，三行 A/B/C 清楚显示、B在当前行，无上述弹窗遮挡；功能截图仍有原 Workshop 背景，不作全模式观感验收。

## 5. 尚未证明的边界

- 最终有限 owner 已在真实单行4×、三行4×完整通过；其他 display/translation/字体组合未在浏览器穷举，不能把两种实例扩大为所有组合验收。
- Windows 原生前后台/长时遮挡/休眠/真实 GPU 吞吐、Electron preload/IPC、Wallpaper Engine 未在本组运行。没有用软件 GPU 时间宣称平台性能。
- 自定义字体不是所有字体文件/浏览器 shaping 的像素等价验收；石印/glow/readability 复杂栅格路径全文审读但未逐像素穷举。最终观感仍由维护者验收。
- 空/缺 timestamps 以实际 parser 的 finite/sorted 输入契约为前提；没有声明任意手工损坏歌词对象都可运行。2000字样本不证明无限长输入没有裁剪。
- 没有运行整个项目全量 npm test；它由主审聚合。这里的 81 项和 npm check 不替代未运行阶段。
- 此次不触真实用户曲库/账号/安装、不修改平台权限、不提交 Git。release/README 同步由主审负责，避免并行覆盖。
