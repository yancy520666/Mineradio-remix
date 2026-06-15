# 发布流程

## 发布前检查

- 确认 `package.json` 版本号正确
- 确认 `mineradio.update.owner/repo` 指向正式仓库
- 确认 `.cookie`、`.qq-cookie`、`updates/`、`node_modules/` 没有进入 git
- 确认 README/NOTICE 中包含 emily 共创致谢
- 运行语法检查
- 运行桌面应用进行基础功能验证
- 生成 Windows 安装包
- 用本地 `MINERADIO_UPDATE_MANIFEST` 模拟新版本，确认应用可以检测、下载并打开安装包

## GitHub Release

Release tag 建议使用：

```text
v1.0.0
```

Release 标题建议使用：

```text
Mineradio v1.0.0
```

Release 正文建议使用：

```markdown
Mineradio v1.0.0 是 Mineradio 的首个正式发布版，把天气电台、首页内容、Wallpaper 银河背景、Emily 播放态视觉和 3D 歌单架整理成一个完整桌面体验。

## 下载

- Windows 安装包：`Mineradio-1.0.0-Setup.exe`

## 亮点

- 新增 Open-Meteo 天气电台，会根据城市、天气和时间生成适合当前氛围的播放队列。
- 首页升级为正式产品首屏，包含天气电台、每日推荐、私人电台、继续听、听歌画像和我的歌单。
- 启动后未播放状态保持 Wallpaper 银河背景，不叠加旧 idle 白点、灰点、斜线或中心光球。
- 播放音乐后仍切换到 Emily / 默认播放态视觉，歌词舞台、粒子舞台和控制台保持完整。
- 优化窗口模式下主页自适应，紧凑窗口中 6 张主卡片和推荐内容不再挤出首屏。
- 天气电台过滤 AI / Suno / Udio / 白噪音 / 雨声助眠等低质结果，并优先混入每日推荐和私人推荐曲库。

## 致谢

Mineradio 由 XxHuberrr 主要设计与打造。emily 作为早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此感谢。

同时感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。

> 当前安装包暂未进行代码签名，Windows 可能显示安全提示。
```

Release 资产必须上传 Windows 安装包，而不是只上传源码或 `win-unpacked` 目录。

建议上传：

- `dist/Mineradio-1.0.0-Setup.exe`
- `dist/latest.yml`（如果本次构建生成）
- `dist/*.blockmap`（如果本次构建生成）

## 更新检测

应用会请求 GitHub Releases latest。只有远端版本高于本地版本时，右上角更新入口才应显示真实更新内容。

本地更新链路验证可以用临时 manifest：

```json
{
  "latestVersion": "0.9.10-test",
  "release": {
    "name": "Mineradio v0.9.10-test",
    "downloadUrl": "http://127.0.0.1:3144/Mineradio-0.9.9-Setup.exe",
    "notes": ["本地在线更新链路测试"]
  }
}
```
