# 缓存增长专项审查（2026-10-10）

基线：本地 `fix/playback-background-20261010` / `a3eb0e9`。以下以本次重读源码和隔离行为验证为依据，不能替代 Windows/Electron 长跑。审查期间并行修补还在进行；表内标注原始风险，最终状态应以整合后的回归为准。无账号、真实用户目录、安装器、Electron下载或GitHub写入。

## 直接结论

不能回答“所有旧歌曲数据都会立即释放、永远不会越用越大”。主要大缓存已有自动淘汰；活动资源、用户持久资料和缓存不是同一类。还发现明确的按歌曲累积对象，以及失败路径和pin策略问题。本次确认并修复的spill问题：磁盘写失败后无限排入内存，改为只在失败模式下有界回压。正常磁盘拉流不变，音频长度不限制。

## 逐模块预算与触发点

| 模块/对象 | 已有预算 | 清理触发 | 准确边界 |
|---|---|---|---|
| `audio-spill-relay.js` | 默认每relay排队16MiB（配置最小64KiB），磁盘重放块256KiB | end/close/abort尝试删临时文件；正常进程exit同步清理；下次服务启动删死PID旧文件（权限/占用失败可残留） | 活动磁盘文件无每首/总量cap；累计写入文件不截去已读前缀。多relay也无总并发/总字节cap。磁盘故障原先tail无限，已窄修回压。16MiB不含上游当前chunk、HTTP/socket缓冲 |
| 汽水解密 `server.js` | 本批完成缓存严格≤96MiB，超大项只供当前调用、不留存；加密输入每响应256MiB | 新写入淘汰最旧；同URL单flight；最后订阅者取消上游；手动release去缓存引用并递增generation，旧inflight不回填 | 原单项例外已修，当前消费者仍持有的Buffer未修改。不同URL无全局解码/在途预算；96MiB绝非进程峰值，释放数字是逻辑引用量不是RSS下降量 |
| 后端封面 `cover-cache.js` | 240项/48MiB，单图3MiB，TTL30min；4 active+64 queued；在途32MiB（后台最多半额），12秒截止 | get过期/写入LRU；请求取消、完成、截止退役；手动clear有generation | TTL懒清，但容量受控；消费者/解码器可另持图像，预算非总RSS |
| 歌单封面 `04a-cover-loader.js` | 已加载160图/估算24MiB；4并发，后台保留2前台槽；12秒、最多重试2次 | 成功trim、viewport移出取消预取、手动reset | 可见/邻近pin例外；原失败记录不进loaded trim，1000失败记录仍保留1000。本批worker已补256失败项LRU/30s过期、64pending（保护活动和视口）；global trim也补dispose。预算是非活动保留目标，活动/可见项有例外 |
| 评论头像 `06b-comment-avatars.js` | 80项/估算4MiB；1–2 active共享后台2槽 | trim、不可见取消、reset | 活动/有waiter条目保护；DOM仍可持图片；不等于全图像内存cap |
| 评论首屏 `06-track-detail-lyrics-actions.js` | 32项/2MiB，单项256KiB，TTL15秒 | 新数据淘汰、auth epoch、关面板abort、手动reset | pending按key共享且15秒截止，未设不同key全局容量；当前面板评论页数组是活动数据 |
| MR / DJ节拍内存 `00-state/03-beat-dj-state.js` | 每模式24项/估算8MiB LRU | 每次写入淘汰，超大拒绝缓存 | currentBeatMap/currentDjBeatMap另持当前项，淘汰不销毁正在用的map；不是音频PCM预算 |
| 节拍磁盘 `server.js` | 96MiB/2000项；单文件8MiB | 启动、成功写入自动prune；读更新mtime | `beatCachePinnedFile`仅最后一次read/write文件，并非严格当前播放列表；手动按钮保留全部（可能用户改过），自动prune却无法区分用户改动。需确认是否所有存储均可再生，不能盲加删除 |
| 本地节拍 `03-local-beat-cache-modal.js` | 本批明确automatic图运行时12个localKey/估算8MiB LRU；持久化自动图最多12，配额退8/5/3 | store/save/关闭分析modal触发trim；自动标记通过pack/unpack保存 | 原运行时无界已修；currentLocalSong/modal/currentBeatMap/currentDjBeatMap pin允许超额。未知旧图/编辑图保护，不自动裁；localBeatMapPrefs完整保留。不是全域8MiB硬cap |
| 前后邻曲预备 `05a-adjacent-preparation.js` | 16/32MiB（低配/普通）；两邻曲，最多1 build+1待build | 切歌allowed集合、5min老化、generation取消、pagehide dispose | bytes估算非GPU实际计量；移交take后归活动场景所有 |
| 歌词磁盘 `desktop/main.js` | 96MiB；单条1MiB | 成功write异步prune，read触碰mtime；手动删除合法版本hash JSON | 未见启动或定时prune；旧目录、失败rename留下`.json.tmp`不在prune/release匹配内。96MiB为写入后目标，可有短暂超量/失败残留 |
| 歌词翻译fallback `06-lyrics/00-lyrics-fetch-parse.js` | 本批成功64项/估算2MiB/单256KiB/30min；miss128项/128KiB/单8KiB/10min；key≤4096 | 本批LRU、timer主动过期、手动reset/generation | 本批已修；超大不入cache仍可当前显示，late结果不能复活；20项相关测试由worker完成 |
| 网易/QQ搜索 `server.js` | 各80项，typed合用120项，TTL2min | 查询过期删同key、插入FIFO，手动release清空 | 条目数不是字节；不同key inflight无总数限额；clear不取消旧消费者，但epoch不再回填 |
| 汽水API `qishui-api.js` | 搜索80/2min；歌词与公开详情各240/30min；feed16/90s；库24/90s；歌单48/90s；会员24/60s；metadata120/20s；playback120/4min（public SEO1min）；cursor12，正会员历史48 | 写入淘汰；账号clear/generation；TTL读时判失效 | TTL失效get返回null不删除旧key，但maxEntries仍限制完成项；各类inflight无统一队列/字节上限 |
| 酷狗API `kugou-api.js` | 搜索120/2min；URL240/15min；歌单/资料/VIP各24/5min；VIP历史24；喜欢文件ID4096；community资源100 | 插入淘汰、账号clear、TTL判定 | 同上条目并非字节、inflight不同key无硬cap |
| 网易歌单索引 `server.js` | 8项/10min | 读/写prune，登出/更新invalidate | 单索引大小依歌单大；inflight不同歌单无统一限额 |
| 换源匹配 `neteaseSourceMatchCache` | 256项，有TTL | 插入FIFO，访问过期删除 | 完成项受控；并非音频本体 |
| 换源可播探测 `controlSourceProbeCache` | 本批64项/256KiB/单32KiB，90s TTL | 成功按歌曲写入 | 本批已补LRU、过期删除、auth/pagehide epoch清理；未知/失败不缓存 |
| AutoMix URL描述符 `cuefieldAudioDescriptorCache` | 本批64项/256KiB/单32KiB，4min TTL | 成功按歌曲写入 | 本批已补LRU、过期删除、auth/pagehide epoch清理；过大URL仍给消费者但不缓存 |
| 封面深度/文字测量 | 深度18项；字体测量64字体×512字符 | 添加淘汰，后台/手动trim | 深度按count非bytes；当前canvas/texture另有所有权 |
| Wallpaper静音pkg | 512MiB/4项/14天 | 准备/复用、清理时prune；active/pending/临时pin保护 | 可保护超额活动文件；非递归、仅hash.pkg；磁盘错误保留 |
| Wallpaper loop | 单录制64MiB、单chunk1MiB；已完成webm目标512MiB；1活动job（begin取消旧） | finish/lease释放自动prune；begin清>2min partial；退出abortAll；现代renderer与范围流显式lease，卸载/进程退出归还 | 本批已修自动prune旧URL200→404：active lease/range流pin，释放后再prune。同key被pin拒绝覆盖。legacy caller保守会话pin；真实active总量>512MiB保留并报overBudgetBytes，因此是软预算。metadata/孤儿json不计512MiB；partial过期非独立timer删 |
| Chromium HTTP缓存 | Chromium自己的缓存策略 | 手动session.clearCache HTTP-only | 没有找到应用配置的disk-cache-size/media-cache-size硬cap；不能声称无限，也不能保证统一固定MB。HTTP cache和cookies/IDB不是一回事 |

## 动态资源、timer与Promise

- 音频节点：路由owner部分构建失败、删除、重建均disconnect自有edge/node、stop自有stream track；定向失败注入测试通过。真正声卡、Chromium AudioContext/GPU的释放时点仍须实机。
- 节拍分析：前端切歌/取消AbortController，worker退出清watchdog、listener并terminate；后端DJ 2活动+2等待，取消移除等待项，实际活动job结束才归还槽。native decodeAudioData/OfflineAudioContext渲染不可硬打断，完成前临时PCM可很大；8MiB结果缓存不限制该峰值。长歌采样率×时长×声道决定临时工作集。
- Worker脚本URL：`musicTempoWorkerUrl`只懒建一次，没有revoke但常驻单例，不是每首增加一条。
- 浏览器本地音频fallback：原`localSongFromAudioFile`只create无revoke。本批只注册自建URL，队列/媒体/详情/收藏/书架/分析/预加载活跃引用pin，异步分析/保存用lease；import、切歌finally、clear/remove队列、modal关闭、lease释放即时调度，单一30秒timer补漏，非BFCache pagehide清理。真正加入内建歌单的URL保留至本页退出；duplicate新URL不pin。桌面协议/他方blob不revoke。此为所有权清理，不删原始文件。
- 背景/首页视频URL：新owner在替换/取消/销毁时revoke，迟到准备不接管新owner。本轮对应synthetic测试包含替换、失败、取消、重复清理；不是真实视频解码器RSS稳定证明。
- 相邻预备/beat/lyrics timers大多保持单owner，切歌清timer/abort；API singleflight只合并同key，不能据此宣称整个app不同key并发有界。
- 后端QQ/网易VIP Map主要随账号/查询用户增长，未看到普适条目cap；不是每首音频缓存，暂列低优先源码风险。网易喜欢列表是当前账号完整集合，规模跟用户资料量，不应静默截断。

## 手动按钮做了什么

UI `releaseMineradioCaches` 前后各重置派生歌词、封面、评论；IPC generation先推进、串行等旧写入、阻止旧结果回填。后台清合法歌词cache、闲置静音包/loop、死PID spill、后端封面/搜索、Chromium HTTP缓存。不会清cookies/localStorage/IDB、账号、偏好、歌单、喜欢、下载、导入媒体、字体、反馈、所有beatmap。汽水完成缓存引用本批也可手动清除，但活动消费者的Buffer不修改/不打断；不是点按钮能立即清零RSS。Windows“整理内存”EmptyWorkingSet只是trim工作集，不能修复JS仍持有引用；面板RSS标签只主进程，不代表renderer/GPU总量。

## 隔离证据

- `spill-before.json`：64KiB预算+不可用磁盘+64×64KiB chunk，peak/pending4MiB（原缺陷）。
- `spill-after.log`：本次12项通过，包括真实localhost流字节一致、磁盘失败慢消费者、partial/zero write、大chunk分片、abort/close解挂、head不钉大backing。
- `cache-growth-audit.cjs` / `.json`：真实module/函数，封面2000次写入最终8/8192字节（缩小配置）；beat2000曲最终24项、活动map不变；spill40次轮流end/abort零残留，死PID孤儿清除；9×64MiB逻辑大小稀疏loop触发prune，已issued旧URL HEAD200→404；1000失败封面trim后仍1000；`.json.tmp`不受final文件匹配清理。
- 本目录 `cache-selected-tests.log` 最新交叉运行18个定向测试文件：116项全部通过（09:14 UTC）。此前shared日志发生过并行歌词helper fixture尚未同步的错误，已由归属worker修正；不得混淆旧失败日志与此轮。该交叉运行之后新增metadata微任务epoch回归，单独9/9通过；最终整合仍需全套获准测试。
- `playback-metadata-after.log`：2000次source/descriptor获取容量稳定、LRU、TTL、重复请求共享、auth epoch晚到拒绝、大URL不留存、200不同key时pending所有权表32、旧finally不删除新owner，8专属+1原source-switch全部通过（含reset发生在fetch微任务前，旧请求不启动）。缓存预算包含key+JSON估算UTF16大小（proxy URL在两个字段中重复计），不限制调用方临时字符串或API全局并发。

## 建议排序

1. 已修spill失败内存无界；合并前独立复审+最终回归。
2. loop已加renderer/range lease并在卸载/进程退出释放；worker新旧合计30项通过，独立复审30/30已通过，仍需最终全套整合。保留活动超额和旧caller会话pin的明确软预算例外。
3. 翻译、本地map、fallback URL、换源/AutoMix小对象、失败封面记录分别补边界，保留用户偏好与当前活动引用。
4. 汽水在途（单项留存例外已修）、活动spill磁盘总额、Chromium缓存以及长期原生峰值应设计单独资源预算与可观测性，不以强行拒绝长音频代替根因分析。
5. 用户导入背景视频IDB与反馈日志本来是持久资料，已知可能增长；仅提供大小/引用关系和可撤销管理，不擅自当cache自动删。

实机验收：Windows隔离配置固定语料连续切歌/AutoMix、长暂停与恢复、网络断连/磁盘写失败、返回旧loop分段读、多小时采样main+renderer+GPU RSS/JS heap/active resources+cache dirs。完成后允许有有限热身平台期和GC波动；不能用短测试通过承诺绝不增长。

本项quick-check通过（日志`qa/cache-growth-20261010/quick-check.log`），Electron runtime smoke明确SKIP，不等于Windows端到端验收。解密缓存worker专属11/11、独立cache+release复审28/28通过；metadata独立9/9、封面global dispose独立21/21通过。数字对应各批次范围，不应相加当作去重总数。

09:16 UTC追加后复测：`qa/cache-growth-20261010/cache-post-review-tests.log` 的6文件49项全过，涵盖最终metadata微任务epoch、spill、汽水超大不缓存与手动release、cache release前后台。`spill-bound-after.json`同一64KiB/64chunk故障盘场景现在峰值/排队均64KiB，观察30ms后主动abort，不留下悬挂。

最终对用户的表述应为：旧歌的主要可再生缓存已自动淘汰，本批补上了多处真实累积和失败路径；播放中资源、用户保存资料会按用途保留，应用并没有统一覆盖所有进程/并发下载/解码峰值/全部磁盘目录的硬上限。历史beatmap与持久IDB媒体不能当垃圾自动删；持久媒体的运行时URL引用应保留到最后owner释放。要证明多小时RSS平台期仍需Windows隔离长跑。

本地资源worker最后冻结：`tests/local-audio-resource-lifecycle.test.js` 17项（500轮导入/500自动图、播放pin、迟到结果、duplicate、关闭、真实remove/clear）以及原定向组合53项通过；最终独立复审/aggregate由整合负责。报告全部专项状态已更新，不再保留在修中的生产范围。

## 最终整合结果

冻结代码完整有界回归：244 个测试文件，243 个执行并通过，0 失败；`login-logout-race.test.js` 按先前取消记录明确 blocked、未执行。TAP 1296 项中1291通过、5项原生平台跳过；旧NSIS包装测试内部的原生步骤也未执行，不计成完整安装器验证。`npm run check` 和差异检查通过，Electron smoke明确跳过。最终证据：`qa/cache-isolation-20261010/full-tests-summary.json`、`full-tests.log`、`npm-check.log` 与独立 `review-summary.md`。该轮已包含最终loop租约校验失败保护和本地资源退休修复；此前定向计数不相加。


## 10:04 UTC追加：持久缓存写入来源核实与歌词失败路径窄修

保留以上原阶段记录。对“节拍自动prune可能删除用户编辑”的待核实项，现已追完当前生产写入链：应用自身写入来自自动音频分析及其缓存复用，未发现实际用户节拍编辑后写入路径。`automaticLocalAnalysis:false`也会由在线歌曲自动分析产生，不能当作编辑证据；不能报告已证实的用户编辑丢失。未知历史/外部手改文件不由本次源码核实背书，现有96MiB/2000项预算及手动保留beatmap均不变。

歌词rename失败残留已隔离复现，并窄修为带PID和随机后缀的独占wx临时写，在finally只删除本次确证创建的文件；旧final保留、活跃写不扫、历史固定.tmp不猜删。硬杀及unlink权限失败残留仍明确延后。7项正式专项与原有release/UI/root-fallback组合26项通过；生产主进程仅改该写入段及相应测试fixture。完整证据和调用链见 `docs/QA_PERSISTENT_CACHE_2026-10-10.md` 与 `qa/persistent-cache-20261010/production-test.log`，不替代Windows实机验收。
