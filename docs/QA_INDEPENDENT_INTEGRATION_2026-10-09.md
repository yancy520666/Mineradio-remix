# 第二批共享改动：独立集成重点复核

基线 `5bc4f03`；2026-10-09 22:07 UTC 工作树。只读复核生产代码，仅新增本记录与隔离假对象证据；这是对共享 diff 的独立重点复核，不是第二次全仓逐行审查。所列问题由原 owner 修改后再独立验证。

## 结论与复现闭环

- **换源回滚回归，已补修**：新增 candidate 对象 owner 检查把子调用的合法回滚误认成被取代。真实抽取 `tryAutoPlaybackFallback` / `restoreSourceFallbackQueueItem` 后，修前两候选只搜索 QQ 并提前退出；修后依次 QQ、酷狗，最后进入 skip。回滚凭据新增后，换 token、换队列、同 key 新对象或换选中项均不能继续旧任务。
- **账号提交边界，已补修**：汽水 QR 成功未增 epoch，旧状态成功能把 B 覆写为 A，旧失败能让 B 变 stale；目录分页在 await 后未重比 accountKey，还能向 B 提交 A 私有页。修后成功/异常迟到均被丢弃，汽水成功事件读取 B，poll 只保留正常关闭计时，不取消本次成功交接。目录的成功、catch、finally 共用完整 owner 判断，不释放或改写失效页 owner。
- **网易 QR 首次提交，已补修**：首个 803 安装 B 后，epoch 要等 500/1200ms 的资料回查才变化。假对象执行实际 `checkQr`，修前旧状态能覆写 A；修后首次提交即失效旧 epoch，B 保持。
- **首页刷新顺序回归，已补修**：网易成功路径原先先启动首页请求再增 epoch；新首页 owner 检查会拒绝该次正常 B 数据。成功路径现先提交状态/失效 epoch，再启动目录和首页。独立执行实际网页登录函数与首页 loader，B-daily 正常提交；刻意保留旧顺序的负对照仍正确拒绝。
- 其余已读重点中，未发现有具体反例的新阻断：清空队列取消、ended 延迟、尾分页归属、内置歌单移除后的分页偏移、脚本 singleflight 与重试、服务端写操作捕获 Cookie/generation、网易索引失效、音频 route 局部构建清理。纯假对象定向测试通过不代表真实平台/硬件已验收。

## 证据与已读范围

证据：`docs/qa/independent-integration-fixtures.cjs`，包含真实函数抽取、假响应和负对照，无网络/账号/用户媒体。定向读取并复跑账号、目录、队列/ended、服务端写归属、索引、script-loader、Cuefield execution 与 route-construction 测试；`git diff --check` 无问题。

已读 `CLAUDE.md`、`docs/AI_REVIEW_HANDOFF.md`、`public/js/index-loader.js`；以下为 diff 与关联函数/调用点：
- `05-playback/00、01、03、06、09、10、11、12、13、14、18`，包括 fallback、共享状态及取消链
- `06-lyrics/00-built-in-playlists、01、02、03、04、05、06`；`08-account/01、02、03、04`；`09-idle-toast-libraries`
- `server.js` 的新增 session helper、discover、playlist index、listen report、业务写与相关登录路由；`kugou-api.js` 收藏缓存/写 helper、`qishui-api.js` 本次 diff/写 helper
- `cuefield/` 本次八个改动文件（边界、profile、LRC、recipe、feedback、artifact、window、version）与相关执行 owner

原始执行日志已随审查保存：[反例修后复核](qa/independent-integration/after.log)、[既有定向回归](qa/independent-integration/target-tests.log)、[新增回归](qa/independent-integration/new-tests.log)。

## 未覆盖与保留边界

未执行 Windows/Electron、真实登录、真实音频设备、长时间/真实平台请求；stage/font 仍由对应 owner 完成视觉与最终冻结复核。本记录未执行安全 PoC，也未重试中断操作、安装依赖、提交或推送。

**基线源审残留**：Spotify 状态刷新尚无对应 epoch guard，OAuth 成功路径也不失效该 epoch；这不是本轮新增回归，未做真实或假 OAuth 复现，不能列为已修。不得用本页结论覆盖安全分支开放问题或全仓未验证边界。
