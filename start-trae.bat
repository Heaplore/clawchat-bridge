@echo off
chcp 65001 >nul
title ClawChat Bridge - TRAE Instance

echo ========================================
echo   ClawChat Bridge - TRAE Agent
echo ========================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [ERROR] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
)

if not exist ".env.trae" (
    echo [ERROR] 未找到 .env.trae 配置文件！
    echo.
    echo 请先执行以下步骤：
    echo   1. 复制 .env.trae.example 为 .env.trae
    echo   2. 运行: npm run activate:trae -- YOUR_INVITE_CODE
    echo   3. 将激活输出的凭据填入 .env.trae
    echo.
    pause
    exit /b 1
)

if not exist "dist" (
    echo [INFO] 首次运行，正在构建项目...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] 构建失败
        pause
        exit /b 1
    )
)

echo [INFO] 启动 TRAE Bridge 实例...
echo.
call npm run start:trae

if errorlevel 1 (
    echo.
    echo [ERROR] 启动失败，错误代码: %errorlevel%
    pause
)
