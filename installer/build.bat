@echo off
chcp 65001 >nul
echo ========================================
echo   一叶轻舟工作室 — 安装包构建脚本
echo ========================================
echo.

set "PROJECT_DIR=%~dp0.."
set "STAGING_DIR=%~dp0staging"
set "RELEASE_DIR=%PROJECT_DIR%\release"

echo [1/7] 清理旧的构建文件...
if exist "%STAGING_DIR%" rmdir /s /q "%STAGING_DIR%"
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
mkdir "%STAGING_DIR%"

echo [2/7] 编译前端...
cd /d "%PROJECT_DIR%"
call npx vite build
if %ERRORLEVEL% neq 0 (
    echo 前端编译失败！
    exit /b 1
)

echo [3/7] 编译服务端...
call npx tsc -p tsconfig.server.json
if %ERRORLEVEL% neq 0 (
    echo 服务端编译失败！
    exit /b 1
)

echo [4/7] 复制文件到暂存区...

REM 核心文件
copy "%PROJECT_DIR%\package.json" "%STAGING_DIR%\" >nul

REM 编译后的代码
xcopy "%PROJECT_DIR%\dist-server" "%STAGING_DIR%\dist-server\" /E /I /Q >nul

REM 前端文件
xcopy "%PROJECT_DIR%\dist" "%STAGING_DIR%\dist\" /E /I /Q >nul

REM 模板
xcopy "%PROJECT_DIR%\templates" "%STAGING_DIR%\templates\" /E /I /Q >nul

REM NW.js 运行时（原生窗口）
xcopy "%PROJECT_DIR%\node_modules\nw\nwjs-v0.114.0-win-x64" "%STAGING_DIR%\nwjs\" /E /I /Q >nul

REM NW.js 启动画面
xcopy "%PROJECT_DIR%\nw-app" "%STAGING_DIR%\nw-app\" /E /I /Q >nul

REM 图标
mkdir "%STAGING_DIR%\build" 2>nul
copy "%PROJECT_DIR%\build\icon.png" "%STAGING_DIR%\build\" >nul 2>nul

echo [5/7] 安装生产依赖...
cd /d "%STAGING_DIR%"
call npm install --omit=dev --no-audit --no-fund --prefer-offline
if %ERRORLEVEL% neq 0 (
    echo 依赖安装失败！
    exit /b 1
)

echo [6/7] 清理 NW.js 开发文件（减小体积）...
REM 删除 NW.js SDK 中不需要的文件以减小安装包
if exist "%STAGING_DIR%\nwjs\credits.html" del "%STAGING_DIR%\nwjs\credits.html" >nul 2>nul
if exist "%STAGING_DIR%\nwjs\notification_helper.exe" del "%STAGING_DIR%\nwjs\notification_helper.exe" >nul 2>nul

echo [7/7] 构建 NSIS 安装包...
cd /d "%PROJECT_DIR%\installer"
makensis setup.nsi
if %ERRORLEVEL% neq 0 (
    echo NSIS 构建失败！
    exit /b 1
)

echo.
echo ========================================
echo   构建完成！
echo   安装包: %RELEASE_DIR%\YiYeQingZhouStudio-Setup-1.0.0.exe
echo ========================================
pause
