@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 照片消消乐
echo.
echo   正在启动本地服务器...
echo.
python -m http.server 8100
pause
