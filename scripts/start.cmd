@echo off
chcp 65001 >nul
title Poke Office
cd /d "%~dp0.."
set "URL=http://127.0.0.1:4321"

rem 이미 켜져 있으면 브라우저만 열기
curl -s -o nul "%URL%" && (start "" "%URL%" & exit /b 0)

echo [Poke Office] 업데이트 확인 중...
for /f %%h in ('git rev-parse HEAD') do set "OLD=%%h"
git pull --ff-only --quiet
if errorlevel 1 (
  echo [Poke Office] 업데이트를 건너뛰었어요. 인터넷 연결이나 수정 중인 파일을 확인하세요.
) else (
  for /f %%h in ('git rev-parse HEAD') do if not "%%h"=="%OLD%" echo [Poke Office] 새 버전으로 업데이트했어요.
)

rem 처음이거나 package.json이 바뀌었으면 설치 다시 실행
set "NEED="
if not exist vendor set "NEED=1"
for /f %%f in ('git diff --name-only %OLD% HEAD -- package.json') do set "NEED=1"
if defined NEED (
  echo [Poke Office] 설치 중...
  call npm install
)

echo [Poke Office] 서버 시작 - 이 창을 닫으면 꺼져요.
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" %URL%"
call npm start
pause
