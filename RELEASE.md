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
v0.9.13
```

Release 标题建议使用：

```text
Mineradio v0.9.13
```

Release 正文建议使用：

```markdown
Mineradio v0.9.13 是一次开场动画和进入体验优化版本。

## 下载

- Windows 安装包：`Mineradio-0.9.13-Setup.exe`

## 更新

- 开场动画升级为 WebGL 光流线场，融合 `ShipSwiftAnimatedLoop` 的 RGB 分通道、Warp 流动和高亮线场质感。
- 去掉刻意的环形/花瓣式爆点，改为更自然的斜向流线相位变化。
- 动画播放完成后不再自动进入主页，会停留在“点击进入”状态；点击任意位置或按 Enter/空格后进入 Home。
- 保留 2D canvas fallback，WebGL 不可用时仍可显示启动页。
- 提供 `Mineradio-0.9.12-to-0.9.13.patch.json` 快速补丁，已安装 `0.9.12` 的用户可以轻量更新。

## 致谢

Mineradio 由 XxHuberrr 主要设计与打造。emily 作为早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此感谢。

同时感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。

> 当前安装包暂未进行代码签名，Windows 可能显示安全提示。
```

Release 资产必须上传 Windows 安装包，而不是只上传源码或 `win-unpacked` 目录。

建议上传：

- `dist/Mineradio-0.9.13-Setup.exe`
- `dist/latest.yml`（如果本次构建生成）
- `dist/*.blockmap`（如果本次构建生成）
- `dist/Mineradio-0.9.12-to-0.9.13.patch.json`（如果本次包含快速补丁）

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
