'use strict';
// Real locked updater + digest pipeline. Loopback transport only; fake bytes are never executed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Module = require('node:module');
const { NsisUpdater } = require('electron-updater/out/NsisUpdater');
const runtime = require('builder-util-runtime');
const { createRemixUpdater } = require('../desktop/remix-updater');

function executorClass() {
  if (process.env.MINERADIO_UPDATE_DIGEST_MUTANT !== '1') return runtime.HttpExecutor;
  const file = require.resolve('builder-util-runtime/out/httpExecutor');
  const source = fs.readFileSync(file, 'utf8');
  const guard = 'if (this._actual !== this.expected)';
  assert.equal(source.split(guard).length, 2);
  const mod = { exports: {} };
  const fn = new vm.Script(Module.wrap(source.replace(guard, 'if (false)')), { filename: file }).runInThisContext();
  fn(mod.exports, Module.createRequire(file), mod, file, path.dirname(file));
  return mod.exports.HttpExecutor;
}

test('actual updater rejects damaged/truncated downloads and downgrade, and accepts matching bytes', { timeout: 15000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-download-boundary-'));
  const bytes = Buffer.from('isolated fixture bytes, not an executable'.repeat(150));
  const digest = crypto.createHash('sha512').update(bytes).digest('base64');
  let assetRequests = 0;
  const server = http.createServer((req, res) => {
    const kind = req.url.split('/')[1];
    if (req.url.includes('latest.yml')) {
      const info = { version: kind === 'older' ? '2.2.3' : '2.2.5',
        files: [{ url: 'fixture.exe', sha512: digest, size: bytes.length }], path: 'fixture.exe', sha512: digest };
      res.end(JSON.stringify(info)); return;
    }
    assert(req.url.includes('fixture.exe'), 'unexpected fixture request');
    assetRequests++;
    res.setHeader('Content-Length', bytes.length);
    if (kind === 'corrupt') res.end(Buffer.alloc(bytes.length, 1));
    else if (kind === 'truncated') res.end(bytes.subarray(0, 40));
    else res.end(bytes);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    class LoopbackExecutor extends executorClass() {
      createRequest(options, callback) {
        assert.equal(options.hostname, '127.0.0.1'); assert.equal(Number(options.port), port);
        assert.equal(options.protocol, 'http:');
        options.timeout = 1000;
        return http.request(options, callback);
      }
      download(url, destination, options) {
        return options.cancellationToken.createPromise((resolve, reject, onCancel) => {
          const requestOptions = { headers: options.headers, timeout: 1000 };
          runtime.configureRequestUrl(url, requestOptions);
          runtime.configureRequestOptions(requestOptions);
          this.doDownload(requestOptions, { destination, options, onCancel, responseHandler: null,
            callback: error => error ? reject(error) : resolve(destination) }, 0);
        });
      }
    }
    for (const kind of ['valid', 'corrupt', 'truncated', 'older']) {
      const dir = path.join(root, kind); fs.mkdirSync(dir);
      const config = path.join(dir, 'app-update.yml');
      fs.writeFileSync(config, JSON.stringify({ provider: 'generic', url: `http://127.0.0.1:${port}/${kind}/`, updaterCacheDirName: 'updates' }));
      const app = { name: 'fixture', version: '2.2.4', isPackaged: true, userDataPath: dir,
        baseCachePath: dir, appUpdateConfigPath: config, whenReady: async () => {}, onQuit() {}, quit() {} };
      const native = new NsisUpdater(null, app);
      // This exercises the Windows NSIS channel even on a Linux test host.
      native._testOnlyOptions = { platform: 'win32' };
      native.httpExecutor = new LoopbackExecutor(); native.logger = null;
      native.disableDifferentialDownload = true; native.disableWebInstaller = true;
      let installed = 0;
      native.quitAndInstall = () => { installed++; }; // Never launch bytes or install.
      const updater = createRemixUpdater({ app: { getVersion: () => app.version }, enabled: true, loadUpdater: () => native });
      const before = assetRequests;
      await updater.check();
      if (kind === 'older') {
        assert.equal(updater.getState().status, 'current'); await updater.download();
        assert.equal(assetRequests, before); assert.equal(updater.install().ok, false); continue;
      }
      assert.equal(updater.getState().status, 'available', JSON.stringify(updater.getState()));
      await updater.download();
      if (kind === 'valid') {
        assert.equal(updater.getState().status, 'downloaded', JSON.stringify(updater.getState()));
        assert.deepEqual(fs.readFileSync(native.downloadedUpdateHelper.file), bytes);
        assert.equal(installed, 0); assert.equal(updater.install().ok, true); assert.equal(installed, 1);
      } else {
        assert.equal(updater.getState().status, 'error', kind + ' must not be installable');
        if (kind === 'corrupt') assert.match(updater.getState().error, /checksum mismatch/);
        assert.equal(updater.install().ok, false); assert.equal(installed, 0);
        assert.equal(native.downloadedUpdateHelper.file, null);
      }
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('mineradio-download-boundary-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
