# Mineradio Next Chat Handoff

更新时间：2026-06-23

## 新对话先执行/先读

```powershell
cd E:\桌面\播放器软件\Mineradio\resources\app
git status --short --branch
git log --oneline -3 --decorate
Get-Content AGENTS.md
Get-Content docs\PROJECT_MEMORY.md
Get-Content docs\HANDOFF_NEXT_CHAT.md
```

也可以直接把这段发给新对话：

```text
继续 Mineradio 项目。真实代码目录是 E:\桌面\播放器软件\Mineradio\resources\app，不要改旧外层源码目录。先读 AGENTS.md、docs/PROJECT_MEMORY.md、docs/HANDOFF_NEXT_CHAT.md，再继续处理我的新需求。
```

## 当前状态

- 当前正式版本：`v1.0.10`
- 当前发布提交：`fc2b29c Prepare Mineradio 1.0.10 release`
- 当前 tag：`v1.0.10`
- GitHub Release：`https://github.com/XxHuberrr/Mineradio/releases/tag/v1.0.10`
- 可运行程序：`E:\桌面\播放器软件\Mineradio\Mineradio.exe`
- 真实代码/Git 仓库：`E:\桌面\播放器软件\Mineradio\resources\app`
- 统一备份目录：`E:\桌面\播放器软件\工作区备份`

## 刚完成的事

- 已发布 `v1.0.10` 到 GitHub；发布时 `gh` keyring token 失效，但普通 `git push` 可用，Release 通过 Git Credential Manager token 走 GitHub API 创建并上传。
- `v1.0.10` 包含桌面歌词视觉/交互重做、安魂歌词位置原点修复、歌词前后景深和上下/左右角度调节、歌词绑定避让 3D 歌单架、方向键上下调节音量。
- 从 `v1.0.10` 起，快速补丁本地文件名和 Release label 使用 `Mineradio-旧版本→新版本.patch.json`；GitHub 底层 asset name 可能把 `→` 净化成点号，但更新解析仍能识别版本。每次只为低于新版的最近 4 个版本生成补丁，更早版本走完整安装包。
- 已发布 `v1.0.9`。
- 安装包文字对比度已修复：标准页面改为浅底深字，强调色使用 `#3257f7`。
- 安装包现在允许用户自由选择安装目录，默认仍为 `D:\Mineradio`；如果用户选择盘符根目录，会自动补成 `Mineradio` 文件夹。
- 2026-06-21 热修：旧 v1.0.9 安装包仍显示 C 盘 `AppData\Local\Programs\Mineradio`，已关闭 electron-builder 内置目录页，改用自定义目录页并在显示前强制优先 `D:\Mineradio`。
- 2026-06-22 热修：安装包 UI 改为中文极简黑白蓝风格，Release 安装包、blockmap 和 `latest.yml` 已覆盖上传，`v1.0.9` tag 已移动到 `9d5f60c`。
- 用户要求保存当前安装包格式；以后安装包按 `docs/INSTALLER_STYLE.md` 打包，发布前必须本地验证默认路径、输入框和 `浏览...` 按钮。
- 软件启动改为单实例：重复打开时会唤起当前正在运行的主窗口。
- 启动时不再调用运行时桌面快捷方式创建逻辑，避免每次运行都重新新建/刷新桌面快捷方式。
- QQ 音乐接口播放授权记录仍保存在 `docs/QQ_MUSIC_INTERFACE_NOTES.md` 和 `docs/PROJECT_MEMORY.md`；后续遇到 QQ 登录后头像/昵称异常、歌单能读但歌曲不能播、`104003` 等问题，先按该记录排查。

## 发布资产

- `latest.yml`
- `Mineradio-1.0.10-Setup.exe`
- `Mineradio-1.0.10-Setup.exe.blockmap`
- `Mineradio-1.0.6.1.0.10.patch.json`（Release label：`Mineradio-1.0.6→1.0.10.patch.json`）
- `Mineradio-1.0.7.1.0.10.patch.json`（Release label：`Mineradio-1.0.7→1.0.10.patch.json`）
- `Mineradio-1.0.8.1.0.10.patch.json`（Release label：`Mineradio-1.0.8→1.0.10.patch.json`）
- `Mineradio-1.0.9.1.0.10.patch.json`（Release label：`Mineradio-1.0.9→1.0.10.patch.json`）

## 当前工作树提醒

- `main` 和 `v1.0.10` tag 已推送；发布记录文档可能在 tag 后还有单独提交。
- `gh auth status` 仍可能显示 keyring token invalid；如果后续继续用 `gh`，先恢复 GitHub CLI 登录，或继续使用 Git Credential Manager + GitHub API。
- 未跟踪临时验证目录：`.playwright-cli/`、`output/`。
- 这些临时目录不在发布包里，不要误提交；也不要删除备份。

## 重要习惯

- 用户主要中文沟通，偏好直接修复、直接验证、直接发布。
- GitHub/gh 需要代理时使用：`http://127.0.0.1:10808`，不要使用旧端口 `26001`。
- 不要用 `git reset --hard` 或 `git checkout --` 回滚用户改动。
- 如果用户说“保留/记住/保存/这个很好/我喜欢”，同步更新 `docs/PROJECT_MEMORY.md`。
- 安装包样式相关任务先读：`docs\INSTALLER_STYLE.md`。
- 玻璃 SVG 质感相关任务先读：`docs\GLASS_SVG_TEXTURE.md`。

## 骷髅预设记忆

- 用户认可当前低角度仰视压迫感，不要改回平视。
- 点云要贴合模型表面、均匀规整，不要回到散乱星尘感。
- 3D 歌单架打开时应使用左侧大骷髅近景、右侧偏中歌单架构图。
