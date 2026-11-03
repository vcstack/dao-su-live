@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dao Su LIVE

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Chua cai Node.js.
  echo  Hay tai va cai: https://nodejs.org
  echo  Chon ban LTS, cai xong mo lai chay.bat.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Dang cai dat lan dau, vui long doi...
  call npm install
  if errorlevel 1 (
    echo Cai dat that bai. Kiem tra mang roi thu lai.
    pause
    exit /b 1
  )
)

echo Mo trinh duyet sau 2 giay...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
echo Dang chay Dao Su LIVE. Dong cua so nay de tat.
node server.js
echo.
pause
