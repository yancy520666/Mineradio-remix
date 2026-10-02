# 汽水播放回退验证

日期：2026-10-02。基准 `9f13217`，参考原项目 [#451](https://github.com/XxHuberrr/Mineradio-paused/issues/451) 和 [#452](https://github.com/XxHuberrr/Mineradio-paused/issues/452)。只更新源码、README 与下次发布说明，不打包、不更新 Draft。

## 故障与修复边界

真实账号接口返回有效登录及 VIP，但携带同一登录态请求 `/luna/pc/track_v2`，POST、GET 均返回 HTTP 200、正文 0 字节。当前请求没有 X-Helios / X-Medusa。这与 #452 的签名校验解释一致，但没有有效签名请求的成功对照，不能把缺少签名认定为唯一根因。

PC 元数据失败后先保留登录失效判断，再尝试公开 SEO 接口和它提供的 VOD 播放器信息。校验歌曲身份和 VOD HTTPS 域名；不向公开接口或 VOD 转发账号 Cookie，不引入专有签名二进制。失败不缓存，成功回退短时缓存；整条失败回退链共享约 14 秒预算，保留 renderer 的 15 秒请求期限。

以实际音频时长和歌曲总时长比较判断试听，不能只看 `preview.duration`。普通样本的 preview 为 30 秒，但实际 VOD 音频约 240 秒。VIP 样本提供约 60 秒片段，不将该限制解释为账号需要升级 SVIP。已验证的账号会员信息在回退或播放失败时保留；公开回退不保证 VIP 全曲。

## 真实账号与音频代理验证

在隔离 Electron 配置中只读复用本机系统加密的登录态，运行修改后的 API 模块，通过正在运行的播放器 `/api/audio` 代理读取少量音频。未切换用户正在播放的歌曲，未保存或打印 Cookie、签名链接。

| 样本 | 修改前 | 修改后 | 地址获取耗时 | 实际代理响应 |
| --- | --- | --- | --- | --- |
| 搜索标记 fee=0 | 无地址、source_unavailable | playable=true，trial=false，约 240 秒全曲 | 3488 ms | HTTP 206，audio/mp4，读取 1024 字节 |
| 搜索标记 fee=1 | 无地址、source_unavailable | playable=true，trial=true，约 60 秒试听；歌曲总长约 199 秒 | 3673 ms | HTTP 206，audio/mp4，读取 1024 字节 |

两次修改后结果均保留 isVip=true。上述耗时是本机单次测量，不是平均值或性能承诺。最初固定 2.5 秒 SEO 期限在真实网络上出现超时，调整为共享剩余预算后完成上表验证。

## 定向检查与审查

- `node --test tests/qishui-seo-playback.test.js tests/qishui-session-recovery.test.js tests/qishui-tier-rights.test.js`：27 项通过。
- `node tests/qishui-entitlement-cache.test.js`：已有会员、过期时间与账号缓存检查通过。
- 覆盖完整音频与误导性 preview、免费 / VIP 账号的试听提示、失败立即重试、成功缓存、登录过期停止、歌曲串位、危险 VOD 目标、未知音频时长、受限音质及原 PC 成功路径。
- 依照 code-review-and-quality 检查正确性、结构、安全与请求预算；复用现有音频解析和会员权限策略，没有新增依赖或另一套播放调度。

未播放完整音频、未验证所有歌曲、未验证有签名的 VIP 全曲。听感与界面体验由用户验收。当前已启动的进程仍加载旧后端，完全退出并重启源码版后才能使用本次修复；现有安装包需等待后续打包。
