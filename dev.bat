@echo off
setlocal

echo [SignalPad] Starting dev...
echo.

npm run tauri dev
if %ERRORLEVEL% neq 0 (
    echo.
    echo [SignalPad] Dev FAILED. Check errors above.
    pause
    exit /b %ERRORLEVEL%
)
