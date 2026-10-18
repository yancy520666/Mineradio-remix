'use strict';
const crypto = require('node:crypto');

// Own only the temporary fullscreen used for recording. Ordinary F/maximize
// keeps its existing behavior, and callers cannot supply arbitrary bounds.
class WallpaperLoopWindow {
  constructor({ enter, exit, apply, isFullscreen = win => win.isFullScreen(), timeout = 6000 }) {
    this.enter = enter;
    this.exit = exit;
    this.apply = apply;
    this.isFullscreen = isFullscreen;
    this.timeout = timeout;
    this.records = new WeakMap();
    this.queue = Promise.resolve();
  }

  enqueue(operation) {
    const result = this.queue.catch(() => {}).then(operation);
    this.queue = result;
    return result;
  }

  transition(win, fullscreen, action) {
    if (win.isDestroyed()) return Promise.reject(new Error('LOOP_WINDOW_CLOSED'));
    if (win.isFullScreen() === fullscreen) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const event = fullscreen ? 'enter-full-screen' : 'leave-full-screen';
      const cleanup = () => { clearTimeout(timer); win.removeListener(event, done); win.removeListener('closed', closed); };
      const done = () => { cleanup(); resolve(true); };
      const closed = () => { cleanup(); reject(new Error('LOOP_WINDOW_CLOSED')); };
      const timer = setTimeout(() => {
        cleanup();
        if (!win.isDestroyed() && win.isFullScreen() === fullscreen) resolve(false);
        else reject(new Error('LOOP_WINDOW_TRANSITION_TIMEOUT'));
      }, this.timeout);
      win.once(event, done);
      win.once('closed', closed);
      try { action(win); } catch (error) { cleanup(); reject(error); }
    });
  }

  begin(win) {
    return this.enqueue(async () => {
      const previous = this.records.get(win);
      if (previous) await this.restore(win, previous);
      if (win.isDestroyed()) throw new Error('LOOP_WINDOW_CLOSED');
      if (this.isFullscreen(win)) return { ok: true, expanded: false, token: '' };
      const maximized = win.isMaximized();
      const record = { token: crypto.randomBytes(24).toString('hex'),
        bounds: { ...(maximized ? win.getNormalBounds() : win.getBounds()) }, maximized };
      record.done = new Promise(resolve => { record.resolve = resolve; });
      this.records.set(win, record);
      try {
        await this.transition(win, true, this.enter);
        return { ok: true, expanded: true, token: record.token };
      } catch (error) {
        await this.restore(win, record).catch(() => {});
        throw error;
      }
    });
  }

  end(win, token) {
    return this.enqueue(async () => {
      const record = this.records.get(win);
      if (!record || record.token !== token) return { ok: true, superseded: true };
      await this.restore(win, record);
      return { ok: true };
    });
  }

  current(win) { return this.records.get(win); }

  restoreOnLeave(win, record = this.records.get(win)) {
    if (!record) return false;
    // A delayed leave callback must not reset a newer recording's window.
    if (this.records.get(win) !== record) return true;
    if (!win.isDestroyed()) this.apply(win, record);
    this.records.delete(win);
    record.resolve();
    return true;
  }

  async restore(win, record) {
    if (win.isDestroyed()) { this.restoreOnLeave(win, record); return; }
    if (win.isFullScreen()) {
      const receivedLeave = await this.transition(win, false, this.exit);
      if (!receivedLeave) this.restoreOnLeave(win, record);
      // Main's settled leave handler applies the snapshot instead of its
      // normal default bounds. Wait for that acknowledgement, not a delay.
      await record.done;
    } else {
      // Transparent Windows players also keep a logical fullscreen flag;
      // clear it through the host even if the native flag is already false.
      this.exit(win);
      this.restoreOnLeave(win, record);
    }
  }
}

module.exports = { WallpaperLoopWindow };
