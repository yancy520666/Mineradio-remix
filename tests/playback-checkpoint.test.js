'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { createPlaybackCheckpointStore } = require('../desktop/playback-checkpoint-store');
const { normalize } = require('../public/js/playback-checkpoint-format');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-checkpoint-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function snapshot(time = 42, savedAt = Date.now()) {
  const current = { id: 71, name: 'Checkpoint song', provider: 'netease' };
  return { version: 1, savedAt, currentTime: time, duration: 100, currentIdx: 0, playing: true, current, queue: [current] };
}
test('latest checkpoint survives process death without shutdown handlers', async t => {
  const directory = fixture(t);
  const child = spawn(process.execPath, ['-e', `const {createPlaybackCheckpointStore}=require('./desktop/playback-checkpoint-store');
    createPlaybackCheckpointStore(process.argv[1]).save(JSON.parse(process.argv[2])).then(r=>{console.log(JSON.stringify(r));setInterval(()=>{},1000)});`, directory, JSON.stringify(snapshot(64))], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('checkpoint acknowledgement timed out')), 5000);
    child.once('error', reject);
    child.stdout.once('data', data => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
  });
  assert(result.ok);
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGKILL'); await exited;
  const restored = createPlaybackCheckpointStore(directory).read();
  assert.equal(restored.current.id, 71); assert.equal(restored.currentTime, 64);
});
test('corrupt main file and interrupted temporary write fall back to valid backup', async t => {
  const directory = fixture(t), store = createPlaybackCheckpointStore(directory), now = Date.now();
  await store.save(snapshot(10, now - 100)); await store.save(snapshot(20, now));
  fs.writeFileSync(path.join(directory, 'playback-checkpoint.json'), '{broken');
  fs.writeFileSync(path.join(directory, 'playback-checkpoint.json.tmp'), '{partial');
  assert.equal(createPlaybackCheckpointStore(directory).read().currentTime, 10);
});
test('out-of-order submissions cannot overwrite progress, failed writes preserve last valid file', async t => {
  const directory = fixture(t), store = createPlaybackCheckpointStore(directory), now = Date.now();
  await Promise.all([store.save(snapshot(70, now)), store.save(snapshot(12, now - 1))]);
  assert.equal(store.read().currentTime, 70);
  const io = Object.create(fs.promises);
  io.open = async () => { throw Object.assign(Error('full disk'), { code: 'ENOSPC' }); };
  const failing = createPlaybackCheckpointStore(directory, { io });
  assert.equal((await failing.save(snapshot(80, now + 1))).error, 'ENOSPC');
  assert.equal(createPlaybackCheckpointStore(directory).read().currentTime, 70);
  assert.equal((await store.save({ ...snapshot(), currentTime: NaN })).ok, false);
  assert.equal(normalize({ ...snapshot(), currentTime: 200 }).currentTime, 100);
});
test('browser snapshots remain compatible and newest valid source wins', () => {
  const now = Date.now(), local = snapshot(20, now), disk = snapshot(50, now + 1);
  const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/09-queue-snapshot-autoplay.js'), 'utf8');
  const context = vm.createContext({ PlaybackCheckpointFormat: { normalize }, localStorage: { getItem: () => JSON.stringify(local) }, LAST_PLAYBACK_STORE_KEY: 'last', window: { desktopWindow: { readPlaybackCheckpointSync: () => ({ ok: true, payload: disk }) } } });
  vm.runInContext(source.slice(source.indexOf('function readLastPlaybackSnapshot()'), source.indexOf('function saveLastPlaybackSnapshot(')), context);
  assert.equal(context.readLastPlaybackSnapshot().currentTime, 50);
  disk.savedAt = now - 1; assert.equal(context.readLastPlaybackSnapshot().currentTime, 20);
  disk.currentTime = -1; assert.equal(context.readLastPlaybackSnapshot().currentTime, 20);
});
test('resume waits for metadata and does not erase the saved position while loading', () => {
  const handlers = {}, media = { readyState: 0, currentTime: 0, duration: NaN, addEventListener: (event, fn) => { handlers[event] = fn; } };
  const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/12-playback-switch-core.js'), 'utf8');
  const start = source.indexOf('function scheduleAudioResumePosition('), end = source.indexOf('\n}\n', start) + 3;
  const context = vm.createContext({ trackSwitchToken: 1, updatePlaybackProgressUi() {}, setTimeout() {} });
  vm.runInContext(source.slice(start, end), context);
  context.scheduleAudioResumePosition(media, 37.25, 1);
  assert.equal(media.currentTime, 0); assert.equal(media.__mineradioPendingResumeAt, 37.25);
  media.readyState = 1; media.duration = 120; handlers.loadedmetadata();
  assert.equal(media.currentTime, 37.25); assert.equal(media.__mineradioPendingResumeAt, 0);
  context.scheduleAudioResumePosition(media, 50, 1);
  // The applied position remains stable when a later track emits an old event.
  context.trackSwitchToken = 2; handlers.canplay(); assert.equal(media.currentTime, 50);
});
test('large queues keep the current track; browser storage failure still saves to disk', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/09-queue-snapshot-autoplay.js'), 'utf8');
  const queue = Array.from({ length: 500 }, (_, id) => ({ id: id + 1, name: 'Song ' + id })), saved = [];
  let matches = true;
  const c = vm.createContext({ audio: { paused: false, ended: false, __mineradioPendingResumeAt: 37.25 }, currentIdx: 350, playQueue: queue,
    currentCoverSong: () => queue[350], restoredLastPlaybackSnapshot: null, lastPlaybackSnapshotSavedAt: 0,
    playbackMediaMatchesCurrentQueueItem: () => matches, getPlaybackCurrentSeconds: () => 0, getPlaybackDurationSeconds: () => 120,
    localStorage: { setItem() { throw Error('quota exceeded'); } }, persistPlaybackCheckpoint: data => saved.push(data) });
  vm.runInContext(source.slice(0, source.indexOf('function readLastPlaybackSnapshot()')) + source.slice(source.indexOf('function saveLastPlaybackSnapshot('), source.indexOf('function applyRestoredPlaybackProgressUi(')), c);
  c.saveLastPlaybackSnapshot(true, 'loading');
  assert.equal(saved[0].queue.length, 120); assert.equal(saved[0].queue[saved[0].currentIdx].id, 351);
  assert.equal(saved[0].current.id, 351); assert.equal(saved[0].currentTime, 37.25);
  matches = false; c.saveLastPlaybackSnapshot(true, 'stale-audio'); assert.equal(saved.length, 1);
  assert.equal(normalize({ ...snapshot(), current: { id: 1, name: 'safe', cover: 'https://example/a" onerror="alert(1)' } }).current.cover, undefined);
});
test('busy IPC coalesces pending saves and shutdown can await the complete chain', async () => {
  const calls = [], acknowledgements = [];
  const c = vm.createContext({ window: { desktopWindow: { savePlaybackCheckpoint: payload => {
    calls.push(payload); return new Promise(resolve => acknowledgements.push(resolve));
  } } }, console, Promise });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/09a-playback-checkpoint.js'), 'utf8'), c);
  c.persistPlaybackCheckpoint({ currentTime: 10 }); c.persistPlaybackCheckpoint({ currentTime: 20 }); c.persistPlaybackCheckpoint({ currentTime: 30 });
  const pending = c.playbackCheckpointPending;
  acknowledgements[0]({ ok: true });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.deepEqual(calls.map(c => c.currentTime), [10, 30]);
  acknowledgements[1]({ ok: true }); await pending;
  assert.equal(c.playbackCheckpointPending, null);
});
