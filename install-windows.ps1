# Remote Agent Windows Installer
# Run as Administrator

param(
    [string]$ServerUrl = "wss://42409defeb6f.ngrok-free.app",
    [string]$AgentId = ""
)

Write-Host "=== Remote Agent Windows Installer ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Configuration
$installDir = "C:\Program Files\RemoteAgent"
$configDir = "C:\ProgramData\RemoteAgent"
$serviceName = "RemoteAgent"

Write-Host "Installing Remote Agent..." -ForegroundColor Green
Write-Host "Install Directory: $installDir"
Write-Host "Config Directory: $configDir"
Write-Host ""

# Create directories
Write-Host "Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

# Copy agent binary (assumes agent-windows.exe is in same directory as script)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceBinary = Join-Path $scriptDir "agent-windows.exe"

if (Test-Path $sourceBinary) {
    Write-Host "Copying agent binary..." -ForegroundColor Yellow
    Copy-Item $sourceBinary -Destination "$installDir\remote-agent.exe" -Force
} else {
    Write-Host "ERROR: agent-windows.exe not found in $scriptDir" -ForegroundColor Red
    exit 1
}

# Create config file
Write-Host "Creating configuration..." -ForegroundColor Yellow
$config = @{
    serverUrl = $ServerUrl
    agentId = $AgentId
} | ConvertTo-Json

$config | Out-File -FilePath "$configDir\config.json" -Encoding UTF8

# Create Windows Service wrapper script
$serviceScript = @"
# Service Wrapper for Remote Agent
Set-Location '$installDir'
& '.\remote-agent.exe'
"@

$serviceScript | Out-File -FilePath "$installDir\service.ps1" -Encoding UTF8

# Install as Windows Service using NSSM (if available) or sc.exe
Write-Host "Setting up Windows Service..." -ForegroundColor Yellow

# Try to create service with sc.exe (fallback)
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existingService) {
    Write-Host "Service already exists. Stopping and removing..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
    Start-Sleep -Seconds 2
}

# Note: For production, use NSSM (Non-Sucking Service Manager) for better service management
Write-Host ""
Write-Host "=== Installation Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Agent installed to: $installDir\remote-agent.exe" -ForegroundColor Cyan
Write-Host "Config file: $configDir\config.json" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run the agent manually:" -ForegroundColor Yellow
Write-Host "  cd '$installDir'" -ForegroundColor White
Write-Host "  .\remote-agent.exe" -ForegroundColor White
Write-Host ""
Write-Host "To run as service, install NSSM:" -ForegroundColor Yellow
Write-Host "  1. Download NSSM from https://nssm.cc/download" -ForegroundColor White
Write-Host "  2. Run: nssm install $serviceName '$installDir\remote-agent.exe'" -ForegroundColor White
Write-Host "  3. Run: nssm start $serviceName" -ForegroundColor White
Write-Host ""
Write-Host "Server URL: $ServerUrl" -ForegroundColor Cyan
Write-Host ""
