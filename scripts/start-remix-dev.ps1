param(
    [string]$AppDirectory = (Split-Path -Parent $PSScriptRoot),
    [string]$ProfilePath = (Join-Path $env:APPDATA 'Mineradio Remix Dev')
)

$ErrorActionPreference = 'Stop'

function Get-DevArgument([string]$CommandLine, [string]$Name) {
    $argument = [regex]::Match($CommandLine, '(?:^|\s)--' + [regex]::Escape($Name) + '=(?:"([^"]+)"|([^\s]+))')
    if ($argument.Success) {
        if ($argument.Groups[1].Success) { return $argument.Groups[1].Value }
        return $argument.Groups[2].Value
    }
    return ''
}

function Find-MineradioDevRoots($Snapshot, [string]$ExpectedProfile) {
    $byId = @{}
    foreach ($item in $Snapshot) { $byId[[int]$item.ProcessId] = $item }
    $found = @{}
    foreach ($item in $Snapshot) {
        if ($item.Name -ne 'electron.exe' -or !$item.ExecutablePath) { continue }
        if (!$item.ExecutablePath.EndsWith('\node_modules\electron\dist\electron.exe', [StringComparison]::OrdinalIgnoreCase)) { continue }
        if ((Get-DevArgument $item.CommandLine 'type') -ne 'renderer') { continue }
        if ((Get-DevArgument $item.CommandLine 'app-user-model-id') -ne 'com.mineradio.remix.dev') { continue }
        $profile = Get-DevArgument $item.CommandLine 'user-data-dir'
        if (!$profile -or [IO.Path]::GetFullPath($profile).TrimEnd('\') -ine $ExpectedProfile.TrimEnd('\')) { continue }
        $candidate = $item
        for ($depth = 0; $depth -lt 16; $depth++) {
            if (!(Get-DevArgument $candidate.CommandLine 'type')) {
                $found[[int]$candidate.ProcessId] = $candidate
                break
            }
            $parent = $byId[[int]$candidate.ParentProcessId]
            if (!$parent -or $parent.ExecutablePath -ine $item.ExecutablePath) { break }
            $candidate = $parent
        }
    }
    return @($found.Values)
}

function Get-DevProcessSnapshot {
    return @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'")
}

function Test-DevProcessStillSame($Original) {
    $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$Original.ProcessId)
    return ($current -and $current.ExecutablePath -ieq $Original.ExecutablePath -and $current.CreationDate -eq $Original.CreationDate)
}

function Start-MineradioDev {
    $appRoot = [IO.Path]::GetFullPath($AppDirectory).TrimEnd('\')
    $profile = [IO.Path]::GetFullPath($ProfilePath)
    $electron = Join-Path $appRoot 'node_modules\electron\dist\electron.exe'
    if (!(Test-Path -LiteralPath $electron -PathType Leaf)) { throw 'Electron was not found. Run npm ci in this folder first.' }
    if (!(Test-Path -LiteralPath (Join-Path $appRoot 'desktop\main.js') -PathType Leaf)) { throw 'This folder is not a Mineradio source checkout.' }
    $digest = [Security.Cryptography.SHA256]::Create()
    try { $mutexKey = [BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($profile.ToLowerInvariant()))).Replace('-', '') }
    finally { $digest.Dispose() }
    $mutex = New-Object Threading.Mutex($false, ('Local\MineradioRemixDevLauncher-' + $mutexKey))
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(20000) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (!$locked) { throw 'Another Dev restart is still running. Try again shortly.' }
        $env:MINERADIO_RUNTIME_NAME = 'Mineradio Remix Dev'
        $env:MINERADIO_APP_USER_MODEL_ID = 'com.mineradio.remix.dev'
        Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
        $oldRoots = @(Find-MineradioDevRoots (Get-DevProcessSnapshot) $profile)
        if ($oldRoots.Count) {
            Write-Host ('Requesting exit of Dev PID(s): ' + (($oldRoots | ForEach-Object { $_.ProcessId }) -join ', '))
            $request = Start-Process -FilePath $electron -ArgumentList @(('"' + $appRoot + '"'), '--quit-remix-dev') -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru
            # The player allows up to 15 seconds for checkpoint / native desktop
            # cleanup. Let that finish before using the legacy-process fallback.
            $deadline = [DateTime]::UtcNow.AddSeconds(18)
            do {
                $alive = @($oldRoots | Where-Object { Test-DevProcessStillSame $_ })
                if (!$alive.Count) { break }
                Start-Sleep -Milliseconds 200
            } while ([DateTime]::UtcNow -lt $deadline)
            foreach ($old in $alive) {
                # Older checkouts do not understand the exit request. Kill only the
                # exact Dev tree identified by BOTH its profile and application ID.
                if (!(Test-DevProcessStillSame $old)) { continue }
                Write-Host ('Older or unresponsive Dev; stopping its exact tree: ' + $old.ProcessId)
                & "$env:SystemRoot\System32\taskkill.exe" /PID ([string]$old.ProcessId) /T /F | Out-Host
                if ($LASTEXITCODE -ne 0 -and (Test-DevProcessStillSame $old)) { throw 'The previous Dev could not be stopped.' }
            }
            if (!$request.WaitForExit(8000)) { throw 'The Dev exit request did not finish; restart stopped.' }
        }
        $remaining = @(Find-MineradioDevRoots (Get-DevProcessSnapshot) $profile)
        if ($remaining.Count) { throw 'A Dev instance is still running; restart stopped.' }
        Write-Host ('Starting Mineradio Remix Dev from ' + $appRoot)
        $started = Start-Process -FilePath $electron -ArgumentList ('"' + $appRoot + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru
        Start-Sleep -Milliseconds 900
        if ($started.HasExited) { throw 'Dev exited during launch. Check the startup error log.' }
        Write-Host ('Dev started. PID: ' + $started.Id)
    }
    finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try { Start-MineradioDev } catch { Write-Error $_; exit 1 }
}
