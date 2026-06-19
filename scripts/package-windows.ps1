param(
    [string]$Version = "0.2.0",
    [switch]$SkipFrontendInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendRoot = Join-Path $repoRoot "frontend"
$distRoot = Join-Path $repoRoot "dist"
$packageName = "alfaraheedi-v$Version-windows-x64"
$packageRoot = Join-Path $distRoot $packageName
$zipPath = Join-Path $distRoot "$packageName.zip"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Remove-UnderDist {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $resolvedDist = (Resolve-Path -LiteralPath $distRoot).Path
    if (-not $resolvedPath.StartsWith($resolvedDist, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to delete path outside dist: $resolvedPath"
    }

    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

Require-Command "cargo"
Require-Command "npm"

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
Remove-UnderDist -Path $packageRoot
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

if (-not $SkipFrontendInstall) {
    Push-Location $frontendRoot
    try {
        npm ci
    }
    finally {
        Pop-Location
    }
}

Push-Location $frontendRoot
try {
    npm run build
}
finally {
    Pop-Location
}

Push-Location $repoRoot
try {
    cargo build --release -p write-cli -p write-api
}
finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "web") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "docs") | Out-Null

Copy-Item -LiteralPath (Join-Path $repoRoot "target\release\writecheck.exe") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $repoRoot "target\release\write-api.exe") -Destination $packageRoot
Copy-Item -Path (Join-Path $frontendRoot "dist\*") -Destination (Join-Path $packageRoot "web") -Recurse
Copy-Item -LiteralPath (Join-Path $repoRoot "README.md") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $repoRoot "CHANGELOG.md") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $repoRoot "LICENSE-MIT") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $repoRoot "LICENSE-APACHE") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $repoRoot "PRIVACY.md") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $repoRoot "docs\local-llm.md") -Destination (Join-Path $packageRoot "docs")

$launcher = @'
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$addr = "127.0.0.1:3000"
$url = "http://$addr"

Write-Host "Starting Alfaraheedi at $url"
Write-Host "Press Ctrl+C to stop."
Start-Process $url | Out-Null
& (Join-Path $root "writecheck.exe") serve --addr $addr --frontend-dir (Join-Path $root "web")
'@

Set-Content -LiteralPath (Join-Path $packageRoot "Start-Alfaraheedi.ps1") -Value $launcher -Encoding UTF8

Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -Force

Write-Host "Created $zipPath"
