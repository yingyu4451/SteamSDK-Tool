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
            "$pw`n$guard" | & $steamcmd @cmdArgs
        } else {
            $pw | & $steamcmd @cmdArgs
        }
    } else {
        Write-Host "No STEAMSDK_BUILD_PASSWORD set; steamcmd will prompt." -ForegroundColor DarkGray
        & $steamcmd @cmdArgs
    }
    $exit = $LASTEXITCODE

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
            exit 1
        }
    } else {
        Write-Host "No build log found. Tried:" -ForegroundColor Red
        foreach ($candidate in $logCandidates) { Write-Host "  - $candidate" -ForegroundColor Red }
        $hint = "steamcmd's log location depends on BuildOutput in the app vdf;"
        $hint += " if the build really succeeded, check the Steamworks build page."
        Write-Host $hint -ForegroundColor Yellow
        exit 1
    }

    if ($exit -ne 0) {
        Write-Host "steamcmd exit code: $exit" -ForegroundColor Red
        exit $exit
    }
}
finally {
    if ($tempVdf -and (Test-Path $tempVdf)) { Remove-Item -LiteralPath $tempVdf -Force }
}
