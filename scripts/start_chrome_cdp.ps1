param(
  [Parameter(Mandatory = $true)]
  [int]$Port
)

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profile = Join-Path $env:TEMP ("qwen-risk-council-playwright-" + [DateTimeOffset]::Now.ToUnixTimeMilliseconds())

Start-Process -FilePath $chrome -ArgumentList @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile",
  "--start-maximized",
  "--new-window",
  "about:blank"
)

# Chrome binds the DevTools CDP to Windows loopback (127.0.0.1) only.
# WSL2 cannot reach Windows loopback directly, so forward the port from all
# interfaces to 127.0.0.1. This lets the WSL-side Playwright connectOverCDP.
$ok = $false
try {
  netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$Port connectaddress=127.0.0.1 connectport=$Port
  netsh advfirewall firewall add rule name="qwen-risk-council-cdp-$Port" dir=in action=allow protocol=TCP localport=$Port
  $ok = $true
} catch {
  Write-Warning "netsh portproxy failed (need Administrator): $_"
}
if (-not $ok) {
  # Retry elevated (UAC prompt may appear).
  Start-Process -FilePath "netsh.exe" -Verb RunAs -Wait -ArgumentList @(
    "interface","portproxy","add","v4tov4","listenaddress=0.0.0.0","listenport=$Port","connectaddress=127.0.0.1","connectport=$Port"
  )
  Start-Process -FilePath "netsh.exe" -Verb RunAs -Wait -ArgumentList @(
    "advfirewall","firewall","add","rule","name=qwen-risk-council-cdp-$Port","dir=in","action=allow","protocol=TCP","localport=$Port"
  )
}

Write-Output $profile
