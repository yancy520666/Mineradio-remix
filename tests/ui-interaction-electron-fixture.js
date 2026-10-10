'use strict';
// Partial renderer fixture: production markup/CSS and keyboard/modal helpers.
// It does not start desktop/main.js, the backend, accounts, media or 3D scene.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-ui-interaction-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const keyboard = read('public/js/modules/05-playback/01-cover-custom-map.js');
const account = read('public/js/modules/08-account/01-login-modal-utils.js');
const modalSource = account.slice(0, account.indexOf('function bindModalBackdropClose('));
const globals = `
var calls = [], freeCamera = {active:false,locked:false,keys:{}}, immersiveMode=false, diyPlayerMode=true, miniQueueOpen=false;
var desktopRuntimeState={fullscreen:false}, desktopFullscreenActive=false;
function escHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
var shelfManager={hasOpenContent:()=>false,next:()=>calls.push('shelfNext'),prev:()=>calls.push('shelfPrev')};
function handleConfiguredLocalHotkey(){return false} function shouldSuppressDefaultConfiguredHotkey(){return false}
function markRenderInteraction(){} function togglePlay(){calls.push('togglePlay')}
function nextTrack(){calls.push('nextTrack')} function prevTrack(){calls.push('prevTrack')} function adjustVolumeByKeyboard(){calls.push('volume')}
function goHome(){calls.push('home')} function toggleFreeCamera(){calls.push('camera')} function resetFreeCameraToDefault(){} function recenterCamera(){} function showToast(){}
function closeLoginModal(){calls.push('closeLogin');closeGsapModal(document.getElementById('login-modal'))} function closeUserModal(){} function toggleFxPanel(){} function togglePlaylistPanel(){}
function startSelectedLoginConnection(){calls.push('loginButton')} function logoutAllAccounts(){calls.push('loginButton')}
function closeAudioOutputWorkflowPanel(){calls.push('closeAudio');closeGsapModal(document.getElementById('audio-output-workflow-modal'))}
function closeCustomLyricModal(){calls.push('closeLyric');closeGsapModal(document.getElementById('custom-lyric-modal'))}
function toggleFx(key){calls.push('fx:'+key);document.getElementById('t-'+key).classList.toggle('on')}

`;
let html = read('public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
html = html.replace('</head>', `<link rel="stylesheet" href="${pathToFileURL(path.join(root,'public/css/index.css'))}"></head>`);
const page = path.join(profile, 'fixture.html'); fs.writeFileSync(page, html);
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (_request, callback) => callback({cancel:true}));
  const win = new BrowserWindow({width:960,height:540,frame:false,show:true,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  await win.loadFile(page);win.setSize(961,540);win.setSize(960,540);await wait(100);
  const evaluate = code => win.webContents.mainFrame.executeJavaScript(code);
  await evaluate(`document.getElementById('splash').style.display='none';document.body.classList.remove('splash-active');document.getElementById('loading-overlay').style.display='none';`);
  if (process.argv.includes('--gsap')) await evaluate(read('public/vendor/gsap.min.js') + ';void 0;');
  await evaluate(globals + keyboard.slice(0,keyboard.indexOf('function readCustomCoverMap(')) + modalSource + read('public/js/modules/04-shelf/06-keyboard-camera-events.js') + read('public/js/modules/10-shell/01-viewport-resize-shortcuts.js'));
  async function key(keyCode) {
    win.webContents.sendInputEvent({type:'keyDown',keyCode});
    if (keyCode === 'Space') win.webContents.sendInputEvent({type:'char',keyCode:' '});
    win.webContents.sendInputEvent({type:'keyUp',keyCode}); await wait(70);
  }
  await evaluate(`document.body.classList.add('desktop-shell');document.getElementById('search-area').classList.add('peek');document.getElementById('search-input').focus();openGsapModal(document.getElementById('login-modal'));`);
  await wait(process.argv.includes('--gsap') ? 750 : 70);
  const modalOpening = await evaluate(`({active:document.activeElement.id,inside:document.getElementById('login-modal').contains(document.activeElement),role:document.getElementById('login-modal').getAttribute('role')})`);
  assert.equal(modalOpening.inside,true);assert.equal(modalOpening.role,'dialog');
  await evaluate(`document.getElementById('login-reset-all-btn').focus();calls=[]`); await key('Space');
  const buttonSpace = await evaluate('calls.slice()');
  assert.deepEqual(buttonSpace, ['loginButton'], 'native button Space must activate the button without toggling player');
  await evaluate(`document.querySelector('#login-modal .original-profile-link').focus();calls=[]`); await key('Tab');
  const modalTab = await evaluate(`({active:document.activeElement.id || document.activeElement.className,inside:document.getElementById('login-modal').contains(document.activeElement)})`);
  assert.equal(modalTab.inside,true);
  const loginShot=path.join(profile,'login-fixture.png');win.setSize(961,540);win.setSize(960,540);await wait(100);fs.writeFileSync(loginShot,(await win.webContents.capturePage()).toPNG());
  await evaluate(`closeGsapModal(document.getElementById('login-modal'));openGsapModal(document.getElementById('audio-output-workflow-modal'));document.querySelector('#audio-output-workflow-modal .login-panel-close').focus();calls=[]`);
  await wait(process.argv.includes('--gsap') ? 750 : 70); await key('Escape'); await wait(process.argv.includes('--gsap') ? 400 : 70);
  const audioEscape = await evaluate(`({show:document.getElementById('audio-output-workflow-modal').classList.contains('show'),calls:calls.slice()})`);
  win.setSize(961,540);win.setSize(960,540);await wait(100);
  assert.equal(audioEscape.show,false);
  await evaluate(`openGsapModal(document.getElementById('custom-lyric-modal'));document.getElementById('custom-lyric-input').focus();calls=[]`);await wait(process.argv.includes('--gsap') ? 750 : 70);await key('Escape');await wait(process.argv.includes('--gsap') ? 400 : 70);
  const lyricEscape=await evaluate(`({show:document.getElementById('custom-lyric-modal').classList.contains('show'),calls:calls.slice()})`);assert.equal(lyricEscape.show,false);
  const workspace=read('public/js/modules/07-fx/09-console-workspace.js');await evaluate(workspace.slice(workspace.indexOf('function initializeFxControlAccessibility('),workspace.indexOf('function organizeFxConsoleWorkspace(')));
  await evaluate(`initializeFxControlAccessibility(document.getElementById('fx-panel'));document.body.classList.add('diy-mode');document.getElementById('fx-panel').classList.add('show');document.getElementById('t-aeroWaterTheme').focus();calls=[]`);await key('Space');
  const fxAccessibility=await evaluate(`({calls:calls.slice(),toggleRole:document.getElementById('t-aeroWaterTheme').getAttribute('role'),pressed:document.getElementById('t-aeroWaterTheme').getAttribute('aria-pressed'),rangeLabels:document.getElementById('fx-intensity').labels.length})`);assert.deepEqual(fxAccessibility.calls,['fx:aeroWaterTheme']);assert.equal(fxAccessibility.toggleRole,'button');assert.equal(fxAccessibility.rangeLabels,1);
  await evaluate(`document.getElementById('fx-panel').classList.remove('show');`);
  const peekSource=read('public/js/modules/10-shell/02-peek-panels-upload.js');
  await evaluate(`var emptyHomeActive=false,playlistPanelPinned=false;`+peekSource.slice(0,peekSource.indexOf('function uploadTipWasSeen(')));
  await evaluate(`document.getElementById('search-area').classList.add('peek');setPeek(document.getElementById('search-area'),false,'search',true);document.getElementById('upload-btn').focus();`);await wait(240);
  const peekFocus=await evaluate(`({peek:document.getElementById('search-area').classList.contains('peek'),active:document.activeElement.id})`);assert.equal(peekFocus.peek,true);assert.equal(peekFocus.active,'upload-btn');
  await evaluate(`document.activeElement.blur();`);await wait(240);
  const peekUnfocused=await evaluate(`document.getElementById('search-area').classList.contains('peek')`);assert.equal(peekUnfocused,false);
  await evaluate(`document.getElementById('search-area').classList.add('peek');document.getElementById('upload-btn').focus();setPeek(document.getElementById('search-area'),false,'search');`);await wait(240);
  const peekExplicitClose=await evaluate(`document.getElementById('search-area').classList.contains('peek')`);assert.equal(peekExplicitClose,false);
  const stores=read('public/js/modules/00-state/00-core-stores.js');
  const hotkeyState=stores.slice(stores.indexOf('var HOTKEY_ACTIONS = ['),stores.indexOf('var diyPlayerMode ='));
  await evaluate(`var HOTKEY_SETTINGS_STORE_KEY='fixture-hotkeys',globalHotkeyListenerBound=false;function getDesktopWindowApi(){return null}`+hotkeyState+read('public/js/modules/07-fx/06-hotkeys.js')+`;var hotkeySettings=readHotkeySettings();document.getElementById('search-area').classList.add('peek');document.getElementById('upload-btn').focus();openHotkeySettings();`);await wait(90);
  const hotkeyOpening=await evaluate(`({active:document.activeElement.id,role:document.getElementById('hotkey-modal').getAttribute('role'),dialogs:document.querySelectorAll('#hotkey-modal [role="dialog"]').length})`);assert.equal(hotkeyOpening.active,'hotkey-modal');assert.equal(hotkeyOpening.role,'dialog');assert.equal(hotkeyOpening.dialogs,0);
  const hotkeyShot=path.join(profile,'hotkey-fixture.png');fs.writeFileSync(hotkeyShot,(await win.webContents.capturePage()).toPNG());
  await evaluate(`(()=>{var list=modalFocusableElements(document.getElementById('hotkey-modal'));list[list.length-1].focus()})()`);await key('Tab');
  const hotkeyTab=await evaluate(`document.activeElement.hasAttribute('data-hotkey-close')`);assert.equal(hotkeyTab,true);
  await evaluate(`startHotkeyCapture('togglePlay','local')`);await key('Tab');
  const hotkeyTabCapture=await evaluate(`({binding:hotkeySettings.local.togglePlay,capturing:!!hotkeyCaptureState,show:document.getElementById('hotkey-modal').classList.contains('show')})`);assert.equal(hotkeyTabCapture.binding,'Tab');assert.equal(hotkeyTabCapture.capturing,false);assert.equal(hotkeyTabCapture.show,true);await evaluate(`setHotkeyBinding('togglePlay','local','Space')`);
  await evaluate(`startHotkeyCapture('togglePlay','local')`);await key('Escape');
  const hotkeyCaptureEscape=await evaluate(`({show:document.getElementById('hotkey-modal').classList.contains('show'),capturing:!!hotkeyCaptureState})`);assert.equal(hotkeyCaptureEscape.show,true);assert.equal(hotkeyCaptureEscape.capturing,false);
  await key('Escape');const hotkeyClose=await evaluate(`({show:document.getElementById('hotkey-modal').classList.contains('show'),active:document.activeElement.id})`);assert.equal(hotkeyClose.show,false);assert.equal(hotkeyClose.active,'upload-btn');
  const outputSource=read('public/js/modules/05-playback/00-api-quality-output.js');
  const outputFunction=name=>{const start=outputSource.indexOf('function '+name+'('),end=outputSource.indexOf('\n}\n',start);assert(start>=0&&end>start,name);return outputSource.slice(start,end+3)};
  await evaluate(`var audioOutputDevices=[{deviceId:'speaker',label:'隔离测试音箱'},{deviceId:'virtual',label:'CABLE Input 隔离设备'}],audioInputDevices=[{deviceId:'mic',label:'隔离测试麦克风'}],audioOutputDeviceId='speaker',audioOutputDefaultDeviceId='speaker',audio=null,audioCtx=null,audioRouteWorkflowDrag=null;
function escHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}function audioRouteVisibleIds(){return ['virtual']}function audioRouteSetting(){return {volume:70,delay:100,muted:false}}function effectiveAudioPrimaryId(){return 'speaker'}function audioOutputMirrorRuntimeFor(){return {state:'playing'}}function isVirtualMicOutputDevice(d){return /CABLE/.test(d.label)}function audioOutputMirrorStatusText(){return '隔离路由夹具'}function audioOutputDeviceStatusText(){return '隔离音箱主监听'}function audioOutputMirrorConfirmedCount(){return 1}function renderAudioRouteWorkflowEdges(){}function cancelAudioRouteWorkflowDrag(){audioRouteWorkflowDrag=null}
`+['audioOutputDeviceLabel','audioRouteMuteIcon','renderAudioOutputDeviceUi'].map(outputFunction).join('\n')+read('public/js/modules/05-playback/20-microphone-mixer-ui.js'));
  await evaluate(`openGsapModal(document.getElementById('audio-output-workflow-modal'));renderAudioOutputDeviceUi();document.querySelector('[data-mixer-expand]').click();`);await wait(process.argv.includes('--gsap') ? 750 : 70);
  const mixerSelectFocus=await evaluate(`(()=>{var select=document.querySelector('[data-mixer-device="microphone"]');select.focus();renderAudioOutputDeviceUi();return {preserved:document.activeElement===select,active:document.activeElement.tagName,connected:select.isConnected}})()`);console.log('FOCUS_RESULT '+JSON.stringify(mixerSelectFocus));assert.equal(mixerSelectFocus.preserved,true);

  win.setSize(961,540);win.setSize(960,540);await wait(100);const screenshot = path.join(profile,'audio-fixture.png');fs.writeFileSync(screenshot,(await win.webContents.capturePage()).toPNG());
  const result = {fixture:'partial production-markup/CSS + real keyboard/modal helper, no backend or main app',viewport:[960,540],animation:process.argv.includes('--gsap')?'production GSAP':'CSS fallback',buttonSpace,modalOpening,modalTab,audioEscape,lyricEscape,fxAccessibility,peekFocus,peekUnfocused,peekExplicitClose,hotkeyOpening,hotkeyTab,hotkeyTabCapture,hotkeyCaptureEscape,hotkeyClose,mixerSelectFocus,hotkeyScreenshot:hotkeyShot,loginScreenshot:loginShot,screenshot};
  console.log('QA_RESULT ' + JSON.stringify(result));
  fs.writeFileSync(path.join(profile,'result.json'),JSON.stringify(result,null,2));
  win.close();app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
setTimeout(()=>{console.error('UI fixture timed out');app.exit(2)},15000).unref();
