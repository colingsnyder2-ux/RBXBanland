@echo off
rem One-click RBXBanland: starts the server (port 8090), opens it in your browser,
rem and optionally starts a Cloudflare https tunnel so phones and friends can play.
title RBXBanland
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)

netstat -ano | findstr /r /c:":8090 .*LISTENING" >nul
if errorlevel 1 (
  start "RBXBanland server" cmd /k node server\server.mjs 8090
  timeout /t 3 /nobreak >nul
) else (
  echo The RBXBanland server is already running on port 8090.
)

for /f "usebackq delims=" %%t in (`node -e "try{console.log(require('./server/config.json').accessToken)}catch{}"`) do set RBX_TOKEN=%%t
start "" "http://localhost:8090/?key=%RBX_TOKEN%"

echo.
choice /c YN /t 10 /d N /m "Also start an internet tunnel for phones and friends (needs cloudflared)"
if errorlevel 2 goto done
start "RBXBanland tunnel" cmd /k node server\tunnel.mjs 8090

:done
echo.
echo RBXBanland is running. Close the "RBXBanland server" window to stop it.
timeout /t 5 >nul
