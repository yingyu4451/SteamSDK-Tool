#Requires -Version 5.1
<#
    build.ps1 - upload one Steam app build with the single shared SDK.

    One Steamworks SDK, one steamcmd, one script folder per AppID.
    No per-version copies of anything.

    由 SteamSDK 上传工作台随包提供；工具发现 SDK 里缺它时会自动写进
    tools\ContentBuilder\，已经存在的不覆盖（改坏了可在设置里点「安装/修复脚本」）。

    Usage:
        .\build.ps1 -App MyGame -User your_login -Preview   # dry run, uploads nothing
        .\build.ps1 -App MyGame -User your_login            # real upload

    The app script is picked up automatically from
        scripts\<App>\app_*.vdf
    or you can name it explicitly with -AppScript.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$App,

    [string]$AppScript,

    [string]$User,

    [switch]$Preview,

    # 把内容传进本地内容服务器（tools\ContentServer），不上传 Steam。
    [switch]$Local,

    [string]$LocalRoot,

    [switch]$NoLoginCheck
)

# 输出被重定向（工具是管道）时统一按 UTF-8 写：Windows PowerShell 5.1 和 pwsh 在没有
# 控制台的管道里默认按系统 ANSI（中文系统 936）输出，工具按 UTF-8 解码就会看到乱码。
try {
    if ([Console]::IsOutputRedirected) { [Console]::OutputEncoding = [Text.Encoding]::UTF8 }
} catch { }

$ErrorActionPreference = 'Stop'
$CB       = $PSScriptRoot
$steamcmd = Join-Path $CB 'builder\steamcmd.exe'
$outDir   = Join-Path $CB 'output'
$appDir   = Join-Path $CB "scripts\$App"

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# ---- steamcmd 输出与失败诊断 ------------------------------------------------
# 退出码说不清原因：本机实测 0=成功、5=登录失败、6=构建失败，而构建失败的原因
# （AppID/DepotID 不匹配、Access Denied、ContentRoot 不存在……）只在输出文本里。
# 所以把 steamcmd 输出完整留一份，失败时按关键词翻成一句人话。
$script:consoleLines = New-Object System.Collections.Generic.List[string]

function Write-SteamcmdLine($line) {
    $s = [string]$line
    [void]$script:consoleLines.Add($s)
    Write-Host $s
}

function Get-FailureReasons([string]$text) {
    $rules = @(
        @{ Re = 'App build file does not exist';                              Reason = 'app 构建脚本不存在（路径写错，或文件被改名/移动）' },
        @{ Re = 'Depot config file does not exist';                           Reason = 'depot 构建脚本不存在（Depots 里写的文件名要相对 app 脚本目录）' },
        @{ Re = 'Content root folder does not exist';                         Reason = '内容目录不存在（先构建游戏内容，或检查 Depot/App 的 ContentRoot）' },
        @{ Re = 'has invalid format|KeyValues Error';                         Reason = 'app/depot 的 vdf 格式坏了（语法被改坏，或编码不对）' },
        @{ Re = 'Failed to initialize build on server \(Access Denied\)';     Reason = '没有该 App 的构建权限，或 AppID 与 DepotID 不属于同一个 App' },
        @{ Re = 'Failed to initialize build on server \(Invalid Parameter\)'; Reason = 'AppID / DepotID 无效或不匹配（核对 Steamworks 后台的 ID）' },
        @{ Re = 'Not logged on';                                              Reason = '没登录成功（账号 / 密码 / 令牌）' },
        @{ Re = 'Invalid Password|two-factor|Steam Guard|Password check';     Reason = '登录失败：密码或 Steam Guard 令牌不对' },
        @{ Re = 'Rate Limit|rate limit';                                      Reason = '被 Steam 限流（登录/上传太频繁），等几分钟再试' },
        @{ Re = 'No subscription';                                            Reason = '登录账号没有这个 App 的授权' },
        @{ Re = 'No space|disk space|disk quota';                             Reason = '磁盘空间不足' },
        @{ Re = 'No connection|handshake|timed out|Failed to upload|Upload failed|0x402|0x606'; Reason = '网络/连接 Steam 失败（或上传中断）：重试，并检查代理和防火墙' }
    )
    $reasons = @()
    foreach ($r in $rules) {
        if ($text -and ($text -match $r.Re)) { $reasons += $r.Reason }
    }
    return $reasons
}

function Write-FailureDiagnosis([string]$text, $exitCode, [string]$consoleLogPath) {
    $reasons = @(Get-FailureReasons -text $text)
    Write-Host "--- 失败诊断 ---" -ForegroundColor Red
    if ($reasons.Count -gt 0) {
        foreach ($r in $reasons) { Write-Host "  原因: $r" -ForegroundColor Red }
    } else {
        Write-Host "  原因: 没能自动识别（看原始输出或下面的完整日志）" -ForegroundColor Red
    }
    if ($text) {
        $rawLines = @(($text -split "`r?`n") |
            Where-Object { $_ -match 'ERROR!|failed : Failure|Invalid Password|Not logged on|KeyValues Error|Content root|Depot config|App build file' } |
            Select-Object -Last 4 | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        foreach ($l in $rawLines) { Write-Host "  原文: $l" -ForegroundColor DarkGray }
    }
    if ($null -ne $exitCode) { Write-Host "  steamcmd exit code: $exitCode" -ForegroundColor DarkGray }
    if ($consoleLogPath -and (Test-Path -LiteralPath $consoleLogPath)) {
        Write-Host "  完整 steamcmd 输出: $consoleLogPath" -ForegroundColor DarkGray
    }
}

if (-not (Test-Path $steamcmd)) { Fail "steamcmd not found: $steamcmd" }
if (-not (Test-Path $appDir))   { Fail "app folder not found: $appDir" }
if (-not $User) { Fail "no -User given: pass the Steam account name, e.g. -User your_login" }

# ---- locate the app build script -------------------------------------------
if ($AppScript) {
    $appVdf = Join-Path $appDir $AppScript
} else {
    $candidates = @(Get-ChildItem $appDir -File -Filter 'app_*.vdf' |
                    Where-Object { $_.Name -notlike '_preview_*' })
    if ($candidates.Count -eq 0) { Fail "no app_*.vdf in $appDir" }
    if ($candidates.Count -gt 1) { Fail "several app_*.vdf in $appDir; use -AppScript to pick one" }
    $appVdf = $candidates[0].FullName
}
if (-not (Test-Path $appVdf)) { Fail "app build script not found: $appVdf" }

# vdf 是 UTF-8（工具写出来时不带 BOM），必须显式指定编码：Windows PowerShell 5.1
# 默认按系统 ANSI（中文系统 936）解码，中文路径/目录会被读坏，内容目录就全部对不上。
$appText = Get-Content -LiteralPath $appVdf -Raw -Encoding UTF8

# vdf 里 // 到行尾是注释，注释掉的行等于不存在。解析时先用去掉注释的文本：
# 否则「被注释掉的 depot」也会被算进 Depots，steamcmd 实际又不建它，
# 日志里就会出现 Depots : 2 却只建了 1 个 depot 的假象。
# （check.ps1 一直按去注释后的文本解析，这里对齐。）
$parseText = [regex]::Replace($appText, '(?m)//.*$', '')

# 日志和构建缓存跟着 BuildOutput 走：每个 App 的缓存目录是分开的，
# 写死在 ContentBuilder\output 会读不到别的 App 的日志。
$buildOutput = $null
if ($parseText -match '(?im)^\s*"BuildOutput"\s+"([^"]+)"') { $buildOutput = $Matches[1] }
if ($buildOutput) { $outDir = $buildOutput }

if ($parseText -notmatch '(?im)^\s*"appid"\s+"([^"]+)"') { Fail "no AppID in $appVdf" }
$appId = $Matches[1]

# App 层 ContentRoot = 给「没写自己 contentroot 的 depot」用的默认值。
# 一个 App 挂多个平台时，每个 depot 都有各自的 contentroot，
# App 层这个值基本没用，所以不强制它存在。
$appContentRoot = $null
if ($parseText -match '(?im)^\s*"contentroot"\s+"([^"]+)"') { $appContentRoot = $Matches[1] }

# ---- depots ----------------------------------------------------------------
$depotRefs = @()
if ($parseText -match '(?is)"Depots"\s*\{([^}]*)\}') {
    foreach ($m in [regex]::Matches($Matches[1], '"([^"]+)"\s+"([^"]+)"')) {
        $depotRefs += [pscustomobject]@{ Id = $m.Groups[1].Value; File = $m.Groups[2].Value }
    }
}
if ($depotRefs.Count -eq 0) { Fail "no depots listed in the Depots block of $appVdf" }

Write-Host ""
Write-Host "App        : $App"      -ForegroundColor Cyan
Write-Host "AppID      : $appId"
Write-Host "Script     : $appVdf"
Write-Host "Preview    : $([bool]$Preview)"
Write-Host "Depots     : $($depotRefs.Count)"
Write-Host ""

$rows = @()
foreach ($d in $depotRefs) {
    # app vdf 里 depot 可以写成裸文件名，也可以写成绝对路径（Valve 模板/手写的常见）。
    # Join-Path 不会因为子路径是绝对的就重置：Join-Path 'D:\a' 'D:\b' 会拼成 'D:\a\D:\b'。
    $dp = if ([IO.Path]::IsPathRooted($d.File)) { $d.File } else { Join-Path $appDir $d.File }
    if (-not (Test-Path $dp)) { Fail "depot script not found: $dp" }

    $dtext = Get-Content -LiteralPath $dp -Raw -Encoding UTF8
    $cr = $null
    if ($dtext -match '(?im)^\s*"contentroot"\s+"([^"]+)"') { $cr = $Matches[1] }
    $own = [bool]$cr
    if (-not $cr) {
        if (-not $appContentRoot) {
            Fail "depot $($d.Id) ($($d.File)) has no contentroot, and the app script has none either"
        }
        $cr = $appContentRoot
    }
    $rows += [pscustomobject]@{ Id = $d.Id; File = $d.File; Root = $cr; Own = $own }
}

$bad = 0
foreach ($r in $rows) {
    $src = if ($r.Own) { 'own' } else { 'app' }
    if (-not (Test-Path $r.Root)) {
        Write-Host ("  depot {0,-10} {1,-30} [{2}] MISSING ROOT: {3}" -f $r.Id, $r.File, $src, $r.Root) -ForegroundColor Red
        $bad++
        continue
    }
    $stats = Get-ChildItem $r.Root -Recurse -Force -File -ErrorAction SilentlyContinue |
             Measure-Object -Property Length -Sum
    if ($stats.Count -eq 0) {
        Write-Host ("  depot {0,-10} {1,-30} [{2}] EMPTY: {3}" -f $r.Id, $r.File, $src, $r.Root) -ForegroundColor Red
        $bad++
        continue
    }
    Write-Host ("  depot {0,-10} {1,-30} [{2}] {3,6} files {4,9:N1} MB  {5}" -f `
        $r.Id, $r.File, $src, $stats.Count, ($stats.Sum / 1MB), $r.Root) -ForegroundColor Green
}
Write-Host ""

if ($bad -gt 0) {
    Fail "$bad depot(s) have a missing or empty ContentRoot -> build the game first, or fix the path in the vdf"
}

# ---- junk that must never reach a depot ------------------------------------
$junkNames = @('logs', 'tools', 'SinglePlayerDeathDebug.log')
foreach ($root in ($rows.Root | Select-Object -Unique)) {
    $junk = @(Get-ChildItem $root -Force -ErrorAction SilentlyContinue |
              Where-Object { $junkNames -contains $_.Name -or $_.Name -like '*BurstDebugInformation_DoNotShip' })
    if ($junk.Count -gt 0) {
        Write-Host "Debug/QA leftovers in $root (must be excluded by its depot vdf):" -ForegroundColor Yellow
        foreach ($j in $junk) { Write-Host "   - $($j.Name)" -ForegroundColor Yellow }
        Write-Host "   If any of these show up as 'Added' in the build log, fix FileExclusion." -ForegroundColor Yellow
    }
}

# ---- preview / local 都只在临时 vdf 里生效 --------------------------------
# preview 由 -Preview 这个开关**唯一**决定：带它就是 1，不带就强制写成 0。
# 这样「正式上传」永远真的上传 —— 不会再出现 vdf 里留着 preview "1"、
# 点了好几次正式上传结果全是空跑的情况。
$runVdf = $appVdf
$tempVdf = $null
$t = $appText

$pv = if ($Preview) { '1' } else { '0' }
if ($t -notmatch '(?im)^\s*"preview"\s+"[^"]*"') {
    # 老脚本里可能整行被注释掉或压根没有，补一行在 AppID 后面
    $t = $t -replace '(?im)^(\s*"AppID"[^\n]*\r?\n)', "`$1`t`"preview`"`t`t`"0`"`r`n"
}
$t = $t -replace '(?im)^(\s*"preview"\s+)"[^"]*"', ('$1"' + $pv + '"')

if ($Local) {
    $htdocs = $LocalRoot
    if (-not $htdocs) { $htdocs = [IO.Path]::GetFullPath((Join-Path $CB '..\ContentServer\htdocs')) }
    if (-not (Test-Path $htdocs)) { Fail "local content server htdocs not found: $htdocs" }
    $ins = $htdocs -replace '\$', '$$'
    if ($t -match '(?im)^\s*"Local"\s+"[^"]*"') {
        $t = $t -replace '(?im)^(\s*)"Local"(\s+)"[^"]*"', "`$1`"Local`"`$2`"$ins`""
    } elseif ($t -match '(?im)^\s*//\s*"Local"') {
        $t = $t -replace '(?im)^(\s*)//\s*"Local"(\s+)"[^"]*"', "`$1`"Local`"`$2`"$ins`""
    } else {
        $t = $t -replace '(?im)^(\s*"BuildOutput"[^\n]*\r?\n)', "`$1`t`"Local`"`t`t`"$ins`"`r`n"
    }
}

# The temp copy must sit next to the depot vdf: depot scripts are
# referenced by relative filename.
# 不用 Set-Content -Encoding ASCII —— 那会把 Desc 和注释里的中文写成 ????，
# 路径里有中文时更糟。写不带 BOM 的 UTF-8。
$tempVdf = Join-Path $appDir ("_preview_" + [IO.Path]::GetFileName($appVdf))
[IO.File]::WriteAllText($tempVdf, $t, (New-Object Text.UTF8Encoding($false)))
$runVdf = $tempVdf
Write-Host ""
if ($Preview) { Write-Host "Preview build: nothing will be uploaded." -ForegroundColor Yellow }
if ($Local)   { Write-Host "Local build: content goes to $htdocs, not to Steam." -ForegroundColor Yellow }

# 日志放哪：vdf 配了 BuildOutput 就跟着它；没配的话 steamcmd 默认写到
# <app 脚本目录>\buildoutput\（2026-10-27 实测，不是 ContentBuilder\output）。
# 两处都找，否则旧 vdf（没有 BuildOutput）会误报「没有构建日志」+ 退出码 1。
$logFile = Join-Path $outDir ("app_build_{0}.log" -f $appId)
$logCandidates = @()
if ($buildOutput) { $logCandidates += $logFile }
$logCandidates += (Join-Path $appDir ("buildoutput\app_build_{0}.log" -f $appId))
$logCandidates += $logFile
$logCandidates = @($logCandidates | Select-Object -Unique)

$consoleDir = if ($buildOutput) { $buildOutput } else { Join-Path $appDir 'buildoutput' }
if (-not (Test-Path $consoleDir)) { New-Item -ItemType Directory -Path $consoleDir -Force | Out-Null }
$consoleLogPath = Join-Path $consoleDir ("app_build_{0}_console.log" -f $appId)
$exit = $null

try {
    Write-Host ""
    Write-Host "> steamcmd +login $User +run_app_build $runVdf +quit" -ForegroundColor DarkGray
    Write-Host ""

    $cmdArgs = @('+login', $User, '+run_app_build', $runVdf, '+quit')

    # 密码只从环境变量拿，绝不放进命令行：
    #   * 不会出现在进程列表 / steamcmd 的参数里
    #   * steamcmd 的 stdout 接管道时是块缓冲的，它的 "password:" 提示
    #     根本刷不出来，所以「看到提示再回答」这条路走不通，
    #     只能提前把密码写进它的 stdin，让它自己读走。
    $pw = $env:STEAMSDK_BUILD_PASSWORD
    # 账号绑了手机令牌 / 邮箱令牌时，steamcmd 登完密码还会要一个 Steam Guard 码。
    # 它的提示走 stdout，接管道时是块缓冲的、经常刷不出来，所以不能等提示 ——
    # 直接把码作为 stdin 的第二行写进去（steamcmd 是先读 password: 再读 code:）。
    $guard = $env:STEAMSDK_GUARD_CODE
    if ($pw) {
        Write-Host "Using password from STEAMSDK_BUILD_PASSWORD." -ForegroundColor DarkGray
        if ($guard) {
            Write-Host "Using Steam Guard code from STEAMSDK_GUARD_CODE." -ForegroundColor DarkGray
            "$pw`n$guard" | & $steamcmd @cmdArgs 2>&1 | ForEach-Object { Write-SteamcmdLine $_ }
        } else {
            $pw | & $steamcmd @cmdArgs 2>&1 | ForEach-Object { Write-SteamcmdLine $_ }
        }
        $exit = $LASTEXITCODE
        if ($script:consoleLines.Count -gt 0) {
            try { [IO.File]::WriteAllLines($consoleLogPath, $script:consoleLines, (New-Object Text.UTF8Encoding($false))) } catch { }
        }
    } else {
        Write-Host "No STEAMSDK_BUILD_PASSWORD set; steamcmd will prompt." -ForegroundColor DarkGray
        & $steamcmd @cmdArgs
        $exit = $LASTEXITCODE
    }

    $logFile = $null
    foreach ($candidate in $logCandidates) {
        if (Test-Path $candidate) { $logFile = $candidate; break }
    }

    Write-Host ""
    if ($logFile) {
        Write-Host "--- $logFile (tail) ---" -ForegroundColor DarkGray
        Get-Content -LiteralPath $logFile -Tail 25 -Encoding UTF8 | ForEach-Object { Write-Host "  $_" }
        $logText = Get-Content -LiteralPath $logFile -Raw -Encoding UTF8
        $ok = $logText -match 'Successfully finished'
        Write-Host ""
        if ($ok) {
            Write-Host "OK: build finished." -ForegroundColor Green
            if ($Preview) {
                Write-Host "    (preview only - nothing was uploaded)" -ForegroundColor Yellow
            } else {
                Write-Host "    Next: Steamworks partner site -> your app -> Builds," -ForegroundColor Gray
                Write-Host "          then set the build live on the branch you want." -ForegroundColor Gray
            }
        } else {
            Write-Host "FAILED: no 'Successfully finished' in the log." -ForegroundColor Red
            $diag = (($script:consoleLines -join "`n") + "`n" + $logText)
            Write-FailureDiagnosis -text $diag -exitCode $exit -consoleLogPath $consoleLogPath
            exit 1
        }
    } else {
        Write-Host "No build log found. Tried:" -ForegroundColor Red
        foreach ($candidate in $logCandidates) { Write-Host "  - $candidate" -ForegroundColor Red }
        $hint = "steamcmd's log location depends on BuildOutput in the app vdf;"
        $hint += " if the build really succeeded, check the Steamworks build page."
        Write-Host $hint -ForegroundColor Yellow
        Write-FailureDiagnosis -text ($script:consoleLines -join "`n") -exitCode $exit -consoleLogPath $consoleLogPath
        exit 1
    }

    if ($exit -ne 0) {
        Write-Host "steamcmd exit code: $exit" -ForegroundColor Red
        if (Test-Path -LiteralPath $consoleLogPath) { Write-Host "  完整 steamcmd 输出: $consoleLogPath" -ForegroundColor DarkGray }
        exit $exit
    }
}
finally {
    if ($tempVdf -and (Test-Path $tempVdf)) { Remove-Item -LiteralPath $tempVdf -Force }
}
