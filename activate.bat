@echo off
chcp 65001 >nul
title 激活 ClawChat Bridge Agent

cd /d "%~dp0"

if "%~1"=="" (
    echo ========================================
    echo   激活 ClawChat Bridge Agent
    echo ========================================
    echo.
    echo 用法:
    echo   activate.bat YOUR_INVITE_CODE              [默认实例]
    echo   activate.bat trae YOUR_INVITE_CODE         [TRAE 实例]
    echo   activate.bat workbuddy YOUR_INVITE_CODE    [WorkBuddy 实例]
    echo   activate.bat myinstance YOUR_INVITE_CODE   [自定义实例]
    echo.
    set /p "choice=请输入激活码: "
    if "!choice!"=="" exit /b 1
    call npm run activate !choice!
    goto :eof
)

if /i "%~1"=="trae" (
    echo [INFO] 激活 TRAE 实例...
    call npm run activate:trae -- %~2
    goto :eof
)

if /i "%~1"=="workbuddy" (
    echo [INFO] 激活 WorkBuddy 实例...
    call npm run activate:workbuddy -- %~2
    goto :eof
)

echo [INFO] 激活实例: %~1
set BRIDGE_ENV=%~1
call npm run activate -- %~2
