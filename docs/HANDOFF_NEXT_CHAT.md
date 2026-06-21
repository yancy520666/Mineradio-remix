# Mineradio Next Chat Handoff

更新时间：2026-06-21

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

- 当前正式版本：`v1.0.8`
- 当前发布提交：`effe77a Prepare Mineradio 1.0.8 release`
- 当前 tag：`v1.0.8`
- GitHub Release：`https://github.com/XxHuberrr/Mineradio/releases/tag/v1.0.8`
- 可运行程序：`E:\桌面\播放器软件\Mineradio\Mineradio.exe`
- 真实代码/Git 仓库：`E:\桌面\播放器软件\Mineradio\resources\app`
- 统一备份目录：`E:\桌面\播放器软件\工作区备份`

## 刚完成的事

- 已发布 `v1.0.8`。
- QQ 音乐接口播放授权记录已保存到 `docs/QQ_MUSIC_INTERFACE_NOTES.md` 和 `docs/PROJECT_MEMORY.md`；后续遇到 QQ 登录后头像/昵称异常、歌单能读但歌曲不能播、`104003` 等问题，先按该记录排查。
- Home 左侧大卡片改为“🚧此处施工，敬请期待🚧”，Home 页支持手动展开播放器控制台。
- 视觉预设显示顺序改为 emily、安魂、星河、唱片、星球、滚筒、虚空；安魂右上角十字架未选中和选中态都保持 `#3257f7` 蓝色。
- 视觉控制台新增 4 槽位“用户存档”，可保存粒子、颜色、滑条、歌词外观习惯；命名改为卡片内输入，不再用 `prompt`。
- 启动时会重新应用已保存的歌词预设/自定义颜色；手动播放/暂停增加音频淡入淡出。
- 电影镜头已按用户要求还原到上一版手感，后续如果再碰这块要谨慎，不能继续盲目加力。

## 发布资产

- `latest.yml`
- `Mineradio-1.0.8-Setup.exe`
- `Mineradio-1.0.8-Setup.exe.blockmap`
- `Mineradio-1.0.0-to-1.0.8.patch.json`
- `Mineradio-1.0.1-to-1.0.8.patch.json`
- `Mineradio-1.0.2-to-1.0.8.patch.json`
- `Mineradio-1.0.3-to-1.0.8.patch.json`
- `Mineradio-1.0.4-to-1.0.8.patch.json`
- `Mineradio-1.0.5-to-1.0.8.patch.json`
- `Mineradio-1.0.6-to-1.0.8.patch.json`
- `Mineradio-1.0.7-to-1.0.8.patch.json`

## 当前工作树提醒

- `main` 已推送到 `origin/main`，`v1.0.8` tag 已推送。
- 当前代码修改已发布；发布记录文档提交在 `v1.0.8` tag 之后。
- 未跟踪临时验证目录：`.playwright-cli/`、`output/`。
- 这些临时目录不在发布包里，不要误提交；也不要删除备份。

## 重要习惯

- 用户主要中文沟通，偏好直接修复、直接验证、直接发布。
- GitHub/gh 需要代理时使用：`http://127.0.0.1:10808`，不要使用旧端口 `26001`。
- 不要用 `git reset --hard` 或 `git checkout --` 回滚用户改动。
- 如果用户说“保留/记住/保存/这个很好/我喜欢”，同步更新 `docs/PROJECT_MEMORY.md`。
- 玻璃 SVG 质感相关任务先读：`docs\GLASS_SVG_TEXTURE.md`。

## 骷髅预设记忆

- 用户认可当前低角度仰视压迫感，不要改回平视。
- 点云要贴合模型表面、均匀规整，不要回到散乱星尘感。
- 3D 歌单架打开时应使用左侧大骷髅近景、右侧偏中歌单架构图。
