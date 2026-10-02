# 第二轮外部建议核对与补修

日期：2026-10-02。基准 `8df57fb`；本轮只补控制条悬停、重复检查点写入与 CI 防回归，不打包或更新 Draft。已有修复通过当前源码核对，不因 README 未列出就判定缺失。

| 建议 | 当前状态与判断 |
| --- | --- |
| [Issue #480](https://github.com/XxHuberrr/Mineradio-paused/issues/480)，原生 prompt | 原项目问题有效，但 Remix 已使用 `askBuiltInPlaylistName` 的自定义输入框，新建及重命名均走该路径。短码复制失败在现有输入区选中内容，不使用原生 prompt。本轮补充扫描应用 renderer 模块及 HTML 的 CI 检查，不再新增另一套输入框。 |
| [Issue #461](https://github.com/XxHuberrr/Mineradio-paused/issues/461)，摄像头权限 | 已有 `createGestureCameraPermissionGrant` 和独立的手势权限判断，主窗口可信主文档、45 秒授权、拒绝明确的子 frame 和 audio 请求；与 Wallpaper 采集权限分开。不是当前代码把所有 media 限制给 Wallpaper。当前只核对权限逻辑及专项检查，未启动实体摄像头；Windows 隐私设置或设备错误仍可能导致 NotAllowedError。 |
| [PR #439](https://github.com/XxHuberrr/Mineradio-paused/pull/439) / [Issue #396](https://github.com/XxHuberrr/Mineradio-paused/issues/396)，自动 UAC | 当前 `purgeSystemMemorySmart` 已要求 `manual === true && autoElevate === true`，默认关闭提权，旧设置安全版本 3 迁移为 4。定向检查确认自动调用不进入提权路径，手动调用可以。README 补齐说明。 |
| [PR #467](https://github.com/XxHuberrr/Mineradio-paused/pull/467)，切歌恢复 | 当前有媒体身份 / token 校验、仍暂停检测、可刷新音源的有限恢复与预构建图复用；启动未成功时由启动重试负责，启动后停滞由恢复流程负责。已有专项通过，不额外合入另一套恢复调度。未在此次重新验证所有真实平台或 Gapless 体验。 |
| [PR #143](https://github.com/XxHuberrr/Mineradio-paused/pull/143)，快速离窗 | 坐标判定已存在，但 `controlsHovering` 仅由 enter / leave 更新。漏掉 leave 时，即便坐标在控件外，隐藏仍会被旧标志阻止。此次以实际控件边界同步标志，并在 document 离开、window 失焦、页面隐藏时清理，保持队列打开与显式显示保留策略。 |
| 2.5 秒 fsync 建议 | 写盘使用 `fs.promises` 与异步 `FileHandle.sync()`，不是渲染线程同步 fsync，尚无机械盘卡顿证据。每次正常更新会保存主文件和上份备份，因此内容不变时有可消除的重复写入。此次只跳过时间戳 / 原因变化，保留 2.5 秒进度保护，不贸然延长断电损失窗口。 |
| 汽水 [#451](https://github.com/XxHuberrr/Mineradio-paused/issues/451) / [#452](https://github.com/XxHuberrr/Mineradio-paused/issues/452) | `qishui-auth-v6` 负责登录，不能当作播放签名已升级的证明。当前 `fetchQishuiPcTrackV2` 只有 POST / GET 回退；SEO 接口在详情元数据路径，尚未成为失败后的播放回退。值得后续专项处理免费内容 / 明确试听的回退，保留官方账号权限校验。#452 的专有原生签名二进制没有接入或打包，不能直接复制进开源发行包。 |
| 酷狗概念版、均衡器 | 属于功能路线选择，不是本轮已确认缺陷；不顺带引入概念版自动领取、听歌奖励、平台适配或新音源。 |

## 本次定向结果

本日后续汽水专项已加入 PC 元数据失败后的 SEO 播放回退，按实际音频时长区分全曲与试听，保留登录失效和音质权限检查。真实登录态验证普通样本约 240 秒全曲、VIP 标记样本约 60 秒试听，音频代理可读取；详见 [汽水播放验证](./QISHUI_PLAYBACK_VALIDATION.md)。上表汽水项描述的是此次补修前的基准状态。

首轮 `node --test tests/bottom-controls-hover.test.js tests/playback-checkpoint.test.js tests/pre-release-startup-memory.test.js tests/gesture-camera-permission.test.js tests/playback-start-stall.test.js tests/playback-source-fallback-transaction.test.js`：18 项通过。控制条追加 DIY 提前返回路径的检查后，该专项再次通过；检查点追加损坏主文件修复边界后，检查点专项 9 项再次通过。

- 控制条：模拟漏掉 mouseleave 后移动到外部，悬停标志变为 false；进入控制条 / 手柄保持 true；DIY 面板提前返回、离窗、失焦和页面隐藏均能清理。
- 检查点：实际临时目录中，对修改前后实现各提交 5 次同一进度，fsync 从 9 次降为 1 次，恢复进度均为 42 秒。新进度、暂停及歌曲变化仍写盘，较旧任务不能回退。从备份恢复且主文件损坏时，不跳过修复主文件。已有进程强制结束、损坏文件备份恢复、写入失败保留上次内容及忙碌 IPC 合并检查通过。
- prompt：既有自定义输入框的确认 / 取消检查通过；新增源码扫描进入现有测试自动发现流程，覆盖原生调用重新出现的情况。

没有跑整套回归、实体摄像头验收或软件视觉验收；没有实测机械硬盘磨损。播放检查点去重按语义状态比较，不改变保存格式或恢复设置。
