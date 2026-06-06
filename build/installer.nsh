!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

!ifndef BUILD_UNINSTALLER
  Var MineradioWelcomePage
  Var MineradioHeroFont
  Var MineradioTitleFont
  Var MineradioBodyFont
  Var MineradioSmallFont
!endif

!macro customInit
  !ifndef BUILD_UNINSTALLER
    !insertmacro GetDParameter $R0
    ${If} $R0 == ""
    ${AndIf} $hasPerUserInstallation == "0"
    ${AndIf} $hasPerMachineInstallation == "0"
      IfFileExists "D:\*.*" 0 +2
      StrCpy $INSTDIR "D:\Mineradio"
    ${EndIf}
  !endif
!macroend

!macro customWelcomePage
  Page custom MineradioWelcomeShow
!macroend

!ifndef BUILD_UNINSTALLER
Function MineradioWelcomeShow
  nsDialogs::Create 1018
  Pop $MineradioWelcomePage
  ${If} $MineradioWelcomePage == error
    Abort
  ${EndIf}

  SetCtlColors $MineradioWelcomePage "F4F0E8" "101115"
  CreateFont $MineradioHeroFont "Segoe UI Variable Display" 26 800
  CreateFont $MineradioTitleFont "Microsoft YaHei UI" 12 700
  CreateFont $MineradioBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $MineradioSmallFont "Segoe UI" 8 600

  ${NSD_CreateLabel} 0u 0u 300u 176u ""
  Pop $0
  SetCtlColors $0 "F4F0E8" "101115"

  ${NSD_CreateLabel} 9u 9u 282u 158u ""
  Pop $0
  SetCtlColors $0 "F4F0E8" "17181F"

  ${NSD_CreateLabel} 18u 18u 76u 20u "MINERADIO"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "F4D28A" "17181F"

  ${NSD_CreateLabel} 18u 46u 160u 34u "Mineradio"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioHeroFont 1
  SetCtlColors $0 "FFFFFF" "17181F"

  ${NSD_CreateLabel} 20u 86u 210u 28u "粒子、歌词、3D 歌单架和本地播放控制台会一起安装。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioBodyFont 1
  SetCtlColors $0 "C9CCD4" "17181F"

  ${NSD_CreateLabel} 20u 128u 252u 12u "默认安装目录：$INSTDIR"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "F4D28A" "17181F"

  ${NSD_CreateLabel} 20u 145u 250u 10u "下一步可以修改目录；首次安装会优先使用 D:\Mineradio。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioBodyFont 1
  SetCtlColors $0 "8F96A8" "17181F"

  ${NSD_CreateLabel} 208u 23u 56u 56u "MR"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioHeroFont 1
  SetCtlColors $0 "FF5367" "17181F"

  ${NSD_CreateLabel} 204u 86u 58u 10u "VISUAL"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "EAF2FF" "17181F"

  ${NSD_CreateLabel} 204u 102u 70u 10u "LOCAL"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "EAF2FF" "17181F"

  ${NSD_CreateLabel} 204u 118u 70u 10u "UPDATER READY"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MineradioSmallFont 1
  SetCtlColors $0 "EAF2FF" "17181F"

  nsDialogs::Show
FunctionEnd
!endif
