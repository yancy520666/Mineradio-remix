$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\start-remix-dev.ps1')

function Assert-Ids($Actual, $Expected, $Reason) {
    $ids = @($Actual | Where-Object { $null -ne $_ } | ForEach-Object { [int]$_.ProcessId } | Sort-Object) -join ','
    if ($ids -ne ($Expected -join ',')) { throw "$Reason`: expected $Expected, got $ids" }
}
function Process-Row($Id, $Parent, $Executable, $CommandText) {
    return [pscustomobject]@{ ProcessId=$Id; ParentProcessId=$Parent; Name='electron.exe'; ExecutablePath=$Executable; CommandLine=$CommandText }
}
$exe = 'D:\Code\Test Dev\node_modules\electron\dist\electron.exe'
$profile = 'C:\Users\QA\AppData\Roaming\Mineradio Remix Dev'
$rendererArgs = '--type=renderer --app-user-model-id=com.mineradio.remix.dev --user-data-dir="' + $profile + '"'
$rows = @(
    (Process-Row 10 1 $exe 'electron.exe "D:\Code\Test Dev"'),
    (Process-Row 11 10 $exe $rendererArgs),
    (Process-Row 20 1 $exe 'electron.exe installed'),
    (Process-Row 21 20 $exe ('--type=renderer --app-user-model-id=com.mineradio.remix --user-data-dir="' + $profile + '"')),
    (Process-Row 30 1 $exe 'electron.exe isolated'),
    (Process-Row 31 30 $exe ($rendererArgs.Replace($profile, $profile + ' QA'))),
    (Process-Row 40 1 'C:\Other\electron.exe' 'electron.exe unrelated'),
    (Process-Row 41 40 'C:\Other\electron.exe' $rendererArgs),
    (Process-Row 51 999 $exe $rendererArgs)
)
Assert-Ids (Find-MineradioDevRoots $rows $profile) @(10) 'Only the exact development runtime may be stopped'
Assert-Ids (Find-MineradioDevRoots @($rows[0],$rows[1],$rows[1]) $profile) @(10) 'Multiple renderers must not repeat a stop'
Assert-Ids (Find-MineradioDevRoots @() $profile) @() 'No running Dev is a normal first launch'
Assert-Ids (Find-MineradioDevRoots @($rows[1]) $profile) @() 'Orphan children must not nominate an unrelated process'
if ((Get-DevArgument '--user-data-dir=C:\QA\Dev --type=renderer' 'user-data-dir') -ne 'C:\QA\Dev') { throw 'Unquoted path parsing failed' }
Write-Output 'OK Dev launcher isolates production, other Electron apps, QA profiles and orphan children.'
