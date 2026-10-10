# 完整桌面模式原生滚轮调查（2026-10-10）

## 结论

没有把原生滚轮标为已修复，也没有加入计时补发、全局鼠标 hook 或 Windows 设置变更。当前 Linux 环境无法测量用户 Windows 上 WM_MOUSEWHEEL 的实际目标 HWND；仅凭源码不能宣布桌面滚轮永远不可行。当前可安全交付的方案是仅在解锁的完整桌面模式加入鼠标拖动滚动，保留现有滚轮行为。

## 仓库证据

- 基线：247976d；Electron 42.10.0。
- desktop/full-desktop-mode-runtime.js 的 desktopWindowCoexistAttachScript 把主 HWND 变为 WS_CHILD，SetParent 到 SHELLDLL_DefView，SetWindowPos(HWND_BOTTOM) 维持在 Explorer 的 SysListView32 下方。
- desktop/desktop-native-icon-layer-runtime.js 用 Explorer ListView 的 layered color-key 保留原生图标和命中；不重建或拦截桌面图标输入。
- requestKeyboardFocus 仅调用 webContents.focus，刻意不执行 BrowserWindow.focus/show/moveTop，以免破坏桌面排序。
- 没有 WM_MOUSEWHEEL / WM_MOUSEHWHEEL 主窗口转交逻辑。前端列表、歌单架、音量等已有 wheel 监听，因此事件未进入 renderer 时它们无法修复上游丢失。

## 官方实现证据

1. Windows WM_MOUSEWHEEL 发往焦点窗口，默认处理会沿父链传播：
   https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-mousewheel
2. Electron 42.10.0 的 PreHandleMSG 先 NotifyWindowMessage，然后继续默认处理；hookWindowMessage 回调参数只有 wParam/lParam，没有 preventDefault 或可靠“替代处理”契约：
   https://www.electronjs.org/docs/latest/api/base-window#winhookwindowmessagemessage-callback-windows
   https://raw.githubusercontent.com/electron/electron/v42.10.0/shell/browser/native_window_views_win.cc
3. Electron 42.10.0 DEPS 指向 Chromium 148.0.7778.280：
   https://raw.githubusercontent.com/electron/electron/v42.10.0/DEPS
4. Chromium 148 的 HWNDMessageHandler 先 RerouteMouseWheel，再调用 renderer 的 HandleMouseEvent。当前上游 RerouteMouseWheel 用 WindowFromPoint 判断；不同进程且不允许重路由的窗口会使当前消息停止处理：
   https://raw.githubusercontent.com/chromium/chromium/148.0.7778.280/ui/views/win/hwnd_message_handler.cc
   https://raw.githubusercontent.com/chromium/chromium/main/ui/base/win/mouse_wheel_util.cc
   注意：透明 Explorer 层是否为用户系统的实际 WindowFromPoint 结果仍是待实机验证的推断。
5. 原生消息的 input-event 并非 WM 处理完成回执。InputRouterImpl::SendWheelEvent 进入 wheel_event_queue；RenderInputRouter 在 OnInputDispatchedToRendererResult 才通知观察者，因此“等一拍没有 input-event 就补发”不能安全证明默认事件丢失：
   https://raw.githubusercontent.com/chromium/chromium/148.0.7778.280/components/input/input_router_impl.cc
   https://raw.githubusercontent.com/chromium/chromium/148.0.7778.280/components/input/render_input_router.cc
   https://raw.githubusercontent.com/chromium/chromium/main/components/input/mouse_wheel_event_queue.cc
6. sendInputEvent 直接 ForwardWheelEvent，可绕过原生 HWND 路由，但文档要求窗口焦点，且不会撤销原生默认事件。无法用它解决既不重复又保证送达的问题：
   https://www.electronjs.org/docs/latest/api/web-contents#contentssendinputeventinputevent
   https://raw.githubusercontent.com/electron/electron/v42.10.0/shell/browser/api/electron_api_web_contents.cc

## 验证范围

运行三个原有桌面/图标隔离模拟测试文件；59 通过，1 个 Windows C# 编译检查跳过，无失败。原始日志见 native-baseline-test.log。未运行 login-logout-race，未使用账号、设备或真实配置，未安装下载软件、提交或推送。

用户 Windows 上仍需验收：普通窗口滚轮、进入桌面后的未点击/已点击滚轮、图标显示/隐藏后的滚轮、软件锁定/解锁、退出桌面后的恢复。拖动兜底须覆盖滚动容器、拖动阈值、点击抑制、文本/按钮/滑块冲突、pointercancel/blur/切模式清理。
