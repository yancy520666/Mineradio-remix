'use strict';
// Native key events against the production shortcut dispatcher and modal.
// All profiles, IPC responses and action effects are isolated test data.
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
require('./helpers/electron-frames').keepTestWindowFramesRunning(app);
app.commandLine.appendSwitch('disable-gpu');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-shortcuts-'));
app.setPath('userData', profile);
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const page = path.join(profile, 'shortcuts.html');
fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root, 'public/css/index.css'))}"></head><body>
<button id="before">外部控件</button><div id="search-area"><input id="search-input"><button id="search-clear-btn">清空</button></div><button id="after">下一个控件</button>
<style>body{background:#101216}#before,#after{position:fixed;bottom:20px}#after{left:150px}</style></body></html>`);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, cb) => cb({ cancel: true }));
  const win = new BrowserWindow({ width: 1000, height: 760, show: true, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(page); win.focus(); win.webContents.focus();
  const evaluate = code => win.webContents.mainFrame.executeJavaScript(code);
  const keyboard = read('public/js/modules/05-playback/01-cover-custom-map.js');
  const account = read('public/js/modules/08-account/01-login-modal-utils.js');
  const state = read('public/js/modules/00-state/00-core-stores.js').match(/var HOTKEY_ACTIONS = \[[\s\S]*?\n\];/)[0];
  await evaluate(`var calls=[],hotkeyCaptureState=null,hotkeyGlobalStatus={},HOTKEY_SETTINGS_STORE_KEY='test-shortcuts';
var freeCamera={active:false,keys:{}},immersiveMode=false,diyPlayerMode=true,shelfManager=null;
function getDesktopWindowApi(){return null}
function escHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function setPeek(el,on){if(el)el.classList.toggle('peek',on)}
function togglePlay(){calls.push('play')}function toggleFreeCamera(){calls.push('camera')}function markRenderInteraction(){}
` + state + keyboard.slice(0, keyboard.indexOf('function readCustomCoverMap(')) +
    account.slice(0, account.indexOf('function bindModalBackdropClose(')) +
    read('public/js/modules/04-shelf/06-keyboard-camera-events.js') +
    read('public/js/modules/07-fx/06-hotkeys.js') + `;var hotkeySettings=readHotkeySettings();bindHotkeySettings();`);
  async function key(keyCode, modifiers = []) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await wait(80);
  }
  await evaluate('document.body.focus()'); await key('Tab');
  assert.equal(await evaluate('document.activeElement.id'), 'search-input', 'default Tab opens search');
  await evaluate(`setHotkeyBinding('focusSearch','local','');document.activeElement.blur();setPeek(document.getElementById('search-area'),false);`);
  await wait(30);
  await key('Tab');
  const disabled = await evaluate(`({active:document.activeElement.id,peek:document.getElementById('search-area').classList.contains('peek'),tabIndex:document.getElementById('search-input').tabIndex})`);
  assert.equal(disabled.peek, false); assert.notEqual(disabled.active, 'search-input'); assert.equal(disabled.tabIndex, -1);
  await evaluate(`setHotkeyBinding('focusSearch','local','Ctrl+KeyJ');document.activeElement.blur();`);
  await key('J', ['control']);
  assert.equal(await evaluate('document.activeElement.id'), 'search-input');
  assert.equal(await evaluate(`document.getElementById('search-area').classList.contains('peek')`), true);
  await evaluate(`document.getElementById('search-input').value='';`); await key('Space');
  assert.deepEqual(await evaluate('calls'), [], 'typing does not start playback');
  await evaluate(`document.getElementById('before').focus();openHotkeySettings();`); await wait(100);
  const binding = `[data-hotkey-bind="local"][data-hotkey-action="togglePlay"]`;
  await evaluate(`document.querySelector('${binding}').focus();document.querySelector('${binding}').click();`);
  await key('R');
  assert.equal(await evaluate('hotkeySettings.local.togglePlay'), 'KeyR');
  assert.deepEqual(await evaluate('calls'), [], 'recording R does not move the camera');
  assert.equal(await evaluate(`document.activeElement.getAttribute('data-hotkey-action')`), 'togglePlay');
  await evaluate(`startHotkeyCapture('togglePlay','local')`); await key('Escape');
  assert.equal(await evaluate('!!hotkeyCaptureState'), false);
  assert.equal(await evaluate(`document.getElementById('hotkey-modal').classList.contains('show')`), true);
  await evaluate(`startHotkeyCapture('togglePlay','local')`); await key('Delete');
  assert.equal(await evaluate(`readHotkeySettings().local.togglePlay`), '');
  await evaluate(`document.querySelector('[data-hotkey-reset="local"][data-hotkey-action="togglePlay"]').click()`);
  assert.equal(await evaluate('hotkeySettings.local.togglePlay'), 'Space');
  await evaluate(`setHotkeyBinding('nextTrack','local','PageDown')`);
  assert.equal(await evaluate(`document.querySelector('[data-hotkey-bind="local"][data-hotkey-action="nextShelf"]').closest('.hotkey-row').querySelector('.hotkey-status').classList.contains('conflict')`), true);
  await evaluate(`setHotkeyModalScope('global')`);
  assert.equal(await evaluate(`document.querySelectorAll('#hotkey-global-section .hotkey-row').length`), 8);
  await evaluate(`setHotkeyModalScope('local');document.querySelector('[data-hotkey-close]').focus()`);
  await key('Tab', ['shift']);
  assert.equal(await evaluate(`document.getElementById('hotkey-modal').contains(document.activeElement)`), true);
  await key('Escape');
  assert.equal(await evaluate('document.activeElement.id'), 'before');
  console.log('QA_RESULT ' + JSON.stringify({ passed: true, disabledSearch: disabled, nativeCapture: ['R', 'Delete', 'Escape'], restoredDefault: 'Space', globalActions: 8 }));
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Shortcut test timed out'); app.exit(2); }, 20000).unref();
