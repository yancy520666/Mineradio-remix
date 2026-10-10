# QQ 扫码说明与布局

用户原图实际查看于 2026-10-10。内容属于应用自有登录抽屉，不属于 QQ 官方窗口。

## 修改

- 标题：`扫码登录QQ 音乐` → `扫码登录 QQ 音乐`。
- 说明：`请用 QQ 音乐 App 扫码；QQ／微信扫一扫请点下方“QQ 网页登录”。` → `请用 QQ 音乐 App 扫码`。
- 正常待扫码重复状态：`请使用QQ 音乐 App（不支持 QQ／微信扫一扫）扫码` → 空内容；QQ 网页登录按钮保留。
- 过期、已扫码、失败、载入、安全验证信息保持现有行为。没有改变登录接口、扫码流程、来源校验或完成门控。
- QR 状态加 `role=status`、`aria-live=polite`、`aria-atomic=true`，异常文本没有隐藏。
- 样式仅在 QQ 内嵌扫码模式生效，不进入 Cookie 模式：文字与二维码间距 24px；标题 16px/1.4、说明和状态 12px；合并按钮区重复 margin；按钮左对齐；560px 以下单列主体、两列按钮。

## 已验证

`node --test tests/qq-scan-presentation.test.js tests/login-validation-presentation.test.js tests/inline-login-lifecycle.test.js tests/login-qr-loading.test.js tests/qq-login-navigation.test.js`：27/27。

`node --check public/js/modules/08-account/03-login-modal-flows.js` 和 `git diff --check`：通过。

## 未验证

安装的 Chromium 尝试渲染隔离本地 DOM/CSS 夹具时，进程启动因 `socket() failed: Operation not permitted` 中止；提升执行后仍失败，未生成修后截图。原图已看，但不能声称新布局已在浏览器目测通过。未运行真实账号扫码、官方验证码、Windows Electron、安装器或已取消的 login-logout-race 测试。未下载 Electron。
