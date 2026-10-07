@echo off
setlocal
chcp 65001 >nul
title Start Mineradio Remix Dev

set "APP_DIR=%~dp0"
set "ELECTRON_EXE=%APP_DIR%node_modules\electron\dist\electron.exe"

cd /d "%APP_DIR%" || goto :fail
if not exist "%ELECTRON_EXE%" (
  echo [FAIL] Electron was not found. Run npm ci in this folder first.
  goto :fail
)

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%scripts\start-remix-dev.ps1" -AppDirectory "%APP_DIR%."
if errorlevel 1 goto :fail
exit /b 0

:fail
pause
exit /b 1
