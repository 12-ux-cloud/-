Unicode true

;--------------------------------
; 一叶轻舟工作室 — NSIS 安装脚本
;--------------------------------

;--------------------------------
; 基本配置
;--------------------------------
!define PRODUCT_NAME "一叶轻舟工作室"
!define PRODUCT_NAME_EN "YiYeQingZhouStudio"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "一叶轻舟工作室"
!define PRODUCT_WEB_SITE "https://github.com/YiYeQingZhou/studio"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME_EN}"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\release\YiYeQingZhouStudio-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME}"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" "InstallLocation"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
XPStyle on

;--------------------------------
; 界面配置
;--------------------------------
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"

; 欢迎页
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "本安装程序将安装 ${PRODUCT_NAME} v${PRODUCT_VERSION}。$\r$\n$\r$\n${PRODUCT_NAME} 是一款 AI 辅助小说创作工具，支持从规划到发布的全流程创作。"

; 完成页（不自动启动，让用户从桌面启动）
!define MUI_FINISHPAGE_LINK "访问项目主页"
!define MUI_FINISHPAGE_LINK_LOCATION "${PRODUCT_WEB_SITE}"

; 安装页面
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; 卸载页面
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

;--------------------------------
; 安装段 - 从 staging 目录复制所有文件
;--------------------------------
Section "install" InstallSec
  ; 临时设置当前目录为 staging 目录
  SetOutPath "$INSTDIR"

  ; === 核心文件 ===
  File /nonfatal "staging\package.json"

  ; === 编译后的服务端代码 ===
  SetOutPath "$INSTDIR\dist-server"
  File /r "staging\dist-server\*.*"

  ; === 前端静态文件 ===
  SetOutPath "$INSTDIR\dist"
  File /r "staging\dist\*.*"

  ; === 模板文件 ===
  SetOutPath "$INSTDIR\templates"
  File /r "staging\templates\*.*"

  ; === 生产依赖 ===
  SetOutPath "$INSTDIR\node_modules"
  File /r "staging\node_modules\*.*"

  ; === NW.js 运行时（原生窗口） ===
  SetOutPath "$INSTDIR\nwjs"
  File /r "staging\nwjs\*.*"

  ; === NW.js 启动画面 ===
  SetOutPath "$INSTDIR\nw-app"
  File /r "staging\nw-app\*.*"

  ; === 图标 ===
  SetOutPath "$INSTDIR\build"
  File /nonfatal "..\build\icon.ico"

  ; === 创建快捷方式（NW.js 原生窗口，无命令行） ===
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" \
    "$INSTDIR\nwjs\nw.exe" '"$INSTDIR\nw-app"' "$INSTDIR\build\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk" \
    "$INSTDIR\uninst.exe"

  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" \
    "$INSTDIR\nwjs\nw.exe" '"$INSTDIR\nw-app"' "$INSTDIR\build\icon.ico" 0

  ; === 注册表（卸载信息） ===
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "DisplayIcon" "$INSTDIR\build\icon.ico"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "${PRODUCT_DIR_REGKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_DIR_REGKEY}" "NoRepair" 1

  ; === 写入卸载程序 ===
  WriteUninstaller "$INSTDIR\uninst.exe"

  ; === 计算大小 ===
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${PRODUCT_DIR_REGKEY}" "EstimatedSize" "$0"
SectionEnd

;--------------------------------
; 卸载段
;--------------------------------
Section "Uninstall"
  ; 停止运行中的程序
  ExecWait 'taskkill /F /IM nw.exe' $0
  ExecWait 'taskkill /F /IM node.exe' $0

  ; 删除快捷方式
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"

  ; 删除程序文件
  RMDir /r "$INSTDIR\dist-server"
  RMDir /r "$INSTDIR\dist"
  RMDir /r "$INSTDIR\templates"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\nwjs"
  RMDir /r "$INSTDIR\nw-app"
  RMDir /r "$INSTDIR\build"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\uninst.exe"
  RMDir "$INSTDIR"

  ; 删除注册表
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"

  ; 注意：不删除用户数据目录
  ; 用户数据（%APPDATA%/一叶轻舟工作室）包含作品和数据库，卸载时保留
SectionEnd

;--------------------------------
; 安装前检查
;--------------------------------
Function .onInit
  ReadRegStr $0 HKLM "${PRODUCT_DIR_REGKEY}" "InstallLocation"
  StrCmp $0 "" done
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "${PRODUCT_NAME} 已经安装。是否覆盖安装？$\r$\n$\r$\n当前安装位置：$0" \
    IDYES done
  Abort
done:
FunctionEnd
