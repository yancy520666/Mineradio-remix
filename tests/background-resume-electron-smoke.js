'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const appRoot = path.resolve(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-resume-smoke-'));
process.on('exit', () => {
  const resolved = path.resolve(userData);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('mineradio-resume-smoke-')) return;
  try { fs.rmSync(resolved, { recursive: true, force: true }); } catch (_) { }
});
app.setPath('userData', userData);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

async function main() {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: false, paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false, offscreen: true },
  });
  await win.loadFile(path.join(appRoot, 'public', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 2500));
  const result = await win.webContents.executeJavaScript(`(async () => {
    const result = { wake: null, audio: null, lyrics: null };
    const originalBridge = window.desktopWindow;
    const originalRuntime = { ...desktopRuntimeState };
    const originalAudio = audio;
    const originalQueue = playQueue;
    const originalIndex = currentIdx;
    const originalContext = audioCtx;
    const originalLyricsLines = lyricsLines;
    const originalPlaying = playing;
    const originalParticleLyrics = fx.particleLyrics;
    try {
      desktopRuntimeState.desktop = true;
      desktopRuntimeState.minimized = true;
      desktopRuntimeState.visible = false;
      updateRenderPowerClasses();
      applyRendererPowerMode();
      const slept = isDeepBackgroundMode() && document.body.classList.contains('render-deep-sleep');
      window.desktopWindow = { getState: () => Promise.resolve({ isMinimized: false, isVisible: true, isFocused: true }) };
      await refreshDesktopRuntimeStateAfterWake('electron-smoke');
      result.wake = {
        slept,
        awake: !isDeepBackgroundMode() && !document.body.classList.contains('render-deep-sleep'),
        canvasWidth: renderer.domElement.width,
      };

      const sampleRate = 8000;
      const samples = sampleRate * 3;
      const bytes = new Uint8Array(44 + samples * 2);
      const view = new DataView(bytes.buffer);
      const writeText = (offset, text) => { for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i); };
      writeText(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true);
      writeText(8, 'WAVE'); writeText(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
      view.setUint16(34, 16, true); writeText(36, 'data');
      view.setUint32(40, samples * 2, true);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const media = new Audio('data:audio/wav;base64,' + btoa(binary));
      audio = media;
      playQueue = [{ id: 'background-resume-smoke', source: 'local', name: 'QA' }];
      currentIdx = 0;
      media.__mineradioQueueItemKey = queueItemKey(playQueue[0]);
      initAudio();
      await media.play();
      media.pause();
      await audioCtx.suspend();
      const suspended = audioCtx.state === 'suspended';
      const resumed = await resumePausedAudioFast({ manual: true });
      await new Promise(resolve => setTimeout(resolve, 160));
      result.audio = {
        suspended,
        resumed,
        contextState: audioCtx.state,
        paused: media.paused,
        currentTime: media.currentTime,
      };
      media.pause();
      playing = false;
      fx.particleLyrics = true;
      lyricsLines = [{ t: 0, text: '后台恢复歌词测试', duration: 3, charCount: 8 }];
      clearStageLyrics();
      const lyricRestored = restoreStageLyricsAfterBackground('electron-smoke');
      result.lyrics = {
        restored: lyricRestored,
        attached: !!(stageLyrics.current && stageLyrics.current.parent === stageLyrics.group),
        text: stageLyrics.currentText,
      };
    } finally {
      clearStageLyrics();
      lyricsLines = originalLyricsLines;
      playing = originalPlaying;
      fx.particleLyrics = originalParticleLyrics;
      window.desktopWindow = originalBridge;
      Object.assign(desktopRuntimeState, originalRuntime);
      updateRenderPowerClasses();
      applyRendererPowerMode();
      if (audio && audio !== originalAudio) audio.pause();
      audio = originalAudio;
      playQueue = originalQueue;
      currentIdx = originalIndex;
      if (audioCtx && audioCtx !== originalContext) await audioCtx.close();
      audioCtx = originalContext;
    }
    return result;
  })()`);
  const ok = result.wake && result.wake.slept && result.wake.awake && result.wake.canvasWidth > 4
    && result.audio && result.audio.suspended && result.audio.resumed
    && result.audio.contextState === 'running' && !result.audio.paused && result.audio.currentTime > 0
    && result.lyrics && result.lyrics.restored && result.lyrics.attached
    && result.lyrics.text === '后台恢复歌词测试';
  console.log('MINERADIO_BACKGROUND_SMOKE:' + JSON.stringify({ ok, result }));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch(error => {
  console.error('MINERADIO_BACKGROUND_SMOKE_ERROR:' + (error && error.stack || error));
  app.exit(1);
});
