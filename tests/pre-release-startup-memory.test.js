const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
function source(file, from, to) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  const start = code.indexOf(from);
  const end = code.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${file}: missing function boundary`);
  return code.slice(start, end);
}

test('fresh install runs visual guide once, then login; help can replay it', () => {
  const saved = new Map();
  const timers = [];
  const shown = [];
  const bodyClasses = new Set();
  const context = {
    localStorage: { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    window: {},
    VISUAL_GUIDE_SEEN_STORE_KEY: 'guide-seen',
    visualGuideActive: false,
    visualGuideState: null,
    immersiveMode: false,
    playing: false,
    originalProfileImportPending: false,
    setTimeout: (fn) => { timers.push(fn); },
    document: {
      body: { classList: { remove: (...names) => names.forEach((name) => bodyClasses.delete(name)) } },
      getElementById: () => null,
      activeElement: null
    },
    $input: null,
    startVisualGuide: (options) => shown.push(options),
    maybeRunStartupLoginGuide: () => shown.push('login')
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/js/modules/00-state/02a-onboarding-state.js'), 'utf8'), context);
  const file = 'public/js/modules/09a-onboarding-guide.js';
  vm.runInContext(source(file, 'function visualGuideWasSeen()', 'function startVisualGuide(opts)'), context);
  vm.runInContext(source(file, 'function closeVisualGuide(markSeen)', 'function handleVisualGuideSurfaceClick(e)'), context);

  context.originalProfileImportPending = true;
  assert.equal(context.maybeRunStartupVisualGuide('splash'), false);
  context.originalProfileImportPending = false;
  assert.equal(context.maybeRunStartupVisualGuide('splash'), true);
  assert.equal(context.maybeRunStartupVisualGuide('splash'), false);
  timers.shift()();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].source, 'splash');

  context.visualGuideState = { manual: false, searchWasPeek: false, fxWasPeek: false, plWasPeek: false, bottomWasVisible: false };
  context.closeVisualGuide(true);
  assert.equal(saved.get('guide-seen'), '1');
  assert.equal(shown[1], 'login');
  assert.equal(context.maybeRunStartupVisualGuide('splash'), false);

  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(html, /id="visual-guide-btn"[^>]*startVisualGuide\(\{ manual: true \}\)/);
  context.startVisualGuide({ manual: true });
  assert.equal(shown[2].manual, true);
});

test('automatic system memory cleanup never requests UAC; explicit manual cleanup can', async () => {
  const calls = [];
  const context = {
    SYSTEM_PURGE_AVAILABLE: true,
    SYSTEM_PURGE_ENABLED: true,
    isProcessElevated: async () => false,
    purgeSystemMemory: async () => { calls.push('normal'); },
    purgeSystemMemoryElevated: async () => { calls.push('elevated'); }
  };
  vm.createContext(context);
  vm.runInContext(source('desktop/system-memory.js', 'async function purgeSystemMemorySmart(', 'function queryExtendedMemoryStats()'), context);
  await context.purgeSystemMemorySmart(29, { autoElevate: true });
  await context.purgeSystemMemorySmart(29, { manual: true, autoElevate: true });
  assert.deepEqual(calls, ['normal', 'elevated']);
});

test('old memory settings disable automatic elevation while preserving background cleanup', () => {
  const context = {
    fx: {
      memorySafetyRevision: 3,
      memorySystemAutoElevate: true,
      memoryAutoTrimApp: true,
      memoryAutoTrimOnBackground: true,
      memoryAutoSystemTrim: true
    },
    fxDefaults: { memorySystemIntervalMin: 30, memorySystemThresholdPercent: 78, memorySystemMask: 29 },
    MEMORY_SAFE_REVISION: 4,
    MEMORY_REDUCT_MASK_DEFAULT: 29,
    clampRange: (value, min, max) => Math.max(min, Math.min(max, value))
  };
  vm.createContext(context);
  vm.runInContext(source('public/js/modules/00-state/11-system-memory-controls.js', 'function normalizeMemorySystemMask(', 'function memoryAutoConfigPayload('), context);
  context.ensureMemoryFxDefaults();
  assert.equal(context.fx.memorySafetyRevision, 4);
  assert.equal(context.fx.memorySystemAutoElevate, false);
  assert.equal(context.fx.memoryAutoTrimApp, true);
  assert.equal(context.fx.memoryAutoTrimOnBackground, true);
  assert.equal(context.fx.memoryAutoSystemTrim, true);
});

test('built-in playlist dialog accepts a name and cancellation without native prompt', async () => {
  const classes = new Set();
  const input = { value: '', focus() {}, select() {} };
  const heading = { textContent: '' };
  const modal = { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) } };
  const elements = {
    'built-in-playlist-prompt': modal,
    'built-in-playlist-prompt-input': input,
    'built-in-playlist-prompt-title': heading
  };
  const context = {
    document: { getElementById: (id) => elements[id] },
    Promise,
    console,
    createBuiltInPlaylist: async () => null
  };
  vm.createContext(context);
  const file = 'public/js/modules/06-lyrics/00-built-in-playlists.js';
  vm.runInContext(source(file, 'var builtInPlaylistPromptResolve', 'async function addTrackToBuiltInPlaylist('), context);

  const accepted = context.askBuiltInPlaylistName('重命名内置歌单', '旧名称');
  assert.equal(classes.has('show'), true);
  assert.equal(heading.textContent, '重命名内置歌单');
  input.value = '新名称';
  context.closeBuiltInPlaylistPrompt(true);
  assert.equal(await accepted, '新名称');
  assert.equal(classes.has('show'), false);

  const canceled = context.askBuiltInPlaylistName('新建歌单', '');
  context.closeBuiltInPlaylistPrompt(false);
  assert.equal(await canceled, null);
  assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /window\.prompt/);
});

test('application renderer sources never reintroduce Electron native prompt calls', () => {
  const scan = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.name.endsWith('.js')) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\b(?:window\s*\.\s*)?prompt\s*\(/, file);
    }
  };
  scan(path.join(root, 'public/js/modules'));
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'), /\b(?:window\s*\.\s*)?prompt\s*\(/);
});
