param(
    [string]$OfficeAddinsRoot = "office-addins",
    [string]$FrontendRoot = "frontend",
    [switch]$SkipPackageTests
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)] [string]$FilePath,
        [Parameter(Mandatory = $true)] [string[]]$ArgumentList,
        [string]$WorkingDirectory = $script:RepoRoot
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

function Assert-PowerShellScriptSyntax {
    param([Parameter(Mandatory = $true)] [string[]]$ScriptPaths)

    foreach ($scriptPath in $ScriptPaths) {
        $parseTokens = $null
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $scriptPath,
            [ref]$parseTokens,
            [ref]$parseErrors
        ) | Out-Null

        if ($parseErrors.Count -gt 0) {
            $messages = @($parseErrors | ForEach-Object {
                "$($_.Extent.StartLineNumber):$($_.Extent.StartColumnNumber) $($_.Message)"
            })
            throw "PowerShell syntax errors in ${scriptPath}: $($messages -join '; ')"
        }
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$addinPath = Resolve-RepoPath $OfficeAddinsRoot
$frontendPath = Resolve-RepoPath $FrontendRoot
$manifestPath = Join-Path $addinPath "manifest.xml"
$packageTool = Join-Path $addinPath "tools\package-office-addin.mjs"
$serveTool = Join-Path $addinPath "tools\serve-office-addin.mjs"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Office add-in manifest not found: $manifestPath"
}
if (-not (Test-Path -LiteralPath $packageTool)) {
    throw "Office add-in package tool not found: $packageTool"
}
if (-not (Test-Path -LiteralPath $serveTool)) {
    throw "Office add-in HTTPS host tool not found: $serveTool"
}

$manifestXml = [xml](Get-Content -LiteralPath $manifestPath -Raw)
$results = [ordered]@{}
$results.Version = [string]$manifestXml.OfficeApp.Version

if ($manifestXml.OfficeApp.Permissions -ne "ReadWriteDocument") {
    throw "Office add-in manifest must request ReadWriteDocument for selected-text replacement."
}
$hostNames = @($manifestXml.OfficeApp.Hosts.Host | ForEach-Object { $_.Name })
foreach ($requiredHost in @("Document", "Presentation")) {
    if ($hostNames -notcontains $requiredHost) {
        throw "Office add-in manifest missing host: $requiredHost"
    }
}
$sourceLocation = [string]$manifestXml.OfficeApp.DefaultSettings.SourceLocation.DefaultValue
if (-not $sourceLocation.StartsWith("https://localhost:", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Office add-in SourceLocation must use localhost HTTPS for sideload foundation."
}

if (-not $SkipPackageTests) {
    Invoke-Checked "npm" @(
        "test",
        "--",
        "officeAddinsPackage.test.js",
        "--minWorkers=1",
        "--maxWorkers=2",
        "--reporter=dot"
    ) $frontendPath
    $results.PackageTests = "passed"
} else {
    $results.PackageTests = "skipped"
}

Invoke-Checked "node" @("--check", $packageTool) $RepoRoot
$results.PackageToolSyntax = "passed"
Invoke-Checked "node" @("--check", $serveTool) $RepoRoot
$results.HttpsHostToolSyntax = "passed"

$releaseScriptPaths = [string[]]@(
    (Join-Path $PSScriptRoot "New-OfficeAddinDevCertificate.ps1"),
    (Join-Path $PSScriptRoot "package-office-addins.ps1"),
    (Join-Path $PSScriptRoot "serve-office-addins.ps1"),
    (Join-Path $PSScriptRoot "validate-office-addins-release.ps1")
)
Assert-PowerShellScriptSyntax $releaseScriptPaths
$results.PowerShellReleaseScriptSyntax = "passed"

$expectedEntries = [string[]](node $packageTool $addinPath | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
    throw "Office add-in package entry listing failed."
}
$results.ExpectedEntries = $expectedEntries

$packageJson = & (Join-Path $PSScriptRoot "package-office-addins.ps1") -OfficeAddinsRoot $OfficeAddinsRoot
if ($LASTEXITCODE -ne 0) {
    throw "Office add-ins package script failed."
}
$packageResult = $packageJson | ConvertFrom-Json
$zipPath = $packageResult.Package
if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Office add-ins package zip not found after build: $zipPath"
}
$results.Package = $zipPath

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $actualEntries = @($archive.Entries | ForEach-Object { $_.FullName -replace '\\', '/' } | Sort-Object)
} finally {
    $archive.Dispose()
}
$sortedExpectedEntries = @($expectedEntries | Sort-Object)
$missingEntries = @($sortedExpectedEntries | Where-Object { $actualEntries -notcontains $_ })
$extraEntries = @($actualEntries | Where-Object { $sortedExpectedEntries -notcontains $_ })
if ($missingEntries.Count -gt 0 -or $extraEntries.Count -gt 0) {
    throw "Office add-ins package zip entries differ from expected entries. Missing=$($missingEntries -join ', ') Extra=$($extraEntries -join ', ')"
}
$results.ZipEntries = $actualEntries

[pscustomobject]$results | ConvertTo-Json -Depth 6
