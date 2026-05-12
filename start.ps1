$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (!(Test-Path ".venv")) {
    python -m venv .venv
}

$Python = Join-Path $Root ".venv\Scripts\python.exe"

& $Python -m pip install --upgrade pip
& $Python -m pip install -r requirements.txt

if (!(Test-Path "frontend\node_modules")) {
    Push-Location "frontend"
    npm install
    Pop-Location
}

$FrontendPort = 5173
while (Get-NetTCPConnection -LocalPort $FrontendPort -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }) {
    $FrontendPort += 1
}

$ApiPort = 8000
while (Get-NetTCPConnection -LocalPort $ApiPort -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }) {
    $ApiPort += 1
}

Write-Host ""
Write-Host "WaferGuard 실행 중"
Write-Host "Dashboard: http://127.0.0.1:$FrontendPort"
Write-Host "API docs : http://127.0.0.1:$ApiPort/docs"
Write-Host "중지하려면 이 창에서 Ctrl+C를 누르세요."
Write-Host ""

$backend = Start-Job -Name "waferguard-api" -ScriptBlock {
    param($Root, $Python, $ApiPort)
    Set-Location $Root
    & $Python -m uvicorn app.main:app --host 127.0.0.1 --port $ApiPort
} -ArgumentList $Root, $Python, $ApiPort

$frontend = Start-Job -Name "waferguard-ui" -ScriptBlock {
    param($Root, $FrontendPort, $ApiPort)
    Set-Location (Join-Path $Root "frontend")
    $env:VITE_API_BASE_URL = "http://127.0.0.1:$ApiPort"
    npm run dev -- --host 127.0.0.1 --port $FrontendPort
} -ArgumentList $Root, $FrontendPort, $ApiPort

try {
    while ($true) {
        Receive-Job $backend, $frontend -Keep
        Start-Sleep -Seconds 2
    }
}
finally {
    Stop-Job $backend, $frontend -ErrorAction SilentlyContinue
    Remove-Job $backend, $frontend -ErrorAction SilentlyContinue
}
