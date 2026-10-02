'use strict';

// On Windows, Chromium stops animation frames for windows it considers
// occluded. A hidden QA window covered by other desktop windows then renders
// nothing (no rAF, no GSAP), which made Electron smokes pass or fail depending
// on what else was on screen. Keep frames running for these test processes
// only; production startup is unchanged. Call before the app is ready.
function keepTestWindowFramesRunning(app) {
  const disabled = app.commandLine.getSwitchValue('disable-features');
  app.commandLine.appendSwitch('disable-features', [disabled, 'CalculateNativeWinOcclusion'].filter(Boolean).join(','));
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

module.exports = { keepTestWindowFramesRunning };
