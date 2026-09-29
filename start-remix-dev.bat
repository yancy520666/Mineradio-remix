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

set "MINERADIO_RUNTIME_NAME=Mineradio Remix Dev"
set "MINERADIO_APP_USER_MODEL_ID=com.mineradio.remix.dev"
echo Starting Mineradio Remix Dev from %APP_DIR%
start "Mineradio Remix Dev" "%ELECTRON_EXE%" .
exit /b 0

:fail
pause
exit /b 1
