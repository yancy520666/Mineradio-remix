# Mineradio Next Chat Handoff

更新时间：2026-06-22

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

- 当前正式版本：`v1.0.9`
- 当前发布提交：`9d5f60c Polish Mineradio 1.0.9 installer UI`
- 当前 tag：`v1.0.9`
- GitHub Release：`https://github.com/XxHuberrr/Mineradio/releases/tag/v1.0.9`
- 可运行程序：`E:\桌面\播放器软件\Mineradio\Mineradio.exe`
- 真实代码/Git 仓库：`E:\桌面\播放器软件\Mineradio\resources\app`
- 统一备份目录：`E:\桌面\播放器软件\工作区备份`

## 刚完成的事

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
- `Mineradio-1.0.9-Setup.exe`
- `Mineradio-1.0.9-Setup.exe.blockmap`
- `Mineradio-1.0.0-to-1.0.9.patch.json`
- `Mineradio-1.0.1-to-1.0.9.patch.json`
- `Mineradio-1.0.2-to-1.0.9.patch.json`
- `Mineradio-1.0.3-to-1.0.9.patch.json`
- `Mineradio-1.0.4-to-1.0.9.patch.json`
- `Mineradio-1.0.5-to-1.0.9.patch.json`
- `Mineradio-1.0.6-to-1.0.9.patch.json`
- `Mineradio-1.0.7-to-1.0.9.patch.json`
- `Mineradio-1.0.8-to-1.0.9.patch.json`

## 当前工作树提醒

- `main` 已推送到 `origin/main`，`v1.0.9` tag 已推送。
- 当前代码修改已发布；发布记录文档提交在 `v1.0.9` tag 之后。
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
