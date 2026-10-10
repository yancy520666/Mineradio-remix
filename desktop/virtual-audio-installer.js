'use strict';

const path = require('node:path');
const childProcess = require('node:child_process');

// Static inspection of the unmodified official Pack45 (2026-10-10). Windows
// must additionally validate Authenticode, including its trusted timestamp.
const CERT_SHA256 = '6c37d5dda6b7e880b38339e233689c302e7d26ccfdac019b3c3f4bd16330a794';
const SETUP_SHA256 = '734c35dfa6d98f48782a451633ceb471166ec70d60482fd89a1123d0ee3c4f41';
const SETUP_NAME = 'VBCABLE_Setup_x64.exe';
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";

function buildVerificationScript({ directory, setupPath }, manifest) {
  if (typeof directory !== 'string' || !path.win32.isAbsolute(directory) || /[\0\r\n]/.test(directory)
    || typeof setupPath !== 'string' || path.win32.resolve(setupPath).toLowerCase()
      !== path.win32.resolve(directory, SETUP_NAME).toLowerCase()) throw new Error('INVALID_INSTALLER_PACKAGE_PATH');
  const lines = ["$ErrorActionPreference = 'Stop'", '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    '$root = ' + quote(directory), '$setup = ' + quote(setupPath),
    "$rootItem = Get-Item -LiteralPath $root -Force",
    "if (!$rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'UNSAFE_PACKAGE_DIRECTORY' }"];
  for (const file of manifest) {
    if (!/^[A-Za-z0-9_.-]+$/.test(file.name) || !/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size)) {
      throw new Error('INVALID_INSTALLER_MANIFEST');
    }
  }
  lines.push('$files = ConvertFrom-Json ' + quote(JSON.stringify(manifest.map(({ name, size, sha256 }) => ({ name, size, sha256 })))),
    '$entries = @(Get-ChildItem -LiteralPath $root -Force)',
    "if ($entries.Count -ne $files.Count) { throw 'UNEXPECTED_PACKAGE_FILES' }",
    "foreach ($entry in $entries) { if ($files.name -notcontains $entry.Name -or $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'UNEXPECTED_PACKAGE_FILES' } }",
    'foreach ($expected in $files) {', '$file = Join-Path $root $expected.name', '$item = Get-Item -LiteralPath $file -Force',
    "if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -ne $expected.size) { throw 'PACKAGE_FILE_CHANGED' }",
    "if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected.sha256) { throw 'PACKAGE_FILE_CHANGED' }", '}');
  lines.push('$signature = Get-AuthenticodeSignature -LiteralPath $setup',
    "if ($signature.Status.ToString() -ne 'Valid' -or !$signature.SignerCertificate) { throw 'INVALID_AUTHENTICODE_SIGNATURE' }",
    '$sha = [Security.Cryptography.SHA256]::Create()',
    '$certificateHash = ([BitConverter]::ToString($sha.ComputeHash($signature.SignerCertificate.RawData))).Replace("-", "").ToLowerInvariant()',
    '$sha.Dispose()', `if ($certificateHash -ne ${quote(CERT_SHA256)}) { throw 'UNEXPECTED_INSTALLER_PUBLISHER' }`,
    `if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant() -ne ${quote(SETUP_SHA256)}) { throw 'INSTALLER_FILE_CHANGED' }`);
  return lines.join('\n');
}

function createWindowsVirtualAudioInstaller({ execFile = childProcess.execFile, spawn = childProcess.spawn,
  platform = process.platform, arch = process.arch, systemRoot = process.env.SystemRoot || 'C:\\Windows',
  getManifest = () => require('./virtual-audio-package').PACKAGE_MANIFEST } = {}) {
  const powershell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const args = code => {
    const result = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')];
    if (powershell.length + result.join(' ').length + 16 > 24000) throw new Error('VIRTUAL_AUDIO_INSTALLER_PATH_TOO_LONG');
    return result;
  };
  const assertSupported = () => { if (platform !== 'win32' || arch !== 'x64') throw new Error('VIRTUAL_AUDIO_SETUP_UNSUPPORTED'); };
  const verify = (pkg, { signal } = {}) => new Promise((resolve, reject) => {
    try {
      assertSupported();
      const code = buildVerificationScript(pkg, getManifest()) + '\nWrite-Output \'{"verified":true}\'';
      execFile(powershell, args(code), { windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024, signal }, (error, stdout) => {
        if (error) return reject(new Error(signal && signal.aborted ? 'VIRTUAL_AUDIO_SETUP_CANCELLED' : 'VIRTUAL_AUDIO_SIGNATURE_VERIFICATION_FAILED'));
        try {
          if (JSON.parse(String(stdout).trim()).verified !== true) throw new Error();
          resolve();
        } catch (_) { reject(new Error('VIRTUAL_AUDIO_SIGNATURE_VERIFICATION_FAILED')); }
      });
    } catch (error) { reject(error); }
  });
  // Cancellation stops before this handoff. Killing the helper while ShellExecute
  // is asking for elevation cannot reliably retract UAC or the official installer.
  const launch = (pkg) => {
    assertSupported();
    const code = buildVerificationScript(pkg, getManifest()) + '\n' + [
      'try {',
      '  $process = Start-Process -FilePath $setup -WorkingDirectory $root -Verb RunAs -PassThru -ErrorAction Stop',
      '  Write-Output ((@{type="started"; pid=$process.Id}) | ConvertTo-Json -Compress)',
      '  $process.WaitForExit()',
      '  Write-Output ((@{type="exited"; exitCode=$process.ExitCode}) | ConvertTo-Json -Compress)',
      '} catch {',
      '  if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223) {',
      '    Write-Output \'{"type":"rejected"}\'; exit 1',
      '  }',
      '  Write-Output \'{"type":"unknown"}\'; exit 1',
      '}',
    ].join('\n');
    let child;
    try { child = spawn(powershell, args(code), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (_) { return Promise.reject(Object.assign(new Error('VIRTUAL_AUDIO_INSTALLER_START_FAILED'), { safeToClean: true })); }
    return new Promise((resolve, reject) => {
      let started = false, terminal = null, buffer = '', outputBytes = 0;
      let finish;
      const completion = new Promise(r => { finish = r; });
      const unknown = () => ({ knownExit: false, error: 'VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN' });
      const fail = (error, safeToClean = false) => reject(Object.assign(new Error(error), { safeToClean }));
      child.stdout.on('data', chunk => {
        outputBytes += chunk.length;
        if (outputBytes > 64 * 1024) return; // No unbounded buffer or generated paths reach IPC.
        buffer += chunk.toString('utf8');
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
          try {
            const message = JSON.parse(line);
            if (message.type === 'started' && !started && Number.isInteger(message.pid) && message.pid > 0) {
              started = true; resolve({ completion });
            } else if (message.type === 'exited' && started && Number.isInteger(message.exitCode)) {
              terminal = { knownExit: true, exitCode: message.exitCode };
            } else if (message.type === 'rejected' && !started) {
              terminal = { rejected: true }; fail('VIRTUAL_AUDIO_ELEVATION_CANCELLED', true);
            }
          } catch (_) {} // Ignore PowerShell formatting/noise, never trust it as success.
        }
      });
      child.stderr.on('data', () => {});
      child.once('error', () => {
        if (!started) fail('VIRTUAL_AUDIO_INSTALLER_START_FAILED', true);
        finish(started ? unknown() : { knownExit: true, neverStarted: true });
      });
      child.once('close', () => {
        if (!started && !(terminal && terminal.rejected)) fail('VIRTUAL_AUDIO_INSTALLER_STATE_UNKNOWN');
        finish(started ? terminal && terminal.knownExit ? terminal : unknown() : { knownExit: !!(terminal && terminal.rejected), neverStarted: true });
      });
    });
  };
  return { verify, launch };
}

module.exports = { createWindowsVirtualAudioInstaller, buildVerificationScript, CERT_SHA256, SETUP_SHA256 };
