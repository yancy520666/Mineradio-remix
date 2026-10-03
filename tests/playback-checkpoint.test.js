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
test('duplicate-content optimization still repairs a corrupt primary after backup recovery', async t => {
  const directory = fixture(t), now = Date.now();
  const store = createPlaybackCheckpointStore(directory);
  await store.save(snapshot(10, now - 100)); await store.save(snapshot(20, now));
  const file = path.join(directory, 'playback-checkpoint.json');
  fs.writeFileSync(file, '{broken');
  const recovered = createPlaybackCheckpointStore(directory);
  const result = await recovered.save(snapshot(10, now + 1));
  assert.equal(result.skipped, undefined);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).currentTime, 10);
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
test('unchanged checkpoints skip fsync but preserve ordering and important state changes', async t => {
  const directory = fixture(t), now = Date.now();
  let syncs = 0;
  const io = Object.create(fs.promises);
  io.open = async (...args) => {
    const handle = await fs.promises.open(...args);
    const original = handle.sync.bind(handle);
    handle.sync = async () => { syncs++; return original(); };
    return handle;
  };
  const store = createPlaybackCheckpointStore(directory, { io });
  await store.save(snapshot(42, now)); assert.equal(syncs, 1);
  for (let i = 1; i <= 4; i++) assert.equal((await store.save({ ...snapshot(42, now + i), reason: 'timeupdate' })).skipped, true);
  assert.equal(syncs, 1, 'identical progress cannot rewrite main and backup');
  await store.save(snapshot(10, now + 3)); assert.equal(store.read().currentTime, 42);
  await store.save(snapshot(43, now + 5)); assert.equal(syncs, 3);
  await store.save({ ...snapshot(43, now + 6), playing: false }); assert.equal(syncs, 5);
  const changed = { ...snapshot(43, now + 7), current: { id: 72, name: 'Next' } };
  await store.save(changed); assert.equal(syncs, 7); assert.equal(store.read().current.id, 72);
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
    lastPlaybackSnapshotMonotonicAt: null, performance: { now: () => 0 },
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

test('a system clock set back keeps saving progress and does not discard the last checkpoint', async t => {
  const directory = fixture(t), store = createPlaybackCheckpointStore(directory), now = Date.now();
  assert.equal((await store.save({ ...snapshot(40), savedAt: now })).ok, true);
  const rolledBack = await store.save({ ...snapshot(55), savedAt: now - 3600000 });
  assert.equal(rolledBack.skipped, undefined, 'an hour back is a clock change, not a late write');
  assert.equal(createPlaybackCheckpointStore(directory).read().currentTime, 55);
  assert.equal((await store.save({ ...snapshot(56), savedAt: now - 3600000 - 2000 })).skipped, true, 'a genuinely late write is still dropped');
  const future = normalize({ ...snapshot(70), savedAt: now + 3600000 });
  assert.ok(future && future.savedAt <= Date.now(), 'a checkpoint written before the clock moved back is kept');
});

test('renderer periodic saves continue after clock rollback and a forced pause save', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/09-queue-snapshot-autoplay.js'), 'utf8');
  let wall = 1700000000000, elapsed = 0, position = 10;
  const saved = [];
  const song = { id: 1, name: 'Clock song' };
  const c = vm.createContext({ Date: { now: () => wall }, performance: { now: () => elapsed },
    audio: { paused: false, ended: false }, currentIdx: 0, playQueue: [song], currentCoverSong: () => song,
    restoredLastPlaybackSnapshot: null, lastPlaybackSnapshotSavedAt: 0, lastPlaybackSnapshotMonotonicAt: null,
    getPlaybackCurrentSeconds: () => position, getPlaybackDurationSeconds: () => 100,
    localStorage: { setItem() {} }, persistPlaybackCheckpoint: payload => saved.push(payload) });
  vm.runInContext(source.slice(0, source.indexOf('function readLastPlaybackSnapshot()'))
    + source.slice(source.indexOf('function saveLastPlaybackSnapshot('), source.indexOf('function applyRestoredPlaybackProgressUi(')), c);
  c.saveLastPlaybackSnapshot(false, 'tick');
  wall -= 3600000; elapsed += 3000; position = 20;
  c.saveLastPlaybackSnapshot(false, 'tick');
  position = 21; c.saveLastPlaybackSnapshot(true, 'pause');
  elapsed += 1000; c.saveLastPlaybackSnapshot(false, 'tick');
  elapsed += 2000; position = 24; c.saveLastPlaybackSnapshot(false, 'tick');
  assert.deepEqual(saved.map(value => value.currentTime), [10, 20, 21, 24]);
});
