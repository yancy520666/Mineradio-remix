# Mineradio Remix 发布流程

当前公开版本：**2.4.0**（2026-10-04 发布），Windows x64。构建流程只创建草稿，公开发布由维护者决定。

本次待发布草稿：**2.4.1**，标签 `v2.4.1`，安装包 `Mineradio-Remix-2.4.1-Setup.exe`，正文为 [2.4.1 更新说明](./docs/RELEASE_NOTES_v2.4.1.md)。本次验证升级基线保持为公开版本 **2.4.0**，不会替换 2.4.0 的标签或安装包。

2026-10-05：[2.4.1 草稿](https://github.com/yancy520666/Mineradio-remix/releases/tag/untagged-cd6f201d65ab35de7229) 已从最新修复源码重建，保持 `isDraft: true`，标题 `Mineradio Remix v2.4.1`，目标冻结提交 `600235c73a584dea665c9369bd950ffb08b1aada`。[发布流程 37231085678](https://github.com/yancy520666/Mineradio-remix/actions/runs/37231085678) 成功完成 110 个测试文件、源码与完整 Electron 检查、Windows 打包，以及安装 2.4.0 → 覆盖升级 2.4.1 → 启动与重启 → 卸载；安装后的源码一致，用户配置与相邻文件保留。本地三项完整检查也通过，其中隐藏引导测试补上测试专用帧渲染设置，不改变产品后台策略。

四项草稿资产已重新下载，逐项大小、SHA-256 与 GitHub 资产摘要及 `SHA256SUMS.txt` 一致；`latest.yml` 的版本、路径、大小及两处安装包 SHA-512 一致，Release 正文与冻结版本专属说明一致。安装包大小 `117469267` 字节，SHA-256：`86655334a166d6b4f3a2e61a60ee043b54762ee1d589188e415ff43e3bbba033`。旧草稿记录不代表本次资产；本记录之后的文档提交不会更换冻结构建。公开 2.4.0 的目标与四项资产保留。

本次包含 WE 双模式、循环录制窗口恢复、音域回响绘制节奏与推荐封面同步等修复。具体 Scene 循环衔接、核显和长时间帧率仍待维护者实机验收；`qishui-audio-decryptor/` 与 `qishui-auth-v6/` 分发授权依据仍待确认。完成体验验收后由维护者决定公开发布。

2.4.0：标签 `v2.4.0` → 提交 `39b436c`，安装包 `Mineradio-Remix-2.4.0-Setup.exe`，正文为 [2.4.0 更新说明](./docs/RELEASE_NOTES_v2.4.0.md)，升级验证基线为当时的公开版本 2.3.1。下次发版的升级基线已改为 **2.4.0**。

[发布流程 37139672519](https://github.com/yancy520666/Mineradio-remix/actions/runs/37139672519) 在提交 `39b436cebc5d4b2ecceb29e997b9d71834e11acf` 完成测试、构建与安装／升级／重启／卸载验证；草稿的四项资产重新下载后，SHA-256 与 GitHub 资产摘要一致，更新清单的版本及 SHA-512 一致，随后由维护者公开发布。之后的源码变化不替换已发布的安装包，新修复递增版本。

## 源码与版本

发布前提交并同步所有改动，运行 `npm test`、`npm run check`、`npm run test:electron`。`package.json` 与 lockfile 版本必须一致。已有标签不能移动到新源码；新修复递增版本。

后续已完成的变化先累积在 [docs/RELEASE_NOTES_NEXT.md](./docs/RELEASE_NOTES_NEXT.md)。下次确定新版本号后，将其中实际进入最终构建的变化整理到 `docs/RELEASE_NOTES_v<新版本号>.md`，再构建；发布工作流使用这个版本专属文件作为 Release 正文。不要将源码新修复写成旧安装包已具备，也不要覆盖历史版本说明。交付后再清理已发布的待发布条目。

手动执行 **Build Remix Windows release draft**，填写最终提交 SHA 和新版本标签（如 `v2.4.1`）。`prepare_draft=true` 仍会先完成全部测试、构建与安装验证，只有通过后才上传到草稿。完整构建使用 `--publish never`，上传步骤只能创建 draft。

## 安装与卸载验证

工作流在临时 GitHub-hosted Windows 测试机运行正式安装包：

1. 下载本仓库当前公开版本 `v2.4.0` 的安装包并核对 GitHub 资产 SHA-256，验证用户实际会经历的覆盖升级。每次公开新版本后，把工作流中的基线改为该版本。
2. 安装旧版，验证真实窗口的 WebGL 渲染器、模块及 preload 初始化，写入配置并正常退出。
3. 覆盖安装本次版本，逐文件核对安装后的源码；启动及重启，确认旧配置保留。
4. 卸载，检查程序资源、卸载注册表项和快捷方式删除，用户文件、相邻文件及测试配置保留。

`scripts/verify-windows-installer.ps1` 拒绝在个人电脑及 self-hosted runner 上运行。结果保存为 `INSTALLER_VALIDATION.json`；失败时禁止上传草稿资产。字体观感、拖动手感、背景、实体媒体键和长时间使用由用户验收。Geek 的扫描不是标准卸载流程的一部分，不能承诺第三方工具完美清理。

## 资产与交付

上传同次构建的 `Mineradio-Remix-<版本>-Setup.exe`、对应 blockmap、electron-builder 的 `latest.yml` 和 `SHA256SUMS.txt`。校验清单只包含本次版本文件，说明使用 `docs/RELEASE_NOTES_v<版本>.md`，Release 目标提交必须与构建一致。上传后下载草稿资产并重新核对 SHA-256。旧 2.2.1–2.2.3 草稿已被替代，不应公开发布。

## 用户安装与数据

从本仓库 Release 下载 Remix 安装包，核对 SHA-256 后安装或覆盖升级。Remix 使用独立名称、应用 ID 和用户目录；原版账号导入需在软件内明确确认。

标准卸载删除应用资源和快捷方式，保留用户配置及音乐。需要清除个人数据时，可先在软件中清理缓存，退出后单独处理 `%APPDATA%\Mineradio Remix`；不要删除共享的整个 `D:\MineradioCache` 或音乐目录。

当前安装包未数字签名，Windows 可能显示未知发布者或 SmartScreen 提示。SHA-256 核对文件一致性，不能代替数字签名。发布时同步提供对应 GPL 源码标签和版权说明。
