# Ensure script runs from project root
Set-Location $PSScriptRoot

$containerName = "sqlserver-dev"

Write-Host "==============================="
Write-Host " Starting GlucoBuddy Dev Stack "
Write-Host "==============================="

# --- Start Database ---
Write-Host "`n[1/4] Starting SQL Server container..."

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
Write-Host "`n[2/4] Starting backend server..."

Start-Process powershell -WindowStyle Minimized -ArgumentList @"
cd glucobuddy-backend
node server.js
"@

Write-Host "Backend started"

Start-Sleep -Seconds 1

# --- Start Frontend ---
Write-Host "`n[3/4] Starting frontend..."

Start-Process powershell -WindowStyle Minimized -ArgumentList @"
cd glucobuddy-frontend
npm run dev -- --host
"@

Write-Host "Frontend started"

# --- Start ngrok route ---
Write-Host "`n[4/4 Starting ngrok route...]"
Start-Process powershell -WindowStyle Minimized -ArgumentList @"
ngrok http 5173
"@

# --- Optional: open browser ---
Start-Sleep -Seconds 2
Start-Process "https://shrimp-irate-crouton.ngrok-free.dev"

Write-Host "`n All services started successfully!"