# Install "Pipeline Status Cleanup" as a real desktop app.
# Creates Desktop + Start Menu shortcuts that open the app in its own window
# (Electron) — no terminal, no browser tab.
#
# Run once:
#     powershell -ExecutionPolicy Bypass -File .\Install-App.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

# Ensure dependencies (Electron + Playwright) are installed.
$electronExe = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electronExe)) {
  Write-Host "Installing dependencies (first time only, may take a few minutes)..."
  & npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed. Install Node.js from https://nodejs.org and retry." }
}
if (-not (Test-Path $electronExe)) { throw "Electron did not install. Run 'npm install' manually and retry." }

$name      = 'Pipeline Status Cleanup'
$desktop   = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @($desktop, $startMenu)) {
  if (-not (Test-Path $dir)) { continue }
  $lnkPath = Join-Path $dir ($name + '.lnk')
  $lnk = $sh.CreateShortcut($lnkPath)
  $lnk.TargetPath       = $electronExe   # launches the Electron app directly (no console window)
  $lnk.Arguments        = '"' + $root + '"'
  $lnk.WorkingDirectory = $root
  $ico = Join-Path $root 'assets\icon.ico'
  if (Test-Path $ico) { $lnk.IconLocation = $ico } else { $lnk.IconLocation = "$env:SystemRoot\System32\imageres.dll,109" }
  $lnk.Description       = 'REI BlackBook Pipeline Status Cleanup'
  $lnk.Save()
  Write-Host ("Created: " + $lnkPath)
}

Write-Host ""
Write-Host "Installed. Launch '$name' from your Desktop or Start Menu."
Write-Host "It opens as its own app window (no terminal, no browser tab)."
