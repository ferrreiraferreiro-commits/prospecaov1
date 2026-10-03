@echo off
chcp 65001 >nul
title Motor XS - XS Prospecção
cd /d "%~dp0motor"
where node >/dev/null 2>nul
if errorlevel 1 (
  echo.
  echo   O Node.js nao foi encontrado. Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo.
  echo   Primeira vez: instalando o Motor XS. Isso leva alguns minutos...
  echo.
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo   Falha ao instalar. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)
call npm start
pause
