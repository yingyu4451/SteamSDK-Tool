# 生成安装向导左侧的竖图（164x314，NSIS 要求 24 位 BMP）。
# 用 System.Drawing 直接画：渐变底 + 我们的立方体 logo + 字标。
# 跑：pwsh -File scripts\make-installer-art.ps1
# 产物：build\installerSidebar.bmp / build\uninstallerSidebar.bmp

Add-Type -AssemblyName System.Drawing

$W = 164
$H = 314
$root = Split-Path -Parent $PSScriptRoot
$logoPath = Join-Path $root 'build\icon.png'

# 调色板（跟 style.css 的 @theme 一致）
$cTop = [System.Drawing.Color]::FromArgb(27, 40, 56)      # #1b2838
$cBot = [System.Drawing.Color]::FromArgb(19, 22, 28)      # #13161c
$cLine = [System.Drawing.Color]::FromArgb(42, 63, 90)     # #2a3f5a
$cInk = [System.Drawing.Color]::FromArgb(219, 230, 239)   # #dbe6ef
$cMuted = [System.Drawing.Color]::FromArgb(143, 152, 160) # #8f98a0
$cFaint = [System.Drawing.Color]::FromArgb(102, 112, 122) # #66707a
$cAccent = [System.Drawing.Color]::FromArgb(102, 192, 244) # #66c0f4

function New-Sidebar([string]$out, [string]$wordmark, [string]$sub) {
  $bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  # 纵向渐变
  $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $cTop, $cBot, 90.0)
  $g.FillRectangle($brush, $rect)
  $brush.Dispose()

  # 左上冷光
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse(-70, -90, 260, 260)
  $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
  $pgb.CenterColor = [System.Drawing.Color]::FromArgb(46, 102, 192, 244)
  $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 102, 192, 244))
  $g.FillPath($pgb, $glow)
  $pgb.Dispose(); $glow.Dispose()

  # 右侧 1px 分隔线
  $pen = New-Object System.Drawing.Pen($cLine, 1)
  $g.DrawLine($pen, ($W - 1), 0, ($W - 1), $H)
  $pen.Dispose()

  # logo（64x64，居中）
  if (Test-Path $logoPath) {
    $logo = [System.Drawing.Image]::FromFile($logoPath)
    $g.DrawImage($logo, [int](($W - 64) / 2), 52, 64, 64)
    $logo.Dispose()
  }

  $sf = [System.Drawing.StringFormat]::new()
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

  # 字标
  $fWord = New-Object System.Drawing.Font('MiSans Semibold', 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $bWord = New-Object System.Drawing.SolidBrush($cInk)
  $g.DrawString($wordmark, $fWord, $bWord, (New-Object System.Drawing.RectangleF(0, 140, $W, 24)), $sf)

  # 副标题
  $fSub = New-Object System.Drawing.Font('MiSans', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $bSub = New-Object System.Drawing.SolidBrush($cMuted)
  $g.DrawString($sub, $fSub, $bSub, (New-Object System.Drawing.RectangleF(0, 164, $W, 18)), $sf)

  # 强调短线
  $ap = New-Object System.Drawing.Pen($cAccent, 2)
  $g.DrawLine($ap, [int](($W - 36) / 2), 192, [int](($W + 36) / 2), 192)
  $ap.Dispose()

  # 底部版本
  $fVer = New-Object System.Drawing.Font('JetBrains Mono', 9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $bVer = New-Object System.Drawing.SolidBrush($cFaint)
  $slug = 'steamsdk-tool'
  $verRect = New-Object System.Drawing.RectangleF(0, 288, $W, 14)
  $g.DrawString($slug, $fVer, $bVer, $verRect, $sf)

  $g.Dispose()
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
  "  生成 $out"
}

New-Sidebar (Join-Path $root 'build\installerSidebar.bmp') 'SteamSDK' '上传工作台'
New-Sidebar (Join-Path $root 'build\uninstallerSidebar.bmp') 'SteamSDK' '卸载程序'

Get-ChildItem (Join-Path $root 'build') -Filter '*Sidebar.bmp' | Select-Object Name, Length | Format-Table -AutoSize
