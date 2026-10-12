@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 生成牌面
echo.
echo   把照片放进 assets\raw\ ，然后运行本工具重新生成牌面。
echo.
python tools\make_cards.py
echo.
pause
