# Ensure script runs from project root
Set-Location $PSScriptRoot

$containerName = "sqlserver-dev"

Write-Host "==============================="
Write-Host " Starting GlucoBuddy Dev Stack "
Write-Host "==============================="

# --- Start Database ---
Write-Host "`n[1/3] Starting SQL Server container..."

$running = docker ps --filter "name=$containerName" --format "{{.Names}}"

if ($running -eq $containerName) {
    Write-Host "Database already running"
} else {
    docker start $containerName | Out-Null
    Write-Host "Database container started"
}

# Wait for SQL Server to initialise
Write-Host "Waiting for SQL Server to initialise..."
Start-Sleep -Seconds 8

# --- Start Backend ---
Write-Host "`n[2/3] Starting backend server..."

Start-Process powershell -WindowStyle Minimized -ArgumentList @"
cd glucobuddy-backend
node server.js
pause
"@

Write-Host "Backend started"

Start-Sleep -Seconds 1

# --- Start Frontend ---
Write-Host "`n[3/3] Starting frontend..."

Start-Process powershell -WindowStyle Minimized -ArgumentList @"
cd glucobuddy-frontend
npm run dev -- --host
pause
"@

Write-Host "Frontend started"

# --- Optional: open browser ---
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"

Write-Host "`n All services started successfully!"