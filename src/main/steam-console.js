import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 清空成就走的是 Steam 客户端**自带的控制台**，不联网、不需要 Web API 密钥：
 *
 *   steam://nav/console  打开控制台页面（输入框会自动聚焦）
 *   reset_all_stats <AppID>  把当前登录账号在这个 App 下的成就和统计一起重置
 *
 * 控制台页面没有对外接口，只能在窗口获得焦点后模拟键盘输入。所以这里用一段
 * PowerShell：
 *   1. 找到 Steam 主窗口（steamwebhelper 进程里标题为 Steam 的可见窗口）；
 *   2. 打开 steam://nav/console；
 *   3. 把 Steam 切到前台（切不到就中止，避免把命令敲进别的窗口）；
 *   4. 发送命令 + 回车；
 *   5. 盯 Steam 的 console_log.txt，等 `reset_all_stats success/failed for appid N`；
 *   6. 把原来的前台窗口切回去。
 *
 * 结果以一行 JSON 打印到 stdout，Node 这边解析。
 */

const CODE_MESSAGES = {
  steam_not_running: 'Steam 没在运行。先打开 Steam 客户端再试。',
  steam_path_not_found: '找不到 Steam 的安装路径（注册表里没有）。',
  steam_window_not_found: '没找到 Steam 主窗口。先把 Steam 主界面打开，再试一次。',
  focus_failed: '切不到 Steam 窗口（可能被别的窗口挡住了）。再试一次。',
  open_console_failed: '打不开 Steam 控制台页面。',
  rect_failed: '读不到 Steam 窗口的位置。再试一次。',
  click_failed: '点不到 Steam 控制台的输入框（窗口可能在屏幕外）。把 Steam 窗口拖回屏幕里再试。',
  focus_lost: '切到 Steam 后焦点又被别的窗口抢走了。等别的程序安静下来再试一次。',
  send_keys_failed: '模拟键盘输入失败。',
  timeout: '没等到 Steam 控制台的返回。确认 Steam 已登录，然后重试。'
}

/** 构造 PowerShell 脚本：只有 AppID 是变量，其余全是常量。 */
const PS_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class SteamAchWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT pt);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  public static int[] RectOf(IntPtr h) { RECT r; GetWindowRect(h, out r); return new int[] { r.Left, r.Top, r.Right, r.Bottom }; }
  public static int[] CursorPos() { POINT p; GetCursorPos(out p); return new int[] { p.X, p.Y }; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
}
"@

# DPI 感知：不声明的话，进程拿到的坐标被系统按主屏 DPI 虚拟化，
# 第二块屏幕上的 Steam 窗口算出来的点击位置会被裁剪到主屏边缘，点不中输入框。
try { [void][SteamAchWin]::SetProcessDPIAware() } catch { }

$AppId = __APP_ID__

$steam = Get-Process -Name steam -ErrorAction SilentlyContinue
if (-not $steam) {
  Write-Output '{"ok":false,"code":"steam_not_running"}'
  exit 0
}

$steamPath = $null
$reg = Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue
if ($reg -and $reg.SteamPath) { $steamPath = $reg.SteamPath }
if (-not $steamPath) {
  $reg2 = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam' -ErrorAction SilentlyContinue
  if ($reg2 -and $reg2.InstallPath) { $steamPath = $reg2.InstallPath }
}
if (-not $steamPath) {
  Write-Output '{"ok":false,"code":"steam_path_not_found"}'
  exit 0
}

$script:target = [IntPtr]::Zero
$enum = [SteamAchWin+EnumWindowsProc]{
  param($h, $l)
  if (-not [SteamAchWin]::IsWindowVisible($h)) { return $true }
  [uint32]$procId = 0
  [void][SteamAchWin]::GetWindowThreadProcessId($h, [ref]$procId)
  if ($procId -eq 0) { return $true }
  try { $name = (Get-Process -Id ([int]$procId) -ErrorAction Stop).ProcessName } catch { return $true }
  if ($name -ne 'steamwebhelper') { return $true }
  $sb = New-Object System.Text.StringBuilder 256
  [void][SteamAchWin]::GetWindowText($h, $sb, 256)
  if ($sb.ToString() -eq 'Steam') {
    $script:target = $h
    return $false
  }
  return $true
}
[void][SteamAchWin]::EnumWindows($enum, [IntPtr]::Zero)
if ($script:target -eq [IntPtr]::Zero) {
  Write-Output '{"ok":false,"code":"steam_window_not_found"}'
  exit 0
}

$prev = [SteamAchWin]::GetForegroundWindow()

$log = Join-Path $steamPath 'logs\console_log.txt'

# Steam 窗口最小化/藏起来时，steam://nav/console 不一定能把控制台页打开；
# 所以顺序是：先恢复窗口 → 切前台 → 再 nav。
if ([SteamAchWin]::IsIconic($script:target)) { [void][SteamAchWin]::ShowWindow($script:target, 9) }
if (-not [SteamAchWin]::IsWindowVisible($script:target)) { [void][SteamAchWin]::ShowWindow($script:target, 5) }
Start-Sleep -Milliseconds 150

# 先把 Steam 切到前台（刚点完按钮，工具窗口还是前台，这时候最容易拿到前台权限）；
# 切不到就中止，避免把命令敲进别人正在用的窗口。
for ($i = 0; $i -lt 8; $i++) {
  [void][SteamAchWin]::SetForegroundWindow($script:target)
  Start-Sleep -Milliseconds 120
  if ([SteamAchWin]::GetForegroundWindow() -eq $script:target) { break }
  # ALT 键会解除 Windows 的前台锁，是最稳的一招
  [SteamAchWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
  [void][SteamAchWin]::SetForegroundWindow($script:target)
  [SteamAchWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  if ([SteamAchWin]::GetForegroundWindow() -eq $script:target) { break }
  [uint32]$fgPid = 0
  [uint32]$tPid = 0
  $fg = [SteamAchWin]::GetForegroundWindow()
  $fgThread = [SteamAchWin]::GetWindowThreadProcessId($fg, [ref]$fgPid)
  $tThread = [SteamAchWin]::GetWindowThreadProcessId($script:target, [ref]$tPid)
  if ($fgThread -ne 0 -and $tThread -ne 0) {
    [void][SteamAchWin]::AttachThreadInput($fgThread, $tThread, $true)
    [void][SteamAchWin]::SetForegroundWindow($script:target)
    [void][SteamAchWin]::AttachThreadInput($fgThread, $tThread, $false)
  }
  Start-Sleep -Milliseconds 150
}
Start-Sleep -Milliseconds 150

$fg2 = [SteamAchWin]::GetForegroundWindow()
if ($fg2 -ne $script:target) {
  $sb = New-Object System.Text.StringBuilder 256
  [void][SteamAchWin]::GetWindowText($fg2, $sb, 256)
  [uint32]$dbgPid = 0
  [void][SteamAchWin]::GetWindowThreadProcessId($fg2, [ref]$dbgPid)
  $esc = $sb.ToString().Replace('\', '\\').Replace('"', '\"')
  [void][SteamAchWin]::SetForegroundWindow($prev)
  Write-Output ('{"ok":false,"code":"focus_failed","fg":"' + $esc + '","fgPid":' + $dbgPid + '}')
  exit 0
}

# Steam 已经在前台，这时打开控制台页才会真的切过去
try {
  Start-Process 'steam://nav/console' | Out-Null
} catch {
  [void][SteamAchWin]::SetForegroundWindow($prev)
  Write-Output '{"ok":false,"code":"open_console_failed"}'
  exit 0
}
Start-Sleep -Milliseconds 2200

# 页面加载期间前台可能又被抢走，再切一下
$stillFg = $false
for ($i = 0; $i -lt 4; $i++) {
  [void][SteamAchWin]::SetForegroundWindow($script:target)
  Start-Sleep -Milliseconds 100
  if ([SteamAchWin]::GetForegroundWindow() -eq $script:target) { $stillFg = $true; break }
  [SteamAchWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
  [void][SteamAchWin]::SetForegroundWindow($script:target)
  [SteamAchWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 100
  if ([SteamAchWin]::GetForegroundWindow() -eq $script:target) { $stillFg = $true; break }
}
if (-not $stillFg) {
  [void][SteamAchWin]::SetForegroundWindow($prev)
  Write-Output '{"ok":false,"code":"focus_failed"}'
  exit 0
}

# 控制台页的输入框在页面打开时会自动聚焦（sp.js 里 useEffect 里 Focus()），
# 所以先直接敲；只有敲不进去时才去点一下页面底部的输入框再敲。
# 记得用户鼠标位置，结束时还原，别把光标留在 Steam 窗口上。
$cursor = [SteamAchWin]::CursorPos()

[int64]$before = 0
if (Test-Path $log) { $before = (Get-Item $log).Length }

function Read-Appended([int64]$from) {
  if (-not (Test-Path $log)) { return '' }
  $len = (Get-Item $log).Length
  if ($len -le $from) { return '' }
  $fs = [System.IO.File]::Open($log, 'Open', 'Read', 'ReadWrite')
  try {
    $fs.Position = $from
    $sr = New-Object System.IO.StreamReader($fs)
    return $sr.ReadToEnd()
  } finally {
    $fs.Close()
  }
}

$pattern = 'reset_all_stats (success|failed) for appid ' + $AppId
function Wait-Result([int]$seconds) {
  $dl = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $dl) {
    Start-Sleep -Milliseconds 300
    $t = Read-Appended $before
    $m = [regex]::Matches($t, $pattern)
    if ($m.Count -gt 0) { return $m[$m.Count - 1].Value }
  }
  return ''
}

# 敲之前再确认一次前台，避免把命令敲进别的窗口
if ([SteamAchWin]::GetForegroundWindow() -ne $script:target) {
  [void][SteamAchWin]::SetCursorPos($cursor[0], $cursor[1])
  [void][SteamAchWin]::SetForegroundWindow($prev)
  Write-Output '{"ok":false,"code":"focus_failed"}'
  exit 0
}

try {
  [System.Windows.Forms.SendKeys]::SendWait(('reset_all_stats ' + $AppId + '{ENTER}'))
} catch {
  [void][SteamAchWin]::SetCursorPos($cursor[0], $cursor[1])
  [void][SteamAchWin]::SetForegroundWindow($prev)
  Write-Output '{"ok":false,"code":"send_keys_failed"}'
  exit 0
}

$line = Wait-Result 5
if ($line -eq '') {
  # 第一次没等到：可能是页面还没加载完、输入框没聚焦。点一下页面底部的输入框再敲一次。
  $r = $null
  try { $r = [SteamAchWin]::RectOf($script:target) } catch { $r = $null }
  if ($null -eq $r -or $r.Count -lt 4) {
    [void][SteamAchWin]::SetCursorPos($cursor[0], $cursor[1])
    [void][SteamAchWin]::SetForegroundWindow($prev)
    Write-Output '{"ok":false,"code":"rect_failed"}'
    exit 0
  }
  $clickX = [int](($r[0] + $r[2]) / 2)
  $clickY = [int]($r[3] - 28)
  [void][SteamAchWin]::SetForegroundWindow($script:target)
  Start-Sleep -Milliseconds 150
  [void][SteamAchWin]::SetCursorPos($clickX, $clickY)
  Start-Sleep -Milliseconds 120
  # 光标没到位说明坐标被系统裁掉了（多屏不同 DPI / 窗口在屏幕外），点了也白点。
  $now = [SteamAchWin]::CursorPos()
  if ([Math]::Abs($now[0] - $clickX) -gt 3 -or [Math]::Abs($now[1] - $clickY) -gt 3) {
    [void][SteamAchWin]::SetCursorPos($cursor[0], $cursor[1])
    [void][SteamAchWin]::SetForegroundWindow($prev)
    Write-Output '{"ok":false,"code":"click_failed"}'
    exit 0
  }
  [SteamAchWin]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [SteamAchWin]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 250
  # 点完再确认前台还是 Steam，被抢走就停手，别把命令敲进别人的窗口。
  $fgClick = [SteamAchWin]::GetForegroundWindow()
  if ($fgClick -ne $script:target) {
    $sbLost = New-Object System.Text.StringBuilder 256
    [void][SteamAchWin]::GetWindowText($fgClick, $sbLost, 256)
    [uint32]$lostPid2 = 0
    [void][SteamAchWin]::GetWindowThreadProcessId($fgClick, [ref]$lostPid2)
    $escLost = $sbLost.ToString().Replace('\', '\\').Replace('"', '\"')
    [void][SteamAchWin]::SetCursorPos($cursor[0], $cursor[1])
    [void][SteamAchWin]::SetForegroundWindow($prev)
    Write-Output ('{"ok":false,"code":"focus_lost","fg":"' + $escLost + '","fgPid":' + $lostPid2 + '}')
    exit 0
  }
  try {
    [System.Windows.Forms.SendKeys]::SendWait(('reset_all_stats ' + $AppId + '{ENTER}'))
  } catch { }
  $line = Wait-Result 10
}

[void][SteamAchWin]::SetCursorPos($cursor[0], $cursor[1])
[void][SteamAchWin]::SetForegroundWindow($prev)
if ($line -ne '') {
  if ($line -match ' success ') { $ok = 'true' } else { $ok = 'false' }
  $esc = $line.Replace('\', '\\').Replace('"', '\"')
  Write-Output ('{"ok":true,"success":' + $ok + ',"line":"' + $esc + '"}')
  exit 0
}
Write-Output '{"ok":false,"code":"timeout"}'
`

function friendly(code) {
  return CODE_MESSAGES[code] || '清空失败，Steam 返回了未知错误。'
}

/**
 * 清空某个 App 的全部 Steam 成就（本机 Steam 客户端控制台）。
 * @param {string|number} appId
 * @returns {Promise<{ ok: boolean, error?: string, line?: string }>}
 */
export function clearAppAchievements(appId) {
  return new Promise((resolve) => {
    const id = Number(appId)
    if (!Number.isFinite(id) || id <= 0) {
      resolve({ ok: false, error: '这个 App 的构建脚本里没有可用的 AppID。' })
      return
    }

    const file = path.join(os.tmpdir(), `steamsdk-clear-ach-${process.pid}-${Date.now()}.ps1`)
    try {
      // 必须带 UTF-8 BOM：Windows PowerShell 5.1 读没有 BOM 的 .ps1 会按 ANSI 解码，
      // 脚本里的中文注释会被读坏，直接报 ParserError。
      fs.writeFileSync(file, '\ufeff' + PS_SCRIPT.replace('__APP_ID__', String(Math.trunc(id))), 'utf8')
    } catch (e) {
      resolve({ ok: false, error: `写临时脚本失败：${e.message}` })
      return
    }

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: true, timeout: 30000 },
      (err, stdout) => {
        fs.unlink(file, () => {})

        const lines = String(stdout || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
        let data = null
        for (let i = lines.length - 1; i >= 0; i -= 1) {
          if (!lines[i].startsWith('{')) continue
          try {
            data = JSON.parse(lines[i])
            break
          } catch {
            /* 继续往上找 */
          }
        }

        if (!data) {
          resolve({
            ok: false,
            error: `清空失败：没拿到 Steam 的返回${err?.message ? `（${err.message}）` : ''}。`
          })
          return
        }
        if (data.ok === false) {
          let err = friendly(data.code)
          if ((data.code === 'focus_failed' || data.code === 'focus_lost') && data.fg) {
            err += `（当前前台窗口是「${data.fg}」）`
          }
          resolve({ ok: false, error: err })
          return
        }
        if (data.success === true) {
          resolve({ ok: true, line: data.line || '' })
          return
        }
        resolve({
          ok: false,
          error: 'Steam 返回「清空失败」。确认这个账号拥有该 App，并且已经登录 Steam。'
        })
      }
    )
  })
}
