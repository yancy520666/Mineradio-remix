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
v0.9.9
```

Release 标题建议使用：

```text
Mineradio v0.9.9
```

Release 正文建议使用：

```markdown
Mineradio v0.9.9 是首次公开发布准备版本，包含 Windows 安装包、桌面快捷方式创建、GitHub Releases 更新检测与下载入口，以及搜索排序、3D 歌单架交互等近期修复。

## 下载

- Windows 安装包：`Mineradio-0.9.9-Setup.exe`

## 更新

- 接入 GitHub Releases 更新检测与安装包下载入口
- 打包版首次启动会补创建桌面快捷方式
- 优化搜索结果排序，降低翻唱覆盖原唱的概率
- 优化 3D 歌单架悬停到点击的过渡手感

## 致谢

Mineradio 由 XxHuberrr 主要设计与打造。emily 作为早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此感谢。

同时感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。

> 当前安装包暂未进行代码签名，Windows 可能显示安全提示。
```

Release 资产必须上传 Windows 安装包，而不是只上传源码或 `win-unpacked` 目录。

建议上传：

- `dist/Mineradio-0.9.9-Setup.exe`
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
