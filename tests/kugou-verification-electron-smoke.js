'use strict';
// Isolated official-page-shaped fixture only. No account, real cookies or
// requests to the real Kugou service are used by this check.
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const verification = require('../desktop/kugou-verification');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-kugou-verification-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
app.commandLine.appendSwitch('disable-gpu');
const main = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
const slice = (start, end) => main.slice(main.indexOf(start), main.indexOf(end));
const source = slice('function revealLoginWindowWhenReady(', '// music.163.com/#/login renders the QR itself')
  + slice('const inlineLoginSessions = new Map();', 'async function openNeteaseMusicLoginWindow(')
  + slice('async function openKugouMusicLoginWindow(', 'async function clearNeteaseMusicLoginSession(');
const partition = 'fixture-kugou-verification-' + process.pid;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  let clearCount = 0;
  const cookieSession = session.fromPartition(partition);
  await cookieSession.protocol.handle('https', () => new Response(`<!doctype html><meta charset="utf-8"><title>Official challenge fixture</title><style>html { background: #fff; color: #111; } body { font: 24px sans-serif; padding: 50px; } input { font: 24px sans-serif; padding: 12px; }</style><h1>安全验证（隔离测试）</h1><label>输入测试文字 <input id="fixture-input"></label>`, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const windows = [];
  function FixtureWindow(options) {
    const win = new BrowserWindow({ ...options, frame: false });
    windows.push(win);
    return win;
  }
  const context = vm.createContext({
    ...verification, session: { fromPartition: () => ({ clearStorageData: async () => { clearCount++; } }) },
    BrowserWindow: FixtureWindow, KUGOU_LOGIN_PARTITION: partition, KUGOU_LOGIN_URL: 'https://www.kugou.com/',
    KUGOU_LOGIN_WARMUP_URL: 'https://www.kugou.com/fixture-warmup', APP_ICON_ICO: '',
    readKugouLoginCookieHeader: async () => 'userid=123; token=fixture-only',
    kugouCookieHasPlayback: cookie => cookie.includes('token='), kugouCookieHasLogin: cookie => cookie.includes('userid='),
    console, setTimeout, clearTimeout, setInterval, clearInterval,
  });
  vm.runInContext(source, context);
  const pending = context.openKugouMusicLoginWindow(null, { verification: true, inline: true, forceReauth: true,
    verificationUrl: 'https://verify.kugou.com/challenge?fixture=1' });
  const early = await Promise.race([pending, wait(100).then(() => null)]);
  if (early) throw Error('verification window settled early: ' + JSON.stringify(early));
  const win = windows[0];
  assert.ok(win);
  const deadline = Date.now() + 10000;
  while (!(await win.webContents.mainFrame.executeJavaScript("!!document.getElementById('fixture-input')").catch(() => false))) {
    if (Date.now() > deadline) throw Error('fixture did not load');
    await wait(50);
  }
  const [width, height] = win.getSize();
  win.setSize(width + 1, height); win.setSize(width, height);
  await wait(100);
  assert.equal(win.isVisible(), true);
  assert.equal(clearCount, 0);
  await win.webContents.mainFrame.executeJavaScript("document.getElementById('fixture-input').focus()");
  win.webContents.sendInputEvent({ type: 'char', keyCode: '7' });
  await wait(100);
  const details = await win.webContents.mainFrame.executeJavaScript("({value: document.getElementById('fixture-input').value, node: typeof require, preload: typeof window.desktopWindow})");
  assert.equal(details.value, '7');
  assert.equal(details.node, 'undefined');
  assert.equal(details.preload, 'undefined');
  const image = await win.webContents.capturePage();
  const shot = path.join(profile, 'verification-fixture.png');
  fs.writeFileSync(shot, image.toPNG());
  win.close();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.verification, true);
  assert.equal(result.retryRequired, true);
  let cookieReads = 0;
  context.readKugouLoginCookieHeader = async () => cookieReads++ === 0 ? '' : 'userid=123; token=fixture-only';
  const websitePending = context.openKugouMusicLoginWindow(null, { inline: true, nativeQr: false });
  await wait(1500);
  const websiteWindow = windows[1];
  assert.ok(websiteWindow && !websiteWindow.isDestroyed());
  assert.equal(websiteWindow.isVisible(), true);
  assert.equal(websiteWindow.webContents.isOffscreen(), false);
  websiteWindow.close();
  const websiteResult = await websitePending;
  assert.equal(websiteResult.ok, false);
  assert.equal(websiteResult.verification, true);
  assert.equal(websiteResult.retryRequired, true);
  console.log('QA_RESULT ' + JSON.stringify({ visible: true, interactive: true, nodeDisabled: true, preloadAbsent: true, reusedCookieDidNotClose: true, websiteFallbackInteractive: true, websiteChallengeDidNotClose: true, retryRequired: result.retryRequired, screenshot: shot }));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('verification fixture timed out'); app.exit(2); }, 15000).unref();
