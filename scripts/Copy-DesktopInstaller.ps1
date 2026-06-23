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
$sourcePath = [IO.Path]::GetFullPath($source)
$destinationPath = [IO.Path]::GetFullPath($destination)

if (-not (Test-Path -LiteralPath $source)) {
    if (Test-Path -LiteralPath $destination) {
        Get-ChildItem -LiteralPath $bundleDir -Filter "Alfaraheedi*setup.exe" |
            Where-Object { [IO.Path]::GetFullPath($_.FullName) -ne $destinationPath } |
            Remove-Item -Force
        Write-Host "Desktop installer already available at $destination"
        return
    }

    throw "Tauri installer was not found at $source"
}

Get-ChildItem -LiteralPath $bundleDir -Filter "Alfaraheedi*setup.exe" |
    Where-Object {
        $path = [IO.Path]::GetFullPath($_.FullName)
        $path -ne $sourcePath -and $path -ne $destinationPath
    } |
    Remove-Item -Force

if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Force
}

Move-Item -LiteralPath $source -Destination $destination -Force
Write-Host "Desktop installer moved to $destination"
