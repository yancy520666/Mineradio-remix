# VB-CABLE 下载与可见安装器交接验证

本轮实现 Windows x64 的首次安装辅助：用户在主播放器明确确认后，下载官方基础 VB-CABLE 原包，验证完整 ZIP、所有配套文件及 Windows Authenticode，再以 RunAs 打开可见的官方安装程序。安装按钮、管理员授权、许可确认和重启仍由用户完成。未自动改变默认音频设备，也未运行任何静默安装参数。

## 官方来源与许可范围

- [VB-CABLE 官方下载页](https://vb-audio.com/Cable/) 和 [官方参考手册](https://vb-audio.com/Cable/VBCABLE_ReferenceManual.pdf) 要求保留全部解压文件、管理员安装、安装后重启。Windows 可能自动改变默认播放和录音设备。
- [当前官方许可说明](https://vb-audio.com/Services/licensing.htm) 对基础 VB-CABLE 给出了应用分发与安装集成的条件许可：显著标明来源、Donationware 和捐赠渠道。本实现原生确认及前端入口均保留这些信息；[官方捐赠入口](https://shop.vb-audio.com/en/win-apps/11-vb-cable.html) 只打开信息页，不下单。
- 原包 readme 同时要求其他软件安装流程集成得到作者同意。当前官网条件许可与原包措辞的适用关系仍应在商业、机构或后续捆绑分发前核实，不能称已经取得另外的作者书面授权。完整 readme 与原始 ZIP 均保留；本次源码不包含驱动二进制，不分发 A+B/C+D 包。

## 安全检查与生命周期

固定官方 HTTPS Pack45 地址，拒绝改源重定向、凭据、非默认端口、超时、超量及不同摘要。原包大小 1,318,877 字节，SHA-256：b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb。

31 个固定平面文件，总展开大小 3,467,579 字节。ZIP 与每个文件分别校验摘要，拒绝路径穿越、符号链接、重复名称、未知文件、加密、ZIP64 及未支持压缩布局。运行前另在 Windows 校验精确目录白名单、文件大小、所有文件摘要和 reparse point，再要求 Authenticode Status Valid、预期发布者证书 DER SHA-256。证书过去的到期日期不能用来绕过 Windows 的时间戳与信任判断。

安装器 x64 SHA-256：734c35dfa6d98f48782a451633ceb471166ec70d60482fd89a1123d0ee3c4f41。预期证书 DER SHA-256：6c37d5dda6b7e880b38339e233689c302e7d26ccfdac019b3c3f4bd16330a794。未将“存在签名”当作 Windows 有效签名。

主 renderer 必须是精确主 frame；导航、丢失 renderer、关闭及退出在管理员交接前取消。相同 URL 重载有独立 generation fence。开始交接后不杀官方安装器、不谎称取消；已打开不等于已安装，退出码也不代表驱动就绪。已知进程退出后清理自有文件；状态未知时保留有界文件并阻止重复启动。缓存最多保留两个任务目录，不递归删除未知或替换后的文件。

PowerShell 使用系统固定路径与编码命令，没有 ExecutionPolicy Bypass；31 文件数据加单个循环将实际编码命令控制在 Windows CreateProcess 限额以内，运行前另强制全命令小于 24,000 字符。此防护不声称完全消除同用户本地篡改的 TOCTOU 风险。

## 验证证据与未验证项

- [定向 Node 日志](qa/virtual-audio-setup-20261010/focused-node.log)：完全假网络、假文件或临时测试目录、假签名和假进程协议，包含取消迟到、同 URL 重载、未知启动/退出、完整真实 manifest 的命令长度；没有运行真实驱动。
- [官方包静态兼容证据](qa/virtual-audio-setup-20261010/static-package-compatibility.json)：仅对先前下载的官方包在内存验证 31 个文件，不提取到系统目录、不执行。
- 本环境没有执行 Windows Authenticode 信任链、撤销检查、UAC、真实驱动安装、重启或游戏录音路由。运行时任一签名或完整性校验失败只返回错误与显式官网回退，不能自动继续安装。

相关实现：desktop/virtual-audio-package.js、desktop/virtual-audio-installer.js、desktop/virtual-audio-setup.js、desktop/main.js、desktop/preload.js。
