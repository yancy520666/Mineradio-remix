# 评论、头像与封面修复和受控性能证据

日期：2026-10-09。基线：451b6cf178fb6d872368941020141c312f02c4a3。测试均为隔离 VM、假平台返回与本机 loopback HTTP，没有真实账号、官方客户端或真实 CDN 对比。未推送、未修改 fake-IP 域名范围、未增加 npm 依赖。

## 已修问题

### P1：评论读取没有截止时间与完整生命周期

- 位置：`public/js/modules/05-playback/06-track-detail-lyrics-actions.js` 的 `readDetailComments`、`loadDetailComments`、`closeTrackDetailModal`、`openTrackDetailModal`；`06a-comment-replies.js` 的 `loadMoreDetailReplies`。
- 复现：假 GET 永不返回，loading 一直为 true；关闭、换歌曲、换排序后旧网络仍继续。原有 owner/seq 只抑制旧内容渲染。
- 根因：默认 apiJson 超时为 0，详情 owner 没有读取专用 AbortController。
- 修复：GET 明确 15 秒期限；owner 管理读取订阅，重载/关闭/打开另一详情时取消。保留 owner/seq 校验。取消不显示读取错误。
- 回归：关闭/重载/回复取消结束 loading；POST 无读取 signal，旧提交不会重置新歌内容；同 URL 多个 GET 订阅者离开一个不取消另一个；最后订阅者离开取消上游；迟到旧 Promise 不缓存或删除替代任务。
- 限制：取消已经发送到平台的读取不会撤销平台收到的请求；提交/点赞 POST 不自动取消或重试，避免重复写入。

### P2：重复楼中楼页错误显示到底

- 位置：`06a-comment-replies.js:105`，主评论的对应保护在 `06-track-detail-lyrics-actions.js:641`。
- 复现：A → 仅重复 A 但 cursor 前进 → 下一页 B；原来去重后 fresh.length=0 即终止，B 无法访问。
- 根因：用 DOM 新增数量决定上游是否仍有页。
- 修复：hasMore 与前进 cursor/offset 决定是否继续；去重只决定新增 DOM。连续 3 页无新增内容停止，防止无限重复链；有新增则重置保护。重复/空 cursor 与不前进 offset 仍立即停止。
- 回归：重复 A 且 cursor 前进可以请求 B；重复 cursor 停止；连续 3 空进展页有界停止。

### P2：头像联网恢复被失败冷却挡住

- 位置：`06b-comment-avatars.js:105`，online 处理。
- 复现：连续两次失败进入 30 秒冷却；online 只扫描，冷却挡住读取，之后无到期扫描，可能持续占位。
- 修复：online 清理当前真正可见失败项冷却并触发已有有限重试。近屏、隐藏、已移除项不因 reconnect 重试。
- 回归：冷却内 online 立即重新请求可见头像；隐藏/移除头像不请求；同 URL 合并与原有两次尝试保持。

### P2：封面上游任务缺乏全局容量、总期限和订阅取消

- 位置：`cover-cache.js:13–118`；`server.js` 的 `downloadCover` 与 `/api/cover`；`03-beat/05-cover-loading-crop.js` 的当前封面/相邻封面加载。
- 复现：32 个唯一 URL 可同时开始；每隔数秒滴一个字节可以一直续空闲超时；客户端在 headers 前关闭没有取消上游。
- 根因：完成缓存容量约束不约束 pending，原下载只有单块空闲超时，没有整个任务期限；共享请求不区分订阅者。
- 修复：最多 4 在途、64 排队，订阅起算 12 秒总期限；全局 32MiB 保留 chunk+最终 concat 峰值预算，背景最多 2 槽及半额字节预算；超预算/队列拒绝有界失败，不扩大 DNS/内容类型/大小约束。每个下游独立 signal，最后订阅者退出才取消共享上游。取消或超时的旧任务不能覆盖替代任务缓存。
- 前台策略：当前封面开始时停止相邻预取；当前 Image fetchPriority=high，预取=low。相邻请求带 background 标记，服务端按原始 CDN URL 合并，前台加入同 URL 时提升优先级。沿用原先 400px 主封面及 48/64px 头像尺寸，不引入双尺寸重复下载。
- 回归：真实 loopback ServerResponse 在 headers 前关闭后上游 abort；一个共享订阅退出不取消他人；总期限中止持续滴流且 cancel reader；不完整/错误内容类型不缓存；32 唯一 URL 严格 4 并发；队列/字节清理；背景留前台槽；迟到旧任务不覆盖替代任务。
- 限制：32MiB 是受控保留 Buffer 预算，包含 chunk 与 concat 的双份估算，不代表进程总 RSS、HTTP 内部缓冲或解码内存严格上限。单体仍最多 16MiB。限流会延长大量独立封面的批量完成时间，不能据此声称所有冷图更快。

### P2：短时重复打开评论首屏仍重复等待上游

- 位置：`readDetailComments`、`detailCommentReadStore`、`invalidateDetailCommentReadCache`。
- 修复：只缓存成功首屏 15 秒，最多 32 项、单项 JSON UTF-16 估算 256KiB、合计估算 2MiB。缓存键是 provider+非秘密授权 epoch+完整 URL（包含歌 ID、sort、limit、cursor/offset）；回复及后续页只合并同 URL 在途 GET，不存完成页缓存。登录/退出/换授权事件清理对应平台并重载当前面板，成功发言或点赞定向失效。
- 隔离：没有权威 providerAuthEpoch getter 时关闭跨 owner 复用；缓存命中至微任务渲染之间、网络回包时均再次核对 epoch；旧授权/旧排序内容不能写进新缓存。POST 不进入共享任务。
- 回归：首屏合并、短 TTL、失败不缓存、sort 分离、授权 epoch 分离、缓存命中与换账号竞态、取消旧任务迟到回包。
- 限制：JSON 长度预算是 payload 近似值，不等于 JS 对象堆大小；15 秒内其他用户新评论可能未立即出现，用户本人成功写入会立即失效。没有增加自动下一首评论预取，避免先扩大后台流量。

## 修复前后受控测量

原始机器可读数据：`docs/qa/COMMENT_COVER_BENCHMARK_2026-10-09.json`。
可复跑：`node scripts/qa/comment-cover-benchmark.js`。
设置：Node 读取/缓存层，每次上游固定假延迟 20ms，10 对冷/重复读取，同进程运行。评论旧读取层使用原本直接 apiJson 的路径；封面旧实现从冻结基线 `451b6cf` 取源码在 VM 运行（初次运行当时 HEAD 即该基线；复跑脚本现固定 SHA），不修改工作树。

- 评论首屏重复读取 P50：20.204ms → 0.039ms；10 对读取上游次数：20 → 10。冷读取 P50：20.213ms → 20.393ms，未证明冷上游更快。
- 封面冷读取 P50：20.255ms → 20.335ms；热读取 P50：0.008ms → 0.008ms；上游均 10 次。此前已有热缓存，热图不是本次新增收益。
- 32 个唯一封面受控 burst：最大并发 32 → 4；模拟保留数据峰值 2,097,152 → 262,144 字节；整批完成 20.590ms → 162.391ms。这是峰值容量保护与批量吞吐的取舍，未模拟真实网络带宽争用。
- 单元假延迟 35ms 的额外诊断只用于回归读取合并，不作为真实用户首屏或官方客户端数据。

## 验证与尚未测量

- `docs/qa/COMMENT_COVER_REGRESSION_2026-10-09.txt`：45 项本组回归通过。
- 全量 `npm test`：175/175 测试文件通过（本组完成主要修复时工作树，日志 `/tmp/mineradio-all-tests-comments.log`；并行其他修复之后由主任务最终再跑）。
- 本组 JavaScript 和 server `node --check`、`git diff --check` 通过。
- 未宣称 UI 截图验收：本环境 DISPLAY 为空，无 Xvfb；没有改 DOM/CSS。既有隔离 Electron 评论冒烟夹具可由具备显示环境的机器继续运行，不带 `--live`。
- 仍须用户本机/隔离可见窗口验证真实首屏渲染、滚动手感、实际 CDN TTFB/下载/解码、不同平台响应时间。没有官方客户端同设备/同网络对照，不能宣称比官方快。

## 轻量设计依据

只借鉴模式，不引入依赖：
- p-memoize：在途 Promise 合并、拒绝不缓存：https://github.com/sindresorhus/p-memoize#caching-strategy
- p-queue：排队取消应穿透运行中的 fetch，不能只 clear queue：https://github.com/sindresorhus/p-queue#how-do-i-cancel-or-remove-a-queued-task
- lru-cache：TTL 不能替代容量上限：https://github.com/isaacs/node-lru-cache#storage-bounds-safety
