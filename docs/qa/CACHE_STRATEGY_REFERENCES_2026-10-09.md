# 轻量缓存与预取路线参考

本轮不新增运行时依赖。复用现有封面缓存、图片队列和播放器状态，借鉴通用机制；没有照搬第三方播放器整套媒体数据库。

- lru-cache：https://github.com/isaacs/node-lru-cache#storage-bounds-safety 。参考条目/字节同时有界，TTL不能替代容量限制。当前main元数据BlueOak-1.0.0，若未来引入需重新核对具体锁定版本许可。
- p-memoize：https://github.com/sindresorhus/p-memoize#caching-strategy 。参考同key进行中Promise合并、失败不缓存。默认无限Map不适合直接照搬。
- p-queue：https://github.com/sindresorhus/p-queue#how-do-i-cancel-or-remove-a-queued-task 。参考优先级、并发限制与AbortSignal。只限并发不限制排队长度；清队列不等于停止已经开始的fetch。
- YesPlayMusic：https://github.com/qier222/YesPlayMusic/blob/master/src/utils/Player.js ，以及 https://github.com/qier222/YesPlayMusic/blob/master/src/utils/db.js 。参考确定下一首后的准备范围；不移植整首下载/多尺寸图片及IndexedDB体系。仓库说明当前版本处于维护模式。

依据官方仓库及元数据核对策略和模块格式。未取得可靠npm包字节体积，故不声称某库“最轻”。受控性能与负载代价详见 COMMENT_COVER_BENCHMARK_2026-10-09.json：评论热命中减少重复请求；封面限并发降低同时工作量，但延长整批完成时间。实际平台CDN、网络波动、图片解码和GPU成本未测。
