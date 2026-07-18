@echo off
REM ============================================================
REM  On-Chain Risk Council - DEMO.HEADLESS (headless Chromium + recordVideo)
REM  Записывает видео САМА через Playwright. OBS не нужен.
REM  1) Стартует npm run dev в WSL (если ещё не запущен)
REM  2) Стартует headless Chromium через Playwright
REM  3) Кликает 4 пресета + benchmark + health
REM  4) Сохраняет demo-<timestamp>.webm в qwen-risk-council\demo-videos\
REM ============================================================

setlocal
cd /d "%~dp0"

echo ============================================
echo  On-Chain Risk Council - auto demo (headless)
echo ============================================
echo.
echo  Zapuskayu Next.js v WSL (esli esche ne zapushchen)...
echo  Potom headless Chromium sam zapishet video.
echo  Rezultat: %~dp0demo-videos\demo-<timestamp>.webm
echo.

set "WSL_DIR=/mnt/c/Users/yusif/Desktop/projects/githubbounty/01-solana-agents-skills/qwen-risk-council"
if exist "%~dp0package.json" (
  for /f "delims=" %%I in ('wsl.exe wslpath -a "%~dp0." 2^>nul') do set "WSL_DIR=%%I"
)

wsl.exe bash -lc "set -euo pipefail; cd '%WSL_DIR%'; if ! curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then echo 'Starting Next.js...'; rm -f /tmp/qwen-demo.log; (npm run dev -- -H 0.0.0.0 -p 3000 > /tmp/qwen-demo.log 2>&1 &); for i in $(seq 1 40); do curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 1; done; fi; mkdir -p demo-videos; echo 'Starting headless demo...'; DEMO_BASE_URL=http://127.0.0.1:3000 DEMO_SLOWMO_MS=700 npm run demo"

echo.
echo Gotovo. Press any key to close.
pause >nul