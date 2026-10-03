# Mineradio Remix — 给 AI 的项目约定

Windows x64 Electron 音乐播放器，基于原版 Mineradio 2.2.0 继续维护（GPL-3.0-only）。当前状态与未完成事项见 [docs/AI_REVIEW_HANDOFF.md](docs/AI_REVIEW_HANDOFF.md)，先读它。

## 与维护者协作

- 用中文沟通。先说结论和原因，再说做法；不要用测试数量代替发现。
- 视觉、动画、手感由维护者验收。改完界面要截图自查，但最终观感以维护者为准。
- 测试只补必要的，不要“为了覆盖而覆盖”。
- 以下操作先问再做：推送到 GitHub（维护者明确说“提交推送”时除外）、修改已公开的 Release / 发布页、删除任何用户文件。删除一律移到回收站，不做永久删除。
- 维护者说“留到下个版本”时：可以提交到 main，但不要重跑已发布版本的发布流程。
- 提交信息末尾保留 `Co-Authored-By: Claude …`；不要使用 Codex 的署名。

## 硬性边界

- 不引入汽水官方客户端的专有签名组件（如 `bdms.node`、`metasecml.dll`），也不帮忙伪造平台签名。`qishui-audio-decryptor/`、`qishui-auth-v6/` 的分发授权尚未核实，只报告，不删除、不声称合规。
- 测试只用隔离配置、假账号、临时曲库；不碰维护者真实安装的播放器、`%APPDATA%\Mineradio Remix`、真实曲库。真实账号只在维护者明确要求时做**只读**检查。
- 不改 `server-security.js` 中 fake-IP 音乐域名名单的范围（它不是全局白名单）；正式包 `asar:false`、内测包 `asar:true` 不要统一。
- 原版导入只读、只补缺失项；Remix 退出或导入不得删除原版文件。

## 常用命令

```powershell
npm test               # 全部 *.test.js
npm run check          # 静态规则（含启动动画节奏、发布清单等守卫）
npm run test:electron  # 隔离 Electron 冒烟测试
```

界面验证：`scripts/qa/isolated-electron.js`（在隔离配置中启动真实播放器并执行页面脚本、可截图）和 `scripts/qa/render-static.js`（用真实 CSS 离屏渲染静态 HTML）。用法见 `.claude/skills/isolated-ui-check`。

## 工作约定

- 新改动写进 `docs/RELEASE_NOTES_NEXT.md` 末尾的“2.4.0 之后的改动”一节；README 的“下个版本（开发中）”同步一句话摘要，不要写成已发布安装包具备的内容。
- 面向用户的版本说明 `docs/RELEASE_NOTES_v<版本>.md` 以 `## 更新重点` 开头（每条 `- **短语**：说明`），更新弹窗会只提取这些加粗短语。
- 发版走 `.claude/skills/mineradio-release`（流程细节在 `RELEASE.md`）。
- `public/js/modules/` 是按顺序加载的经典脚本（非 React），全局变量共享；新逻辑注意加载顺序与 `typeof fn === 'function'` 防护。
- 样式表 `public/css/index.css` 有多层 `!important` 主题覆盖；新样式追加在文件末尾，用 `#playlist-panel …` 等足够具体的选择器。

## 已知的坑（都实际踩过）

- Electron `webContents.executeJavaScript` 会等页面停止加载，music.163.com 等页面可能很久都不结束；需要立即执行时用 `webContents.mainFrame.executeJavaScript`。
- 隐藏的 QA 窗口 `capturePage()` 可能返回旧画面；截图用可见窗口或离屏渲染。
- Windows 会暂停被遮挡窗口的动画帧；测试进程用 `tests/helpers/electron-frames.js` 关闭遮挡节流。
- Google Fonts 在本机网络不可达时会让页面一直处于加载中；测试里屏蔽 `fonts.googleapis.com` / `fonts.gstatic.com`。
- `.fx-mini-btn` 默认 `flex: 1`，图标按钮要显式 `flex: 0 0 auto`。
- 元素设置了 `display` 后 HTML 的 `hidden` 属性失效，需补 `[hidden] { display: none !important }`。
- 安装标记文件第一行是标题、第二行才是 `appId=`；NSIS 静默模式下 `MessageBox` 不加 `/SD` 会卡住。
- `img.src = ''` 会请求页面自身并显示“图片损坏”；清空图片用 `removeAttribute('src')`。
- `playlist-interaction` 已改为等待动画、虚拟列表和稳定采样，测试固定面板时须同时设置 `playlistPanelPinned`，不能只加 CSS 类；可用 `--delay-frame` 复核页面阻塞 1 秒的场景。失败时先看状态和几何断言，不要据此直接改业务代码。
