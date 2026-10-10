'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWindowsVirtualAudioInstaller, buildVerificationScript, CERT_SHA256, SETUP_SHA256 } = require('../desktop/virtual-audio-installer');
const { PACKAGE_MANIFEST } = require('../desktop/virtual-audio-package');
const directory = 'C:\\Users\\fake\\Temp\\pack45-test\\payload';
const pkg = { directory, setupPath: directory + '\\VBCABLE_Setup_x64.exe' };

function launchFixture() {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const calls = [];
  const installer = createWindowsVirtualAudioInstaller({ platform: 'win32', arch: 'x64',
    spawn: (...args) => { calls.push(args); return child; } });
  const message = object => child.stdout.emit('data', Buffer.from(JSON.stringify(object) + '\r\n'));
  return { installer, child, calls, message };
}

test('real 31-file manifest uses bounded encoded commands and checks exact directory, hashes and timestamp-aware Windows signature', () => {
  assert.equal(PACKAGE_MANIFEST.length, 31);
  const root = 'C:\\Users\\' + 'u'.repeat(180) + '\\AppData\\Local\\Temp\\mineradio-remix-vbcable\\pack45-abcd\\payload';
  const code = buildVerificationScript({ directory: root, setupPath: root + '\\VBCABLE_Setup_x64.exe' }, PACKAGE_MANIFEST);
  for (const entry of PACKAGE_MANIFEST) { assert.ok(code.includes(entry.sha256)); assert.ok(code.includes(entry.name)); }
  assert.match(code, /foreach \(\$expected in \$files\)/);
  assert.match(code, /\$entries\.Count -ne \$files\.Count/);
  assert.match(code, /\$files\.name -notcontains \$entry\.Name/);
  assert.match(code, /ReparsePoint/); assert.match(code, /Get-AuthenticodeSignature -LiteralPath \$setup/);
  assert.match(code, /Status\.ToString\(\) -ne 'Valid'/); assert.match(code, /SignerCertificate\.RawData/);
  assert.ok(code.includes(CERT_SHA256)); assert.ok(code.includes(SETUP_SHA256));
  assert.doesNotMatch(code, /NotAfter|Thumbprint|ExecutionPolicy|Unblock-File|Set-ExecutionPolicy/);
  assert.ok(Buffer.from(code, 'utf16le').toString('base64').length + 200 < 24000);
});

test('verification uses fixed system PowerShell, bounded output/time, and fails closed on any unverifiable response', async () => {
  const calls = [];
  const installer = createWindowsVirtualAudioInstaller({ platform: 'win32', arch: 'x64',
    execFile: (file, args, options, callback) => { calls.push({ file, args, options }); callback(null, '{"verified":true}'); } });
  await installer.verify(pkg);
  assert.match(calls[0].file, /System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/);
  assert.equal(calls[0].options.timeout, 30000); assert.equal(calls[0].options.maxBuffer, 65536);
  assert.ok(calls[0].args.includes('-EncodedCommand')); assert.ok(!calls[0].args.includes('-ExecutionPolicy'));
  for (const [error, stdout] of [[new Error('bad signature'), ''], [null, '{}'], [null, 'noise'], [null, '{"verified":false}']]) {
    const bad = createWindowsVirtualAudioInstaller({ platform: 'win32', arch: 'x64', execFile: (_file, _args, _options, cb) => cb(error, stdout) });
    await assert.rejects(bad.verify(pkg), /VIRTUAL_AUDIO_SIGNATURE_VERIFICATION_FAILED/);
  }
});

test('visible installer launch has no installer flags, returns on started and only cleans after observed exit', async () => {
  const f = launchFixture(); const opening = f.installer.launch(pkg);
  const code = Buffer.from(f.calls[0][1].at(-1), 'base64').toString('utf16le');
  assert.match(code, /Start-Process -FilePath \$setup -WorkingDirectory \$root -Verb RunAs -PassThru/);
  assert.match(code, /\$process\.WaitForExit\(\)/);
  assert.doesNotMatch(code, /ArgumentList|WindowStyle Hidden|Restart-Computer|Reboot|\/S| -h | -i /);
  assert.match(code, /Get-AuthenticodeSignature/); assert.ok(code.includes(CERT_SHA256));
  f.message({ type: 'started', pid: 100 }); const result = await opening;
  let completed = false; result.completion.then(() => { completed = true; });
  await Promise.resolve(); assert.equal(completed, false);
  f.message({ type: 'exited', exitCode: 0 }); f.child.emit('close', 0);
  assert.deepEqual(await result.completion, { knownExit: true, exitCode: 0 });
});

test('UAC rejection or spawn failure is safe to clean, while ambiguous helper loss preserves dependencies', async () => {
  for (const action of [f => { f.message({ type: 'rejected' }); f.child.emit('close', 1); },
    f => { f.child.emit('error', new Error('ENOENT')); f.child.emit('close', -1); }]) {
    const f = launchFixture(); const opening = f.installer.launch(pkg); action(f);
    await assert.rejects(opening, error => error.safeToClean === true);
  }
  const unknown = launchFixture(); const opening = unknown.installer.launch(pkg);
  unknown.message({ type: 'unknown' }); unknown.child.emit('close', 1);
  await assert.rejects(opening, error => error.message === 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN' && error.safeToClean === false);
  const lost = launchFixture(); const started = lost.installer.launch(pkg);
  lost.message({ type: 'started', pid: 9 }); const result = await started; lost.child.emit('close', 1);
  assert.equal((await result.completion).knownExit, false);
});

test('unsupported platform, altered setup path, invalid manifest and excessive native command length cannot spawn', async () => {
  assert.throws(() => buildVerificationScript({ ...pkg, setupPath: 'C:\\other.exe' }, PACKAGE_MANIFEST), /INVALID_INSTALLER_PACKAGE_PATH/);
  assert.throws(() => buildVerificationScript(pkg, [{ name: '../evil', size: 1, sha256: 'a'.repeat(64) }]), /INVALID_INSTALLER_MANIFEST/);
  for (const options of [{ platform: 'linux', arch: 'x64' }, { platform: 'win32', arch: 'arm64' }]) {
    const installer = createWindowsVirtualAudioInstaller({ ...options, spawn: () => { throw new Error('must not run'); } });
    assert.throws(() => installer.launch(pkg), /VIRTUAL_AUDIO_SETUP_UNSUPPORTED/);
    await assert.rejects(installer.verify(pkg), /VIRTUAL_AUDIO_SETUP_UNSUPPORTED/);
  }
  const root = 'C:\\' + 'x'.repeat(10000);
  const oversized = { directory: root, setupPath: root + '\\VBCABLE_Setup_x64.exe' };
  const installer = createWindowsVirtualAudioInstaller({ platform: 'win32', arch: 'x64',
    execFile: () => { throw new Error('must not run'); }, spawn: () => { throw new Error('must not run'); } });
  await assert.rejects(installer.verify(oversized), /VIRTUAL_AUDIO_INSTALLER_PATH_TOO_LONG/);
  await assert.rejects(installer.launch(oversized), error => error.safeToClean === true);
});
