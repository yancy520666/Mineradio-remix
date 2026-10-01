# 外部修复建议核对

日期：2026-10-02。核对基准：Remix `a74c9f5`。使用当前源码、上游 PR 正文及补丁、官方服务文档；没有重新审计全部 98 个 PR，也没有在真实代理环境复现。本次只更新文档，下面的待修项尚未实现。

## 核心结论

| 建议 | 当前证据与结论 | 处理建议 |
| --- | --- | --- |
| fake-IP / TUN 兼容 | `server-security.js` 的 `resolvePublicTarget` 拒绝 `198.18.0.0/15`。注入 `198.18.0.2` 的 DNS 结果，实际返回 `UNSAFE_PROXY_URL`。问题成立，但并非所有代理模式或加速器都会受影响。 | 优先处理。研究已知音乐域名的可信 HTTPS DNS 解析，获得真实公网地址后继续校验并绑定 socket；不能简单删除网段拦截。 |
| 单 C 盘节奏缓存 | `desktop/main.js` 的 `defaultCacheRootPath` 已在没有 D 盘时回退到用户目录，但 `server.js` 的 `beatCacheRootInfo` 仍拒绝 C 盘。纯服务端默认目录也仍为 D 盘。 | 优先处理。使用可写用户目录，移除针对 C 盘的旧限制，保留用户选定目录并处理写入失败；影响的是节奏图磁盘缓存，不是所有缓存或整个播放功能。 |
| 网易云 VIP 识别 | `normalizeNeteaseVip` 仍选择首个 truthy 的 `vipInfo`，空对象会挡住后续嵌套来源；`musicVipLevel` 等仍参与 `vipType` 判断。普通等级不再直接作为 SVIP 依据，但剩余问题成立。 | 建议补齐。保留所有来源，区分标准会员类型、明确会员标志及有效套餐，继续检查过期时间；不能只删掉所有套餐判断。 |
| 天气定位 HTTP | `WEATHER_IP_LOCATION_URL` 仍为 `http://ip-api.com/json/`，`/api/weather/ip-location` 路由仍可调用。当前前端模块未找到主动调用该定位路由的路径，不能据此断言每次启动都传输定位。 | 建议改用 HTTPS 服务并同步响应字段、隐私说明和失败回退。该服务免费接口不支持 HTTPS，不能只替换 URL 协议。 |
| 安装包未签名 | 当前打包配置及 `RELEASE.md` 均说明未数字签名；工作流已生成并上传 `SHA256SUMS.txt`。Windows 安装版已有 `electron-updater` 的下载、校验与安装流程，源码 / Dev 使用外部更新页。 | SHA-256 发布说明已经落实；代码签名需要证书或签名服务，不能宣称已经解决。校验清单及更新元数据均不能代替发布者签名。 |
| 大文件拆模块 | `server.js` 与 `desktop/main.js` 仍承担多个功能，维护成本确实偏高；具体行数会随提交变化。 | 后续按网络解析、缓存策略和会员归一化逐步抽取，配合对应修复，不做一次性大重构。 |

fake-IP 行为依据：[Mihomo 官方 DNS 配置](https://wiki.metacubex.one/config/dns/)，示例网段 `198.18.0.1/16` 落在当前拦截范围内。定位服务限制依据：[ip-api JSON 文档](https://ip-api.com/docs/api:json)。

## 上游 PR 应怎样参考

| PR | 核对结果 |
| --- | --- |
| [#435](https://github.com/XxHuberrr/Mineradio-paused/pull/435) | 已关闭且未合并。针对网易云 DNS 被加速器改变、请求落到海外节点，采用 DoH 与可配置 realIP。可参考解析和缓存思路；它不是直接修复 Remix fake-IP 安全校验的补丁，其 axios / undici 接入方式也不能直接替代我们的原生绑定地址请求。realIP 改动需另行验证，不视为通用代理修复。 |
| [#97](https://github.com/XxHuberrr/Mineradio-paused/pull/97) | 仍开放且未合并。补丁主要增加 macOS / Linux 默认缓存目录，Windows 默认仍为 D 盘。我们的 C 盘问题真实存在，但照搬这份补丁不足以解决单盘 Windows。 |
| [#249](https://github.com/XxHuberrr/Mineradio-paused/pull/249) | 仍开放且未合并。保留多个 `vipInfo` 并限制标准类型字段的方向值得吸收，需要兼容 Remix 已增加的 `vip_info_v2` 套餐及过期判断。 |
| [#278](https://github.com/XxHuberrr/Mineradio-paused/pull/278) | 仍开放且未合并。补丁换用 `https://ipwho.is/` 并适配 latitude / longitude 等字段；Cookie 加密我们已有，不应重复整包合入。 |
| [#143](https://github.com/XxHuberrr/Mineradio-paused/pull/143) | 仍开放且未合并。底部控制条当前仍依赖 enter / leave 更新 `controlsHovering`，值得做一次快速移出窗口的定向检查。仅凭变量仍存在不能证明 bug；坐标判定和离窗清理可作为候选方案，Home 视觉改动不必一起吸收。 |
| [#170](https://github.com/XxHuberrr/Mineradio-paused/pull/170) | 仍开放且未合并。桌面歌词下限确为 0.72，更小字号属于可选体验扩展；该 PR 还含启动加载重试，我们已有对应机制，不应重复覆盖。改字号需同步渲染、保存、预设和分享读取的边界。 |
| [#120](https://github.com/XxHuberrr/Mineradio-paused/pull/120) | 仍开放且未合并。当前 `openPlaylistPanelDetail` 已支持再次点击同一卡片收起详情；PR 增加独立折叠按钮，是可选交互，不是修复长歌单重叠的必要条件。 |

均衡器、酷我及跨平台系列按功能路线决定，不与本轮兼容性修复打包。现有安全、节奏内存、本地曲库及媒体控制的移植出处见 [THIRD_PARTY_PORTS.md](./THIRD_PARTY_PORTS.md)；“已吸收”也可能是独立改写，不能等同于完整合并某个 PR。本次不把外部报告的整份 PR 清单认证为全部已验证。

## 本次定向检查

直接运行当前函数，不启动服务、不写用户配置：

- fake-IP DNS 夹具：`198.18.0.2` 被拒绝为 `UNSAFE_PROXY_URL`。
- C 盘存在的目录夹具：`C:\Users\fixture\cache\beatmaps` 得到 `allowed: false`、`available: false`，说明不是仅因磁盘不存在。
- VIP 夹具：账户 `vipInfo.vipType=11` 独立存在时判为 VIP；加上 `profile.vipInfo={}` 后变为无 VIP。仅 `musicVipLevel=1` 时得到 `vipType=1`、VIP，而非 SVIP。夹具证明字段混用与漏读，不代表所有真实账号响应都有问题。
- 更新流程核对了安装版启用条件、renderer 的原生分支、IPC 和 `desktop/remix-updater.js`，没有只依赖旧网页更新测试作结论。

未运行整套回归、真实代理测试或安装包测试。下一轮优先解决 C 盘缓存与 fake-IP 兼容，再补 VIP 与 HTTPS 定位；每项使用对应的定向验证，视觉体验由用户验收。
