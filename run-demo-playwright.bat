@echo off
setlocal EnableExtensions
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" & exit /b)

cd /d "%~dp0"
echo ============================================
echo  On-Chain Risk Council - Playwright OBS demo
echo ============================================
echo.
echo 1) Start OBS now (capture Display or Window: Chrome)
echo 2) This will: start Next.js in WSL, open Windows Chrome,
echo    auto-click 4 council scenarios + benchmark + health
echo 3) Keep Chrome visible. Do not click the page while it runs.
echo.
echo UAC/Admin is required once for CDP portproxy (WSL -^> Windows Chrome).
echo.

REM Prefer this folder if it is already the WSL-mounted Desktop copy.
set "WSL_DIR=/mnt/c/Users/yusif/Desktop/projects/githubbounty/01-solana-agents-skills/qwen-risk-council"
if exist "%~dp0package.json" (
  for /f "delims=" %%I in ('wsl.exe wslpath -a "%~dp0." 2^>nul') do set "WSL_DIR=%%I"
)

echo Project (WSL path): %WSL_DIR%
echo.

wsl.exe bash -lc "set -euo pipefail; cd '%WSL_DIR%'; if [ ! -d node_modules ]; then echo 'npm install...'; npm install; fi; rm -f /tmp/qwen-risk-council-demo.log /tmp/qwen-risk-council-demo.pid; WSL_IP=$(hostname -I | awk '{print $1}'); echo WSL_IP=$WSL_IP; (npm run dev -- -H 0.0.0.0 -p 3000 > /tmp/qwen-risk-council-demo.log 2>&1 & echo $! > /tmp/qwen-risk-council-demo.pid); echo Waiting for Next.js...; for i in $(seq 1 40); do curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 1; done; echo Starting Playwright (Windows Chrome headed)...; DEMO_BASE_URL=\"http://$WSL_IP:3000\" DEMO_KEEP_OPEN=1 DEMO_SLOWMO=700 npm run demo:playwright; STATUS=$?; kill $(cat /tmp/qwen-risk-council-demo.pid 2>/dev/null) 2>/dev/null || true; exit $STATUS"

echo.
echo Playwright demo finished. Press any key to close.
pause >nul
