# 登录尝试竞态：审查与修复证据（2026-10-09）

## 边界

本报告覆盖网易云、QQ、酷狗的登录提交与关闭/替换/退出竞态。只使用假账号、隔离 VM 和临时 Cookie 文件，未登录真实平台，未读取维护者安装配置。官方窗口域名和汽水验证取消由另一组修复覆盖；不能用本报告替代其验证。

## 发现与修复

### P1：关闭、刷新或退出后的旧登录仍可落盘

- 位置：`server.js` 的 `/api/login/qr/key`、`/api/login/qr/check`、三个平台 `/login/cookie` 端点；`03-login-modal-flows.js` 的 `refreshQr`、官方窗口/手动导入流程及 `checkQr`；`04-user-modal-logout.js` 的退出入口。
- 复现：延迟网易二维码 803，关闭或刷新登录再释放响应；或者延迟官方窗口结果/Cookie POST 的请求体或账号探测，退出后再释放响应。
- 根因：服务端只在二维码检查开始时保存退出代次，没有登记二维码的当前性，旧 Cookie POST 在退出完成后开始更无法靠代次辨认。前端仅停定时器，未使已经在途的请求失效。
- 影响：用户关闭或退出后账号可能重新出现；旧账号结果可能覆盖后来选择的账号。
- 修复：`POST /api/login/attempt` 颁发每平台当前 attemptId，begin 替换旧尝试，cancel 只取消匹配的 ID。所有 Cookie 提交必须携带当前 ID；在读取请求体前保存退出代次，在候选探测后再次检查。网易 key/create/check 绑定 ID 与当前 key，二维码生成序号避免同一尝试的晚 key 覆盖新 key。前端关闭、换平台、切换登录模式和退出立即失效本地对象；晚 begin 得到的 ID 也会取消。
- 兼容性：仓库所有实际 `/login/cookie`、网易 key/create/check 调用者已迁移。缺失/过期 ID 返回 409，不再接受无法区分来源的旧 POST。网易服务端退出先清本地凭据，再撤销旧上游 Cookie，避免晚退出擦掉其间的新登录。
- 证据：真实 HTTP `login-logout-race.test.js` 正常扫码保存，logout/cancel/replace 晚 803 均 409 且临时 Cookie 文件未含旧会话。`login-attempt-contract.test.js` 执行实际三个 Cookie 端点块，覆盖缺 ID、请求体跨退出、探测跨退出/取消/替换；前端官方窗口和手动 Cookie 晚响应不再提交或更新账号。

### P1：已拒绝的新会话被保存并显示成功，覆盖旧凭据

- 位置：`server.js` 的 `getQQLoginInfo`、`fetchNeteaseLoginInfo`、网易/QQ Cookie 提交和网易 QR 成功分支。
- 复现：保留一份有效旧 Cookie，提交格式正确但账号接口明确 `sessionRejected` 的新 Cookie。旧实现先保存新 Cookie，网易将失败转换为 pending 登录；QQ 可同时返回 `loggedIn:true` 和 `sessionRejected:true`，前端只检查前者。
- 根因：把既有会话的临时探测容错复用于新凭据验收，且先写全局凭据再探测。
- 影响：有效旧账号被失效新账号覆盖，UI 与真实授权状态不一致。
- 修复：候选网易与 QQ Cookie 以显式参数独立探测，资料/VIP/native 请求均使用候选授权，验证期间不替换全局 Cookie。明确拒绝返回 401、`loggedIn:false`、`saved:false`，保留旧凭据。QQ 既有会话的两次拒绝确认容错保留；新候选明确失败。网易网络/临时资料失败与明确失效分开，前者保留 `unverified`、`pendingProfile`。酷狗需要验证时透传验证信息并 `saved:false`，不覆盖既有客户端 token。
- 证据：实际端点 VM 验证候选探测仍看到旧全局 Cookie，拒绝时没有保存调用；QQ native 探测验证使用候选授权，既有会话与新候选具有不同登录判定；酷狗验证回归验证 challenge 在登录成功处理前传递。

### P2：旧成功定时器可关闭新登录窗口或复活退出后的 UI

- 位置：`03-login-modal-flows.js` 的 Cookie/官方登录成功延迟关闭、`checkQr` 的资料同步定时器和 `connectLoginMode` 的延迟打开。
- 复现：成功后在 420–1200ms 内关闭并重新打开另一轮登录；或在二维码资料同步请求期间退出。
- 根因：定时器回调和二次 await 没有绑定原尝试。
- 影响：新登录窗口被旧流程关闭，晚资料同步更新退出后的账号 UI。
- 修复：延迟打开绑定 provider/seq；所有成功关闭绑定 attempt 对象，资料同步前后检查当前性，明确拒绝不再强制复活 loggedIn。晚失败与 finally 也不修改新尝试的忙状态。
- 证据：新尝试替换后执行旧成功定时器，无关闭或 toast；二维码在途关闭、官方结果晚到、手动 Cookie 响应晚到均不更新账号状态。

## 共享授权失效信号

提供 `providerAuthEpoch(provider)` 纯数字会话代次。登录开始/成功和退出开始递增，触发 `window` 上的 `provider-auth-session-changed`（仅 provider）及音质运行时 cap 失效钩子。事件及缓存键不含凭据，供评论缓存、播放取链和相邻预取隔离账号使用。

## 验证记录

以下定向命令完成，119 项通过：

`node --test tests/login-attempt-contract.test.js tests/client-qr-login.test.js tests/login-logout-race.test.js tests/inline-login-lifecycle.test.js tests/kugou-verification-flow.test.js tests/login-presence-check.test.js tests/login-entry-direct.test.js tests/login-qr-loading.test.js tests/qq-native-protocol.test.js tests/provider-login-state-recovery.test.js tests/kugou-login-bridge.test.js`

`node --check server.js`、`node --check public/js/modules/08-account/03-login-modal-flows.js`、`git diff --check` 通过。定向验证不代表真实平台风控、Windows 登录窗口体验或全量工程审查全部通过；真实账号验收仍需维护者进行。
