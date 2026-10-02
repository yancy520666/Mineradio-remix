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
