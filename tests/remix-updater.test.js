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
