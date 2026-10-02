'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRemixUpdater } = require('../desktop/remix-updater');

test('no release and slow network keep update checks nonblocking', async () => {
  const native = new EventEmitter();
  let finishCheck;
  native.checkForUpdates = () => new Promise(resolve => { finishCheck = resolve; });
  const updater = createRemixUpdater({ app: { getVersion: () => '2.2.1' }, enabled: true, loadUpdater: () => native });
  const pending = updater.check();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(updater.getState().status, 'checking');
  native.emit('update-not-available');
  finishCheck();
  await pending;
  assert.equal(updater.getState().status, 'current');
  assert.equal(updater.getState().version, '');
  assert.equal(native.autoDownload, false);
  assert.equal(native.autoInstallOnAppQuit, false);
});

test('download waits for user action, tracks progress and installs only when ready', async () => {
  const native = new EventEmitter();
  let installed = 0;
  native.checkForUpdates = async () => native.emit('update-available', { version: '2.2.2' });
  native.downloadUpdate = async () => {
    native.emit('download-progress', { percent: 40 });
    native.emit('update-downloaded', { version: '2.2.2' });
  };
  native.quitAndInstall = () => { installed++; };
  const updater = createRemixUpdater({ app: { getVersion: () => '2.2.1' }, enabled: true, loadUpdater: () => native });
  assert.equal(updater.install().ok, false);
  await updater.check();
  assert.equal(updater.getState().status, 'available');
  await updater.download();
  assert.equal(updater.getState().status, 'downloaded');
  assert.equal(updater.getState().percent, 100);
  assert.equal(installed, 0);
  assert.equal(updater.install().ok, true);
  assert.equal(installed, 1);
});

test('checksum or network failure is reported without claiming a downloaded update', async () => {
  const native = new EventEmitter();
  native.checkForUpdates = async () => native.emit('update-available', { version: '2.2.2' });
  native.downloadUpdate = async () => { throw new Error('sha512 mismatch'); };
  const updater = createRemixUpdater({ app: { getVersion: () => '2.2.1' }, enabled: true, loadUpdater: () => native });
  await updater.check();
  await updater.download();
  assert.equal(updater.getState().status, 'error');
  assert.match(updater.getState().error, /sha512 mismatch/);
  assert.equal(updater.install().ok, false);
});

test('late progress and downloaded events cannot revive a failed download or bypass user confirmation', async () => {
  const native = new EventEmitter();
  native.quitAndInstall = () => {};
  native.checkForUpdates = async () => native.emit('update-available', { version: '2.2.2' });
  native.downloadUpdate = async () => { throw new Error('fixture failure'); };
  const updater = createRemixUpdater({ app: { getVersion: () => '2.2.1' }, enabled: true, loadUpdater: () => native });
  await updater.check();
  native.emit('update-downloaded', { version: '2.2.2' });
  assert.equal(updater.install().ok, false, 'an event outside the confirmed download is not readiness');
  await updater.download();
  assert.equal(updater.getState().status, 'error');
  native.emit('download-progress', { percent: 99 });
  native.emit('update-downloaded', { version: '2.2.2' });
  assert.equal(updater.getState().status, 'error');
  assert.equal(updater.install().ok, false);
});

test('an empty download result without a verified completion event is not an installable update', async () => {
  const native = new EventEmitter();
  native.checkForUpdates = async () => native.emit('update-available', { version: '2.2.2' });
  native.downloadUpdate = async () => [];
  const updater = createRemixUpdater({ app: { getVersion: () => '2.2.1' }, enabled: true, loadUpdater: () => native });
  await updater.check(); await updater.download();
  assert.equal(updater.getState().status, 'error'); assert.equal(updater.install().ok, false);
});

test('duplicate checks and confirmations use one native operation, and wrong-version events cannot mark readiness', async () => {
  const native = new EventEmitter();
  native.quitAndInstall = () => {};
  let checks = 0, downloads = 0, finish;
  native.checkForUpdates = async () => { checks++; native.emit('update-available', { version: '2.2.2' }); };
  native.downloadUpdate = () => { downloads++; return new Promise(resolve => { finish = resolve; }); };
  const updater = createRemixUpdater({ app: { getVersion: () => '2.2.1' }, enabled: true, loadUpdater: () => native });
  await Promise.all([updater.check(), updater.check()]); assert.equal(checks, 1);
  const pending = updater.download(); await Promise.resolve();
  await updater.download(); assert.equal(downloads, 1);
  native.emit('update-downloaded', { version: '2.2.0' });
  assert.equal(updater.install().ok, false);
  native.emit('update-downloaded', { version: '2.2.2' }); finish(['fixture.exe']);
  await pending; assert.equal(updater.getState().status, 'downloaded');
});

test('an installed update download is removed; a newer pending one and the differential base are kept', () => {
  const fsMod = require('node:fs'), osMod = require('node:os'), pathMod = require('node:path');
  const { cleanupInstalledPendingUpdate } = require('../desktop/remix-updater');
  const root = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'mineradio-updater-cache-'));
  try {
    const resources = pathMod.join(root, 'resources'), local = pathMod.join(root, 'local');
    const cache = pathMod.join(local, 'fixture-remix-updater'), pending = pathMod.join(cache, 'pending');
    fsMod.mkdirSync(resources, { recursive: true });
    fsMod.writeFileSync(pathMod.join(resources, 'app-update.yml'), 'provider: github\nupdaterCacheDirName: fixture-remix-updater\n');
    const seed = (version) => {
      fsMod.mkdirSync(pending, { recursive: true });
      fsMod.writeFileSync(pathMod.join(pending, 'update-info.json'), JSON.stringify({ fileName: `Mineradio-Remix-${version}-Setup.exe` }));
      fsMod.writeFileSync(pathMod.join(pending, `Mineradio-Remix-${version}-Setup.exe`), 'fixture');
    };
    fsMod.mkdirSync(cache, { recursive: true });
    fsMod.writeFileSync(pathMod.join(cache, 'installer.exe'), 'differential base');
    const args = { currentVersion: '2.3.0', resourcesPath: resources, localAppData: local };
    seed('2.4.0');
    assert.deepEqual(cleanupInstalledPendingUpdate(args), { removed: false, reason: 'newer-pending' });
    assert.ok(fsMod.existsSync(pending));
    fsMod.rmSync(pending, { recursive: true });
    seed('2.3.0');
    assert.deepEqual(cleanupInstalledPendingUpdate(args), { removed: true, version: '2.3.0' });
    assert.equal(fsMod.existsSync(pending), false);
    assert.ok(fsMod.existsSync(pathMod.join(cache, 'installer.exe')), 'differential base kept');
    assert.deepEqual(cleanupInstalledPendingUpdate(args), { removed: false, reason: 'none' });
  } finally {
    fsMod.rmSync(root, { recursive: true, force: true });
  }
});

test('the update dialog gets only the release highlights as short plain text', () => {
  const { extractReleaseHighlights } = require('../desktop/remix-updater');
  const markdown = '# Mineradio Remix 9.9.9\n\nIntro.\n\n## 更新重点\n\n- **第一项重点**：很长的说明……\n- **第二项**：说明\n\n## 播放与进度\n\n- 其他条目\n';
  assert.deepEqual(extractReleaseHighlights(markdown), ['第一项重点', '第二项']);
  const html = '<h2>本版重点</h2><ul><li><strong>旧标题 &amp; 也能识别</strong>：说明</li><li><strong><img src=x onerror=alert(1)>脚本</strong></li></ul><h2>其他</h2><ul><li>x</li></ul>';
  assert.deepEqual(extractReleaseHighlights(html), ['旧标题 & 也能识别', '脚本'], 'markup is reduced to text');
  const many = '## 更新重点\n' + Array.from({ length: 8 }, (_, i) => '- **重点' + i + '**').join('\n');
  assert.equal(extractReleaseHighlights(many).length, 4);
  assert.equal(extractReleaseHighlights('- ' + '长'.repeat(80)).length > 0, true);
  assert.ok(extractReleaseHighlights('- ' + '长'.repeat(80))[0].length <= 40);
  assert.deepEqual(extractReleaseHighlights(null), []);
});
