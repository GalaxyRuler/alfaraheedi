param(
    [string]$ExtensionRoot = "browser-extension",
    [string]$OutDir = "dist\browser-extension",
    [string]$PackageName
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionPath = Resolve-Path (Resolve-RepoPath $ExtensionRoot)
$manifestPath = Join-Path $extensionPath "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if (-not $PackageName) {
    $PackageName = "nahou-browser-extension-$($manifest.version)"
}

$outPath = Resolve-RepoPath $OutDir
$runId = [System.Guid]::NewGuid().ToString("N")
$stageRoot = Join-Path $RepoRoot "target\browser-extension-package\$PackageName.$runId"
$zipPath = Join-Path $outPath "$PackageName.zip"
$tempZipPath = Join-Path $outPath "$PackageName.tmp.$PID.zip"
$backupZipPath = Join-Path $outPath "$PackageName.previous.$PID.zip"
$packageMutexName = "NahouBrowserExtensionPackage-" + ($PackageName -replace '[^A-Za-z0-9_.-]', '_')

$entriesJson = node (Join-Path $extensionPath "tools\package-extension.mjs") $extensionPath
$entries = [string[]]($entriesJson | ConvertFrom-Json)
$stagingRootRemoved = $false

if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

foreach ($entry in $entries) {
    $source = Join-Path $extensionPath $entry
    $destination = Join-Path $stageRoot $entry
    $destinationParent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

foreach ($transientPath in @($tempZipPath, $backupZipPath)) {
    if (Test-Path -LiteralPath $transientPath) {
        Remove-Item -LiteralPath $transientPath -Force
    }
}

Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $tempZipPath -Force

$packageMutex = [System.Threading.Mutex]::new($false, $packageMutexName)
$packageLockTaken = $false
try {
    $packageLockTaken = $packageMutex.WaitOne([TimeSpan]::FromMinutes(2))
    if (-not $packageLockTaken) {
        throw "Timed out waiting for browser extension package output lock: $packageMutexName"
    }

    if (Test-Path -LiteralPath $zipPath) {
        [System.IO.File]::Replace($tempZipPath, $zipPath, $backupZipPath, $true)
        if (Test-Path -LiteralPath $backupZipPath) {
            Remove-Item -LiteralPath $backupZipPath -Force
        }
    } else {
        [System.IO.File]::Move($tempZipPath, $zipPath)
    }
} finally {
    if ($packageLockTaken) {
        $packageMutex.ReleaseMutex()
    }
    $packageMutex.Dispose()
}

try {
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
    $stagingRootRemoved = -not (Test-Path -LiteralPath $stageRoot)
} catch {
    $stagingRootRemoved = $false
}

[pscustomobject]@{
    Package = $zipPath
    StagingRoot = $stageRoot
    StagingRootRemoved = $stagingRootRemoved
    Entries = $entries
} | ConvertTo-Json -Depth 4
