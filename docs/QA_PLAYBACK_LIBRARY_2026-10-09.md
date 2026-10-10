# 播放、曲库、歌单、歌词与音频图二轮审查（2026-10-09）

## 结论与证据边界

已确认并最小修复 17 项 P2，未确认 P0/P1。重点是跨 await 的媒体/队列/分析所有权、歌单删除边界和恢复持久化。并非每个文件都已逐行审完；下方逐文件 ledger 明确区分完整读审、定点读审和索引/模式扫描，未读部分不得标通过。

- 起始基线 `451b6cf`，冻结目录 `../audit-baselines/20261009-2106`；before 证据来自各项最小修改之前的生产函数/工作树，不声称所有 before 与冻结字节完全相同。期间 root 提交第一批为 `5bc4f03`，当前后续修改尚未提交。
- 只用了 Node VM 真实经典脚本函数、临时曲库/伪账号和现有隔离回归；未接触真实用户库/账号，未发布或推送。
- 当前共享树最终定向子测试 **377/377 通过**（记录 `docs/qa/playback-library-regression-2026-10-09.log`，2026-10-09 22:09 UTC）。包括播放/队列/歌单/本地/输出路由/AutoMix/麦克风/歌词/节拍所有权及其他负责人新回归；这是选定测试集，不是 Electron 主应用验收。
- `npm run check` 本组最后一次成功启动并返回 session 53349，但 poll 返回 `automatic approval review was cancelled`，日志停在 Wallpaper Engine guard，无最终退出状态，**未标通过且未重试**。精确调用与原结果见 `docs/qa/playback-library-check-tool-status-2026-10-09.json`；截断 log 为 `docs/qa/playback-library-check-2026-10-09.log`。前轮播放相关 guard 已通过，主审完整 check 以其另有终态的证据为准。
- Electron 真实主应用因 Unix socket `EPERM`，root 已普通/升级重试均受阻；本组没有绕过。Windows 输出设备、采集 fallback、真实 AudioContext/CORS/长后台、真实平台会员与长时间 AutoMix、实际听感/鼠标手感未验证。

## 模块分组与调用链

1. **播放入口/队列**：搜索/歌单详情/播客/本地导入/System Media Session → `loadPlaylistIntoQueueById`/`importLocalAudioSongs`/队列动作 → `playQueueAt` → `trackSwitchToken` + 取链 owner → provider quality/URL → 有界换源事务 → Audio 图重置/输出设备 → `playAudio` → 进度、listen session、checkpoint、歌词。ended → 普通 next / 单曲 repeat / gapless / Cuefield。queue reorder 的 `_queueOrder` 与物理 shuffle 分开，退出 shuffle/重启恢复按逻辑序。
2. **持久化**：renderer built-in page/delete → preload IPC → `desktop/built-in-playlist-library.js` 串行 mutate + 原子 rename → 摘要/分页状态；checkpoint format → localStorage/disk 选新 → queue/local hydrate。local import → metadata/cover/LRC/content hash → index → resolver/本地协议可用性与内容校验。缺失条目不能静默用未保存的邻曲或库中无关文件代替。
3. **歌词**：persistent cache/API/fallback → LRC/YRC/翻译对齐 → 原始/自定义 lyric state → display payload/offset → lyric work scheduler →纹理/mesh/stage 渲染 → seek/暂停/恢复；desktop overlay 经 IPC 单独输出。fetch/parse 主链读审，GPU 视觉大文件目前只能按 ledger 的定点/扫描状态描述。
4. **音频图/预载**：08 audio source/capture/Analyser/Gain → output routing → 13 gapless owner/Audio 预载 → adoption/dispose；16 AutoMix prepare → Cuefield cache-only planner →17 timeline/bridge/loop →18 delay/actions/crossfade/handoff/fallback；19 microphone grant/getUserMedia/stream release 与 music mixer graph →20 UI。双 Audio 在预载交叉混音时是有意设计，过期未接管 deck 必须停/卸载，已接管 active deck 不能被旧 cleanup 停掉。
5. **节拍**：worker/cache/prefetch/adjacent budget → MR/DJ decode/band render →本地分析 modal → token guarded map install → runtime cursor；full PCM fetch/decode 上界和长音频内存仍需实际设备压力测试。
6. **交叉所有权**：收藏账号 epoch/后台缓存由平台审查报告；详情收藏迟到状态与输出面板 focus 由 UI 报告；main/preload 协议/权限由 desktop 报告；并未因为它们属于本组链路就声称本组全文审完。

## 确认问题（P0–P3）

以下全部为 **P2，已修复并有运行 before/after**。行号为当前文件，目录前缀 `public/js/modules/` 省略；共享工作树后续改变可能令行号移动。

### PBL-01 · P2 · 内置歌单删除后未加载尾页消失

- 位置：`06-lyrics/00-built-in-playlists.js:139-173`
- 复现：120 首歌单只载入 96 首，删除第 1 首，再继续滚动。
- 影响/修复前实际证据：磁盘 119 首但 UI total=95、hasMore=false，剩余 24 首无法继续加载。
- 根因：把已加载 tracks.length 当成持久化总数，同时删除未失效旧分页请求。
- 建议与实际修复：按返回 playlist.trackCount 更新 total/offset/hasMore，失效详情页请求。
- 修复后证据：after disk=119、rendererTotal=119、hasMore=true、nextOffset=95。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-library-before-2026-10-09.log` / `playback-library-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-02 · P2 · 内置歌单删除双击误删相邻歌曲

- 位置：`06-lyrics/00-built-in-playlists.js:139-173；06-lyrics/02-playlist-detail.js:789-801`
- 复现：在第 1 个删除 IPC 完成前再点同一删除按钮。
- 影响/修复前实际证据：本想删 id=2，实际同时删 id=2、3；这是歌单记录删除，不是原音频文件删除。
- 根因：位置型删除请求无 busy/详情对象所有权锁，第二请求的同 idx 已指向下一项。
- 建议与实际修复：每个歌单串行 busy，校验 idx，并只更新原详情对象；失败 finally 解锁。
- 修复后证据：after 只删 id=2，第一剩余 id=3；失败/新详情回归均通过。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-library-before-2026-10-09.log` / `playback-library-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-03 · P2 · 旧歌单尾页 next await 改变新选中歌曲

- 位置：`05-playback/14-player-controls.js:730-749`
- 复现：在旧队列末尾点下一首，尾页 pending 时另选新队列 C，再释放旧请求。
- 影响/修复前实际证据：新 C 被改成 B 并播放；重复 next 也可能多推进。
- 根因：hydrate 后只使用全局 currentIdx，没有等待前 queue/state/token/entry 所有权。
- 建议与实际修复：捕获四重所有权及原 tail idx，过期 completion 不改变当前选择。
- 修复后证据：after C 保持 C，starts=[]；双 next 单次推进。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-library-before-2026-10-09.log` / `playback-library-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-04 · P2 · 清空队列继续播旧音频并允许磁盘检查点复活

- 位置：`05-playback/14-player-controls.js:806-850`
- 复现：播放时明确确认清空队列，检查 audio 和 checkpoint；再模拟旧取链完成。
- 影响/修复前实际证据：queue=[] 但旧 src 仍播放，token 不变，未写空磁盘存档，重启可恢复已清项目。
- 根因：clear 只清 UI/数组/localStorage，缺少音频/取链/预载/恢复任务和持久层生命周期。
- 建议与实际修复：保留确认边界；停止解绑 src、递增 token、取消来源/恢复/分析/预载并强制空 checkpoint；最后一项删除复用 clear。
- 修复后证据：after src=""、paused=true、token7→8，abort+saved；queue-removal 回归。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-navigation-before-2026-10-09.log` / `playback-navigation-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-05 · P2 · 旧首批歌单或播客请求覆盖新队列

- 位置：`06-lyrics/03-podcast-playlist-loaders.js:37-116、243-305`
- 复现：先加载慢歌单/播客，再加载新歌单或手动选歌，然后完成旧请求。
- 影响/修复前实际证据：旧返回替换 playQueue 并 autoplay，或旧 finally 隐藏新加载状态。
- 根因：首批 await 无独立请求 serial/queue/index/track token 所有权。
- 建议与实际修复：统一 queue load owner，提交前/播放后/异常与 UI 收尾均检查；分页取消令 owner 失效。
- 修复后证据：after new-selection 不变且 starts=[]；playlist/podcast 交叉回归。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-navigation-before-2026-10-09.log` / `playback-navigation-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-06 · P2 · 进度拖动 pointercancel 后原来播放的歌永久暂停

- 位置：`06-lyrics/04-progress-seek.js:493-526`
- 复现：播放中 pointerdown 进度条，然后 OS pointercancel；同时测试切歌/原来 paused。
- 影响/修复前实际证据：pointerdown pause 后取消路径只恢复增益，不恢复播放。
- 根因：取消分支没有保存/恢复拖动前播放意图，且不能随意播放当前全局 audio。
- 建议与实际修复：仅原来在播、同 media/src/token 时恢复；旧媒体或原 paused 不恢复。
- 修复后证据：after same current media paused=false；切歌和原 paused 无 play。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-navigation-before-2026-10-09.log` / `playback-navigation-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-07 · P2 · AutoMix 旧 prepare rejection 清掉新 ready plan

- 位置：`05-playback/16-cuefield-automix-core.js:287-294`
- 复现：旧 A→B planning pending，reset 后新 B→C ready，再 reject 旧 planning。
- 影响/修复前实际证据：新 C pending 被清空，status 改 error。
- 根因：成功 await 有 serial guard，catch 却无。
- 建议与实际修复：catch 先校验 serial，旧 rejection 返回 stale。
- 修复后证据：before ready C→null/error；after C 保持 ready，oldResult=stale。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/automix-ownership-before-2026-10-09.log` / `automix-ownership-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-08 · P2 · 本地检查点恢复丢混合队列、shuffle，并带回无关导入曲目

- 位置：`05-playback/09-queue-snapshot-autoplay.js:99-135；06-lyrics/05-upload-dragdrop.js:77-184`
- 复现：存 [local A,qq B,local C] shuffle；曲库另有 D；重启恢复。
- 影响/修复前实际证据：原逻辑恢复 [A,C,D] loop；已从队列删除但仍在库里的 D 又出现。
- 根因：本地 current 专用分支丢 queue/mode，随后把完整库索引当保存队列。
- 建议与实际修复：所有来源统一 checkpoint 还原，仅 hydrate 保存队列；保留离线记录身份，已从库删除项剔除、仅保存后继可接任且进度清零；继续使用既有 backend 内容指纹。
- 修复后证据：after [A,B,C]/shuffle；在线 current 混合、离线/删除、late resolver 4 项回归。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-restore-before-2026-10-09.log` / `playback-restore-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-09 · P2 · await 中重排队列覆盖邻曲（本地/主取链/普通换源/汽水补全）

- 位置：`05-playback/13-playback-start-audio.js:948-1027、1113-1124、1329、1676；05-playback/11-provider-fallback.js:707-814、986-1092`
- 复现：B idx1 取链/resolver/fallback pending，移动 B 到 idx0 [B,A,C]，再完成旧请求。
- 影响/修复前实际证据：本地变 [B,B,C]；普通/汽水 fallback 变 [B,B-full,C]，A 被覆盖；固定 idx ownership 会误判仍合法的重排。
- 根因：token 仅表示切歌，不表示列表位置；引用 idx 跨 await 已过期。
- 建议与实际修复：同 queue、同 live entry、同 token 时用 currentIdx 重新定位；不同 owner 不提交。后续独立集成复核发现严格 candidate guard误拒绝nested合法rollback：用本次唯一rollbackOwner，由实际restore记录queue/entry/token receipt，只有同owner可继续下平台；新选曲/新token/新queue/同key新entry均拒绝。保留 opts 音质/进度，无人为重启。
- 修复后证据：after 本地 [B,A,C]，换源 [B-full,A,C] idx0；nested失败before仅qq无skip，after qq→kugou→skip，四种接管负例只qq不继续；Qishui preview/recording identity回归通过。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/local-reorder-before-2026-10-09.log` / `local-reorder-after-2026-10-09.log`；`docs/qa/fallback-reorder-before-2026-10-09.log` / `fallback-reorder-after-2026-10-09.log`；`docs/qa/fallback-rollback-owner-before-2026-10-09.log` / `fallback-rollback-owner-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-10 · P2 · AutoMix 旧 execution 收尾清掉新执行 busy/UI

- 位置：`05-playback/18-cuefield-automix-integration.js:953-1101`
- 复现：旧执行分别卡 output、play、timeline、handoff await，reset 并启动新执行，然后释放/拒绝旧 await。
- 影响/修复前实际证据：四分支均把新 executing=true 清 false；旧 play rejection 还把新 UI 改 error 并提示失败。
- 根因：清理全局 busy/UI 未要求 activeTransitionContext 属于自己；旧 fallback 也可能干扰已接管媒体。
- 建议与实际修复：只释放自己 context 的 busy/UI/恢复；旧未接管预载仍 dispose，不触已接管当前媒体或新 fade；fallback/feedback 加 context owner。
- 修复后证据：after 四种 executing=true、sameNewOwner=true、lastUi=handoff、无旧提示，仅 old-incoming 被 stop。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/automix-execution-before-2026-10-09.log` / `automix-execution-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-11 · P2 · ended 的 0ms 延迟推进跳过新歌或重复推进

- 位置：`05-playback/13-playback-start-audio.js:936-944、1004、1482`
- 复现：旧歌 ended 排定 timeout 后立即手动选新歌，或重复 ended，测试 loop/single。
- 影响/修复前实际证据：loop 额外 next；single 对新 idx 再播放；duplicate ended 可执行 2 次。
- 根因：onended 入口检查 token，但延迟 callback 不检查；普通播放与 gapless/Cuefield guard 不一致。
- 建议与实际修复：共用延期推进 helper 检查 token/media/queue/live entry；单曲/普通推进策略仍原样。
- 修复后证据：after 新选歌 calls=[]；重复 ended calls 仅一次，4 回归。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-ended-before-2026-10-09.log` / `playback-ended-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-12 · P2 · 慢本地导入和导入后封面 completion 改写新选择

- 位置：`06-lyrics/05-upload-dragdrop.js:290-370`
- 复现：旧 import IPC pending 时手选新歌后完成导入；另在导入 play pending 时手选新歌再完成 play。
- 影响/修复前实际证据：旧导入替换新队列 autoplay；旧 coverFile 被写给新歌。
- 根因：文件 IPC 和 cover continuation 都无 queue/token ownership。
- 建议与实际修复：接入已有 queue load owner；旧导入结果保留磁盘操作结果但不提交新队列/提示/会话 blob；封面只绑定原 queue/song/token。
- 修复后证据：after 新队列均保持 new-selection；旧 import starts=[]、旧 cover=[]，2 回归。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/local-import-ownership-before-2026-10-09.log` / `local-import-ownership-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-13 · P2 · 旧本地节拍分析 reject 改写新分析状态

- 位置：`03-beat/03-local-beat-cache-modal.js:354-364`
- 复现：启动 MR decode，取消/切歌后启动 DJ，再 reject 旧 MR。
- 影响/修复前实际证据：新 DJ active 被清 false，状态变分析失败；可能允许再点启动创建重叠任务。
- 根因：await 成功分支有 local/map token guard，catch 没有。
- 建议与实际修复：catch 同样校验 local token 与所选 MR/DJ map token，不改分析参数。
- 修复后证据：before active=false/fail；after active=true/DJ 分析准备中，回归通过。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/local-analysis-ownership-before-2026-10-09.log` / `local-analysis-ownership-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-14 · P2 · 跨账号旧歌单目录/失败回填及 force refresh 错误复用

- 位置：`06-lyrics/01-playlist-panel-shell.js:529-540、576-662、712-804`
- 复现：账号 A 列表 pending，providerAuthEpoch 0→1 后账号 B loggedIn=true；保持 root token 或 1200ms 内 force refresh，再释放旧成功/失败。
- 影响/修复前实际证据：旧 A-private 回填，或旧网络失败写当前 error；force refresh 仍 token1、没有发 B 请求。
- 根因：只有 root token+loggedIn；同平台新账号仍 true，1200ms复用不检查 authorization epoch。
- 建议与实际修复：page 入口先拒绝旧 state epoch/accountKey，不重标旧分页归属；success/catch/finally 同 root/state/auth epoch+实时accountKey 屏障；epoch 变更绕过 loading 与非force缓存复用；切账号清旧 rows，同账号网络失败保留；播客目录也校验网易 epoch。
- 修复后证据：after 无refresh rows=[]/error空；立即refresh token2、仅 B-public/error空；23 条目录回归通过；cache-before/after 证明 [A-cached-private,B-public]→[B-public]；旧 background offset50 页在入口拒绝并保留原归属，新账号root正常分页/同账号force失败保留通过。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playlist-catalog-epoch-before-2026-10-09.log` / `playlist-catalog-epoch-after-2026-10-09.log`；`docs/qa/playlist-catalog-cache-before-2026-10-09.log` / `playlist-catalog-cache-after-2026-10-09.log`；`docs/qa/playlist-catalog-page-owner-before-2026-10-09.log` / `playlist-catalog-page-owner-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-15 · P2 · 长本地/汽水及显式毫秒的 duration 单位错误

- 位置：`06-lyrics/04-progress-seek.js:149-167；05-playback/11-provider-fallback.js:836-850`
- 复现：输入 local 或 Qishui duration=1800s；durationMs=800ms；Qishui匹配 duration=18000s。
- 影响/修复前实际证据：前三分别归一为1.8s/1.8s/800s；长汽水匹配变18s，影响metadata未就绪进度和歌词/录音匹配。
- 根因：数值阈值猜单位，忽略本地metadata与汽水归一化契约和显式ms字段。
- 建议与实际修复：known local/Qishui duration保留秒，durationMs/dt明确除1000；普通在线与未知duration启发式保留；不动seek/glide时序。
- 修复后证据：after 1800/1800/.8/18000；普通网易205423仍205.423；26时长/checkpoint/Qishui回归通过。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/playback-duration-before-2026-10-09.log` / `playback-duration-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-16 · P2 · 首页个人推荐前后端跨账号归属丢失

- 位置：`05-playback/03-home-discover-weather.js:162-215；server.js:1864-1929、5440-5451`
- 复现：前端 A home pending，B 登录再 force load，释放/拒绝 A；后台分别在 getLoginInfo 或3推荐任务 await 期间 A→B。
- 影响/修复前实际证据：前端新load被loading直接吞，A-song/A-private填B UI；后台login await后用B cookie返回user=A，或旧A私有推荐以200返回新会话。
- 根因：前端仅home token且loading不区分auth；后台getLoginInfo与后续userCookie/结果不绑定同session。
- 建议与实际修复：前端auth epoch+公开账号身份屏障、仅同owner去重和缓存；账号变化清个人推荐，同账号force失败保留。后台复用capture/checkNeteaseAccountSession，绑定snapshot.cookie，login/result/catch变更409，原starter200与推荐顺序/数量保留。
- 修复后证据：前端无refresh旧结果/错误均不提交且不卡loading；B refresh请求2次只留B；后台4跨账号场景409/no private payload；12新回归及首页66条通过。后端原始证据另见home-discover-server-ownership-before/after日志。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/home-discover-ownership-before-2026-10-09.log` / `home-discover-ownership-after-2026-10-09.log`；`docs/qa/home-discover-server-ownership-before-2026-10-09.log` / `home-discover-server-ownership-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

### PBL-17 · P2 · 登录首次提交代次缺口及目录/首页自失效顺序

- 位置：`08-account/03-login-modal-flows.js:1438-1498、1573-1599、1861-1914、1916-1968、2007-2075、2081-2135、2145-2186、2192-2245；06-lyrics/01-playlist-panel-shell.js:584-602`
- 复现：汽水QR成功安装B后完成旧status A成功/失败；网易首次803安装B、500ms fresh窗口内完成旧A；另执行网易/QQ/酷狗web与cookie成功流程。
- 影响/修复前实际证据：汽水成功B被覆A或B被标stale；网易首次803 B被覆A；旧mark位于目录/首页启动之后，严格新auth屏障使网易自己的首页请求loaded=false/songs=[]。
- 根因：汽水绕过beginRendererLoginAttempt/markProvider的epoch；网易epoch直到delayed fresh后才失效；登录成功刷新与epoch更新顺序相反。
- 建议与实际修复：汽水QR开始/新status安装后各失效旧授权，不触本poll generation；网易首次803立即失效，fresh同session只连接workflow不二次递增；所有相关成功路径安装status→connected/epoch→目录/首页。目录await后增加独立公开accountKey屏障。
- 修复后证据：汽水success/error均B/epoch1且只有原450ms timer；网易首次803 B→B/epoch1、500ms保留；6条web/cookie先connected后catalog，网易真实home B-daily loaded=true；fresh同epoch请求通过。独立reviewer再跑通过。原音质、shuffle 策略、AutoMix 动作/时序与恢复进度未调整。
- 原始证据：`docs/qa/qishui-login-catalog-owner-before-2026-10-09.log` / `qishui-login-catalog-owner-after-2026-10-09.log`；`docs/qa/netease-first-qr-owner-before-2026-10-09.log` / `netease-first-qr-owner-after-2026-10-09.log`；`docs/qa/login-success-order-before-2026-10-09.log` / `login-success-order-after-2026-10-09.log` 与对应隔离 fixture（本组 `docs/qa/*-audit-fixtures.cjs`，PBL17另用 `independent-integration-fixtures.cjs`）。真实设备/平台与听感未验证。

## 非通过项、待验证与风险线索

- Cuefield 纯 planner 大文件和歌词 GPU 渲染大文件尚未本组逐行全部读审，只有索引/模式与隔离回归；它们已有独立负责人做全文深审及新回归，其结论须并入对应报告。
- session-only `localSongFromAudioFile` 创建 blob URL，未发现队列移除/清空统一 revoke；这是静态生命周期风险线索，尚未做 renderer 堆/真实浏览器 retaining 复现，不能宣称已确认内存泄漏量或已修。
- MR/DJ 仍会下载/解码完整输入；band 渲染已一波段释放且取消回归通过，但超长/损坏音频的下载、decode 峰值未实测。planner cache/miss 过期清理数量边界亦未压测。
- store 使用临时文件/rename 防半写，但断电/fsync/损坏主索引/磁盘满/Windows 文件锁真实恢复未做；不把 Node 正常写回测试当断电恢复通过。
- 删除只涉及内置歌单记录/保存队列；原音频物理文件没有删除测试或生产改动。确认取消清空边界保留。
- 收藏/账号切换旧结果、平台私有列表 index cache、焦点/键盘缺陷交叉报告归各负责人；本报告不重复记作本组独立修复。

## 逐文件覆盖 ledger

机器版：`docs/QA_PLAYBACK_LIBRARY_LEDGER_2026-10-09.json`（当前 SHA、范围、直接测试引用和未验）。以下测试名是**已执行的关联测试**，其中可能含静态断言；并不推断该文件每个函数均运行。无直接测试不由传递 require 链冒充实测。跨组文件的全文结论以对应独立报告为准。

| 文件 | 行数 | 实际静态覆盖 | 关联已执行测试 | 未验证 |
| --- | ---: | --- | --- | --- |
| `audio-spill-relay.js` | 240 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/adapter-mineradio.js` | 186 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/boundary-evidence.js` | 104 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/bridge-planner.js` | 202 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/cue-profile.js` | 223 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/feedback-log.js` | 471 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/lrc-anchors.js` | 135 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/lyric-link.js` | 108 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/mineradio-bridge.js` | 717 | 定点/部分读审：导出/planCuefieldTransitionFromCache/尾部契约；未逐行全读 | `cuefield-transition-runtime.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/musical-profile.js` | 189 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/planner-contracts.js` | 81 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/recipe-planner.js` | 1304 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/section-candidates.js` | 346 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/shadow-diagnostics.js` | 213 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/structure-map.js` | 307 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/transition-artifact.js` | 213 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/transition-evaluator.js` | 273 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/transition-router.js` | 218 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/transition-window-planner.js` | 1371 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `cuefield/version.js` | 94 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `desktop/built-in-playlist-library.js` | 295 | 完整读审：全文件（分段合并） | `built-in-playlist-library.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `desktop/local-music-library.js` | 874 | 完整读审：全文件（分段合并） | `local-alternate-fingerprint-cache.test.js`, `local-library-offline-relink.test.js`, `local-music-library-persistence.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `desktop/main.js` | 6616 | 定点/部分读审：相关 local/built-in/checkpoint/lyric/beat IPC 与协议调用索引；非全文 | `built-in-playlist-library.test.js`, `local-music-library-persistence.test.js`, `microphone-permission.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `desktop/microphone-permission.js` | 133 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `microphone-permission.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `desktop/playback-checkpoint-store.js` | 64 | 完整读审：全文件（分段合并） | `playback-checkpoint.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `desktop/preload.js` | 201 | 定点/部分读审：相关 local/built-in/checkpoint/lyric IPC API 调用索引；非全文 | `built-in-playlist-library.test.js`, `local-music-library-persistence.test.js`, `microphone-permission.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/desktop-lyrics.html` | 1237 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/02-visual/02-lyrics-state-layout.js` | 111 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/02a-lyric-work-scheduler.js` | 91 | 完整读审：全文件（分段合并） | `lyric-work-scheduler.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/03-lyrics-star-river.js` | 227 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/05-lyrics-fonts-texture.js` | 355 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `lyric-spacing-stability.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/02-visual/07-lyrics-palette-text-utils.js` | 581 | 完整读审：全文件（分段合并） | `adjacent-preparation.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/08-lyrics-display-modes.js` | 154 | 完整读审：全文件（分段合并） | `lyric-motion-profiles.test.js`, `lyric-spacing-stability.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/09-lyrics-payloads.js` | 219 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/10-lyrics-mask-textures.js` | 951 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `lyric-runway-preparation.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/02-visual/11-lyrics-shaders.js` | 160 | 完整读审：全文件（分段合并） | `lyric-motion-profiles.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/12-lyrics-row-layers.js` | 1998 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `lyric-active-line-viewport-fit.test.js`, `lyric-drag-quality.test.js`, `lyric-runway-preparation.test.js`, `lyric-spacing-stability.test.js`, `lyric-track-seek-glide.test.js`, `lyric-work-scheduler.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/02-visual/12a-lyrics-edit-preview.js` | 222 | 完整读审：全文件（分段合并） | `lyric-edit-preview.test.js`, `lyric-work-scheduler.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/02-visual/13-lyrics-mesh-build.js` | 503 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `lyric-spacing-stability.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/02-visual/14-stage-lyrics-rendering.js` | 4129 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `lyric-edit-preview.test.js`, `lyric-runway-preparation.test.js`, `lyric-seek-visibility.test.js`, `lyric-spacing-stability.test.js`, `lyric-style-refresh.test.js`, `lyric-title-handoff.test.js`, `lyric-work-scheduler.test.js`, `paused-lyric-edit-commit.test.js`, `paused-lyric-layout.test.js`, `playback-load-recovery.test.js`, `stage-lyric-background-restore.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js` | 467 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/03-beat/01-audio-beat-analysis.js` | 783 | 完整读审：全文件（分段合并） | `beat-analysis-memory.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/03-beat/02-podcast-dj-analysis.js` | 826 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/03-beat/03-local-beat-cache-modal.js` | 365 | 完整读审：全文件（分段合并） | `local-analysis-ownership.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/03-beat/04-beat-map-runtime.js` | 125 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/03-beat/05-cover-loading-crop.js` | 515 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `local-music-library-persistence.test.js` | 真实 renderer/设备/平台；未读部分 |
| `public/js/modules/03-beat/05a-adjacent-preparation.js` | 199 | 完整读审：全文件（分段合并） | `adjacent-preparation.test.js`, `playlist-cover-loader.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/03-beat/06-sonic-audio-monitor.js` | 736 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/00-api-quality-output.js` | 1287 | 完整读审：全文件（分段合并） | `audio-output-routing.test.js`, `audio-route-drag.test.js`, `playback-network-ownership.test.js`, `provider-login-state-recovery.test.js`, `quality-chip-local-track.test.js`, `quality-preset.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/01-cover-custom-map.js` | 134 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/02-listen-stats.js` | 370 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/03-home-discover-weather.js` | 215 | 完整读审：全文件（分段合并） | `home-discover-ownership.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/03a-home-dashboard.js` | 1400 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `content-provider-priority.test.js`, `home-daily-recommendation-virtualization.test.js`, `home-dashboard-update.test.js`, `home-hero-mp4-platform-recommend.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/04-home-empty-wallpaper.js` | 438 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `content-provider-priority.test.js`, `home-daily-recommendation-virtualization.test.js`, `local-music-library-persistence.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/05-home-actions.js` | 65 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/06-track-detail-lyrics-actions.js` | 2071 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | `built-in-playlist-library.test.js`, `lyric-style-refresh.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/06a-comment-replies.js` | 127 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/06b-comment-avatars.js` | 118 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/06c-search-pinyin.js` | 152 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/07-search.js` | 2338 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/08-audio-graph-controls.js` | 807 | 完整读审：全文件（分段合并） | `playback-audio-graph-recovery.test.js`, `playback-pause-cancellation.test.js`, `playback-single-repeat-loop.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/09-queue-snapshot-autoplay.js` | 341 | 完整读审：全文件（分段合并） | `playback-checkpoint.test.js`, `queue-logical-order.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/09a-playback-checkpoint.js` | 22 | 完整读审：全文件（分段合并） | `playback-checkpoint.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/10-queue-actions.js` | 150 | 完整读审：全文件（分段合并） | `queue-logical-order.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/11-provider-fallback.js` | 1128 | 完整读审：全文件（分段合并） | `fallback-reorder-ownership.test.js`, `fallback-rollback-ownership.test.js`, `playback-duration-units.test.js`, `playback-network-ownership.test.js`, `playback-source-fallback-transaction.test.js`, `qishui-trial-full-source.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/12-playback-switch-core.js` | 188 | 完整读审：全文件（分段合并） | `playback-checkpoint.test.js`, `playback-load-recovery.test.js`, `playback-network-ownership.test.js`, `queue-removal.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/13-playback-start-audio.js` | 1739 | 完整读审：全文件（分段合并） | `local-music-library-persistence.test.js`, `local-playback-skip-notice.test.js`, `playback-ended-ownership.test.js`, `playback-network-ownership.test.js`, `playback-single-repeat-loop.test.js`, `playback-source-fallback-transaction.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/14-player-controls.js` | 948 | 完整读审：全文件（分段合并） | `local-music-library-persistence.test.js`, `playback-background-resume.test.js`, `playback-pause-cancellation.test.js`, `playback-single-repeat-loop.test.js`, `playback-source-fallback-transaction.test.js`, `playback-start-stall.test.js`, `playlist-mutation-lifecycle.test.js`, `queue-logical-order.test.js`, `queue-removal.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/14a-system-media-session.js` | 111 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/15-control-glass-animations.js` | 1034 | 索引/模式扫描：加载顺序、函数/await/token/缓存/释放模式；没有逐行全读 | 无本组直接运行证据 | 跨组全文/真实 renderer/设备/平台；未读部分 |
| `public/js/modules/05-playback/16-cuefield-automix-core.js` | 373 | 完整读审：全文件（分段合并） | `cuefield-mineradio-integration.test.js`, `cuefield-transition-runtime.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/17-cuefield-timeline-executor.js` | 314 | 完整读审：全文件（分段合并） | `cuefield-mineradio-integration.test.js`, `cuefield-transition-runtime.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/17a-cuefield-bridge-engine.js` | 177 | 完整读审：全文件（分段合并） | `cuefield-mineradio-integration.test.js`, `cuefield-transition-runtime.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/17b-cuefield-source-loop.js` | 99 | 完整读审：全文件（分段合并） | `cuefield-mineradio-integration.test.js`, `cuefield-transition-runtime.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/18-cuefield-automix-integration.js` | 1105 | 完整读审：全文件（分段合并） | `cuefield-execution-ownership.test.js`, `cuefield-mineradio-integration.test.js`, `playback-single-repeat-loop.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/19-microphone-mixer-runtime.js` | 197 | 完整读审：全文件（分段合并） | `microphone-mixer.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/05-playback/20-microphone-mixer-ui.js` | 212 | 完整读审：全文件（分段合并） | `microphone-mixer-ui.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/00-built-in-playlists.js` | 209 | 完整读审：全文件（分段合并） | `built-in-playlist-library.test.js`, `playlist-mutation-lifecycle.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/00-lyrics-fetch-parse.js` | 672 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/01-playlist-panel-shell.js` | 810 | 完整读审：全文件（分段合并） | `content-provider-priority.test.js`, `playlist-catalog-epoch.test.js`, `playlist-catalog-page-owner.test.js`, `playlist-catalog-recovery.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/01a-scroll-motion.js` | 123 | 完整读审：全文件（分段合并） | 无本组直接运行证据 | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/02-playlist-detail.js` | 823 | 完整读审：全文件（分段合并） | `built-in-playlist-library.test.js`, `content-provider-priority.test.js`, `playlist-catalog-recovery.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/03-podcast-playlist-loaders.js` | 355 | 完整读审：全文件（分段合并） | `built-in-playlist-library.test.js`, `playlist-mutation-lifecycle.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/04-progress-seek.js` | 558 | 完整读审：全文件（分段合并） | `playback-duration-units.test.js`, `playback-source-fallback-transaction.test.js`, `playlist-mutation-lifecycle.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/05-upload-dragdrop.js` | 401 | 完整读审：全文件（分段合并） | `local-import-ownership.test.js`, `local-music-library-persistence.test.js`, `playback-local-restore-lifecycle.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/06-lyrics/06-lyric-timing-offset.js` | 266 | 完整读审：全文件（分段合并） | `paused-lyric-edit-commit.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `public/js/modules/08-account/02-login-status.js` | 710 | 定点/部分读审：111-150 网易状态、429-498 汽水 normalize/status、其余账号读守卫定位；非全文 | `login-commit-ownership.test.js`, `provider-login-state-recovery.test.js` | 真实 renderer/设备/平台；未读部分 |
| `public/js/modules/08-account/03-login-modal-flows.js` | 2239 | 定点/部分读审：1-64 auth/attempt、1438-1650 QR、861-866 mark、1861-2240 网易/QQ/酷狗提交顺序；其余索引，非全文 | `login-commit-ownership.test.js`, `provider-login-state-recovery.test.js` | 真实 renderer/设备/平台；未读部分 |
| `public/js/playback-checkpoint-format.js` | 47 | 完整读审：全文件（分段合并） | `playback-checkpoint.test.js`, `queue-logical-order.test.js` | 真实 renderer/设备/平台；长时间与故障压力 |
| `server.js` | 7248 | 定点/部分读审：handleDiscoverHome(1864-1929)、mapDailyRecommendationSongs、capture/checkNeteaseAccountSession 与 discover HTTP route(5440-5451)全文；其他播放/歌词/节拍/Cuefield 路由索引；非全 server | `cuefield-mineradio-integration.test.js`, `home-daily-recommendations-backend.test.js`, `home-discover-ownership.test.js`, `playlist-paging.test.js`, `provider-login-state-recovery.test.js` | 跨组全文/真实 renderer/设备/平台；未读部分 |

## 最终验证记录

原始定向 log 见 `docs/qa/playback-library-regression-2026-10-09.log`；新增 fixture 会保留修复前字节行为输出，不在测试中削弱旧安全断言。登录order before明确为5bc4f03旧登录函数配当前严格home guard的隔离重放，记录集成自取消，不假称整个冻结基线原本具有此缺陷。独立reviewer终态输出为 `docs/qa/independent-integration-after-2026-10-09.log`，含QR成功、同epoch目录、首次803、真实网易成功+home及nested rollback四种接管负例。PBL11 旧 `else setTimeout(nextTrack, 0)` 字面断言改为本地/在线均调用守卫 helper + helper 内 media/token 和 next 行为断言，并增加运行回归；progress guard 同样换为更强的 token+media 条件，不删除安全要求。


生产与测试已于 2026-10-09 22:07 UTC 冻结。本组当前源码修改范围：`03-beat/03`；`05-playback/03-home-discover-weather、09、11、13、14、16、18`；`06-lyrics/00-built-in、01-shell、03-podcast、04-progress、05-upload`；`08-account/03-login-modal-flows`；`server.js`（仅 discover home helper/route）。本组静态 guard 更新为 `scripts/quick-check.js` 的 progress token/media 等效条件，其他共享改动以主审归属为准。

最终定向命令（377/377，2026-10-09 22:09 UTC）：

```sh
node --test tests/playback*.test.js tests/queue*.test.js tests/playlist*.test.js   tests/built-in-playlist-library.test.js tests/local-*.test.js   tests/audio-output-routing.test.js tests/audio-route-drag.test.js tests/cuefield*.test.js   tests/microphone*.test.js tests/lyric*.test.js tests/paused-lyric*.test.js tests/stage-lyric*.test.js   tests/sonic-workshop-audio.test.js tests/fallback-reorder-ownership.test.js   tests/fallback-rollback-ownership.test.js tests/qishui-trial-full-source.test.js   tests/beat-analysis-memory.test.js tests/beat-analysis-request-lifecycle.test.js   tests/adjacent-preparation*.test.js tests/quality-preset.test.js tests/quality-chip-local-track.test.js   tests/home-*.test.js tests/content-provider-priority.test.js tests/login-status-refresh-epoch.test.js   tests/login-commit-ownership.test.js tests/provider-login-state-recovery.test.js   tests/netease-write-session-isolation.test.js tests/listen-report-session-isolation.test.js
```

最后源码/新增测试/既有测试调整的精确路径清单见 ledger 的 `contributed_source_paths`、`added_test_paths`、`updated_test_paths`。共享文件的其他局部修改仍归对应审查人。
