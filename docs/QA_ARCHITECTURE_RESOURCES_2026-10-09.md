# 架构、资源预算与生命周期审查（2026-10-09）

## 结论与边界

确认并最小修复六组资源所有权/异常结算问题：手势旧会话清理新会话、FontFaceSet驻留、SDK加载并发/失败恢复、MR/DJ分析请求取消与后端解码并发、附加音频路由部分构建失败释放、背景IDB异常结算与连接关闭。内存状态另改为明确的主进程RSS标签，resize延后刷新合并为最后三个稳定检查。歌词显式暂停编辑的有限可见owner上传与舞台组协作补齐。字体owner改造中另外捕获并纠正本轮新引入的经典脚本初始化回归，和基线缺陷分开记录。

没有确认本范围仍开放的P0/P1；AR13为本轮新增、现已修的P1启动回归，不是审查起点5bc4f03基线问题。不存在“整个播放器通过”或“所有登记文件逐行通过”的结论：本报告逐文件/逐功能登记实际范围；结构盘点、源码推断、VM实测、实际WebGL/Windows实机明确区分。Electron主入口受Unix socket EPERM阻止，未绕过；Node浏览器模式的完整原前端已由browser组运行，这是另一条获准的产品运行入口，不是Windows证明。本项没有真实摄像头/麦克风、账号、用户媒体文件、用户配置、发布或推送操作。Linux不能代替Explorer、DWM、WE Scene、虚拟声卡和硬件听感验收。

- 已读CLAUDE.md、AI_REVIEW_HANDOFF；分母来自QA_COVERAGE_MATRIX及过滤读取的QA_INVENTORY，不把3.6MB索引整份打印。
- 资源与交叉范围117文件的SHA/行数：`qa/architecture-resource-source-snapshot-2026-10-09.json`。22:20:47 UTC基于bc5258d最终资源批次刷新，后续并行改动须重新核对，哈希存在不等于深审。
- 加载顺序/顶层重复声明证据：`qa/architecture-load-order-2026-10-09.json`。
- 主报告与UI/播放/API/安全独立报告互补；播放队列、账号接口、键盘弹窗不在这里重复宣称完整覆盖。CueField planner语义及14-stage全文已由专门组补审，以其具名函数ledger、报告和实际运行结果交叉登记。

## 已确认缺陷与最小修复

### AR01 · P2 · 手势迟到启动/推理清理错属会话（已修）

位置：`10-shell/00-gesture-control.js`，startGestureControlInternal、cleanupGestureControlRuntime、onFrame/onResults。

复现：假Camera的A.start停在Promise；stop A后启动B并完成；再完成/拒绝A。旧逻辑使B active=false、B.stop被调用1次。先stop且没有替代会话时，A晚到附加的流也不能由已清空的全局变量释放。

根因：epoch只能识别过期任务，清理仍读取新会话的全局camera/hands/video；Inference的catch/finally也操作全局busy。影响：快速关闭/重启可能关掉新的摄像头；已取消的旧流晚到时仍采集。

方案：每次启动持有独立owner的video/Camera/Hands；帧和结果检查owner身份；旧settlement只stop旧camera/tracks、close旧hands、移除旧video。迟到start后再次清理其资源，所有新会话状态保持不变，Hands.close异步拒绝有处理。

实测：gesture-runtime-lifecycle增加晚成功、晚失败、旧onFrame/onResults、无替代会话晚stream；gesture-player-actions与permission-guard同时通过。before/after日志为`qa/gesture-ownership-{before,after}-2026-10-09.log`。未调用真实摄像头，无法据此量化硬件功耗或MediaPipe设备行为。

### AR02 · P2 · 自定义字体删除/替换不退休FontFaceSet（已修）

位置：`02-visual/05-lyrics-fonts-texture.js`，register/release/reconcileCustomLyricFont；`07-fx/03-cover-picker-fonts.js`上传、删除。

复现：真实UI注册/删除入口的VM做20轮，记录数组为0而document.fonts仍20个。单文件上限与最多6个保存记录并不能限制已加载font驻留。

根因：只add没有delete；迟到load无owner；同ID重复调用各自加载。影响：反复换字体累积驻留字形/原始数据和额外加载，直到页面退出；这是长期保留，与单次字体解码峰值不同。

方案：ID→owner Map，共享同内容pending；删除、同名替换、max6淘汰调用FontFaceSet.delete；迟到load只在owner仍匹配时add；失败忘记owner可重试。只卸载运行时字体，不删除用户文件或存储。

实测：`tests/custom-font-lifecycle.test.js`4组涵盖删除、替换、淘汰、晚load、重复load与失败重试；user-fx-archive-compat8组通过。`qa/custom-font-lifecycle-{before,after}-2026-10-09.log`。使用假FontFace，不等价真实字体引擎RSS测量。

### AR03 · P2 · SDK加载把pending/failed script当成功（已修）

位置：`09-idle-toast-libraries.js`，loadScriptOnce；gesture两个MediaPipe调用。

复现：未发load事件时连续调用同src，第一个未完成，第二个已经resolve；失败script仍在DOM时后续同src也resolve。快速重启可能在Camera/Hands未定义时使用SDK；离线失败后无法可靠恢复。

根因：仅以script存在判完成，没有共享Promise、错误清理或总期限。

方案：src owner singleflight；成功需事件或调用方预期global；未管理existing script等待事件/有限timeout，不默认已成功；错误、缺少global、20秒timeout移除所属节点与owner；旧onload不能删除新重试owner。保留两个实际URL、原始加载顺序和依赖来源。

实测：`tests/script-loader-lifecycle.test.js`6组并发、失败重试、timeout/晚callback、existing script/已存在global、空global、同步append失败全部通过；gesture重跑通过。`qa/script-loader-lifecycle-{before,after}-2026-10-09.log`。真实CDN可达性和SDK版本行为未在线验收。

### AR04 · P2 · 过期分析仍下载/解码，后端不同请求没有并发所有权（已修，原生不可中断边界保留）

位置：`03-beat/01-audio-beat-analysis.js`、`02-podcast-dj-analysis.js`、`00-tempo-worker-cache-prefetch.js`；00-state/03与01-scene/02 cancel入口；`dj-analyzer.js`、server `/api/podcast/dj-beatmap`。

复现：MR body Promise未完成时取消，旧逻辑没有AbortSignal，busy继续持有；后端假decoder的body read未完成时已取消信号没有作用，decoder.free=0、reader.cancel=0。另旧idle continuation在替代任务开始后隐藏新chip。

根因：只在完整arrayBuffer/解码后检查token；worker依赖16秒watchdog而不收取消；后端不绑定req/res生命周期，每个URL独立启动decoder。

影响：快速切歌/退出分析可继续耗网络/CPU/临时PCM、阻塞新分析或累积解码；陈旧finally/chip清理能覆盖新任务。8MiB结果缓存无法限制这些单曲临时工作集，不能把工作集称为长期泄漏。

方案：MR/DJ各请求owner和AbortController，intro/full独立signal；cancel timer同时abort本mode任务；busy由仍属该mode的owner推导；陈旧chip清理限当前token。worker在abort、transfer失败、成功、错误时统一terminate/清timer/listener，mono准备阶段也检查signal。前端结束及时释放压缩ab引用、处理context.close异步拒绝。DJ低频计算在yield检查取消。

后端reader读取、fetch与各range均传signal；取消退出不再fallback下载；finally cancel reader/free所属decoder。route监听req.aborted/res.close，移除精确listener，早已离开的请求不入场。全局limiter最多2活动+2等待，保留正常intro/full一对容量；等待者取消只移走自己的job，超出等待容量返回429；活动容量直至真实job结束才归还，避免仅reject订阅后又启动第三个decoder。

实测：小Buffer/假decoder与EventEmitter真实route体共8组，下载取消、不同owner、idle晚callback、worker释放、后端pending body、queue/独属取消、route listeners、RSS标签通过；与CueField/startup合计16组通过；`beat-analysis-memory.test.js`正常脉冲重复输出完全一致、分频一份PCM顺序减少、失败/取消source断开通过。before/after分别`qa/beat-analysis-lifecycle-before-2026-10-09.log`、`qa/beat-analysis-lifecycle-after-2026-10-09.log`；chip对照`qa/beat-analysis-stale-chip-before-2026-10-09.log`。

未测/边界：Web Audio decodeAudioData、OfflineAudioContext.startRendering以及动态import/decoder.ready进行中没有可用硬中断接口，本修只在其结算后拒绝陈旧后续工作并释放，不声称能抢占当前原生任务。没有大音频/OOM测试，没有改变采样精度、8MiB结果缓存、原有7200秒full策略或更长音频range策略。峰值模型：Float32 PCM=时长×采样率×声道×4；44.1kHz立体声1小时约1.18GiB，mono另约606MiB，压缩体/worker/正在render的单band/引擎副本额外。此为公式估算，非实测RSS。后续宜展示分析状态、可取消和实际峰值遥测；不能为了预算直接拒绝原来能分析的长曲。

### AR05 · P3 · RSS标签含混（已修）

位置：00-state/11-system-memory-controls，memoryFormatSnapshot；desktop/app-memory.js，getMemorySnapshot。

根因/影响：process.memoryUsage读取main本进程；“播放器”标签容易被理解为renderer/GPU等全应用总量。改为“主进程”，保持取值与清理行为。新增guard实测格式，未伪造总进程计数。app-memory清理可遍历app.getAppMetrics，但其前后RSS标签仍不能代表全播放器总量。

## 未修风险与有依据的改进

### AR06 · P2 · 自定义背景视频旧blob无应用级回收（未修，用户媒体策略待决定）

位置：02-visual/06-custom-background-colorlab put/get；07-fx/02-accent-background-controls readBackgroundVideoFile/set/clear。每次导入生成新id；正常IDB路径没有单文件/累计上界，也没有delete；清画面/切封面/换视频不退休旧blob。18MiB只限制IDB失败后的dataURL回退，不是IDB写入预算。

复现与影响：UI子审真实函数+内存store导入3个size=500MiB假视频，再clear，仍3条、代表字节1,572,864,000。没有实际分配1.5GiB或读取用户磁盘。反复正常导入可增长至浏览器配额失败；“清除背景”也不回收这些空间。

方案：这是用户导入媒体，不应自动套缓存TTL或purge旧数据。先建事务化大小账本与当前/所有已保存视觉档案的引用图；提供可撤销“未引用媒体管理/移入待删除区”、显示大小和保留项；新导入成功后再调整引用，恢复旧媒体不破坏原体验。是否设置单文件/总量上限及历史清理需用户决策。详细证据`QA_VISUAL_RESOURCES_2026-10-09.md` V5与`qa/visual-resources-vm.js`。

### AR07 · P3 · 汽水“96MiB”是多项留存目标，单项与在途不在同一预算（未修，区分已允许策略）

位置：server rememberQishuiDecryptedAudio、getQishuiDecryptedAudio；QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES=96MiB，encrypted单响应max256MiB。

源码允许cache.size=1时保留超过96MiB的单项。缩尺真实函数fixture仅分配288字节：预算96，单buffer256→留存1项256；再插入32→旧项淘汰，只留32。证明是“保留最后一个大项”的显式例外，并非无限留存泄漏。256MiB是加密输入上限，不能据此保证解密输出必小于256MiB。

同URL共享下载，多消费者取消最后一个才abort已由API组加固；不同URL无共同活动/在途字节池。下载chunks+Buffer.concat+decrypt输出可短暂同时存在，故96MiB不是峰值/RSS上界。不同URL峰值仅源码模型，未运行大分配或并发OOM。

方案：准确标注留存目标及单项例外；将不同URL在途任务纳入可排队的独立预算并保留当前播放优先，不盲删正在播的单项或将长曲直接拒绝。证据`qa/qishui-retained-budget-model-2026-10-09.json`。

### AR08 · P3 · 经典脚本重复声明与加载诊断维护风险（未重构）

位置：index-loader，07-fx/00-preset-archive-data，02-visual/06-custom-background-colorlab，04-shelf/00-layout-hover。

131脚本22:20快照3,460,066字节同步XHR后join('')整段编译；全部当前模块EOF换行、实际拼接parse通过。只有实际顶层重复声明才计：背景label、shelf guard重复，archive后附v2替换多个函数/变量，共12个名字；不是把所有同名嵌套局部函数误算冲突。当前覆盖函数没有确认行为错误，archive兼容8组通过。

影响：跨文件初始化/函数hoist、后定义覆盖和大段sourceURL使以后维护易引入顺序错误；同步读取的启动成本需真实冷启动测量。本轮不更换模块制、不异步改顺序、不改变兼容档案。建议定向声明唯一性/实际加载断言，明确保留的v2覆盖及逐模块失败诊断；未测XHR冷加载故障恢复，不能写“启动完全通过”。

### AR09 · P3 · 精确源码regex把实现格式当行为（未大规模改写）

位置：scripts/quick-check及部分guard型tests。主审集成中相同/更安全的signal/helper改造已多次触发旧精确跨函数regex误报；本项21:42运行也停在并行UI Search glass旧格式guard。

影响：误报警会诱导为了过检查而退回不安全实现，真正语义回归与格式变动难分。方案：保留来源/预算/发布清单等静态约束；所有权、取消、先后顺序逐步使用实际函数VM/行为fixture，AST检查替代拼源码细节。只按已证等价实现调整相应guard，不删除约束，不全项目重写。完整check结果由主审最终整合，日志`qa/architecture-quick-check-2026-10-09.log`不是“通过”。

### AR10 · P3 · CueField用户反馈日志增长与同步全量统计（未自动清历史）

位置：cuefield/feedback-log appendCuefieldFeedback、readCuefieldFeedbackStats（约389/397行）。写入逐条appendFileSync，统计readFileSync完整文件、split+parse保留全部records；无应用字节/时间上界。单条已压缩，但长期积累时读取峰值与主线程阻塞随总量线性增长。

这是用户反馈记录，不按缓存擅自删。根因与影响为源码可确认增长路径；没有真实长期日志基准，不声称当前已卡顿。建议保留原始记录、统计增量化/分页或有界流读取，经过用户选择的归档/导出后再回收；纯planner计算语义由专门报告覆盖。

### AR11 · P3 · resize burst重复延时刷新（已最小优化）

位置：10-shell/01-viewport-resize-shortcuts，scheduleMainRendererViewportRefresh。

复现：真实函数虚拟timer中连续100次resize，立即刷新100次，另留下300个48/140/320ms延时刷新。各callback读的是届时相同的最新全局尺寸，不需保留100轮旧稳定检查。它们有限结算，不能称永久timer泄漏。

根因/影响：每次resize都新排三个timeout且不合并，快速拖窗或原生状态连发时重复projection/renderer检查增加任务压力；未量化真实Windows窗口拖动帧率。

方案：保留每一次立即刷新与最后一轮48/140/320三次检查；新轮次取消旧timer并递增generation，晚旧callback不刷新或清掉新轮次；结束timer从owner数组退休，不改分辨率/尺寸/原始画质。

实测：新tests/viewport-refresh-budget.test.js证明100即时、最多3延时、旧callback不修改/清除新owner、最终时间点/原因和正常再次调用；与原始画质/WE属性共8组通过。证据qa/viewport-refresh-budget-before-2026-10-09.json、qa/viewport-refresh-budget-after-2026-10-09.log。

### AR12 · P2 · 音频附加路由部分构建失败遗漏所有权（已修）

位置：05-playback/00-api-quality-output，syncAudioOutputMirrors、removeAudioOutputMirror。

复现：构建delay/gain/destination后，tap.connect已成功，而delay.connect抛错；旧代码最后才注册mirror，catch仅从map按id清理。真实函数假WebAudio三次clock重试留下tap.links=3、新node=9、disconnect=0、tracks.stop=0、registered route=0。无实际设备，抛错分支是本函数已支持的异常路径。

根因/影响：注册前的局部graph不归map清理函数管理，连接在共享tap上的delay仍被保留；2200ms重试可重复累积异常分支资源。没有把所有连接失败或静音都误称此缺陷，也未测真实声卡异常发生频率。

方案：构建开始即持有construction owner，逐一登记已分配node；mirror在连接前注册；统一release函数对正常删除和异常半成品均幂等清理，只disconnect本次tap→delay边，不disconnect主tap全部分支；stop本次destination tracks、清mirror.srcObject。失败状态/正常重试/原路由参数保持。

实测：tests/audio-route-construction-lifecycle.test.js覆盖create-delay/gain/destination、Audio constructor、tap/delay/gain connect、srcObject attach八个失败点，每点重复失败三次后恢复；已分配节点各退休一次、stream track各stop一次、独立monitor边保留、原30%音量与250ms恢复。与现有路由/拖线/混音共21项通过；qa/audio-route-partial-init-before-2026-10-09.json、qa/audio-route-ownership-after-2026-10-09.log。

### AR13 · P1 · 字体owner改造中新引入classic初始化回归（本轮新增，已纠正）

位置：00-state/00-core-stores顶层registerSavedCustomLyricFonts→后续05-lyrics-fonts-texture的ownerMap初始化。不是审查起点5bc4f03基线缺陷，不能把它算作从用户产品发现的既有bug。

复现：按真实classic拼接顺序，core先恢复一个保存字体、05 initializer后执行，首版owner补丁调用undefined.get，整段脚本启动抛错。fresh没有保存字体不触发；此前单module测试先初始化05后调用restore，因此遗漏这条真实加载链。

方案：register通过record校验后惰性建立ownerMap，05 initializer保留已早建Map；异步FontFace.load仍共享并保留同owner，metrics/cache initializer完成之后再执行ready callback，不移动原加载顺序或删除用户字体。

实测：tests/custom-font-classic-startup.test.js三组验证caller-before-module、同步loader抛错也继续启动、立即resolved Promise等metrics/cache初始化且owner相同、generation0→1；与字体生命周期/就绪/style/paused owner共13项通过。before JSON/log及after log均为qa/custom-font-classic-startup-*-2026-10-09。真实用户配置未读取；只使用保存字体假记录。

最终原131模块浏览器冷启动补测：qa/browser-runtime-2026-10-09/full-final-corrected/result.json，source绑定7cf5cce，9项validation全部true、QA进程exit0；非空保存记录恢复1条，3-byte无效字体由FontFace/OTS拒绝并被捕获，owner清为0，renderer/首页、13预设和DOM操作仍完成，没有early ownerMap TypeError。该证据覆盖保存记录存在时的真实启动与字体失败恢复，不代表有效TTF/OTF/WOFF格式全兼容或真实字体ready/metrics已验；成功/迟到ready与metrics generation目前依上述VM和舞台组函数测试。

### SLY-02 交叉 · P2 · 暂停编辑完成只换文字、未恢复效果与所选HD（舞台组主修，本项补quality/upload归属）

详情、before首轮after的不完整结果及最终浏览器验证见QA_STAGE_LYRICS_2026-10-09.md。12-row-layers本项局部新增：仅current data、相同track token、未dispose、audio.paused、非再编辑、初始可见row snapshot才具有额外decorative/HD权限；普通outgoing/offscreen/runway不放行。先前Infinity key允许该owner重排；队列选择只找eligible，不轮询无eligible任务；deferred commit逐candidate过滤，仍消费原一帧一次上传、原byte/tier容量；既有可见基础文字上传例外保留。

新增tests/paused-lyric-quality-ownership.test.js两组执行实际helper/schedule/commit，和既有drag/work/runway/paused共23项通过，qa/paused-quality-owner-integration-2026-10-09.log。stage负责14/12a owner建立/退休。最终原前端浏览器单行4×和三行均真实完成：文字、readability、glow已经uploaded/visible，所选HD4为currentMap且rasterKey匹配，uEditPreview=0，owner token退休、resident=null，普通full-track-warmup仍暂停，GL error=0。证据qa/browser-runtime-2026-10-09/paused-final-extended/result.json；单行约2404ms/三行约6768ms只是本软件渲染fixture的功能等待时间，不能推算Windows性能。第一轮text-only仍保留为不完整中间结果。

### AR14 · P3 · 自定义背景IDB失败/abort未统一关闭与结算（已修，bc5258d独立后续窄批次）

位置：02-visual/06-custom-background-colorlab.js，putCustomBackgroundBlob/getCustomBackgroundBlob。7cf5cce已经提交之后，末轮错误分支复核发现本问题，主审仅授权该异常生命周期小修并独立提交bc5258d；它与此前六十四文件批次和浏览器冷启动证据分开记录。

复现：修前get只在tx.oncomplete关闭DB，req.onerror已reject但失败事务不会complete；两函数没有tx.onabort，transaction同步抛错也没有关闭已打开DB。真实函数+小型VM，按IDB request error冒泡和abort-only分别投递：正常成功各close=1，read error已reject但close=0；两函数abort-only仍pending/close=0，同步transaction抛错已reject/close=0。put现有tx.onerror正常reject/close=1。缩小模型qa/background-idb-error-lifecycle-review-2026-10-09.json；没有对浏览器配额、损坏IO或用户DB制造失败，不推断用户发生频率；正常事务串行，不宣称存储竞态。

根因/影响：资源释放只覆盖成功或部分error，失败时连接可保留至页面退出，abort-only调用者无法进入既有fallback/失败UI。

方案：每次get/put的本次连接持有幂等结算/关闭guard，处理request error、tx.onerror/onabort与同步transaction/store/request异常；错误+abort+complete重复事件不多次结算或close。get仍按原request success返回读值、transaction结束关闭；put仍只在tx.oncomplete后报告持久化成功。没有删除媒体或改变配额、保留政策；源码随后冻结，不再扩展修复。

实测：tests/background-idb-lifecycle.test.js四组，正常成功/get早读/put等commit、request error+tx error/abort重复只结算/关闭一次、abort-only、transaction/store/request同步抛错。before=1pass3fail，after=4pass0fail，qa/background-idb-error-lifecycle-{before,after}-2026-10-09.log。交叉视觉fixture原put没有返回IDBRequest，与真实API不符；仅将该内存mock补为返回request并断言导入成功，qa/background-idb-visual-crosscheck-after-2026-10-09.log仍确认3个虚拟500MiB条目和首页/封面/关闭原路径，无用户媒体清理。没有声称实际浏览器异常发生率。

最终原浏览器增量证明成功契约：qa/browser-runtime-2026-10-09/incremental-bc5258d-corrected/incremental-result.json，8项validation全部true、QA进程exit0，131入口HTTP200且source hash匹配bc5258d、运行前后源不变。调用原put/get向隔离真实IndexedDB写入8字节Blob，精确字节往返、type/size保留、put resolve undefined、缺失键返回null，fx.backgroundMedia不变；完整前端Splash/歌词纹理实际上传与软件WebGL链接同时通过。该证据是正常成功路径，异常/abort/sync throw仍只由上述VM覆盖，不声称已在浏览器制造真实IO失败；临时fixture未读取或删除用户媒体。

## 预算核对：每项预算的对象和例外

| 资源 | 现有边界 | 不能推出的结论 |
|---|---|---|
| backend cover-cache | completed 240项/48MiB，单项3MiB；活动4、排队64、总期限12s；在途32MiB、后台16MiB | 32MiB不是已完成留存上限，更非进程硬RSS；response拼接/对象/Chromium另占 |
| MR/DJ结果 | 每mode8MiB/24项；大结果不进cache；活动引用独立 | 不能当单曲PCM分析预算 |
| MR/DJ后端分析 | 新2活动+2等待；signal独属；保留既有精度/长曲路径 | native不可抢占、无实测总体峰值 |
| 相邻准备 | 最多两曲，低规格16MiB/其他32MiB，图片共享二槽，owned转交/释放 | 页内其他current/shelf/背景资源另计 |
| UI render cache | 单native-size颜色+depth target，width×height×8估算；inactive/deep/resize释放 | 非驱动额外GPU allocation/RSS硬预算 |
| 歌词runway/HD | runway低16/其他32MiB含CPU+GPU估值；HD按tier与设备池、4/6/8行；一项过渡替换余量 | 保留旧质量+新pending为有意原子升级，允许短过渡超原静态池；不称泄漏 |
| shelf封面 | loaded160/24MiB，可见/近邻软保护；failed由global trim，后台共享二槽 | 可见解码/Canvas/驱动不受24MiB总量硬限 |
| 头像/album背景 | 头像80/4MiB、最多2活动、超时/一次retry；album单候选15s | 实际Image解码内存未知 |
| font | 每文件约3.6MB、保存最多6；修后运行时owner随淘汰退休 | FontFace引擎和字形cache非已实测字节 |
| worker BlobURL | 单页singleton一个URL，一任务一个worker，修后取消terminate | 未revoke singleton不是反复累积泄漏；真实worker库峰值未测 |
| 背景用户IDB | 没有应用级空间上限/旧blob回收 | 浏览器配额不能代替应用保留策略；不可自动删除 |
| 首页MP4 | 单blob300MiB、load token/objectURL归属与deep策略由UI审查组修 | 不同于一般背景IDB；真实codec工作集未测 |
| WE loop cache | 单job64MiB、chunk1MiB、disk512MiB、append串行、cancel/abortAll | 真实Scene录制/编码峰值未测 |
| 汽水解密 | 留存96MiB目标+单项例外；加密输入单响应256MiB；同URL共享 | 无不同URL峰值池，不是96MiB硬RSS |

## 逐模块/功能实际检查清单

“全文”仅用于确实逐函数阅读全文；“关键链”明确限定已审函数/路径；“结构”仅AST/资源创建释放分母。以下没有以存在测试代替运行结论，亦不以无新发现代替所有输入已验收。

| 模块/文件（同目录全量列名） | 实际审查与深度 | 实测/仍需验证 |
|---|---|---|
| 00-state/00-core-stores、01-perf-render-state、02-preferences-ui-modes、02a-onboarding-state | 结构+全局初始化/单例和加载相依关键链；偏好迁移由其他审查交叉覆盖 | 原始全局值不改；不是每个业务store逐路径审完 |
| 00-state/03-beat-dj-state | 结果Proxy LRU、预算、取消/定时器/全局owner链深审 | beat-cache预算与新取消VM；队列业务由播放报告 |
| 00-state/04-fx-defaults、05-packaged-fx-archive、06-fx-runtime-layout、07-ui-playback-runtime | 全量声明/资源结构与默认/运行池关键链 | 保留默认画质/已存偏好；所有主题组合未实机 |
| 00-state/08-desktop-render-power、08a-first-run-quality、09-performance-probe、10-frame-scheduler、11-system-memory-controls | 08全文513行、09全文223行、10全文74行；deep/native策略、cache/memory timers、frame gates、探针每metric90样本且实际调用名固定、首次quality与RSS函数链深审 | first-run/paused cadence/recovery/memory VM；Windows电源状态未实机 |
| 01-scene/00-renderer-quality、01-orbit-free-camera、02-beat-camera-runtime、03-focus-cinema-camera、04-bottom-controls-cursor、05-ui-render-cache | DPR/pixel policy、单scene/camera更新、RAF调用、OrbitControls全局一次注册、焦点/临时目标、可见性/target/autoclear finally恢复关键链 | UI cache、original quality、paused lyric shelf、render cadence测试；GPU driver与摄像头手感未验 |
| 02-visual/00-pointer-cover-particles、01-float-skull-backcover | 固定粒子数组、geometry共享更换dispose、skull fetch singleflight、create/destroy逐函数资源链 | 无实测GPU显存；skull资产失败恢复未真实网验 |
| 02-visual/02-lyrics-state-layout、02a-lyric-work-scheduler、03-lyrics-star-river | 有界常量、同key队列替换/取消、2.4ms/12对象dispose、paused wake不饿死、owned共享texture区分全文/资源深审 | lyric-work-scheduler与runway test；未长期真实GPU计数 |
| 02-visual/04-visual-settings-persistence、05-lyrics-fonts-texture、06-custom-background-colorlab、07-lyrics-palette-text-utils | 保存/恢复/fontFace/measure cache/IDB/objectURL/palette token与小画布资源链，05本轮修复 | 字体新4组；IDB大占用为假size账本；颜色观感未验 |
| 02-visual/08-lyrics-display-modes、09-lyrics-payloads、10-lyrics-mask-textures | payload窗/primary-translation、layout逻辑/raster维度、Canvas owned、GPU dimension/pool、compact旧texture释放、readability/glow phases关键链 | mask/runway/drag/edit已有VM；未每语言/字体真实光栅 |
| 02-visual/11-lyrics-shaders | 主审全文160行：单例noise1024×512、uniform边界/分母、双面UV、glitch/glass/edit分支 | 软件WebGL编译由browser runtime报告；Windows观感未验 |
| 02-visual/12-lyrics-row-layers | 本项全文1976行：layout/translation/viewportfit、所有build phases/cancel、generation/HD resident/atomic replacement、单帧上传、glide/整row循环 | 质量/上传/取消VM交叉通过；全文读完并非所有公式像素验收 |
| 02-visual/12a-lyrics-edit-preview、13-lyrics-mesh-build、15-ripples-cover-depth | preview几何/texture退休、cooperative begin/step/finish/cancel、固定12 ripple/18 depth cache、AI token/previous缩图关键链 | edit/cooperative/foreground tests；AI真模型下载、推理峰值未验 |
| 02-visual/14-stage-lyrics-rendering | 本项prewarm/quality/cancel/clear等约800行关键链；独立舞台组已全文读原4101行及全部函数/回调，10/13/05/12a/06-offset也补全文，见QA_STAGE_LYRICS_FUNCTIONS与机读ledger | 舞台报告四项P2修复及81项歌词/字体回归；最终有限owner真实文字/效果/HD4上传、preview退出/token退休均由paused-final-extended浏览器证据确认，不是Windows证明 |
| sonic-performance-policy、sonic-performance、sonic-topography-preset、sonic-workshop-preset | policy与quality reset/mesh dispose/固定实例池、RAF/iframe进出与异步geometry创建关键链 | real THREE r128 Node实例dispose、sonic regression；未完整shader/全部effect像素验收 |
| 03-beat/00-tempo-worker-cache-prefetch、01-audio-beat-analysis、02-podcast-dj-analysis | worker/controller、single-task PCM/bands、busy/cache handoff、intro/full/fallback所有资源入口深审；DJ early return之后legacy分频块目前不可达 | 新8组/确定性脉冲；原生decode硬中断边界、真实长曲峰值未验 |
| 03-beat/03-local-beat-cache-modal、04-beat-map-runtime | cancel/cache/export/runtime持有引用、blobURL退休关键链；本地modal catch owner由播放组修 | 播放报告local ownership；本项不重复UI所有按钮 |
| 03-beat/05-cover-loading-crop、05a-adjacent-preparation、06-sonic-audio-monitor | 10s cover timeout/retry/token、adjacent两曲/slot/budget/转交、audio monitor监听单注册/暂停控制关键链 | cover/adjacent/sonic tests；实际图片decoding耗时/音频设备未验 |
| 07-fx/00-preset-archive-data、01-lyric-color-controls、02-accent-background-controls、02a-album-cover-background、03-cover-picker-fonts | 兼容v2覆盖、UI保存font/bg/palette、媒体video/objectURL替换、album单候选/token/timeout、字体删除/淘汰资源链 | archive兼容8组、字体4组、album VM；IDB未自动清历史 |
| 07-fx/03-wallpaper-engine-library、03a-wallpaper-engine-interaction、03b-wallpaper-engine-loop | WE选择/scene归属、loop capture token/chunks/timer/stream关闭、stale begin abort、pause/resume关键链 | wallpaper source/fixture tests；真实WE Scene/Win32/编码未验 |
| 07-fx/04-preset-grid-uniforms、04a-effect-scope、05-fx-panel-performance、06-hotkeys、06a-slider-preview、07-bindings-shelf-immersive、08-cache-storage-settings、09-console-workspace | 实际创建资源/全局事件/slider合并RAF/preview退休/删除确认入口结构+关键链；键盘accessibility交UI审查组 | 性能控件/quality/edit测试；所有按钮效果由UI ledger、不伪造全量实机 |
| 09-idle-toast-libraries | toast退场有界、MediaPipe加载singleflight/重试/timeout深审；其它动态库加载关键链 | script-loader6组；真实CDN未验 |
| 10-shell/00-gesture-control、01-viewport-resize-shortcuts、02-peek-panels-upload、03-splash、04-desktop-overlay-fullscreen、05-startup-bindings | gesture owner全文关键链、resize一次监听与viewport尺寸、启动timer/RAF/页面退出清理、overlay native hooks结构+关键链 | gesture3文件；splash重复float c由主审修/browser验证；键盘/弹窗交UI审查组 |
| 11-main-loop | 本项补阅读全文752行：主RAF/hidden timer互斥、fixed cadence余数、背景策略/paused UI gate、warm-work与cache release、audio/shelf/stage/skull/home gate、频谱与fallback节拍、各preset/overlay绘制调用 | cadence/paused/foreground tests；未所有动效逐帧/长期休眠实机 |
| 05-playback/00-api-quality-output、08-audio-graph-controls | 00仅571-end路由UI/所有device/sink/runtime/settings/graph路由函数深审，前段API/音质归API/播放报告；08全文807行：主图重绑/capture fallback、source生命周期、mirror退休、fade RAF/watchdog、UI SFX短节点 | 原路由/拖线9项通过；partial-init AR12已修，含新fixture/混音21项通过；实体sink/时钟同步未验 |
| 05-playback/19-microphone-mixer-runtime、20-microphone-mixer-ui | 主动设备枚举vs采集、sink grant、晚getUserMedia stop、track/graph/context/interval释放、pagehide/关闭MutationObserver、device change和已有音乐总线归属深审 | microphone/runtime/UI/permission7组；假设备信号不代替真实虚拟声卡或语音软件听感 |
| cuefield/*.js全部19项 | 本项所有导出/持有资源结构、mineradio-bridge/adapter/version/feedback关键链；独立CueField组已全文审原6683行/19项并修14个纯数据语义问题，见QA_CUEFIELD_PLANNER | 未把本项扫描写成全文；非默认96秒bridge/64秒runtime容量冲突另报告未修，实际听感/长播客CPU边界未实机 |
| dj-analyzer、cover-cache、audio-spill-relay、generated-cache-pruner、server资源routes | body/decoder/timer/inflight/cache/临时file与退出消费者归属关键链；API/security细节交独立报告 | 新analysis小fixture、既有spill/cache tests；大分配与真实network未验 |
| desktop/app-memory、system-memory、wallpaper-engine-loop-cache/runtime、full-desktop-mode-runtime、wallpaper-mode-runtime、wallpaper-loop-window、main | helper/process/timer/temporary script、owner generation/stop/dispose、beforequit7s恢复/15s总限、abortAll链深审；main仅资源相关链 | Linux模型/Windows-only跳过须保留；全main/IPC安全交专门报告 |
| package、internal-beta config、after-pack、CI/release workflow | 新helpers包装包含、正式asar:false/内测asar:true差异保留，现有Windows构建/升级/哈希与immutable tag guard关键链 | 仅本地源码核对，没有执行build/install/发布；未来仍需Windows全流程 |

## 运行记录与交叉覆盖

1. 修复前后最小VM日志均位于qa/，不靠只读源码推断宣称缺陷已实测。
2. 21:25的52个选定资源相关测试文件通过，记录`qa/architecture-resources-regression-2026-10-09.log`；其中Windows-only skip不是实机通过。该轮早于最后分析修复，因此最终结果需更新后的定向回归，不能自动沿用旧哈希。
3. 21:41分析/CueField/startup16组及deterministic beat memory通过：`qa/beat-analysis-post-integration-2026-10-09.log`；最后8组取消fixture21:44重跑通过。21:48扩展资源回归55文件实际54通过：`qa/architecture-resources-final-regression-2026-10-09.log`/JSON；paused-lyric-edit-commit为舞台组刚新增的预期before，不是既有资源回归倒退。21:53 stage第一轮修后资源58/58文件通过：`qa/architecture-resources-after-stage-regression-2026-10-09.log`/JSON；其后stage第二轮paused visible effect/HD及classic冷保存字体补修已纳入22:06:57最终资源回归：64/64文件脚本exit0（244测试通过、3原生项skip、0失败），qa/architecture-resources-final-after-regression-2026-10-09.log/JSON。最后IDB独立窄批次后65/65文件脚本exit0（258测试通过、3原生项skip、0失败），qa/architecture-resources-after-idb-regression-2026-10-09.log/JSON，11项IDB/home/shelf交叉也通过。原生WE角落/输入/跟随3项Windows-only明确skip。单独路由9项通过`qa/audio-routing-review-2026-10-09.log`。
4. UI视觉资源交叉报告`QA_VISUAL_RESOURCES_2026-10-09.md`：home image/MP4/viewport清理；其17文件71项与新homeVideo共23项结果归它自己的运行时间，不能替代全播放器。
5. 本项21:42 quick-check停在并行Search glass格式guard，该历史日志不是通过；stage最后81项歌词/字体回归与其npm run check exit0另有记录，主审最终全npm test/check汇总见QA_ENGINEERING_REVIEW_2026-10-09.md与QA_INDEPENDENT_INTEGRATION_2026-10-09.md，以其最终全量时间与哈希为准。实际browser的软件WebGL单独报告，不能把其Windows视觉验收写进本报告。
6. 没有新增安全PoC或依赖更新；没有绕过Electron主入口EPERM限制。Browser组获准Node浏览器入口与本项小VM证明分开登记。所有本项测试是隔离fake数据/小工作集，不碰真实音视频或用户数据。

## 后续闭环

- 14-stage与CueField专门全文/功能报告已经补入；原浏览器paused显式编辑闭环与非空保存字体失败路径冷启动已通过。有效自定义字体真实ready/metrics/格式兼容仍待设备与有效样本验证。若最终集成更改本项源，应重核对应SHA/回归。
- Windows运行实测按功能而不是测试数量：反复手势开关、音频路由开关、长曲取消/转场、GPU纹理计数、WE enter/leave/quit、后台恢复和实际虚拟声卡。
- 区分应用缓存预算、active单曲工作集、用户媒体保留、进程RSS/驱动内存；未获用户历史清理决定前，背景IDB与反馈日志只报告和设计可撤销管理。
