param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$BaselineInstaller
)
$ErrorActionPreference = 'Stop'
# The real installer owns a real HKCU uninstall key. Never run on a user's host.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Full installation checks require an ephemeral GitHub-hosted Windows runner.'
}
$registryRoots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
function Find-Install {
  @(foreach ($root in $registryRoots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } | Where-Object { $_.DisplayName -match '^Mineradio Remix(?: \d+\.\d+\.\d+)?$' }
    }
  })
}
if (@(Find-Install).Count -ne 0) { throw 'Runner already contains Mineradio Remix; refusing to replace it.' }
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$baselinePath = (Resolve-Path -LiteralPath $BaselineInstaller).Path
$profile = Join-Path $env:RUNNER_TEMP 'mineradio-installed-profile'
$reportPath = Join-Path $PSScriptRoot '../dist/INSTALLER_VALIDATION.json'
$report = [ordered]@{ baseline = $false; launched = $false; upgraded = $false; restarted = $false; uninstalled = $false; sourceMatched = $false; unrelatedPreserved = $false; profilePreserved = $false }
function Run-Installer([string]$file) {
  $process = Start-Process -FilePath $file -ArgumentList '/S', '/currentuser' -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(120000)) { throw 'Installer timed out' }
  if ($process.ExitCode -ne 0) { throw "Installer exit code: $($process.ExitCode)" }
}
function Installed-Root {
  $entries = @(Find-Install)
  if ($entries.Count -ne 1) { throw 'Expected exactly one Windows uninstall entry.' }
  # NSIS stores InstallLocation in its application key, not the uninstall key.
  # Read the quoted uninstaller path as data; never execute a registry command.
  if ($entries[0].UninstallString -notmatch '^"([^"]+)"(?:\s|$)') { throw 'Unexpected uninstall command format.' }
  $resolved = (Resolve-Path -LiteralPath (Split-Path -Parent $Matches[1])).Path.TrimEnd('\')
  if ((Split-Path -Leaf $resolved) -ine 'Mineradio Remix' -or $resolved.Length -lt 12) { throw 'Unexpected installation directory.' }
  $marker = Join-Path $resolved '.mineradio-remix-install-root'
  if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw) -notmatch 'appId=com.mineradio.remix') { throw 'Installation ownership marker is missing.' }
  return $resolved
}
function Run-Installed([string]$target, [string]$mode) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
  $env:MINERADIO_STARTUP_QA_HIDDEN = '1'
  $env:MINERADIO_STARTUP_QA_USER_DATA = $profile
  $env:MINERADIO_NO_DESKTOP_SHORTCUT = '1'
  $exe = Join-Path $target 'MineradioRemix.exe'
  $process = Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$port", '--remote-debugging-address=127.0.0.1' -WindowStyle Hidden -PassThru
  try {
    & node (Join-Path $PSScriptRoot 'verify-installed-renderer.js') $port $mode
    if ($LASTEXITCODE -ne 0) { throw 'Installed renderer check failed.' }
    if (-not $process.WaitForExit(30000)) { throw 'Installed app did not exit after its close action.' }
    if ($process.ExitCode -ne 0) { throw "Installed app exit code: $($process.ExitCode)" }
  } finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  }
}
Run-Installer $baselinePath
$target = Installed-Root
$report.baseline = $true
Run-Installed $target 'write'
# Prove upgrade and uninstall do not remove user-owned files or neighboring data.
$userFile = Join-Path $target 'user-music-fixture.txt'
$neighbor = Join-Path (Split-Path -Parent $target) 'mineradio-unrelated-fixture.txt'
if (Test-Path -LiteralPath $neighbor) { throw 'Unrelated sentinel already exists.' }
Set-Content -LiteralPath $userFile -Value 'keep user music' -Encoding utf8
Set-Content -LiteralPath $neighbor -Value 'keep neighbor' -Encoding utf8
Run-Installer $installerPath
if ((Installed-Root) -ne $target) { throw 'Upgrade moved the installation unexpectedly.' }
$report.upgraded = $true
$sourceFiles = @('package.json', 'desktop/main.js', 'server.js', 'server-security.js', 'public/index.html', 'public/css/index.css') + @(Get-ChildItem (Join-Path $PSScriptRoot '../public/js') -File -Recurse | ForEach-Object { [System.IO.Path]::GetRelativePath((Resolve-Path (Join-Path $PSScriptRoot '..')).Path, $_.FullName) })
foreach ($relative in $sourceFiles) {
  $source = Join-Path (Join-Path $PSScriptRoot '..') $relative
  $installed = Join-Path (Join-Path $target 'resources/app') $relative
  if (-not (Test-Path -LiteralPath $installed) -or (Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $installed).Hash) { throw "Installed source mismatch: $relative" }
}
$report.sourceMatched = $true
Run-Installed $target 'read'
$report.launched = $true
Run-Installed $target 'read'
$report.restarted = $true
$profileFile = Join-Path $profile 'current-fx-autosave.json'
if (-not (Test-Path -LiteralPath $profileFile)) { throw 'Installed settings file is missing.' }
$profileHash = (Get-FileHash -LiteralPath $profileFile).Hash
$uninstallers = @(Get-ChildItem -LiteralPath $target -Filter 'Uninstall *.exe' -File)
if ($uninstallers.Count -ne 1) { throw 'Uninstaller is missing or ambiguous.' }
$uninstaller = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -WindowStyle Hidden -PassThru
if (-not $uninstaller.WaitForExit(120000)) { throw 'Uninstaller timed out.' }
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while (((Test-Path -LiteralPath (Join-Path $target '.mineradio-remix-install-root')) -or @(Find-Install).Count -ne 0) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
foreach ($name in @('resources', 'locales', 'swiftshader', 'MineradioRemix.exe', '.mineradio-remix-install-root')) {
  if (Test-Path -LiteralPath (Join-Path $target $name)) { throw "Owned file left by uninstaller: $name" }
}
if (@(Find-Install).Count -ne 0) { throw 'Uninstall registry entry was left behind.' }
foreach ($directory in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  if (Test-Path -LiteralPath (Join-Path $directory 'Mineradio Remix.lnk')) { throw 'Application shortcut was left behind.' }
}
if ((Get-Content -LiteralPath $userFile -Raw).Trim() -ne 'keep user music' -or (Get-Content -LiteralPath $neighbor -Raw).Trim() -ne 'keep neighbor') { throw 'Uninstaller changed unrelated data.' }
if ((Get-FileHash -LiteralPath $profileFile).Hash -ne $profileHash) { throw 'Uninstaller changed retained user settings.' }
$report.uninstalled = $true; $report.unrelatedPreserved = $true; $report.profilePreserved = $true
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding utf8
Write-Output ('INSTALLER_VALIDATION:' + ($report | ConvertTo-Json -Compress))
