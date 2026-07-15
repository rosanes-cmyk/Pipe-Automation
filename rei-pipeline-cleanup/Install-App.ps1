# Install "Pipeline Status Cleanup" as an app: creates Desktop + Start Menu
# shortcuts that launch the dashboard. Run once:
#     powershell -ExecutionPolicy Bypass -File .\Install-App.ps1
$ErrorActionPreference = 'Stop'

$root   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$target = Join-Path $root 'Pipeline-Cleanup.cmd'
if (-not (Test-Path $target)) { throw "Pipeline-Cleanup.cmd not found next to this script." }

$name = 'Pipeline Status Cleanup'
$desktop   = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @($desktop, $startMenu)) {
  if (-not (Test-Path $dir)) { continue }
  $lnkPath = Join-Path $dir ($name + '.lnk')
  $lnk = $sh.CreateShortcut($lnkPath)
  $lnk.TargetPath       = $env:ComSpec           # cmd.exe
  $lnk.Arguments        = '/c "' + $target + '"'
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation     = "$env:SystemRoot\System32\imageres.dll,109"  # a checklist-style icon
  $lnk.Description       = 'REI BlackBook Pipeline Status Cleanup dashboard'
  $lnk.WindowStyle      = 1
  $lnk.Save()
  Write-Host ("Created shortcut: " + $lnkPath)
}

Write-Host ""
Write-Host "Done. Look for '$name' on your Desktop and in the Start Menu."
Write-Host "Double-click it to launch the dashboard (it opens in your browser)."
