'use strict';

function createRemixUpdater(options) {
  const app = options.app;
  const enabled = options.enabled === true;
  const onState = typeof options.onState === 'function' ? options.onState : () => {};
  let updater = null;
  let checkPromise = null;
  let downloadPromise = null;
  let state = { supported: enabled, status: enabled ? 'idle' : 'external', currentVersion: app.getVersion(), version: '', percent: 0, error: '' };

  function publish(patch) {
    state = { ...state, ...patch };
    onState({ ...state });
    return { ...state };
  }

  function ensureUpdater() {
    if (!enabled) return null;
    if (updater) return updater;
    updater = (options.loadUpdater || (() => require('electron-updater').autoUpdater))();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('update-available', (info) => publish({ status: 'available', version: String(info && info.version || ''), error: '' }));
    updater.on('update-not-available', () => publish({ status: 'current', version: '', error: '' }));
    updater.on('download-progress', (progress) => {
      if (!downloadPromise || state.status !== 'downloading') return;
      publish({ status: 'downloading', percent: Math.max(0, Math.min(100, Number(progress && progress.percent) || 0)) });
    });
    updater.on('update-downloaded', (info) => {
      if (!downloadPromise || state.status !== 'downloading' || !info || info.version !== state.version) return;
      publish({ status: 'downloaded', percent: 100, error: '' });
    });
    updater.on('error', (error) => publish({ status: 'error', error: String(error && error.message || error || 'UPDATE_FAILED').slice(0, 160) }));
    return updater;
  }

  async function check() {
    if (!enabled || state.status === 'downloaded' || state.status === 'downloading') return { ...state };
    if (checkPromise) return checkPromise;
    publish({ status: 'checking', error: '' });
    checkPromise = Promise.resolve().then(() => ensureUpdater().checkForUpdates()).then(() => {
      return state.status === 'checking' ? publish({ status: 'current', version: '' }) : { ...state };
    }, (error) => {
      return publish({ status: 'error', error: String(error && error.message || error || 'UPDATE_CHECK_FAILED').slice(0, 160) });
    }).finally(() => { checkPromise = null; });
    return checkPromise;
  }

  async function download() {
    if (!enabled || (state.status !== 'available' && state.status !== 'error')) return { ...state };
    if (downloadPromise) return downloadPromise;
    if (state.status === 'error') {
      await check();
      if (state.status !== 'available') return { ...state };
    }
    publish({ status: 'downloading', percent: 0, error: '' });
    downloadPromise = Promise.resolve().then(() => ensureUpdater().downloadUpdate()).then((files) => {
      if (state.status !== 'downloading') return { ...state };
      if (!Array.isArray(files) || !files.length) return publish({ status: 'error', error: 'UPDATE_DOWNLOAD_INCOMPLETE' });
      return publish({ status: 'downloaded', percent: 100 });
    }, (error) => {
      return publish({ status: 'error', error: String(error && error.message || error || 'UPDATE_DOWNLOAD_FAILED').slice(0, 160) });
    }).finally(() => { downloadPromise = null; });
    return downloadPromise;
  }

  function install() {
    if (!enabled || state.status !== 'downloaded') return { ok: false, error: 'UPDATE_NOT_READY' };
    ensureUpdater().quitAndInstall(true, true);
    return { ok: true };
  }

  return { getState: () => ({ ...state }), check, download, install };
}

module.exports = { createRemixUpdater };
