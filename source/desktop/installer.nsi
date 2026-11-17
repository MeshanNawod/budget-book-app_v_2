Unicode true
!include "MUI2.nsh"
!define APP "Budget Book"
!define VER "1.1.0"
!define EXE "Budget Book.exe"
!define UKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\BudgetBook"
Name "${APP}"
OutFile "out/Budget_Book_Setup_${VER}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\BudgetBook" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APP} ${VER}"
VIProductVersion "1.1.0.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "FileVersion" "${VER}"
VIAddVersionKey "LegalCopyright" "${APP}"

!define MUI_ICON "build/icon.ico"
!define MUI_UNICON "build/icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "build/welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "build/welcome.bmp"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${APP} Setup"
!define MUI_WELCOMEPAGE_TEXT "Budget Book helps societies and individuals record income, expenses and bills, see who holds the money, and print a complete budget book.$\r$\n$\r$\nAll your data stays on this computer. Use Settings > Save backup in the app to keep a copy.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open Budget Book now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; close a running copy so files can be replaced
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  SetOutPath "$INSTDIR"
  File /r "out/win-unpacked/*.*"
  File "/oname=app.ico" "build/icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall Budget Book.exe"
  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  WriteRegStr HKCU "Software\BudgetBook" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UKEY}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "${UKEY}" "Publisher" "${APP}"
  WriteRegStr HKCU "${UKEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "${UKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UKEY}" "UninstallString" '"$INSTDIR\Uninstall Budget Book.exe"'
  WriteRegDWORD HKCU "${UKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UKEY}"
  DeleteRegKey HKCU "Software\BudgetBook"
  ; Your records (in %APPDATA%\budget-book) are kept on purpose.
SectionEnd
