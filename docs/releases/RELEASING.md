# 发布流程

当前公开版本为 **2.6.0**，下次 Windows 安装升级验证以 2.6.0 为基线。已发布的安装包保持不变；后续修复使用新版本号。

## 准备源码

同步仓库最新内容，将实际进入构建的改动整理到 `docs/releases/RELEASE_NOTES_v<版本>.md`。说明以 `## 更新重点` 开头，每条使用 `- **短语**：说明`。

保持 `package.json`、`package-lock.json`、界面版本号及发布工作流一致。运行 `npm test`、`npm run check` 和 `npm run test:electron`，检查私人配置、日志、账号数据未进入 Git。

## 构建与验证

运行 GitHub Actions 的 **Build Remix Windows release draft**，填写新版本标签和最终提交 SHA。工作流完成测试、打包，以及旧版安装 → 覆盖升级 → 启动与重启 → 卸载验证后，才允许创建草稿。

构建使用 `--publish never`。`scripts/verify-windows-installer.ps1` 只在临时 GitHub-hosted Windows 测试机运行，不能在个人电脑执行。安装和卸载不得删除用户配置与音乐。

## 交付

草稿包含同次构建的安装包、blockmap、`latest.yml` 和 `SHA256SUMS.txt`。下载并核对资产摘要、版本与文件名，确认 Release 对应经过验证的源码。维护者验收后决定公开发布。

当前安装包未数字签名；SHA-256 用于核对文件完整性。提供对应 GPL 源码标签、许可证及版权说明。

## 发布后

更新 README 的当前版本与下载入口，清理已发布的待发布条目，将升级验证基线更新为刚公开的版本。新修复写入 [下个版本](RELEASE_NOTES_NEXT.md)，不要从后续 main 重跑已发布标签的工作流。
