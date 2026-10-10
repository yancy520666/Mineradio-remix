const fs=require('fs'),crypto=require('crypto');
const inventory=JSON.parse(fs.readFileSync('docs/QA_INVENTORY_2026-10-09.json','utf8'));
const notes={
'04-shelf/00-layout-hover.js':'棚架模式/可见性/hover 命中、setShelfPinnedOpen 与搜索退让；UI入口源读，几何公式交叉交资源审查',
'04-shelf/01-manager-core.js':'manager.create/rebuild/openContent/scrollBy/next/prev/row 池与纹理；入口与资源owner源读，真实WebGL/raycast未验',
'04-shelf/02-rebuild-panel-sync.js':'safeShelfRebuild/scheduleShelfRebuild/safeShelfCloseContent、隐藏DOM队列延迟刷新及blur/out离场',
'04-shelf/03-content-list-manager.js':'3D content open/close、窗口化歌曲行/动作命中、close封面视口退休；资源子审真实函数VM',
'04-shelf/04-cover-api-helpers.js':'compactCount/Canvas heart，pointer-only动作说明；无DOM等价语义的边界',
'04-shelf/04a-cover-loader.js':'图片owner/cache/active/nearby/prune/online/pagehide；资源子审VM',
'04-shelf/05-card-interactions.js':'renderer click/contextmenu/wheel、3D歌曲四动作、拖动误点击与回正入口；未跑真实3D',
'04-shelf/06-keyboard-camera-events.js':'capture/bubble keydown/keyup、自由相机R/K/WASDQE、Space与PageUp/Down所有权；本项VM',
'06-lyrics/00-built-in-playlists.js':'prompt/create/rename/remove/read/write的UI结果及空输入/并发prompt；持久化事务另组',
'06-lyrics/00-lyrics-fetch-parse.js':'平台获取/解析/版本选择/翻译回退的UI接缝；取链与平台端交叉另组',
'06-lyrics/01-playlist-panel-shell.js':'列表/迷你队列native标题、行按钮、长按重排入口、滚动/close/pin、catalog刷新所有权交叉',
'06-lyrics/01a-scroll-motion.js':'return motion owner、虚拟目录定位、reduced motion、pointer/key中止、sticky clip与ResizeObserver',
'06-lyrics/02-playlist-detail.js':'detail key/token、虚拟row/play、分页/load-more按钮、收藏await迟到guard、艺术家/专辑入口',
'06-lyrics/03-podcast-playlist-loaders.js':'podcast/radio与playlist loaders、切换返回UI；平台请求所有权交叉另组',
'06-lyrics/04-progress-seek.js':'指针seek起止/取消/hold与媒体token接缝；非指针入口缺失；取消恢复修复由播放组',
'06-lyrics/05-upload-dragdrop.js':'导入按钮/文件drop/离场、重排边界和当前列表接管；真实OS选择器未验',
'06-lyrics/06-lyric-timing-offset.js':'按歌曲key的±5秒/500条偏移、focus/hover兄弟面板抑制、blur与close；VM回归',
'08-account/00-update-preview.js':'safe update URL、预览/下载来源/进度/失败文案、close及旧平台接口；网络与安装交桌面组',
'08-account/01-login-modal-utils.js':'所有modal-mask共享角色/焦点/Tab/Escape/嵌套/归还、provider次序及顶栏拖拽入口；本项VM/独立Chromium',
'08-account/01a-avatar-recovery.js':'动态头像委托error/load、三次退避、fallback、online/pagehide timer退休；源码与已有VM',
'08-account/01b-content-priority.js':'账号自选次序到推荐/search/队列优先的映射；初始化回退',
'08-account/02-login-status.js':'账号在线/会员待确认/能力文案到顶栏/登录面板；刷新epoch由平台组修复，未用真账号',
'08-account/03-login-modal-flows.js':'各provider QR/网页/Cookie节点、刷新取消、客户端验证与二维码交接；UI段源读与既有VM，非完整2235行语义穷举',
'08-account/04-user-modal-logout.js':'用户弹窗动作/登录平台切换/退出关闭/导出数据入口；实际账号写操作另组',
'08-account/05-startup-login-guide.js':'startup guide未登录/见过/播放/模态/导入冲突守卫，延迟复核与粒子退场',
'08-account/06-original-profile-import.js':'只补缺失项UI/二次confirm/重启失败按钮恢复/guide续接；Windows磁盘与重启另组',
'09-idle-toast-libraries.js':'idle guide/控制条自动隐藏/notify/live toast与loadScriptOnce接缝；资源loader改动另组',
'09a-onboarding-guide.js':'首次八步引导目标/peek保留/中止恢复/键盘结束/reduced motion；已有Node VM',
'10-shell/00-gesture-control.js':'camera permission UI、启停/载入失败/后台暂停接缝；实际Camera/Hands由资源组',
'10-shell/01-viewport-resize-shortcuts.js':'全局快捷键尊重UI目标与已消费事件、Escape优先级、resize/fullscreen；本项VM/独立Chromium',
'10-shell/02-peek-panels-upload.js':'全文件mouse/edge/peek计时/上传提示路径源读；焦点保留/退出续hide/显式关闭本项VM/Chromium',
'10-shell/03-splash.js':'startup启停/导入和guide接缝、减少动态效果/结束退出；动画源码交叉，未整场视觉验收',
'10-shell/04-desktop-overlay-fullscreen.js':'shield目标清单/active/opacity/clipped viewport判定、desktop歌词payload/状态bridge/fullscreen/minimize段；不是1639行全公式穷举',
'10-shell/05-startup-bindings.js':'模块初始化顺序、先restore再login/home、collect Enter/custom lyric CtrlEnter与beforeunload保存',
'05-playback/00-api-quality-output.js':'质量和输出控制UI、native路由按钮等价拖线操作、refresh焦点保护；硬件输出事务交播放组',
'05-playback/01-cover-custom-map.js':'isTypingTarget/isKeyboardUiTarget共享判定、封面持久化入口；VM键盘所有权',
'05-playback/03a-home-dashboard.js':'首页推荐/发现卡与MP4选择/clear/object URL/deep sleep/editToken，stable art owner；Node VM/资源子审',
'05-playback/06-track-detail-lyrics-actions.js':'歌曲/歌手/专辑/歌词/collect入口、collect native键盘等价、结果关闭；源读/独立Chromium',
'05-playback/06a-comment-replies.js':'楼中楼toggle aria-expanded/region/live status、分页/owner seq/去重/关闭；Node VM',
'05-playback/06b-comment-avatars.js':'滚动头像owner/shared budget/cache/close cancel；资源子审',
'05-playback/07-search.js':'query/category/provider/page/searchSongResultHtml/playSearchResult和空态、DOM播歌标题；VM/独立Chromium',
'05-playback/20-microphone-mixer-ui.js':'panel懒挂载、展开/设备选择/permission提示/slider和mute状态；VM+独立Chromium假设备，未getUserMedia',
'07-fx/06-hotkeys.js':'动态hotkey-modal打开/捕获/Escape/close源读；复用modal生命周期，保持捕获Escape/Tab所有权；VM/独立Chromium',
'07-fx/09-console-workspace.js':'六分组workspace/元素移动/搜索、初始化range label/34 div toggle semantics；VM/独立Chromium',
'public/index.html':'自有控件/inline handler/15模态/词/评论/歌词/桌面设置入口的全量静态清单；live status修复',
'public/css/index.css':'多层主题/原生标题几何与focus-visible/模态根focus样式的相关规则读取；并非2万行每项CSS全主题渲染',
'public/desktop-lyrics.html':'独立浮窗native关闭、pointer拖动/锁定/cancel/blur/message/resize及frame调度段；Windows窗口操作未验'
};
const paths=[...new Set([...Object.entries(inventory.groups).filter(([k])=>/^frontend\/(04-shelf|06-lyrics|08-account|09|10-shell)/.test(k)).flatMap(([,v])=>v.paths),...Object.keys(notes).filter(k=>k.startsWith('05-')||k.startsWith('07-')).map(k=>'public/js/modules/'+k),'public/index.html','public/css/index.css','public/desktop-lyrics.html'])];
const files=paths.map(path=>{const s=fs.readFileSync(path,'utf8'),key=path.replace('public/js/modules/','');return {path,lines:s.split('\n').length,sha256:crypto.createHash('sha256').update(s).digest('hex'),static_entry_scan:true,source_review:notes[key]||'全文件入口扫描；相关UI接缝阅读，未完整运行',function_entrypoints:[...s.matchAll(/^\s*(?:async\s+)?function\s+([\w$]+)\s*\(/gm)].map(m=>m[1]),complete_main_application:false};});
const native=new Set(['F03','F04','F05','F06','F14','F23','F26','F28','F34','F38','F39','F41','F42','F44','F60']);
const vms=new Set(['F02','F03','F04','F05','F06','F07','F08','F09','F11','F14','F15','F23','F26','F27','F28','F30','F31','F32','F33','F34','F38','F39','F41','F42','F43','F44','F45','F47','F60']);
const delegated=new Set(['F01','F13','F18','F19','F21','F24','F36','F37','F40','F50','F51','F52','F53','F54','F55','F56','F57','F58','F59','F61']);
const detail={F03:'只验证公共登录模态的键盘/焦点，不是网易扫码网络往返',F04:'只验证公共登录模态，不是QQ个人授权或全曲',F05:'公共登录模态；独立酷狗验证窗口另组证据，不是账号成功',F06:'公共登录模态；未个人汽水授权',F11:'home MP4/stable art与推荐/卡片source+VM；未真实首页已登录数据',F14:'搜索标题native Enter/Space单次、原几何；分页/拼音VM',F23:'队列/迷你标题native键盘，鼠标标题longpress与误点击抑制夹具；队列状态事务另组',F26:'collect列表keyboard动作使用fake song/list；真正持久化另组',F27:'当前详情key/token保护的延迟收藏VM；远端写账号另组',F28:'DOM详情标题native键盘；3D棚架仅源审/cover关闭VM',F34:'歌词编辑modal Escape；paused timing VM（stage修复后通过）；未真实字幕手感',F38:'生成假设备路由UI、Escape与SELECT刷新focus；未真实声卡或拖线输出',F39:'懒挂载混音展开/fake device SELECT原生focus；没有权限或真实麦克风',F41:'全局键盘所有权和动态hotkey-modal native Tab/录入Tab/Escape/归还；全屏/鼠标侧键仅相关source，真实Windows全局注册未验',F42:'modal-mask/hotkey Tab/Escape/归还、peek焦点/退出续hide、toast属性；非全部动态popover全覆盖',F44:'Fx div toggle native keyboard及range.labels；不是所有主题/字体截图通过',F45:'MP4 shouldPlay/editToken+背景owner VM；真实视频解码/IDB配额未验',F48:'standalone HTML pointer/close/bridge源审；真实Windows浮窗未运行',F49:'shield/fullscreen/桌面设置markup相关source；真实Windows图标输入未验',F60:'控件清单+部分共享helper/代表入口；3D/seek和部分click-only元信息仍有缺口'};
const features=inventory.user_function_paths.map(f=>({id:f.id,feature:f.feature,source_files:f.source_files,ui_source_scope:delegated.has(f.id)?'交叉入口扫描/相关段源读；主体归其他审查': 'UI入口/调用链接缝源审',node_vm:vms.has(f.id)?'本项定向或已有VM已运行，仅其断言范围':'本项未运行对应主体',independent_chromium:native.has(f.id)?'代表性局部夹具，假动作/假数据':'本项未运行',complete_main_application:'未验证：主应用singleInstance Unix socket EPERM，未绕过',detail:detail[f.id]|| (delegated.has(f.id)?'请合并根报告对应负责组证据；这里不宣称通过':'源读/部分相关VM，不等同用户完整端到端操作通过')}));
fs.writeFileSync('docs/QA_UI_COVERAGE_2026-10-09.json',JSON.stringify({date:'2026-10-09',baseline:'451b6cf',evidence_model:{static:'全文件入口扫描，不能证明运行',source:'逐文件说明相关实际读取/跟踪范围，不代表全文件语义穷举',vm:'真实函数+受控替身，不能证明完整UI/硬件',chromium:'独立Electron加载生产markup/CSS/选定handlers；没有main.js/server/audio/accounts/WebGL',full_application:'未验'},files,features},null,2)+'\n');
