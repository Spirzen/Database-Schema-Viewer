# Database Schema Viewer — launch backend + frontend
$Root = $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "sample\demo.db")) {
    Write-Host "Creating demo database..."
    python "$Root\sample\create_demo_db.py"
}

$backendDir = Join-Path $Root "backend"
$frontendDir = Join-Path $Root "frontend"

if (-not (Test-Path (Join-Path $backendDir ".venv"))) {
    Write-Host "Creating Python venv..."
    python -m venv (Join-Path $backendDir ".venv")
    & (Join-Path $backendDir ".venv\Scripts\pip.exe") install -r (Join-Path $backendDir "requirements.txt")
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing npm packages..."
    Set-Location $frontendDir
    npm install
    Set-Location $Root
}

$env:DSV_PORT = if ($env:DSV_PORT) { $env:DSV_PORT } else { "18765" }
Write-Host "Starting backend on http://127.0.0.1:$env:DSV_PORT"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; .\.venv\Scripts\Activate.ps1; python main.py"

Start-Sleep -Seconds 2

Write-Host "Starting frontend on http://localhost:5173"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; npm run dev"

Write-Host ""
Write-Host "Open http://localhost:5173 in your browser"
Write-Host "Click 'Demo SQLite' to load the sample schema."
