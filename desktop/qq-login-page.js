'use strict';

// Open the official login UI as soon as the SPA has mounted. Do not wait for
// every resource to finish, and never click a container containing login text.
function qqLoginPageScript() {
  return `(() => {
    const visible = e => {
      if (!e) return false;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const frame = document.querySelector('#login_frame');
    if (visible(frame)) return true;
    const candidates = Array.from(document.querySelectorAll('.top_login__link, .profile_unlogin__btn, a, button'));
    const button = candidates.find(e => visible(e) && /^(登录|登陆|立即登录)$/.test((e.textContent || '').trim()));
    if (button) button.click();
    return false;
  })()`;
}

function prepareQQLoginPage(win) {
  const wc = win.webContents;
  let stopped = false;
  let busy = false;
  let opened = false;
  const tick = async () => {
    if (stopped || busy || opened || wc.isDestroyed()) return;
    // Only the official QQ Music host owns this login-entry click.
    try { if (new URL(wc.getURL()).hostname !== 'y.qq.com') return; } catch (_) { return; }
    busy = true;
    try { opened = !!await wc.mainFrame.executeJavaScript(qqLoginPageScript(), true); }
    catch (_) {} finally { busy = false; }
  };
  const reset = () => { opened = false; tick(); };
  wc.on('dom-ready', reset);
  wc.on('did-finish-load', tick);
  const timer = setInterval(tick, 500);
  if (timer.unref) timer.unref();
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    wc.removeListener('dom-ready', reset);
    wc.removeListener('did-finish-load', tick);
  };
  win.once('closed', stop);
  return stop;
}

module.exports = { qqLoginPageScript, prepareQQLoginPage };
