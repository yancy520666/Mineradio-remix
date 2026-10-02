# 隐私与用户数据说明

Mineradio 是本地桌面应用。项目不应把用户登录状态、Cookie、播放历史、搜索历史、自定义封面、自定义歌词或本地缓存提交到 GitHub。

## 本地数据

应用可能在本机保存以下数据：

- 网易云音乐登录 Cookie
- QQ 音乐登录 Cookie
- 搜索历史
- 自定义专辑封面
- 自定义歌词
- 歌词布局与视觉控制设置
- 本地节奏分析缓存

这些数据用于本地体验，不属于开源仓库内容。

Windows 桌面运行时，四个平台的登录 Cookie、汽水 Token 和汽水扫码会话配置使用 Electron `safeStorage` 加密。已有明文会话在可用时迁移；系统加密不可用时不写新的明文凭据。加密仅保护磁盘存储，同一 Windows 用户下的其他程序仍可能访问正在运行的应用或解密能力。[Electron 安全存储说明](https://www.electronjs.org/docs/latest/api/safe-storage)。

用户主动导出的登录 Cookie 文本仍是明文，请自行保管。独立运行 `node server.js` 不具有 Electron 系统加密能力，保留原有本地凭据格式；桌面应用与独立服务器均仅监听回环地址。原版 profile 的显式导入保留原始 profile，应用自身旧缓存目录中的凭据则在稳定存储验证成功后退役，防止退出登录后恢复旧会话。

## 不应上传的内容

以下内容不应提交到 GitHub：

- `.cookie`
- `.qq-cookie`
- `node_modules/`
- Electron 打包产物
- 用户上传的本地音乐文件
- 用户账号信息、Cookie、Token、二维码登录状态

## 第三方平台

天气 IP 定位接口通过 HTTPS 请求 `ipwho.is` 获取城市级粗略位置，用于天气查询；服务方会看到请求来源 IP。当前主页没有自动调用该定位接口，不会因此在每次启动时新增定位请求。[服务说明](https://ipwhois.io/documentation)。

系统 DNS 将已知音乐或封面域名解析为 fake-IP 时，媒体代理可向阿里公共 DNS 的 HTTPS 接口请求该域名的真实地址。此请求只包含域名和 DNS 查询类型，不包含音乐账号、Cookie、歌曲 URL 路径或播放历史；DNS 服务方仍会看到请求来源 IP。结果有有限的 TTL 缓存。设置 `MINERADIO_MUSIC_DOH=0` 可关闭此兼容路径。[阿里公共 DNS](https://www.alidns.com/)。

用户通过网易云音乐、QQ 音乐等第三方平台登录时，应遵守对应平台的用户协议。Mineradio 不提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。
