# Mineradio Remix

基于 [XxHuberrr/Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused) 继续开发的独立改造版。这是 [yancy520666/Mineradio-remix](https://github.com/yancy520666/Mineradio-remix) 的源码仓库；原项目的历史停更公告和 2.2.0 下载链接不代表本改造版的发布状态。

**当前状态：开发中，尚未发布 Remix 安装包。** 源码仍以原版 Mineradio 名称运行，后续改造会在本仓库继续进行。

## 已完成的改造

- 改善长时间最小化、切换窗口或系统唤醒后的画面恢复。
- 手动恢复播放前先唤醒音频上下文，减少界面显示播放但没有声音的情况。
- 增加后台唤醒的回归测试和 Electron 运行测试。

相关修复见 [播放与窗口恢复 PR #1](https://github.com/yancy520666/Mineradio-remix/pull/1)。真实歌曲长时间闲置后的持续观察仍在进行。

## 项目简介

Mineradio 是 Windows 桌面音乐播放器，包含在线与本地音乐、歌词舞台、粒子视觉、3D 歌单架和桌面模式。本仓库在原版 2.2.0 源码基础上继续修复和改进。

## 本地运行与检查

需要 Node.js 和 Windows 环境。首次在仓库根目录运行 `npm ci`，之后双击 [start-remix-dev.bat](./start-remix-dev.bat) 启动隔离的源码测试版。窗口标题为 **Mineradio Remix Dev**，用户数据单独保存在 `%APPDATA%\Mineradio Remix Dev`。

也可以从命令行安装依赖并启动原版名称的源码窗口：

```powershell
npm ci
npm start
```

运行源码检查：

```powershell
node scripts/quick-check.js
```

构建 Windows 安装包：

```powershell
npm run build:win
```

直接运行 `npm start` 会使用原版名称和数据目录；与已安装版本并行测试时请使用上面的专用脚本。本仓库尚未提供经过发布验证的 Remix 安装包。

## 来源、隐私与授权

原项目主要由 XxHuberrr 设计和开发；保留原有版权及第三方说明，详见 [LICENSE](./LICENSE)、[NOTICE.md](./NOTICE.md) 和 [第三方移植记录](./docs/THIRD_PARTY_PORTS.md)。本改造版继续遵循 GPL-3.0-only 授权。

登录 Cookie、搜索历史及自定义内容应留在本机用户数据目录，不要提交到仓库。详见 [PRIVACY.md](./PRIVACY.md)。本项目不隶属于网易云音乐、QQ 音乐等第三方音乐平台；使用时请遵守各平台的服务条款及版权规则。
