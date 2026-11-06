@echo off
chcp 65001 >nul
title Poke Office 설치
cd /d "%~dp0"
where node >nul 2>nul || (echo [Poke Office] Node.js가 필요해요. https://nodejs.org 에서 설치한 뒤 다시 실행하세요. & pause & exit /b 1)
call npm run install:all || (echo [Poke Office] 설치 중 문제가 생겼어요. 위 메시지를 확인하세요. & pause & exit /b 1)
echo.
echo [Poke Office] 설치 완료! 이제 바탕화면의 Poke Office 아이콘으로 켜면 돼요.
echo [Poke Office] Claude Code가 이미 열려 있다면 새로 실행해야 연결돼요.
echo.
call "%~dp0scripts\start.cmd"
