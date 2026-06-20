param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([string]::IsNullOrWhiteSpace($Version)) {
    $tauriConfigPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
    $tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
    $Version = [string]$tauriConfig.version
}

$bundleDir = Join-Path $repoRoot "target\release\bundle\nsis"
$source = Join-Path $bundleDir "Alfaraheedi_$($Version)_x64-setup.exe"
$destination = Join-Path $bundleDir "Alfaraheedi-$Version-windows-x64-setup.exe"

if (-not (Test-Path -LiteralPath $source)) {
    throw "Tauri installer was not found at $source"
}

Copy-Item -LiteralPath $source -Destination $destination -Force
Write-Host "Desktop installer copied to $destination"
