param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([string]::IsNullOrWhiteSpace($Version)) {
    $tauriConfigPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
    $tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
    $Version = [string]$tauriConfig.version
}

$bundleDir = Join-Path $repoRoot "target\release\bundle\nsis"
$expectedName = "Nahou-$Version-windows-x64-setup.exe"
$expectedPath = Join-Path $bundleDir $expectedName

if (-not (Test-Path -LiteralPath $bundleDir -PathType Container)) {
    throw "Desktop installer bundle directory was not found at $bundleDir"
}

$setupInstallers = @(
    Get-ChildItem -LiteralPath $bundleDir -Filter "Nahou*setup.exe" -File |
        Select-Object -ExpandProperty Name
)

if ($setupInstallers.Count -ne 1 -or $setupInstallers[0] -ne $expectedName) {
    throw "Expected exactly one desktop setup installer named $expectedName; found: $($setupInstallers -join ', ')"
}

if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) {
    throw "Expected desktop installer was not found at $expectedPath"
}

$installer = Get-Item -LiteralPath $expectedPath
$hash = Get-FileHash -LiteralPath $expectedPath -Algorithm SHA256

[pscustomobject]@{
    Version = $Version
    BundleDir = [string]$bundleDir
    Installer = [string]$expectedPath
    Length = $installer.Length
    Sha256 = $hash.Hash
} | ConvertTo-Json
