; 安装向导的定制。electron-builder 会自动把 build\installer.nsh include 进 NSIS 脚本。
;
; 这里只做「加一个欢迎页」，让左侧那张竖图从第一步就能看到。
;
; 曾经试过但**没生效**的两件事，记下来免得以后再踩：
;
; 1. 在 customInit 里改 $INSTDIR（想让默认装到 D:\SDK Tool）——没用。
;    customInit 跑完之后，用户点「仅为我安装」会触发 setInstallModePerUser，
;    它把 $INSTDIR 重设成 %LOCALAPPDATA%\Programs\<APP_FILENAME>（或上次装的
;    InstallLocation）。所以默认安装位置只能在「装过一次之后」记住。
;
; 2. 自己写 .onVerifyInstDir 把盘符根补成 \SDK Tool ——不但没用，还会坏事：
;    electron-builder 自带 instFilesPre 也会补目录名，两边叠加会变成
;    D:\SDK Tool\SteamSDK Tool。盘符根交给它处理就好（结果是 D:\SteamSDK Tool）。
;
; 还有：不要在这里定义 .onGUIInit —— electron-builder 的模板已经有一个，
; 重复定义会让 makensis 直接报错 abort。

; 欢迎页（MUI_PAGE_WELCOME 会显示 installerSidebar 那张竖图）
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; 目录页：用户把路径改成盘符根（D:\ 或 D:）时，自动补成 D:\SteamSDK Tool。
;
; 为什么必须补：NSIS 的目录页不允许装到盘符根，路径是 D:\ 时右下角按钮直接变灰、
; 点不动，用户会以为卡住了。
;
; 为什么补的是「SteamSDK Tool」而不是「SDK Tool」：electron-builder 自带的
; instFilesPre 会在最后检查路径里有没有 ${APP_FILENAME}（=SteamSDK Tool），
; 没有就再拼一层。补成 D:\SDK Tool 的话会被拼成 D:\SDK Tool\SteamSDK Tool。
!include "LogicLib.nsh"

Function .onVerifyInstDir
  StrLen $0 "$INSTDIR"
  ${If} $0 == 3
    StrCpy $1 "$INSTDIR" 2          ; "D:\" 取前两个字符 → "D:"
    StrCpy $INSTDIR "$1\SteamSDK Tool"
  ${ElseIf} $0 == 2
    StrCpy $INSTDIR "$INSTDIR\SteamSDK Tool"
  ${EndIf}
FunctionEnd
