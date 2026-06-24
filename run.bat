@echo off
setlocal EnableDelayedExpansion
title Playlists Randomizer
cd /d "%~dp0"

echo ============================================
echo  Playlists Randomizer - Setup and Run
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Install from https://nodejs.org/ then re-run this script.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js !NODE_VER!

:: Create .env from example if missing
if not exist ".env" (
    echo [SETUP] Creating .env from .env.example...
    copy /Y ".env.example" ".env" >nul
)

:: Install dependencies
if not exist "node_modules\" (
    echo [SETUP] Installing npm dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [OK] node_modules present
)

:: Run tests
echo.
echo [TEST] Running unit tests...
call npm test
if errorlevel 1 (
    echo [WARN] Tests failed - continuing to dev server anyway
)

echo.
echo [RUN] Starting dev server...
echo Open http://localhost:5173/Playlists-Randomizer/ in your browser
echo Press Ctrl+C to stop
echo.

call npm run dev

echo.
echo Server stopped.
pause
