'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
function run(executable, args, timeout = 90000) {
  const result = spawnSync(executable, args, {
    cwd: root, env, stdio: 'inherit', timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Smoke check failed: ${args[0]} (exit ${result.status})`);
}
let profile;
try {
  run(process.execPath, [path.join(root, 'tests', 'startup-flow-electron-smoke.js')]);
  run(electron, [path.join(root, 'tests', 'background-resume-electron-smoke.js')]);
  run(electron, [path.join(root, 'tests', 'media-security-electron-smoke.js')]);
  run(electron, [path.join(root, 'tests', 'visual-resource-electron-smoke.js')]);
  run(electron, [path.join(root, 'tests', 'fx-slider-electron-smoke.js')]);
  run(electron, [path.join(root, 'tests', 'lyric-edit-electron-smoke.js')], 180000);
  run(electron, [path.join(root, 'tests', 'original-profile-entry-electron-smoke.js')]);
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-lyric-layout-'));
  const lyricArgs = [path.join(root, 'tests', 'lyric-layout-electron-smoke.js'), '--qa-profile', profile];
  run(electron, lyricArgs);
  run(electron, [...lyricArgs, '--restore-only']);
  run(process.execPath, [path.join(root, 'scripts', 'quick-check.js'), '--startup'], 240000);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir())
    && path.basename(profile).startsWith('mineradio-lyric-layout-')) {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
