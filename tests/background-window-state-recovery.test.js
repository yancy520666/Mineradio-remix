'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '00-state', '08-desktop-render-power.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = source.indexOf('\n}\n', start);
  assert.ok(next > start, `unterminated ${name}`);
  return source.slice(start, next + 3);
}

function makeContext(getState) {
  const events = [];
  const context = vm.createContext({
    desktopRuntimeState: {
      desktop: true, minimized: true, visible: false, focused: false,
      fullscreen: false, embedded: false, interactive: false,
    },
    desktopRuntimeStateRevision: 0,
    window: { desktopWindow: { getState } },
    document: { hidden: false },
    fx: null,
    isLiveBackgroundKeepMode: () => false,
    updateRenderPowerClasses: () => events.push('classes'),
    applyRendererPowerMode: () => events.push('renderer'),
    recoverVisualsAfterBackground: () => events.push('visuals'),
    wakeMainLoopFromBackground: () => events.push('loop'),
    console: { warn() {} },
    Promise,
  });
  vm.runInContext([
    functionSource('isDeepBackgroundMode'),
    functionSource('updateDesktopRuntimeState'),
    functionSource('refreshDesktopRuntimeStateAfterWake'),
  ].join('\n'), context);
  return { context, events };
}

async function testWakeReadsNativeWindowState() {
  const { context, events } = makeContext(() => Promise.resolve({ isMinimized: false, isVisible: true, isFocused: false }));
  assert.equal(context.isDeepBackgroundMode(), true);
  context.refreshDesktopRuntimeStateAfterWake('test');
  await Promise.resolve();
  assert.equal(context.isDeepBackgroundMode(), false);
  assert.equal(context.desktopRuntimeState.focused, false, 'a preview must not need focus');
  assert.deepEqual(events, ['classes', 'renderer', 'visuals', 'loop']);
}

async function testNativePushWakesWithoutFocusOrVisibilityEvent() {
  const { context, events } = makeContext(() => Promise.resolve({}));
  context.document.hidden = true; // Chromium visibility can lag the native restore.
  context.updateDesktopRuntimeState({ isMinimized: false, isVisible: true, isFocused: false });
  assert.equal(context.isDeepBackgroundMode(), false);
  assert.deepEqual(events, ['classes', 'renderer', 'visuals', 'loop']);
}

async function testNewerWindowPushWinsOverLateReply() {
  let resolveState;
  const { context, events } = makeContext(() => new Promise(resolve => { resolveState = resolve; }));
  context.refreshDesktopRuntimeStateAfterWake('test');
  context.updateDesktopRuntimeState({ isMinimized: true, isVisible: false });
  resolveState({ isMinimized: false, isVisible: true });
  await Promise.resolve();
  assert.equal(context.isDeepBackgroundMode(), true);
  assert.deepEqual(events, ['classes', 'renderer']);
}

Promise.resolve()
  .then(testWakeReadsNativeWindowState)
  .then(testNativePushWakesWithoutFocusOrVisibilityEvent)
  .then(testNewerWindowPushWinsOverLateReply)
  .then(() => console.log('OK background-window-state-recovery'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
