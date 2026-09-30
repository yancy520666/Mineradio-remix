# Mineradio Remix

基于 [XxHuberrr/Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused) 继续开发的独立改造版。这是 [yancy520666/Mineradio-remix](https://github.com/yancy520666/Mineradio-remix) 的源码仓库；原项目目前已长期停更，本项目基于原作 2.2.0 版本改造。

Remix 由 [yancy520666](https://github.com/yancy520666) 维护，[Codex](https://github.com/codex) 协助代码审查与改进；原版作者及源码来源见下方“来源、隐私与授权”。

## 已完成的改造

- 改善长时间最小化、切换窗口或系统唤醒后的画面恢复。
- 手动恢复播放前先唤醒音频上下文，减少界面显示播放但没有声音的情况。
- 移除未登录时的“世界和平”解锁彩蛋；首次登录引导保留，点击右上角登录入口可直接绑定账号。
- 增加后台唤醒的回归测试和 Electron 运行测试。
- DIY 歌词间距按固定布局单位计算，切歌、长句和纹理清晰度不再改变基础间距；开启翻译时统一预留译文空间。
- 增加每次 push / PR 的自动回归检查，发布打包前也必须通过测试。
- 节奏分析逐个压缩音频频段，并在取消或失败时释放源节点，降低整首 PCM 的保留峰值。
- 本地 API 限制为本机同源请求；媒体代理阻止私网地址和危险重定向，桌面登录 Cookie 使用系统加密。
- 本地曲库保留离线记录、跳过失效文件；新导入的内容指纹用于识别改名、移动和相同文件副本，并保留曲目引用。
- 接入系统媒体会话，同步曲名、歌手、封面、播放状态与进度，并支持播放、暂停、切歌和跳转。

本地歌曲离线、地址失效或确认发生读取/解码错误时，播放器会显示歌曲名及原因并尝试下一首。连续跳过会合并为一张提示卡，最多连续尝试 12 首，之后停止并提示；离线曲目记录不会自动删除。已有的在线换源、权限失败和跳过提示继续保留。

旧版曲库索引可直接读取。已经离线、又没有内容指纹的旧记录无法可靠判断原文件是否被移动；需要重新导入可用文件，程序不会凭歌曲名猜测合并或删除记录。新指纹使用完整文件的流式 SHA-256，首次导入会增加磁盘读取时间。

相关修复见 [播放与窗口恢复 PR #1](https://github.com/yancy520666/Mineradio-remix/pull/1)。真实歌曲长时间闲置后的持续观察仍在进行。

## 项目简介

Mineradio 是 Windows 桌面音乐播放器，包含在线与本地音乐、歌词舞台、粒子视觉、3D 歌单架和桌面模式。本仓库在原版 2.2.0 源码基础上继续修复和改进，旨在提升用户体验和日常使用稳定性。

## 本地运行与检查

需要 Node.js 和 Windows 环境。首次在仓库根目录运行 `npm ci`，之后双击 [start-remix-dev.bat](./start-remix-dev.bat) 启动隔离的源码测试版。窗口标题为 **Mineradio Remix Dev**，用户数据单独保存在 `%APPDATA%\Mineradio Remix Dev`。

也可以从命令行安装依赖并启动原版名称的源码窗口：

```powershell
npm ci
npm start
```

运行源码检查：

```powershell
npm test
npm run check
npm run test:electron
```

`npm test` 自动发现并运行全部 `*.test.js`；`npm run check` 检查源码和运行规则；`npm run test:electron` 使用隔离的临时用户目录验证启动恢复、音频恢复、歌词间距、设置保存/读取、系统加密和媒体会话状态。字体观感、特效流畅度、Windows 媒体面板显示及实体媒体键效果仍由人工验收。

构建 Windows 安装包：

```powershell
npm run build:win
```

直接运行 `npm start` 会使用原版名称和数据目录；与已安装版本并行测试时请使用上面的专用脚本。仓库将从当前主分支生成 v2.2.3 Windows 安装包草稿，公开发布前仍需完成安装验收。

## 来源、隐私与授权

原项目主要由 XxHuberrr 设计和开发；保留原有版权及第三方说明，详见 [LICENSE](./LICENSE)、[NOTICE.md](./NOTICE.md) 和 [第三方移植记录](./docs/THIRD_PARTY_PORTS.md)。本改造版继续遵循 GPL-3.0-only 授权。

登录 Cookie、搜索历史及自定义内容应留在本机用户数据目录，不要提交到仓库。详见 [PRIVACY.md](./PRIVACY.md)。本项目不隶属于网易云音乐、QQ 音乐等第三方音乐平台；使用时请遵守各平台的服务条款及版权规则。
