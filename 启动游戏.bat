@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动游戏.ps1"
echo.
echo 按任意键关闭启动窗口，游戏服务会继续在后台运行。
pause >nul
