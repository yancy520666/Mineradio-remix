'use strict';

const { createWindowsVirtualAudioInstaller } = require('./virtual-audio-installer');
const OFFICIAL_PAGES = Object.freeze({
  install: 'https://vb-audio.com/Cable/', official: 'https://vb-audio.com/Cable/',
  license: 'https://vb-audio.com/Services/licensing.htm',
  donation: 'https://shop.vb-audio.com/en/win-apps/11-vb-cable.html',
});

function createVirtualAudioSetupGuide({ getMainWindow, isTrustedDocument, showMessageBox, openExternal,
  isQuitting = () => false, platform = process.platform, arch = process.arch, onState = () => {},
  preparePackage = options => require('./virtual-audio-package').prepareVirtualAudioPackage(options),
  installer = createWindowsVirtualAudioInstaller({ platform, arch }) } = {}) {
  let pending = null, disposed = false, documentGeneration = 0;
  let detach = () => {};
  let state = { phase: 'idle', busy: false, canCancel: false };
  const cancelled = () => ({ ok: false, canceled: true, error: 'VIRTUAL_AUDIO_SETUP_CANCELLED' });
  const trusted = (event) => {
    try {
      const win = getMainWindow();
      return !!(win && !win.isDestroyed() && event && event.sender === win.webContents
        && !event.sender.isDestroyed() && event.senderFrame === event.sender.mainFrame
        && !event.senderFrame.parent && !event.senderFrame.isDestroyed()
        && isTrustedDocument(event.senderFrame.url));
    } catch (_) { return false; }
  };
  const emit = (operation, patch) => {
    state = { ...state, ...patch };
    if (!disposed && !isQuitting() && operation.documentGeneration === documentGeneration && trusted(operation.event)
      && operation.event.senderFrame.url === operation.documentUrl) {
      try { onState({ ...state, mode: 'guided-installer' }); } catch (_) {}
    }
  };
  const cancel = (event) => {
    if (event && !trusted(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
    if (pending && pending.handoff) return { ok: false, error: 'VIRTUAL_AUDIO_INSTALLER_HANDOFF_IN_PROGRESS' };
    if (pending) pending.controller.abort();
    return { ok: true, canceled: !!pending };
  };
  const getInfo = () => ({
    supported: platform === 'win32', mode: platform === 'win32' && arch === 'x64' ? 'guided-installer' : 'official-guide',
    canDownloadAndLaunch: platform === 'win32' && arch === 'x64', automaticInstall: false,
    component: 'VB-CABLE', provider: 'VB-Audio', donationware: true,
    requiresAdministrator: true, requiresReboot: true, mayChangeDefaultDevices: true,
    pages: { ...OFFICIAL_PAGES }, operation: { ...state },
  });
  const attach = (win) => {
    detach();
    documentGeneration += 1;
    const wc = win.webContents;
    const lost = () => { documentGeneration += 1; cancel(); };
    const navigation = (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) lost(); };
    const cleanup = () => {
      lost();
      wc.removeListener('did-start-navigation', navigation); wc.removeListener('render-process-gone', lost);
      wc.removeListener('destroyed', cleanup); win.removeListener('closed', cleanup);
    };
    wc.on('did-start-navigation', navigation); wc.on('render-process-gone', lost);
    wc.once('destroyed', cleanup); win.once('closed', cleanup);
    detach = cleanup;
  };
  const active = operation => !disposed && operation.documentGeneration === documentGeneration
    && !operation.controller.signal.aborted && !isQuitting()
    && trusted(operation.event) && operation.event.senderFrame.url === operation.documentUrl;
  const begin = (event, topic = 'install') => {
    if (!trusted(event)) return Promise.resolve({ ok: false, error: 'UNTRUSTED_SENDER' });
    if (platform !== 'win32') return Promise.resolve({ ok: false, error: 'VIRTUAL_AUDIO_SETUP_UNSUPPORTED', fallbackAvailable: true });
    if (typeof topic !== 'string' || !Object.hasOwn(OFFICIAL_PAGES, topic)) {
      return Promise.resolve({ ok: false, error: 'INVALID_VIRTUAL_AUDIO_SETUP_TOPIC' });
    }
    if (disposed || isQuitting()) return Promise.resolve(cancelled());
    // Reading the official fallback/terms is safe even after an uncertain handoff.
    if (topic !== 'install') return Promise.resolve().then(async () => {
      if (disposed || isQuitting() || !trusted(event)) return cancelled();
      try { await openExternal(OFFICIAL_PAGES[topic]); return { ok: true, opened: true, mode: 'official-guide', topic }; }
      catch (_) { return { ok: false, error: 'OPEN_VIRTUAL_AUDIO_SETUP_FAILED' }; }
    });
    if (arch !== 'x64') return Promise.resolve({ ok: false, error: 'VIRTUAL_AUDIO_SETUP_UNSUPPORTED', fallbackAvailable: true });
    if (pending) return !pending.handoff && pending.owner === event.sender && !pending.controller.signal.aborted
      ? pending.promise : Promise.resolve({ ok: false, error: 'VIRTUAL_AUDIO_SETUP_BUSY' });
    const operation = { event, owner: event.sender, documentUrl: event.senderFrame.url,
      documentGeneration, controller: new AbortController(), handoff: false, retained: false };
    pending = operation;
    state = { phase: 'idle', busy: false, canCancel: false };
    operation.promise = (async () => {
      let pkg;
      const cleanPackage = async () => {
        if (pkg && !operation.cleaned) {
          operation.cleaned = true;
          await pkg.cleanup().catch(() => {});
        }
      };
      try {
        emit(operation, { phase: 'confirming', busy: true, canCancel: true });
        const answer = await showMessageBox(getMainWindow(), {
          type: 'info', title: '首次设置虚拟麦克风', message: '下载并打开 VB-CABLE 官方安装程序？',
          detail: 'VB-CABLE 由 VB-Audio 提供，采用 Donationware 模式。\n'
            + '播放器将从官方 HTTPS 下载原始基础驱动包，校验完整包、全部配套文件及 Windows 数字签名，再打开可见的官方安装程序。\n'
            + '你仍需确认管理员授权和安装条款、点击安装，并在完成后重启。Windows 可能更改默认播放和录音设备，请安装后检查原来的扬声器与麦克风。\n'
            + '进入管理员授权交接后，播放器无法安全取消官方安装程序。\n'
            + '完成后返回播放器刷新设备，并在游戏中选择 CABLE Output 作为麦克风。\n\n'
            + '官方来源：' + OFFICIAL_PAGES.install + '\n许可信息：' + OFFICIAL_PAGES.license
            + '\n官方捐赠入口：' + OFFICIAL_PAGES.donation,
          buttons: ['下载并打开安装程序', '取消'], defaultId: 1, cancelId: 1, noLink: true,
          signal: operation.controller.signal,
        });
        if (!answer || answer.response !== 0 || !active(operation)) {
          emit(operation, { phase: 'canceled', busy: false, canCancel: false }); return cancelled();
        }
        emit(operation, { phase: 'downloading', busy: true, canCancel: true, received: 0, total: 1318877 });
        pkg = await preparePackage({ signal: operation.controller.signal, onProgress: progress => {
          if (active(operation)) emit(operation, { received: progress.received, total: progress.total });
        } });
        if (!active(operation)) throw new Error('VIRTUAL_AUDIO_SETUP_CANCELLED');
        emit(operation, { phase: 'verifying', busy: true, canCancel: true });
        await installer.verify(pkg, { signal: operation.controller.signal });
        if (!active(operation)) throw new Error('VIRTUAL_AUDIO_SETUP_CANCELLED');
        // ShellExecute can already be displaying UAC. It cannot safely be aborted
        // or retried; no abort signal or installer arguments are sent past here.
        operation.handoff = true;
        emit(operation, { phase: 'handoff', busy: true, canCancel: false });
        let launched;
        try { launched = await installer.launch(pkg); }
        catch (error) { operation.retained = error.safeToClean !== true; throw error; }
        operation.retained = true;
        emit(operation, { phase: 'installer-opened', busy: true, canCancel: false, installerOpened: true });
        Promise.resolve(launched.completion).then(async outcome => {
          if (!outcome || outcome.knownExit !== true) {
            emit(operation, { phase: 'error', busy: true, canCancel: false,
              error: 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN', fallbackAvailable: true });
            return; // Preserve bounded files and one-task latch for a possibly running installer.
          }
          await cleanPackage();
          operation.retained = false;
          if (pending === operation) pending = null;
          emit(operation, { phase: 'installer-exited', busy: false, canCancel: false,
            installerOpened: true, exitCode: outcome.exitCode, requiresReboot: true });
        }).catch(() => {
          emit(operation, { phase: 'error', busy: true, canCancel: false,
            error: 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN', fallbackAvailable: true });
        });
        return { ok: true, installerOpened: true, mode: 'guided-installer', requiresReboot: true };
      } catch (error) {
        const canceled = !operation.handoff && !active(operation);
        const code = /^[A-Z][A-Z0-9_]+$/.test(String(error && (error.code || error.message)))
          ? String(error.code || error.message) : 'VIRTUAL_AUDIO_SETUP_FAILED';
        emit(operation, { phase: canceled ? 'canceled' : 'error', busy: operation.retained, canCancel: false,
          error: canceled ? 'VIRTUAL_AUDIO_SETUP_CANCELLED' : code, fallbackAvailable: true });
        return canceled ? cancelled() : { ok: false, error: code, fallbackAvailable: true };
      } finally {
        if (!operation.retained) {
          await cleanPackage();
          if (pending === operation) pending = null;
        }
      }
    })();
    return operation.promise;
  };
  return { getInfo, begin, attach, cancel, dispose: () => { disposed = true; detach(); } };
}

module.exports = { createVirtualAudioSetupGuide };
