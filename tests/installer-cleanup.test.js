'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function main() {
  if (process.platform !== 'win32') { console.log('SKIP native NSIS cleanup: Windows required'); return; }
  const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'nsis-3.0.4.1');
  const compiler = fs.existsSync(cache) && fs.readdirSync(cache).map(name => path.join(cache, name, 'Bin', 'makensis.exe')).find(file => fs.existsSync(file));
  if (!compiler) { console.log('SKIP native NSIS cleanup: bundled compiler unavailable'); return; }
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-uninstall-'));
  assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
  assert(path.basename(fixture).startsWith('mineradio-uninstall-'));
  try {
    const target = path.join(fixture, 'Mineradio Remix');
    fs.mkdirSync(target);
    // Same two-line format customInstall writes; the appId is not the first line.
    fs.writeFileSync(path.join(target, '.mineradio-remix-install-root'), 'Mineradio install root\r\nappId=com.mineradio.remix\r\n');
    fs.writeFileSync(path.join(target, 'MineradioRemix.exe'), 'fixture executable');
    fs.writeFileSync(path.join(target, 'user-music.txt'), 'preserve user file');
    fs.writeFileSync(path.join(fixture, 'neighbor.txt'), 'preserve sibling');
    const original = path.join(fixture, 'Mineradio');
    const similar = path.join(fixture, 'Mineradio Remix-extra');
    const music = path.join(fixture, 'external-music');
    for (const directory of [original, similar, music]) {
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, 'preserve.txt'), 'preserve outside installation');
    }
    for (const dir of ['resources', 'locales', 'swiftshader']) {
      fs.mkdirSync(path.join(target, dir, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(target, dir, 'nested', 'payload'), 'owned payload');
    }
    const junction = path.join(target, 'resources', 'external-junction');
    fs.symlinkSync(music, junction, 'junction');
    assert(fs.lstatSync(junction).isSymbolicLink());
    const source = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
    const functions = source.match(/^Function un\.[\s\S]*?^FunctionEnd/gm);
    assert(functions && functions.length >= 5);
    const script = path.join(fixture, 'cleanup.nsi');
    fs.writeFileSync(script, `\uFEFFUnicode true
!include LogicLib.nsh
!define MINERADIO_INSTALL_DIR_NAME "Mineradio Remix"
!define MINERADIO_INSTALL_DIR_NAME_LOWER "mineradio remix"
!define MINERADIO_INSTALL_MARKER ".mineradio-remix-install-root"
!define MINERADIO_MARKER_APP_ID "com.mineradio.remix"
!define PRODUCT_FILENAME "MineradioRemix"
Name "Mineradio cleanup fixture"
OutFile "${path.join(fixture, 'setup.exe')}"
InstallDir "${target}"
RequestExecutionLevel user
SilentInstall silent
SilentUnInstall silent
Section
  SetOutPath $INSTDIR
  WriteUninstaller "$INSTDIR\\Uninstall MineradioRemix.exe"
SectionEnd
${functions.join('\n')}
Section "Uninstall"
  FileOpen $0 "$INSTDIR\\.mineradio-remix-install-root" w
  FileWrite $0 "Mineradio install root$\\r$\\n"
  FileWrite $0 "appId=com.mineradio.remix-other$\\r$\\n"
  FileClose $0
  Push "$INSTDIR"
  Call un.MineradioInstallDirLooksOwned
  Pop $0
  FileOpen $1 "${path.join(fixture, 'ownership-result.txt')}" w
  FileWrite $1 "$0"
  FileClose $1
  \${If} $0 != "0"
    SetErrorLevel 3
    Quit
  \${EndIf}
  FileOpen $0 "$INSTDIR\\.mineradio-remix-install-root" w
  FileWrite $0 "Mineradio install root$\\r$\\n"
  FileWrite $0 "appId=com.mineradio.remix$\\r$\\n"
  FileClose $0
  Call un.MineradioRemoveInstalledFiles
SectionEnd
`);
    function run(file, args) {
      const result = spawnSync(file, args, { windowsHide: true, timeout: 30000, encoding: 'utf8' });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    run(compiler, ['/V2', script]);
    run(path.join(fixture, 'setup.exe'), ['/S']);
    run(path.join(target, 'Uninstall MineradioRemix.exe'), ['/S']);
    const end = Date.now() + 10000;
    const ownershipResult = path.join(fixture, 'ownership-result.txt');
    while (!fs.existsSync(ownershipResult) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(fs.readFileSync(ownershipResult, 'utf8'), '0', 'a different app ID cannot claim this installation');
    while (fs.existsSync(path.join(target, '.mineradio-remix-install-root')) && Date.now() < end) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    for (const entry of ['resources', 'locales', 'swiftshader', 'MineradioRemix.exe', '.mineradio-remix-install-root']) {
      assert.equal(fs.existsSync(path.join(target, entry)), false, `uninstaller left owned item: ${entry}`);
    }
    assert.equal(fs.readFileSync(path.join(target, 'user-music.txt'), 'utf8'), 'preserve user file');
    assert.equal(fs.readFileSync(path.join(fixture, 'neighbor.txt'), 'utf8'), 'preserve sibling');
    for (const directory of [original, similar, music]) {
      assert.equal(fs.readFileSync(path.join(directory, 'preserve.txt'), 'utf8'), 'preserve outside installation');
    }
    console.log('OK native NSIS removes nested application resources and marker; preserves unrelated files');
  } finally {
    const resolved = path.resolve(fixture);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('mineradio-uninstall-')) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
