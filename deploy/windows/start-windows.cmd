@echo off
setlocal

cd /d "%~dp0"

if exist ".env.cmd" (
  call ".env.cmd"
)

if "%PORT%"=="" set "PORT=3000"
if "%HOSTNAME%"=="" set "HOSTNAME=0.0.0.0"

echo Starting QualityCheck AI...
echo URL: http://%HOSTNAME%:%PORT%
echo.

node server.js
