# 按严重级别排列的问题导航

这是专题报告的分项导航，不是独立缺陷计数：部分跨层问题会在多个报告出现；历史缺陷、本轮新增集成回归和未修风险须按各节的证据/状态区分。没有确认P0并不证明不存在P0。修复方案、文件/函数位置、复现步骤、影响范围、根因和实际验证在对应报告节中。未修项及发布门槛另见工程总报告。

| 级别 | 问题节（保留原编号） | 详细证据 |
|---|---|---|
| P0 | 确认问题（P0–P3） | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P1 | P1：评论读取没有截止时间与完整生命周期 | [COMMENT_COVER_OPTIMIZATION_2026-10-09.md](COMMENT_COVER_OPTIMIZATION_2026-10-09.md) |
| P1 | P1：关闭、刷新或退出后的旧登录仍可落盘 | [LOGIN_ATTEMPT_FIX_2026-10-09.md](LOGIN_ATTEMPT_FIX_2026-10-09.md) |
| P1 | P1：已拒绝的新会话被保存并显示成功，覆盖旧凭据 | [LOGIN_ATTEMPT_FIX_2026-10-09.md](LOGIN_ATTEMPT_FIX_2026-10-09.md) |
| P1 | AR13 · P1 · 字体owner改造中新引入classic初始化回归（本轮新增，已纠正） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P1 | DS-01 · P1 · MFA component source is not constrained | [QA_DESKTOP_SECURITY_2026-10-09.md](QA_DESKTOP_SECURITY_2026-10-09.md) |
| P1 | DS-04 · P1 follow-up gate · Vulnerable installed dependencies | [QA_DESKTOP_SECURITY_2026-10-09.md](QA_DESKTOP_SECURITY_2026-10-09.md) |
| P1 | P1-01 业务写入会跨账号执行或把旧提交结果写成新会话成功 | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P1 | P1-02 酷狗喜欢歌曲 fileId / favorite list 缓存跨账号串用 | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P1 | P1-03 汽水 PC player-info URL 未验证且发送账号Cookie | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P1 | P1-04 网易私有歌单索引跨账号共享及旧请求复填 | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P2 | P2：头像联网恢复被失败冷却挡住 | [COMMENT_COVER_OPTIMIZATION_2026-10-09.md](COMMENT_COVER_OPTIMIZATION_2026-10-09.md) |
| P2 | P2：封面上游任务缺乏全局容量、总期限和订阅取消 | [COMMENT_COVER_OPTIMIZATION_2026-10-09.md](COMMENT_COVER_OPTIMIZATION_2026-10-09.md) |
| P2 | P2：短时重复打开评论首屏仍重复等待上游 | [COMMENT_COVER_OPTIMIZATION_2026-10-09.md](COMMENT_COVER_OPTIMIZATION_2026-10-09.md) |
| P2 | P2：重复楼中楼页错误显示到底 | [COMMENT_COVER_OPTIMIZATION_2026-10-09.md](COMMENT_COVER_OPTIMIZATION_2026-10-09.md) |
| P2 | P2：旧成功定时器可关闭新登录窗口或复活退出后的 UI | [LOGIN_ATTEMPT_FIX_2026-10-09.md](LOGIN_ATTEMPT_FIX_2026-10-09.md) |
| P2 | AR01 · P2 · 手势迟到启动/推理清理错属会话（已修） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P2 | AR02 · P2 · 自定义字体删除/替换不退休FontFaceSet（已修） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P2 | AR03 · P2 · SDK加载把pending/failed script当成功（已修） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P2 | AR04 · P2 · 过期分析仍下载/解码，后端不同请求没有并发所有权（已修，原生不可中断边界保留） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P2 | AR06 · P2 · 自定义背景视频旧blob无应用级回收（未修，用户媒体策略待决定） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P2 | AR12 · P2 · 音频附加路由部分构建失败遗漏所有权（已修） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P2 | SLY-02 交叉 · P2 · 暂停编辑完成只换文字、未恢复效果与所选HD（舞台组主修，本项补quality/upload归属） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P2 | CF-01 / P2：已知真实时长被拍尾估计补长 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-02 / P2：已有显式 downbeat 又按数组索引捏造拍头 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-03 / P2：末尾 crossfade 未预算 B 预滚与保护区间 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-04 / P2：零时长/无可播放目标仍产“成功”零时刻 handoff | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-05 / P2：歌词避让把 terminal rescue 推过真实有效尾 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-07 / P2：feedback 新嵌套 musical/bridge 二次压缩丢失 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-11 / P2：多时间标签 LRC 丢复唱并把时间戳当歌词 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-12 / P2：trusted climax 太靠近 B 尾，teaser 播出媒体范围 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | CF-U01 / P2：synthetic bridge 规划96s，运行容量64s | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | 已修问题（P2/P3） | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P2 | DS-02 · P2 · Original Spotify import bypasses encrypted credential storage | [QA_DESKTOP_SECURITY_2026-10-09.md](QA_DESKTOP_SECURITY_2026-10-09.md) |
| P2 | DS-03 · P2 · Request-body errors are success-shaped and lack complete cleanup | [QA_DESKTOP_SECURITY_2026-10-09.md](QA_DESKTOP_SECURITY_2026-10-09.md) |
| P2 | DS-05 · P2 release gate · Resource redistribution authorization is unverified | [QA_DESKTOP_SECURITY_2026-10-09.md](QA_DESKTOP_SECURITY_2026-10-09.md) |
| P2 | P2-01 有效网易原文被可选 legacy 翻译失败丢弃 | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P2 | P2-02 酷狗 / 汽水专用 metadata transport 无body上限并忽略signal | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P2 | P2-03 红心 / 专辑收藏缓存和pending操作没有账号epoch所有权 | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P2 | P2-04 普通登录状态刷新晚回可复活旧账号或降级新账号 | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P2 | P2-05（并入 P2-02 的独立集成复现）error destroy 重入导致无限错误递归 | [QA_PLATFORM_NETWORK_2026-10-09.md](QA_PLATFORM_NETWORK_2026-10-09.md) |
| P2 | PBL-01 · P2 · 内置歌单删除后未加载尾页消失 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-02 · P2 · 内置歌单删除双击误删相邻歌曲 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-03 · P2 · 旧歌单尾页 next await 改变新选中歌曲 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-04 · P2 · 清空队列继续播旧音频并允许磁盘检查点复活 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-05 · P2 · 旧首批歌单或播客请求覆盖新队列 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-06 · P2 · 进度拖动 pointercancel 后原来播放的歌永久暂停 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-07 · P2 · AutoMix 旧 prepare rejection 清掉新 ready plan | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-08 · P2 · 本地检查点恢复丢混合队列、shuffle，并带回无关导入曲目 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-09 · P2 · await 中重排队列覆盖邻曲（本地/主取链/普通换源/汽水补全） | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-10 · P2 · AutoMix 旧 execution 收尾清掉新执行 busy/UI | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-11 · P2 · ended 的 0ms 延迟推进跳过新歌或重复推进 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-12 · P2 · 慢本地导入和导入后封面 completion 改写新选择 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-13 · P2 · 旧本地节拍分析 reject 改写新分析状态 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-14 · P2 · 跨账号旧歌单目录/失败回填及 force refresh 错误复用 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-15 · P2 · 长本地/汽水及显式毫秒的 duration 单位错误 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-16 · P2 · 首页个人推荐前后端跨账号归属丢失 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | PBL-17 · P2 · 登录首次提交代次缺口及目录/首页自失效顺序 | [QA_PLAYBACK_LIBRARY_2026-10-09.md](QA_PLAYBACK_LIBRARY_2026-10-09.md) |
| P2 | SLY-01，P2：暂停时校准歌词时间，字幕保持在旧行 | [QA_STAGE_LYRICS_2026-10-09.md](QA_STAGE_LYRICS_2026-10-09.md) |
| P2 | SLY-02，P2：暂停时提交字体栅格编辑，协作构建与原样式恢复停住 | [QA_STAGE_LYRICS_2026-10-09.md](QA_STAGE_LYRICS_2026-10-09.md) |
| P2 | SLY-03，P2：冷启动已选自定义字体迟到时，已显示回退字形不刷新 | [QA_STAGE_LYRICS_2026-10-09.md](QA_STAGE_LYRICS_2026-10-09.md) |
| P2 | SLY-04，P2：同字体 key 就绪后，逐字比例继续使用旧回退字体度量 | [QA_STAGE_LYRICS_2026-10-09.md](QA_STAGE_LYRICS_2026-10-09.md) |
| P2 | R1 · P2 · 进度条没有键盘 seek / slider 语义（未改） | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | R3 · P2 · 3D Canvas及部分元信息仍是纯指针入口（未改） | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | R4 · P2 · 自定义背景视频 IDB 无应用预算/旧blob回收（未改） | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U1 · P2 · 全局快捷键抢占按钮和已消费事件 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U10 · P2 / U11 · P3 · 主页图片恢复/所有权，棚架关闭预取退休 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U12 · P2 · 动态热键设置不在共享模态焦点圈（已补齐） | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U2 · P2 · modal-mask 缺少统一焦点生命周期和 Escape 路由 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U3 · P2 · Fx 开关为 click-only div，滑块相邻标签未关联；toast 无状态语义 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U4 · P2 · 搜索/队列/详情直接播歌和收藏项无非指针入口 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U5 · P2 · 歌单收藏晚回响应清掉后来打开的详情 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U6 · P2 · 音频路由重绘丢掉麦克风设备 SELECT 焦点 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U7 · P2 · 鼠标离区自动隐藏会藏掉仍在键盘操作的面板 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P2 | U8 · P2 · 首页 MP4 忽略原生窗口深后台 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P3 | AR05 · P3 · RSS标签含混（已修） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P3 | AR07 · P3 · 汽水“96MiB”是多项留存目标，单项与在途不在同一预算（未修，区分已允许策略） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P3 | AR08 · P3 · 经典脚本重复声明与加载诊断维护风险（未重构） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P3 | AR09 · P3 · 精确源码regex把实现格式当行为（未大规模改写） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P3 | AR10 · P3 · CueField用户反馈日志增长与同步全量统计（未自动清历史） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P3 | AR11 · P3 · resize burst重复延时刷新（已最小优化） | [QA_ARCHITECTURE_RESOURCES_2026-10-09.md](QA_ARCHITECTURE_RESOURCES_2026-10-09.md) |
| P3 | CF-06 / P3：缺失 LUFS/true-peak 被当作有效 0dB | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P3 | CF-08 / P3：artifact 丢 bridge payload，不同计划得到同一 ID | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P3 | CF-09 / P3：source fingerprint 漏掉已拆分的 Cuefield runtime | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P3 | CF-10 / P3：负的边界距离被当作肯定证据 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P3 | CF-13 / P3：English “i” 命中了普通单词 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P3 | CF-14 / P3：中途打断增益坡度时，测窗改变了过去的斜率 | [QA_CUEFIELD_PLANNER_2026-10-09.md](QA_CUEFIELD_PLANNER_2026-10-09.md) |
| P3 | R5 · P3 · 需完整应用/实机的验收项 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
| P3 | U9 · P3 · 首页 MP4 较早编辑的 continuation 提交陈旧 metadata/成功提示 | [QA_UI_UX_2026-10-09.md](QA_UI_UX_2026-10-09.md) |
