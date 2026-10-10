# 原有后台内存与渲染策略专项复核（2026-10-10）

## 结论与范围

原实现已有完整的前台/深后台分流，本次不是从零加入后台优化。复核确认两项 P2，并仅作窄修。生产基线为 `0becc950f50880b6c047cd7af81b35dfe1741acf`；与 `735b30d` 中同名原有函数比较，两个问题均早于本次缓存专项。这里的“原有”指仓库既有实现，不把本轮新加的封面 dispose 回调归到原作者，也不据提交标题推断个人作者。

本次无真实 Windows、Electron/GPU、任务管理器 RSS、音频听感或恢复平滑度测量。没有暂停活跃音频、销毁可见桌面效果、触碰真实账号/媒体或执行禁止的登录竞争测试。Windows `EmptyWorkingSet` 是工作集 trim，不等于回收 JS 所有权或 GPU 资源；面板的 RSS 仍只代表主进程。

## 原有状态与调用链

| 状态/入口 | 原有策略 | 本次核对 |
| --- | --- | --- |
| 普通前台、原生可见但不聚焦 | 原生可见优先于可能滞后的 `document.hidden`；不进入 deep；前台 DPR/帧预算 | `00-state/08-desktop-render-power.js:127–155`；`01-scene/00-renderer-quality.js`；保留 |
| 普通最小化/隐藏，auto/release | 主 `animate` 提前退出，停止该循环的频谱读取、粒子与 WebGL 绘制；后台 timer 周期 auto 1000ms / release 1500ms，有 overlay 时250ms，回调再申请 rAF | `11-main-loop.js:185–244,322–336`；rAF 实际执行仍受 Chromium 节流，因此 timer 频率不是实际后台帧率保证 |
| 原生桌面嵌入且可见 | `desktopRuntimeState.visible` 为真且未最小化时不 deep；原生 desktop runtime 关闭后台节流；保留可见效果 | 假 `document.hidden=true` + native visible/embedded 实测仍不释放 UI target |
| 独立桌面歌词/壁纸、主窗隐藏 | 主渲染 deep，overlay 更新及原有独立生命周期仍在；并非销毁全部 app 资源 | 不改变原有 PID 收集/overlay/audio 行为；真实多窗口 Windows 验收仍需后续进行 |
| keep | 使 renderer 的 deep 判定为 false，保留渲染工作 | 页面 title 明确为“渲染策略”，按钮“保持运行”；没有承诺禁止一切工作集整理，本批不扩大语义 |
| 后台缓存 | 900ms 延后清理；cover 72、depth4、beat12、DJ4软预算，保护当前/邻近记录；深后台还清歌词 track 索引和 renderLists | 现有保护保留；新封面 dispose 来自上一缓存批，本次不重复改 |
| 活跃缓存维护 | 前台约45秒；deep auto约7秒/release约3.6秒，依赖loop实际唤醒 | 不据该周期声称真实系统稳定达到指定频率 |
| 恢复 | 原生状态revision防旧reply覆盖；重新申请唯一rAF，立刻提交旧scene；歌词复用健康mesh，封面token/1.6秒限制，viewport刷新合并 | 既有恢复测试通过；未证实GPU首帧耗时或实机无卡顿 |
| worker/音频 | tempo worker有16秒终止及abort/message/error清理；音乐AudioContext不随deep统一suspend；仅跳过可视频谱循环 | 保留播放连续性和必要分析，不把所有后台timer/worker一刀切停掉 |

主 loop 100轮隐藏/恢复合成调度检查保持至多一个待定rAF和一个后台timer；没有发现该路径随轮次倍增。`installRenderPowerHooks`静态调用只有一处，不能把“重复手动安装hook”当成正常运行场景的泄漏证据。短暂恢复可能有多个恢复入口，但当前歌词/封面自身有复用/去重，因此未凭源码猜测将其列为卡顿缺陷。

## BM01 · P2 · 自动工作集 trim 双入口缺少共同执行时仲裁（已窄修）

位置：`desktop/main.js:2059–2110`；renderer请求在 `00-state/08-desktop-render-power.js:337–363`；native hide/minimize调度在main窗口事件中。

复现（VM假时钟，无PowerShell执行）：
1. t=1000000ms隐藏，main排4秒timer。
2. t+2秒renderer先执行trim并结束。
3. t+4秒原main timer仍执行，造成2秒内重复trim。
4. 另一轮排timer后把两个auto开关关闭，旧回调仍trim。

修改前工作树与`735b30d`均复现。根因：main的120秒cooldown和开关只在排timer时检查，而renderer有自己的30秒门限；主进程入口只防同时in-flight，不防前后重复。

修复：自动调用统一在main执行时复查win32、开关、主窗存在与原生可见性、120秒cooldown；实际开始先取消旧timer；重复hide/minimize保留一个首个deadline；show/restore和禁用自动时取消pending。manual与manual-force保留既有规则：manual不绕过前台保护，manual-force仍可显式绕过；两者不受自动开关/cooldown限制。没有新增全进程暂停或改变PID集合。

## BM02 · P2 · rAF先停止时UI离屏target未走后台释放（已窄修）

位置：`public/js/modules/11-main-loop.js:329–335`、`01-scene/05-ui-render-cache.js:24–30`、`00-state/08-desktop-render-power.js:390–404`。

原先UI color/depth target释放依赖animate深后台分支；若Chromium先停止rAF，900ms后台缓存清理只处理一般缓存和renderLists，target仍被持有。假rAF完全不执行、真实清理函数加合成resource的VM证明其仍驻留；按原统计公式3840×2160×8约63.3MiB，只是color/depth账面估算，不是实测VRAM，也不是所有设备实际占用。

修复：在900ms后台清理入口再次确认deep后调用现有幂等`releaseMainUiRenderCache`。主canvas、最后合成帧、scene和可见桌面资源不动；快速恢复、keep、native-visible桌面不释放。恢复后按原`drawMainUiFrame`需要才重建，连续绘制不重复创建。

## 验证

- 新增 `tests/background-memory-policy.test.js`：8项，覆盖多renderer/原生timer统一仲裁、执行时开关复核、重复隐藏/快速显示、非Windows、manual语义、显式取消挂钩、rAF完全不执行的target释放与幂等/重建、真实deep predicate的keep和可见桌面例外。
- 既有定向：background-window-state-recovery、foreground-recovery-work、paused-render-cadence、stage-lyric-background-restore、playback-background-resume、beat-analysis-memory、pre-release-startup-memory。
- `npm run check`通过。独立reviewer负责整合与最终冻结证据，不能以本报告代替全量回归。
- 日志见 `docs/qa/background-memory-20261010/worker-*.log`。未运行真实Windows/GPU/RSS和音频听感验证；需要真实最小化/托盘恢复、可见桌面及独立歌词窗口组合来量化功耗、内存和首帧平滑度。
