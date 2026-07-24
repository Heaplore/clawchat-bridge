@echo off
chcp 65001 >nul
title ClawChat Bridge - Default Instance

echo ========================================
echo   ClawChat Bridge (默认实例)
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

if not exist ".env" (
    echo [ERROR] 未找到 .env 配置文件！
    echo.
    echo 请先执行以下步骤：
    echo   1. 复制 .env.example 为 .env
    echo   2. 运行: npm run activate YOUR_INVITE_CODE
    echo   3. 将激活输出的凭据填入 .env
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

echo [INFO] 启动 Bridge...
echo.
call npm start

if errorlevel 1 (
    echo.
    echo [ERROR] 启动失败，错误代码: %errorlevel%
    pause
)
