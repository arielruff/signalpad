@echo off
setlocal

echo [SignalPad] Building release...
echo.

npm run tauri build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [SignalPad] Build FAILED. Check errors above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [SignalPad] Build complete.
echo Output: src-tauri\target\release\bundle\nsis\
echo.

set "OUT=src-tauri\target\release\bundle\nsis"
if exist "%OUT%" (
    explorer "%~dp0%OUT%"
)

pause
