'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');

if (!process.argv.includes('--child')) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-account-avatar-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    const run = spawnSync(require('electron'), [__filename, '--child', profile], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, run.stderr + run.stdout + String(run.error || ''));
    const evidence = run.stdout.split('\n').find(line => line.startsWith('ACCOUNT_AVATAR:'));
    assert(evidence, run.stdout);
    console.log(evidence);
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow } = require('electron');
  const http = require('node:http');
  const profile = process.argv[process.argv.indexOf('--child') + 1];
  app.setPath('appData', profile);
  process.env.MINERADIO_RUNTIME_NAME = 'Mineradio Account Avatar QA';
  process.env.MINERADIO_STARTUP_QA_HIDDEN = '1';
  process.env.MINERADIO_STARTUP_QA_USER_DATA = path.join(profile, 'user');
  fs.mkdirSync(process.env.MINERADIO_STARTUP_QA_USER_DATA, { recursive: true });
  fs.writeFileSync(path.join(process.env.MINERADIO_STARTUP_QA_USER_DATA, 'cache-settings.json'), JSON.stringify({ rootPath: path.join(profile, 'cache') }));
  app.on('browser-window-created', (_event, win) => {
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] }, (_details, callback) => callback({ cancel: true }));
  });
  require('../desktop/main');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    let win, ready;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      win = BrowserWindow.getAllWindows().find(w => /^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL()));
      if (win) ready = await win.webContents.executeJavaScript('typeof renderUserBtn === "function" && document.readyState !== "loading"').catch(() => false);
      if (ready) break;
      await sleep(50);
    }
    assert(ready, 'renderer must initialize');
    let requests = 0;
    let retryRequests = 0;
    const server = http.createServer((request, response) => {
      requests++;
      if (request.url === '/retry.svg' && ++retryRequests === 1) {
        response.writeHead(503, { 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#399"/></svg>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (details.url.includes('/api/cover?') && details.url.includes('avatar-qa')) callback({ redirectURL: 'http://127.0.0.1:' + server.address().port + (details.url.includes('avatar-qa-retry') ? '/retry.svg' : '/avatar.svg') });
      else callback({ cancel: /https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(details.url) });
    });
    const result = await win.webContents.executeJavaScript(`(async () => {
      dismissSplash({instant:true}); closeVisualGuide(false);
      loginStatus = {loggedIn:true, nickname:'Avatar QA', userId:'qa', avatar:'https://p1.music.126.net/avatar-qa.png', vipType:0};
      accountProviderExternalRenderList = () => ['netease'];
      renderUserBtn(); updateLoginNodeGraphUi();
      const btn = document.getElementById('user-btn');
      const image = btn.querySelector('img');
      const logo = document.querySelector('#login-provider-netease .provider-logo');
      const modalImage = logo.querySelector('img');
      await Promise.all([image.decode(), modalImage.decode()]);
      const mutations = [];
      const observer = new MutationObserver(records => mutations.push(...records));
      observer.observe(btn, {childList:true, subtree:true, attributes:true});
      let opens = 0, stable = true;
      for (let i=0; i<5; i++) {
        btn.click();
        if (document.getElementById('login-modal').classList.contains('show')) opens++;
        renderUserBtn();
        document.querySelector('#login-modal .login-panel-close').click();
        await new Promise(resolve => setTimeout(resolve, 400));
        stable = stable && btn.querySelector('img') === image && logo.querySelector('img') === modalImage && image.complete && image.naturalWidth > 0;
      }
      observer.disconnect();
      loginStatus.avatar = 'https://p1.music.126.net/avatar-qa-retry.png'; renderUserBtn();
      const failedDeadline = Date.now() + 2000;
      while (!providerAvatarRecovery.get(image) && Date.now() < failedDeadline) await new Promise(resolve => setTimeout(resolve, 20));
      const retryState = providerAvatarRecovery.get(image);
      loginStatus.nickname = 'While retrying'; renderUserBtn();
      const retryPreserved = !!retryState && providerAvatarRecovery.get(image) === retryState && btn.querySelector('img') === image;
      const retryDeadline = Date.now() + 2500;
      while (retryState && retryState.failed && Date.now() < retryDeadline) await new Promise(resolve => setTimeout(resolve, 20));
      const retryRecovered = !!retryState && !retryState.failed && image.complete && image.naturalWidth > 0;
      loginStatus.nickname = 'Updated nickname'; loginStatus.vipType = 11; renderUserBtn();
      const profileUpdate = btn.querySelector('img') === image && btn.querySelector('.top-account-name').textContent === 'Updated nickname' && !!btn.querySelector('.top-account-vip.vip');
      qqLoginStatus = {loggedIn:true, nickname:'QQ QA', userId:'qa-qq', avatar:loginStatus.avatar, vipLevel:'none', membershipKnown:true, playbackKeyReady:true};
      let order = ['netease','qq']; accountProviderExternalRenderList = () => order; renderUserBtn();
      const qqImage = btn.querySelector('[data-account-provider="qq"] img');
      order = ['qq','netease']; renderUserBtn();
      const reordered = btn.firstElementChild.getAttribute('data-account-provider') === 'qq' && btn.querySelector('[data-account-provider="netease"] img') === image && btn.querySelector('[data-account-provider="qq"] img') === qqImage;
      loginStatus.loggedIn = false; renderUserBtn();
      const removed = !btn.querySelector('[data-account-provider="netease"]') && btn.querySelector('img') === qqImage;
      qqLoginStatus.loggedIn = false; renderUserBtn();
      const loggedOut = !btn.querySelector('img') && !!btn.querySelector('.login-word');
      return {opens, stable, closed:!document.getElementById('login-modal').classList.contains('show'), avatarRemovals:mutations.filter(record=>record.type === 'childList' && Array.from(record.removedNodes).some(node=>node===image || node.contains && node.contains(image))).length,
        imageSourceChanges:mutations.filter(record=>record.target===image && record.attributeName==='src').length, retryPreserved, retryRecovered, profileUpdate, reordered, removed, loggedOut};
    })()`);
    assert.equal(result.opens, 5);
    for (const key of ['stable', 'closed', 'retryPreserved', 'retryRecovered', 'profileUpdate', 'reordered', 'removed', 'loggedOut']) assert(result[key], JSON.stringify(result));
    assert.equal(result.avatarRemovals, 0);
    assert.equal(result.imageSourceChanges, 0);
    console.log('ACCOUNT_AVATAR:' + JSON.stringify({ ...result, fixtureRequests: requests, retryRequests }));
    server.close();
    app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
