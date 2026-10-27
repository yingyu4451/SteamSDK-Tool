#Requires -Version 5.1
<#
    check.ps1 - offline validation of every build script under scripts\.

    Answers, without touching Steam and without logging in:
      * is each app_*.vdf structurally valid (braces balanced, quoted pairs)?
      * does every depot referenced by an app script exist, and does its
        DepotID match the key used in the app script?
      * does each ContentRoot exist and is it non-empty?
      * which files would actually be uploaded, and does anything that looks
        like debug / QA junk survive the FileExclusion list?

    由 SteamSDK 上传工作台随包提供；工具发现 SDK 里缺它时会自动写进
    tools\ContentBuilder\，已经存在的不覆盖（改坏了可在设置里点「安装/修复脚本」）。

    Usage:
        .\check.ps1                 # check all app folders
        .\check.ps1 -App MyGame
        .\check.ps1 -App MyGame -ShowIncluded
#>
[CmdletBinding()]
param(
    [string]$App,
    [switch]$ShowIncluded
)

# 输出被重定向（工具是管道）时统一按 UTF-8 写：Windows PowerShell 5.1 和 pwsh 在没有
# 控制台的管道里默认按系统 ANSI（中文系统 936）输出，工具按 UTF-8 解码就会看到乱码，
# 路径里的中文尤其明显。手动在控制台里跑不受影响。
try {
    if ([Console]::IsOutputRedirected) { [Console]::OutputEncoding = [Text.Encoding]::UTF8 }
} catch { }

$ErrorActionPreference = 'Stop'
$CB         = $PSScriptRoot
$scriptsDir = Join-Path $CB 'scripts'

$SKIP_DIRS = @('_templates', '_new_app_template')

# Heuristics for "this should never ship". Used only for reporting/warning.
$SUSPICIOUS_EXT   = @('.log', '.pdb', '.ps1', '.bat', '.cmd', '.ilk', '.exp', '.iobj', '.ipdb')
$SUSPICIOUS_PARTS = @('DoNotShip', 'PlayerLogs', 'mem-diag', 'CrashDump', 'Crash_')

function Get-Vdf {
    param([string]$Path)
    # vdf 一律是 UTF-8（工具写出来时不带 BOM）。必须显式指定编码：Windows PowerShell
    # 5.1 默认按系统 ANSI（中文系统 936）解码，中文路径会被读坏，后面 Test-Path 就会
    # 误报「ContentRoot does not exist」。
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    # strip // comments (no URLs expected in these files)
    $t = [regex]::Replace($raw, '(?m)//.*$', '')
    [pscustomobject]@{
        Path     = $Path
        Text     = $t
        Open     = ([regex]::Matches($t, '\{')).Count
        Close    = ([regex]::Matches($t, '\}')).Count
        Pairs    = [regex]::Matches($t, '"([^"]+)"\s+"([^"]+)"') |
                   ForEach-Object { [pscustomobject]@{ Key = $_.Groups[1].Value; Value = $_.Groups[2].Value } }
    }
}

function Get-Key {
    param($Vdf, [string]$Key)
    $m = $Vdf.Pairs | Where-Object { $_.Key -ieq $Key } | Select-Object -First 1
    if ($m) { $m.Value } else { $null }
}

function Get-Exclusions {
    param($Vdf)
    @($Vdf.Pairs | Where-Object { $_.Key -ieq 'FileExclusion' } | ForEach-Object { $_.Value })
}

$totalProblems = 0

$apps = if ($App) { @($App) } else {
    Get-ChildItem $scriptsDir -Directory |
        Where-Object { $SKIP_DIRS -notcontains $_.Name } |
        ForEach-Object { $_.Name }
}

foreach ($a in $apps) {
    $dir = Join-Path $scriptsDir $a
    Write-Host ""
    Write-Host "=== $a ===" -ForegroundColor Cyan

    if (-not (Test-Path $dir)) { Write-Host "  MISSING FOLDER: $dir" -ForegroundColor Red; $totalProblems++; continue }

    $appVdfs = @(Get-ChildItem $dir -File -Filter 'app_*.vdf' | Where-Object { $_.Name -notlike '_preview_*' })
    if ($appVdfs.Count -eq 0) { Write-Host "  no app_*.vdf" -ForegroundColor Red; $totalProblems++; continue }

    foreach ($af in $appVdfs) {
        $problems = @()
        $av = Get-Vdf -Path $af.FullName

        if ($av.Open -ne $av.Close) {
            $problems += "unbalanced braces: $($av.Open) '{' vs $($av.Close) '}'"
        }

        $appId      = Get-Key $av 'AppID'
        $contentRaw = Get-Key $av 'ContentRoot'
        if (-not $appId) { $problems += "no AppID" }

        Write-Host "  $($af.Name)"
        Write-Host "    AppID      : $appId"
        Write-Host "    ContentRoot: $(if ($contentRaw) { $contentRaw } else { '(未设置 — 各 depot 用各自的)' })"

        # --- depots block -------------------------------------------------
        $depotRefs = @()
        if ($av.Text -match '(?is)"Depots"\s*\{([^}]*)\}') {
            $block = $Matches[1]
            foreach ($m in [regex]::Matches($block, '"([^"]+)"\s+"([^"]+)"')) {
                $depotRefs += [pscustomobject]@{ Id = $m.Groups[1].Value; File = $m.Groups[2].Value }
            }
        }
        if ($depotRefs.Count -eq 0) { $problems += "no depots listed" }

        $allExclusions = @()
        $contentRoots  = @()

        foreach ($d in $depotRefs) {
            # Join-Path 不会因为子路径是绝对的就重置，绝对路径要直接用
            $dp = if ([IO.Path]::IsPathRooted($d.File)) { $d.File } else { Join-Path $dir $d.File }
            if (-not (Test-Path $dp)) {
                $problems += "depot script not found: $($d.File)"
                Write-Host "    depot $($d.Id) : FILE MISSING ($($d.File))" -ForegroundColor Red
                continue
            }
            $dv = Get-Vdf -Path $dp
            if ($dv.Open -ne $dv.Close) { $problems += "unbalanced braces in $($d.File)" }

            $dvId = Get-Key $dv 'DepotID'
            if ($dvId -ne $d.Id) { $problems += "DepotID mismatch: app says '$($d.Id)', $($d.File) says '$dvId'" }
            if ($dv.Text -notmatch '(?is)"FileMapping"\s*\{') { $problems += "no FileMapping block in $($d.File)" }

            $cr = Get-Key $dv 'contentroot'
            $crOwn = [bool]$cr
            if (-not $cr) { $cr = $contentRaw }
            if (-not $cr) {
                $problems += "$($d.File) 没有 contentroot，app 脚本也没有 -> 上传时会不知道传哪个目录"
            }
            $contentRoots += $cr
            $allExclusions += Get-Exclusions $dv

            $mark = if ($dvId -eq $d.Id) { 'ok' } else { 'MISMATCH' }
            $src  = if ($crOwn) { 'own' } else { 'app' }
            Write-Host "    depot $($d.Id) : $($d.File) [$mark] [$src] contentroot=$cr"
        }

        $allExclusions = @($allExclusions | Select-Object -Unique)
        Write-Host "    exclusions : $($allExclusions.Count) rules"

        # --- content root --------------------------------------------------
        foreach ($cr in ($contentRoots | Select-Object -Unique)) {
            if (-not (Test-Path $cr)) { $problems += "ContentRoot does not exist: $cr"; continue }

            $files = @(Get-ChildItem $cr -Recurse -Force -File -ErrorAction SilentlyContinue)
            if ($files.Count -eq 0) { $problems += "ContentRoot is empty: $cr"; continue }

            $included = @()
            $excluded = 0
            foreach ($f in $files) {
                $rel = $f.FullName.Substring($cr.Length).TrimStart('\')
                $hit = $null
                foreach ($p in $allExclusions) { if ($rel -like $p) { $hit = $p; break } }
                if ($hit) { $excluded++ } else { $included += $rel }
            }

            $incSize = 0
            foreach ($rel in $included) {
                $full = Join-Path $cr $rel
                if (Test-Path -LiteralPath $full) { $incSize += (Get-Item -LiteralPath $full).Length }
            }

            Write-Host ("    content    : {0} files on disk, {1} excluded, {2} would upload ({3:N1} MB)" -f `
                        $files.Count, $excluded, $included.Count, ($incSize / 1MB))

            $suspects = @($included | Where-Object {
                $rel = $_
                $ext = [IO.Path]::GetExtension($rel).ToLower()
                if ($SUSPICIOUS_EXT -contains $ext) { return $true }
                foreach ($part in $SUSPICIOUS_PARTS) { if ($rel -like "*$part*") { return $true } }
                return $false
            })

            if ($suspects.Count -gt 0) {
                $problems += "$($suspects.Count) suspicious file(s) would still be uploaded"
                Write-Host "    SUSPICIOUS (would be uploaded):" -ForegroundColor Red
                foreach ($s in ($suspects | Select-Object -First 25)) { Write-Host "       $s" -ForegroundColor Red }
            }
            if ($ShowIncluded) {
                Write-Host "    included files:"
                foreach ($i in ($included | Select-Object -First 40)) { Write-Host "       $i" }
                if ($included.Count -gt 40) { Write-Host "       ... and $($included.Count - 40) more" }
            }
        }

        if ($problems.Count -gt 0) {
            Write-Host "    PROBLEMS:" -ForegroundColor Red
            foreach ($p in $problems) { Write-Host "      - $p" -ForegroundColor Red }
            $totalProblems += $problems.Count
        } else {
            Write-Host "    OK" -ForegroundColor Green
        }
    }
}

Write-Host ""
if ($totalProblems -eq 0) {
    Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "$totalProblems problem(s) found" -ForegroundColor Red
    exit 1
}
