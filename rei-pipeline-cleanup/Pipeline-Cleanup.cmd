@echo off
title Pipeline Status Cleanup
cd /d "%~dp0"

REM --- First-run setup: install dependencies if missing ---
if not exist "node_modules\" (
  echo First run - installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Make sure Node.js is installed ^(https://nodejs.org^),
    echo then double-click this app again.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo   Pipeline Status Cleanup
echo   The dashboard will open in your browser automatically.
echo   Keep THIS window open while you work.
echo   Close it (or press Ctrl+C) to stop the automation.
echo ============================================================
echo.

REM Open the dashboard a couple seconds after the server starts.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & explorer http://localhost:8787"

node serve.js

echo.
echo (Server stopped.)
pause
