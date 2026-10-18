'use strict';

const { randomUUID } = require('node:crypto');

// A capture grant is ephemeral: permission checks never return it as a cached
// permission. Only the request callback may consume it once.
class MicrophonePermissionGate {
  constructor({ getMainWindow, isTrustedDocument, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.getMainWindow = getMainWindow;
    this.isTrustedDocument = isTrustedDocument;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.grant = null;
    this.timer = null;
    this.operation = 0;
    this.lastInput = null;
  }

  trustedSender(event) {
    try {
      const win = this.getMainWindow();
      return !!(win && !win.isDestroyed() && event && event.sender === win.webContents
        && !event.sender.isDestroyed() && event.senderFrame === event.sender.mainFrame
        && !event.senderFrame.parent && !event.senderFrame.isDestroyed()
        && this.isTrustedDocument(event.senderFrame.url));
    } catch (_) { return false; }
  }

  clear() {
    this.operation += 1;
    this.grant = null;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
  }

  attach(win) {
    const wc = win.webContents;
    const input = (_event, value) => {
      if ((value.type === 'mouseDown' && value.button === 'left')
        || ((value.type === 'keyDown' || value.type === 'rawKeyDown') && !value.isAutoRepeat
          && ['Enter', 'Space', ' '].includes(value.key))) {
        this.lastInput = { webContents: wc, at: this.now() };
      }
    };
    const reset = () => { this.lastInput = null; this.clear(); };
    wc.on('before-mouse-event', input);
    wc.on('before-input-event', input);
    wc.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) reset();
    });
    wc.once('destroyed', reset);
    wc.on('render-process-gone', reset);
    win.once('closed', reset);
  }

  async begin(event, kind = 'capture') {
    if (!this.trustedSender(event)) return { ok: false, error: 'MICROPHONE_UNTRUSTED_SENDER' };
    const input = this.lastInput;
    const age = input ? this.now() - input.at : Infinity;
    if (!input || input.webContents !== event.sender || age < 0 || age > 5000) {
      return { ok: false, error: 'MICROPHONE_USER_ACTIVATION_REQUIRED' };
    }
    this.clear();
    const operation = this.operation;
    const frame = event.senderFrame;
    const documentUrl = frame.url;
    let checkTimer;
    let active = false;
    try {
      active = await Promise.race([
        // false matters: never manufacture a gesture through executeJavaScript.
        frame.executeJavaScript('Boolean(navigator.userActivation && navigator.userActivation.isActive)', false),
        new Promise((resolve) => { checkTimer = this.setTimer(() => resolve(false), 1000); }),
      ]);
    } catch (_) { active = false; }
    if (checkTimer) this.clearTimer(checkTimer);
    if (operation !== this.operation) return { ok: false, error: 'MICROPHONE_CAPTURE_CANCELLED' };
    if (active !== true || !this.trustedSender(event) || frame.url !== documentUrl) {
      return { ok: false, error: 'MICROPHONE_USER_ACTIVATION_REQUIRED' };
    }
    // Consume the native input too; repeated IPC cannot mint new grants from it.
    if (this.lastInput !== input) return { ok: false, error: 'MICROPHONE_CAPTURE_CANCELLED' };
    this.lastInput = null;
    this.grant = { kind: kind === 'setup' ? 'setup' : kind === 'enumerate' ? 'enumerate' : 'capture', token: randomUUID(), webContents: event.sender, frame, documentUrl, activatedAt: input.at, expiresAt: this.now() + 10000 };
    this.timer = this.setTimer(() => this.clear(), 10000);
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
    return { ok: true, token: this.grant.token, expiresAt: this.grant.expiresAt };
  }

  end(event, token) {
    if (!this.trustedSender(event)) return { ok: false, error: 'MICROPHONE_UNTRUSTED_SENDER' };
    // A stale operation must not revoke a newer operation's grant.
    if (token && (!this.grant || token !== this.grant.token)) return { ok: true };
    this.clear();
    return { ok: true };
  }

  prepare(event, token) {
    if (!this.trustedSender(event)) return { ok: false, error: 'MICROPHONE_UNTRUSTED_SENDER' };
    const grant = this.grant;
    if (!grant || grant.kind !== 'setup' || typeof token !== 'string' || token !== grant.token
      || grant.webContents !== event.sender || grant.frame !== event.senderFrame || grant.documentUrl !== event.senderFrame.url) {
      return { ok: false, error: 'MICROPHONE_SETUP_CANCELLED' };
    }
    const age = this.now() - grant.activatedAt;
    if (this.now() >= grant.expiresAt || age < 0 || age > 5000) {
      this.clear(); return { ok: false, error: 'MICROPHONE_USER_ACTIVATION_REQUIRED' };
    }
    // End label-only permission checks before capture can be requested. The
    // same token/deadline now authorizes exactly one existing consume() call.
    grant.kind = 'capture';
    return { ok: true, token: grant.token, expiresAt: grant.expiresAt };
  }

  canEnumerate(webContents, origin, details) {
    const grant = this.grant;
    if (!grant || (grant.kind !== 'enumerate' && grant.kind !== 'setup') || this.now() >= grant.expiresAt) return false;
    try {
      return webContents === grant.webContents && webContents.mainFrame === grant.frame
        && !webContents.isDestroyed() && !grant.frame.isDestroyed()
        && grant.frame.url === grant.documentUrl && this.isTrustedDocument(grant.documentUrl)
        && new URL(origin).origin === new URL(grant.documentUrl).origin
        && details && details.isMainFrame === true && details.mediaType === 'audio'
        && (!details.requestingUrl || details.requestingUrl === grant.documentUrl);
    } catch (_) { return false; }
  }

  consume(webContents, origin, details) {
    const grant = this.grant;
    if (!grant || grant.kind !== 'capture') return false;
    if (this.now() >= grant.expiresAt) { this.clear(); return false; }
    try {
      const win = this.getMainWindow();
      if (!win || win.isDestroyed() || webContents !== win.webContents || webContents !== grant.webContents
        || webContents.isDestroyed() || grant.frame.isDestroyed() || webContents.mainFrame !== grant.frame
        || grant.frame.url !== grant.documentUrl || !this.isTrustedDocument(grant.frame.url)) return false;
      if (!details || details.isMainFrame !== true || details.requestingUrl !== grant.documentUrl
        || !this.isTrustedDocument(details.requestingUrl)) return false;
      if (new URL(origin).origin !== new URL(grant.documentUrl).origin) return false;
      const types = details.mediaTypes;
      if (!Array.isArray(types) || types.length !== 1 || types[0] !== 'audio'
        || (details.mediaType && details.mediaType !== 'audio') || details.audioRequested || details.videoRequested) return false;
      this.clear();
      return true;
    } catch (_) { return false; }
  }
}

module.exports = { MicrophonePermissionGate };
