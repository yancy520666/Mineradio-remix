@echo off
setlocal
chcp 65001 >nul
title Update Mineradio Remix

if not exist "%~dp0scripts\update-local.ps1" (
  echo [ERROR] Missing scripts\update-local.ps1. Keep this BAT in the project folder.
  pause
  exit /b 1
)

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -File "%~dp0scripts\update-local.ps1" -RepoDirectory "%~dp0."
set "UPDATE_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %UPDATE_EXIT%
