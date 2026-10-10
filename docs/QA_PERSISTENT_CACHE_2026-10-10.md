# 持久缓存写入来源核实（2026-10-10）

本追加纠正上文“节拍磁盘自动清理可能删除用户编辑、尚需确认”的风险状态。上文是审查时待核实项，不是已证明的用户资料丢失。此次完整追踪当前生产调用链后，未发现用户节拍编辑器或编辑后写入磁盘的实际生产路径；不能把防御性注释、接受任意map的函数签名或测试注入的edited对象当作真实功能证据。

当前beatcache来源：

- 唯一前端POST封装为 `03-beat/00-tempo-worker-cache-prefetch.js:343` 的 writeBeatDiskCache，调用 packLocalBeatMap 后交给 `/api/beatmap/cache`；服务端由 `server.js:5456` 调用 writeBeatMapCache（807）。
- 当前歌曲分析：scheduleBeatAnalysis → analyzeAudioBeats → smoothBeatMapHandoff → writeBeatDiskCache（00-tempo模块252、04-beat-map-runtime模块15）。
- 队列预分析：runQueueBeatPrefetch → analyzeAudioBeats → writeBeatDiskCache（00-tempo模块476）。
- 本地分析：startLocalBeatAnalysis → analyzeAudioBeats / analyzePodcastDjBeats → storeLocalBeatEntry（03-local-beat-cache-modal模块439，automatic:true）→ writeBeatDiskCache（240）。storeLocalBeatEntry另一实际调用在磁盘回读308，明确skipDisk:true，不产生新磁盘写。
- AutoMix：18-cuefield-automix-integration模块151保存自动分析结果；129保存当前map。currentBeatMap非空赋值已追到分析结果handoff、本地缓存应用、内存命中和磁盘回读，没有用户编辑后再保存的路径。
- 本地MR/DJ偏好另存localBeatMapPrefs；磁盘prune不删该偏好。

特别说明：packLocalBeatMap里的automaticLocalAnalysis标记仅表示是否在本地分析WeakSet里注册。在线歌曲的自动分析结果也会保存为false；因此false不能当作“用户编辑”证据。隔离执行实际pack函数已验证这一点。

结论范围：当前应用自身正常写入的节拍图是可重新分析的派生数据，原“已存在编辑丢失”的表述没有依据。继续保留现有96MiB/2000项磁盘预算与手动保留全部beatmap的行为，不据此扩大手动删除范围、不迁移或改写历史文件。未知历史文件、外部手改文件不能只靠本次源码检查认定可删。

歌词失败路径则已复现：实际IPC写处理器遇到rename失败会留下`<sha256>.json.tmp`；实际prune和手动final文件匹配均跳过它，同key后续成功写才可能带走。这是确证P2残留问题。本批修复仅为每次独占创建带PID与随机后缀的临时文件，并在该写操作结束的finally精确清理自身已创建文件；保留旧final、不扫历史固定.tmp。隔离与正式专项7场景通过（write/rename/close三种失败注入、成功、撞名不删他方、活跃写保留、旧generation拒写），本批已将该窄补丁落入生产源码；正式专属测试位于tests/lyric-cache-atomic-write.test.js，连同cache-release、cache-release-ui、cache-root-fallback共26项通过。

现有单实例锁并非cache目录跨profile锁：runtime/userData可不同、cache root可指到相同位置，因此旧固定.tmp没有可靠PID/写入owner证据，不猜删。硬杀进程以及unlink权限失败造成的新格式残留仍是明确边界，后续若处理需严格识别新格式、确证死PID且过期并排除活跃写；本小修不承诺全部清零。Windows原生原子替换与长跑仍交由用户实机验收。

隔离证据：`qa/persistent-cache-20261010/result.json`、`qa/persistent-cache-20261010/production-test.log`；生产专属回归：`tests/lyric-cache-atomic-write.test.js`。所有行为发生在临时目录，无真实账号、用户缓存、Electron、实网、外部PoC或Git操作。
