# Cuefield 纯规划层逐函数审查

日期：2026-10-09。范围：`cuefield/` 的全部 19 个 JavaScript 文件。审查起点为工作区 `5bc4f03` 上已有的未提交整合修复；不覆盖或撤回其他人的改动。

## 结论与边界

- 已实际逐段阅读全文、沿调用关系检查每个命名函数及其内部回调。原始范围 6,683 行；本组修复后的范围 6,755 行。下面的函数索引只是审阅台账，不能用它或 AST/正则扫描替代深审。
- 14 项可用纯数据复现的语义问题已做最小修复。未发现本范围可据实列为 P0/P1 的问题；已修问题按 P2/P3 标注，条件性影响在每项中注明。
- 保留 recipe 分数、选择偏好、重叠合同、拍点容差、BPM 阈值、保护段规则和所有默认开关。显式 meter 处理沿用现有 adapter 语义，缺失 meter 时仍按原来的四拍索引推断。所有 profile/beat/window 时间仍是秒，action.duration 仍是毫秒，没有再次猜单位或除以 1000。
- 本组只编辑 9 个 Cuefield 源文件及本组测试/QA 证据；没有修改 `public/js/modules/05-playback/16–20`，没有新依赖、提交、推送或发布。
- 真实账号、用户音频/曲库、平台网络、声卡和真人听感未用于本组验证。测试证明数据与状态契约，不能代替真实听感通过。
- synthetic bridge 的 96 秒规划/64 秒运行容量冲突作为 P2 未修项保留；它当前未接入默认 UI/server 规划开关。两个非默认辅助语义问题已在补充授权后最小修复，仍未以“全审”冒充全部问题已清零。

## 已修问题（P2/P3）

### CF-01 / P2：已知真实时长被拍尾估计补长

位置：`cuefield/cue-profile.js:170–185`，buildCueProfile。

- 复现：真实 duration=10.13s，最后拍 time=10s，gridStep=0.5s。旧 profile.duration=10.5s。
- 根因：把实际 track/map 时长与 lastBeat+gridStep 无条件取最大值。
- 影响：后续尾部规划将不存在的 0.37s 视作可用；真实媒体可能先于计划交接结束。这里未声称已经听到断音。
- 最小修复：存在正的实际 track/map 时长时使用它；只有时长缺失才估拍尾。1800s 输入保持 1800s，未知时长旧估计继续为 10.5s。
- 证据：before.json 的 measuredDuration；回归“known duration remains seconds…”；cache bridge 回归验证 from/to 返回的实际时长与 handoff 上界。

### CF-02 / P2：已有显式 downbeat 又按数组索引捏造拍头

位置：`cuefield/cue-profile.js:57–62,184–198`，isDownbeat/buildCueProfile。

- 复现：10 个半秒拍事件，明确 downbeat 只在 1s、3s。旧 profile 仍生成 0/1/2/3/4s 五个拍头。
- 根因：isDownbeat 在明确标记为普通拍的事件上仍回退到 index%4；camera/pulse 事件本身可能稀疏，数组索引并不等于完整节拍序号。
- 影响：错误 bar/phrase 边界与 gridQuality 计数可能进入过渡判定。
- 最小修复：与 adapter 同样先判断显式 downbeat/phrase/combo 是否存在，存在时不补索引拍头。无标记夹具的 0/2/4s 推断未变。
- 证据：before.json 的 explicitDownbeats；显式/隐式双夹具回归。

### CF-03 / P2：末尾 crossfade 未预算 B 预滚与保护区间

位置：`cuefield/transition-window-planner.js:1020–1064`，endOfTrackCrossfade。

- 复现：A=20s，B=1s，B audibleStart=0.8s，请求 fade=1.6s。旧计划 fade=1s，handoff 时 B 已走到 1.8s。A protection=19.8s 时旧 mixStart=19s，早于保护边界。
- 根因：fade 上限使用整个 B duration 和整个 A audibleEnd，未扣 B 静音预滚，也没有用 protectedUntil。
- 影响：计划超出媒体的物理可用区间；前端 triggerAt≥protectedUntil 会进一步把迟到的预滚/交接推过 A 尾。
- 最小修复：A 可用预算=audibleEnd−protectedUntil−B预滚，B 可用预算=duration−B预滚；保留原 fade 目标，仅缩短到实际区间。毫秒取整向可用区间内收敛。空间不足时明确失败。
- 证据：before.json 的 endFade；修后无保护夹具 fade=0.2s、handoff=20s、B恰走到1s；有保护且预滚放不下的夹具返回 technicalFailure。

### CF-04 / P2：零时长/无可播放目标仍产“成功”零时刻 handoff

位置：`cuefield/transition-window-planner.js:1048–1064,1122–1180`，endOfTrackCrossfade/chooseCadenceFallbackWindow。

- 复现：A=20s、B=0s、enableCadenceFallback=true，旧 timeline 的两个 volume duration=0 且 handoff.t=0，technicalFailure 缺失。
- 根因：末尾 fallback 无效时长分支缺少失败传播；汇总又无条件读取 cadenceFallback.mode。
- 影响：API ok:true 和可执行性诊断不诚实，前端只能再猜测退路。
- 最小修复：无源、无目标、保护后无空间、预滚后无目标空间分别返回明确 errorCode/technicalFailure/空 timeline；汇总支持 technical-failure 模式。
- 证据：before.json 的 invalidTarget；新测试与真实 cache bridge 调用验证 ok:false。runtime-failure-check.json 证明原 core 接收该结果后为 technical-error、pending=null、preparing=false、音频准备调用=0、shouldTrigger=false；没有加载媒体。

### CF-05 / P2：歌词避让把 terminal rescue 推过真实有效尾

位置：`cuefield/transition-window-planner.js:686–747`，terminalRescue/terminalStartAfterVocal。

- 复现：A容器=180s、effectiveSourceEnd=160s、保护到150s、估计歌词窗153–165s。旧 mixStart/handoffAt 均为165.12s，还声称存在0.106s可听重叠。
- 根因：避让歌词后只按容器 duration 检查剩余空间，没有用 effectiveSourceEnd；没有复核最小剩余重叠。
- 影响：terminal fallback 可以在已测出的静音尾内排一个不存在的过渡。
- 最小修复：歌词避让以 effectiveSourceEnd 为上界，保留原有 class A/B/C 选择；最终不足原有2.2s最低窗口时诚实失败。
- 证据：extra-before.json；修后同夹具 handoff≤160s 且窗口≥2.2s。

### CF-06 / P3：缺失 LUFS/true-peak 被当作有效 0dB

位置：`cuefield/cue-profile.js:158–168`，normalizeAudioMetrics。

- 复现：audioMetrics 两个值均为 null，旧 shadow.loudness.available=true 且两个测量值为0。
- 根因：Number(null)/Number('')=0 被误当有效测量。
- 影响：诊断与回传证据不可信；该 shadow 数据本身没有在本轮被接入新的音量策略。
- 最小修复：null/undefined/空字符串保留 unavailable；真正测得 truePeakDbtp=0 仍有效。
- 证据：before.json 的 nullMetrics；缺失/NaN/Infinity 与合法零值回归。

### CF-07 / P2：feedback 新嵌套 musical/bridge 二次压缩丢失

位置：`cuefield/feedback-log.js:219–246`，compactBridge/compactMusical。

- 复现：新记录写入 musical.evidence=true、compatibility=0.8、bridge.selected=true、drum-build/8bars；readCuefieldFeedbackStats 的 failedSamples 读取后全部变 false/null/空数组。
- 根因：写入器生成 canonical nested records，读取器再调用仅支持旧 flat planner 字段的压缩函数。localMusical 已兼容嵌套，但 musical/bridge 未兼容。
- 影响：失败样本的音乐/桥接诊断被静默清空，听感问题排查丢依据。
- 最小修复：优先 canonical nested 字段，再迁移旧 flat 字段；明确 false 和数值0仍保留。格式/schema未改。
- 证据：before.json 的 feedbackWritten/feedbackRead；真实临时JSONL写入→读取，兼容旧flat/坏JSON行/旧cohort/false与0回归。

### CF-08 / P3：artifact 丢 bridge payload，不同计划得到同一 ID

位置：`cuefield/transition-artifact.js:97–129`，compactBridgePayload/compactAction。

- 复现：相同 bridge action 只更换 drum-build→echo-break，旧 artifact 丢 bridge 参数且 artifactId 相同。
- 根因：primitive 字段清单不包括结构化 bridge 对象。
- 影响：非默认合成桥接计划不能被 artifact 完整代表；当前实际执行仍读取 chosen.timeline，不能据此声称默认播放本身改变。
- 最小修复：只保留模板、bars、两侧BPM、前三项阶段秒数。未知附加字段继续丢弃，原timeline/fallback层数与条数限制不变。
- 证据：extra-before.json；不同模板 ID不同、深冻结、stage数组限3、修改BPM后integrity校验失败回归。

### CF-09 / P3：source fingerprint 漏掉已拆分的 Cuefield runtime

位置：`cuefield/version.js:19–47`，cuefieldSourceFiles。

- 复现：隔离目录中改 public/js/modules/05-playback/16-cuefield-automix-core.js，旧buildSha完全不变。
- 根因：只识别旧 public/cuefield-*.js，没有纳入现在的模块目录及loader。
- 影响：调用该版本helper的工具无法区分runtime变化。当前server没有接入buildCuefieldVersion，本组没有擅自改其接线或宣称实际反馈已经按构建分组。
- 最小修复：纳入现有 Cuefield 模块及index-loader；无关19-audio-router变化仍不改变此范围的fingerprint。
- 证据：before.json；隔离文件改动/稳定重算/无关文件/非法variant标识回归。

### CF-10 / P3：负的边界距离被当作肯定证据

位置：`cuefield/boundary-evidence.js:53–60`，evaluateCadenceBoundary。

- 复现：audioBoundaryDistance=-1、barBoundaryDistance=-1，其他证据有效，旧eligible=true。
- 根因：只检查距离>0.1，未检查距离必须非负。
- 影响：显式启用cadence evidence时不可能的距离可绕过证据门槛；默认live末尾退路没有提交这种边界证据。
- 最小修复：拒绝负距离；0.1容差和其他阈值保持原值。
- 证据：extra-before.json；合法0.02s仍通过，负距离被两项理由拒绝。

### CF-11 / P2：多时间标签 LRC 丢复唱并把时间戳当歌词

位置：`cuefield/lrc-anchors.js:19–41`，parseLrc。

- 复现：[00:10][00:30]same chorus 只产10s行且text含[00:30]。120:00时间行也被丢弃。
- 根因：解析器只匹配单个1–2位分钟时间标签；前端已有multi-tag/interleaved parser，下一首payload.lyric又可直接传原始LRC。
- 影响：重复hook/歌词保护段及lyric-link证据与实际歌词不一致。长分钟格式与cuefieldLinesToLrc自己的输出也不闭合。
- 最小修复：按前端既有语义处理同一行多标签及交错文本，接受长分钟；原点/冒号小数、单时间标签、空歌词/元数据处理保留。
- 证据：lrc-before.json；复唱四时刻、交错文本、120分钟、旧冒号小数、元数据/空行回归。

### CF-12 / P2：trusted climax 太靠近 B 尾，teaser 播出媒体范围

位置：`cuefield/recipe-planner.js:1032–1042,1114–1142,1225`，teaserFitsTarget/recipeEligibility。

- 复现：B=20s，可信drop=19.9s，beat/musical/exit证据合格。旧chooseTransitionWindow选择tease-roll-double-drop，首段B从19.9s播到约21.3s才stop。
- 根因：只验证最终landing方程，没有检查提前teaser的目标可用时长。
- 影响：teaser段先到EOF，实际运行可能比计划提前结束；这里未运行真实音频。
- 最小修复：仅两个已有teaser recipe新增物理目标尾检查，不改变正常recipe分数、默认冷却或时序。
- 证据：final-sweep.json 的supplementalFindings保留旧实际timeline；目标尾回归拒绝两个超尾teaser。96s普通夹具仍选择原tease-roll-double-drop，所有11个普通recipe方程基线继续通过。

### CF-13 / P3：English “i” 命中了普通单词

位置：`cuefield/lyric-link.js:40–52`，containsPronoun/isCallResponse。

- 复现：outgoing='night falls'、incoming='you run'得到call-response与0.18分；night中的i并非第一人称。
- 根因：单字符代词使用includes，英语i需要词边界，而中文“我/你”需要字符匹配。
- 影响：lyric-link诊断/非默认桥接偏好可能误加分；未改变任何评分权重。
- 最小修复：英文代词按完整normalized token匹配；中文“我/你”保持字符匹配。真实'i wait'→'you run'和'我等待'→'你奔跑'都保持原0.18分。
- 证据：nondefault-observations.json保存修前误判；nondefault-after.json保存修后no-link/0分；对应英文/CJK兼容回归。

### CF-14 / P3：中途打断增益坡度时，测窗改变了过去的斜率

位置：`cuefield/recipe-planner.js:19–64`，gainAtEnvelope/buildGainEnvelope。

- 复现：B从0在4s线性升至1、2s时立即归0。threshold=0.08时实际应0.32s开始可听、重叠1.68s；旧measureTimelineWindow得到0.16s与1.84s。
- 根因：截断段直接把end改到2s却保持旧gainEnd=1，相当于把原4s坡度压缩到2s。
- 影响条件：外部/未来时间线含中途打断的ramp。当前内置recipe没有该线性中断，本轮未改变其时序或评分。
- 最小修复：截断段保存原rampEnd，只截其活动范围，插值继续按原4s时间基准；同样保全equal-power曲线的原前缀。没有把非线性曲线重缩放为另一条曲线。
- 证据：nondefault-observations.json、nondefault-after.json；中断线性/中断equal-power/不中断线性回归，普通recipe合法方程与选择基线继续通过。

## 未修/非默认路径与容量观察

### CF-U01 / P2：synthetic bridge 规划96s，运行容量64s

位置：`cuefield/bridge-planner.js:58–74,137–195`；对应 `public/js/modules/05-playback/17-cuefield-timeline-executor.js` 的bridge durationMs≤64000与bridge engine≤64s。

- 证据：40BPM/16bars纯夹具，planBridge totalDuration=96s、stageDurations=[24,48,24]，而运行器只允许64s。B从72s才进入，载波可能先结束。
- 根因：纯planner的bars×4×60/平均BPM合同未和runtime硬上限对齐。
- 影响条件：仅显式启用synthetic bridge/直接调用planBridge；当前server没有接其默认UI参数，故不把它说成已发生的默认播放故障。
- 本轮未修：降bars会改时序/体验，不擅做产品选择。接入前应统一时长合同，或对不支持组合明确technicalFailure。
- 证据文件：final-sweep.json。没有把合成桥接听感标记为通过。

### 容量观察（未作为已实测用户故障）

- readCuefieldFeedbackStats全量readFileSync/split/JSON.parse；append日志没有容量上限。不能擅自删除反馈，应按既有保留权限再决定流式统计/归档方案。
- buildBars/buildWindows/歌词候选在多个窗口上反复filter全拍数组；单profile隔离样本120/600/1200s、240/1200/2400拍，最终本机一次运行约1.62/10.83/34.62ms。只是一次运行的规模观察，不能据此宣布提速，不能替代长播客/真实主进程延迟测量。
- buildMusicalProfile的可选frameSize缺少>0约束；当前仓库没有调用该生成器，未执行无界输入/安全PoC。接入之前需补选项合同与工作量预算。
- beat-map adapter/一些纯入口对非数组、无效time的归一化仍较宽松；本轮随机样本局限在合法有限cache结构。未声称对任意畸形对象、全部字段类型或无限输入通过。

## 验证记录

证据目录：`docs/qa/cuefield-planner-2026-10-09/`。其中before-source是审查前19文件原样副本，未用于生产。

1. before复现：reproduce-before.js、reproduce-extra-before.js；before.json/extra-before.json/lrc-before.json。
2. 同一份回归以CUEFIELD_PURE_SOURCE_ROOT指向before：16组中15组失败；仅普通recipe合法时序基线通过。日志before-regression.txt。
3. 最终生产代码：新增16组边界回归通过；加现有integration/runtime/execution-ownership共28项通过。日志after-regression.txt。
4. final-sweep.js：固定seed=20261009，48个有限、隔离cache实例；33个成功窗口和15个诚实失败均满足检查。成功要求有限mix/handoff、handoff>mix、handoff不越实际源尾、mix不早于保护、最终B源进度不越目标；失败要求technicalFailure与空时间线。这里不是任意输入全覆盖。
5. runtime-failure-check.js：使用当前真实16 core与修后真实planner，证明无合法窗口不准备下一媒体、不保留pending、不触发handoff。没有重新实现一个测试版状态机。
6. 最终npm run check退出0；日志check.txt。该命令明确跳过Electron runtime smoke（fast/static mode），本组未运行真实听感或声卡验证；本组未跑全部npm test，由整体验证另行汇总。
7. 代码冻结后保存新增证据，未继续变更桥接时序或未授权的平台/用户文件。

源码最后一次修改后重新运行验证，再次冻结；本报告保留审查过程中首次before证据，不把它覆盖为after。

## 逐文件实际覆盖 ledger

所有行范围均指before-source；修后对应改动也已复读。前端执行状态机由其他审查负责，本组只为边界合同读相关调用点并运行隔离状态夹具。

| 文件 | 实际读审段 | 核心检查与结果 |
| --- | --- | --- |
| adapter-mineradio.js | 1–186 | 压缩数组/object/number拍事件、flags/combo、秒单位、tempo/downbeat质量、窗口排序、key/vocal可用性；无改动，显式meter规则被profile复用 |
| boundary-evidence.js | 1–104 | null/NaN、证据家族去重、audio/bar距离、confidence、声乐状态/静音毫秒/dB与能量降幅、末尾fade时长；CF-10 |
| bridge-planner.js | 1–202 | 网格可用性、可信hook/drop排序、bars/可用长度、退出保护、提升分、三个阶段、回退timeline；CF-U01明确未修 |
| cue-profile.js | 1–218 | 拍归一化、gridStep、显式meter、bar/phrase/window、candidate排序、cue点、真实时长、LUFS/peak、shadow；CF-01/02/06 |
| feedback-log.js | 1–250；250–466 | version/字符串/列表预算、评分、window/hook/route字段、shadow数值范围、nested/flat迁移、JSONL写入/读取、bucket与legacy cohort；CF-07，日志全量读取容量观察 |
| lrc-anchors.js | 1–131 | 分秒/小数、空白/Unicode文字、时间排序、复唱分组、pre-section、preferAfter与lookback；CF-11 |
| lyric-link.js | 1–106 | Latin/CJK单元、缺行/末句/高潮范围、代词响应、suffix、vocal碰撞罚分、clamp；CF-13 |
| mineradio-bridge.js | 1–250；251–500；501–717 | cache key/miss、map→profile→structure链、floor提示、recent限2、edge证据、cadence/livefallback选择、精简输出、诊断、synthetic选择、artifact/technical失败；无改动，真实入口回归 |
| musical-profile.js | 1–189 | MIDI/秒/amplitude、音级profile/key/relative/fifth兼容、melody轮廓、可靠local window距离及排序；无策略改动，frameSize容量边界未运行 |
| planner-contracts.js | 1–81 | listening floor真实source/confidence保护、fallback范围、13类overlap合同及0.05s容差、无效contract评分；原值保留 |
| recipe-planner.js | 1–245；246–500；501–750；751–1030；1031–1287 | gain/测窗/landing方程、tempo半倍双倍及rate界、全部recipe时序、源loop/teaser、musical证据、route门槛、cooldown、fallback与score排序；CF-12；CF-14 |
| section-candidates.js | 1–346 | 能量窗口、intro/rise/peak/release/outro、歌词复唱、去重、exit/entry/pair分、late bias、空候选退路；保留原评分/排序 |
| shadow-diagnostics.js | 1–213 | bar归一化、4/8/16/32小节影子选择、median/MAD、downbeat间距/毫秒误差、LUFS/peak有效性；无改动，null测量由profile入口修正 |
| structure-map.js | 1–307 | 复唱time/block去重、持续能量可信hook与低证据fallback、保护段、vocal估计时长、退出候选、natural-tail与entry语义；未改hook策略/默认罚分 |
| transition-artifact.js | 1–196 | track/policy精简、128/64/2层预算、primitive/null、深冻结、稳定JSON/hash、ID验证及timingSafeEqual、版本保全；CF-08 |
| transition-evaluator.js | 1–273 | 文字归一化/stopwords、closed phrase、exit/entry/energy/bass/lyric方向分、标题风格映射、tier门槛与recipe bonus；原策略保留 |
| transition-router.js | 1–218 | finite值、非fallback代表候选、最近bar、无duration/BPM/结构/分析的terminal、保护比例、contrast rise/release与clean evidence；原阈值保留 |
| transition-window-planner.js | 1–240；241–505；506–780；781–1060；1061–1352 | entry合法来源/hook证据、候选限额、保护/vocal/landing/重叠拒绝、route评分、sourceEnd、terminal A/B/C、cadence/full intro/end fade与失败、全部最终排序；CF-03/04/05 |
| version.js | 1–91 | identifier语法/长度、源遍历排序、SHA来源、variant派生、版本字段/default；CF-09，未接线状态明确保留 |

以下列出逐文件函数索引，供维护者定位审查覆盖；这份索引不表示每个函数都独立跑过动态测试。

### adapter-mineradio.js

toNumber（1行）；clamp01（8行）；median（12行）；normalizeBeatEvent（19行）；beatGridQuality（71行）；normalizeWindows（106行）；normalizeMineradioBeatMap（117行）。

### boundary-evidence.js

finiteOrNull（5行）；round（11行）；sourceFamily（15行）；evidenceFamilies（26行）；normalizedVocalState（32行）；evaluateCadenceBoundary（37行）；chooseEndCrossfadeDuration（87行）。

### bridge-planner.js

clamp（5行）；profileOf（9行）；structureOf（13行）；usableGrid（17行）；climaxTime（26行）；trustedClimax（30行）；routeOf（44行）；compatibilityOf（48行）；directScore（52行）；totalDurationForBars（58行）；chooseBars（63行）；templateFor（77行）；chooseExit（86行）；predictedScore（99行）；buildTimeline（110行）；planBridge（137行）。

### cue-profile.js

toNumber（3行）；round（8行）；average（13行）；beatEnergy（19行）；normalizeBeats（30行）；inferGridStep（46行）；isDownbeat（57行）；beatsInRange（64行）；buildBars（68行）；gridTimingStability（87行）；buildPhrases（98行）；buildWindows（115行）；bestCandidate（129行）；buildCuePoints（135行）；normalizeAudioMetrics（158行）；buildCueProfile（169行）。

### feedback-log.js

roundNumber（6行）；compactString（14行）；compactVersion（19行）；compactList（33行）；presentValue（39行）；firstPresent（46行）；normalizeHookCount（50行）；normalizeSustainedEnergy（56行）；compactRejectionReasons（61行）；compactRouteReasons（66行）；compactTerminalRescueClass（71行）；compactPreferredExitRange（76行）；compactFakeOutMs（84行）；compactWindow（90行）；normalizeRating（115行）；compactPair（125行）；boundedRoundedNumber（136行）；validatedRoundedNumber（142行）；sanitizeShadowSide（149行）；sanitizeShadowDiagnostics（193行）；compactDiagnostics（207行）；compactBridge（219行）；compactMusical（232行）；compactLocalMusical（243行）；compactStructure（267行）；compactTransition（281行）；safeParseJsonLine（325行）；emptyBucket（333行）；addToBucket（337行）；finalizeBuckets（347行）；isPlainObject（356行）；feedbackCohort（362行）；buildCuefieldFeedbackRecord（377行）；appendCuefieldFeedback（389行）；readCuefieldFeedbackStats（396行）。

### lrc-anchors.js

toSeconds（1行）；cleanText（5行）；normalizeText（11行）；parseLrc（19行）；repeatedGroups（35行）；findSectionEntry（45行）；findSectionEntries（50行）；findHookEntry（102行）；findOutgoingPhrase（111行）。

### lyric-link.js

clamp（1行）；round（5行）；normalize（9行）；units（17行）；lastLineBefore（24行）；linesAtClimax（31行）；containsPronoun（40行）；isCallResponse（45行）；finalUnit（53行）；suffixLinked（59行）；scoreLyricLink（70行）。

### mineradio-bridge.js

toTrack（12行）；entryFromCache（22行）；parseMaybeLrc（32行）；normalizedFixture（36行）；analyzeCacheEntry（51行）；credibleFirstHook（82行）；finiteOrNull（91行）；compactString（97行）；compactCount（102行）；normalizeRecentRecipes（107行）；cachedEdgeEvidence（116行）；buildLiveTailEvidence（138行）；trustedExecutableWindowPlan（153行）；validLiveEndCrossfadeWindow（168行）；compactNumericFields（193行）；normalizeBoundaryEvidence（202行）；normalizeTailEvidence（230行）；compactCadenceFallback（248行）；compactTrack（264行）；compactStructureMap（273行）；compactAnalysisSummary（285行）；compactTransitionPoint（292行）；compactTransitionCandidates（306行）；compactCleanBoundaryDiagnostics（313行）；compactBridgePlan（332行）；minimumFiniteOrNull（353行）；boundedNumber（358行）；compactShadowSide（364行）；compactShadowPair（402行）；transitionDiagnostics（410行）；planCuefieldTransitionFromCache（495行）。

### musical-profile.js

clamp（7行）；normalize（11行）；cosine（16行）；normalizeNote（28行）；estimateKey（37行）；melodyContour（59行）；buildMusicalProfile（82行）；keyCompatibility（115行）；compareMusicalProfiles（130行）；distanceToWindow（147行）；nearestReliableWindow（157行）；compareLocalMusicalWindows（165行）。

### planner-contracts.js

clamp（21行）；round（25行）；fallbackListenFloor（29行）；resolveListeningFloor（38行）；overlapContractFor（53行）；scoreOverlapContract（59行）。

### recipe-planner.js

clamp（8行）；curveGain（12行）；gainAtEnvelope（19行）；buildGainEnvelope（33行）；measureTimelineWindow（64行）；landingDiagnostics（118行）；naturalEntryDiagnostics（157行）；densityAt（187行）；average（195行）；barsInRange（201行）；textureAt（206行）；nearestCandidate（216行）；firstCandidate（222行）；nearestDownbeatOffset（228行）；barLength（236行）；pickAnchors（242行）；commonScores（269行）；tempoFamilyAssessment（313行）；baseCandidate（359行）；cleanBoundaryTiming（381行）；makeCleanBoundaryHandoff（395行）；alignedBStart（447行）；makeLongBlend（451行）；makeFilteredPickup（478行）；makeBassHandoff（517行）；makeSpectralEmergence（544行）；makeQuickFade（583行）；makeEchoOut（605行）；safetyFallback（643行）；makeSourceLoopRoll（651行）；makeHookTeaser（683行）；makeHarmonicDoubleDrop（721行）；makeTeaseRollDoubleDrop（751行）；musicalAssessment（808行）；safetyAssessment（829行）；buildSafetyTimelineForAnchors（903行）；makeSafetyLongBlend（969行）；chosenOverlapDiagnostics（1015行）；recipeEligibility（1032行）；planRecipeCandidates（1151行）。

### section-candidates.js

toNumber（1行）；round（12行）；beatEnergy（17行）；average（28行）；windowBeats（33行）；windowStats（37行）；candidateMetric（48行）；uniqueCandidates（60行）；repeatedLyricGroups（77行）；addLyricCandidates（87行）；addEnergyCandidates（136行）；analyzeSectionCandidates（211行）；scoreExit（232行）；scoreLateExit（241行）；scoreEntry（249行）；hasNearbyClosedOutgoingPhrase（258行）；scoreCandidatePair（268行）；chooseTransitionCandidates（296行）。

### shadow-diagnostics.js

finite（5行）；clamp（11行）；round（15行）；median（22行）；average（29行）；normalizedBars（34行）；boundaryLift（49行）；phraseCandidates（56行）；phraseShadow（89行）；beatIntervals（112行）；tempoShadow（125行）；downbeatShadow（149行）；loudnessShadow（178行）；buildShadowDiagnostics（199行）。

### structure-map.js

average（3行）；repeatedLyricTimes（8行）；repeatedLyricBlocks（22行）；phraseForTime（51行）；signaturePhrase（55行）；latePenalty（104行）；buildVocalWindows（110行）；buildExitCandidates（135行）；buildStructureMap（185行）。

### transition-artifact.js

compactString（17行）；finiteOrNull（24行）；compactTrackIdentity（30行）；compactPolicy（43行）；compactCleanBoundary（54行）；compactCadenceFallback（69行）；compactPrimitive（85行）；compactTimeline（92行）；compactAction（97行）；deepFreeze（114行）；firstFinite（120行）；stableJson（128行）；computeTransitionArtifactId（145行）；integrityFailure（152行）；verifyTransitionArtifact（158行）；buildTransitionArtifact（169行）。

### transition-evaluator.js

toNumber（1行）；round（6行）；clamp01（11行）；textOf（15行）；normalizedText（19行）；tokens（23行）；contentTokens（47行）；includesAny（51行）；isClosedOutgoingPhrase（56行）；scoreExitSuitability（67行）；scoreEntryPromise（78行）；scorePairCompatibility（88行）；scoreLyricHandoff（99行）；scoreDirectionality（115行）；scoreStyleCompatibility（124行）；profileForTitle（129行）；setOverlap（149行）；hasTag（154行）；titleOfAnalysis（161行）；inferStyleCompatibility（166行）；recipeFor（187行）；classifyTier（196行）；evaluateTransitionPair（214行）。

### transition-router.js

finiteOrNull（1行）；clamp（7行）；firstFinite（11行）；barTime（19行）；nearestBar（23行）；chooseExit（38行）；chooseEntry（53行）；preferredExitRange（66行）；terminalPolicy（71行）；classifyTransitionRoute（85行）。

### transition-window-planner.js

clamp（11行）；ceilMillisecond（15行）；floorMillisecond（19行）；normalizePenalty（24行）；normalizeRecentRecipes（30行）；profileOf（39行）；musicalEvidenceFor（43行）；localMusicalEvidenceFor（52行）；hasReliableLocalMusicalClash（62行）；landingKind（68行）；normalizeEntry（78行）；credibleHookEvidence（91行）；landingTime（98行）；sameLanding（109行）；trustedStructureHookEntries（115行）；naturalLanding（142行）；sourceLandings（149行）；landingOptions（160行）；exitSourceCandidates（173行）；sourceExits（181行）；scoreWindowExit（186行）；activeVocalWindow（193行）；completeCleanExit（200行）；restoreCleanEntry（213行）；exitsForPolicy（219行）；exitOptions（232行）；trustedGrid（245行）；nearbyBar（251行）；grooveContinuity（256行）；recipeSectionEntry（268行）；isAnchoredLandingDiagnosticValid（278行）；transitionStartOffset（284行）；rejectionReasons（289行）；rangeDistancePenalty（340行）；entryPolicyPenalty（349行）；recipeCandidateAllowedByRoute（355行）；rankWindow（372行）；compactLocalMusicalEvidence（426行）；compactWindow（443行）；terminalRescuePolicy（466行）；technicalFailure（482行）；terminalStartAfterVocal（529行）；effectiveSourceEnd（543行）；classCIntroTrim（566行）；terminalRescueMode（590行）；terminalRescueTimeline（615行）；terminalRescue（686行）；evidenceForTime（822行）；overlapsWindow（829行）；cadencePolicy（836行）；strictFallbackPolicy（852行）；cadenceCompleteResult（865行）；trustedFullOutroIntro（923行）；endOfTrackCrossfade（1017行）；chooseCadenceFallbackWindow（1105行）；representativeRelationshipRisks（1163行）；positiveOverlapEvidence（1173行）；chooseTransitionWindow（1213行）。

### version.js

identifier（9行）；cuefieldSourceFiles（19行）；sourceFingerprint（47行）；variantBuildSha（58行）；buildCuefieldVersion（63行）。
