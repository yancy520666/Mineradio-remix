param([string]$RepoDirectory = (Split-Path $PSScriptRoot -Parent))

$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
$lock = $null
$logging = $false
$exitCode = 1

function Invoke-Git {
    param([string[]]$GitArguments, [int]$TimeoutSeconds = 30, [switch]$AllowFailure)
    # Read both streams asynchronously so a full pipe cannot block Git.
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $script:gitExe
    $info.WorkingDirectory = $script:repo
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = New-Object System.Text.UTF8Encoding
    $info.StandardErrorEncoding = New-Object System.Text.UTF8Encoding
    # Arguments below are fixed options, validated refs, or Git-produced hashes.
    # Per-command only: do not execute local hooks or change repository config.
    $arguments = @('-c', 'core.hooksPath=/dev/null') + $GitArguments
    $info.Arguments = ($arguments | ForEach-Object {
        if ($_ -match '[\s"]') { throw '内部错误：Git 参数含不支持的字符。' }
        $_
    }) -join ' '
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            # Stop SSH / credential helpers as well as their parent Git process.
            & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F 2>&1 | Out-Null
            throw "Git 操作超过 $TimeoutSeconds 秒，已请求停止。若正在更新文件，可能留下部分状态；请先检查 git status 和日志，再决定是否重试。"
        }
        $output = $stdout.GetAwaiter().GetResult().Trim()
        $errorOutput = $stderr.GetAwaiter().GetResult().Trim()
        $result = [pscustomobject]@{ Code = $process.ExitCode; Output = $output; Error = $errorOutput }
        if ($result.Code -ne 0 -and -not $AllowFailure) {
            throw "Git 操作失败：$errorOutput $output"
        }
        return $result
    } finally { $process.Dispose() }
}

function Assert-Ready {
    $branch = (Invoke-Git -GitArguments @('symbolic-ref', '--quiet', '--short', 'HEAD') -AllowFailure).Output
    if ($branch -ne 'main') {
        throw '当前不在 main 分支（也可能处于游离 HEAD）。请先处理当前工作，再切回 main；脚本不会自动切分支。'
    }
    foreach ($marker in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_START', 'index.lock')) {
        $markerPath = (Invoke-Git -GitArguments @('rev-parse', '--git-path', $marker)).Output
        if (-not [IO.Path]::IsPathRooted($markerPath)) { $markerPath = Join-Path $script:repo $markerPath }
        if (Test-Path -LiteralPath $markerPath) {
            throw "发现未完成的 Git 操作或锁：$marker。请先完成或取消原操作；脚本不会删除锁或处理冲突。"
        }
    }
    $changes = (Invoke-Git -GitArguments @('status', '--porcelain', '--untracked-files=no')).Output
    if ($changes) {
        Write-Host $changes
        throw '存在未提交的本地改动。请先提交，或自行暂存改动后再运行；脚本不会覆盖、丢弃或自动藏起它们。'
    }
}

function Assert-SourceStopped {
    # A running source Electron can still hold files or load mixed old/new code.
    $running = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction Stop |
        Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($script:repo + '\', [StringComparison]::OrdinalIgnoreCase) }
    if ($running) { throw '此目录的 Mineradio 源码版仍在运行。请关闭它后再更新。' }
}

try {
    $repo = (Resolve-Path -LiteralPath $RepoDirectory).Path.TrimEnd('\')
    $gitExe = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
    if (-not $gitExe) { throw '未找到 Git。安装 Git for Windows 后重新打开脚本。下载：https://git-scm.com/download/win' }
    $top = (Invoke-Git -GitArguments @('rev-parse', '--show-toplevel')).Output
    if ([IO.Path]::GetFullPath($top).TrimEnd('\') -ne $repo) {
        throw '请把 BAT 和 scripts 文件夹保留在项目根目录，不要放在其他仓库或项目子目录中。'
    }

    $logDirectory = Join-Path $env:LOCALAPPDATA 'Mineradio-Remix\source-update-logs'
    [void](New-Item -ItemType Directory -Path $logDirectory -Force)
    $logPath = Join-Path $logDirectory ("update-{0}-{1}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $PID)
    Start-Transcript -Path $logPath | Out-Null
    $logging = $true
    Write-Host "项目：$repo"

    $gitDirectory = (Invoke-Git -GitArguments @('rev-parse', '--absolute-git-dir')).Output
    try {
        $lock = [IO.File]::Open((Join-Path $gitDirectory 'mineradio-update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch { throw '另一个更新脚本正在运行，或无法写入 Git 目录。请等待它结束并检查目录权限。' }

    Assert-Ready
    # Check the effective URL, including insteadOf rewrites, and reject multiple URLs.
    $originUrls = @((Invoke-Git -GitArguments @('remote', 'get-url', '--all', 'origin')).Output -split '\r?\n' | Where-Object { $_ })
    if ($originUrls.Count -ne 1) { throw 'origin 必须只有一个获取地址。请先检查远端设置；脚本不会替你修改。' }
    $origin = $originUrls[0]
    if ($origin -notmatch '^(https://github\.com/yancy520666/Mineradio-remix(?:\.git)?/?|git@github\.com:yancy520666/Mineradio-remix(?:\.git)?|ssh://git@github\.com/yancy520666/Mineradio-remix(?:\.git)?)$') {
        throw 'origin 不是 yancy520666/Mineradio-remix。为避免更新错仓库，已停止；请检查 origin 设置。'
    }
    Assert-SourceStopped

    Write-Host '此次源码更新临时禁用 Git hooks，避免自动执行本地钩子；原有 Git 配置保持不变。'
    Write-Host '请在更新期间保持源码版关闭，并避免同时运行其他 Git 操作。'
    Write-Host '正在获取 GitHub main 的最新提交……'
    $fetched = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            # Fetch only the intended branch; ignore local tracking-branch settings.
            $fetch = Invoke-Git -GitArguments @('fetch', '--no-tags', '--no-prune', '--no-recurse-submodules', 'origin', '+refs/heads/main:refs/remotes/origin/main') -TimeoutSeconds 90 -AllowFailure
            if ($fetch.Code -ne 0) { throw $fetch.Error }
            $fetched = $true
            break
        } catch {
            Write-Host "第 $attempt 次获取失败：$($_.Exception.Message)"
            if ($attempt -lt 3) { Start-Sleep -Seconds 3 }
        }
    }
    if (-not $fetched) { throw '获取失败，本地源码未更新。请检查 GitHub 连接、代理或仓库访问权限，然后重新运行。' }

    Assert-Ready
    Assert-SourceStopped
    $before = (Invoke-Git -GitArguments @('rev-parse', 'HEAD')).Output
    $target = (Invoke-Git -GitArguments @('rev-parse', 'refs/remotes/origin/main')).Output
    if ($before -eq $target) {
        Write-Host "已经是 GitHub main 最新版本：$($before.Substring(0, 12))" -ForegroundColor Green
    } else {
        $ancestor = Invoke-Git -GitArguments @('merge-base', '--is-ancestor', $before, $target) -AllowFailure
        if ($ancestor.Code -ne 0) {
            $ahead = Invoke-Git -GitArguments @('merge-base', '--is-ancestor', $target, $before) -AllowFailure
            if ($ancestor.Code -eq 1 -and $ahead.Code -eq 0) {
                throw '本地有尚未推送的提交，且已包含远端更新。脚本保留本地提交，不会强制退回 GitHub 版本。'
            }
            throw '本地与 GitHub 的提交已分叉，或历史无法比较。请手动检查并合并；脚本不会 reset 或自动 rebase。'
        }
        $backupRef = "refs/mineradio-update-backups/$(Get-Date -Format 'yyyyMMdd-HHmmss')-$PID"
        Invoke-Git -GitArguments @('update-ref', $backupRef, $before) | Out-Null
        Write-Host "更新前版本：$before"
        Write-Host "恢复记录：$backupRef（可用 git show 查看）"
        # Also protect ignored files if incoming commits begin tracking their paths.
        Invoke-Git -GitArguments @('merge', '--ff-only', '--no-autostash', '--no-overwrite-ignore', $target) | Out-Null
        $after = (Invoke-Git -GitArguments @('rev-parse', 'HEAD')).Output
        if ($after -ne $target) { throw '更新后提交与目标不一致，请查看日志并检查是否有其他 Git 操作同时运行。' }
        Write-Host "源码更新完成：$($before.Substring(0, 12)) -> $($after.Substring(0, 12))" -ForegroundColor Green
        $dependencies = (Invoke-Git -GitArguments @('diff', '--name-only', $before, $after, '--', 'package.json', 'package-lock.json')).Output
        if ($dependencies) {
            Write-Host '依赖文件有变化：运行源码版之前，请在项目目录执行 npm ci。安装失败时不要启动应用，修复网络后重新安装。' -ForegroundColor Yellow
        }
    }
    Write-Host '此脚本更新本地源码；已安装的 EXE 版本需要在应用内或 Release 页面升级。'
    $exitCode = 0
} catch {
    Write-Host "[停止] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '脚本不会强制覆盖或自动回滚。若更新中断、文件占用或权限出错，请先检查 git status 和日志，再决定如何恢复。'
} finally {
    if ($lock) { $lock.Dispose() }
    if ($logging) {
        Write-Host "日志：$logPath"
        Stop-Transcript | Out-Null
    }
}
exit $exitCode
