@echo off
chcp 65001 >nul
title Mini Farm - Local Launcher
setlocal
set "ROOT=%~dp0"
rem Strip trailing backslash so that --directory path is not mangled by quote escaping
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PORT=8080"

echo ==================================================
echo   Mini Farm (Web) - Local Launcher
echo --------------------------------------------------
echo   Folder : %ROOT%
echo   URL    : http://127.0.0.1:%PORT%/
echo ==================================================
echo.

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY ( where py >nul 2>nul && set "PY=py" )

if not defined PY (
  echo [ERROR] Python not found on this machine.
  echo         Alternative: just double-click index.html to play offline.
  echo.
  pause
  exit /b 1
)

echo [1/2] Starting local web server on port %PORT% ...
start "" /min cmd /c "timeout /t 2 >nul & start http://127.0.0.1:%PORT%/"

echo [2/2] Browser is opening. Keep THIS window open while playing.
echo       Close this window (or press Ctrl+C) to stop the server.
echo.

cd /d "%ROOT%"
%PY% -m http.server %PORT% --directory "%ROOT%"

echo.
echo Server stopped.
pause
