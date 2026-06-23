# Mineradio Next Chat Handoff

更新时间：2026-06-23

## 新对话先执行

```powershell
cd E:\桌面\播放器软件\Mineradio\resources\app
git status --short --branch
git log --oneline -3 --decorate
Get-Content AGENTS.md
Get-Content docs\PROJECT_MEMORY.md
Get-Content docs\HANDOFF_NEXT_CHAT.md
```

可直接发给新对话：

```text
继续 Mineradio 项目。真实代码目录是 E:\桌面\播放器软件\Mineradio\resources\app，不要改旧外层源码目录。先读 AGENTS.md、docs/PROJECT_MEMORY.md、docs/HANDOFF_NEXT_CHAT.md，再继续处理我的新需求。
```

## 当前状态

- 正式版本基线：`v1.0.10`
- 当前 HEAD：`2a35250 Document Mineradio 1.0.10 release`
- 当前 tag：`v1.0.10` 在 `fc2b29c Prepare Mineradio 1.0.10 release`
- GitHub Release：`https://github.com/XxHuberrr/Mineradio/releases/tag/v1.0.10`
- 可运行程序：`E:\桌面\播放器软件\Mineradio\Mineradio.exe`
- 真实代码/Git 仓库：`E:\桌面\播放器软件\Mineradio\resources\app`
- 统一备份目录：`E:\桌面\播放器软件\工作区备份`

## 当前工作树

当前未提交改动：

- `desktop/main.js`
- `desktop/preload.js`
- `public/desktop-lyrics.html`
- `public/index.html`
- 未跟踪目录：`.playwright-cli/`、`output/`

这些改动包含本轮和前面多个需求，不能随意回滚。若要发布，先重新检查 diff，只暂存本次确认要发布的文件。

## 最近完成的重点

- 全屏模式 DIY 按钮位置多轮调整：最终从用户胶囊下方隐藏弹出，胶囊位置回退，不遮挡 Home。
- 软件内歌词和粒子歌词加入桌面歌词同款黑白背景自适应可读层；黑色粒子保持纯黑，不做黑底自适应。
- 3D 歌单架新增视觉控制台选项：
  - 镜头模式：动态镜头 / 静态镜头。
  - 显示模式：自动隐藏 / 常驻。
  - 参数滑条：大小、左右位置、上下位置、前后景深、侧向角度、整体透明度、背景透明度。
  - 独立歌单架颜色，已接入现有高级取色器和用户存档快照。
  - 常驻模式会让侧栏歌单架跟随粒子封面角度绑定。
  - 静态镜头会阻止歌单架触发镜头跟随，动态镜头保留当前默认聚焦。
  - 常驻或详情页打开时，歌词主动避让，减少遮挡。
  - 歌单详情页层级抬高，打开后盖在卡片最上层，便于选择。

## 本轮验证

已通过：

```powershell
node -e "const fs=require('fs'), vm=require('vm'); const html=fs.readFileSync('public/index.html','utf8'); const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]); scripts.forEach((code,i)=>new vm.Script(code,{filename:'public/index.html#script'+(i+1)})); console.log('inline scripts OK:', scripts.length);"
git diff --check
node --check desktop/main.js
node --check desktop/preload.js
```

结构检查也确认：歌单架按钮、滑条、取色器、静态镜头门控、详情页顶层、歌词避让都存在。

未完成的实机验证：

- 隐藏 Electron smoke 尝试失败，因为当前 `node_modules/electron` 二进制没有下载完整，运行 `.\\node_modules\\.bin\\electron.cmd` 时提示 Electron failed to install correctly。临时 smoke 脚本已删除，没有留下产品代码。
- 若下一对话要实机验收，可直接重启 `E:\桌面\播放器软件\Mineradio\Mineradio.exe` 看运行版效果。

## 注意事项

- 不要修改旧外层源码目录，只有 `resources\app` 会影响当前运行版。
- 不要使用 `git reset --hard` 或 `git checkout --` 回滚用户改动。
- 3D 歌单架手感不要推倒重做。项目记忆里强调：最强手感来自 hover 透明度、视差、展开节奏、轻微浮动和旧版张力线索，应在现有 `makeShelfManager()` / `makeContentListManager()` 上小步调参。
- 发布前按 v1.0.10 后的新规则：只给低于新版的最近 4 个版本生成补丁，更新包命名/label 使用“旧版本→新版本”语义。
- 软件内更新日志如果需要极短文案，用户偏好：`反正没什么人看，布想写日志了`

## 下一步建议

1. 先让用户实机确认 3D 歌单架控制台和常驻/静态镜头效果。
2. 若用户满意，再准备提交、打包、发布。
3. 若要继续调 3D 歌单架，优先看 `public/index.html` 的 `shelfLayoutProfile()`、`makeShelfManager()`、`makeContentListManager()`、`setFocusZone()`。
