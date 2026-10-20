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

; 默认安装目录钉到 D:\SteamSDK Tool。
;
; 直接改 $INSTDIR 是没用的：customInit 跑完之后，用户点「仅为我安装」会触发
; setInstallModePerUser，它把 $INSTDIR 重设一遍。但它是**先读注册表**的：
;
;     ReadRegStr $perUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
;     ${if} $perUserInstallationFolder == ""
;       → 才用 %LOCALAPPDATA%\Programs\<APP_FILENAME>
;
; 所以只要在 customInit（在 initMultiUser 之后、安装模式页之前）里把那个键
; 预置成 D:\SteamSDK Tool，安装模式页一过，目录页显示的就是它。
; 装完之后安装器自己会把真实路径写回去，不会一直钉着。
;
; 只在这两种情况下钉：① 从没装过（键里没值）② D 盘存在。
; 已经装过的人不该被挪走 —— 他们升级时应该还在原来的位置。
;
; 为什么是「SteamSDK Tool」而不是「SDK Tool」：electron-builder 自带的
; instFilesPre 会检查路径里有没有 ${APP_FILENAME}（= SteamSDK Tool），
; 没有就再拼一层。所以 D:\SDK Tool 会变成 D:\SDK Tool\SteamSDK Tool。
!include "LogicLib.nsh"

!macro customInit
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
    ${If} ${FileExists} "D:\*.*"
      WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "D:\SteamSDK Tool"
    ${EndIf}
  ${EndIf}
!macroend

; 目录页：用户把路径改成盘符根（D:\ 或 D:）时，自动补成 D:\SteamSDK Tool。
;
; 为什么必须补：NSIS 的目录页不允许装到盘符根，路径是 D:\ 时右下角按钮直接变灰、
; 点不动，用户会以为卡住了。

Function .onVerifyInstDir
  StrLen $0 "$INSTDIR"
  ${If} $0 == 3
    StrCpy $1 "$INSTDIR" 2          ; "D:\" 取前两个字符 → "D:"
    StrCpy $INSTDIR "$1\SteamSDK Tool"
  ${ElseIf} $0 == 2
    StrCpy $INSTDIR "$INSTDIR\SteamSDK Tool"
  ${EndIf}
FunctionEnd
