@echo off
setlocal
cd /d "%~dp0"
echo On-Chain Risk Council demo recording bot - DRY RUN
echo.
echo This does not call Qwen or Helius.
echo.
wsl.exe bash -lc "cd '/mnt/c/Users/yusif/Desktop/projects/githubbounty/01-solana-agents-skills/qwen-risk-council' && DEMO_DRY_RUN=1 DEMO_LOCAL=1 npm run demo:record"
echo.
echo Dry run finished. Press any key to close this window.
pause >nul
