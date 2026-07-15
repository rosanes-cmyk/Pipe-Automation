# Build the shareable Windows installer (.exe) that teammates can download and run.
# Produces:  dist\Pipeline Status Cleanup Setup <version>.exe
#
# Run on a Windows PC that has Node.js installed:
#     powershell -ExecutionPolicy Bypass -File .\Build-Installer.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

Write-Host "Installing dependencies (Electron, builder, Playwright)..."
& npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed. Install Node.js from https://nodejs.org and retry." }

Write-Host "Building the installer (this downloads build tools the first time)..."
& npm run dist
if ($LASTEXITCODE -ne 0) { throw "Build failed. See the messages above." }

Write-Host ""
Write-Host "Done. Your installer is in the 'dist' folder:"
Get-ChildItem -Path (Join-Path $root 'dist') -Filter '*Setup*.exe' -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host ("   " + $_.FullName) }
Write-Host ""
Write-Host "Upload THAT 'Setup .exe' for teammates to download and run."
Write-Host "Do NOT share electron.exe by itself - it needs its bundled files."
