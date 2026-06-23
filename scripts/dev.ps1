param(
    [int]$ApiPort = 3000,
    [int]$WebPort = 5173,
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendRoot = Join-Path $repoRoot "frontend"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

Require-Command "cargo"
Require-Command "npm"

if (-not $SkipNpmInstall -and -not (Test-Path -LiteralPath (Join-Path $frontendRoot "node_modules"))) {
    Push-Location $frontendRoot
    try {
        npm ci
    }
    finally {
        Pop-Location
    }
}

$apiAddr = "127.0.0.1:$ApiPort"
$apiBaseUrl = "http://$apiAddr"

Write-Host "Starting Nahou API at $apiBaseUrl"
$backend = Start-Process `
    -FilePath "cargo" `
    -ArgumentList @("run", "-p", "write-cli", "--", "serve", "--addr", $apiAddr) `
    -WorkingDirectory $repoRoot `
    -PassThru `
    -WindowStyle Hidden

try {
    $env:VITE_ALFARAHEEDI_API_BASE_URL = $apiBaseUrl
    Push-Location $frontendRoot
    try {
        npm run dev -- --host 127.0.0.1 --port $WebPort
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($backend -and -not $backend.HasExited) {
        Write-Host "Stopping Nahou API process $($backend.Id)"
        Stop-Process -Id $backend.Id -Force
        $backend.WaitForExit()
    }
}
