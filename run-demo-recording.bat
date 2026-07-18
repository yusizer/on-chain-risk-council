@echo off
setlocal
cd /d "%~dp0"
echo On-Chain Risk Council Playwright judge demo
echo.
echo This starts the local app and opens a real browser.
echo Playwright will click presets, submit council reviews, wait for results, and show benchmark/health.
echo Start your screen recorder now, then keep the browser visible.
echo.
wsl.exe bash -lc "cd '/mnt/c/Users/yusif/Desktop/projects/githubbounty/01-solana-agents-skills/qwen-risk-council' && rm -f /tmp/qwen-risk-council-demo.log /tmp/qwen-risk-council-demo.pid && (npm run dev > /tmp/qwen-risk-council-demo.log 2>&1 & echo $! > /tmp/qwen-risk-council-demo.pid) && sleep 12 && DEMO_USE_WINDOWS_CHROME=1 DEMO_BASE_URL='http://localhost:3000' npm run demo:playwright; kill $(cat /tmp/qwen-risk-council-demo.pid 2>/dev/null) 2>/dev/null || true"
echo.
echo Demo bot finished. Press any key to close this window.
pause >nul
