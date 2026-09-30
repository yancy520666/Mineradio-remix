'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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
  if (process.argv.includes('--baseline')) {
    const committed = execFileSync('git', ['show', 'HEAD:public/js/modules/02-visual/14-stage-lyrics-rendering.js'], { cwd: appRoot, encoding: 'utf8' });
    for (const name of ['markStageLyricsPlaybackResume', 'restorePausedStageLyrics', 'restoreStageLyricsAfterBackground']) {
      const start = committed.indexOf('function ' + name + '(');
      const end = committed.indexOf('\nfunction ', start + 1);
      if (start < 0 || end < 0) throw new Error('Missing committed recovery function');
      await win.webContents.executeJavaScript('window.' + name + ' = ' + committed.slice(start, end) + '; void 0;');
    }
  }
  const result = await win.webContents.executeJavaScript(`(async () => {
    dismissSplash({ instant: true });
    await new Promise(resolve => setTimeout(resolve, 80));
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
      applyRendererPowerMode();
      const retainedWidth = renderer.domElement.width;
      const retainedHeight = renderer.domElement.height;
      const nativeRender = renderer.render.bind(renderer);
      let renderCalls = 0;
      renderer.render = (...args) => { renderCalls++; return nativeRender(...args); };
      desktopRuntimeState.desktop = true;
      desktopRuntimeState.minimized = true;
      desktopRuntimeState.visible = false;
      updateRenderPowerClasses();
      applyRendererPowerMode();
      const slept = isDeepBackgroundMode() && document.body.classList.contains('render-deep-sleep');
      const retainedCanvas = renderer.domElement.width === retainedWidth && renderer.domElement.height === retainedHeight;
      const canvasStyle = getComputedStyle(document.getElementById('canvas-container'));
      const retainedLayer = canvasStyle.visibility !== 'hidden' && Number(canvasStyle.opacity) > 0;
      const beforeSleep = renderCalls;
      await new Promise(resolve => setTimeout(resolve, 2100));
      const sleptWithoutRendering = renderCalls === beforeSleep;
      window.desktopWindow = { getState: () => Promise.resolve({ isMinimized: false, isVisible: true, isFocused: false }) };
      const beforeWake = renderCalls;
      await refreshDesktopRuntimeStateAfterWake('electron-smoke');
      result.wake = {
        slept, retainedCanvas, retainedLayer, sleptWithoutRendering,
        paintedBeforeFocus: renderCalls > beforeWake && !desktopRuntimeState.focused,
        awake: !isDeepBackgroundMode() && !document.body.classList.contains('render-deep-sleep'),
        canvasWidth: renderer.domElement.width,
      };
      renderer.render = nativeRender;

      const sampleRate = 8000;
      const samples = sampleRate * 30;
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
      // Exercise a single first-play request while native visibility is still stale.
      // Wait for actual material opacity and a changed GPU framebuffer, not just a mesh pointer.
      result.firstPlay = [];
      for (const scenario of ['missing-pause-hide', 'detached', 'hidden-group']) {
        media.pause();
        playing = false;
        fx.lyricPauseHold = true;
        clearStageLyrics();
        restoreStageLyricsAfterBackground('fixture');
        const before = stageLyrics.current;
        if (scenario === 'missing-pause-hide') {
          clearStageLyrics(); fx.lyricPauseHold = false;
          scene.remove(stageLyrics.group);
          stageLyrics.group.visible = false;
        }
        if (scenario === 'detached') stageLyrics.group.remove(before);
        if (scenario === 'hidden-group') {
          scene.remove(stageLyrics.group);
          stageLyrics.group.visible = false;
          before.visible = false;
        }
        desktopRuntimeState.desktop = true;
        desktopRuntimeState.minimized = true;
        desktopRuntimeState.visible = false;
        updateRenderPowerClasses();
        applyRendererPowerMode();
        await audioCtx.suspend();
        let playRequests = 0;
        const nativePlay = media.play.bind(media);
        media.play = () => { playRequests++; return nativePlay(); };
        const resumed = await resumePausedAudioFast({ manual: true });
        media.play = nativePlay;
        const end = Date.now() + 2500;
        let visibleText = false;
        while (Date.now() < end) {
          const mesh = stageLyrics.current;
          const data = mesh && mesh.userData.lyric;
          visibleText = !!(mesh && mesh.parent === stageLyrics.group && mesh.visible && stageLyrics.group.visible
            && stageLyrics.group.parent === scene && data && ((data.rowLayers || []).some(row => getLyricTextureMaterialOpacity(row.mat) > 0.02)
              || data.textMat && data.textMat.uniforms && data.textMat.uniforms.uOpacity && data.textMat.uniforms.uOpacity.value > 0.02));
          if (visibleText && !isDeepBackgroundMode()) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        let changedPixels = 0;
        if (visibleText && !isDeepBackgroundMode()) {
          const gl = renderer.getContext();
          const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
          const shown = new Uint8Array(width * height * 4);
          const hidden = new Uint8Array(shown.length);
          renderer.render(scene, camera);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, shown);
          stageLyrics.current.visible = false;
          renderer.render(scene, camera);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, hidden);
          stageLyrics.current.visible = true;
          for (let offset = 0; offset < shown.length; offset += 4) {
            if (shown[offset] !== hidden[offset] || shown[offset + 1] !== hidden[offset + 1] || shown[offset + 2] !== hidden[offset + 2]) changedPixels++;
          }
        }
        result.firstPlay.push({ scenario, resumed, playRequests, awake: !isDeepBackgroundMode(), visibleText, changedPixels,
          reused: before === stageLyrics.current, diagnostics: { playing, particleLyrics: fx.particleLyrics,
            attached: !!(stageLyrics.current && stageLyrics.current.parent === stageLyrics.group),
            groupAttached: stageLyrics.group.parent === scene, groupVisible: stageLyrics.group.visible,
            meshVisible: stageLyrics.current && stageLyrics.current.visible,
            age: stageLyrics.current && stageLyrics.current.userData.age,
            rows: stageLyrics.current && (stageLyrics.current.userData.lyric.rowLayers || []).map(row => getLyricTextureMaterialOpacity(row.mat)) } });
      }
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
    && result.wake.retainedCanvas && result.wake.retainedLayer && result.wake.sleptWithoutRendering && result.wake.paintedBeforeFocus
    && result.audio && result.audio.suspended && result.audio.resumed
    && result.audio.contextState === 'running' && !result.audio.paused && result.audio.currentTime > 0
    && result.lyrics && result.lyrics.restored && result.lyrics.attached
    && result.lyrics.text === '后台恢复歌词测试'
    && result.firstPlay.every(item => item.resumed && item.playRequests === 1 && item.awake && item.visibleText && item.changedPixels > 10)
    && result.firstPlay.find(item => item.scenario === 'hidden-group').reused;
  console.log('MINERADIO_BACKGROUND_SMOKE:' + JSON.stringify({ ok, result }));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch(error => {
  console.error('MINERADIO_BACKGROUND_SMOKE_ERROR:' + (error && error.stack || error));
  app.exit(1);
});
